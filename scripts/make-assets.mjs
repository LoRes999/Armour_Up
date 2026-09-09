/**
 * Generates the app icon, Android adaptive foreground, splash mark and web
 * favicon.
 *
 * These are placeholders. They exist because the stores will not accept a build
 * without them and the project had no assets/ directory at all — not because
 * anybody designed them. Replace the PNGs whenever real artwork turns up; no
 * config has to change.
 *
 * Written against Node's built-in zlib rather than sharp or a canvas library,
 * so `node scripts/make-assets.mjs` works on a clean checkout with nothing
 * installed. It draws a barbell in the app's own palette (src/theme.ts) so the
 * placeholder at least belongs to the same product.
 *
 *   node scripts/make-assets.mjs
 */

import { deflateSync } from 'node:zlib';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const OUT = join(dirname(fileURLToPath(import.meta.url)), '..', 'assets');

// From src/theme.ts — darkPalette.background and darkPalette.accent.
const GROUND = [0x17, 0x12, 0x14];
const ACCENT = [0xe8, 0xa3, 0x3d];

/** Each pixel is sampled this many times per axis, which is what smooths edges. */
const SAMPLES = 3;

// MARK: - PNG encoding

const CRC_TABLE = (() => {
  const table = new Int32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c;
  }
  return table;
})();

function crc32(buffer) {
  let c = 0xffffffff;
  for (let i = 0; i < buffer.length; i += 1) c = CRC_TABLE[(c ^ buffer[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([length, body, crc]);
}

/** RGBA pixel buffer to a PNG file. */
function encodePng(width, height, rgba) {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8; // bit depth
  header[9] = 6; // colour type: RGBA
  header[10] = 0; // deflate
  header[11] = 0; // adaptive filtering
  header[12] = 0; // no interlace

  // One filter byte (0 = none) in front of every scanline.
  const raw = Buffer.alloc(height * (width * 4 + 1));
  for (let y = 0; y < height; y += 1) {
    const from = y * width * 4;
    raw[y * (width * 4 + 1)] = 0;
    rgba.copy(raw, y * (width * 4 + 1) + 1, from, from + width * 4);
  }

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

// MARK: - Drawing

/**
 * Is this point inside a rounded rectangle? Clamping the point into the inner
 * rectangle and measuring back to it handles the straight edges and the corner
 * arcs in one expression.
 */
function inRoundedRect(px, py, [x0, y0, x1, y1, r]) {
  const cx = Math.min(Math.max(px, x0 + r), x1 - r);
  const cy = Math.min(Math.max(py, y0 + r), y1 - r);
  const dx = px - cx;
  const dy = py - cy;
  return dx * dx + dy * dy <= r * r;
}

/**
 * A barbell, in fractions of the canvas: the bar end to end, a heavy plate
 * inboard on each side and a lighter one outboard.
 */
const BARBELL = [
  [0.14, 0.472, 0.86, 0.528, 0.028], // bar
  [0.17, 0.394, 0.232, 0.606, 0.026], // outer plate, left
  [0.768, 0.394, 0.83, 0.606, 0.026], // outer plate, right
  [0.256, 0.322, 0.328, 0.678, 0.032], // inner plate, left
  [0.672, 0.322, 0.744, 0.678, 0.032], // inner plate, right
];

/**
 * @param size       pixels square
 * @param background RGB, or null for transparent
 * @param inset      the mark occupies this fraction of the canvas, centred.
 *                   Android masks an adaptive icon hard, so its foreground has
 *                   to sit inside the middle 66%.
 */
function render(size, background, inset = 1) {
  const rgba = Buffer.alloc(size * size * 4);
  const step = 1 / SAMPLES;
  const offset = step / 2;
  const scale = inset;
  const shift = (1 - inset) / 2;

  // Pre-scale the shape into canvas coordinates once rather than per sample.
  const shapes = BARBELL.map(([x0, y0, x1, y1, r]) => [
    (x0 * scale + shift) * size,
    (y0 * scale + shift) * size,
    (x1 * scale + shift) * size,
    (y1 * scale + shift) * size,
    r * scale * size,
  ]);

  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      let hits = 0;
      for (let sy = 0; sy < SAMPLES; sy += 1) {
        for (let sx = 0; sx < SAMPLES; sx += 1) {
          const px = x + offset + sx * step;
          const py = y + offset + sy * step;
          if (shapes.some((shape) => inRoundedRect(px, py, shape))) hits += 1;
        }
      }

      const coverage = hits / (SAMPLES * SAMPLES);
      const at = (y * size + x) * 4;

      if (background) {
        // Opaque: composite the mark onto the ground.
        for (let c = 0; c < 3; c += 1) {
          rgba[at + c] = Math.round(background[c] + (ACCENT[c] - background[c]) * coverage);
        }
        rgba[at + 3] = 255;
      } else {
        // Transparent: the mark carries its own alpha.
        for (let c = 0; c < 3; c += 1) rgba[at + c] = ACCENT[c];
        rgba[at + 3] = Math.round(coverage * 255);
      }
    }
  }

  return encodePng(size, size, rgba);
}

const targets = [
  // Opaque. iOS rejects an icon with an alpha channel, and this one is the
  // store listing as well as the home screen.
  { file: 'icon.png', size: 1024, background: GROUND, inset: 0.95 },
  // Foreground only; app.json supplies the background colour behind it.
  { file: 'adaptive-icon.png', size: 1024, background: null, inset: 0.8 },
  { file: 'splash-icon.png', size: 512, background: null, inset: 0.9 },
  { file: 'favicon.png', size: 48, background: GROUND, inset: 1 },
];

mkdirSync(OUT, { recursive: true });
for (const { file, size, background, inset } of targets) {
  const png = render(size, background, inset);
  writeFileSync(join(OUT, file), png);
  console.log(`${file.padEnd(20)} ${size}x${size}  ${(png.length / 1024).toFixed(1)} KB`);
}
