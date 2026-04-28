'use strict';
const express  = require('express');
const multer   = require('multer');
const { queueAIBatchScore } = require('../utils/queue');
const logger   = require('../utils/logger');
const { body } = require('express-validator');
const router   = express.Router();
const db       = require('../utils/db');
const redis    = require('../utils/redis');
const storage  = require('../services/storageService');
const { getJobRecommendations, getCourseRecommendations } = require('../services/ai/matchingEngineV2');
const { AppError } = require('../middleware/errorHandler');

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } });

/* ── GET /users/profile ─────────────────────────────────────── */
router.get('/profile', async (req, res, next) => {
  try {
    // Fetch core profile based on user type
    let profile = {};

    if (req.user.user_type === 'WORKER') {
      const [wpRow, expRows, eduRows, certRows, statsRow] = await Promise.all([
        db.query('SELECT * FROM worker_profiles WHERE user_id = $1', [req.user.id]),
        db.query('SELECT * FROM work_experiences WHERE worker_id = (SELECT id FROM worker_profiles WHERE user_id=$1) ORDER BY start_date DESC', [req.user.id]),
        db.query('SELECT * FROM educations WHERE worker_id = (SELECT id FROM worker_profiles WHERE user_id=$1) ORDER BY year_end DESC NULLS FIRST', [req.user.id]),
        db.query('SELECT c.*, co.title as course_title FROM certificates c JOIN courses co ON co.id=c.course_id WHERE c.worker_id=$1 ORDER BY c.issued_at DESC', [req.user.id]),
        db.query('SELECT * FROM profile_stats WHERE worker_id = (SELECT id FROM worker_profiles WHERE user_id=$1)', [req.user.id]),
      ]);
      profile = {
        ...wpRow.rows[0],
        email:       req.user.email,
        experiences: expRows.rows,
        education:   eduRows.rows,
        certificates: certRows.rows,
        stats: statsRow.rows[0] || { profile_views: 0, search_appearances: 0 },
      };
    } else if (req.user.user_type === 'EMPLOYER') {
      const { rows } = await db.query('SELECT *, $2 as email FROM employer_profiles WHERE user_id=$1', [req.user.id, req.user.email]);
      profile = rows[0] || {};
    } else if (req.user.user_type === 'TRAINER') {
      const { rows } = await db.query('SELECT * FROM trainer_profiles WHERE user_id=$1', [req.user.id]);
      profile = { ...rows[0], email: req.user.email };
    }

    res.json({ ...profile, user_type: req.user.user_type, balance: req.user.balance });
  } catch (err) { next(err); }
});

/* ── PUT /users/profile ─────────────────────────────────────── */
router.put('/profile', [
  body('full_name').optional().isLength({ min: 2, max: 255 }),
  body('headline').optional().isLength({ max: 500 }),
  body('bio').optional().isLength({ max: 2000 }),
], async (req, res, next) => {
  try {
    const { full_name, headline, bio, location, years_experience, education_level, linkedin_url, github_url, is_seeking } = req.body;

    if (req.user.user_type === 'WORKER') {
      const { rows } = await db.query(`
        UPDATE worker_profiles SET
          full_name       = COALESCE($2, full_name),
          headline        = COALESCE($3, headline),
          bio             = COALESCE($4, bio),
          location        = COALESCE($5, location),
          years_experience = COALESCE($6, years_experience),
          education_level = COALESCE($7, education_level),
          linkedin_url    = COALESCE($8, linkedin_url),
          github_url      = COALESCE($9, github_url),
          is_seeking      = COALESCE($10, is_seeking),
          completion_pct  = CASE
            WHEN bio IS NOT NULL AND array_length(skills,1)>=4 THEN 100
            WHEN array_length(skills,1)>=2 THEN 80
            ELSE 60 END
        WHERE user_id = $1 RETURNING *
      `, [req.user.id, full_name, headline, bio, location, years_experience, education_level, linkedin_url, github_url, is_seeking]);

      // Invalidate AI cache
      await redis.del(`recs:jobs:${req.user.id}`);
      await redis.del(`recs:courses:${req.user.id}`);
      await redis.del(`batch:scores:${req.user.id}`);
      // Queue async AI batch rescoring
      await queueAIBatchScore(req.user.id);

      res.json(rows[0]);
    } else if (req.user.user_type === 'EMPLOYER') {
      const { rows } = await db.query(`
        UPDATE employer_profiles SET
          company_name = COALESCE($2, company_name),
          description  = COALESCE($3, description),
          website      = COALESCE($4, website),
          industry     = COALESCE($5, industry)
        WHERE user_id = $1 RETURNING *
      `, [req.user.id, req.body.company_name, req.body.description, req.body.website, req.body.industry]);
      res.json(rows[0]);
    } else if (req.user.user_type === 'TRAINER') {
      const { rows } = await db.query(`
        UPDATE trainer_profiles SET
          full_name   = COALESCE($2, full_name),
          bio         = COALESCE($3, bio),
          specialties = COALESCE($4, specialties)
        WHERE user_id = $1 RETURNING *
      `, [req.user.id, req.body.full_name, req.body.bio, req.body.specialties]);
      res.json(rows[0]);
    }
  } catch (err) { next(err); }
});

/* ── PUT /users/skills ──────────────────────────────────────── */
router.put('/skills', [body('skills').isArray({ min: 1 })], async (req, res, next) => {
  try {
    if (req.user.user_type !== 'WORKER') throw new AppError('FORBIDDEN', 403);
    const { rows } = await db.query(
      `UPDATE worker_profiles SET skills = $2, updated_at = NOW() WHERE user_id = $1 RETURNING skills, completion_pct`,
      [req.user.id, req.body.skills]
    );
    await redis.del(`recs:jobs:${req.user.id}`);
    await redis.del(`batch:scores:${req.user.id}`);
    res.json(rows[0]);
  } catch (err) { next(err); }
});

/* ── POST /users/experience ─────────────────────────────────── */
router.post('/experience', [
  body('title').notEmpty(),
  body('company').notEmpty(),
  body('start_date').isISO8601(),
], async (req, res, next) => {
  try {
    if (req.user.user_type !== 'WORKER') throw new AppError('FORBIDDEN', 403);
    const wpRow = await db.query('SELECT id FROM worker_profiles WHERE user_id=$1', [req.user.id]);
    if (!wpRow.rows.length) throw new AppError('PROFILE_NOT_FOUND', 404);

    const { rows } = await db.query(`
      INSERT INTO work_experiences (worker_id, title, company, company_logo, start_date, end_date, is_current, description, skills)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *
    `, [wpRow.rows[0].id, req.body.title, req.body.company, req.body.company_logo,
        req.body.start_date, req.body.end_date || null, req.body.is_current || false,
        req.body.description, req.body.skills || []]);

    // Recalculate years_experience
    await db.query(`
      UPDATE worker_profiles SET
        years_experience = (
          SELECT COALESCE(EXTRACT(YEAR FROM AGE(COALESCE(MAX(end_date), NOW()), MIN(start_date)))::INT, 0)
          FROM work_experiences WHERE worker_id = $1
        )
      WHERE id = $1
    `, [wpRow.rows[0].id]);

    res.status(201).json(rows[0]);
  } catch (err) { next(err); }
});

/* ── PUT /users/experience/:id ──────────────────────────────── */
router.put('/experience/:id', async (req, res, next) => {
  try {
    const { rows } = await db.query(`
      UPDATE work_experiences SET
        title       = COALESCE($3, title),
        company     = COALESCE($4, company),
        start_date  = COALESCE($5, start_date),
        end_date    = $6,
        is_current  = COALESCE($7, is_current),
        description = COALESCE($8, description),
        skills      = COALESCE($9, skills)
      WHERE id = $2 AND worker_id = (SELECT id FROM worker_profiles WHERE user_id=$1)
      RETURNING *
    `, [req.user.id, req.params.id, req.body.title, req.body.company,
        req.body.start_date, req.body.end_date, req.body.is_current,
        req.body.description, req.body.skills]);
    if (!rows.length) throw new AppError('NOT_FOUND', 404);
    res.json(rows[0]);
  } catch (err) { next(err); }
});

/* ── DELETE /users/experience/:id ───────────────────────────── */
router.delete('/experience/:id', async (req, res, next) => {
  try {
    await db.query(
      `DELETE FROM work_experiences WHERE id=$1 AND worker_id=(SELECT id FROM worker_profiles WHERE user_id=$2)`,
      [req.params.id, req.user.id]
    );
    res.json({ success: true });
  } catch (err) { next(err); }
});

/* ── POST /users/education ──────────────────────────────────── */
router.post('/education', [body('school').notEmpty(), body('degree').notEmpty()], async (req, res, next) => {
  try {
    if (req.user.user_type !== 'WORKER') throw new AppError('FORBIDDEN', 403);
    const wpRow = await db.query('SELECT id FROM worker_profiles WHERE user_id=$1', [req.user.id]);
    const { rows } = await db.query(`
      INSERT INTO educations (worker_id, school, degree, field, year_start, year_end, gpa, logo)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *
    `, [wpRow.rows[0].id, req.body.school, req.body.degree, req.body.field,
        req.body.year_start, req.body.year_end, req.body.gpa, req.body.logo]);
    res.status(201).json(rows[0]);
  } catch (err) { next(err); }
});

/* ── POST /users/cv — Upload CV ─────────────────────────────── */
router.post('/cv', upload.single('cv'), async (req, res, next) => {
  try {
    if (!req.file) throw new AppError('NO_FILE', 400, 'CV file required');
    if (req.file.mimetype !== 'application/pdf') throw new AppError('INVALID_TYPE', 400, 'Only PDF files accepted');

    const url = await storage.uploadFile(`cvs/${req.user.id}/cv.pdf`, req.file.buffer, 'application/pdf');
    await db.query('UPDATE worker_profiles SET cv_url=$2, updated_at=NOW() WHERE user_id=$1', [req.user.id, url]);
    res.json({ cv_url: url });
  } catch (err) { next(err); }
});

/* ── POST /users/avatar — Upload Avatar ─────────────────────── */
router.post('/avatar', upload.single('avatar'), async (req, res, next) => {
  try {
    if (!req.file) throw new AppError('NO_FILE', 400);
    const url = await storage.uploadFile(`avatars/${req.user.id}/avatar`, req.file.buffer, req.file.mimetype);
    const table = { WORKER: 'worker_profiles', EMPLOYER: 'employer_profiles', TRAINER: 'trainer_profiles' }[req.user.user_type];
    await db.query(`UPDATE ${table} SET avatar_url=$2 WHERE user_id=$1`, [req.user.id, url]);
    res.json({ avatar_url: url });
  } catch (err) { next(err); }
});

/* ── GET /users/enrollments ─────────────────────────────────── */
router.get('/enrollments', async (req, res, next) => {
  try {
    const { rows } = await db.query(`
      SELECT e.*, c.title, c.thumbnail_url, c.outcome_skills, c.trainer_id,
             tp.full_name as trainer_name
      FROM enrollments e
      JOIN courses c ON c.id = e.course_id
      LEFT JOIN trainer_profiles tp ON tp.user_id = c.trainer_id
      WHERE e.worker_id = $1
      ORDER BY e.enrolled_at DESC
    `, [req.user.id]);
    res.json(rows);
  } catch (err) { next(err); }
});

/* ── GET /users/applications ────────────────────────────────── */
router.get('/applications', async (req, res, next) => {
  try {
    const { rows } = await db.query(`
      SELECT a.*, j.title as job_title, j.location, j.salary_display, j.job_type,
             ep.company_name
      FROM applications a
      JOIN job_postings j ON j.id = a.job_id
      LEFT JOIN employer_profiles ep ON ep.user_id = j.employer_id
      WHERE a.worker_id = $1
      ORDER BY a.applied_at DESC
    `, [req.user.id]);
    res.json(rows);
  } catch (err) { next(err); }
});

module.exports = router;
