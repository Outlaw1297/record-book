import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { createWorker } from 'tesseract.js';

const require = createRequire(import.meta.url);
const { decode, encode } = require('jpeg-js');

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const jpeg = decode(readFileSync(resolve(root, 'src/eid/fixtures/allflex-eid.jpg')), {
  maxMemoryUsageInMB: 64,
});

function isYellow(r, g, b) {
  return r > 150 && g > 130 && b < 140 && r + g > b * 2.4;
}

function pixel(image, x, y) {
  const i = (y * image.width + x) * 4;
  return [image.data[i], image.data[i + 1], image.data[i + 2]];
}

const image = { data: jpeg.data, width: jpeg.width, height: jpeg.height };
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
const disc = { cx: sumX / count, cy: sumY / count, radius: 0 };
for (let y = 0; y < image.height; y += 2) {
  for (let x = 0; x < image.width; x += 2) {
    const [r, g, b] = pixel(image, x, y);
    if (!isYellow(r, g, b)) continue;
    disc.radius = Math.max(disc.radius, Math.hypot(x - disc.cx, y - disc.cy));
  }
}
console.log('disc', disc, 'count', count);

function unwrap(clockwise) {
  const inner = disc.radius * 0.46;
  const outer = disc.radius * 0.96;
  const height = Math.max(28, Math.round(outer - inner));
  const width = Math.max(160, Math.round(2 * Math.PI * ((inner + outer) / 2)));
  const data = Buffer.alloc(width * height * 4, 255);
  const startAngle = -Math.PI / 2;
  for (let y = 0; y < height; y += 1) {
    const r = inner + ((outer - inner) * y) / Math.max(1, height - 1);
    for (let x = 0; x < width; x += 1) {
      const t = (x / width) * Math.PI * 2;
      const angle = startAngle + (clockwise ? t : -t);
      const sx = Math.round(disc.cx + Math.cos(angle) * r);
      const sy = Math.round(disc.cy + Math.sin(angle) * r);
      const [sr, sg, sb] = pixel(image, Math.max(0, Math.min(image.width - 1, sx)), Math.max(0, Math.min(image.height - 1, sy)));
      const ink = (sr + sg + sb) / 3 < 120;
      const i = (y * width + x) * 4;
      const value = ink ? 20 : 245;
      data[i] = value;
      data[i + 1] = value;
      data[i + 2] = value;
    }
  }
  return { data, width, height };
}

const strip = unwrap(true);
writeFileSync('/tmp/eid-unwrap.jpg', encode(strip, 90).data);

const worker = await createWorker('eng', 1, {
  langPath: resolve(root, 'public/tessdata'),
  gzip: false,
  cacheMethod: 'none',
});
await worker.setParameters({ tessedit_char_whitelist: '0123456789' });
for (const clockwise of [true, false]) {
  const next = unwrap(clockwise);
  const jpg = encode(next, 90).data;
  const result = await worker.recognize(jpg);
  const text = result.data.text || '';
  const digits = text.replace(/\D/g, '');
  console.log(clockwise ? 'cw' : 'ccw', JSON.stringify(text), digits);
}
await worker.terminate();
