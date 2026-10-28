const mongoose = require("mongoose");

const factorSchema = new mongoose.Schema(
  {
    points: {
      type: Number,
      required: true,
      min: 0,
    },
  },
  { _id: false }
);

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

    score: {
      type: Number,
      required: true,
      min: 0,
      max: 100,
    },

    // Stored with every suggestion so the UI can explain the score instead of
    // showing a bare number (FR-MATCH-02).
    factors: {
      category: {
        type: factorSchema,
        required: true,
      },
      date: {
        type: new mongoose.Schema(
          {
            points: { type: Number, required: true, min: 0 },
            daysApart: { type: Number, default: null },
          },
          { _id: false }
        ),
        required: true,
      },
      location: {
        type: new mongoose.Schema(
          {
            points: { type: Number, required: true, min: 0 },
            basis: { type: String, default: "" },
          },
          { _id: false }
        ),
        required: true,
      },
      keywords: {
        type: new mongoose.Schema(
          {
            points: { type: Number, required: true, min: 0 },
            shared: { type: [String], default: [] },
          },
          { _id: false }
        ),
        required: true,
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
