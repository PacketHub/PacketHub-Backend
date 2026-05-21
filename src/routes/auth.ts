const express = require("express");
const { pool } = require("../db");
const {
  hashPassword,
  comparePassword,
  generateAccessToken,
  generateRandomToken,
  getRefreshTokenExpiry,
} = require("../utils");
const { requireAuth } = require("../middleware/auth");

const router = express.Router();

function validateSignup(data) {
  const missing = ["email", "password", "username"].filter(
    (field) => !data[field] || String(data[field]).trim() === "",
  );
  return missing.length
    ? `Missing required field(s): ${missing.join(", ")}`
    : null;
}

router.post("/signup", async (req, res) => {
  const error = validateSignup(req.body);
  if (error) {
    return res.status(400).json({ error });
  }

  const { email, password, username, display_name } = req.body;
  const normalizedEmail = String(email).trim().toLowerCase();

  try {
    const existingUser = await pool.query(
      "SELECT id FROM users WHERE email = $1",
      [normalizedEmail],
    );
    if (existingUser.rows.length > 0) {
      return res.status(400).json({ error: "Email already in use" });
    }

    const existingProfile = await pool.query(
      "SELECT id FROM profiles WHERE username = $1",
      [username.trim()],
    );
    if (existingProfile.rows.length > 0) {
      return res.status(400).json({ error: "Username already in use" });
    }

    const passwordHash = await hashPassword(password);
    const client = await pool.connect();

    try {
      await client.query("BEGIN");
      const userResult = await client.query(
        "INSERT INTO users (email, password_hash) VALUES ($1, $2) RETURNING id, email, created_at",
        [normalizedEmail, passwordHash],
      );

      const user = userResult.rows[0];
      const profileResult = await client.query(
        "INSERT INTO profiles (user_id, username, display_name) VALUES ($1, $2, $3) RETURNING username, display_name",
        [user.id, username.trim(), display_name || null],
      );

      await client.query("COMMIT");
      res.status(201).json({ user, profile: profileResult.rows[0] });
    } catch (innerError) {
      await client.query("ROLLBACK");
      throw innerError;
    } finally {
      client.release();
    }
  } catch (error) {
    console.error("Signup error:", error);
    res.status(500).json({ error: "Could not create user" });
  }
});

router.post("/login", async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) {
    return res.status(400).json({ error: "Email and password are required" });
  }

  try {
    const userResult = await pool.query(
      "SELECT id, email, password_hash FROM users WHERE email = $1 AND is_active = true",
      [String(email).trim().toLowerCase()],
    );
    if (userResult.rows.length === 0) {
      return res.status(400).json({ error: "Invalid email or password" });
    }

    const user = userResult.rows[0];
    const validPassword = await comparePassword(password, user.password_hash);
    if (!validPassword) {
      return res.status(400).json({ error: "Invalid email or password" });
    }

    const accessToken = generateAccessToken({ userId: user.id });
    const refreshToken = generateRandomToken();
    const expiresAt = getRefreshTokenExpiry();

    await pool.query(
      "INSERT INTO refresh_tokens (user_id, token, expires_at) VALUES ($1, $2, $3)",
      [user.id, refreshToken, expiresAt],
    );

    res.json({
      accessToken,
      refreshToken,
      user: {
        id: user.id,
        email: user.email,
      },
    });
  } catch (error) {
    console.error("Login error:", error);
    res.status(500).json({ error: "Could not log in" });
  }
});

router.post("/logout", requireAuth, async (req, res) => {
  const { refreshToken } = req.body;
  try {
    if (refreshToken) {
      await pool.query(
        "DELETE FROM refresh_tokens WHERE user_id = $1 AND token = $2",
        [req.user.id, refreshToken],
      );
    }
    res.json({ success: true });
  } catch (error) {
    console.error("Logout error:", error);
    res.status(500).json({ error: "Could not log out" });
  }
});

router.get("/session", requireAuth, async (req, res) => {
  res.json({
    user: { id: req.user.id, email: req.user.email },
    profile: req.profile,
  });
});

router.post("/password-reset", async (req, res) => {
  const { email } = req.body;
  if (!email) {
    return res.status(400).json({ error: "Email is required" });
  }

  try {
    const userResult = await pool.query(
      "SELECT id FROM users WHERE email = $1",
      [String(email).trim().toLowerCase()],
    );
    if (userResult.rows.length === 0) {
      return res.json({ success: true });
    }

    const userId = userResult.rows[0].id;
    const token = generateRandomToken();
    const expiresAt = new Date();
    expiresAt.setHours(expiresAt.getHours() + 1);

    await pool.query(
      "INSERT INTO password_resets (user_id, token, expires_at) VALUES ($1, $2, $3)",
      [userId, token, expiresAt],
    );

    console.log(`Password reset token for ${email}: ${token}`);
    res.json({ success: true });
  } catch (error) {
    console.error("Password reset error:", error);
    res.status(500).json({ error: "Could not send password reset" });
  }
});

router.post("/password-reset/confirm", async (req, res) => {
  const { token, password } = req.body;
  if (!token || !password) {
    return res.status(400).json({ error: "Token and password are required" });
  }

  try {
    const resetResult = await pool.query(
      "SELECT user_id FROM password_resets WHERE token = $1 AND expires_at > NOW()",
      [token],
    );

    if (resetResult.rows.length === 0) {
      return res.status(400).json({ error: "Invalid or expired token" });
    }

    const userId = resetResult.rows[0].user_id;
    const passwordHash = await hashPassword(password);

    await pool.query("UPDATE users SET password_hash = $1 WHERE id = $2", [
      passwordHash,
      userId,
    ]);
    await pool.query("DELETE FROM password_resets WHERE user_id = $1", [
      userId,
    ]);

    res.json({ success: true });
  } catch (error) {
    console.error("Password reset confirm error:", error);
    res.status(500).json({ error: "Could not reset password" });
  }
});

router.patch("/password", requireAuth, async (req, res) => {
  const { currentPassword, newPassword } = req.body;
  if (!currentPassword || !newPassword) {
    return res
      .status(400)
      .json({ error: "Current and new password are required" });
  }

  try {
    const userResult = await pool.query(
      "SELECT password_hash FROM users WHERE id = $1",
      [req.user.id],
    );
    const user = userResult.rows[0];
    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    const validPassword = await comparePassword(
      currentPassword,
      user.password_hash,
    );
    if (!validPassword) {
      return res.status(400).json({ error: "Current password is incorrect" });
    }

    const passwordHash = await hashPassword(newPassword);
    await pool.query("UPDATE users SET password_hash = $1 WHERE id = $2", [
      passwordHash,
      req.user.id,
    ]);
    res.json({ success: true });
  } catch (error) {
    console.error("Change password error:", error);
    res.status(500).json({ error: "Could not change password" });
  }
});

router.patch("/email", requireAuth, async (req, res) => {
  const { newEmail } = req.body;
  if (!newEmail) {
    return res.status(400).json({ error: "New email is required" });
  }

  try {
    const normalizedEmail = String(newEmail).trim().toLowerCase();
    const existingUser = await pool.query(
      "SELECT id FROM users WHERE email = $1",
      [normalizedEmail],
    );
    if (existingUser.rows.length > 0) {
      return res.status(400).json({ error: "Email already in use" });
    }

    await pool.query("UPDATE users SET email = $1 WHERE id = $2", [
      normalizedEmail,
      req.user.id,
    ]);
    res.json({ success: true });
  } catch (error) {
    console.error("Change email error:", error);
    res.status(500).json({ error: "Could not change email" });
  }
});

module.exports = router;

export {}
