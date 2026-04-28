'use strict';
/**
 * BullMQ async job queue
 * Queues: email, notifications, ai-batch-score, cert-gen
 */
const { Queue, Worker } = require('bullmq');
const IORedis = require('ioredis');
const logger  = require('./logger');

const connection = new IORedis(process.env.REDIS_URL || 'redis://localhost:6379', {
  maxRetriesPerRequest: null,  // required by BullMQ
});

/* ── Queue definitions ──────────────────────────────────────── */
const emailQueue    = new Queue('email',        { connection });
const notifQueue    = new Queue('notifications', { connection });
const aiBatchQueue  = new Queue('ai-batch',      { connection });
const certQueue     = new Queue('cert-gen',      { connection });

/* ── Queue helpers ──────────────────────────────────────────── */
async function queueEmail(data) {
  return emailQueue.add('send', data, { attempts: 3, backoff: { type: 'exponential', delay: 5000 } });
}

async function queueNotification(data) {
  return notifQueue.add('notify', data, { attempts: 2 });
}

async function queueAIBatchScore(workerId) {
  return aiBatchQueue.add('score', { workerId }, {
    jobId: `batch:${workerId}`,   // dedup same worker
    delay: 2000,                  // small delay to batch profile updates
    attempts: 2,
  });
}

async function queueCertGen(data) {
  return certQueue.add('generate', data, { attempts: 3, backoff: { type: 'fixed', delay: 3000 } });
}

/* ── Workers (only in non-test env) ─────────────────────────── */
if (process.env.NODE_ENV !== 'test') {
  const mailer   = require('./mailer');
  const db       = require('./db');

  // Email worker
  new Worker('email', async (job) => {
    const { to, subject, html, text } = job.data;
    await mailer.sendMail({ to, subject, html, text });
    logger.debug({ to, subject }, 'Email sent via queue');
  }, { connection, concurrency: 5 });

  // Notification worker
  new Worker('notifications', async (job) => {
    const { userId, type, title, body, refType, refId } = job.data;
    await db.query(
      `INSERT INTO notifications (user_id,type,title,body,ref_type,ref_id) VALUES ($1,$2,$3,$4,$5,$6)`,
      [userId, type, title, body, refType || null, refId || null]
    );
  }, { connection, concurrency: 10 });

  // AI batch scoring worker
  new Worker('ai-batch', async (job) => {
    const { workerId } = job.data;
    const { batchComputeScores } = require('../services/matchingService');
    const { rows: jobs } = await db.query(
      `SELECT id FROM job_postings WHERE status='ACTIVE' AND expires_at > NOW() ORDER BY created_at DESC LIMIT 200`
    );
    const jobIds = jobs.map(j => j.id);
    if (jobIds.length) await batchComputeScores(workerId, jobIds);
    logger.info({ workerId, jobCount: jobIds.length }, 'AI batch score completed');
  }, { connection, concurrency: 2 });

  // Cert generation worker
  new Worker('cert-gen', async (job) => {
    const { generateCertificate } = require('../services/certService');
    const { enrollmentId, workerName, courseTitle, trainerName } = job.data;
    const { certUrl, credId } = await generateCertificate({ enrollmentId, workerName, courseTitle, trainerName, completedAt: new Date() });
    await db.query(`UPDATE enrollments SET certificate_url=$2, completed_at=NOW() WHERE id=$1`, [enrollmentId, certUrl]);
    await db.query(`UPDATE certificates SET cert_url=$2 WHERE enrollment_id=$1`, [enrollmentId, certUrl]);
    logger.info({ enrollmentId, credId }, 'Certificate generated');
  }, { connection, concurrency: 3 });

  logger.info('✅ BullMQ workers started');
}

module.exports = { emailQueue, notifQueue, aiBatchQueue, certQueue, queueEmail, queueNotification, queueAIBatchScore, queueCertGen };
