/**
 * Tesseract.js engine manager.
 *
 * - single warm worker reused across the whole scan queue
 * - progress is routed to whichever queue item is currently scanning
 * - if the WASM worker ever crashes, it is transparently rebuilt once and
 *   the recognition is retried instead of failing the whole run
 */

import { createWorker, PSM, OEM, type Worker } from "tesseract.js";

export type EngineStatus =
  | "boot"
  | "load-core"
  | "load-lang"
  | "init"
  | "recognizing";

let workerPromise: Promise<Worker> | null = null;
let logHandler: ((status: EngineStatus, progress: number) => void) | null = null;

export function setEngineLogger(fn: ((status: EngineStatus, progress: number) => void) | null) {
  logHandler = fn;
}

function emit(status: EngineStatus, progress = 0) {
  logHandler?.(status, progress);
}

async function buildWorker(): Promise<Worker> {
  const worker = await createWorker("eng", OEM.LSTM_ONLY, {
    logger: (m: { status: string; progress?: number }) => {
      const p = m.progress ?? 0;
      if (m.status === "recognizing text") emit("recognizing", p);
      else if (m.status.includes("loading tesseract core")) emit("load-core", p);
      else if (m.status.includes("loading language traineddata")) emit("load-lang", p);
      else if (m.status.includes("initializing")) emit("init", p);
    },
  });
  return worker;
}

export async function getEngine(): Promise<Worker> {
  if (!workerPromise) {
    emit("boot");
    workerPromise = buildWorker();
    workerPromise.catch(() => {
      workerPromise = null;
    });
  }
  return workerPromise;
}

/** Pre-warm the engine so the first scan feels instant. */
export function warmEngine(): void {
  void getEngine().catch(() => undefined);
}

export interface RecognizeOptions {
  psm?: (typeof PSM)[keyof typeof PSM];
  whitelist?: string;
}

export interface RecognizeResult {
  text: string;
  confidence: number;
}

async function recognizeOnce(
  imageUrl: string,
  opts: RecognizeOptions
): Promise<RecognizeResult> {
  const worker = await getEngine();
  await worker.setParameters({
    tessedit_pageseg_mode: opts.psm ?? PSM.AUTO,
    tessedit_char_whitelist: opts.whitelist ?? "",
  });
  const { data } = await worker.recognize(imageUrl);
  // Clear any whitelist so the next scan starts clean
  if (opts.whitelist) {
    await worker.setParameters({ tessedit_char_whitelist: "" }).catch(() => undefined);
  }
  return {
    text: data.text ?? "",
    confidence: typeof data.confidence === "number" ? data.confidence : 0,
  };
}

export async function recognize(
  imageUrl: string,
  opts: RecognizeOptions = {}
): Promise<RecognizeResult> {
  try {
    return await recognizeOnce(imageUrl, opts);
  } catch (firstErr) {
    // Rebuild the worker once — covers WASM crashes / worker termination races.
    console.warn("[DocuScan] OCR worker failed, rebuilding…", firstErr);
    const old = workerPromise;
    workerPromise = null;
    if (old) {
      old.then((w) => w.terminate()).catch(() => undefined);
    }
    try {
      return await recognizeOnce(imageUrl, opts);
    } catch (secondErr) {
      throw new Error(
        (secondErr as Error)?.message?.includes("fetch")
          ? "Could not download the OCR engine. Check your internet connection and retry."
          : `OCR failed: ${(secondErr as Error).message}`
      );
    }
  }
}

export async function terminateEngine(): Promise<void> {
  const p = workerPromise;
  workerPromise = null;
  if (p) {
    try {
      const w = await p;
      await w.terminate();
    } catch {
      /* already dead */
    }
  }
}