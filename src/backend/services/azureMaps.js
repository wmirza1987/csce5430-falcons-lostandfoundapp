// Azure Maps raster tiles, proxied by the API so the browser never holds a key or
// token. Authentication is the App Service managed identity (Entra ID) with the
// "Azure Maps Data Reader" role; locally it falls back to `az login`.
// Enabled only when AZURE_MAPS_CLIENT_ID (the Maps account's client id) is set.
const TILESET = "microsoft.base.road";
const API_VERSION = "2024-04-01";

let credential;

function isConfigured() {
  return Boolean(process.env.AZURE_MAPS_CLIENT_ID);
}

async function getToken() {
  if (!credential) {
    const { DefaultAzureCredential } = require("@azure/identity");
    credential = new DefaultAzureCredential();
  }

  const token = await credential.getToken("https://atlas.microsoft.com/.default");
  return token.token;
}

function validTile(z, x, y) {
  const zoom = Number(z);
  const max = 2 ** zoom;
  return (
    Number.isInteger(zoom) && zoom >= 0 && zoom <= 19 &&
    Number.isInteger(Number(x)) && Number(x) >= 0 && Number(x) < max &&
    Number.isInteger(Number(y)) && Number(y) >= 0 && Number(y) < max
  );
}

// Returns { status, buffer, contentType }. Dependencies are injectable for tests.
async function fetchTile(z, x, y, { fetchImpl = fetch, tokenProvider = getToken } = {}) {
  if (!validTile(z, x, y)) {
    return { status: 400 };
  }

  const url =
    `https://atlas.microsoft.com/map/tile?api-version=${API_VERSION}&tilesetId=${TILESET}` +
    `&zoom=${Number(z)}&x=${Number(x)}&y=${Number(y)}`;

  const response = await fetchImpl(url, {
    headers: {
      Authorization: `Bearer ${await tokenProvider()}`,
      "x-ms-client-id": process.env.AZURE_MAPS_CLIENT_ID,
    },
  });

  if (!response.ok) {
    return { status: 502 };
  }

  return {
    status: 200,
    buffer: Buffer.from(await response.arrayBuffer()),
    contentType: response.headers.get("content-type") || "image/png",
  };
}

module.exports = { fetchTile, isConfigured, validTile };
