const mongoose = require("mongoose");
const bcrypt = require("bcrypt");
const crypto = require("crypto");

const userSchema = new mongoose.Schema(
  {
    firstName: {
      type: String,
      required: true,
      trim: true,
      maxlength: 50,
    },

    lastName: {
      type: String,
      required: true,
      trim: true,
      maxlength: 50,
    },

    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
      validate: {
        validator: function (email) {
          return (
            email.endsWith("@my.unt.edu") ||
            email.endsWith("@unt.edu")
          );
        },
        message: "Please use a valid UNT email address.",
      },
    },

    password: {
      type: String,
      required: true,
      minlength: 8,
      select: false,
    },

    role: {
      type: String,
      enum: ["user", "moderator", "admin"],
      default: "user",
    },

    isEmailVerified: {
      type: Boolean,
      default: false,
    },

    isActive: {
      type: Boolean,
      default: true,
    },

    // Optional email notifications (FR-COM-01). In-app notifications are
    // always created; this only controls whether an email is also attempted.
    emailNotifications: {
      type: Boolean,
      default: true,
    },

    // Stored as a SHA-256 hash, never the raw token, consistent with NFR SEC 02.
    // The raw token is only ever held in memory long enough to email it.
    emailVerificationTokenHash: {
      type: String,
      select: false,
    },

    emailVerificationExpires: {
      type: Date,
      select: false,
    },

    passwordResetTokenHash: {
      type: String,
      select: false,
    },

    passwordResetExpires: {
      type: Date,
      select: false,
    },
  },
  {
    timestamps: true,
  }
);

// Hash password before saving the user
userSchema.pre("save", async function () {
  if (!this.isModified("password")) {
    return;
  }

  this.password = await bcrypt.hash(this.password, 10);
});

// Compare login password with the stored hash
userSchema.methods.comparePassword = async function (enteredPassword) {
  return bcrypt.compare(enteredPassword, this.password);
};

function hashToken(rawToken) {
  return crypto.createHash("sha256").update(rawToken).digest("hex");
}

// Generates a one time, time limited email verification token.
// Returns the raw token (to email to the user); only its hash is persisted.
userSchema.methods.generateEmailVerificationToken = function () {
  const rawToken = crypto.randomBytes(32).toString("hex");

  this.emailVerificationTokenHash = hashToken(rawToken);
  this.emailVerificationExpires = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours

  return rawToken;
};

// Generates a one time, time limited password reset token.
// Returns the raw token (to email to the user); only its hash is persisted.
userSchema.methods.generatePasswordResetToken = function () {
  const rawToken = crypto.randomBytes(32).toString("hex");

  this.passwordResetTokenHash = hashToken(rawToken);
  this.passwordResetExpires = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

  return rawToken;
};

userSchema.statics.hashToken = hashToken;

module.exports = mongoose.model("User", userSchema);