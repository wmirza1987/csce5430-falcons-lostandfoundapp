const mongoose = require("mongoose");

// A signed-in user may report a listing or a message (FR-ADM-01). The report
// keeps a link to the claim/listing so a moderator's message-thread access can
// be limited to a report they are actively reviewing (FR-COM-02).
const reportSchema = new mongoose.Schema(
  {
    reporter: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },

    targetType: {
      type: String,
      enum: ["listing", "message"],
      required: true,
    },

    targetId: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
      index: true,
    },

    // Derived when the report is created so thread authorization needs no
    // second lookup of the reported object.
    listing: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Listing",
      default: null,
      index: true,
    },

    claim: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Claim",
      default: null,
      index: true,
    },

    reason: {
      type: String,
      required: true,
      trim: true,
      minlength: 10,
      maxlength: 500,
    },

    status: {
      type: String,
      enum: ["open", "reviewing", "resolved"],
      default: "open",
      index: true,
    },

    decision: {
      type: String,
      enum: ["hide", "restore", "dismiss", null],
      default: null,
    },

    decisionNote: {
      type: String,
      trim: true,
      maxlength: 500,
      default: "",
    },

    handledBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },

    handledAt: {
      type: Date,
      default: null,
    },

    // Set when a moderator opens the associated conversation. Cleared when the
    // report is resolved so access ends with the review.
    threadAccessAt: {
      type: Date,
      default: null,
    },
  },
  { timestamps: true }
);

reportSchema.index({ status: 1, createdAt: -1 });
reportSchema.index({ targetType: 1, targetId: 1 });

module.exports = mongoose.model("Report", reportSchema);
