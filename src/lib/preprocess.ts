/**
 * Canvas-based image normalisation for OCR.
 *
 * - scales into the engine's sweet spot (~1.4k–2.2k px longest side)
 * - converts to luma and applies a percentile contrast stretch so washed-out
 *   phone photos of cards get crisp, even text
 * - measures a Laplacian-edge "sharpness" ratio used to flag blurred shots
 */

export interface ProcessedImage {
  dataUrl: string;
  width: number;
  height: number;
  /** 0..1 — fraction of pixels with strong local contrast. Low = blurred. */
  blurConstant: number;
}

const MIN_SIDE = 1100;
const MAX_SIDE = 2100;

function targetSize(w: number, h: number): { w: number; h: number } {
  const long = Math.max(w, h);
  let scale = 1;
  if (long > MAX_SIDE) scale = MAX_SIDE / long;
  else if (long < MIN_SIDE) scale = Math.min(1.8, MIN_SIDE / long);
  return { w: Math.max(1, Math.round(w * scale)), h: Math.max(1, Math.round(h * scale)) };
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Could not decode the image file"));
    img.src = src;
  });
}

/** Contrast-stretch + sharpness measurement, mutating the canvas pixels. */
export function enhanceCanvas(canvas: HTMLCanvasElement): number {
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) return 0.1;
  const { width, height } = canvas;
  const img = ctx.getImageData(0, 0, width, height);
  const d = img.data;
  const n = width * height;
  const gray = new Float32Array(n);

  for (let i = 0, p = 0; i < d.length; i += 4, p++) {
    gray[p] = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
  }

  // Histogram → 1%/99% percentile stretch
  const hist = new Uint32Array(256);
  for (let p = 0; p < n; p++) hist[Math.min(255, gray[p] | 0)]++;
  const lut = new Uint8ClampedArray(256);
  {
    const loCut = n * 0.01;
    const hiCut = n * 0.01;
    let lo = 0;
    let acc = 0;
    while (lo < 255 && acc < loCut) acc += hist[lo++];
    let hi = 255;
    acc = 0;
    while (hi > 0 && acc < hiCut) acc += hist[hi--];
    const range = Math.max(16, hi - lo);
    for (let v = 0; v < 256; v++) lut[v] = ((v - lo) * 255) / range;
  }

  // Sharpness via Laplacian on normalised luma (sample every 2nd px for speed)
  let edges = 0;
  let samples = 0;
  for (let y = 1; y < height - 1; y += 2) {
    for (let x = 1; x < width - 1; x += 2) {
      const p = y * width + x;
      const lap = Math.abs(
        gray[p - width] + gray[p + width] + gray[p - 1] + gray[p + 1] - 4 * gray[p]
      );
      samples++;
      if (lap > 24) edges++;
    }
  }
  const blurConstant = samples > 0 ? edges / samples : 0.1;

  for (let i = 0, p = 0; i < d.length; i += 4, p++) {
    const g = lut[Math.min(255, gray[p] | 0)];
    d[i] = g;
    d[i + 1] = g;
    d[i + 2] = g;
  }
  ctx.putImageData(img, 0, 0);
  return blurConstant;
}

export function canvasToJpeg(canvas: HTMLCanvasElement): string {
  return canvas.toDataURL("image/jpeg", 0.92);
}

export async function processImageSource(src: string | Blob): Promise<ProcessedImage> {
  const url = typeof src === "string" ? src : URL.createObjectURL(src);
  try {
    const img = await loadImage(url);
    const { w, h } = targetSize(img.naturalWidth || img.width, img.naturalHeight || img.height);
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) throw new Error("Canvas 2D is not available in this browser");
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(img, 0, 0, w, h);
    const blurConstant = enhanceCanvas(canvas);
    return { dataUrl: canvasToJpeg(canvas), width: w, height: h, blurConstant };
  } finally {
    if (typeof src !== "string") URL.revokeObjectURL(url);
  }
}

/** Re-run enhancement on an already-rendered canvas (used for PDF pages). */
export function enhanceAndEncode(canvas: HTMLCanvasElement): ProcessedImage {
  const blurConstant = enhanceCanvas(canvas);
  return {
    dataUrl: canvasToJpeg(canvas),
    width: canvas.width,
    height: canvas.height,
    blurConstant,
  };
}