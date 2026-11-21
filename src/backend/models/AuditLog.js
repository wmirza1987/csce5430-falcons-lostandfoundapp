const mongoose = require("mongoose");

// Non-content audit records for privileged actions (FR-ADM-02, FR-COM-02).
// The detail field holds IDs, action names, and short reasons only. Message
// text, claim evidence, passwords, and tokens must never be written here.
const auditLogSchema = new mongoose.Schema(
  {
    actor: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },

    action: {
      type: String,
      required: true,
      trim: true,
      maxlength: 80,
      index: true,
    },

    targetType: {
      type: String,
      required: true,
      trim: true,
      maxlength: 40,
    },

    targetId: {
      type: mongoose.Schema.Types.ObjectId,
      default: null,
    },

    detail: {
      type: String,
      trim: true,
      maxlength: 300,
      default: "",
    },
  },
  { timestamps: true }
);

auditLogSchema.index({ createdAt: -1 });
auditLogSchema.index({ action: 1, createdAt: -1 });

module.exports = mongoose.model("AuditLog", auditLogSchema);
