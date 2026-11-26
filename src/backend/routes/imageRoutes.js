const express = require("express");
const storage = require("../services/storage");
const {
  CONTENT_TYPE_BY_EXTENSION,
  IMAGE_NAME_PATTERN,
} = require("../middleware/uploadMiddleware");

const router = express.Router();

// Public listing photos. The blob container is private; the API streams the
// bytes with headers that stop the browser from treating them as anything but
// an image.
router.get("/images/:name", async (req, res) => {
  const { name } = req.params;

  if (!IMAGE_NAME_PATTERN.test(name)) {
    return res.status(404).json({ message: "Image not found." });
  }

  try {
    const blob = await storage.get("listings", name);

    if (!blob) {
      return res.status(404).json({ message: "Image not found." });
    }

    res.set({
      "Content-Type": CONTENT_TYPE_BY_EXTENSION[name.split(".").pop()],
      "X-Content-Type-Options": "nosniff",
      "Content-Disposition": "inline",
      "Content-Security-Policy": "default-src 'none'; sandbox",
      "Cache-Control": "public, max-age=3600",
    });

    return res.status(200).send(blob.buffer);
  } catch (error) {
    console.error(`Unable to serve image: ${error.message}`);
    return res.status(500).json({ message: "Unable to load image." });
  }
});

module.exports = router;
