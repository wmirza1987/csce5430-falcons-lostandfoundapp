// Image uploads per FR LIST 02 / FR CLM 01 and IF SW 02: JPEG, PNG, or WebP,
// no more than 5 MB each. Listing photos (up to 3) are written to the public
// uploads folder. Claim evidence photos (up to 2) stay in memory so they can be
// encrypted before anything reaches disk.
const fs = require("fs");
const path = require("path");
const multer = require("multer");

const UPLOAD_DIR = path.join(__dirname, "..", "uploads", "listings");

// Ensure the upload directory exists before multer tries to write into it.
fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const ALLOWED_MIME_TYPES = ["image/jpeg", "image/png", "image/webp"];
const MAX_FILE_SIZE_BYTES = 5 * 1024 * 1024; // 5 MB
const MAX_LISTING_FILES = 3;
const MAX_EVIDENCE_FILES = 2;

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, UPLOAD_DIR);
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    const uniqueName = `${Date.now()}-${Math.round(Math.random() * 1e9)}${ext}`;
    cb(null, uniqueName);
  },
});

function fileFilter(req, file, cb) {
  if (!ALLOWED_MIME_TYPES.includes(file.mimetype)) {
    return cb(new Error("Only JPEG, PNG, or WebP images are allowed."));
  }

  cb(null, true);
}

const uploadListingImages = multer({
  storage,
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

    next();
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

    next();
  });
}

// Converts uploaded listing files into the public URLs stored on the listing.
function filesToImageUrls(req) {
  if (!req.files || req.files.length === 0 || !Array.isArray(req.files)) {
    return [];
  }

  return req.files
    .filter((file) => file.filename)
    .map((file) => `/uploads/listings/${file.filename}`);
}

module.exports = {
  ALLOWED_MIME_TYPES,
  MAX_EVIDENCE_FILES,
  MAX_FILE_SIZE_BYTES,
  filesToImageUrls,
  handleEvidenceUpload,
  handleListingImageUpload,
};
