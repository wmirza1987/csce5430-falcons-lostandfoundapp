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
        "message",
        "moderation",
      ],
      required: true,
    },

    // Generic text only: never contact details, evidence, or message content
    // (FR-NOTIF-02, NFR-PRIV-01).
    message: {
      type: String,
      required: true,
      trim: true,
      maxlength: 500,
    },

    // In-app route the notification points to, for example /claims/:id.
    actionPath: {
      type: String,
      trim: true,
      maxlength: 200,
      default: "",
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

    // Email is optional (FR-NOTIF-01). "pending" is recorded before a send is
    // attempted and becomes "sent" only after the provider confirms delivery.
    emailStatus: {
      type: String,
      enum: ["not_requested", "pending", "sent", "failed", "skipped"],
      default: "not_requested",
    },

    emailAttempts: {
      type: Number,
      default: 0,
    },

    emailSubject: {
      type: String,
      trim: true,
      maxlength: 150,
      select: false,
    },

    emailBody: {
      type: String,
      maxlength: 1000,
      select: false,
    },
  },
  {
    timestamps: true,
  }
);

notificationSchema.index({ user: 1, isRead: 1, createdAt: -1 });
notificationSchema.index({ emailStatus: 1, createdAt: 1 });

module.exports = mongoose.model("Notification", notificationSchema);
