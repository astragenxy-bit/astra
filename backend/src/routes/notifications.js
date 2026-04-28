// ── routes/notifications.js ──────────────────────────────────
'use strict';
const express = require('express');
const router  = express.Router();
const db      = require('../utils/db');

router.get('/', async (req, res, next) => {
  try {
    const { page = 1, limit = 30 } = req.query;
    const { rows } = await db.query(`
      SELECT * FROM notifications WHERE user_id=$1
      ORDER BY created_at DESC LIMIT $2 OFFSET $3
    `, [req.user.id, parseInt(limit), (parseInt(page)-1)*parseInt(limit)]);
    const { rows: unread } = await db.query(
      `SELECT COUNT(*) FROM notifications WHERE user_id=$1 AND read_at IS NULL`, [req.user.id]
    );
    res.json({ notifications: rows, unread_count: parseInt(unread[0].count) });
  } catch (err) { next(err); }
});

router.patch('/:id/read', async (req, res, next) => {
  try {
    await db.query(`UPDATE notifications SET read_at=NOW() WHERE id=$1 AND user_id=$2`, [req.params.id, req.user.id]);
    res.json({ success: true });
  } catch (err) { next(err); }
});

router.patch('/read-all', async (req, res, next) => {
  try {
    await db.query(`UPDATE notifications SET read_at=NOW() WHERE user_id=$1 AND read_at IS NULL`, [req.user.id]);
    res.json({ success: true });
  } catch (err) { next(err); }
});

module.exports = router;
