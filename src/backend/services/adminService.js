// FR-ADM-02: administrator-only account management, category catalog
// management, and non-content audit retrieval. Every change writes an audit
// record with IDs and a short reason only (NFR-PRIV-01).
const AuditLog = require("../models/AuditLog");
const Category = require("../models/Category");
const User = require("../models/User");
const { ACTIONS, recordAudit } = require("./auditService");

class AdminError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

const ASSIGNABLE_ROLES = ["user", "moderator"];

function publicUser(user) {
  return {
    id: user._id,
    firstName: user.firstName,
    lastName: user.lastName,
    email: user.email,
    role: user.role,
    isActive: user.isActive,
    createdAt: user.createdAt,
  };
}

function publicCategory(category) {
  return {
    id: category._id,
    name: category.name,
    description: category.description,
    isActive: category.isActive,
    createdAt: category.createdAt,
    updatedAt: category.updatedAt,
  };
}

async function listUsers() {
  const users = await User.find({ role: { $in: ["user", "moderator", "admin"] } })
    .sort({ createdAt: -1 })
    .limit(200);
  return users.map(publicUser);
}

// Only "user" and "moderator" are assignable. The admin role cannot be
// granted or removed through this endpoint, preventing privilege escalation
// and accidental loss of the last administrator.
async function changeRole({ admin, userId, role }) {
  if (!ASSIGNABLE_ROLES.includes(role)) {
    throw new AdminError(400, "Role must be user or moderator.");
  }

  const user = await User.findById(userId);

  if (!user) {
    throw new AdminError(404, "User not found.");
  }

  if (user.role === "admin") {
    throw new AdminError(409, "Administrator accounts cannot be changed here.");
  }

  const previous = user.role;
  user.role = role;
  await user.save();

  await recordAudit({
    actor: admin._id,
    action: ACTIONS.ROLE_CHANGED,
    targetType: "user",
    targetId: user._id,
    detail: `${previous} to ${role}`,
  });

  return publicUser(user);
}

async function setAccountActive({ admin, userId, isActive }) {
  const user = await User.findById(userId);

  if (!user) {
    throw new AdminError(404, "User not found.");
  }

  if (user.role === "admin") {
    throw new AdminError(409, "Administrator accounts cannot be changed here.");
  }

  user.isActive = Boolean(isActive);
  await user.save();

  await recordAudit({
    actor: admin._id,
    action: ACTIONS.ACCOUNT_DEACTIVATED,
    targetType: "user",
    targetId: user._id,
    detail: `active ${Boolean(isActive)}`,
  });

  return publicUser(user);
}

async function listCategories({ includeInactive = false } = {}) {
  const query = includeInactive ? {} : { isActive: true };
  const categories = await Category.find(query).sort({ name: 1 });
  return categories.map(publicCategory);
}

async function createCategory({ admin, name, description }) {
  const cleanName = String(name || "").trim().toLowerCase();

  if (cleanName.length < 2 || cleanName.length > 60) {
    throw new AdminError(400, "Category name must be between 2 and 60 characters.");
  }

  const existing = await Category.findOne({ name: cleanName });

  if (existing) {
    if (!existing.isActive) {
      existing.isActive = true;
      existing.description = String(description || "").trim().slice(0, 300);
      await existing.save();

      await recordAudit({
        actor: admin._id,
        action: ACTIONS.CATEGORY_UPDATED,
        targetType: "category",
        targetId: existing._id,
        detail: `reactivated ${cleanName}`,
      });

      return publicCategory(existing);
    }

    throw new AdminError(409, "That category already exists.");
  }

  const category = await Category.create({
    name: cleanName,
    description: String(description || "").trim().slice(0, 300),
    createdBy: admin._id,
  });

  await recordAudit({
    actor: admin._id,
    action: ACTIONS.CATEGORY_CREATED,
    targetType: "category",
    targetId: category._id,
    detail: cleanName,
  });

  return publicCategory(category);
}

async function updateCategory({ admin, categoryId, name, description, isActive }) {
  const category = await Category.findById(categoryId);

  if (!category) {
    throw new AdminError(404, "Category not found.");
  }

  if (name !== undefined) {
    const cleanName = String(name).trim().toLowerCase();

    if (cleanName.length < 2 || cleanName.length > 60) {
      throw new AdminError(400, "Category name must be between 2 and 60 characters.");
    }

    category.name = cleanName;
  }

  if (description !== undefined) {
    category.description = String(description).trim().slice(0, 300);
  }

  if (isActive !== undefined) {
    category.isActive = Boolean(isActive);
  }

  await category.save();

  await recordAudit({
    actor: admin._id,
    action: isActive === false ? ACTIONS.CATEGORY_DEACTIVATED : ACTIONS.CATEGORY_UPDATED,
    targetType: "category",
    targetId: category._id,
    detail: String(category.name),
  });

  return publicCategory(category);
}

async function listAuditLogs({ limit = 100, action, actor } = {}) {
  const query = {};

  if (action) query.action = String(action).slice(0, 80);
  if (actor) query.actor = actor;

  const safeLimit = Math.min(Math.max(parseInt(limit, 10) || 100, 1), 200);

  const logs = await AuditLog.find(query)
    .sort({ createdAt: -1 })
    .limit(safeLimit)
    .populate("actor", "firstName lastName role")
    .lean();

  // Only non-content fields are returned. The detail field is sanitized on
  // write and holds IDs/action names, never message text or evidence.
  return logs.map((log) => ({
    id: log._id,
    actor: log.actor ? { id: log.actor._id, name: `${log.actor.firstName} ${log.actor.lastName}`, role: log.actor.role } : null,
    action: log.action,
    targetType: log.targetType,
    targetId: log.targetId,
    detail: log.detail,
    createdAt: log.createdAt,
  }));
}

module.exports = {
  AdminError,
  changeRole,
  createCategory,
  listAuditLogs,
  listCategories,
  listUsers,
  setAccountActive,
  updateCategory,
};
