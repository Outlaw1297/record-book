import { bestCircularEid, extractEid } from './parseEid';
import { findYellowDisc, unwrapToCanvas, type RgbaImage } from './disc';

export type PhotoReadProgress = (label: string) => void;

function imageDataFromBitmap(bitmap: ImageBitmap): RgbaImage {
  const max = 900;
  const scale = Math.min(1, max / Math.max(bitmap.width, bitmap.height));
  const width = Math.max(1, Math.round(bitmap.width * scale));
  const height = Math.max(1, Math.round(bitmap.height * scale));
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Could not read the photo.');
  ctx.drawImage(bitmap, 0, 0, width, height);
  const { data } = ctx.getImageData(0, 0, width, height);
  return { data, width, height };
}

async function ocrDigits(canvas: HTMLCanvasElement): Promise<string> {
  const { createWorker } = await import('tesseract.js');
  const worker = await createWorker('eng', 1, {
    workerPath: `${window.location.origin}/tesseract/worker.min.js`,
    corePath: `${window.location.origin}/tesseract/tesseract-core-simd-lstm.wasm.js`,
    langPath: `${window.location.origin}/tessdata`,
    gzip: false,
  });
  try {
    await worker.setParameters({
      tessedit_char_whitelist: '0123456789',
    });
    const result = await worker.recognize(canvas);
    return result.data.text || '';
  } finally {
    await worker.terminate();
  }
}

async function readCanvas(canvas: HTMLCanvasElement): Promise<string | undefined> {
  const text = await ocrDigits(canvas);
  return extractEid(text) ?? bestCircularEid(text);
}

/**
 * Read the 15-digit ISO number printed around an Allflex-style EID disc.
 * Works offline — language data is bundled in /tessdata.
 */
export async function readEidFromPhoto(
  file: Blob,
  onProgress: PhotoReadProgress = () => undefined,
): Promise<{ eid: string; previewUrl: string }> {
  onProgress('Opening photo…');
  const bitmap = await createImageBitmap(file);
  const previewUrl = URL.createObjectURL(file);
  try {
    onProgress('Finding the yellow tag…');
    const image = imageDataFromBitmap(bitmap);
    bitmap.close();
    const disc = findYellowDisc(image);
    const tries: HTMLCanvasElement[] = [];
    if (disc) {
      tries.push(unwrapToCanvas(image, disc, false));
      tries.push(unwrapToCanvas(image, disc, true));
    } else {
      const fallback = document.createElement('canvas');
      fallback.width = image.width;
      fallback.height = image.height;
      const ctx = fallback.getContext('2d');
      if (ctx) {
        const pixels = new Uint8ClampedArray(image.width * image.height * 4);
        pixels.set(image.data);
        ctx.putImageData(new ImageData(pixels, image.width, image.height), 0, 0);
        tries.push(fallback);
      }
    }
    onProgress('Reading the numbers…');
    let eid: string | undefined;
    for (const canvas of tries) {
      eid = await readCanvas(canvas);
      if (eid) break;
    }
    if (!eid) {
      throw new Error(
        'Could not read the numbers. Hold the camera square to the yellow disc, or type the 15 digits.',
      );
    }
    return { eid, previewUrl };
  } catch (error) {
    URL.revokeObjectURL(previewUrl);
    throw error;
  }
}
