// ── utils/db.js ───────────────────────────────────────────────
'use strict';
const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
});

pool.on('error', (err) => console.error('PostgreSQL pool error:', err));

async function query(text, params) {
  const start  = Date.now();
  const result = await pool.query(text, params);
  const dur    = Date.now() - start;
  if (dur > 500) console.warn(`Slow query (${dur}ms): ${text.slice(0,80)}`);
  return result;
}

async function transaction(callback) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await callback(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

module.exports = { query, transaction, pool };

// ── utils/redis.js ────────────────────────────────────────────
