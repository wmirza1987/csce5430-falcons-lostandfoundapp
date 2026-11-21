const express = require("express");
const {
  addCategory,
  analytics,
  audit,
  categories,
  editCategory,
  updateUserActive,
  updateUserRole,
  users,
} = require("../controllers/adminController");
const { protect } = require("../middleware/authMiddleware");
const { authorizeRoles } = require("../middleware/roleMiddleware");

const router = express.Router();

// All admin routes require an authenticated administrator. Scope the guard to
// the /admin prefix so it does not intercept other routers mounted after this
// one (FR-ADM-02, FR-ADM-03).
router.use("/admin", protect, authorizeRoles("admin"));

router.get("/admin/users", users);
router.patch("/admin/users/:id/role", updateUserRole);
router.patch("/admin/users/:id/active", updateUserActive);

router.get("/admin/categories", categories);
router.post("/admin/categories", addCategory);
router.patch("/admin/categories/:id", editCategory);

router.get("/admin/audit", audit);
router.get("/admin/analytics", analytics);

module.exports = router;
