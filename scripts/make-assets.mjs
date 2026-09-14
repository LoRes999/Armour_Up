/**
 * Generates the app icon, Android adaptive foreground, splash mark, web
 * favicon and Android notification icon.
 *
 * The mark is ArmourUp Fitness's logo, chosen by Ryan (2026-09-14): a
 * minimalist dumbbell drawn as white outlines, on black for the icon. Replace
 * the PNGs whenever final artwork turns up; no config has to change.
 *
 * Written against Node's built-in zlib rather than sharp or a canvas library,
 * so `node scripts/make-assets.mjs` works on a clean checkout with nothing
 * installed.
 *
 *   node scripts/make-assets.mjs
 */

import { deflateSync } from 'node:zlib';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const OUT = join(dirname(fileURLToPath(import.meta.url)), '..', 'assets');

const BLACK = [0x11, 0x11, 0x11];
const WHITE = [0xff, 0xff, 0xff];

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
  if (x1 <= x0 || y1 <= y0) return false;
  const cx = Math.min(Math.max(px, x0 + r), x1 - r);
  const cy = Math.min(Math.max(py, y0 + r), y1 - r);
  const dx = px - cx;
  const dy = py - cy;
  return dx * dx + dy * dy <= r * r;
}

/** The same rectangle, grown (or, with a negative amount, shrunk) on every side. */
function grow([x0, y0, x1, y1, r], by) {
  return [x0 - by, y0 - by, x1 + by, y1 + by, Math.max(0, r + by)];
}

/**
 * On a shape's outline: within half a stroke of its edge. Shapes that touch
 * share the line where they meet, so it is drawn once, not twice.
 */
function onOutline(px, py, shape, half) {
  return inRoundedRect(px, py, grow(shape, half)) && !inRoundedRect(px, py, grow(shape, -half));
}

/**
 * A dumbbell, in fractions of the canvas: a short handle, a heavy plate on
 * each side of it and a lighter plate outboard of those.
 */
const DUMBBELL = [
  [0.3, 0.464, 0.7, 0.536, 0.021], // handle
  [0.186, 0.286, 0.3, 0.714, 0.036], // inner plate, left
  [0.7, 0.286, 0.814, 0.714, 0.036], // inner plate, right
  [0.114, 0.371, 0.186, 0.629, 0.029], // outer plate, left
  [0.814, 0.371, 0.886, 0.629, 0.029], // outer plate, right
];

/** Line width, as a fraction of the canvas before the inset is applied. */
const STROKE = 0.0286;

/**
 * @param size       pixels square
 * @param background RGB, or null for transparent
 * @param inset      the mark occupies this fraction of the canvas, centred.
 *                   Android masks an adaptive icon hard, so its foreground has
 *                   to sit inside the middle 66%.
 * @param stroke     line width as a fraction of the mark; small images get a
 *                   heavier one so the outline survives
 */
function render(size, background, inset = 1, stroke = STROKE) {
  const rgba = Buffer.alloc(size * size * 4);
  const step = 1 / SAMPLES;
  const offset = step / 2;
  const scale = inset;
  const shift = (1 - inset) / 2;
  const half = (stroke * scale * size) / 2;

  // Pre-scale the shape into canvas coordinates once rather than per sample.
  const shapes = DUMBBELL.map(([x0, y0, x1, y1, r]) => [
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
          if (shapes.some((shape) => onOutline(px, py, shape, half))) hits += 1;
        }
      }

      const coverage = hits / (SAMPLES * SAMPLES);
      const at = (y * size + x) * 4;

      if (background) {
        // Opaque: composite the mark onto the ground.
        for (let c = 0; c < 3; c += 1) {
          rgba[at + c] = Math.round(background[c] + (WHITE[c] - background[c]) * coverage);
        }
        rgba[at + 3] = 255;
      } else {
        // Transparent: the mark carries its own alpha.
        for (let c = 0; c < 3; c += 1) rgba[at + c] = WHITE[c];
        rgba[at + 3] = Math.round(coverage * 255);
      }
    }
  }

  return encodePng(size, size, rgba);
}

const targets = [
  // Opaque. iOS rejects an icon with an alpha channel, and this one is the
  // store listing as well as the home screen.
  { file: 'icon.png', size: 1024, background: BLACK, inset: 0.8 },
  // Foreground only; app.json supplies the black behind it.
  { file: 'adaptive-icon.png', size: 1024, background: null, inset: 0.66 },
  // White on transparent, over the splash background colour in app.json.
  { file: 'splash-icon.png', size: 512, background: null, inset: 0.9 },
  { file: 'favicon.png', size: 48, background: BLACK, inset: 0.9, stroke: 0.05 },
  // Android draws a notification icon as a silhouette from its alpha alone: a
  // coloured, opaque one shows as a blank square. The tint comes from the
  // expo-notifications plugin's colour in app.json.
  { file: 'notification-icon.png', size: 96, background: null, inset: 0.9, stroke: 0.04 },
];

mkdirSync(OUT, { recursive: true });
for (const { file, size, background, inset, stroke } of targets) {
  const png = render(size, background, inset, stroke);
  writeFileSync(join(OUT, file), png);
  console.log(`${file.padEnd(22)} ${size}x${size}  ${(png.length / 1024).toFixed(1)} KB`);
}
