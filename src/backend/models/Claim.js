const mongoose = require("mongoose");

// Claim evidence is encrypted at rest (FR-CLM-01 / NFR-PRIV-01). The text
// description is stored as an AES-256-GCM payload and the photos are stored
// encrypted on disk outside the public uploads folder. Both are excluded from
// queries unless a caller explicitly selects them.
const evidenceImageSchema = new mongoose.Schema(
  {
    storedName: { type: String, required: true },
    mimeType: { type: String, required: true },
    sizeBytes: { type: Number, required: true, min: 1 },
    iv: { type: String, required: true },
    authTag: { type: String, required: true },
  },
  { _id: false }
);

const claimSchema = new mongoose.Schema(
  {
    // The matched pair this claim is scoped to (FR-CLM-01).
    match: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Match",
      required: true,
      index: true,
    },

    // The Found listing being claimed. Its owner reviews the claim (FR-CLM-02).
    listing: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Listing",
      required: true,
      index: true,
    },

    // The Lost listing owner who submitted the claim.
    claimant: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },

    // "iv:authTag:ciphertext", base64 encoded. Never returned directly.
    explanationCiphertext: {
      type: String,
      required: true,
      select: false,
    },

    evidenceImages: {
      type: [evidenceImageSchema],
      default: [],
      select: false,
      validate: {
        validator: (images) => images.length <= 2,
        message: "A claim can include at most 2 evidence photos.",
      },
    },

    status: {
      type: String,
      enum: ["pending", "approved", "rejected", "closed"],
      default: "pending",
      index: true,
    },

    decisionNote: {
      type: String,
      trim: true,
      maxlength: 500,
      default: "",
    },

    decidedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },

    decidedAt: {
      type: Date,
    },
  },
  {
    timestamps: true,
  }
);

claimSchema.index({ listing: 1, status: 1, createdAt: 1 });
claimSchema.index({ match: 1, claimant: 1, status: 1 });

module.exports = mongoose.model("Claim", claimSchema);
