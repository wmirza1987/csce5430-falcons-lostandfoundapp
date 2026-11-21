const mongoose = require("mongoose");

// Messages belong to an approved claim thread (FR-CLM-03, FR-COM-01). The body
// is plain text only. Contact-detail detection is a soft flag (FR-COM-03): the
// message is still stored, but the sender is warned and the detection recorded.
const messageSchema = new mongoose.Schema(
  {
    claim: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Claim",
      required: true,
      index: true,
    },

    listing: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Listing",
      required: true,
    },

    // Null for system messages, such as the message that opens a thread.
    sender: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },

    kind: {
      type: String,
      enum: ["system", "user"],
      default: "user",
    },

    body: {
      type: String,
      required: true,
      trim: true,
      minlength: 1,
      maxlength: 1000,
    },

    containsContactDetails: {
      type: Boolean,
      default: false,
    },

    flagged: {
      type: Boolean,
      default: false,
    },

    flaggedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },

    flaggedAt: {
      type: Date,
    },

    flagReason: {
      type: String,
      trim: true,
      maxlength: 300,
      select: false,
    },

    // FR-ADM-01: hidden messages are omitted from normal thread views. A
    // moderator reviewing the linked report can still see a content-free
    // placeholder through the includeHidden query option.
    isHidden: {
      type: Boolean,
      default: false,
      index: true,
    },

    hiddenBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
      select: false,
    },

    hiddenAt: {
      type: Date,
      default: null,
      select: false,
    },

    hiddenReason: {
      type: String,
      trim: true,
      maxlength: 500,
      default: "",
      select: false,
    },
  },
  {
    timestamps: true,
  }
);

messageSchema.index({ claim: 1, createdAt: 1 });

module.exports = mongoose.model("Message", messageSchema);
