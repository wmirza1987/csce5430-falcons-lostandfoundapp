const mongoose = require("mongoose");

// Each factor records the weighted points it contributed to the score, on the
// same 0 to 1 scale as the total. Factors are kept for analytics and tuning
// (FR-MATCH-03) and are never returned by public or owner-facing API responses.
const matchSchema = new mongoose.Schema(
  {
    lostListing: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Listing",
      required: true,
      index: true,
    },

    foundListing: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Listing",
      required: true,
      index: true,
    },

    // Composite confidence score between 0 and 1 (FR-MATCH-01).
    score: {
      type: Number,
      required: true,
      min: 0,
      max: 1,
    },

    factors: {
      category: {
        points: { type: Number, required: true, min: 0, max: 1 },
      },
      date: {
        points: { type: Number, required: true, min: 0, max: 1 },
        daysApart: { type: Number, default: null },
      },
      location: {
        points: { type: Number, required: true, min: 0, max: 1 },
        basis: { type: String, default: "" },
      },
      keywords: {
        points: { type: Number, required: true, min: 0, max: 1 },
        shared: { type: [String], default: [] },
      },
    },
  },
  {
    timestamps: true,
  }
);

matchSchema.index({ lostListing: 1, foundListing: 1 }, { unique: true });
matchSchema.index({ score: -1, createdAt: -1 });

module.exports = mongoose.model("Match", matchSchema);
