// ── routes/matching.js ───────────────────────────────────────
'use strict';
const express = require('express');
const router  = express.Router();
const db      = require('../utils/db');
const { authenticate, optionalAuth } = require('../middleware/auth');
const { calcMatchingScore, getJobRecommendations, getCourseRecommendations, trackEvent } = require('../services/ai/matchingEngineV2');
const claude  = require('../services/claudeService');
const { AppError } = require('../middleware/errorHandler');

/* ── GET /matching/job/:id/score ────────────────────────────── */
router.get('/job/:id/score', authenticate, async (req, res, next) => {
  try {
    if (req.user.user_type !== 'WORKER') throw new AppError('FORBIDDEN', 403);

    const [wpRow, jobRow] = await Promise.all([
      db.query('SELECT * FROM worker_profiles WHERE user_id=$1', [req.user.id]),
      db.query('SELECT * FROM job_postings WHERE id=$1', [req.params.id]),
    ]);

    if (!wpRow.rows.length || !jobRow.rows.length) throw new AppError('NOT_FOUND', 404);
    const result = calcMatchingScore(wpRow.rows[0], jobRow.rows[0]);

    // Cache score
    await db.query(`
      INSERT INTO matching_scores (worker_id, job_id, score, matched_skills, missing_skills, skill_score, exp_score, edu_score, loc_score)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
      ON CONFLICT (worker_id, job_id) DO UPDATE SET score=$3, matched_skills=$4, missing_skills=$5, computed_at=NOW()
    `, [req.user.id, req.params.id, result.score, result.matched, result.missing,
        result.breakdown.skillScore, result.breakdown.expScore, result.breakdown.eduScore, result.breakdown.locScore]);

    res.json(result);
  } catch (err) { next(err); }
});

/* ── GET /matching/job/:id/courses ──────────────────────────── */
router.get('/job/:id/courses', optionalAuth, async (req, res, next) => {
  try {
    const jobRow = await db.query('SELECT required_skills FROM job_postings WHERE id=$1', [req.params.id]);
    if (!jobRow.rows.length) throw new AppError('NOT_FOUND', 404);

    const workerSkills = req.user ? (await db.query('SELECT skills FROM worker_profiles WHERE user_id=$1', [req.user.id])).rows[0]?.skills || [] : [];
    const missingSkills = jobRow.rows[0].required_skills.filter(s => !workerSkills.map(w => w.toLowerCase()).includes(s.toLowerCase()));

    if (!missingSkills.length) return res.json([]);

    const { rows } = await db.query(`
      SELECT c.*, tp.full_name as trainer_name
      FROM courses c
      LEFT JOIN trainer_profiles tp ON tp.user_id = c.trainer_id
      WHERE c.status = 'ACTIVE' AND c.outcome_skills && $1::text[]
      ORDER BY c.rating_avg DESC, c.total_students DESC
      LIMIT 6
    `, [missingSkills]);

    res.json(rows);
  } catch (err) { next(err); }
});

/* ── GET /recommendations/jobs ──────────────────────────────── */
router.get('/recommendations/jobs', authenticate, async (req, res, next) => {
  try {
    if (req.user.user_type !== 'WORKER') return res.json([]);
    const jobs = await getJobRecommendations(req.user.id, 10);
    res.json(jobs);
  } catch (err) { next(err); }
});

/* ── GET /recommendations/courses ───────────────────────────── */
router.get('/recommendations/courses', authenticate, async (req, res, next) => {
  try {
    if (req.user.user_type !== 'WORKER') return res.json([]);
    const courses = await getCourseRecommendations(req.user.id, 5);
    res.json(courses);
  } catch (err) { next(err); }
});

/* ── GET /recommendations/profile ───────────────────────────── */
router.get('/recommendations/profile', authenticate, async (req, res, next) => {
  try {
    const [jobs, courses, wpRow] = await Promise.all([
      getJobRecommendations(req.user.id, 4),
      getCourseRecommendations(req.user.id, 4),
      db.query(`SELECT skills FROM worker_profiles WHERE user_id=$1`, [req.user.id]),
    ]);

    const workerSkills = wpRow.rows[0]?.skills || [];
    const allJobSkills = jobs.flatMap(j => j.required_skills || []);
    const missing_skills = [...new Set(allJobSkills.filter(s => !workerSkills.map(w => w.toLowerCase()).includes(s.toLowerCase())))].slice(0, 8);

    res.json({ jobs, courses, missing_skills });
  } catch (err) { next(err); }
});

/* ── GET /matching/candidates (NTD) ─────────────────────────── */
router.get('/candidates', authenticate, async (req, res, next) => {
  try {
    if (req.user.user_type !== 'EMPLOYER') throw new AppError('FORBIDDEN', 403);
    const { skills, location, min_exp } = req.query;

    let where = 'WHERE wp.is_seeking = true';
    const params = [];
    if (skills)  { params.push(skills.split(','));  where += ` AND wp.skills && $${params.length}::text[]`; }
    if (location){ params.push(`%${location}%`);   where += ` AND wp.location ILIKE $${params.length}`; }
    if (min_exp) { params.push(parseInt(min_exp)); where += ` AND wp.years_experience >= $${params.length}`; }

    const { rows } = await db.query(`
      SELECT wp.full_name, wp.headline, wp.skills, wp.location, wp.years_experience,
             wp.avatar_url, wp.completion_pct
      FROM worker_profiles wp ${where}
      ORDER BY wp.completion_pct DESC, wp.years_experience DESC
      LIMIT 50
    `, params);

    res.json(rows);
  } catch (err) { next(err); }
});


module.exports = router;
