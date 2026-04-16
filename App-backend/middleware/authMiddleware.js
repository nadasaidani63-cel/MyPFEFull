import jwt from "jsonwebtoken";
import User from "../models/User.js";
import { normalizeRole } from "../utils/roles.js";

export const protect = async (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith("Bearer ")) {
    return res.status(401).json({ success: false, message: "Not authorized, no token" });
  }

  try {
    const token = authHeader.split(" ")[1];
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = await User.findById(decoded.id);
    if (!req.user) return res.status(401).json({ success: false, message: "User not found" });
    req.user.role = normalizeRole(req.user.role);
    next();
  } catch (error) {
    return res.status(401).json({ success: false, message: "Token invalid or expired" });
  }
};

export const authorize = (...roles) => {
  return (req, res, next) => {
    const normalized = normalizeRole(req.user.role);
    if (!roles.includes(normalized)) {
      return res.status(403).json({
        success: false,
        message: `Role '${normalized}' is not authorized for this action`,
      });
    }
    next();
  };
};
