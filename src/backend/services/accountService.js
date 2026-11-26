// NFR-PRIV-02: an account deletion request disables access immediately and
// de-identifies the profile at once (well inside the 30 day limit). The user row
// stays so that records other people still depend on (for example an approved
// claim thread) keep their references, but nothing about the person remains.
const crypto = require("crypto");
const bcrypt = require("bcrypt");
const { withTransaction } = require("../db/pool");
const usersRepo = require("../repos/users");
const { ACTIONS, recordAudit } = require("./auditService");

class AccountError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

async function deleteAccount(user, password) {
  if (typeof password !== "string" || password.length === 0) {
    throw new AccountError(400, "Enter your password to confirm account deletion.");
  }

  const withHash = await usersRepo.findForLogin(user.email);

  if (!withHash || !(await usersRepo.comparePassword(withHash, password))) {
    throw new AccountError(401, "The password is incorrect.");
  }

  if (user.role === "admin") {
    throw new AccountError(409, "Administrator accounts cannot be deleted here.");
  }

  // Unusable random password hash and a placeholder address on a reserved domain.
  const unusableHash = await bcrypt.hash(crypto.randomBytes(32).toString("hex"), 10);
  const placeholderEmail = `deleted-${String(user._id).toLowerCase()}@deleted.invalid`;

  await withTransaction(async (tx) => {
    await tx.query(
      `UPDATE dbo.Listings SET isDeleted = 1, updatedAt = SYSUTCDATETIME()
       WHERE createdBy = @id AND status = 'active' AND isDeleted = 0`,
      { id: user._id }
    );
    await tx.query(
      `UPDATE dbo.Claims SET status = 'closed', updatedAt = SYSUTCDATETIME()
       WHERE claimant = @id AND status = 'pending'`,
      { id: user._id }
    );
    await tx.query("DELETE FROM dbo.Notifications WHERE userId = @id", { id: user._id });
    await tx.query(
      `UPDATE dbo.Users SET
         firstName = 'Deleted', lastName = 'User', email = @email, passwordHash = @hash,
         isActive = 0, emailNotifications = 0,
         emailVerificationTokenHash = NULL, emailVerificationExpires = NULL,
         passwordResetTokenHash = NULL, passwordResetExpires = NULL,
         updatedAt = SYSUTCDATETIME()
       WHERE id = @id`,
      { id: user._id, email: placeholderEmail, hash: unusableHash }
    );
    await recordAudit(
      { actor: user._id, action: ACTIONS.ACCOUNT_DELETED, targetType: "user", targetId: user._id },
      tx
    );
  });
}

module.exports = { AccountError, deleteAccount };
