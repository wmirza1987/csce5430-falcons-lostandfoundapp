const mongoose = require("mongoose");

// Administrator-managed item category catalog (FR-ADM-02). Listings keep
// their existing free-text category so older data stays valid; the catalog
// drives the client form and dashboard grouping.
const categorySchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
      minlength: 2,
      maxlength: 60,
      unique: true,
      lowercase: true,
    },

    description: {
      type: String,
      trim: true,
      maxlength: 300,
      default: "",
    },

    isActive: {
      type: Boolean,
      default: true,
    },

    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
  },
  { timestamps: true }
);

categorySchema.index({ isActive: 1, name: 1 });

module.exports = mongoose.model("Category", categorySchema);
