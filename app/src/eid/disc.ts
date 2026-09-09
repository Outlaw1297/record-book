export type RgbaImage = {
  data: Uint8ClampedArray | Uint8Array;
  width: number;
  height: number;
};

export type DiscGeometry = {
  cx: number;
  cy: number;
  radius: number;
};

function isYellow(r: number, g: number, b: number): boolean {
  return r > 150 && g > 130 && b < 140 && r + g > b * 2.4;
}

function pixel(image: RgbaImage, x: number, y: number): [number, number, number] {
  const i = (y * image.width + x) * 4;
  return [image.data[i] ?? 0, image.data[i + 1] ?? 0, image.data[i + 2] ?? 0];
}

/** Find the yellow Allflex disc so we can unwrap the number ring. */
export function findYellowDisc(image: RgbaImage): DiscGeometry | null {
  let sumX = 0;
  let sumY = 0;
  let count = 0;
  for (let y = 0; y < image.height; y += 1) {
    for (let x = 0; x < image.width; x += 1) {
      const [r, g, b] = pixel(image, x, y);
      if (!isYellow(r, g, b)) continue;
      sumX += x;
      sumY += y;
      count += 1;
    }
  }
  if (count < 80) return null;
  const cx = sumX / count;
  const cy = sumY / count;
  let radius = 0;
  const step = image.width > 400 ? 2 : 1;
  for (let y = 0; y < image.height; y += step) {
    for (let x = 0; x < image.width; x += step) {
      const [r, g, b] = pixel(image, x, y);
      if (!isYellow(r, g, b)) continue;
      const dist = Math.hypot(x - cx, y - cy);
      if (dist > radius) radius = dist;
    }
  }
  if (radius < 16) return null;
  return { cx, cy, radius };
}

function sample(image: RgbaImage, x: number, y: number): [number, number, number] {
  const sx = Math.max(0, Math.min(image.width - 1, Math.round(x)));
  const sy = Math.max(0, Math.min(image.height - 1, Math.round(y)));
  return pixel(image, sx, sy);
}

/**
 * Unwrap the outer ring of an Allflex tag into a straight strip
 * so a normal OCR engine can read the 15 digits.
 */
export function polarUnwrap(
  image: RgbaImage,
  disc: DiscGeometry,
  options: { clockwise?: boolean; startAngle?: number } = {},
): RgbaImage {
  const clockwise = options.clockwise !== false;
  const startAngle = options.startAngle ?? -Math.PI / 2;
  const inner = disc.radius * 0.46;
  const outer = disc.radius * 0.96;
  const height = Math.max(28, Math.round(outer - inner));
  const width = Math.max(160, Math.round(2 * Math.PI * ((inner + outer) / 2)));
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y += 1) {
    const r = inner + ((outer - inner) * y) / Math.max(1, height - 1);
    for (let x = 0; x < width; x += 1) {
      const t = (x / width) * Math.PI * 2;
      const angle = startAngle + (clockwise ? t : -t);
      const [sr, sg, sb] = sample(
        image,
        disc.cx + Math.cos(angle) * r,
        disc.cy + Math.sin(angle) * r,
      );
      const i = (y * width + x) * 4;
      const ink = (sr + sg + sb) / 3 < 120;
      const value = ink ? 20 : 245;
      data[i] = value;
      data[i + 1] = value;
      data[i + 2] = value;
      data[i + 3] = 255;
    }
  }
  return { data, width, height };
}

export function unwrapToCanvas(
  image: RgbaImage,
  disc: DiscGeometry,
  clockwise: boolean,
): HTMLCanvasElement {
  const strip = polarUnwrap(image, disc, { clockwise });
  const canvas = document.createElement('canvas');
  canvas.width = strip.width;
  canvas.height = strip.height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Could not read the photo.');
  const pixels = new Uint8ClampedArray(strip.width * strip.height * 4);
  pixels.set(strip.data);
  ctx.putImageData(new ImageData(pixels, strip.width, strip.height), 0, 0);
  return canvas;
}
