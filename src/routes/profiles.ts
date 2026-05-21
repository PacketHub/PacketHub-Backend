const express = require("express");
const { pool } = require("../db");
const { requireAuth } = require("../middleware/auth");

const router = express.Router();

router.get("/me", requireAuth, async (req, res) => {
  try {
    const profileResult = await pool.query(
      "SELECT id, user_id, username, display_name, bio, avatar_url, banner_url, avatar_is_animated, banner_is_animated, spec_cpu, spec_gpu, spec_ram, spec_storage, spec_os, specs, created_at, updated_at FROM profiles WHERE user_id = $1",
      [req.user.id],
    );

    if (profileResult.rows.length === 0) {
      return res.status(404).json({ error: "Profile not found" });
    }

    res.json(profileResult.rows[0]);
  } catch (error) {
    console.error("Profile me error:", error);
    res.status(500).json({ error: "Could not fetch profile" });
  }
});

router.get("/:username", async (req, res) => {
  try {
    const profileResult = await pool.query(
      "SELECT id, user_id, username, display_name, bio, avatar_url, banner_url, spec_cpu, spec_gpu, spec_ram, spec_storage, spec_os, specs, created_at FROM profiles WHERE username = $1",
      [req.params.username],
    );

    if (profileResult.rows.length === 0) {
      return res.status(404).json({ error: "Profile not found" });
    }

    res.json(profileResult.rows[0]);
  } catch (error) {
    console.error("Get profile error:", error);
    res.status(500).json({ error: "Could not fetch profile" });
  }
});

router.patch("/me", requireAuth, async (req, res) => {
  const updates = [
    "display_name",
    "bio",
    "avatar_url",
    "banner_url",
    "avatar_is_animated",
    "banner_is_animated",
    "spec_cpu",
    "spec_gpu",
    "spec_ram",
    "spec_storage",
    "spec_os",
    "specs",
    "username",
  ];
  const fields = [];
  const values = [];

  updates.forEach((key) => {
    if (req.body[key] !== undefined) {
      fields.push(`${key} = $${fields.length + 1}`);
      values.push(req.body[key]);
    }
  });

  if (fields.length === 0) {
    return res.status(400).json({ error: "No profile fields provided" });
  }

  try {
    if (req.body.username) {
      const existing = await pool.query(
        "SELECT id FROM profiles WHERE username = $1 AND user_id <> $2",
        [req.body.username.trim(), req.user.id],
      );
      if (existing.rows.length > 0) {
        return res.status(400).json({ error: "Username already in use" });
      }
    }

    values.push(req.user.id);
    const query = `UPDATE profiles SET ${fields.join(", ")}, updated_at = NOW() WHERE user_id = $${values.length} RETURNING *`;
    const result = await pool.query(query, values);
    res.json({ success: true, profile: result.rows[0] });
  } catch (error) {
    console.error("Update profile error:", error);
    res.status(500).json({ error: "Could not update profile" });
  }
});

module.exports = router;

export {}
