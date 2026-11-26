// Encryption at rest for claim evidence (FR-CLM-01, NFR-PRIV-01).
// AES-256-GCM with a random 96-bit IV per value. The key comes from
// EVIDENCE_ENCRYPTION_KEY (64 hex characters or 32 base64 bytes). In production
// the key is required and the app refuses to start without it. Outside
// production a development key is derived from JWT_SECRET so local runs and
// tests work without extra setup.
const crypto = require("crypto");
const storage = require("./storage");

const ALGORITHM = "aes-256-gcm";
const CONTAINER_KEY = "evidence";

let warnedAboutDerivedKey = false;

function parseKey(configured) {
  const key = /^[0-9a-fA-F]{64}$/.test(configured)
    ? Buffer.from(configured, "hex")
    : Buffer.from(configured, "base64");

  if (key.length !== 32) {
    throw new Error("EVIDENCE_ENCRYPTION_KEY must decode to 32 bytes.");
  }

  return key;
}

// Throws when the configuration is unusable. Called at import time so a
// production deployment without a key fails at startup, not on first upload.
function assertEvidenceKeyConfigured() {
  if (process.env.NODE_ENV === "production" && !process.env.EVIDENCE_ENCRYPTION_KEY) {
    throw new Error("EVIDENCE_ENCRYPTION_KEY must be set in production.");
  }

  if (process.env.EVIDENCE_ENCRYPTION_KEY) {
    parseKey(process.env.EVIDENCE_ENCRYPTION_KEY);
  }
}

function getKey() {
  const configured = process.env.EVIDENCE_ENCRYPTION_KEY;

  if (configured) {
    return parseKey(configured);
  }

  if (process.env.NODE_ENV === "production") {
    throw new Error("EVIDENCE_ENCRYPTION_KEY must be set in production.");
  }

  if (!process.env.JWT_SECRET) {
    throw new Error("EVIDENCE_ENCRYPTION_KEY or JWT_SECRET must be set.");
  }

  if (!warnedAboutDerivedKey) {
    console.warn(
      "EVIDENCE_ENCRYPTION_KEY is not set; deriving a development key from JWT_SECRET."
    );
    warnedAboutDerivedKey = true;
  }

  return crypto.createHash("sha256").update(process.env.JWT_SECRET).digest();
}

function encryptBuffer(plain) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(ALGORITHM, getKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(plain), cipher.final()]);

  return {
    ciphertext,
    iv: iv.toString("base64"),
    authTag: cipher.getAuthTag().toString("base64"),
  };
}

function decryptBuffer(ciphertext, ivBase64, authTagBase64) {
  const decipher = crypto.createDecipheriv(
    ALGORITHM,
    getKey(),
    Buffer.from(ivBase64, "base64")
  );

  decipher.setAuthTag(Buffer.from(authTagBase64, "base64"));

  return Buffer.concat([decipher.update(ciphertext), decipher.final()]);
}

// Text values are stored as a single "iv:authTag:ciphertext" string.
function encryptText(text) {
  const { ciphertext, iv, authTag } = encryptBuffer(Buffer.from(text, "utf8"));
  return [iv, authTag, ciphertext.toString("base64")].join(":");
}

function decryptText(payload) {
  const [iv, authTag, ciphertext] = String(payload || "").split(":");

  if (!iv || !authTag || !ciphertext) {
    throw new Error("Malformed encrypted payload.");
  }

  return decryptBuffer(
    Buffer.from(ciphertext, "base64"),
    iv,
    authTag
  ).toString("utf8");
}

// Encrypts the file and writes the ciphertext to the private evidence
// container under a random name (no extension). Returns the metadata needed to
// read it back.
async function saveEncryptedFile(plain, mimeType) {
  const { ciphertext, iv, authTag } = encryptBuffer(plain);
  const storedName = crypto.randomUUID();

  await storage.put(CONTAINER_KEY, storedName, ciphertext, "application/octet-stream");

  return {
    storedName,
    mimeType,
    sizeBytes: plain.length,
    iv,
    authTag,
  };
}

async function readEncryptedFile(image) {
  const blob = await storage.get(CONTAINER_KEY, image.storedName);

  if (!blob) {
    throw new Error("Evidence file is missing from storage.");
  }

  return decryptBuffer(blob.buffer, image.iv, image.authTag);
}

async function deleteEncryptedFile(storedName) {
  try {
    await storage.remove(CONTAINER_KEY, storedName);
  } catch (error) {
    console.error(`Unable to remove evidence file: ${error.message}`);
  }
}

assertEvidenceKeyConfigured();

module.exports = {
  assertEvidenceKeyConfigured,
  decryptText,
  deleteEncryptedFile,
  encryptText,
  readEncryptedFile,
  saveEncryptedFile,
};
