const {
  AdminError,
  changeRole,
  createCategory,
  listAuditLogs,
  listCategories,
  listUsers,
  setAccountActive,
  updateCategory,
} = require("../services/adminService");
const { getDashboardAnalytics } = require("../services/analyticsService");

function handleError(res, error, context) {
  if (error instanceof AdminError) {
    return res.status(error.status).json({ message: error.message });
  }

  if (error?.code === 11000) {
    return res.status(409).json({ message: "That category already exists." });
  }

  if (error.name === "CastError") {
    return res.status(400).json({ message: "Invalid id." });
  }

  if (error.name === "ValidationError") {
    return res.status(400).json({ message: error.message });
  }

  console.error(`${context}: ${error.message}`);
  return res.status(500).json({ message: "Unable to complete the request." });
}

async function users(req, res) {
  try {
    return res.status(200).json({ users: await listUsers() });
  } catch (error) {
    return handleError(res, error, "Unable to list users");
  }
}

async function updateUserRole(req, res) {
  try {
    const user = await changeRole({
      admin: req.user,
      userId: req.params.id,
      role: req.body.role,
    });
    return res.status(200).json({ message: "Role updated.", user });
  } catch (error) {
    return handleError(res, error, "Unable to change role");
  }
}

async function updateUserActive(req, res) {
  try {
    const user = await setAccountActive({
      admin: req.user,
      userId: req.params.id,
      isActive: req.body.isActive,
    });
    return res.status(200).json({ message: "Account updated.", user });
  } catch (error) {
    return handleError(res, error, "Unable to update account");
  }
}

async function categories(req, res) {
  try {
    const categories = await listCategories({ includeInactive: req.query.includeInactive === "true" });
    return res.status(200).json({ categories });
  } catch (error) {
    return handleError(res, error, "Unable to list categories");
  }
}

async function addCategory(req, res) {
  try {
    const category = await createCategory({
      admin: req.user,
      name: req.body.name,
      description: req.body.description,
    });
    return res.status(201).json({ message: "Category created.", category });
  } catch (error) {
    return handleError(res, error, "Unable to create category");
  }
}

async function editCategory(req, res) {
  try {
    const category = await updateCategory({
      admin: req.user,
      categoryId: req.params.id,
      name: req.body.name,
      description: req.body.description,
      isActive: req.body.isActive,
    });
    return res.status(200).json({ message: "Category updated.", category });
  } catch (error) {
    return handleError(res, error, "Unable to update category");
  }
}

async function audit(req, res) {
  try {
    const logs = await listAuditLogs({
      limit: req.query.limit,
      action: req.query.action,
      actor: req.query.actor,
    });
    return res.status(200).json({ auditLogs: logs });
  } catch (error) {
    return handleError(res, error, "Unable to retrieve audit log");
  }
}

async function analytics(req, res) {
  try {
    return res.status(200).json({ analytics: await getDashboardAnalytics() });
  } catch (error) {
    return handleError(res, error, "Unable to build analytics");
  }
}

module.exports = {
  addCategory,
  analytics,
  audit,
  categories,
  editCategory,
  updateUserActive,
  updateUserRole,
  users,
};
