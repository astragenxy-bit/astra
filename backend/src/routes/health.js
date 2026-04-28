// ── routes/health.js ─────────────────────────────────────────
'use strict';
const express = require('express');
const router  = express.Router();
const db      = require('../utils/db');
const redis   = require('../utils/redis');

router.get('/', async (req, res) => {
  const checks = { db: false, redis: false, es: false };

  try { await db.query('SELECT 1');  checks.db    = true; } catch {}
  try { await redis.ping();          checks.redis = true; } catch {}

  const healthy = Object.values(checks).every(Boolean);
  res.status(healthy ? 200 : 503).json({
    status:  healthy ? 'ok' : 'degraded',
    version: '2.0.0',
    checks,
    timestamp: new Date().toISOString(),
  });
});

module.exports = router;
