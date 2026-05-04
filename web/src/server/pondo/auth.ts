import jwt from "jsonwebtoken";
import { NextRequest } from "next/server";

const authUsers = new Map(
  [
    { username: "customer@example.com", password: "demo", role: "customer" },
    { username: "thabo@email.com", password: "demo", role: "customer" },
    { username: "naledi@email.com", password: "demo", role: "customer" },
    { username: "sipho@email.com", password: "demo", role: "customer" },
    { username: "mandla@email.com", password: "demo", role: "customer" },
    { username: "amara@email.com", password: "demo", role: "customer" },
    { username: "gogo@email.com", password: "demo", role: "customer" },
    { username: "sponsor@example.com", password: "demo", role: "sponsor" },
  ].map((user) => [user.username, user]),
);

function secret() {
  return process.env.JWT_SECRET || "dev-secret-change-me";
}

export function normalizeUsername(value: string) {
  return String(value || "").trim().toLowerCase();
}

export function authenticateUser(username: string, password: string, requestedRole: "customer" | "sponsor") {
  const normalized = normalizeUsername(username);
  const account = authUsers.get(normalized);
  if (!account || account.password !== String(password)) return null;
  if (requestedRole === "sponsor" && account.role !== "sponsor") return { forbidden: true as const };
  const role = requestedRole === "sponsor" ? "sponsor" : "customer";
  const token = jwt.sign({ sub: normalized, role }, secret(), { expiresIn: "12h" });
  return { token, role };
}

export function requireUser(req: NextRequest, roles?: Array<"customer" | "sponsor">) {
  const header = req.headers.get("authorization") || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : "";
  if (!token) return { error: "missing_auth" as const };

  try {
    const decoded = jwt.verify(token, secret()) as { sub: string; role: "customer" | "sponsor" };
    if (roles && !roles.includes(decoded.role)) return { error: "forbidden" as const };
    return { user: decoded };
  } catch {
    return { error: "invalid_auth" as const };
  }
}
