'use strict';
require('dotenv').config();

const express    = require('express');
const cors       = require('cors');
const helmet     = require('helmet');
const compression = require('compression');
const rateLimit  = require('express-rate-limit');

// Utils
const logger = require('./utils/logger');
const db     = require('./utils/db');
const { queueAIBatchScore } = require('./utils/queue'); // start workers

// Routes
const authRoutes     = require('./routes/auth');
const userRoutes     = require('./routes/users');
const jobRoutes      = require('./routes/jobs');
const courseRoutes   = require('./routes/courses');
const creditRoutes   = require('./routes/credits');
const matchingRoutes = require('./routes/matching');
const adminRoutes    = require('./routes/admin');
const notifRoutes    = require('./routes/notifications');
const healthRoutes   = require('./routes/health');
const fpayWebhook    = require('./routes/webhooks/fpay');
const aiRoutes       = require('./routes/ai/index');

// Middleware
const { errorHandler }  = require('./middleware/errorHandler');
const { authenticate }  = require('./middleware/auth');

const app  = express();
const PORT = process.env.PORT || 4000;

/* ── Security ──────────────────────────────────────────────── */
app.set('trust proxy', 1);
app.use(helmet({ crossOriginEmbedderPolicy: false, contentSecurityPolicy: false }));
app.use(cors({
  origin:      (process.env.CORS_ORIGIN || 'http://localhost:3000').split(','),
  credentials: true,
  methods:     ['GET','POST','PUT','PATCH','DELETE','OPTIONS'],
  allowedHeaders: ['Content-Type','Authorization','X-Idempotency-Key','X-Request-Id'],
}));
app.use(compression());
app.use(logger.requestLogger);          // ← request ID + timing log

/* ── Body parsing (BEFORE webhook route which needs raw body) ── */
app.use('/webhooks', express.raw({ type: '*/*' }));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

/* ── Rate limits ───────────────────────────────────────────── */
app.use('/api/v1/auth', rateLimit({ windowMs: 15*60*1000, max: 30,  message: { error: 'TOO_MANY_REQUESTS' } }));
app.use('/api/v1',      rateLimit({ windowMs: 60*1000,    max: 300, message: { error: 'TOO_MANY_REQUESTS' } }));

/* ── Security middleware: sanitize query params ─────────────── */
app.use((req, _res, next) => {
  // Strip potential XSS from string fields
  const sanitize = (v) => typeof v === 'string' ? v.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '').replace(/javascript:/gi, '') : v;
  for (const [k,v] of Object.entries(req.query)) req.query[k] = sanitize(v);
  next();
});

/* ── Routes ────────────────────────────────────────────────── */
app.use('/webhooks/fpay',        fpayWebhook);
app.use('/api/v1/health',        healthRoutes);
app.use('/api/v1/auth',          authRoutes);
app.use('/api/v1/users',         authenticate, userRoutes);
app.use('/api/v1/jobs',          jobRoutes);
app.use('/api/v1/courses',       courseRoutes);
app.use('/api/v1/credits',       authenticate, creditRoutes);
app.use('/api/v1/matching',      matchingRoutes);
app.use('/api/v1/ai',            aiRoutes);
app.use('/api/v1/recommendations', aiRoutes);
app.use('/api/v1/admin',         authenticate, adminRoutes);
app.use('/api/v1/notifications', authenticate, notifRoutes);

/* ── 404 ───────────────────────────────────────────────────── */
app.use('*', (req, res) => res.status(404).json({ error: 'NOT_FOUND', path: req.originalUrl }));
app.use(errorHandler);

/* ── Cron: expire jobs every hour ─────────────────────────── */
setInterval(async () => {
  try {
    const { rows } = await db.query('SELECT expire_jobs() as count');
    const count = rows[0]?.count;
    if (count > 0) logger.info({ count }, `Expired ${count} job postings`);
  } catch (e) { logger.error(e, 'Job expiry cron failed'); }
}, 60 * 60 * 1000);

/* ── Start ─────────────────────────────────────────────────── */
const server = app.listen(PORT, () => {
  logger.info({ port: PORT, env: process.env.NODE_ENV || 'development' }, '✅ WorkLearn API started');
});

// Graceful shutdown
process.on('SIGTERM', () => {
  logger.info('SIGTERM received, shutting down gracefully');
  server.close(() => {
    db.pool.end(() => process.exit(0));
  });
});

module.exports = app;
