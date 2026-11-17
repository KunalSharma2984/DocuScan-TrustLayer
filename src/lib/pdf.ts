/**
 * Lazy PDF support — pdf.js is only loaded when the user actually drops a
 * PDF (DigiLocker Aadhaar downloads). Each page is rendered at ~1.8k px and
 * run through the same enhancement pipeline as photos.
 */

import PdfWorker from "pdfjs-dist/build/pdf.worker.min.mjs?worker&inline";
import { enhanceAndEncode, type ProcessedImage } from "./preprocess";

export interface PdfPageResult extends ProcessedImage {
  pageIndex: number;
}

const MAX_PAGES = 6;

export async function renderPdfToImages(
  file: File,
  onProgress?: (done: number, total: number) => void
): Promise<PdfPageResult[]> {
  const pdfjs = await import("pdfjs-dist");
  if (!pdfjs.GlobalWorkerOptions.workerPort) {
    pdfjs.GlobalWorkerOptions.workerPort = new PdfWorker();
  }

  const data = await file.arrayBuffer();
  const doc = await pdfjs.getDocument({ data }).promise;
  const total = Math.min(doc.numPages, MAX_PAGES);
  const pages: PdfPageResult[] = [];

  for (let i = 1; i <= total; i++) {
    const page = await doc.getPage(i);
    const base = page.getViewport({ scale: 1 });
    const scale = Math.min(3, Math.max(1.5, 1900 / base.width));
    const viewport = page.getViewport({ scale });
    const canvas = document.createElement("canvas");
    canvas.width = Math.ceil(viewport.width);
    canvas.height = Math.ceil(viewport.height);
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) throw new Error("Canvas 2D is not available in this browser");
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    await page.render({ canvasContext: ctx, viewport }).promise;
    const processed = enhanceAndEncode(canvas);
    pages.push({ ...processed, pageIndex: i - 1 });
    onProgress?.(i, total);
    page.cleanup();
  }
  void doc.destroy();
  return pages;
}