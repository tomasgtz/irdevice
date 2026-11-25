// Generates the PWA PNG icons (iOS needs a PNG apple-touch-icon). Dependency-free.
// Usage: node tools/make-icons.mjs
import { deflateSync } from 'node:zlib';
import { writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const out = join(dirname(fileURLToPath(import.meta.url)), '..', 'frontend', 'public');
mkdirSync(out, { recursive: true });

const BG = [79, 70, 229];
const FG = [255, 255, 255];

function crc32(buf) {
  let c, crc = 0xffffffff;
  for (let n = 0; n < buf.length; n++) {
    c = (crc ^ buf[n]) & 0xff;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    crc = (crc >>> 8) ^ c;
  }
  return (crc ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}

// coverage of the power glyph at unit coordinates (x,y) in [0,1]
function glyph(x, y) {
  const sw = 0.07, r = 0.25, cx = 0.5, cy = 0.53;
  const dx = x - cx, dy = y - cy;
  const d = Math.hypot(dx, dy);
  const ang = Math.atan2(dx, -dy); // 0 = top
  if (Math.abs(d - r) <= sw / 2 && Math.abs(ang) > 0.62) return true;
  // vertical bar with round caps
  const y0 = 0.22, y1 = 0.52;
  const cyc = Math.min(Math.max(y, y0), y1);
  return Math.hypot(x - 0.5, y - cyc) <= sw / 2;
}

function png(size) {
  const SS = 3; // supersampling
  const raw = Buffer.alloc((size * 4 + 1) * size);
  for (let py = 0; py < size; py++) {
    raw[py * (size * 4 + 1)] = 0;
    for (let px = 0; px < size; px++) {
      let cov = 0;
      for (let sy = 0; sy < SS; sy++) for (let sx = 0; sx < SS; sx++) {
        if (glyph((px + (sx + .5) / SS) / size, (py + (sy + .5) / SS) / size)) cov++;
      }
      const a = cov / (SS * SS);
      const o = py * (size * 4 + 1) + 1 + px * 4;
      for (let i = 0; i < 3; i++) raw[o + i] = Math.round(BG[i] * (1 - a) + FG[i] * a);
      raw[o + 3] = 255;
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0); ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; ihdr[9] = 6; // 8-bit RGBA
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0)),
  ]);
}

for (const [name, size] of [['icon-192.png', 192], ['icon-512.png', 512], ['apple-touch-icon.png', 180]]) {
  writeFileSync(join(out, name), png(size));
  console.log('wrote', name);
}
