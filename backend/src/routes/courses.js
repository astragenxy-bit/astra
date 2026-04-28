'use strict';
const express  = require('express');
const multer   = require('multer');
const cert     = require('../services/certService');
const logger   = require('../utils/logger');
const { body } = require('express-validator');
const router   = express.Router();
const db       = require('../utils/db');
const redis    = require('../utils/redis');
const storage  = require('../services/storageService');
const { AppError } = require('../middleware/errorHandler');
const { authenticate, optionalAuth } = require('../middleware/auth');
const { spendCredits, rewardCredits } = require('../services/creditService');
const { indexCourse } = require('../services/searchService');
const { getConfig } = require('../utils/config');

const videoUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 500 * 1024 * 1024 } }); // 500MB

/* ── GET /courses — Search ──────────────────────────────────── */
router.get('/', optionalAuth, async (req, res, next) => {
  try {
    const { q, level, skill, trainer_id, min_price, max_price, page = 1, limit = 20 } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);
    const params = [];
    let where = `WHERE c.status = 'ACTIVE'`;

    if (q) {
      params.push(`%${q}%`);
      where += ` AND (c.title ILIKE $${params.length} OR c.description ILIKE $${params.length})`;
    }
    if (level)      { params.push(level);      where += ` AND c.level = $${params.length}`; }
    if (trainer_id) { params.push(trainer_id); where += ` AND c.trainer_id = $${params.length}`; }
    if (min_price)  { params.push(min_price);  where += ` AND c.price_credits >= $${params.length}`; }
    if (max_price)  { params.push(max_price);  where += ` AND c.price_credits <= $${params.length}`; }
    if (skill)      { params.push([skill]);     where += ` AND c.outcome_skills && $${params.length}::text[]`; }

    params.push(parseInt(limit), offset);
    const { rows } = await db.query(`
      SELECT c.*, tp.full_name as trainer_name, tp.avatar_url as trainer_avatar
      FROM courses c
      LEFT JOIN trainer_profiles tp ON tp.user_id = c.trainer_id
      ${where}
      ORDER BY c.total_students DESC, c.rating_avg DESC
      LIMIT $${params.length - 1} OFFSET $${params.length}
    `, params);

    res.json({ courses: rows, page: parseInt(page), limit: parseInt(limit) });
  } catch (err) { next(err); }
});

/* ── GET /courses/:id ───────────────────────────────────────── */
router.get('/:id', optionalAuth, async (req, res, next) => {
  try {
    const { rows } = await db.query(`
      SELECT c.*, tp.full_name as trainer_name, tp.bio as trainer_bio, tp.avatar_url as trainer_avatar,
             (SELECT COUNT(*) FROM course_reviews WHERE course_id=c.id) as review_count
      FROM courses c
      LEFT JOIN trainer_profiles tp ON tp.user_id = c.trainer_id
      WHERE c.id = $1 AND (c.status = 'ACTIVE' OR c.trainer_id = $2)
    `, [req.params.id, req.user?.id || '00000000-0000-0000-0000-000000000000']);

    if (!rows.length) throw new AppError('NOT_FOUND', 404, 'Course not found');
    const course = rows[0];

    // Get lessons (locked for non-enrolled)
    const lessonsResult = await db.query(
      'SELECT id, title, description, duration_min, order_index, is_free FROM lessons WHERE course_id=$1 ORDER BY order_index',
      [req.params.id]
    );

    // Check enrollment if logged in
    let enrollment = null;
    if (req.user) {
      const envRow = await db.query('SELECT * FROM enrollments WHERE course_id=$1 AND worker_id=$2', [req.params.id, req.user.id]);
      enrollment = envRow.rows[0] || null;
    }

    res.json({ ...course, lessons: lessonsResult.rows, enrollment });
  } catch (err) { next(err); }
});

/* ── POST /courses — Create (DTDT) ─────────────────────────── */
router.post('/', authenticate, [
  body('title').notEmpty().isLength({ max: 500 }),
  body('description').notEmpty(),
  body('outcome_skills').isArray({ min: 1 }),
  body('price_credits').isInt({ min: 10 }),
], async (req, res, next) => {
  try {
    if (req.user.user_type !== 'TRAINER') throw new AppError('FORBIDDEN', 403);

    const { rows } = await db.query(`
      INSERT INTO courses (trainer_id, title, description, outcome_skills, price_credits, level, duration_hours)
      VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *
    `, [req.user.id, req.body.title, req.body.description, req.body.outcome_skills,
        req.body.price_credits, req.body.level || 'Beginner', req.body.duration_hours]);

    res.status(201).json(rows[0]);
  } catch (err) { next(err); }
});

/* ── POST /courses/:id/lessons — Add lesson ────────────────── */
router.post('/:id/lessons', authenticate, videoUpload.single('video'), async (req, res, next) => {
  try {
    if (req.user.user_type !== 'TRAINER') throw new AppError('FORBIDDEN', 403);

    const course = await db.query('SELECT id FROM courses WHERE id=$1 AND trainer_id=$2', [req.params.id, req.user.id]);
    if (!course.rows.length) throw new AppError('NOT_FOUND', 404);

    let video_url = null;
    if (req.file) {
      const path = `courses/${req.params.id}/lessons/${Date.now()}.mp4`;
      video_url = await storage.uploadFile(path, req.file.buffer, 'video/mp4');
    }

    const orderRow = await db.query('SELECT COALESCE(MAX(order_index),0)+1 as next FROM lessons WHERE course_id=$1', [req.params.id]);
    const { rows } = await db.query(`
      INSERT INTO lessons (course_id, title, description, video_url, duration_min, order_index, is_free)
      VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *
    `, [req.params.id, req.body.title, req.body.description, video_url,
        req.body.duration_min || 0, orderRow.rows[0].next, req.body.is_free || false]);

    // Update lessons_count
    await db.query('UPDATE courses SET lessons_count=(SELECT COUNT(*) FROM lessons WHERE course_id=$1) WHERE id=$1', [req.params.id]);

    res.status(201).json(rows[0]);
  } catch (err) { next(err); }
});

/* ── POST /courses/:id/thumbnail — Upload thumbnail ────────── */
const thumbUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } });
router.post('/:id/thumbnail', authenticate, thumbUpload.single('thumbnail'), async (req, res, next) => {
  try {
    if (req.user.user_type !== 'TRAINER') throw new AppError('FORBIDDEN', 403);
    if (!req.file) throw new AppError('NO_FILE', 400, 'Thumbnail required');
    if (!req.file.mimetype.startsWith('image/')) throw new AppError('INVALID_TYPE', 400, 'Image files only');
    const course = await db.query('SELECT id FROM courses WHERE id=$1 AND trainer_id=$2', [req.params.id, req.user.id]);
    if (!course.rows.length) throw new AppError('NOT_FOUND', 404);
    const url = await storage.uploadFile(`courses/${req.params.id}/thumbnail`, req.file.buffer, req.file.mimetype);
    await db.query('UPDATE courses SET thumbnail_url=$2 WHERE id=$1', [req.params.id, url]);
    res.json({ thumbnail_url: url });
  } catch (err) { next(err); }
});

/* ── PATCH /courses/:id/submit — Submit for review ─────────── */
router.patch('/:id/submit', authenticate, async (req, res, next) => {
  try {
    if (req.user.user_type !== 'TRAINER') throw new AppError('FORBIDDEN', 403);

    const minLessons = parseInt(await getConfig('course_min_lessons'));
    const minHours   = parseFloat(await getConfig('course_min_hours'));

    const { rows: checks } = await db.query(`
      SELECT COUNT(*) as lesson_count,
             COALESCE(SUM(duration_min),0)/60.0 as total_hours
      FROM lessons WHERE course_id=$1
    `, [req.params.id]);

    const { lesson_count, total_hours } = checks[0];
    if (parseInt(lesson_count) < minLessons)
      throw new AppError('VALIDATION_FAILED', 422, `Need at least ${minLessons} lessons (have ${lesson_count})`);
    if (parseFloat(total_hours) < minHours)
      throw new AppError('VALIDATION_FAILED', 422, `Need at least ${minHours} hours content (have ${(+total_hours).toFixed(1)}h)`);

    const { rows } = await db.query(`
      UPDATE courses SET status='PENDING_REVIEW', submitted_at=NOW()
      WHERE id=$1 AND trainer_id=$2 AND status IN ('DRAFT','REJECTED')
      RETURNING *
    `, [req.params.id, req.user.id]);

    if (!rows.length) throw new AppError('NOT_FOUND', 404);

    // Notify admins
    await db.query(`
      INSERT INTO notifications (user_id, type, title, body, ref_type, ref_id)
      SELECT id, 'COURSE_SUBMITTED', 'New course pending review', $1, 'course', $2
      FROM users WHERE user_type='ADMIN'
    `, [`New course: ${rows[0].title} by ${req.user.email}`, req.params.id]);

    res.json(rows[0]);
  } catch (err) { next(err); }
});

/* ── POST /courses/:id/enroll ───────────────────────────────── */
router.post('/:id/enroll', authenticate, async (req, res, next) => {
  try {
    if (req.user.user_type !== 'WORKER') throw new AppError('FORBIDDEN', 403);

    // Check already enrolled
    const existing = await db.query('SELECT id FROM enrollments WHERE course_id=$1 AND worker_id=$2', [req.params.id, req.user.id]);
    if (existing.rows.length) throw new AppError('ALREADY_ENROLLED', 409, 'Already enrolled in this course');

    const { rows: cRows } = await db.query("SELECT * FROM courses WHERE id=$1 AND status='ACTIVE'", [req.params.id]);
    if (!cRows.length) throw new AppError('NOT_FOUND', 404, 'Course not found');
    const course = cRows[0];

    const idempotency = `enroll:${req.user.id}:${course.id}`;

    // Spend credits
    const spendResult = await spendCredits({
      userId: req.user.id, amount: course.price_credits,
      refType: 'COURSE_ENROLL', refId: course.id,
      description: `Enrolled: ${course.title}`,
      idempotencyKey: idempotency,
    });
    if (!spendResult.success)
      throw new AppError('INSUFFICIENT_CREDIT', 402, `Need ${course.price_credits} credits. Have: ${spendResult.balance}`);

    // Reward trainer 80%
    const fee = parseInt(await getConfig('platform_fee_pct')) / 100;
    const trainerReward = Math.round(course.price_credits * (1 - fee));
    await rewardCredits({
      userId: course.trainer_id, amount: trainerReward,
      refType: 'COURSE_SALE', refId: course.id,
      description: `Course sale: ${course.title} (${(1-fee)*100}%)`,
      idempotencyKey: `trainer:sale:${idempotency}`,
    });

    // Create enrollment
    const { rows } = await db.query(`
      INSERT INTO enrollments (course_id, worker_id, credits_paid) VALUES ($1,$2,$3) RETURNING *
    `, [course.id, req.user.id, course.price_credits]);

    // Update total_students
    await db.query('UPDATE courses SET total_students=total_students+1 WHERE id=$1', [course.id]);

    res.status(201).json({ enrollment: rows[0], credits_spent: course.price_credits });
  } catch (err) { next(err); }
});

/* ── PATCH /courses/enrollments/:id/progress ────────────────── */
router.patch('/enrollments/:id/progress', authenticate, async (req, res, next) => {
  try {
    const { lesson_id } = req.body;

    const envRow = await db.query('SELECT e.*, c.lessons_count FROM enrollments e JOIN courses c ON c.id=e.course_id WHERE e.id=$1 AND e.worker_id=$2', [req.params.id, req.user.id]);
    if (!envRow.rows.length) throw new AppError('NOT_FOUND', 404);
    const enr = envRow.rows[0];

    const newDone = lesson_id ? [...new Set([...enr.completed_lessons, lesson_id])] : enr.completed_lessons;
    const pct = enr.lessons_count > 0 ? Math.round((newDone.length / enr.lessons_count) * 100) : 0;

    const { rows } = await db.query(`
      UPDATE enrollments SET completed_lessons=$2, progress_pct=$3, updated_at=NOW()
      WHERE id=$1 RETURNING *
    `, [req.params.id, newDone, pct]);

    res.json({ progress_pct: pct, completed_lessons: newDone, cert_eligible: pct >= 80 });
  } catch (err) { next(err); }
});

/* ── POST /courses/:id/certificate ─────────────────────────── */
router.post('/:id/certificate', authenticate, async (req, res, next) => {
  try {
    const envRow = await db.query('SELECT * FROM enrollments WHERE course_id=$1 AND worker_id=$2', [req.params.id, req.user.id]);
    if (!envRow.rows.length) throw new AppError('NOT_ENROLLED', 403);
    const enr = envRow.rows[0];
    if (enr.progress_pct < 80) throw new AppError('INCOMPLETE', 403, `Need 80% completion (have ${enr.progress_pct}%)`);
    if (enr.certificate_url) return res.json({ certificate_url: enr.certificate_url });

    const { rows: cRows } = await db.query('SELECT * FROM courses WHERE id=$1', [req.params.id]);
    const course = cRows[0];

    // Generate REAL certificate PDF with pdfkit
    const wpRow = await db.query('SELECT full_name FROM worker_profiles WHERE user_id=$1', [req.user.id]);
    const trRow = await db.query('SELECT full_name FROM trainer_profiles WHERE user_id=$1', [course.trainer_id]);
    const { certUrl, credId } = await cert.generateCertificate({
      workerName:  wpRow.rows[0]?.full_name || 'Học viên',
      courseTitle: course.title,
      trainerName: trRow.rows[0]?.full_name,
      completedAt: new Date(),
      enrollmentId: enr.id,
    });

    // Update enrollment
    await db.query(`UPDATE enrollments SET certificate_url=$2, completed_at=NOW() WHERE id=$1`, [enr.id, certUrl]);

    // Insert certificate record
    await db.query(`
      INSERT INTO certificates (enrollment_id, worker_id, course_id, cert_url, cred_id)
      VALUES ($1,$2,$3,$4,$5) ON CONFLICT DO NOTHING
    `, [enr.id, req.user.id, course.id, certUrl, credId]);

    // Add outcome skills to worker profile
    if (course.outcome_skills?.length) {
      await db.query(`
        UPDATE worker_profiles SET skills = array(SELECT DISTINCT unnest(skills || $2))
        WHERE user_id = $1
      `, [req.user.id, course.outcome_skills]);
    }

    // Reward +50 credits
    const reward = parseInt(await getConfig('reward_course_complete'));
    await rewardCredits({
      userId: req.user.id, amount: reward,
      refType: 'REWARD_COURSE_COMPLETE', refId: course.id,
      description: `Completed: ${course.title}`,
      idempotencyKey: `reward:cert:${enr.id}`,
    });

    res.json({ certificate_url: certUrl, cred_id: credId, credits_rewarded: reward });
  } catch (err) { next(err); }
});

/* ── POST /courses/:id/reviews ──────────────────────────────── */
router.post('/:id/reviews', authenticate, [
  body('rating').isInt({ min: 1, max: 5 }),
  body('content').optional().isLength({ min: 50 }),
], async (req, res, next) => {
  try {
    const enr = await db.query('SELECT * FROM enrollments WHERE course_id=$1 AND worker_id=$2', [req.params.id, req.user.id]);
    if (!enr.rows.length || enr.rows[0].progress_pct < 50)
      throw new AppError('FORBIDDEN', 403, 'Complete 50% of the course before reviewing');

    await db.query(`
      INSERT INTO course_reviews (course_id, worker_id, rating, content) VALUES ($1,$2,$3,$4)
      ON CONFLICT (course_id, worker_id) DO UPDATE SET rating=$3, content=$4
    `, [req.params.id, req.user.id, req.body.rating, req.body.content]);

    // Recalculate rating avg
    await db.query(`
      UPDATE courses SET
        rating_avg   = (SELECT AVG(rating) FROM course_reviews WHERE course_id=$1),
        rating_count = (SELECT COUNT(*)    FROM course_reviews WHERE course_id=$1)
      WHERE id=$1
    `, [req.params.id]);

    res.json({ success: true });
  } catch (err) { next(err); }
});

/* ── GET /courses/:id/analytics (DTDT) ─────────────────────── */
router.get('/:id/analytics', authenticate, async (req, res, next) => {
  try {
    if (req.user.user_type !== 'TRAINER') throw new AppError('FORBIDDEN', 403);
    const [course, enrollments, revenue] = await Promise.all([
      db.query('SELECT * FROM courses WHERE id=$1 AND trainer_id=$2', [req.params.id, req.user.id]),
      db.query('SELECT progress_pct, enrolled_at FROM enrollments WHERE course_id=$1', [req.params.id]),
      db.query(`SELECT SUM(amount) as total FROM credit_ledger WHERE user_id=$1 AND ref_id=$2 AND type='REWARD'`, [req.user.id, req.params.id]),
    ]);
    if (!course.rows.length) throw new AppError('NOT_FOUND', 404);

    const enrs = enrollments.rows;
    const completionDist = enrs.reduce((acc, e) => {
      const bucket = Math.floor(e.progress_pct / 25) * 25;
      acc[bucket] = (acc[bucket] || 0) + 1;
      return acc;
    }, {});

    res.json({
      course: course.rows[0],
      total_students:    enrs.length,
      completion_rate:   enrs.length ? Math.round(enrs.filter(e => e.progress_pct >= 80).length / enrs.length * 100) : 0,
      revenue_credits:   parseFloat(revenue.rows[0].total || 0),
      completion_dist:   completionDist,
      enrollments_by_month: await getEnrollmentsByMonth(req.params.id),
    });
  } catch (err) { next(err); }
});

async function getEnrollmentsByMonth(courseId) {
  const { rows } = await db.query(`
    SELECT TO_CHAR(enrolled_at,'YYYY-MM') as month, COUNT(*) as count
    FROM enrollments WHERE course_id=$1
    GROUP BY month ORDER BY month DESC LIMIT 12
  `, [courseId]);
  return rows;
}

module.exports = router;

/* ── GET /courses/verify/:credId — Public cert verification ── */
router.get('/verify/:credId', async (req, res, next) => {
  try {
    const { rows } = await db.query(`
      SELECT c.*, co.title as course_title, wp.full_name as worker_name,
             tp.full_name as trainer_name, c.issued_at
      FROM certificates c
      JOIN courses co ON co.id = c.course_id
      JOIN worker_profiles wp ON wp.user_id = c.worker_id
      LEFT JOIN trainer_profiles tp ON tp.user_id = co.trainer_id
      WHERE c.cred_id = $1
    `, [req.params.credId]);
    if (!rows.length) return res.status(404).json({ valid: false, message: 'Certificate not found' });
    const cert = rows[0];
    res.json({
      valid:       true,
      credential_id: cert.cred_id,
      worker_name:   cert.worker_name,
      course_title:  cert.course_title,
      trainer_name:  cert.trainer_name,
      issued_at:     cert.issued_at,
      issued_by:     'WorkLearn Platform',
    });
  } catch (err) { next(err); }
});
