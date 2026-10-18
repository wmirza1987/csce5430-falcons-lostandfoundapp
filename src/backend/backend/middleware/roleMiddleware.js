// Restricts a route to the given list of roles (e.g. authorizeRoles("admin")).
// Must run after the `protect` middleware, which sets req.user.
const authorizeRoles = (...allowedRoles) => {
  return (req, res, next) => {
    if (!req.user || !allowedRoles.includes(req.user.role)) {
      return res.status(403).json({
        message: "You do not have permission to access this resource.",
      });
    }

    next();
  };
};

module.exports = {
  authorizeRoles,
};
