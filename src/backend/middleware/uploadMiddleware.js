// Image uploads per FR LIST 02 / FR CLM 01 and IF SW 02: JPEG, PNG, or WebP,
// no more than 5 MB each. Both listing photos (up to 3) and claim evidence (up
// to 2) are buffered in memory. After multer, every file is checked by its magic
// bytes (the client MIME type and file name are never trusted) and given a
// server generated name. Listing photos are then written to blob storage;
// evidence is encrypted first (services/evidenceCrypto.js).
const crypto = require("crypto");
const multer = require("multer");
const storage = require("../services/storage");

const ALLOWED_MIME_TYPES = ["image/jpeg", "image/png", "image/webp"];
const MAX_FILE_SIZE_BYTES = 5 * 1024 * 1024; // 5 MB
const MAX_LISTING_FILES = 3;
const INVALID_IMAGE_MESSAGE = "Only JPEG, PNG, or WebP images are allowed.";
const EXTENSION_BY_TYPE = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" };
const CONTENT_TYPE_BY_EXTENSION = { jpg: "image/jpeg", png: "image/png", webp: "image/webp" };
// Stored listing photo names: <uuid>.<jpg|png|webp>
const IMAGE_NAME_PATTERN = /^[0-9a-f-]{36}\.(jpg|png|webp)$/;

// Identifies the real image type from the leading bytes, or returns null.
function sniffImageType(buffer) {
  if (!Buffer.isBuffer(buffer)) {
    return null;
  }

  if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return "image/jpeg";
  }

  if (
    buffer.length >= 8 &&
    buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
  ) {
    return "image/png";
  }

  if (
    buffer.length >= 12 &&
    buffer.toString("latin1", 0, 4) === "RIFF" &&
    buffer.toString("latin1", 8, 12) === "WEBP"
  ) {
    return "image/webp";
  }

  return null;
}

// Validates every uploaded file by magic bytes and attaches the sniffed type and
// a server generated name. Returns false if any file is not a real image.
function inspectFiles(files) {
  for (const file of Array.isArray(files) ? files : []) {
    const type = sniffImageType(file.buffer);

    if (!type) {
      return false;
    }

    file.mimetype = type;
    file.sniffedType = type;
    file.storedName = `${crypto.randomUUID()}.${EXTENSION_BY_TYPE[type]}`;
  }

  return true;
}

function rejectInvalidImages(req, res, next) {
  if (!inspectFiles(req.files)) {
    return res.status(400).json({ message: INVALID_IMAGE_MESSAGE });
  }

  next();
}
const MAX_EVIDENCE_FILES = 2;

function fileFilter(req, file, cb) {
  if (!ALLOWED_MIME_TYPES.includes(file.mimetype)) {
    return cb(new Error(INVALID_IMAGE_MESSAGE));
  }

  cb(null, true);
}

const uploadListingImages = multer({
  storage: multer.memoryStorage(),
  fileFilter,
  limits: {
    fileSize: MAX_FILE_SIZE_BYTES,
    files: MAX_LISTING_FILES,
  },
}).array("images", MAX_LISTING_FILES);

const uploadEvidenceImages = multer({
  storage: multer.memoryStorage(),
  fileFilter,
  limits: {
    fileSize: MAX_FILE_SIZE_BYTES,
    files: MAX_EVIDENCE_FILES,
  },
}).array("evidence", MAX_EVIDENCE_FILES);

// Wraps multer so its errors come back as a normal 400 JSON response instead
// of an uncaught exception.
function multerErrorMessage(error, messages) {
  if (error instanceof multer.MulterError) {
    if (error.code === "LIMIT_FILE_SIZE") {
      return messages.size;
    }

    if (error.code === "LIMIT_FILE_COUNT" || error.code === "LIMIT_UNEXPECTED_FILE") {
      return messages.count;
    }

    return messages.generic;
  }

  return error.message;
}

function handleListingImageUpload(req, res, next) {
  uploadListingImages(req, res, (error) => {
    if (error) {
      return res.status(400).json({
        message: multerErrorMessage(error, {
          size: "Each image must be no more than 5 MB.",
          count: "A listing can include at most 3 images.",
          generic: "Unable to upload the provided images.",
        }),
      });
    }

    rejectInvalidImages(req, res, next);
  });
}

// IF-UI-04 / FR-CLM-01: up to 2 evidence photos, same types and size limit.
function handleEvidenceUpload(req, res, next) {
  uploadEvidenceImages(req, res, (error) => {
    if (error) {
      return res.status(400).json({
        message: multerErrorMessage(error, {
          size: "Each evidence photo must be no more than 5 MB.",
          count: "A claim can include at most 2 evidence photos.",
          generic: "Unable to upload the evidence photos.",
        }),
      });
    }

    rejectInvalidImages(req, res, next);
  });
}

// Blob names (server generated) for the listing photos in this request.
function filesToImageNames(req) {
  if (!Array.isArray(req.files)) {
    return [];
  }

  return req.files.filter((file) => file.storedName).map((file) => file.storedName);
}

// Writes the validated listing photos to the listings container. Returns the
// names stored, in upload order.
async function storeListingImages(req) {
  const stored = [];

  try {
    for (const file of Array.isArray(req.files) ? req.files : []) {
      await storage.put("listings", file.storedName, file.buffer, file.sniffedType);
      stored.push(file.storedName);
    }
  } catch (error) {
    await removeListingImages(stored);
    throw error;
  }

  return stored;
}

// Best effort cleanup; never throws.
async function removeListingImages(names) {
  for (const name of names || []) {
    if (IMAGE_NAME_PATTERN.test(name)) {
      await storage.remove("listings", name).catch((error) => {
        console.error(`Unable to remove listing photo: ${error.message}`);
      });
    }
  }
}

module.exports = {
  ALLOWED_MIME_TYPES,
  MAX_EVIDENCE_FILES,
  MAX_FILE_SIZE_BYTES,
  CONTENT_TYPE_BY_EXTENSION,
  IMAGE_NAME_PATTERN,
  INVALID_IMAGE_MESSAGE,
  filesToImageNames,
  removeListingImages,
  sniffImageType,
  storeListingImages,
  handleEvidenceUpload,
  handleListingImageUpload,
};
