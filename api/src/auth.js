import jwt from "jsonwebtoken";
import { config } from "./config.js";

export function signToken({ sub, role }) {
  return jwt.sign({ sub, role }, config.jwtSecret, { expiresIn: "8h" });
}

export function requireAuth(req, res, next) {
  const header = req.header("authorization") || "";
  const token = header.startsWith("Bearer ") ? header.slice("Bearer ".length) : null;
  const queryToken = !token && req.query?.token ? String(req.query.token) : null;
  const effectiveToken = token || queryToken;

  if (!effectiveToken) return res.status(401).json({ error: "missing_bearer_token" });

  try {
    req.user = jwt.verify(effectiveToken, config.jwtSecret);
    return next();
  } catch {
    return res.status(401).json({ error: "invalid_token" });
  }
}

export function requireRole(roles) {
  const allow = new Set(Array.isArray(roles) ? roles : [roles]);
  return (req, res, next) => {
    if (!req.user?.role || !allow.has(req.user.role)) return res.status(403).json({ error: "forbidden" });
    return next();
  };
}
