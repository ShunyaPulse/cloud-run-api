// Load .env in development only (dotenv is a devDependency)
if (process.env.NODE_ENV !== "production") {
  try {
    require("dotenv").config();
  } catch {
    // dotenv not installed — running in production
  }
}

const express = require("express");
const { pool, query } = require("./db");

const app = express();
const PORT = parseInt(process.env.PORT, 10) || 8080;
const HOST = "0.0.0.0";

// ─── Middleware ──────────────────────────────────────────────────────
app.use(express.json());

// ─── Health Check (Cloud Run liveness probe) ────────────────────────
app.get("/health", (_req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

// ─── Root ───────────────────────────────────────────────────────────
app.get("/", (_req, res) => {
  res.json({
    service: "cloud-run-app",
    version: "1.0.0",
    endpoints: ["/health", "/api/items"],
  });
});

// ─── CRUD: /api/items ───────────────────────────────────────────────

// Ensure the items table exists (idempotent)
async function ensureTable() {
  await query(`
    CREATE TABLE IF NOT EXISTS items (
      id    SERIAL PRIMARY KEY,
      name  TEXT NOT NULL,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);
}

// GET /api/items — list all items
app.get("/api/items", async (_req, res, next) => {
  try {
    const { rows } = await query("SELECT * FROM items ORDER BY id");
    res.json(rows);
  } catch (err) {
    next(err);
  }
});

// POST /api/items — create an item { "name": "..." }
app.post("/api/items", async (req, res, next) => {
  try {
    const { name } = req.body;
    if (!name) {
      return res.status(400).json({ error: "name is required" });
    }
    const { rows } = await query(
      "INSERT INTO items (name) VALUES ($1) RETURNING *",
      [name]
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    next(err);
  }
});

// GET /api/items/:id — get a single item
app.get("/api/items/:id", async (req, res, next) => {
  try {
    const { rows } = await query("SELECT * FROM items WHERE id = $1", [
      req.params.id,
    ]);
    if (rows.length === 0) {
      return res.status(404).json({ error: "Item not found" });
    }
    res.json(rows[0]);
  } catch (err) {
    next(err);
  }
});

// DELETE /api/items/:id — delete an item
app.delete("/api/items/:id", async (req, res, next) => {
  try {
    const { rowCount } = await query("DELETE FROM items WHERE id = $1", [
      req.params.id,
    ]);
    if (rowCount === 0) {
      return res.status(404).json({ error: "Item not found" });
    }
    res.status(204).end();
  } catch (err) {
    next(err);
  }
});

// ─── Global Error Handler ───────────────────────────────────────────
app.use((err, _req, res, _next) => {
  console.error("Unhandled error:", err);
  res.status(500).json({ error: "Internal server error" });
});

// ─── Start Server ───────────────────────────────────────────────────
async function start() {
  // Auto-create the items table if DATABASE_URL is configured
  if (process.env.DATABASE_URL) {
    try {
      await ensureTable();
      console.log("✔ Database connected, items table ready");
    } catch (err) {
      console.warn("⚠ Database connection failed (app will still start):", err.message);
    }
  } else {
    console.warn("⚠ DATABASE_URL not set — database features disabled");
  }

  app.listen(PORT, HOST, () => {
    console.log(`🚀 Server listening on http://${HOST}:${PORT}`);
  });
}

start();

// ─── Graceful Shutdown (Cloud Run sends SIGTERM on scale-down) ──────
process.on("SIGTERM", async () => {
  console.log("SIGTERM received — shutting down gracefully");
  await pool.end();
  process.exit(0);
});
