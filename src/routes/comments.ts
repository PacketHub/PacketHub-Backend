const express = require("express");
const { pool } = require("../db");
const { requireAuth } = require("../middleware/auth");

const router = express.Router();

router.get("/posts/:postId/comments", async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT c.id, c.post_id, c.user_id, c.content, c.created_at, c.updated_at,
              p.username, p.display_name, p.avatar_url
       FROM comments c
       LEFT JOIN profiles p ON c.user_id = p.user_id
       WHERE c.post_id = $1
       ORDER BY c.created_at ASC`,
      [req.params.postId],
    );
    res.json(
      result.rows.map((row) => ({
        id: row.id,
        post_id: row.post_id,
        user_id: row.user_id,
        content: row.content,
        created_at: row.created_at,
        updated_at: row.updated_at,
        profile: {
          username: row.username,
          display_name: row.display_name,
          avatar_url: row.avatar_url,
        },
      })),
    );
  } catch (error) {
    console.error("Comments fetch error:", error);
    res.status(500).json({ error: "Could not fetch comments" });
  }
});

router.post("/posts/:postId/comments", requireAuth, async (req, res) => {
  const { content } = req.body;
  if (!content || String(content).trim() === "") {
    return res.status(400).json({ error: "Content is required" });
  }

  try {
    const postResult = await pool.query("SELECT id FROM posts WHERE id = $1", [
      req.params.postId,
    ]);
    if (postResult.rows.length === 0) {
      return res.status(404).json({ error: "Post not found" });
    }

    const result = await pool.query(
      "INSERT INTO comments (post_id, user_id, content) VALUES ($1, $2, $3) RETURNING id",
      [req.params.postId, req.user.id, String(content).trim()],
    );
    res.status(201).json({ id: result.rows[0].id });
  } catch (error) {
    console.error("Create comment error:", error);
    res.status(500).json({ error: "Could not create comment" });
  }
});

router.delete("/comments/:id", requireAuth, async (req, res) => {
  try {
    const commentResult = await pool.query(
      "SELECT user_id FROM comments WHERE id = $1",
      [req.params.id],
    );
    if (commentResult.rows.length === 0) {
      return res.status(404).json({ error: "Comment not found" });
    }

    const comment = commentResult.rows[0];
    if (comment.user_id !== req.user.id) {
      const adminCheck = await pool.query(
        "SELECT 1 FROM user_roles WHERE user_id = $1 AND role = $2",
        [req.user.id, "admin"],
      );
      if (adminCheck.rows.length === 0) {
        return res
          .status(403)
          .json({ error: "Not authorized to delete this comment" });
      }
    }

    await pool.query("DELETE FROM comments WHERE id = $1", [req.params.id]);
    res.json({ success: true });
  } catch (error) {
    console.error("Delete comment error:", error);
    res.status(500).json({ error: "Could not delete comment" });
  }
});

module.exports = router;

export {}
