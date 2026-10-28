const mongoose = require("mongoose");

const claimSchema = new mongoose.Schema(
  {
    listing: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Listing",
      required: true,
      index: true,
    },

    claimant: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },

    explanation: {
      type: String,
      required: true,
      trim: true,
      maxlength: 1000,
    },

    // At least two private identifying details are required by FR-CLM-01.
    // These are never returned by public listing or match endpoints.
    privateDetails: {
      type: [
        {
          type: String,
          trim: true,
          maxlength: 200,
        },
      ],
      validate: {
        validator: function (details) {
          return (
            Array.isArray(details) &&
            details.filter((detail) => String(detail || "").trim()).length >= 2
          );
        },
        message: "At least two private identifying details are required.",
      },
      select: false,
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
claimSchema.index({ claimant: 1, createdAt: -1 });
claimSchema.index({ listing: 1, claimant: 1, status: 1 });

module.exports = mongoose.model("Claim", claimSchema);
