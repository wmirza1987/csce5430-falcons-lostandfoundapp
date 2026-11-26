// Generates small, valid PNG placeholder photos (a colored gradient tile) for the
// demo seed data, so seeded listings show an image without bundling binary assets.
// Pure Node: builds the PNG chunks by hand with zlib and a CRC32 table.
const zlib = require("zlib");

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);

  for (let n = 0; n < 256; n += 1) {
    let c = n;

    for (let k = 0; k < 8; k += 1) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }

    table[n] = c >>> 0;
  }

  return table;
})();

function crc32(buffer) {
  let crc = 0xffffffff;

  for (const byte of buffer) {
    crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  }

  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([length, body, crc]);
}

// Hue per category keeps the demo cards visually distinct.
function colorFor(seed) {
  let hash = 0;

  for (const character of String(seed)) {
    hash = (hash * 31 + character.charCodeAt(0)) >>> 0;
  }

  const hue = hash % 360;
  const toRgb = (h, s, l) => {
    const a = s * Math.min(l, 1 - l);
    const f = (n) => {
      const k = (n + h / 30) % 12;
      return Math.round(255 * (l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1))));
    };
    return [f(0), f(8), f(4)];
  };

  return { light: toRgb(hue, 0.55, 0.78), dark: toRgb(hue, 0.55, 0.45) };
}

function createPlaceholderPng(seed, width = 320, height = 240) {
  const { light, dark } = colorFor(seed);
  const rowLength = 1 + width * 3;
  const raw = Buffer.alloc(rowLength * height);

  for (let y = 0; y < height; y += 1) {
    raw[y * rowLength] = 0; // filter type: none

    for (let x = 0; x < width; x += 1) {
      const t = (x / width + y / height) / 2;
      const offset = y * rowLength + 1 + x * 3;

      for (let channel = 0; channel < 3; channel += 1) {
        raw[offset + channel] = Math.round(light[channel] * (1 - t) + dark[channel] * t);
      }
    }
  }

  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8; // bit depth
  header[9] = 2; // color type: RGB

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", header),
    chunk("IDAT", zlib.deflateSync(raw)),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

module.exports = { createPlaceholderPng };
