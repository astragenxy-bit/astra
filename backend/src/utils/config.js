// ── utils/config.js ───────────────────────────────────────────
'use strict';
const db    = require('./db');
const redis = require('./redis');

const configCache = {};

async function getConfig(key) {
  // In-memory cache first
  if (configCache[key] !== undefined) return configCache[key];

  // Redis cache
  const cached = await redis.get(`config:${key}`);
  if (cached) { configCache[key] = cached; return cached; }

  // Database
  const { rows } = await db.query('SELECT value FROM platform_config WHERE key=$1', [key]);
  const value = rows[0]?.value;
  if (value !== undefined) {
    configCache[key] = value;
    await redis.setex(`config:${key}`, 3600, value);
  }
  return value;
}

async function setConfig(key, value) {
  await db.query(`
    INSERT INTO platform_config (key, value, updated_at) VALUES ($1, $2, NOW())
    ON CONFLICT (key) DO UPDATE SET value=$2, updated_at=NOW()
  `, [key, value]);
  configCache[key] = value;
  await redis.setex(`config:${key}`, 3600, value);
}

module.exports = { getConfig, setConfig };
