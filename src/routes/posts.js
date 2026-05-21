const express = require("express");
const { pool } = require("../db");
const { requireAuth } = require("../middleware/auth");

const router = express.Router();

router.get("/", async (req, res) => {
  const { q, category, author } = req.query;
  const filters = [];
  const values = [];

  if (q) {
    values.push(`%${q}%`);
    filters.push(
      `(p.title ILIKE $${values.length} OR p.content ILIKE $${values.length})`,
    );
  }
  if (category) {
    values.push(category);
    filters.push(`p.category = $${values.length}`);
  }
  if (author) {
    values.push(author);
    filters.push(`pr.username ILIKE $${values.length}`);
  }

  const whereClause = filters.length ? `WHERE ${filters.join(" AND ")}` : "";

  try {
    const result = await pool.query(
      `SELECT p.id, p.title, p.content, p.category, p.author, p.author_id, p.created_at, p.updated_at,
              pr.username AS author_username
       FROM posts p
       LEFT JOIN profiles pr ON p.author_id = pr.user_id
       ${whereClause}
       ORDER BY p.created_at DESC`,
      values,
    );
    res.json(result.rows);
  } catch (error) {
    console.error("Error fetching posts:", error);
    res.status(500).json({ error: "Could not fetch posts" });
  }
});

router.get("/:id", async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT p.id, p.title, p.content, p.category, p.author, p.author_id, p.created_at, p.updated_at,
              pr.username AS author_username
       FROM posts p
       LEFT JOIN profiles pr ON p.author_id = pr.user_id
       WHERE p.id = $1`,
      [req.params.id],
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Post not found" });
    }
    res.json(result.rows[0]);
  } catch (error) {
    console.error("Error fetching post:", error);
    res.status(500).json({ error: "Could not fetch post" });
  }
});

router.post("/", requireAuth, async (req, res) => {
  const { title, content, category, author } = req.body;
  if (!title || !content || !category) {
    return res
      .status(400)
      .json({ error: "title, content, and category are required" });
  }

  try {
    const authorName =
      author || (req.profile && req.profile.username) || "Anonymous";
    const result = await pool.query(
      `INSERT INTO posts (title, content, category, author, author_id)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id, title, category, author, author_id, created_at, updated_at`,
      [
        title.trim(),
        content.trim(),
        category.trim(),
        authorName.trim(),
        req.user.id,
      ],
    );
    res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error("Error creating post:", error);
    res.status(500).json({ error: "Could not create post" });
  }
});

router.put("/:id", requireAuth, async (req, res) => {
  const { title, content, category } = req.body;
  if (!title || !content || !category) {
    return res
      .status(400)
      .json({ error: "title, content, and category are required" });
  }

  try {
    const postResult = await pool.query(
      "SELECT author_id FROM posts WHERE id = $1",
      [req.params.id],
    );
    if (postResult.rows.length === 0) {
      return res.status(404).json({ error: "Post not found" });
    }

    const post = postResult.rows[0];
    const isOwner = post.author_id === req.user.id;
    if (!isOwner) {
      const adminCheck = await pool.query(
        "SELECT 1 FROM user_roles WHERE user_id = $1 AND role = $2",
        [req.user.id, "admin"],
      );
      if (adminCheck.rows.length === 0) {
        return res
          .status(403)
          .json({ error: "Not authorized to update this post" });
      }
    }

    const result = await pool.query(
      `UPDATE posts SET title = $1, content = $2, category = $3, updated_at = NOW() WHERE id = $4 RETURNING id, title, content, category, author, author_id, created_at, updated_at`,
      [title.trim(), content.trim(), category.trim(), req.params.id],
    );
    res.json(result.rows[0]);
  } catch (error) {
    console.error("Error updating post:", error);
    res.status(500).json({ error: "Could not update post" });
  }
});

router.delete("/:id", requireAuth, async (req, res) => {
  try {
    const postResult = await pool.query(
      "SELECT author_id FROM posts WHERE id = $1",
      [req.params.id],
    );
    if (postResult.rows.length === 0) {
      return res.status(404).json({ error: "Post not found" });
    }

    const post = postResult.rows[0];
    const isOwner = post.author_id === req.user.id;
    if (!isOwner) {
      const adminCheck = await pool.query(
        "SELECT 1 FROM user_roles WHERE user_id = $1 AND role = $2",
        [req.user.id, "admin"],
      );
      if (adminCheck.rows.length === 0) {
        return res
          .status(403)
          .json({ error: "Not authorized to delete this post" });
      }
    }

    await pool.query("DELETE FROM posts WHERE id = $1", [req.params.id]);
    res.json({ success: true });
  } catch (error) {
    console.error("Error deleting post:", error);
    res.status(500).json({ error: "Could not delete post" });
  }
});

module.exports = router;
