const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const users = require("../repos/users");
const { isUniqueViolation } = require("../repos/util");
const { isNonEmptyString, isString } = require("../services/validation");
const { sendVerificationEmail, sendPasswordResetEmail } = require("../services/emailService");

const generateToken = (userId) => {
  return jwt.sign(
    { userId },
    process.env.JWT_SECRET,
    { expiresIn: "1h" }
  );
};

// A bcrypt hash of a throwaway value. When no account matches a login, the
// password is still compared against it so unknown emails cost about the same
// as a wrong password.
const DUMMY_HASH = bcrypt.hashSync("not-a-real-password", 10);

function publicUser(user) {
  return {
    id: user._id,
    firstName: user.firstName,
    lastName: user.lastName,
    email: user.email,
    role: user.role,
    isEmailVerified: user.isEmailVerified,
    emailNotifications: user.emailNotifications,
  };
}

// FR AUTH 01: registration with a campus email address, followed by
// required email verification before the user may post a listing.
const registerUser = async (req, res) => {
  try {
    const { firstName, lastName, email, password } = req.body || {};

    if (!firstName || !lastName || !email || !password) {
      return res.status(400).json({
        message: "All fields are required.",
      });
    }

    if (![firstName, lastName, email, password].every(isString)) {
      return res.status(400).json({
        message: "All fields must be text.",
      });
    }

    const cleanFirstName = firstName.trim();
    const cleanLastName = lastName.trim();
    const cleanEmail = users.normalizeEmail(email);

    if (!cleanFirstName || !cleanLastName) {
      return res.status(400).json({
        message: "All fields are required.",
      });
    }

    if (cleanFirstName.length > 50 || cleanLastName.length > 50) {
      return res.status(400).json({
        message: "Names must be 50 characters or fewer.",
      });
    }

    if (
      cleanEmail.length > 254 ||
      !(cleanEmail.endsWith("@my.unt.edu") || cleanEmail.endsWith("@unt.edu"))
    ) {
      return res.status(400).json({
        message: "Please use a valid UNT email address.",
      });
    }

    if (password.length < 8) {
      return res.status(400).json({
        message: "Password must be at least 8 characters.",
      });
    }

    const existingUser = await users.findByEmail(cleanEmail);

    if (existingUser) {
      return res.status(409).json({
        message: "An account with this email already exists.",
      });
    }

    const token = users.generateToken(users.EMAIL_VERIFICATION_TTL_MS);
    let user;

    try {
      user = await users.create({
        firstName: cleanFirstName,
        lastName: cleanLastName,
        email: cleanEmail,
        password,
        emailVerificationTokenHash: token.tokenHash,
        emailVerificationExpires: token.expires,
      });
    } catch (error) {
      // Two concurrent registrations for one address: the unique index decides.
      if (isUniqueViolation(error)) {
        return res.status(409).json({
          message: "An account with this email already exists.",
        });
      }

      throw error;
    }

    await sendVerificationEmail(user.email, token.rawToken).catch((error) => {
      // Verification email failure must not roll back a successful registration.
      console.error(`Unable to send verification email: ${error.message}`);
    });

    return res.status(201).json({
      message: "User registered successfully. Please check your email to verify your account.",
      user: publicUser(user),
    });
  } catch (error) {
    console.error(`Unable to register user: ${error.message}`);
    return res.status(500).json({
      message: "Unable to register user.",
    });
  }
};

// FR AUTH 01: completes email verification from the token emailed at registration.
const verifyEmail = async (req, res) => {
  try {
    const { token } = req.params;

    if (!isNonEmptyString(token)) {
      return res.status(400).json({
        message: "A verification token is required.",
      });
    }

    const user = await users.verifyEmailByTokenHash(users.hashToken(token));

    if (!user) {
      return res.status(400).json({
        message: "This verification link is invalid or has expired.",
      });
    }

    return res.status(200).json({
      message: "Email verified successfully. You can now create listings.",
    });
  } catch (error) {
    console.error(`Unable to verify email: ${error.message}`);
    return res.status(500).json({
      message: "Unable to verify email.",
    });
  }
};

// FR AUTH 02: sign in with a verified session (JWT) credential.
const loginUser = async (req, res) => {
  try {
    const { email, password } = req.body || {};

    if (!email || !password) {
      return res.status(400).json({
        message: "Email and password are required.",
      });
    }

    if (!isString(email) || !isString(password)) {
      return res.status(400).json({
        message: "Email and password must be text.",
      });
    }

    const user = await users.findForLogin(email);

    if (!user) {
      await bcrypt.compare(password, DUMMY_HASH).catch(() => false);
      return res.status(401).json({
        message: "Invalid email or password.",
      });
    }

    const passwordMatches = await users.comparePassword(user, password);

    if (!passwordMatches) {
      return res.status(401).json({
        message: "Invalid email or password.",
      });
    }

    const token = generateToken(user._id);

    return res.status(200).json({
      message: "Login successful.",
      token,
      user: publicUser(user),
    });
  } catch (error) {
    console.error(`Unable to log in: ${error.message}`);
    return res.status(500).json({
      message: "Unable to log in.",
    });
  }
};

// FR AUTH 02: request a time limited password reset link without exposing
// whether a given email address has an account (same response either way).
const forgotPassword = async (req, res) => {
  try {
    const { email } = req.body || {};

    const neutralResponse = {
      message: "If an account exists for this email, a password reset link has been sent.",
    };

    if (!email || !isString(email)) {
      return res.status(400).json({
        message: "An email address is required.",
      });
    }

    const user = await users.findByEmail(email);

    if (user) {
      const token = users.generateToken(users.PASSWORD_RESET_TTL_MS);
      await users.setPasswordResetToken(user._id, token.tokenHash, token.expires);
      await sendPasswordResetEmail(user.email, token.rawToken).catch((error) => {
        console.error(`Unable to send password reset email: ${error.message}`);
      });
    }

    // Always the same response, whether or not the account exists.
    return res.status(200).json(neutralResponse);
  } catch (error) {
    console.error(`Unable to process password reset request: ${error.message}`);
    return res.status(500).json({
      message: "Unable to process password reset request.",
    });
  }
};

// FR AUTH 02: complete a password reset from the token emailed by forgotPassword.
const resetPassword = async (req, res) => {
  try {
    const { token } = req.params;
    const { password } = req.body || {};

    if (!isString(password) || password.length < 8) {
      return res.status(400).json({
        message: "A new password of at least 8 characters is required.",
      });
    }

    if (!isNonEmptyString(token)) {
      return res.status(400).json({
        message: "This password reset link is invalid or has expired.",
      });
    }

    const user = await users.resetPasswordByTokenHash(users.hashToken(token), password);

    if (!user) {
      return res.status(400).json({
        message: "This password reset link is invalid or has expired.",
      });
    }

    return res.status(200).json({
      message: "Password reset successfully. You can now log in with your new password.",
    });
  } catch (error) {
    console.error(`Unable to reset password: ${error.message}`);
    return res.status(500).json({
      message: "Unable to reset password.",
    });
  }
};

// FR-COM-01: a verified user may enable or disable optional email notifications.
const updatePreferences = async (req, res) => {
  try {
    if (typeof (req.body || {}).emailNotifications !== "boolean") {
      return res.status(400).json({
        message: "emailNotifications must be true or false.",
      });
    }

    const updated = await users.setEmailNotifications(req.user._id, req.body.emailNotifications);

    return res.status(200).json({
      message: "Notification preferences updated.",
      user: {
        id: updated._id,
        emailNotifications: updated.emailNotifications,
      },
    });
  } catch (error) {
    console.error(`Unable to update preferences: ${error.message}`);
    return res.status(500).json({
      message: "Unable to update preferences.",
    });
  }
};

module.exports = {
  registerUser,
  updatePreferences,
  verifyEmail,
  loginUser,
  forgotPassword,
  resetPassword,
};
