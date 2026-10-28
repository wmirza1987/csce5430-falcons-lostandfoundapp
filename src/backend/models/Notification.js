const mongoose = require("mongoose");

const notificationSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },

    type: {
      type: String,
      enum: [
        "match",
        "claim",
        "claim_decision",
        "claim_closed",
        "resolution",
        "moderation",
      ],
      required: true,
    },

    message: {
      type: String,
      required: true,
      trim: true,
      maxlength: 500,
    },

    listing: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Listing",
    },

    claim: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Claim",
    },

    isRead: {
      type: Boolean,
      default: false,
      index: true,
    },

    emailStatus: {
      type: String,
      enum: ["not_requested", "sent", "failed", "skipped"],
      default: "not_requested",
    },

    emailAttempts: {
      type: Number,
      default: 0,
    },
  },
  {
    timestamps: true,
  }
);

notificationSchema.index({ user: 1, isRead: 1, createdAt: -1 });

module.exports = mongoose.model("Notification", notificationSchema);
