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
const { redisClient, getCache, setCache, delCache } = require("./cache");

const app = express();
const PORT = parseInt(process.env.PORT, 10) || 8080;
const HOST = "0.0.0.0";

// ─── Middleware ──────────────────────────────────────────────────────
app.use(express.json());

// ─── Health Check (Cloud Run liveness probe & Uptime Kuma target) ────
app.get("/health", (_req, res) => {
  res.json({
    status: "ok",
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
    cache: redisClient && redisClient.status === "ready" ? "connected" : "disabled",
  });
});

// ─── Root ───────────────────────────────────────────────────────────
app.get("/", (_req, res) => {
  res.json({
    service: "cloud-run-app",
    version: "1.0.0",
    architecture: "Google Cloud Run + Neon Postgres + OCI Redis",
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

// GET /api/items — list all items (with Redis Cache-Aside)
app.get("/api/items", async (_req, res, next) => {
  try {
    const cacheKey = "items:all";
    const cached = await getCache(cacheKey);

    if (cached) {
      res.setHeader("X-Cache", "HIT");
      return res.json(JSON.parse(cached));
    }

    const { rows } = await query("SELECT * FROM items ORDER BY id");
    // Cache for 60 seconds to protect Neon Postgres from connection exhaustion
    await setCache(cacheKey, JSON.stringify(rows), 60);

    res.setHeader("X-Cache", "MISS");
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

    // Invalidate list cache
    await delCache("items:all");

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

    // Invalidate list cache
    await delCache("items:all");

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

// ─── Graceful Shutdown ──────────────────────────────────────────────
process.on("SIGTERM", async () => {
  console.log("SIGTERM received — shutting down gracefully");
  if (redisClient) {
    try {
      redisClient.disconnect();
    } catch (_) {}
  }
  await pool.end();
  process.exit(0);
});
