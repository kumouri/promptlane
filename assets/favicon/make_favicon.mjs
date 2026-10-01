#!/usr/bin/env node
/**
 * Elysium's favicon: a bearbot head (Jamobair, the mascot) — a violet bear head with a toxic-green
 * robot visor on a black tile, so it reads on light and dark tab bars alike. The palette is the
 * project's (docs/design.md § Palette).
 *
 * One shape list drives every output, so the SVG and the bitmaps cannot drift apart:
 *
 *   favicon.svg      the scalable icon (modern browsers prefer it)
 *   favicon-32.png   32×32 PNG fallback
 *   favicon-180.png  180×180 apple-touch-icon (full-bleed square; iOS rounds the corners itself)
 *   favicon.ico      16, 32 and 48 px, each a PNG inside the ICO (what `/favicon.ico` serves)
 *
 *   node assets/favicon/make_favicon.mjs
 *
 * Standard library only: shapes are rasterised here (8×8 supersampling) and PNGs are encoded with
 * node:zlib, so regenerating needs nothing but Node.
 */
import { writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { deflateSync } from 'node:zlib';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const VIOLET = '#8e00ff';
const GREEN = '#00ff0f';
const BLACK = '#000000';

/** The icon on a 32×32 grid, painted in order. `tileRadius` rounds the black background tile. */
function shapes(tileRadius) {
  return [
    { kind: 'rect', x: 0, y: 0, w: 32, h: 32, r: tileRadius, fill: BLACK },
    { kind: 'circle', cx: 8, cy: 9, r: 4.5, fill: VIOLET }, // left ear
    { kind: 'circle', cx: 24, cy: 9, r: 4.5, fill: VIOLET }, // right ear
    { kind: 'circle', cx: 16, cy: 18.5, r: 11, fill: VIOLET }, // head
    { kind: 'rect', x: 8, y: 14.5, w: 16, h: 6, r: 3, fill: GREEN }, // visor
  ];
}

function svg(list) {
  const el = (s) =>
    s.kind === 'circle'
      ? `<circle cx="${s.cx}" cy="${s.cy}" r="${s.r}" fill="${s.fill}"/>`
      : `<rect x="${s.x}" y="${s.y}" width="${s.w}" height="${s.h}"${s.r ? ` rx="${s.r}"` : ''} fill="${s.fill}"/>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32">${list.map(el).join('')}</svg>\n`;
}

function inside(s, x, y) {
  if (s.kind === 'circle') return (x - s.cx) ** 2 + (y - s.cy) ** 2 <= s.r ** 2;
  if (x < s.x || x > s.x + s.w || y < s.y || y > s.y + s.h) return false;
  if (!s.r) return true;
  const qx = Math.min(Math.max(x, s.x + s.r), s.x + s.w - s.r);
  const qy = Math.min(Math.max(y, s.y + s.r), s.y + s.h - s.r);
  return (x - qx) ** 2 + (y - qy) ** 2 <= s.r ** 2;
}

const rgb = (hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));

/** RGBA pixels at `size`×`size`: each pixel averages an 8×8 grid of samples (premultiplied). */
function raster(list, size) {
  const SS = 8;
  const scale = 32 / size;
  const out = Buffer.alloc(size * size * 4);
  const fills = list.map((s) => rgb(s.fill));
  for (let py = 0; py < size; py++) {
    for (let px = 0; px < size; px++) {
      let r = 0, g = 0, b = 0, a = 0;
      for (let sy = 0; sy < SS; sy++) {
        for (let sx = 0; sx < SS; sx++) {
          const x = (px + (sx + 0.5) / SS) * scale;
          const y = (py + (sy + 0.5) / SS) * scale;
          for (let i = list.length - 1; i >= 0; i--) {
            if (!inside(list[i], x, y)) continue;
            r += fills[i][0]; g += fills[i][1]; b += fills[i][2]; a += 1;
            break;
          }
        }
      }
      const o = (py * size + px) * 4;
      if (a) {
        out[o] = Math.round(r / a);
        out[o + 1] = Math.round(g / a);
        out[o + 2] = Math.round(b / a);
      }
      out[o + 3] = Math.round((a / (SS * SS)) * 255);
    }
  }
  return out;
}

const CRC = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
function crc32(buf) {
  let c = 0xffffffff;
  for (const byte of buf) c = CRC[(c ^ byte) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}

function png(pixels, size) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA
  const rows = Buffer.alloc(size * (size * 4 + 1)); // filter byte 0 (none) per row
  for (let y = 0; y < size; y++) pixels.copy(rows, y * (size * 4 + 1) + 1, y * size * 4, (y + 1) * size * 4);
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(rows, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

/** ICO container holding PNG images (supported by every current browser and Windows Vista+). */
function ico(images) {
  const header = Buffer.alloc(6 + 16 * images.length);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2); // type: icon
  header.writeUInt16LE(images.length, 4);
  let offset = header.length;
  images.forEach(({ size, data }, i) => {
    const e = 6 + 16 * i;
    header[e] = size >= 256 ? 0 : size;
    header[e + 1] = size >= 256 ? 0 : size;
    header.writeUInt16LE(1, e + 4); // planes
    header.writeUInt16LE(32, e + 6); // bits per pixel
    header.writeUInt32LE(data.length, e + 8);
    header.writeUInt32LE(offset, e + 12);
    offset += data.length;
  });
  return Buffer.concat([header, ...images.map((im) => im.data)]);
}

const TAB = shapes(7);
const bitmap = (list, size) => png(raster(list, size), size);
const write = (name, data) => {
  writeFileSync(path.join(HERE, name), data);
  console.log(`${name}  ${data.length} bytes`);
};

write('favicon.svg', svg(TAB));
write('favicon-32.png', bitmap(TAB, 32));
write('favicon-180.png', bitmap(shapes(0), 180));
write('favicon.ico', ico([16, 32, 48].map((size) => ({ size, data: bitmap(TAB, size) }))));
