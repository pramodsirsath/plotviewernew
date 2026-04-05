import { Navigate } from "react-router-dom";

const RoleRoute = ({ children, allowedRole, allowedRoles }) => {
  const token = localStorage.getItem("token");
  const role = localStorage.getItem("role");

  if (!token) {
    return <Navigate to="/login" />;
  }

  // Support both single role and array of roles
  const roles = allowedRoles || (allowedRole ? [allowedRole] : []);

  // Staff can access builder routes
  if (roles.includes("builder") && role === "staff") {
    return children;
  }

  if (roles.length > 0 && !roles.includes(role)) {
    return <Navigate to="/login" />;
  }

  return children;
};

export default RoleRoute;