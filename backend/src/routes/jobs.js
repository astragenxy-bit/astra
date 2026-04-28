'use strict';
const express  = require('express');
const mailer   = require('../utils/mailer');
const logger   = require('../utils/logger');
const { body, query, param, validationResult } = require('express-validator');
const router   = express.Router();
const db       = require('../utils/db');
const redis    = require('../utils/redis');
const es       = require('../utils/elasticsearch');
const { authenticate, optionalAuth } = require('../middleware/auth');
const { AppError } = require('../middleware/errorHandler');
const { getConfig } = require('../utils/config');
const { spendCredits, rewardCredits } = require('../services/creditService');
const { indexJob, searchJobs } = require('../services/searchService');
const { calcMatchingScore, trackEvent } = require('../services/ai/matchingEngineV2');

/* ── GET /jobs — Search ────────────────────────────────────── */
router.get('/', optionalAuth, async (req, res, next) => {
  try {
    const { q, location, type, min_salary, max_salary, skills, page = 1, limit = 20 } = req.query;

    // Elasticsearch search
    const esResult = await searchJobs({
      q, location, type, min_salary: parseInt(min_salary), max_salary: parseInt(max_salary),
      skills: skills ? skills.split(',') : [],
      from: (page - 1) * limit, size: parseInt(limit),
    });

    let jobs = esResult.hits;

    // If authenticated worker, compute matching scores in batch
    if (req.user?.user_type === 'WORKER') {
      const jobIds  = jobs.map(j => j._id);
      const scores  = await batchMatchScores(req.user.id, jobIds);
      jobs = jobs.map(j => ({ ...j._source, id: j._id, matching_score: scores[j._id] || 0 }));
    } else {
      jobs = jobs.map(j => ({ ...j._source, id: j._id }));
    }

    res.json({ jobs, total: esResult.total, page: parseInt(page), limit: parseInt(limit) });
  } catch (err) { next(err); }
});

/* ── GET /jobs/:id — Detail ────────────────────────────────── */
router.get('/:id', optionalAuth, async (req, res, next) => {
  try {
    const { rows } = await db.query(`
      SELECT j.*, ep.company_name, ep.description as company_desc, ep.website, ep.logo_url,
             ep.company_size, ep.industry
      FROM job_postings j
      LEFT JOIN employer_profiles ep ON ep.user_id = j.employer_id
      WHERE j.id = $1 AND j.status = 'ACTIVE'
    `, [req.params.id]);

    if (!rows.length) throw new AppError('NOT_FOUND', 404, 'Job not found');
    const job = rows[0];

    // Increment view count async
    db.query('UPDATE job_postings SET views_count = views_count + 1 WHERE id = $1', [job.id]).catch(() => {});

    // Track behavioral event (async, non-blocking)
    if (req.user) {
      trackEvent(req.user.id, 'JOB_VIEW', 'job', job.id, { job_type: job.job_type, location: job.location });
    }

    res.json(job);
  } catch (err) { next(err); }
});

/* ── POST /jobs — Create (NTD) ─────────────────────────────── */
router.post('/', authenticate, [
  body('title').notEmpty().isLength({ max: 255 }),
  body('description').notEmpty(),
  body('required_skills').isArray({ min: 1 }),
  body('location').notEmpty(),
  body('salary_min').isInt({ min: 1 }).withMessage('Salary must be provided'),
], async (req, res, next) => {
  try {
    if (req.user.user_type !== 'EMPLOYER') throw new AppError('FORBIDDEN', 403, 'Only employers can post jobs');

    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(422).json({ errors: errors.array() });

    const cost = parseInt(await getConfig('job_post_cost'));
    const idempotencyKey = `job_post:${req.user.id}:${Date.now()}`;

    // Spend credits
    const spendResult = await spendCredits({
      userId: req.user.id, amount: cost,
      refType: 'JOB_POST', description: `Post job: ${req.body.title}`,
      idempotencyKey,
    });
    if (!spendResult.success) throw new AppError('INSUFFICIENT_CREDIT', 402, `Need ${cost} credits. Current balance: ${spendResult.balance}`);

    // Insert job
    const { rows } = await db.query(`
      INSERT INTO job_postings (employer_id, title, description, required_skills, location,
        job_type, salary_min, salary_max, salary_display, experience_years, education_level)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
      RETURNING *
    `, [
      req.user.id, req.body.title, req.body.description, req.body.required_skills,
      req.body.location, req.body.job_type || 'Full-time',
      req.body.salary_min, req.body.salary_max,
      req.body.salary_display || `${Math.round(req.body.salary_min/1000000)}-${Math.round((req.body.salary_max||req.body.salary_min)/1000000)}tr`,
      req.body.experience_years || 0, req.body.education_level,
    ]);
    const job = rows[0];

    // Index in Elasticsearch
    await indexJob(job);

    res.status(201).json({ job, credits_spent: cost });
  } catch (err) { next(err); }
});

/* ── POST /jobs/:id/apply ──────────────────────────────────── */
router.post('/:id/apply', authenticate, async (req, res, next) => {
  try {
    if (req.user.user_type !== 'WORKER') throw new AppError('FORBIDDEN', 403, 'Only workers can apply');

    // Check already applied
    const existing = await db.query(
      'SELECT id FROM applications WHERE job_id = $1 AND worker_id = $2',
      [req.params.id, req.user.id]
    );
    if (existing.rows.length) throw new AppError('ALREADY_APPLIED', 409, 'You have already applied for this job');

    // Get job and worker profile
    const [jobRow, profileRow] = await Promise.all([
      db.query('SELECT * FROM job_postings WHERE id = $1 AND status = $2', [req.params.id, 'ACTIVE']),
      db.query('SELECT * FROM worker_profiles WHERE user_id = $1', [req.user.id]),
    ]);
    if (!jobRow.rows.length)    throw new AppError('NOT_FOUND', 404, 'Job not found or expired');
    if (!profileRow.rows.length) throw new AppError('PROFILE_REQUIRED', 400, 'Please complete your profile first');

    const job     = jobRow.rows[0];
    const profile = profileRow.rows[0];

    // Compute matching score
    const { score, matched, missing } = calcMatchingScore(profile, job);

    // Insert application
    const { rows } = await db.query(`
      INSERT INTO applications (job_id, worker_id, status, matching_score, cover_letter, ai_cover_letter)
      VALUES ($1, $2, 'NEW', $3, $4, $5)
      RETURNING *
    `, [job.id, req.user.id, score, req.body.cover_letter || null, req.body.ai_cover_letter || null]);

    // Update applications count
    db.query('UPDATE job_postings SET applications_count = applications_count + 1 WHERE id = $1', [job.id]).catch(() => {});

    // Notify employer via in-app + email (async, non-blocking)
    setImmediate(async () => {
      try {
        const [empRow, wpRow] = await Promise.all([
          db.query('SELECT u.email FROM users u JOIN employer_profiles ep ON ep.user_id=u.id WHERE u.id=$1', [job.employer_id]),
          db.query('SELECT full_name FROM worker_profiles WHERE user_id=$1', [req.user.id]),
        ]);
        await db.query(
          `INSERT INTO notifications (user_id,type,title,body,ref_type,ref_id) VALUES ($1,'NEW_APPLICANT',$2,$3,'application',$4)`,
          [job.employer_id, `Ứng viên mới: ${job.title}`, `${wpRow.rows[0]?.full_name || 'Ứng viên'} ứng tuyển (Match: ${score}%)`, rows[0].id]
        );
        if (empRow.rows[0]?.email) {
          await mailer.sendMail({
            to: empRow.rows[0].email,
            subject: `[WorkLearn] Ứng viên mới cho "${job.title}"`,
            html: `<p>Có ứng viên mới ứng tuyển vị trí <b>${job.title}</b> với điểm match <b>${score}%</b>. <a href="${process.env.CORS_ORIGIN}/employer/pipeline">Xem ngay</a></p>`,
          });
        }
      } catch(e) { logger.warn(e, 'Failed to notify employer'); }
    });

    // Cache matching score
    await db.query(`
      INSERT INTO matching_scores (worker_id, job_id, score, matched_skills, missing_skills)
      VALUES ($1,$2,$3,$4,$5)
      ON CONFLICT (worker_id, job_id) DO UPDATE SET score=$3, matched_skills=$4, missing_skills=$5, computed_at=NOW()
    `, [req.user.id, job.id, score, matched, missing]);

    res.status(201).json({ application: rows[0], matching_score: score, matched_skills: matched, missing_skills: missing });
  } catch (err) { next(err); }
});

/* ── PATCH /jobs/:id/status (NTD updates pipeline) ─────────── */
router.patch('/applications/:appId/status', authenticate, [
  body('status').isIn(['REVIEW', 'INTERVIEW', 'HIRED', 'REJECTED']),
], async (req, res, next) => {
  try {
    if (req.user.user_type !== 'EMPLOYER') throw new AppError('FORBIDDEN', 403);

    const { rows } = await db.query(`
      UPDATE applications a
      SET status = $1, updated_at = NOW()
      FROM job_postings j
      WHERE a.id = $2 AND a.job_id = j.id AND j.employer_id = $3
      RETURNING a.*
    `, [req.body.status, req.params.appId, req.user.id]);

    if (!rows.length) throw new AppError('NOT_FOUND', 404, 'Application not found');
    const app = rows[0];

    // Reward on HIRED
    if (req.body.status === 'HIRED') {
      const reward = parseInt(await getConfig('reward_hired'));
      await rewardCredits({
        userId: app.worker_id, amount: reward,
        refType: 'REWARD_HIRE', refId: app.id,
        description: 'Congratulations reward for being hired!',
        idempotencyKey: `reward:hire:${app.id}`,
      });
    }

    // Send notification
    await db.query(`
      INSERT INTO notifications (user_id, type, title, body, ref_type, ref_id)
      VALUES ($1, 'APPLICATION_STATUS', $2, $3, 'application', $4)
    `, [
      app.worker_id,
      `Hồ sơ của bạn: ${req.body.status}`,
      `Trạng thái ứng tuyển đã cập nhật thành ${req.body.status}`,
      app.id,
    ]);

    res.json(app);
  } catch (err) { next(err); }
});

/* ── POST /jobs/:id/boost ──────────────────────────────────── */
router.post('/:id/boost', authenticate, [
  body('duration').isIn(['24h', '48h', '7d']),
], async (req, res, next) => {
  try {
    if (req.user.user_type !== 'EMPLOYER') throw new AppError('FORBIDDEN', 403);

    const costMap = { '24h': 'boost_24h_cost', '48h': 'boost_48h_cost', '7d': 'boost_7d_cost' };
    const hoursMap = { '24h': 24, '48h': 48, '7d': 168 };
    const cost = parseInt(await getConfig(costMap[req.body.duration]));

    const spendResult = await spendCredits({
      userId: req.user.id, amount: cost,
      refType: 'BOOST', refId: req.params.id,
      description: `Boost job for ${req.body.duration}`,
      idempotencyKey: `boost:${req.params.id}:${Date.now()}`,
    });
    if (!spendResult.success) throw new AppError('INSUFFICIENT_CREDIT', 402);

    const boostedUntil = new Date(Date.now() + hoursMap[req.body.duration] * 3600000);
    await db.query(
      `UPDATE job_postings SET boosted = true, boosted_until = $1 WHERE id = $2 AND employer_id = $3`,
      [boostedUntil, req.params.id, req.user.id]
    );

    res.json({ boosted: true, boosted_until: boostedUntil, credits_spent: cost });
  } catch (err) { next(err); }
});

/* ── GET /jobs/:id/applicants (NTD) ────────────────────────── */
router.get('/:id/applicants', authenticate, async (req, res, next) => {
  try {
    if (req.user.user_type !== 'EMPLOYER') throw new AppError('FORBIDDEN', 403);

    const { rows } = await db.query(`
      SELECT a.*, wp.full_name, wp.headline, wp.skills, wp.cv_url, wp.avatar_url
      FROM applications a
      LEFT JOIN worker_profiles wp ON wp.user_id = a.worker_id
      WHERE a.job_id = $1
      ORDER BY a.matching_score DESC, a.applied_at DESC
    `, [req.params.id]);

    res.json({ applicants: rows });
  } catch (err) { next(err); }
});

/* ── Batch match scores helper ──────────────────────────────── */
async function batchMatchScores(workerId, jobIds) {
  if (!jobIds.length) return {};
  const cacheKey = `match:${workerId}:batch`;
  const cached   = await redis.get(cacheKey);
  if (cached) {
    const map = JSON.parse(cached);
    if (jobIds.every(id => map[id] !== undefined)) return map;
  }

  const { rows } = await db.query(
    `SELECT job_id, score FROM matching_scores WHERE worker_id = $1 AND job_id = ANY($2)`,
    [workerId, jobIds]
  );

  const result = {};
  rows.forEach(r => { result[r.job_id] = parseFloat(r.score); });

  await redis.setex(cacheKey, 3600, JSON.stringify(result));
  return result;
}

module.exports = router;
