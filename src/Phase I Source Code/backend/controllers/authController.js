const jwt = require("jsonwebtoken");
const User = require("../models/User");
const { sendVerificationEmail, sendPasswordResetEmail } = require("../services/emailService");

const generateToken = (userId) => {
  return jwt.sign(
    { userId },
    process.env.JWT_SECRET,
    { expiresIn: "1h" }
  );
};

// FR AUTH 01: registration with a campus email address, followed by
// required email verification before the user may post a listing.
const registerUser = async (req, res) => {
  try {
    const { firstName, lastName, email, password } = req.body;

    if (!firstName || !lastName || !email || !password) {
      return res.status(400).json({
        message: "All fields are required.",
      });
    }

    const existingUser = await User.findOne({ email });

    if (existingUser) {
      return res.status(409).json({
        message: "An account with this email already exists.",
      });
    }

    const user = new User({
      firstName,
      lastName,
      email,
      password,
    });

    const rawToken = user.generateEmailVerificationToken();
    await user.save();

    await sendVerificationEmail(user.email, rawToken);

    return res.status(201).json({
      message: "User registered successfully. Please check your email to verify your account.",
      user: {
        id: user._id,
        firstName: user.firstName,
        lastName: user.lastName,
        email: user.email,
        role: user.role,
        isEmailVerified: user.isEmailVerified,
      },
    });
  } catch (error) {
    return res.status(500).json({
      message: "Unable to register user.",
      error: error.message,
    });
  }
};

// FR AUTH 01: completes email verification from the token emailed at registration.
const verifyEmail = async (req, res) => {
  try {
    const { token } = req.params;

    if (!token) {
      return res.status(400).json({
        message: "A verification token is required.",
      });
    }

    const tokenHash = User.hashToken(token);

    const user = await User.findOne({
      emailVerificationTokenHash: tokenHash,
      emailVerificationExpires: { $gt: new Date() },
    }).select("+emailVerificationTokenHash +emailVerificationExpires");

    if (!user) {
      return res.status(400).json({
        message: "This verification link is invalid or has expired.",
      });
    }

    user.isEmailVerified = true;
    user.emailVerificationTokenHash = undefined;
    user.emailVerificationExpires = undefined;
    await user.save();

    return res.status(200).json({
      message: "Email verified successfully. You can now create listings.",
    });
  } catch (error) {
    return res.status(500).json({
      message: "Unable to verify email.",
      error: error.message,
    });
  }
};

// FR AUTH 02: sign in with a verified session (JWT) credential.
const loginUser = async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({
        message: "Email and password are required.",
      });
    }

    const user = await User.findOne({ email }).select("+password");

    if (!user) {
      return res.status(401).json({
        message: "Invalid email or password.",
      });
    }

    const passwordMatches = await user.comparePassword(password);

    if (!passwordMatches) {
      return res.status(401).json({
        message: "Invalid email or password.",
      });
    }

    const token = generateToken(user._id);

    return res.status(200).json({
      message: "Login successful.",
      token,
      user: {
        id: user._id,
        firstName: user.firstName,
        lastName: user.lastName,
        email: user.email,
        role: user.role,
        isEmailVerified: user.isEmailVerified,
      },
    });
  } catch (error) {
    return res.status(500).json({
      message: "Unable to log in.",
      error: error.message,
    });
  }
};

// FR AUTH 02: request a time limited password reset link without exposing
// whether a given email address has an account (same response either way).
const forgotPassword = async (req, res) => {
  try {
    const { email } = req.body;

    const neutralResponse = {
      message: "If an account exists for this email, a password reset link has been sent.",
    };

    if (!email) {
      return res.status(400).json({
        message: "An email address is required.",
      });
    }

    const user = await User.findOne({ email });

    if (user) {
      const rawToken = user.generatePasswordResetToken();
      await user.save();
      await sendPasswordResetEmail(user.email, rawToken);
    }

    // Always the same response, whether or not the account exists.
    return res.status(200).json(neutralResponse);
  } catch (error) {
    return res.status(500).json({
      message: "Unable to process password reset request.",
      error: error.message,
    });
  }
};

// FR AUTH 02: complete a password reset from the token emailed by forgotPassword.
const resetPassword = async (req, res) => {
  try {
    const { token } = req.params;
    const { password } = req.body;

    if (!password || password.length < 8) {
      return res.status(400).json({
        message: "A new password of at least 8 characters is required.",
      });
    }

    const tokenHash = User.hashToken(token);

    const user = await User.findOne({
      passwordResetTokenHash: tokenHash,
      passwordResetExpires: { $gt: new Date() },
    }).select("+passwordResetTokenHash +passwordResetExpires");

    if (!user) {
      return res.status(400).json({
        message: "This password reset link is invalid or has expired.",
      });
    }

    user.password = password;
    user.passwordResetTokenHash = undefined;
    user.passwordResetExpires = undefined;
    await user.save();

    return res.status(200).json({
      message: "Password reset successfully. You can now log in with your new password.",
    });
  } catch (error) {
    return res.status(500).json({
      message: "Unable to reset password.",
      error: error.message,
    });
  }
};

module.exports = {
  registerUser,
  verifyEmail,
  loginUser,
  forgotPassword,
  resetPassword,
};
