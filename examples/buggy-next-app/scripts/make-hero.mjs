// Writes public/hero.png: a ~3 MB image (seeded bug: unoptimised hero image). Generated at build
// time so the repo doesn't carry a 3 MB binary. Deterministic, no network.
import { writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { deflateSync } from 'node:zlib';
import { fileURLToPath } from 'node:url';

const out = fileURLToPath(new URL('../public/hero.png', import.meta.url));
if (existsSync(out)) process.exit(0);

const width = 1100;
const height = 900;
const raw = Buffer.alloc((width * 3 + 1) * height);
let seed = 42;
const rand = () => ((seed = (seed * 1103515245 + 12345) >>> 0) >>> 16) & 0xff;
for (let y = 0; y < height; y++) {
  const row = y * (width * 3 + 1);
  raw[row] = 0;
  for (let x = 0; x < width; x++) {
    const i = row + 1 + x * 3;
    // Warm tea colours with noise; stored uncompressed (level 0) so the file is ~3 MB.
    raw[i] = 150 + (rand() % 90);
    raw[i + 1] = 90 + (rand() % 70);
    raw[i + 2] = 30 + (rand() % 50);
  }
}

const crcTable = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
const crc32 = (buf) => {
  let c = 0xffffffff;
  for (const b of buf) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};
const chunk = (type, data) => {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
};
const ihdr = Buffer.alloc(13);
ihdr.writeUInt32BE(width, 0);
ihdr.writeUInt32BE(height, 4);
ihdr[8] = 8; // bit depth
ihdr[9] = 2; // RGB
const png = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  chunk('IHDR', ihdr),
  chunk('IDAT', deflateSync(raw, { level: 0 })),
  chunk('IEND', Buffer.alloc(0)),
]);
mkdirSync(fileURLToPath(new URL('../public/', import.meta.url)), { recursive: true });
writeFileSync(out, png);
console.log(`wrote public/hero.png (${(png.length / 1024 / 1024).toFixed(1)} MB)`);
