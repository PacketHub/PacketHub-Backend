const express = require("express");
const { pool } = require("../db");
const { requireAuth } = require("../middleware/auth");

const router = express.Router();

router.get("/conversations", requireAuth, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT c.id, c.user_a, c.user_b, c.last_message_at, c.created_at,
              m.content AS last_message_content,
              m.sender_id AS last_message_sender_id,
              p.user_id AS other_user_id,
              p.username AS other_username,
              p.display_name AS other_display_name,
              p.avatar_url AS other_avatar_url
       FROM conversations c
       LEFT JOIN LATERAL (
         SELECT content, sender_id FROM messages WHERE conversation_id = c.id ORDER BY created_at DESC LIMIT 1
       ) m ON true
       LEFT JOIN LATERAL (
         SELECT user_id, username, display_name, avatar_url FROM profiles WHERE user_id = CASE WHEN c.user_a = $1 THEN c.user_b ELSE c.user_a END
       ) p ON true
       WHERE c.user_a = $1 OR c.user_b = $1
       ORDER BY c.last_message_at DESC`,
      [req.user.id],
    );

    const conversations = result.rows.map((row) => ({
      id: row.id,
      user_a: row.user_a,
      user_b: row.user_b,
      last_message_at: row.last_message_at,
      other: {
        user_id: row.other_user_id,
        username: row.other_username,
        display_name: row.other_display_name,
        avatar_url: row.other_avatar_url,
      },
      last_message: row.last_message_content
        ? {
            content: row.last_message_content,
            sender_id: row.last_message_sender_id,
            created_at: row.last_message_at,
          }
        : null,
    }));

    res.json(conversations);
  } catch (error) {
    console.error("Get conversations error:", error);
    res.status(500).json({ error: "Could not fetch conversations" });
  }
});

router.get("/conversations/:id/messages", requireAuth, async (req, res) => {
  try {
    const conversationResult = await pool.query(
      "SELECT user_a, user_b FROM conversations WHERE id = $1",
      [req.params.id],
    );
    if (conversationResult.rows.length === 0) {
      return res.status(404).json({ error: "Conversation not found" });
    }

    const conversation = conversationResult.rows[0];
    if (
      conversation.user_a !== req.user.id &&
      conversation.user_b !== req.user.id
    ) {
      return res
        .status(403)
        .json({ error: "Not authorized for this conversation" });
    }

    const messageResult = await pool.query(
      "SELECT id, conversation_id, sender_id, content, created_at, read_at FROM messages WHERE conversation_id = $1 ORDER BY created_at ASC",
      [req.params.id],
    );

    res.json(messageResult.rows);
  } catch (error) {
    console.error("Get conversation messages error:", error);
    res.status(500).json({ error: "Could not fetch messages" });
  }
});

router.post("/conversations", requireAuth, async (req, res) => {
  const { other_user_id } = req.body;
  if (!other_user_id) {
    return res.status(400).json({ error: "other_user_id is required" });
  }

  if (other_user_id === req.user.id) {
    return res
      .status(400)
      .json({ error: "Cannot create conversation with yourself" });
  }

  try {
    const existingResult = await pool.query(
      `SELECT id FROM conversations WHERE (user_a = $1 AND user_b = $2) OR (user_a = $2 AND user_b = $1) LIMIT 1`,
      [req.user.id, other_user_id],
    );

    if (existingResult.rows.length > 0) {
      return res.json({ conversation_id: existingResult.rows[0].id });
    }

    const createResult = await pool.query(
      "INSERT INTO conversations (user_a, user_b) VALUES ($1, $2) RETURNING id",
      [req.user.id, other_user_id],
    );

    res.status(201).json({ conversation_id: createResult.rows[0].id });
  } catch (error) {
    console.error("Create conversation error:", error);
    res.status(500).json({ error: "Could not create conversation" });
  }
});

router.post("/conversations/:id/messages", requireAuth, async (req, res) => {
  const { content } = req.body;
  if (!content || String(content).trim() === "") {
    return res.status(400).json({ error: "Content is required" });
  }

  try {
    const conversationResult = await pool.query(
      "SELECT user_a, user_b FROM conversations WHERE id = $1",
      [req.params.id],
    );
    if (conversationResult.rows.length === 0) {
      return res.status(404).json({ error: "Conversation not found" });
    }

    const conversation = conversationResult.rows[0];
    if (
      conversation.user_a !== req.user.id &&
      conversation.user_b !== req.user.id
    ) {
      return res
        .status(403)
        .json({ error: "Not authorized for this conversation" });
    }

    const insertResult = await pool.query(
      "INSERT INTO messages (conversation_id, sender_id, content) VALUES ($1, $2, $3) RETURNING id",
      [req.params.id, req.user.id, String(content).trim()],
    );

    await pool.query(
      "UPDATE conversations SET last_message_at = NOW() WHERE id = $1",
      [req.params.id],
    );

    res.status(201).json({ id: insertResult.rows[0].id });
  } catch (error) {
    console.error("Send message error:", error);
    res.status(500).json({ error: "Could not send message" });
  }
});

module.exports = router;

export {}
