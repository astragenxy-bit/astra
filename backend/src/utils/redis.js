// ── utils/redis.js ────────────────────────────────────────────
'use strict';
const IORedis = require('ioredis');

const redis = new IORedis(process.env.REDIS_URL || 'redis://localhost:6379', {
  maxRetriesPerRequest: 3,
  retryStrategy: (times) => Math.min(times * 200, 2000),
  lazyConnect: true,
});

redis.on('error', (err) => console.error('Redis error:', err.message));
redis.on('connect', () => console.log('✅ Redis connected'));

module.exports = redis;
