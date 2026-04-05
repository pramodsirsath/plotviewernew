const builderOnly = (req, res, next) => {
  if (req.user.role !== "builder") {
    return res.status(403).json({ message: "Builder access only" });
  }
  next();
};

const builderOrStaff = (req, res, next) => {
  if (req.user.role !== "builder" && req.user.role !== "staff") {
    return res.status(403).json({ message: "Builder or staff access only" });
  }

  // Staff must be approved
  if (req.user.role === "staff" && !req.user.isApproved) {
    return res.status(403).json({ message: "Staff account pending approval" });
  }

  next();
};

module.exports = { builderOnly, builderOrStaff };
