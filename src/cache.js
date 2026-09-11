const Redis = require("ioredis");

let redisClient = null;

if (process.env.REDIS_URL) {
  try {
    redisClient = new Redis(process.env.REDIS_URL, {
      maxRetriesPerRequest: 1,
      connectTimeout: 3000,
      lazyConnect: true,
    });

    redisClient.on("error", (err) => {
      console.warn("⚠ Redis error (falling back to database):", err.message);
    });

    redisClient.on("connect", () => {
      console.log("✔ Connected to Redis cache on OCI");
    });

    redisClient.connect().catch(() => {
      console.warn("⚠ Could not connect to Redis; continuing without cache.");
    });
  } catch (err) {
    console.warn("⚠ Failed to initialize Redis client:", err.message);
    redisClient = null;
  }
} else {
  console.log("ℹ REDIS_URL not set — running without caching layer.");
}

/**
 * Get cached value by key. Returns null on cache miss or if Redis is offline.
 * @param {string} key
 * @returns {Promise<string|null>}
 */
async function getCache(key) {
  if (!redisClient || redisClient.status !== "ready") return null;
  try {
    return await redisClient.get(key);
  } catch {
    return null;
  }
}

/**
 * Store value in cache with a TTL (Time-To-Live) in seconds.
 * @param {string} key
 * @param {string} value
 * @param {number} ttlSeconds
 */
async function setCache(key, value, ttlSeconds = 60) {
  if (!redisClient || redisClient.status !== "ready") return;
  try {
    await redisClient.set(key, value, "EX", ttlSeconds);
  } catch {
    // Ignore cache set failures
  }
}

/**
 * Invalidate a cache key.
 * @param {string} key
 */
async function delCache(key) {
  if (!redisClient || redisClient.status !== "ready") return;
  try {
    await redisClient.del(key);
  } catch {
    // Ignore cache delete failures
  }
}

module.exports = { redisClient, getCache, setCache, delCache };
