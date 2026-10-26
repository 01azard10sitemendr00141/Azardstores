const jwt = require("jsonwebtoken");
const User = require("../models/User");

const AUTH_COOKIE = "azardstores_session";

function readCookie(req, name) {
  const header = String(req.headers.cookie || "");
  const pair = header.split(";").map((value) => value.trim()).find((value) => value.startsWith(`${name}=`));
  if (!pair) return "";
  try { return decodeURIComponent(pair.slice(name.length + 1)); }
  catch { return ""; }
}

function getAuthToken(req) {
  const authHeader = req.headers.authorization || "";
  if (authHeader.startsWith("Bearer ")) return authHeader.slice(7).trim();
  return readCookie(req, AUTH_COOKIE);
}

function setAuthCookie(res, token) {
  res.cookie(AUTH_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 7 * 24 * 60 * 60 * 1000,
    path: "/",
  });
}

function clearAuthCookie(res) {
  res.clearCookie(AUTH_COOKIE, { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/" });
}

// Verifies the JWT and attaches the user to req.user
async function protect(req, res, next) {
  try {
    const token = getAuthToken(req);

    if (!token) {
      return res.status(401).json({ message: "Not authorized, no token provided" });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const user = await User.findById(decoded.id).select("+tokenVersion");

    if (!user) {
      return res.status(401).json({ message: "User no longer exists" });
    }
    if (Number(decoded.tokenVersion || 0) !== Number(user.tokenVersion || 0)) {
      return res.status(401).json({ message: "Your session has ended. Please sign in again." });
    }

    req.user = user;
    next();
  } catch (err) {
    return res.status(401).json({ message: "Not authorized, invalid or expired token" });
  }
}

// Restricts a route to specific roles, e.g. requireRole("admin")
function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return res.status(403).json({ message: "You do not have permission to perform this action" });
    }
    next();
  };
}

// Like protect, but doesn't fail if there's no token - used for guest checkout
async function optionalAuth(req, res, next) {
  try {
    const token = getAuthToken(req);

    if (!token) return next();

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const user = await User.findById(decoded.id).select("+tokenVersion");
    if (user && Number(decoded.tokenVersion || 0) === Number(user.tokenVersion || 0)) req.user = user;
    next();
  } catch (err) {
    next(); // invalid/expired token - just treat as guest
  }
}

module.exports = { AUTH_COOKIE, protect, requireRole, optionalAuth, setAuthCookie, clearAuthCookie, getAuthToken };
