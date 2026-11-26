const bcrypt = require("bcrypt");
const crypto = require("crypto");
const { query } = require("../db/pool");
const { idOf, lowerId, runner } = require("./util");

const BCRYPT_COST = 10;

// Public columns only. passwordHash and the token hash columns are never part
// of this list; see findForLogin and the token functions below.
const PUBLIC_COLUMNS = [
  "id",
  "firstName",
  "lastName",
  "email",
  "role",
  "isEmailVerified",
  "isActive",
  "emailNotifications",
  "createdAt",
  "updatedAt",
];

const SELECT = PUBLIC_COLUMNS.map((column) => `u.${column}`).join(", ");
const OUTPUT = PUBLIC_COLUMNS.map((column) => `inserted.${column}`).join(", ");

function normalizeEmail(email) {
  return String(email).trim().toLowerCase();
}

function mapUser(row) {
  if (!row) {
    return null;
  }

  const id = lowerId(row.id);

  return {
    _id: id,
    id,
    firstName: row.firstName,
    lastName: row.lastName,
    email: row.email,
    role: row.role,
    isEmailVerified: Boolean(row.isEmailVerified),
    isActive: Boolean(row.isActive),
    emailNotifications: Boolean(row.emailNotifications),
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function hashToken(rawToken) {
  return crypto.createHash("sha256").update(String(rawToken)).digest("hex");
}

// A one time token: the raw value is emailed, only its SHA-256 hash is stored.
function generateToken(ttlMs) {
  const rawToken = crypto.randomBytes(32).toString("hex");

  return {
    rawToken,
    tokenHash: hashToken(rawToken),
    expires: new Date(Date.now() + ttlMs),
  };
}

const EMAIL_VERIFICATION_TTL_MS = 24 * 60 * 60 * 1000;
const PASSWORD_RESET_TTL_MS = 60 * 60 * 1000;

async function hashPassword(password) {
  return bcrypt.hash(String(password), BCRYPT_COST);
}

async function findById(id, tx) {
  const rows = await runner(tx)(`SELECT ${SELECT} FROM dbo.Users u WHERE u.id = @id`, {
    id: idOf(id),
  });
  return mapUser(rows[0]);
}

async function findByEmail(email, tx) {
  const rows = await runner(tx)(`SELECT ${SELECT} FROM dbo.Users u WHERE u.email = @email`, {
    email: normalizeEmail(email),
  });
  return mapUser(rows[0]);
}

// Login is the only caller allowed to see the password hash. The returned
// object is the public user plus a `password` field holding the bcrypt hash.
async function findForLogin(email) {
  const rows = await query(
    `SELECT ${SELECT}, u.passwordHash FROM dbo.Users u WHERE u.email = @email`,
    { email: normalizeEmail(email) }
  );

  if (!rows[0]) {
    return null;
  }

  return { ...mapUser(rows[0]), password: rows[0].passwordHash };
}

async function comparePassword(user, enteredPassword) {
  return bcrypt.compare(String(enteredPassword), user.password);
}

// Creates a user. The plain password is hashed here (bcrypt cost 10). Token
// hashes, when given, are stored; raw tokens never reach this layer.
async function create(input, tx) {
  const passwordHash = await hashPassword(input.password);
  const rows = await runner(tx)(
    `INSERT INTO dbo.Users
       (firstName, lastName, email, passwordHash, role, isEmailVerified, emailNotifications,
        emailVerificationTokenHash, emailVerificationExpires)
     OUTPUT ${OUTPUT}
     VALUES (@firstName, @lastName, @email, @passwordHash, @role, @isEmailVerified,
        @emailNotifications, @tokenHash, @tokenExpires)`,
    {
      firstName: String(input.firstName).trim(),
      lastName: String(input.lastName).trim(),
      email: normalizeEmail(input.email),
      passwordHash,
      role: input.role || "user",
      isEmailVerified: Boolean(input.isEmailVerified),
      emailNotifications: input.emailNotifications === undefined ? true : Boolean(input.emailNotifications),
      tokenHash: input.emailVerificationTokenHash || null,
      tokenExpires: input.emailVerificationExpires || null,
    }
  );

  return mapUser(rows[0]);
}

async function list({ limit = 200 } = {}) {
  const rows = await query(
    `SELECT TOP (@limit) ${SELECT} FROM dbo.Users u ORDER BY u.createdAt DESC`,
    { limit: Math.min(Math.max(Number(limit) || 200, 1), 500) }
  );
  return rows.map(mapUser);
}

async function listActiveStaff() {
  const rows = await query(
    `SELECT ${SELECT} FROM dbo.Users u WHERE u.role IN ('moderator', 'admin') AND u.isActive = 1`
  );
  return rows.map(mapUser);
}

async function setRole(id, role) {
  const rows = await query(
    `UPDATE dbo.Users SET role = @role, updatedAt = SYSUTCDATETIME()
     OUTPUT ${OUTPUT} WHERE id = @id`,
    { id: idOf(id), role }
  );
  return mapUser(rows[0]);
}

async function setActive(id, isActive) {
  const rows = await query(
    `UPDATE dbo.Users SET isActive = @isActive, updatedAt = SYSUTCDATETIME()
     OUTPUT ${OUTPUT} WHERE id = @id`,
    { id: idOf(id), isActive: Boolean(isActive) }
  );
  return mapUser(rows[0]);
}

async function setEmailNotifications(id, enabled) {
  const rows = await query(
    `UPDATE dbo.Users SET emailNotifications = @enabled, updatedAt = SYSUTCDATETIME()
     OUTPUT ${OUTPUT} WHERE id = @id`,
    { id: idOf(id), enabled: Boolean(enabled) }
  );
  return mapUser(rows[0]);
}

async function setEmailVerificationToken(id, tokenHash, expires) {
  await query(
    `UPDATE dbo.Users SET emailVerificationTokenHash = @tokenHash,
       emailVerificationExpires = @expires, updatedAt = SYSUTCDATETIME() WHERE id = @id`,
    { id: idOf(id), tokenHash, expires }
  );
}

async function setPasswordResetToken(id, tokenHash, expires) {
  await query(
    `UPDATE dbo.Users SET passwordResetTokenHash = @tokenHash,
       passwordResetExpires = @expires, updatedAt = SYSUTCDATETIME() WHERE id = @id`,
    { id: idOf(id), tokenHash, expires }
  );
}

// Single-use: the token columns are cleared by the same statement that
// verifies the address, so a token cannot be replayed.
async function verifyEmailByTokenHash(tokenHash) {
  const rows = await query(
    `UPDATE dbo.Users SET isEmailVerified = 1, emailVerificationTokenHash = NULL,
       emailVerificationExpires = NULL, updatedAt = SYSUTCDATETIME()
     OUTPUT ${OUTPUT}
     WHERE emailVerificationTokenHash = @tokenHash AND emailVerificationExpires > @now`,
    { tokenHash, now: new Date() }
  );
  return mapUser(rows[0]);
}

async function resetPasswordByTokenHash(tokenHash, newPassword) {
  const candidates = await query(
    `SELECT id FROM dbo.Users WHERE passwordResetTokenHash = @tokenHash AND passwordResetExpires > @now`,
    { tokenHash, now: new Date() }
  );

  if (!candidates[0]) {
    return null;
  }

  const passwordHash = await hashPassword(newPassword);
  const rows = await query(
    `UPDATE dbo.Users SET passwordHash = @passwordHash, passwordResetTokenHash = NULL,
       passwordResetExpires = NULL, updatedAt = SYSUTCDATETIME()
     OUTPUT ${OUTPUT}
     WHERE passwordResetTokenHash = @tokenHash AND passwordResetExpires > @now`,
    { passwordHash, tokenHash, now: new Date() }
  );
  return mapUser(rows[0]);
}

module.exports = {
  EMAIL_VERIFICATION_TTL_MS,
  PASSWORD_RESET_TTL_MS,
  comparePassword,
  create,
  findByEmail,
  findById,
  findForLogin,
  generateToken,
  hashToken,
  list,
  listActiveStaff,
  normalizeEmail,
  resetPasswordByTokenHash,
  setActive,
  setEmailNotifications,
  setEmailVerificationToken,
  setPasswordResetToken,
  setRole,
  verifyEmailByTokenHash,
};
