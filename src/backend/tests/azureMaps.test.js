const request = require("supertest");
const app = require("../app");
const { fetchTile, validTile } = require("../services/azureMaps");

describe("Azure Maps tile proxy", () => {
  const original = process.env.AZURE_MAPS_CLIENT_ID;

  afterEach(() => {
    if (original === undefined) {
      delete process.env.AZURE_MAPS_CLIENT_ID;
    } else {
      process.env.AZURE_MAPS_CLIENT_ID = original;
    }
  });

  test("config reports osm and tiles 404 when not configured", async () => {
    delete process.env.AZURE_MAPS_CLIENT_ID;
    const config = await request(app).get("/api/v1/map/config");
    expect(config.status).toBe(200);
    expect(config.body.provider).toBe("osm");
    expect((await request(app).get("/api/v1/map/tiles/16/14/26.png")).status).toBe(404);
  });

  test("config reports azure-maps when configured", async () => {
    process.env.AZURE_MAPS_CLIENT_ID = "11111111-1111-1111-1111-111111111111";
    const config = await request(app).get("/api/v1/map/config");
    expect(config.body.provider).toBe("azure-maps");
  });

  test("validates tile coordinates", () => {
    expect(validTile(16, 14, 26)).toBe(true);
    expect(validTile(2, 4, 0)).toBe(false);
    expect(validTile(20, 0, 0)).toBe(false);
    expect(validTile("a", 0, 0)).toBe(false);
    expect(validTile(3, -1, 0)).toBe(false);
  });

  test("fetches a tile with the managed identity token and client id header", async () => {
    process.env.AZURE_MAPS_CLIENT_ID = "11111111-1111-1111-1111-111111111111";
    let seen;
    const fetchImpl = async (url, options) => {
      seen = { url, options };
      return { ok: true, headers: { get: () => "image/png" }, arrayBuffer: async () => Uint8Array.from([1, 2, 3]).buffer };
    };
    const result = await fetchTile(16, 14, 26, { fetchImpl, tokenProvider: async () => "tok" });

    expect(result.status).toBe(200);
    expect(result.buffer).toEqual(Buffer.from([1, 2, 3]));
    expect(seen.url).toContain("zoom=16&x=14&y=26");
    expect(seen.options.headers.Authorization).toBe("Bearer tok");
    expect(seen.options.headers["x-ms-client-id"]).toBe("11111111-1111-1111-1111-111111111111");
  });

  test("rejects bad coordinates and surfaces upstream failure as 502", async () => {
    expect((await fetchTile(2, 9, 0)).status).toBe(400);
    const fetchImpl = async () => ({ ok: false });
    expect((await fetchTile(3, 1, 1, { fetchImpl, tokenProvider: async () => "t" })).status).toBe(502);
  });
});
