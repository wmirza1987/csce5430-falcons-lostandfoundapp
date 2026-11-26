// FR-ADM-02: administrator-only account management, category catalog
// management, and non-content audit retrieval. Every change writes an audit
// record with IDs and a short reason only (NFR-PRIV-01).
const auditLogsRepo = require("../repos/auditLogs");
const categoriesRepo = require("../repos/categories");
const usersRepo = require("../repos/users");
const { isGuid } = require("./validation");
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
  const users = await usersRepo.list({ limit: 200 });
  return users.map(publicUser);
}

// Only "user" and "moderator" are assignable. The admin role cannot be
// granted or removed through this endpoint, preventing privilege escalation
// and accidental loss of the last administrator.
async function changeRole({ admin, userId, role }) {
  if (!ASSIGNABLE_ROLES.includes(role)) {
    throw new AdminError(400, "Role must be user or moderator.");
  }

  const user = await usersRepo.findById(userId);

  if (!user) {
    throw new AdminError(404, "User not found.");
  }

  if (user.role === "admin") {
    throw new AdminError(409, "Administrator accounts cannot be changed here.");
  }

  const previous = user.role;
  const updated = await usersRepo.setRole(user._id, role);

  await recordAudit({
    actor: admin._id,
    action: ACTIONS.ROLE_CHANGED,
    targetType: "user",
    targetId: user._id,
    detail: `${previous} to ${role}`,
  });

  return publicUser(updated);
}

async function setAccountActive({ admin, userId, isActive }) {
  if (typeof isActive !== "boolean") {
    throw new AdminError(400, "isActive must be true or false.");
  }

  const user = await usersRepo.findById(userId);

  if (!user) {
    throw new AdminError(404, "User not found.");
  }

  if (user.role === "admin") {
    throw new AdminError(409, "Administrator accounts cannot be changed here.");
  }

  const updated = await usersRepo.setActive(user._id, Boolean(isActive));

  await recordAudit({
    actor: admin._id,
    action: ACTIONS.ACCOUNT_DEACTIVATED,
    targetType: "user",
    targetId: user._id,
    detail: `active ${Boolean(isActive)}`,
  });

  return publicUser(updated);
}

async function listCategories({ includeInactive = false } = {}) {
  const categories = await categoriesRepo.list({ includeInactive });
  return categories.map(publicCategory);
}

async function createCategory({ admin, name, description }) {
  const cleanName = typeof name === "string" ? name.trim().toLowerCase() : "";
  const cleanDescription = typeof description === "string" ? description.trim().slice(0, 300) : "";

  if (cleanName.length < 2 || cleanName.length > 60) {
    throw new AdminError(400, "Category name must be between 2 and 60 characters.");
  }

  const existing = await categoriesRepo.findByName(cleanName);

  if (existing) {
    if (!existing.isActive) {
      const reactivated = await categoriesRepo.update(existing._id, {
        isActive: true,
        description: cleanDescription,
      });

      await recordAudit({
        actor: admin._id,
        action: ACTIONS.CATEGORY_UPDATED,
        targetType: "category",
        targetId: existing._id,
        detail: `reactivated ${cleanName}`,
      });

      return publicCategory(reactivated);
    }

    throw new AdminError(409, "That category already exists.");
  }

  const category = await categoriesRepo.create({
    name: cleanName,
    description: cleanDescription,
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
  if (!isGuid(categoryId)) {
    throw new AdminError(400, "Invalid id.");
  }

  const category = await categoriesRepo.findById(categoryId);

  if (!category) {
    throw new AdminError(404, "Category not found.");
  }

  const changes = {};

  if (name !== undefined) {
    const cleanName = typeof name === "string" ? name.trim().toLowerCase() : "";

    if (cleanName.length < 2 || cleanName.length > 60) {
      throw new AdminError(400, "Category name must be between 2 and 60 characters.");
    }

    changes.name = cleanName;
  }

  if (description !== undefined) {
    if (typeof description !== "string") {
      throw new AdminError(400, "Description must be text.");
    }

    changes.description = description.trim().slice(0, 300);
  }

  if (isActive !== undefined) {
    if (typeof isActive !== "boolean") {
      throw new AdminError(400, "isActive must be true or false.");
    }

    changes.isActive = isActive;
  }

  const updated = await categoriesRepo.update(category._id, changes);

  await recordAudit({
    actor: admin._id,
    action: isActive === false ? ACTIONS.CATEGORY_DEACTIVATED : ACTIONS.CATEGORY_UPDATED,
    targetType: "category",
    targetId: updated._id,
    detail: String(updated.name),
  });

  return publicCategory(updated);
}

async function listAuditLogs({ limit = 100, action, actor } = {}) {
  if (
    (action !== undefined && typeof action !== "string") ||
    (actor !== undefined && typeof actor !== "string")
  ) {
    throw new AdminError(400, "Audit filters must be single text values.");
  }

  if (actor && !isGuid(actor)) {
    throw new AdminError(400, "Invalid id.");
  }

  const safeLimit = Math.min(
    Math.max(parseInt(typeof limit === "string" ? limit : "100", 10) || 100, 1),
    200
  );

  const logs = await auditLogsRepo.list({
    action: action ? action.slice(0, 80) : undefined,
    actor: actor || undefined,
    limit: safeLimit,
  });

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
