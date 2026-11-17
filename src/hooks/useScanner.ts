import { useCallback, useEffect, useRef, useState } from "react";
import { PSM } from "tesseract.js";
import type { DocumentType, QueueItem, ScanResult } from "../types";
import { extractDocument } from "../lib/extractors";
import { processImageSource } from "../lib/preprocess";
import { recognize, setEngineLogger, terminateEngine, warmEngine } from "../lib/ocr";

const uid = () =>
  typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;

const MAX_FILE_MB = 25;

export interface AddSummary {
  added: number;
  skipped: string[];
}

export function useScanner() {
  const [items, setItems] = useState<QueueItem[]>([]);
  const [running, setRunning] = useState(false);
  const itemsRef = useRef<QueueItem[]>([]);
  const runningRef = useRef(false);
  const cancelRef = useRef(false);
  const currentRef = useRef<string | null>(null);
  const progressFrameRef = useRef<number | null>(null);
  const pendingProgressRef = useRef<{ id: string; status: string; progress: number } | null>(null);

  useEffect(() => {
    itemsRef.current = items;
  }, [items]);

  // Route engine progress to the active queue item.
  useEffect(() => {
    const flushProgress = () => {
      progressFrameRef.current = null;
      const update = pendingProgressRef.current;
      pendingProgressRef.current = null;
      if (!update) return;
      setItems((prev) =>
        prev.map((it) => {
          if (it.id !== update.id || it.status !== "ocr") return it;
          if (update.status === "recognizing") {
            return {
              ...it,
              progress: Math.min(96, 14 + update.progress * 82),
              statusText: "Recognizing textâ€¦",
            };
          }
          const stageText =
            update.status === "boot"
              ? "Starting engineâ€¦"
              : update.status === "load-core"
                ? "Downloading OCR coreâ€¦"
                : update.status === "load-lang"
                  ? "Downloading language dataâ€¦"
                  : "Initialising engineâ€¦";
          return { ...it, progress: Math.max(it.progress, Math.round(update.progress * 12)), statusText: stageText };
        })
      );
    };

    setEngineLogger((status, progress) => {
      const id = currentRef.current;
      if (!id) return;
      pendingProgressRef.current = { id, status, progress };
      if (progressFrameRef.current === null) {
        progressFrameRef.current = window.requestAnimationFrame(flushProgress);
      }
    });
    return () => {
      setEngineLogger(null);
      if (progressFrameRef.current !== null) {
        window.cancelAnimationFrame(progressFrameRef.current);
        progressFrameRef.current = null;
      }
      pendingProgressRef.current = null;
    };
  }, []);

  useEffect(() => () => void terminateEngine(), []);

  const patch = useCallback((id: string, upd: Partial<QueueItem>) => {
    setItems((prev) => prev.map((it) => (it.id === id ? { ...it, ...upd } : it)));
  }, []);

  /* ------------------------------ intake ----------------------------- */

  const addFiles = useCallback(
    async (files: File[]): Promise<AddSummary> => {
      const summary: AddSummary = { added: 0, skipped: [] };
      for (const file of files) {
        const isPdf = file.type === "application/pdf" || /\.pdf$/i.test(file.name);
        const isImage = /^image\//.test(file.type);
        if (!isPdf && !isImage) {
          summary.skipped.push(`${file.name} â€” unsupported type`);
          continue;
        }
        if (file.size > MAX_FILE_MB * 1024 * 1024) {
          summary.skipped.push(`${file.name} â€” larger than ${MAX_FILE_MB} MB`);
          continue;
        }

        const tempId = uid();
        setItems((prev) => [
          ...prev,
          {
            id: tempId,
            name: file.name,
            sourceName: file.name,
            pageIndex: 0,
            dataUrl: null,
            blurConstant: 0.1,
            status: "reading",
            progress: 10,
            statusText: isPdf ? "Rendering PDF pagesâ€¦" : "Preparing imageâ€¦",
          },
        ]);

        try {
          if (isPdf) {
            const { renderPdfToImages } = await import("../lib/pdf");
            const pages = await renderPdfToImages(file);
            setItems((prev) => {
              const without = prev.filter((it) => it.id !== tempId);
              const next: QueueItem[] = pages.map((p, i) => ({
                id: uid(),
                name: pages.length > 1 ? `${file.name} Â· p.${i + 1}` : file.name,
                sourceName: file.name,
                pageIndex: i,
                dataUrl: p.dataUrl,
                blurConstant: p.blurConstant,
                status: "queued",
                progress: 0,
                statusText: "Ready",
              }));
              summary.added += pages.length;
              return [...without, ...next];
            });
          } else {
            const processed = await processImageSource(file);
            summary.added += 1;
            patch(tempId, {
              name: file.name,
              dataUrl: processed.dataUrl,
              blurConstant: processed.blurConstant,
              status: "queued",
              progress: 0,
              statusText: "Ready",
            });
          }
        } catch (e) {
          summary.skipped.push(`${file.name} â€” ${(e as Error).message || "could not be read"}`);
          setItems((prev) => prev.filter((it) => it.id !== tempId));
        }
      }
      return summary;
    },
    [patch]
  );

  /* ------------------------------ scanning ---------------------------- */

  const scanOne = useCallback(
    async (
      item: QueueItem,
      documentType: DocumentType,
      subtype: string
    ): Promise<ScanResult> => {
      if (!item.dataUrl) throw new Error("Image was not prepared");
      currentRef.current = item.id;
      patch(item.id, { status: "ocr", progress: 4, statusText: "Warming up engineâ€¦" });
      const t0 = performance.now();

      let { text, confidence } = await recognize(item.dataUrl, { psm: PSM.AUTO });

      // Low confidence> Re-run with sparse-text segmentation and keep the winner.
      if (confidence < 62) {
        patch(item.id, { statusText: "Refining (2nd pass)â€¦" });
        try {
          const alt = await recognize(item.dataUrl, { psm: PSM.SPARSE_TEXT });
          if (alt.confidence > confidence) {
            text = alt.text;
            confidence = alt.confidence;
          }
        } catch {
          /* first pass stands */
        }
      }

      // Passports get a dedicated MRZ pass with a glyph whitelist.
      let mrzText: string | undefined;
      if (documentType === "passport" && subtype === "front") {
        patch(item.id, { statusText: "Verifying machine-readable zoneâ€¦" });
        try {
          const mrz = await recognize(item.dataUrl, {
            psm: PSM.AUTO,
            whitelist: "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ<",
          });
          mrzText = mrz.text;
        } catch {
          mrzText = undefined;
        }
      }

      patch(item.id, { status: "parsing", progress: 97, statusText: "Extracting fieldsâ€¦" });
      const { fields, warnings } = extractDocument(documentType, subtype, text, mrzText);

      const blurred = item.blurConstant < 0.045;
      const quality = blurred ? "Blurred" : "Readable";
      if (blurred) {
        warnings.unshift("The photo looks blurred â€” results may be inaccurate. Re-shoot with the document flat and steady.");
      }
      if (confidence > 0 && confidence < 50) {
        warnings.push(`Low OCR confidence (${Math.round(confidence)}%). A sharper image will improve results.`);
      }

      return {
        id: uid(),
        fileName: item.sourceName,
        pageLabel: item.name,
        imageUrl: item.dataUrl,
        documentType,
        subtype,
        fields,
        rawText: text.trim(),
        quality,
        blurConstant: item.blurConstant,
        ocrConfidence: confidence,
        durationMs: Math.round(performance.now() - t0),
        warnings,
      };
    },
    [patch]
  );

  const start = useCallback(
    async (documentType: DocumentType, subtype: string): Promise<ScanResult[]> => {
      if (runningRef.current) return [];
      runningRef.current = true;
      cancelRef.current = false;
      setRunning(true);
      warmEngine();

      const results: ScanResult[] = [];
      try {
        for (;;) {
          if (cancelRef.current) break;
          const next = itemsRef.current.find((it) => it.status === "queued");
          if (!next) break;
          try {
            const result = await scanOne(next, documentType, subtype);
            results.push(result);
            patch(next.id, {
              status: "done",
              progress: 100,
              statusText: "Done",
              result,
            });
          } catch (e) {
            patch(next.id, {
              status: "error",
              progress: 0,
              statusText: "Failed",
              error: (e as Error).message || "Scanning failed",
            });
          }
        }
      } finally {
        currentRef.current = null;
        runningRef.current = false;
        setRunning(false);
      }
      return results;
    },
    [patch, scanOne]
  );

  const cancel = useCallback(() => {
    cancelRef.current = true;
  }, []);

  const retry = useCallback((id: string) => {
    patch(id, { status: "queued", progress: 0, statusText: "Queued for retry", error: undefined });
  }, [patch]);

  const retryErrors = useCallback(() => {
    setItems((prev) =>
      prev.map((it) =>
        it.status === "error"
          ? { ...it, status: "queued" as const, progress: 0, statusText: "Queued for retry", error: undefined }
          : it
      )
    );
  }, []);

  const removeItem = useCallback((id: string) => {
    setItems((prev) => prev.filter((it) => it.id !== id));
  }, []);

  const clear = useCallback(() => setItems([]), []);

  const counts = {
    total: items.length,
    done: items.filter((i) => i.status === "done").length,
    errors: items.filter((i) => i.status === "error").length,
    queued: items.filter((i) => i.status === "queued").length,
    reading: items.filter((i) => i.status === "reading").length,
  };

  return {
    items,
    running,
    counts,
    addFiles,
    start,
    cancel,
    retry,
    retryErrors,
    removeItem,
    clear,
  };
}





