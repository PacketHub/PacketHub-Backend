const express = require("express");
const cors = require("cors");
const dotenv = require("dotenv");
const { initDb } = require("./db");
const authRouter = require("./routes/auth");
const profilesRouter = require("./routes/profiles");
const postsRouter = require("./routes/posts");
const commentsRouter = require("./routes/comments");
const votesRouter = require("./routes/votes");
const conversationsRouter = require("./routes/conversations");
const adminRouter = require("./routes/admin");

dotenv.config();

const app = express();

app.use(cors());
app.use(express.json());

app.use("/api/auth", authRouter);
app.use("/api/profiles", profilesRouter);
app.use("/api/posts", postsRouter);
app.use("/api", commentsRouter);
app.use("/api", votesRouter);
app.use("/api", conversationsRouter);
app.use("/api/admin", adminRouter);

app.get("/", (req, res) => {
  res.json({
    name: "PacketHub API",
    description:
      "Beginner-friendly IT forum backend for PostgreSQL and Docker.",
  });
});

app.use((req, res) => {
  res.status(404).json({ error: "Not found" });
});

app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: "Internal server error" });
});

const port = process.env.PORT || 4000;

initDb()
  .then(() => {
    app.listen(port, () => {
      console.log(`PacketHub backend is running on http://localhost:${port}`);
    });
  })
  .catch((error) => {
    console.error("Failed to initialize database:", error);
    process.exit(1);
  });

export {}
