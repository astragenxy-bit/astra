// ── services/notificationService.js ─────────────────────────
'use strict';
const db     = require('../utils/db');
const mailer = require('../utils/mailer');

/**
 * Insert in-app notification + optionally send email
 */
async function notify({ userId, type, title, body, refType, refId, sendEmail = false, emailSubject, emailHtml }) {
  // Insert in-app notification
  await db.query(`
    INSERT INTO notifications (user_id, type, title, body, channel, ref_type, ref_id)
    VALUES ($1, $2, $3, $4, 'IN_APP', $5, $6)
  `, [userId, type, title, body, refType || null, refId || null]);

  // Optionally send email
  if (sendEmail) {
    const { rows } = await db.query('SELECT email FROM users WHERE id=$1', [userId]);
    if (rows.length) {
      await mailer.sendMail({
        to:      rows[0].email,
        subject: emailSubject || title,
        html:    emailHtml || `<p>${body}</p>`,
      }).catch(e => console.warn('Email send failed:', e.message));
    }
  }
}

/** Notify all admins */
async function notifyAdmins(type, title, body, refType, refId) {
  const { rows } = await db.query(`SELECT id FROM users WHERE user_type='ADMIN' AND status='ACTIVE'`);
  await Promise.all(rows.map(r => notify({ userId: r.id, type, title, body, refType, refId })));
}

/** Bulk mark notifications read */
async function markAllRead(userId) {
  await db.query(`UPDATE notifications SET read_at=NOW() WHERE user_id=$1 AND read_at IS NULL`, [userId]);
}

/** Get unread count */
async function getUnreadCount(userId) {
  const { rows } = await db.query(`SELECT COUNT(*) FROM notifications WHERE user_id=$1 AND read_at IS NULL`, [userId]);
  return parseInt(rows[0].count);
}

module.exports = { notify, notifyAdmins, markAllRead, getUnreadCount };
