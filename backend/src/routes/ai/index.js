'use strict';
/**
 * AI Routes — consolidated AI-native endpoints
 * All Claude + matching intelligence in one place
 */
const express  = require('express');
const multer   = require('multer');
const router   = express.Router();
const { authenticate, optionalAuth } = require('../middleware/auth');
const db       = require('../utils/db');
const redis    = require('../utils/redis');
const logger   = require('../utils/logger');

const claude     = require('../services/claudeService');
const jdParser   = require('../services/ai/jdParserService');
const cvParser   = require('../services/ai/resumeParserService');
const salaryAI   = require('../services/ai/salaryService');
const matching   = require('../services/ai/matchingEngineV2');

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

/* ── Claude AI features (authenticated) ──────────────────── */
router.post('/explain-match',    authenticate, async (req, res, next) => {
  try { res.json({ text: await claude.explainMatchScore(req.body) }); } catch (e) { next(e); }
});
router.post('/cover-letter',     authenticate, async (req, res, next) => {
  try { res.json({ text: await claude.generateCoverLetter(req.body) }); } catch (e) { next(e); }
});
router.post('/profile-analysis', authenticate, async (req, res, next) => {
  try {
    const wpRow = await db.query('SELECT * FROM worker_profiles WHERE user_id=$1', [req.user.id]);
    const expRows = await db.query('SELECT title,company FROM work_experiences WHERE worker_id=(SELECT id FROM worker_profiles WHERE user_id=$1) LIMIT 5', [req.user.id]);
    const body = { ...req.body, experiences: expRows.rows };
    res.json({ text: await claude.analyzeProfile(body) });
  } catch (e) { next(e); }
});
router.post('/interview-prep',   authenticate, async (req, res, next) => {
  try { res.json({ text: await claude.generateInterviewQuestions(req.body) }); } catch (e) { next(e); }
});
router.post('/learning-path',    authenticate, async (req, res, next) => {
  try { res.json({ text: await claude.generateLearningPath(req.body) }); } catch (e) { next(e); }
});
router.post('/chat',             authenticate, async (req, res, next) => {
  try {
    const wp = await db.query('SELECT full_name,headline,skills FROM worker_profiles WHERE user_id=$1', [req.user.id]);
    const profile = wp.rows[0] || { full_name: req.user.email, skills: [] };
    const text = await claude.careerChat({ message: req.body.message, userProfile: profile, conversationHistory: req.body.conversation_history || [] });
    res.json({ text });
  } catch (e) { next(e); }
});

/* ── JD Intelligence ─────────────────────────────────────── */
// Parse raw JD text → structured skills/requirements
router.post('/jd/parse', optionalAuth, async (req, res, next) => {
  try {
    const { text, language } = req.body;
    if (!text?.trim()) return res.status(422).json({ error: 'MISSING_TEXT', message: 'JD text required' });
    const parsed = await jdParser.parseJobDescription(text, language || 'vi');
    res.json(parsed);
  } catch (e) { next(e); }
});

// Suggest skills for job title (autocomplete)
router.get('/jd/skills-suggest', async (req, res, next) => {
  try {
    const { title } = req.query;
    if (!title) return res.json([]);
    const skills = await jdParser.suggestSkillsForTitle(title);
    res.json(skills);
  } catch (e) { next(e); }
});

// Improve JD writing quality
router.post('/jd/improve', authenticate, async (req, res, next) => {
  try {
    if (req.user.user_type !== 'EMPLOYER') return res.status(403).json({ error: 'FORBIDDEN' });
    const improved = await jdParser.improveJobDescription(req.body.jd_text, req.body.tone || 'professional');
    res.json({ text: improved });
  } catch (e) { next(e); }
});

// Recruiter summary for a candidate
router.post('/jd/recruiter-summary', authenticate, async (req, res, next) => {
  try {
    if (req.user.user_type !== 'EMPLOYER') return res.status(403).json({ error: 'FORBIDDEN' });
    const text = await jdParser.writeRecruiterSummary(req.body);
    res.json({ text });
  } catch (e) { next(e); }
});

/* ── CV / Resume Intelligence ────────────────────────────── */
// Parse CV PDF → structured profile
router.post('/cv/parse', authenticate, upload.single('cv'), async (req, res, next) => {
  try {
    if (!req.file) return res.status(422).json({ error: 'NO_FILE', message: 'PDF file required' });
    if (req.file.mimetype !== 'application/pdf') return res.status(422).json({ error: 'INVALID_TYPE' });
    const parsed = await cvParser.parseResume(req.file.buffer);
    const { score, tips } = await cvParser.scoreResumeQuality(parsed);
    res.json({ parsed, quality: { score, tips } });
  } catch (e) { next(e); }
});

// Apply parsed CV data to user profile
router.post('/cv/apply-parsed', authenticate, async (req, res, next) => {
  try {
    if (req.user.user_type !== 'WORKER') return res.status(403).json({ error: 'FORBIDDEN' });
    const { parsed } = req.body;
    if (!parsed) return res.status(422).json({ error: 'MISSING_DATA' });

    await db.transaction(async (client) => {
      // Update worker profile
      await client.query(`
        UPDATE worker_profiles SET
          full_name        = COALESCE($2, full_name),
          headline         = COALESCE($3, headline),
          bio              = COALESCE($4, bio),
          location         = COALESCE($5, location),
          skills           = COALESCE($6, skills),
          years_experience = COALESCE($7, years_experience),
          education_level  = COALESCE($8, education_level),
          linkedin_url     = COALESCE($9, linkedin_url),
          github_url       = COALESCE($10, github_url),
          updated_at       = NOW()
        WHERE user_id = $1
      `, [req.user.id, parsed.full_name, parsed.headline, parsed.bio, parsed.location,
          parsed.skills?.length ? parsed.skills : null,
          parsed.years_experience, parsed.education_level,
          parsed.linkedin_url, parsed.github_url]);

      // Insert experiences
      if (parsed.experiences?.length) {
        const wpRow = await client.query('SELECT id FROM worker_profiles WHERE user_id=$1', [req.user.id]);
        const wpId = wpRow.rows[0].id;
        for (const exp of parsed.experiences) {
          await client.query(`
            INSERT INTO work_experiences (worker_id,title,company,start_date,end_date,is_current,description,skills)
            VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
            ON CONFLICT DO NOTHING
          `, [wpId, exp.title, exp.company, exp.start_date, exp.end_date, exp.is_current || false, exp.description, exp.skills || []]);
        }
      }
      // Insert education
      if (parsed.education?.length) {
        const wpRow = await client.query('SELECT id FROM worker_profiles WHERE user_id=$1', [req.user.id]);
        const wpId = wpRow.rows[0].id;
        for (const edu of parsed.education) {
          await client.query(`
            INSERT INTO educations (worker_id,school,degree,year_start,year_end,gpa)
            VALUES ($1,$2,$3,$4,$5,$6) ON CONFLICT DO NOTHING
          `, [wpId, edu.school, edu.degree, edu.year_start, edu.year_end, edu.gpa]);
        }
      }
    });

    // Invalidate AI caches
    await Promise.all([
      redis.del(`recs:jobs:${req.user.id}`),
      redis.del(`recs:courses:${req.user.id}`),
      redis.del(`batch:scores:${req.user.id}`),
    ]);

    res.json({ success: true, message: 'Profile updated from CV' });
  } catch (e) { next(e); }
});

// Resume gap analysis vs target role
router.post('/cv/gap-analysis', authenticate, async (req, res, next) => {
  try {
    const wp = await db.query('SELECT * FROM worker_profiles WHERE user_id=$1', [req.user.id]);
    const text = await cvParser.analyzeResumeGaps(wp.rows[0] || {}, req.body.target_role || 'Data Analyst');
    res.json({ text });
  } catch (e) { next(e); }
});

/* ── Salary Intelligence ─────────────────────────────────── */
router.post('/salary/predict', optionalAuth, async (req, res, next) => {
  try {
    const result = await salaryAI.predictSalary(req.body);
    res.json(result);
  } catch (e) { next(e); }
});

router.get('/salary/skill-premiums', optionalAuth, async (req, res, next) => {
  try {
    const skills = req.query.skills?.split(',') || [];
    const result = await salaryAI.getSkillSalaryPremiums(skills);
    res.json(result);
  } catch (e) { next(e); }
});

/* ── Matching Score SSE Stream ───────────────────────────── */
// Real-time matching score as user edits profile (SSE)
router.get('/score-stream/:jobId', authenticate, async (req, res, next) => {
  try {
    if (req.user.user_type !== 'WORKER') return res.status(403).json({ error: 'FORBIDDEN' });

    // SSE headers
    res.setHeader('Content-Type',  'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection',    'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no'); // disable nginx buffering
    res.flushHeaders();

    const send = (data) => res.write(`data: ${JSON.stringify(data)}\n\n`);

    // Initial score
    const [wpRow, jobRow] = await Promise.all([
      db.query('SELECT * FROM worker_profiles WHERE user_id=$1', [req.user.id]),
      db.query('SELECT * FROM job_postings WHERE id=$1', [req.params.jobId]),
    ]);

    if (!wpRow.rows.length || !jobRow.rows.length) {
      send({ error: 'NOT_FOUND' }); return res.end();
    }

    const result = matching.calcMatchingScore(wpRow.rows[0], jobRow.rows[0]);
    send({ type: 'score', ...result });

    // Enhance with behavioral score async
    const behavScore = await matching.getBehavioralScore(req.user.id, jobRow.rows[0]);
    const enhanced = Math.min(100, Math.round(result.score * 0.90 + behavScore * 0.10));
    send({ type: 'score_enhanced', score: enhanced, behavioral_bonus: enhanced - result.score });

    // Close after 30s keepalive
    const keepalive = setInterval(() => res.write(':keepalive\n\n'), 15000);
    req.on('close', () => { clearInterval(keepalive); res.end(); });
    setTimeout(() => { clearInterval(keepalive); res.end(); }, 30000);

  } catch (e) { next(e); }
});

/* ── Recommendations ─────────────────────────────────────── */
router.get('/recommendations/jobs', authenticate, async (req, res, next) => {
  try {
    if (req.user.user_type !== 'WORKER') return res.json([]);
    const jobs = await matching.getJobRecommendations(req.user.id, 10);
    res.json(jobs);
  } catch (e) { next(e); }
});

router.get('/recommendations/courses', authenticate, async (req, res, next) => {
  try {
    if (req.user.user_type !== 'WORKER') return res.json([]);
    const courses = await matching.getCourseRecommendations(req.user.id, 5);
    res.json(courses);
  } catch (e) { next(e); }
});

router.get('/recommendations/profile', authenticate, async (req, res, next) => {
  try {
    const [jobs, courses, wpRow] = await Promise.all([
      matching.getJobRecommendations(req.user.id, 4),
      matching.getCourseRecommendations(req.user.id, 4),
      db.query('SELECT skills FROM worker_profiles WHERE user_id=$1', [req.user.id]),
    ]);
    const workerSkills = wpRow.rows[0]?.skills || [];
    const allRequired  = jobs.flatMap(j => j.required_skills || []);
    const missing_skills = [...new Set(allRequired.filter(s => !workerSkills.map(w => w.toLowerCase()).includes(s.toLowerCase())))].slice(0, 8);
    res.json({ jobs, courses, missing_skills });
  } catch (e) { next(e); }
});

/* ── Matching score for specific job ─────────────────────── */
router.get('/match/job/:id', optionalAuth, async (req, res, next) => {
  try {
    if (!req.user) return res.json({ score: 0 });
    const [wp, job] = await Promise.all([
      db.query('SELECT * FROM worker_profiles WHERE user_id=$1', [req.user.id]),
      db.query('SELECT * FROM job_postings WHERE id=$1', [req.params.id]),
    ]);
    if (!wp.rows.length || !job.rows.length) return res.json({ score: 0 });
    const result = matching.calcMatchingScore(wp.rows[0], job.rows[0]);

    // Cache
    await db.query(`INSERT INTO matching_scores (worker_id,job_id,score,matched_skills,missing_skills) VALUES ($1,$2,$3,$4,$5)
      ON CONFLICT (worker_id,job_id) DO UPDATE SET score=$3,matched_skills=$4,missing_skills=$5,computed_at=NOW()`,
      [req.user.id, req.params.id, result.score, result.matched, result.missing]);

    res.json(result);
  } catch (e) { next(e); }
});

/* ── Missing skills → courses for job ───────────────────── */
router.get('/match/job/:id/courses', optionalAuth, async (req, res, next) => {
  try {
    const jobRow = await db.query('SELECT required_skills FROM job_postings WHERE id=$1', [req.params.id]);
    if (!jobRow.rows.length) return res.json([]);
    const workerSkills = req.user
      ? (await db.query('SELECT skills FROM worker_profiles WHERE user_id=$1', [req.user.id])).rows[0]?.skills || []
      : [];
    const missing = jobRow.rows[0].required_skills.filter(s => !workerSkills.map(w => w.toLowerCase()).includes(s.toLowerCase()));
    if (!missing.length) return res.json([]);
    const { rows } = await db.query(`
      SELECT c.*, tp.full_name as trainer_name
      FROM courses c LEFT JOIN trainer_profiles tp ON tp.user_id=c.trainer_id
      WHERE c.status='ACTIVE' AND c.outcome_skills && $1::text[]
      ORDER BY c.rating_avg DESC LIMIT 6
    `, [missing]);
    res.json(rows);
  } catch (e) { next(e); }
});

/* ── Candidate search for employers ─────────────────────── */
router.get('/candidates', authenticate, async (req, res, next) => {
  try {
    if (req.user.user_type !== 'EMPLOYER') return res.status(403).json({ error: 'FORBIDDEN' });
    const { skills, location, min_exp, page = 1, limit = 20 } = req.query;
    let where = 'WHERE wp.is_seeking = true';
    const params = [parseInt(limit), (parseInt(page)-1)*parseInt(limit)];
    if (skills)   { params.push(skills.split(',')); where += ` AND wp.skills && $${params.length}::text[]`; }
    if (location) { params.push(`%${location}%`);   where += ` AND wp.location ILIKE $${params.length}`; }
    if (min_exp)  { params.push(parseInt(min_exp)); where += ` AND wp.years_experience >= $${params.length}`; }
    const { rows } = await db.query(`
      SELECT wp.full_name, wp.headline, wp.skills, wp.location,
             wp.years_experience, wp.avatar_url, wp.completion_pct
      FROM worker_profiles wp ${where}
      ORDER BY wp.completion_pct DESC LIMIT $1 OFFSET $2
    `, params);
    res.json(rows);
  } catch (e) { next(e); }
});

module.exports = router;
