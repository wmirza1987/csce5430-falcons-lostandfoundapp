const zlib = require("zlib");
const { createPlaceholderPng } = require("../services/placeholderImage");

describe("placeholder demo images", () => {
  test("produces a valid PNG with the requested size", () => {
    const png = createPlaceholderPng("Keys", 32, 16);

    expect(png.subarray(0, 8)).toEqual(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
    expect(png.readUInt32BE(16)).toBe(32);
    expect(png.readUInt32BE(20)).toBe(16);

    const idatStart = png.indexOf("IDAT") + 4;
    const idatLength = png.readUInt32BE(idatStart - 8);
    const raw = zlib.inflateSync(png.subarray(idatStart, idatStart + idatLength));
    expect(raw.length).toBe((1 + 32 * 3) * 16);
  });

  test("uses different colors for different categories", () => {
    expect(createPlaceholderPng("Keys").equals(createPlaceholderPng("Bags"))).toBe(false);
  });
});
