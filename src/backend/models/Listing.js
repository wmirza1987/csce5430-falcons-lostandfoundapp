const mongoose = require("mongoose");

const listingSchema = new mongoose.Schema(
  {
    type: {
      type: String,
      enum: ["lost", "found"],
      required: true,
    },

    title: {
      type: String,
      required: true,
      trim: true,
      maxlength: 100,
    },

    category: {
      type: String,
      required: true,
      trim: true,
    },

    brand: {
      type: String,
      trim: true,
      maxlength: 60,
      default: "",
    },

    color: {
      type: String,
      trim: true,
      maxlength: 40,
      default: "",
    },

    description: {
      type: String,
      required: true,
      trim: true,
      maxlength: 1000,
    },

    date: {
      type: Date,
      required: true,
    },

    location: {
      building: {
        type: String,
        required: true,
        trim: true,
      },

      zone: {
        type: String,
        trim: true,
      },
    },

    images: {
      type: [String],
      default: [],
      validate: {
        validator: function (images) {
          return images.length <= 3;
        },
        message: "A listing can contain a maximum of 3 images.",
      },
    },

    status: {
      type: String,
      enum: ["active", "pending_return", "resolved"],
      default: "active",
    },

    privateDetails: {
      type: String,
      trim: true,
      maxlength: 500,
      select: false,
    },

    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },

    isDeleted: {
      type: Boolean,
      default: false,
    },
  },
  {
    timestamps: true,
  }
);

listingSchema.index({ isDeleted: 1, status: 1, type: 1, createdAt: -1 });
listingSchema.index({ category: 1, "location.building": 1, "location.zone": 1 });

listingSchema.pre("validate", function () {
  if (this.type === "found" && this.images.length === 0) {
    this.invalidate(
      "images",
      "Found-item listings must include at least one image."
    );
  }
});

module.exports = mongoose.model("Listing", listingSchema);