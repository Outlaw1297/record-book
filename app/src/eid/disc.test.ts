import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { decode } from 'jpeg-js';
import { describe, expect, it } from 'vitest';
import { findYellowDisc, polarUnwrap } from './disc';
import { createHidEidBuffer } from './wand';

describe('findYellowDisc', () => {
  it('finds the centroid of a yellow disc', () => {
    const width = 80;
    const height = 80;
    const data = new Uint8ClampedArray(width * height * 4);
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        const i = (y * width + x) * 4;
        const on = Math.hypot(x - 40, y - 42) < 30;
        data[i] = on ? 230 : 30;
        data[i + 1] = on ? 200 : 30;
        data[i + 2] = on ? 40 : 30;
        data[i + 3] = 255;
      }
    }
    const disc = findYellowDisc({ data, width, height });
    expect(disc).not.toBeNull();
    expect(disc!.cx).toBeGreaterThan(35);
    expect(disc!.cx).toBeLessThan(45);
    expect(disc!.cy).toBeGreaterThan(37);
    expect(disc!.cy).toBeLessThan(47);
    expect(disc!.radius).toBeGreaterThan(18);
  });

  it('unwraps a ring into a wide strip', () => {
    const width = 60;
    const height = 60;
    const data = new Uint8ClampedArray(width * height * 4).fill(40);
    for (let i = 3; i < data.length; i += 4) data[i] = 255;
    const strip = polarUnwrap(
      { data, width, height },
      { cx: 30, cy: 30, radius: 25 },
      { clockwise: true },
    );
    expect(strip.width).toBeGreaterThan(strip.height);
    expect(strip.data.length).toBe(strip.width * strip.height * 4);
  });

  it('finds the yellow Allflex disc in the sample photo', () => {
    const file = resolve(dirname(fileURLToPath(import.meta.url)), 'fixtures/allflex-eid.jpg');
    const jpeg = decode(readFileSync(file), { maxMemoryUsageInMB: 64 });
    const disc = findYellowDisc({
      data: new Uint8ClampedArray(jpeg.data),
      width: jpeg.width,
      height: jpeg.height,
    });
    expect(disc).not.toBeNull();
    expect(disc!.cx).toBeGreaterThan(jpeg.width * 0.35);
    expect(disc!.cx).toBeLessThan(jpeg.width * 0.65);
    expect(disc!.radius).toBeGreaterThan(jpeg.width * 0.25);
  });
});

describe('createHidEidBuffer', () => {
  it('assembles Tru-Test HID keystrokes into one EID', () => {
    return new Promise<void>((resolve, reject) => {
      const hid = createHidEidBuffer((eid) => {
        try {
          expect(eid).toBe('982003123456789');
          hid.dispose();
          resolve();
        } catch (error) {
          reject(error);
        }
      });
      for (const ch of '982 003 123 456 789') hid.pushKey(ch);
      hid.pushKey('Enter');
    });
  });
});
