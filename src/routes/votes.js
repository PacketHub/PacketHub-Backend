const express = require("express");
const { pool } = require("../db");
const { requireAuth } = require("../middleware/auth");

const router = express.Router();

async function getVoteSummary(postId, userId) {
  const counts = await pool.query(
    `SELECT vote_type, COUNT(*) AS total FROM post_votes WHERE post_id = $1 GROUP BY vote_type`,
    [postId],
  );
  const userVoteResult = await pool.query(
    "SELECT vote_type FROM post_votes WHERE post_id = $1 AND user_id = $2",
    [postId, userId],
  );

  const summary = { up: 0, down: 0, user_vote: null };
  counts.rows.forEach((row) => {
    summary[row.vote_type] = Number(row.total);
  });
  if (userVoteResult.rows.length > 0) {
    summary.user_vote = userVoteResult.rows[0].vote_type;
  }
  return summary;
}

router.post("/posts/:id/votes", requireAuth, async (req, res) => {
  const { vote_type } = req.body;
  if (!["up", "down"].includes(vote_type)) {
    return res.status(400).json({ error: "vote_type must be up or down" });
  }

  try {
    const postResult = await pool.query("SELECT id FROM posts WHERE id = $1", [
      req.params.id,
    ]);
    if (postResult.rows.length === 0) {
      return res.status(404).json({ error: "Post not found" });
    }

    await pool.query(
      `INSERT INTO post_votes (post_id, user_id, vote_type)
       VALUES ($1, $2, $3)
       ON CONFLICT (post_id, user_id) DO UPDATE SET vote_type = EXCLUDED.vote_type, created_at = NOW()`,
      [req.params.id, req.user.id, vote_type],
    );

    const summary = await getVoteSummary(req.params.id, req.user.id);
    res.json(summary);
  } catch (error) {
    console.error("Vote error:", error);
    res.status(500).json({ error: "Could not submit vote" });
  }
});

router.delete("/posts/:id/votes", requireAuth, async (req, res) => {
  try {
    await pool.query(
      "DELETE FROM post_votes WHERE post_id = $1 AND user_id = $2",
      [req.params.id, req.user.id],
    );
    const summary = await getVoteSummary(req.params.id, req.user.id);
    res.json(summary);
  } catch (error) {
    console.error("Delete vote error:", error);
    res.status(500).json({ error: "Could not remove vote" });
  }
});

module.exports = router;
