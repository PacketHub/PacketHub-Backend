const express = require("express");
const { pool } = require("../db");
const { requireRole } = require("../middleware/auth");

const router = express.Router();

router.get("/profiles", requireRole("admin"), async (req, res) => {
  try {
    const result = await pool.query(
      "SELECT user_id, username, display_name, avatar_url, created_at FROM profiles ORDER BY created_at DESC",
    );
    res.json(result.rows);
  } catch (error) {
    console.error("Admin profiles error:", error);
    res.status(500).json({ error: "Could not fetch profiles" });
  }
});

router.get("/auth-users", requireRole("admin"), async (req, res) => {
  try {
    const result = await pool.query(
      "SELECT id, email, created_at, verified, is_active FROM users ORDER BY created_at DESC",
    );
    res.json(result.rows);
  } catch (error) {
    console.error("Admin auth-users error:", error);
    res.status(500).json({ error: "Could not fetch auth users" });
  }
});

router.get("/user-roles", requireRole("admin"), async (req, res) => {
  try {
    const result = await pool.query(
      "SELECT user_id, role FROM user_roles ORDER BY user_id",
    );
    res.json(result.rows);
  } catch (error) {
    console.error("Admin user-roles error:", error);
    res.status(500).json({ error: "Could not fetch roles" });
  }
});

router.post("/user-roles", requireRole("admin"), async (req, res) => {
  const { user_id, role } = req.body;
  if (!user_id || !role) {
    return res.status(400).json({ error: "user_id and role are required" });
  }

  try {
    await pool.query(
      "INSERT INTO user_roles (user_id, role) VALUES ($1, $2) ON CONFLICT (user_id, role) DO NOTHING",
      [user_id, role],
    );
    await pool.query(
      "INSERT INTO role_audit_log (target_user_id, actor_user_id, role, action) VALUES ($1, $2, $3, $4)",
      [user_id, req.user.id, role, "granted"],
    );
    res.json({ success: true });
  } catch (error) {
    console.error("Admin grant role error:", error);
    res.status(500).json({ error: "Could not grant role" });
  }
});

router.delete("/user-roles", requireRole("admin"), async (req, res) => {
  const { user_id, role } = req.body;
  if (!user_id || !role) {
    return res.status(400).json({ error: "user_id and role are required" });
  }

  try {
    await pool.query(
      "DELETE FROM user_roles WHERE user_id = $1 AND role = $2",
      [user_id, role],
    );
    await pool.query(
      "INSERT INTO role_audit_log (target_user_id, actor_user_id, role, action) VALUES ($1, $2, $3, $4)",
      [user_id, req.user.id, role, "revoked"],
    );
    res.json({ success: true });
  } catch (error) {
    console.error("Admin revoke role error:", error);
    res.status(500).json({ error: "Could not revoke role" });
  }
});

router.post("/users/delete", requireRole("admin"), async (req, res) => {
  const { user_id, username } = req.body;
  if (!user_id && !username) {
    return res.status(400).json({ error: "user_id or username is required" });
  }

  try {
    let targetId = user_id;
    if (!targetId) {
      const userResult = await pool.query(
        "SELECT u.id FROM users u INNER JOIN profiles p ON p.user_id = u.id WHERE p.username = $1",
        [username],
      );
      if (userResult.rows.length === 0) {
        return res.status(404).json({ error: "User not found" });
      }
      targetId = userResult.rows[0].id;
    }

    await pool.query("DELETE FROM users WHERE id = $1", [targetId]);
    res.json({ success: true });
  } catch (error) {
    console.error("Admin delete user error:", error);
    res.status(500).json({ error: "Could not delete user" });
  }
});

router.get("/role-audit-log", requireRole("admin"), async (req, res) => {
  try {
    const result = await pool.query(
      "SELECT id, action, role, target_user_id, actor_user_id, created_at FROM role_audit_log ORDER BY created_at DESC",
    );
    res.json(result.rows);
  } catch (error) {
    console.error("Admin audit log error:", error);
    res.status(500).json({ error: "Could not fetch role audit log" });
  }
});

module.exports = router;

export {}
