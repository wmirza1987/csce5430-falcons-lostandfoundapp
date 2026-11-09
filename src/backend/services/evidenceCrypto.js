// Encryption at rest for claim evidence (FR-CLM-01, NFR-PRIV-01).
// AES-256-GCM with a random 96-bit IV per value. The key comes from
// EVIDENCE_ENCRYPTION_KEY (64 hex characters or 32 base64 bytes). If that is
// not set, a development key is derived from JWT_SECRET so the app still runs
// locally; deployments should set a dedicated key.
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");

const ALGORITHM = "aes-256-gcm";
const PRIVATE_DIR = path.join(__dirname, "..", "private", "evidence");

fs.mkdirSync(PRIVATE_DIR, { recursive: true });

let warnedAboutDerivedKey = false;

function getKey() {
  const configured = process.env.EVIDENCE_ENCRYPTION_KEY;

  if (configured) {
    const key = /^[0-9a-fA-F]{64}$/.test(configured)
      ? Buffer.from(configured, "hex")
      : Buffer.from(configured, "base64");

    if (key.length !== 32) {
      throw new Error("EVIDENCE_ENCRYPTION_KEY must decode to 32 bytes.");
    }

    return key;
  }

  if (!process.env.JWT_SECRET) {
    throw new Error("EVIDENCE_ENCRYPTION_KEY or JWT_SECRET must be set.");
  }

  if (!warnedAboutDerivedKey) {
    console.warn(
      "EVIDENCE_ENCRYPTION_KEY is not set; deriving the evidence key from JWT_SECRET."
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

// Writes an encrypted file into the private evidence folder, which is never
// served statically. Returns the metadata needed to read it back.
function saveEncryptedFile(plain, mimeType) {
  const { ciphertext, iv, authTag } = encryptBuffer(plain);
  const storedName = `${crypto.randomBytes(16).toString("hex")}.bin`;

  fs.writeFileSync(path.join(PRIVATE_DIR, storedName), ciphertext, { mode: 0o600 });

  return {
    storedName,
    mimeType,
    sizeBytes: plain.length,
    iv,
    authTag,
  };
}

function readEncryptedFile(image) {
  const ciphertext = fs.readFileSync(path.join(PRIVATE_DIR, image.storedName));
  return decryptBuffer(ciphertext, image.iv, image.authTag);
}

function deleteEncryptedFile(storedName) {
  try {
    fs.unlinkSync(path.join(PRIVATE_DIR, storedName));
  } catch (error) {
    if (error.code !== "ENOENT") {
      console.error(`Unable to remove evidence file: ${error.message}`);
    }
  }
}

module.exports = {
  decryptText,
  deleteEncryptedFile,
  encryptText,
  readEncryptedFile,
  saveEncryptedFile,
};
