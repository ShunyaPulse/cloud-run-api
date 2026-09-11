const { Pool } = require("pg");

// Neon Serverless Postgres requires SSL
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false, // Neon uses self-managed TLS certs
  },
  // Connection pool tuning for serverless (Cloud Run scale-to-zero)
  max: 10,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 5_000,
});

pool.on("error", (err) => {
  console.error("Unexpected Postgres pool error:", err);
});

/**
 * Execute a parameterized SQL query.
 * @param {string} text - SQL statement with $1, $2, ... placeholders
 * @param {any[]}  params - Values bound to placeholders
 * @returns {Promise<import('pg').QueryResult>}
 */
const query = (text, params) => pool.query(text, params);

module.exports = { pool, query };
