const { pool } = require("../db");
const { verifyAccessToken } = require("../utils");

async function requireAuth(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).json({ error: "Authorization header required" });
  }

  const token = authHeader.split(" ")[1];
  if (!token) {
    return res.status(401).json({ error: "Bearer token required" });
  }

  try {
    const payload = verifyAccessToken(token);
    const userResult = await pool.query(
      "SELECT id, email, created_at, verified, is_active FROM users WHERE id = $1 AND is_active = true",
      [payload.userId],
    );

    if (userResult.rows.length === 0) {
      return res.status(401).json({ error: "User not found or inactive" });
    }

    const profileResult = await pool.query(
      "SELECT id, username, display_name, bio, avatar_url, banner_url, spec_cpu, spec_gpu, spec_ram, spec_storage, spec_os, specs FROM profiles WHERE user_id = $1",
      [payload.userId],
    );

    req.user = userResult.rows[0];
    req.profile = profileResult.rows[0] || null;
    next();
  } catch (error) {
    console.error("Auth error:", error.message || error);
    return res.status(401).json({ error: "Invalid or expired token" });
  }
}

function requireRole(role) {
  return async function (req, res, next) {
    await requireAuth(req, res, async () => {
      try {
        const result = await pool.query(
          "SELECT role FROM user_roles WHERE user_id = $1 AND role = $2",
          [req.user.id, role],
        );
        if (result.rows.length === 0) {
          return res.status(403).json({ error: "Admin access required" });
        }
        next();
      } catch (error) {
        console.error("Role check error:", error);
        res.status(500).json({ error: "Could not verify role" });
      }
    });
  };
}

module.exports = {
  requireAuth,
  requireRole,
};
