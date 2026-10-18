// Handles listing image uploads per FR LIST 02 and IF SW 02: up to three
// JPEG, PNG, or WebP images, no more than 5 MB each, using multipart form
// data, validated before a permanent file reference is stored.
const fs = require("fs");
const path = require("path");
const multer = require("multer");

const UPLOAD_DIR = path.join(__dirname, "..", "uploads", "listings");

// Ensure the upload directory exists before multer tries to write into it.
fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const ALLOWED_MIME_TYPES = ["image/jpeg", "image/png", "image/webp"];
const MAX_FILE_SIZE_BYTES = 5 * 1024 * 1024; // 5 MB
const MAX_FILES = 3;

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
    files: MAX_FILES,
  },
}).array("images", MAX_FILES);

// Wraps multer so its errors (wrong type, too large, too many files) come back
// as a normal 400 JSON response instead of an uncaught exception.
function handleListingImageUpload(req, res, next) {
  uploadListingImages(req, res, (error) => {
    if (error instanceof multer.MulterError) {
      let message = "Unable to upload the provided images.";

      if (error.code === "LIMIT_FILE_SIZE") {
        message = "Each image must be no more than 5 MB.";
      } else if (error.code === "LIMIT_FILE_COUNT" || error.code === "LIMIT_UNEXPECTED_FILE") {
        message = "A listing can include at most 3 images.";
      }

      return res.status(400).json({ message });
    }

    if (error) {
      return res.status(400).json({ message: error.message });
    }

    next();
  });
}

// Converts uploaded files into the public URLs stored on the listing.
function filesToImageUrls(req) {
  if (!req.files || req.files.length === 0) {
    return [];
  }

  return req.files.map((file) => `/uploads/listings/${file.filename}`);
}

module.exports = {
  handleListingImageUpload,
  filesToImageUrls,
};
