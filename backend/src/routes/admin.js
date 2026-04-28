// ── routes/admin.js ──────────────────────────────────────────
'use strict';
const express = require('express');
const router  = express.Router();
const db      = require('../utils/db');
const { requireRole } = require('../middleware/auth');
const { AppError } = require('../middleware/errorHandler');
const { indexCourse, removeFromIndex } = require('../services/searchService');
const { rewardCredits } = require('../services/creditService');

const isAdmin = requireRole('ADMIN');

/* ── GET /admin/courses/pending ─────────────────────────────── */
router.get('/courses/pending', isAdmin, async (req, res, next) => {
  try {
    const { rows } = await db.query(`
      SELECT c.*, tp.full_name as trainer_name, tp.avatar_url as trainer_avatar,
             (SELECT COUNT(*) FROM lessons WHERE course_id=c.id) as lesson_count,
             (SELECT COALESCE(SUM(duration_min),0)/60.0 FROM lessons WHERE course_id=c.id) as total_hours
      FROM courses c
      LEFT JOIN trainer_profiles tp ON tp.user_id = c.trainer_id
      WHERE c.status = 'PENDING_REVIEW'
      ORDER BY c.submitted_at ASC
    `);
    res.json(rows);
  } catch (err) { next(err); }
});

/* ── PATCH /admin/courses/:id/approve ───────────────────────── */
router.patch('/courses/:id/approve', isAdmin, async (req, res, next) => {
  try {
    const { rows } = await db.query(`
      UPDATE courses SET status='ACTIVE', approved_at=NOW()
      WHERE id=$1 AND status='PENDING_REVIEW' RETURNING *
    `, [req.params.id]);
    if (!rows.length) throw new AppError('NOT_FOUND', 404);

    await indexCourse(rows[0]);

    await db.query(`
      INSERT INTO notifications (user_id, type, title, body, ref_type, ref_id)
      VALUES ($1, 'COURSE_APPROVED', 'Khóa học đã được duyệt!', $2, 'course', $3)
    `, [rows[0].trainer_id, `"${rows[0].title}" đã được phê duyệt và đang live.`, rows[0].id]);

    res.json(rows[0]);
  } catch (err) { next(err); }
});

/* ── PATCH /admin/courses/:id/reject ───────────────────────── */
router.patch('/courses/:id/reject', isAdmin, async (req, res, next) => {
  try {
    if (!req.body.reason) throw new AppError('REASON_REQUIRED', 422, 'Rejection reason is required');

    const { rows } = await db.query(`
      UPDATE courses SET status='REJECTED', reject_reason=$2
      WHERE id=$1 AND status='PENDING_REVIEW' RETURNING *
    `, [req.params.id, req.body.reason]);
    if (!rows.length) throw new AppError('NOT_FOUND', 404);

    await db.query(`
      INSERT INTO notifications (user_id, type, title, body, ref_type, ref_id)
      VALUES ($1, 'COURSE_REJECTED', 'Khóa học cần chỉnh sửa', $2, 'course', $3)
    `, [rows[0].trainer_id, `Lý do: ${req.body.reason}`, rows[0].id]);

    res.json(rows[0]);
  } catch (err) { next(err); }
});

/* ── GET /admin/users ───────────────────────────────────────── */
router.get('/users', isAdmin, async (req, res, next) => {
  try {
    const { q, type, status, page = 1, limit = 50 } = req.query;
    const params = [parseInt(limit), (parseInt(page)-1)*parseInt(limit)];
    let where = 'WHERE 1=1';
    if (q)      { params.push(`%${q}%`); where += ` AND (u.email ILIKE $${params.length})`; }
    if (type)   { params.push(type);     where += ` AND u.user_type = $${params.length}`; }
    if (status) { params.push(status);   where += ` AND u.status = $${params.length}`; }

    const { rows } = await db.query(`
      SELECT u.id, u.email, u.user_type, u.status, u.created_at, u.last_login_at, w.balance
      FROM users u LEFT JOIN credit_wallets w ON w.user_id=u.id
      ${where} ORDER BY u.created_at DESC LIMIT $1 OFFSET $2
    `, params);
    res.json(rows);
  } catch (err) { next(err); }
});

/* ── PATCH /admin/users/:id/suspend ────────────────────────── */
router.patch('/users/:id/suspend', isAdmin, async (req, res, next) => {
  try {
    const { rows } = await db.query(`
      UPDATE users SET status = CASE WHEN status='ACTIVE' THEN 'SUSPENDED' ELSE 'ACTIVE' END
      WHERE id=$1 RETURNING id, status
    `, [req.params.id]);
    res.json(rows[0]);
  } catch (err) { next(err); }
});

/* ── POST /admin/credits/adjust ─────────────────────────────── */
router.post('/credits/adjust', isAdmin, async (req, res, next) => {
  try {
    const { user_id, amount, reason } = req.body;
    if (!reason) throw new AppError('REASON_REQUIRED', 422, 'Reason required for manual adjustment');

    if (amount > 0) {
      await rewardCredits({ userId: user_id, amount, refType: 'ADMIN_ADJUST', description: reason, idempotencyKey: `admin:adjust:${user_id}:${Date.now()}` });
    } else {
      const { spendCredits } = require('../services/creditService');
      await spendCredits({ userId: user_id, amount: Math.abs(amount), refType: 'ADMIN_ADJUST', description: reason, idempotencyKey: `admin:adjust:${user_id}:${Date.now()}` });
    }

    res.json({ success: true, amount, reason });
  } catch (err) { next(err); }
});

/* ── GET /admin/analytics ───────────────────────────────────── */
router.get('/analytics', isAdmin, async (req, res, next) => {
  try {
    const [userStats, jobStats, courseStats, creditStats] = await Promise.all([
      db.query(`SELECT COUNT(*) as total, COUNT(*) FILTER (WHERE status='ACTIVE') as active,
        COUNT(*) FILTER (WHERE created_at > NOW()-INTERVAL '7 days') as new_this_week FROM users`),
      db.query(`SELECT COUNT(*) as total, COUNT(*) FILTER (WHERE status='ACTIVE') as active,
        COUNT(*) FILTER (WHERE created_at > NOW()-INTERVAL '7 days') as new_this_week FROM job_postings`),
      db.query(`SELECT COUNT(*) as total, COUNT(*) FILTER (WHERE status='ACTIVE') as active,
        COUNT(*) FILTER (WHERE status='PENDING_REVIEW') as pending FROM courses`),
      db.query(`SELECT COALESCE(SUM(CASE WHEN type='TOPUP' THEN amount END),0) as total_topup,
        COALESCE(SUM(CASE WHEN type='SPEND' THEN ABS(amount) END),0) as total_spend
        FROM credit_ledger WHERE created_at > DATE_TRUNC('month', NOW())`),
    ]);

    res.json({
      users:   userStats.rows[0],
      jobs:    jobStats.rows[0],
      courses: courseStats.rows[0],
      credits: creditStats.rows[0],
    });
  } catch (err) { next(err); }
});

module.exports = router;
