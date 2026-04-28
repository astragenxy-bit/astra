'use strict';
require('dotenv').config();
const express  = require('express');
const bcrypt   = require('bcryptjs');
const jwt      = require('jsonwebtoken');
const crypto   = require('crypto');
const { v4: uuidv4 } = require('uuid');
const { body, validationResult } = require('express-validator');
const router   = express.Router();
const db       = require('../utils/db');
const redis    = require('../utils/redis');
const mailer   = require('../utils/mailer');
const logger   = require('../utils/logger');
const { AppError } = require('../middleware/errorHandler');

/* ── Helpers ───────────────────────────────────────────────── */
const generateOTP = () => Math.floor(100000 + Math.random() * 900000).toString();

const signTokens = (userId) => ({
  access:  jwt.sign({ sub: userId }, process.env.JWT_SECRET, { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }),
  refresh: jwt.sign({ sub: userId, type: 'refresh' }, process.env.JWT_SECRET, { expiresIn: '30d' }),
});

const storeRefreshToken = async (client, userId, token, ip, ua) => {
  const hash = crypto.createHash('sha256').update(token).digest('hex');
  await client.query(
    `INSERT INTO refresh_tokens (user_id, token_hash, expires_at, ip_address, user_agent)
     VALUES ($1, $2, NOW()+INTERVAL '30 days', $3, $4)`,
    [userId, hash, ip, ua]
  );
};

/* ── Rate limit helper ─────────────────────────────────────── */
const MAX_ATTEMPTS = 5;
const LOCKOUT_MIN  = 15;

async function checkLoginAttempts(email) {
  const key    = `login:fail:${email}`;
  const count  = await redis.get(key);
  if (count && parseInt(count) >= MAX_ATTEMPTS) {
    const ttl = await redis.ttl(key);
    throw new AppError('ACCOUNT_LOCKED', 429, `Too many failed attempts. Try again in ${Math.ceil(ttl/60)} minutes.`);
  }
}

async function recordFailedLogin(email) {
  const key = `login:fail:${email}`;
  await redis.multi().incr(key).expire(key, LOCKOUT_MIN * 60).exec();
}

async function clearLoginAttempts(email) {
  await redis.del(`login:fail:${email}`);
}

/* ── POST /auth/register ───────────────────────────────────── */
router.post('/register', [
  body('email').isEmail().normalizeEmail(),
  body('password').isLength({ min: 8 }).withMessage('Password must be at least 8 characters'),
  body('user_type').isIn(['WORKER', 'EMPLOYER', 'TRAINER']),
  body('full_name').optional().trim().isLength({ min: 2, max: 255 }),
], async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(422).json({ errors: errors.array() });

    const { email, password, user_type, full_name } = req.body;

    const existing = await db.query('SELECT id FROM users WHERE email = $1', [email]);
    if (existing.rows.length) throw new AppError('EMAIL_ALREADY_EXISTS', 409, 'Email already registered');

    const hash   = await bcrypt.hash(password, 12);
    const userId = uuidv4();

    await db.transaction(async (client) => {
      await client.query(
        `INSERT INTO users (id, email, password_hash, user_type) VALUES ($1,$2,$3,$4)`,
        [userId, email, hash, user_type]
      );
      await client.query(`INSERT INTO credit_wallets (user_id) VALUES ($1)`, [userId]);

      const name = full_name || email.split('@')[0];
      if (user_type === 'WORKER') {
        await client.query(`INSERT INTO worker_profiles (user_id, full_name) VALUES ($1,$2)`, [userId, name]);
        await client.query(`INSERT INTO profile_stats (worker_id) SELECT id FROM worker_profiles WHERE user_id=$1`, [userId]);
      } else if (user_type === 'EMPLOYER') {
        await client.query(`INSERT INTO employer_profiles (user_id, company_name) VALUES ($1,$2)`, [userId, name]);
      } else if (user_type === 'TRAINER') {
        await client.query(`INSERT INTO trainer_profiles (user_id, full_name) VALUES ($1,$2)`, [userId, name]);
      }
    });

    const otp = generateOTP();
    await redis.setex(`otp:${email}:EMAIL_VERIFY`, 300, JSON.stringify({ code: otp, attempts: 0, userId }));
    await mailer.sendOTP(email, otp);

    logger.info({ userId, email, user_type }, 'User registered');
    res.status(201).json({ message: 'Registration successful. Check your email for OTP.', userId, status: 'PENDING_VERIFY' });
  } catch (err) { next(err); }
});

/* ── POST /auth/verify-otp ─────────────────────────────────── */
router.post('/verify-otp', [
  body('email').isEmail().normalizeEmail(),
  body('otp').isLength({ min: 6, max: 6 }).isNumeric(),
], async (req, res, next) => {
  try {
    const { email, otp } = req.body;
    const otpKey = `otp:${email}:EMAIL_VERIFY`;
    const raw    = await redis.get(otpKey);

    if (!raw) throw new AppError('OTP_EXPIRED', 400, 'OTP expired. Please request a new one.');
    const { code, attempts, userId } = JSON.parse(raw);

    if (attempts >= 3) {
      await redis.del(otpKey);
      throw new AppError('OTP_MAX_ATTEMPTS', 400, 'Too many attempts. Please request a new OTP.');
    }
    if (code !== otp) {
      await redis.set(otpKey, JSON.stringify({ code, attempts: attempts + 1, userId }), 'KEEPTTL');
      throw new AppError('INVALID_OTP', 400, `Invalid OTP. ${2 - attempts} attempts remaining.`);
    }

    await db.query(`UPDATE users SET status='ACTIVE', email_verified_at=NOW() WHERE id=$1`, [userId]);
    await redis.del(otpKey);

    const tokens = signTokens(userId);
    await db.transaction(async (client) => {
      await storeRefreshToken(client, userId, tokens.refresh, req.ip, req.headers['user-agent']);
    });

    const { rows } = await db.query(`SELECT id,email,user_type FROM users WHERE id=$1`, [userId]);
    logger.info({ userId }, 'Email verified');
    res.json({ access_token: tokens.access, refresh_token: tokens.refresh, user: rows[0] });
  } catch (err) { next(err); }
});

/* ── POST /auth/login ──────────────────────────────────────── */
router.post('/login', [
  body('email').isEmail().normalizeEmail(),
  body('password').notEmpty(),
], async (req, res, next) => {
  try {
    const { email, password } = req.body;
    await checkLoginAttempts(email);

    const { rows } = await db.query(
      `SELECT u.*, w.balance FROM users u
       LEFT JOIN credit_wallets w ON w.user_id=u.id
       WHERE u.email=$1`, [email]
    );
    if (!rows.length) {
      await recordFailedLogin(email);
      throw new AppError('INVALID_CREDENTIALS', 401, 'Invalid email or password');
    }
    const user = rows[0];

    if (user.status === 'PENDING_VERIFY') throw new AppError('EMAIL_NOT_VERIFIED', 403, 'Please verify your email first');
    if (user.status === 'SUSPENDED')      throw new AppError('ACCOUNT_SUSPENDED',   403, 'Account suspended. Contact support.');

    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) {
      await recordFailedLogin(email);
      throw new AppError('INVALID_CREDENTIALS', 401, 'Invalid email or password');
    }

    await clearLoginAttempts(email);
    await db.query(`UPDATE users SET last_login_at=NOW() WHERE id=$1`, [user.id]);

    const tokens = signTokens(user.id);
    await db.transaction(async (client) => {
      await storeRefreshToken(client, user.id, tokens.refresh, req.ip, req.headers['user-agent']);
    });

    logger.info({ userId: user.id, email }, 'User logged in');
    res.json({
      access_token:  tokens.access,
      refresh_token: tokens.refresh,
      user: { id: user.id, email: user.email, user_type: user.user_type, balance: user.balance },
    });
  } catch (err) { next(err); }
});

/* ── POST /auth/logout ─────────────────────────────────────── */
router.post('/logout', async (req, res, next) => {
  try {
    const token = req.headers.authorization?.replace('Bearer ', '');
    if (token) {
      const hash = crypto.createHash('sha256').update(token).digest('hex');
      await db.query(`UPDATE refresh_tokens SET revoked_at=NOW() WHERE token_hash=$1`, [hash]);
    }
    res.json({ message: 'Logged out successfully' });
  } catch (err) { next(err); }
});

/* ── POST /auth/resend-otp ─────────────────────────────────── */
router.post('/resend-otp', [body('email').isEmail().normalizeEmail()], async (req, res, next) => {
  try {
    const { email } = req.body;
    const limitKey = `otp:limit:${email}`;
    if (await redis.get(limitKey)) throw new AppError('RATE_LIMITED', 429, 'Wait 1 minute before requesting a new OTP');

    const { rows } = await db.query(`SELECT id FROM users WHERE email=$1 AND status='PENDING_VERIFY'`, [email]);
    if (!rows.length) return res.json({ message: 'If the email exists, an OTP has been sent.' });

    const otp = generateOTP();
    await redis.setex(`otp:${email}:EMAIL_VERIFY`, 300, JSON.stringify({ code: otp, attempts: 0, userId: rows[0].id }));
    await redis.setex(limitKey, 60, '1');
    await mailer.sendOTP(email, otp);
    res.json({ message: 'OTP sent successfully.' });
  } catch (err) { next(err); }
});

/* ── POST /auth/forgot-password ────────────────────────────── */
router.post('/forgot-password', [body('email').isEmail().normalizeEmail()], async (req, res, next) => {
  try {
    const { email } = req.body;
    const { rows } = await db.query(`SELECT id FROM users WHERE email=$1 AND status='ACTIVE'`, [email]);
    // Always respond 200 to prevent email enumeration
    if (!rows.length) return res.json({ message: 'If the email exists, a reset link has been sent.' });

    const token   = crypto.randomBytes(32).toString('hex');
    const expires = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

    await redis.setex(`pwd:reset:${token}`, 3600, JSON.stringify({ userId: rows[0].id, email }));

    const resetUrl = `${process.env.CORS_ORIGIN}/reset-password?token=${token}`;
    await mailer.sendMail({
      to:      email,
      subject: 'WorkLearn – Đặt lại mật khẩu',
      html: `
        <div style="font-family:Arial,sans-serif;max-width:480px;margin:0 auto;padding:32px">
          <h2 style="color:#F97316">WorkLearn</h2>
          <p>Nhấn vào link bên dưới để đặt lại mật khẩu (hết hạn sau 1 giờ):</p>
          <a href="${resetUrl}" style="display:inline-block;background:#F97316;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:bold">Đặt lại mật khẩu</a>
          <p style="color:#666;font-size:12px;margin-top:24px">Nếu bạn không yêu cầu, hãy bỏ qua email này.</p>
        </div>`,
    });

    logger.info({ email }, 'Password reset requested');
    res.json({ message: 'If the email exists, a reset link has been sent.' });
  } catch (err) { next(err); }
});

/* ── POST /auth/reset-password ─────────────────────────────── */
router.post('/reset-password', [
  body('token').notEmpty(),
  body('password').isLength({ min: 8 }),
], async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(422).json({ errors: errors.array() });

    const { token, password } = req.body;
    const raw = await redis.get(`pwd:reset:${token}`);
    if (!raw) throw new AppError('TOKEN_INVALID', 400, 'Invalid or expired reset token');

    const { userId } = JSON.parse(raw);
    const hash = await bcrypt.hash(password, 12);
    await db.query(`UPDATE users SET password_hash=$2 WHERE id=$1`, [userId, hash]);
    await redis.del(`pwd:reset:${token}`);
    // Revoke all refresh tokens for this user
    await db.query(`UPDATE refresh_tokens SET revoked_at=NOW() WHERE user_id=$1`, [userId]);

    logger.info({ userId }, 'Password reset completed');
    res.json({ message: 'Password reset successfully. Please log in.' });
  } catch (err) { next(err); }
});

/* ── POST /auth/refresh ────────────────────────────────────── */
router.post('/refresh', async (req, res, next) => {
  try {
    const token = req.headers.authorization?.replace('Bearer ', '') || req.body.refresh_token;
    if (!token) throw new AppError('NO_TOKEN', 401, 'Refresh token required');

    const payload = jwt.verify(token, process.env.JWT_SECRET);
    if (payload.type !== 'refresh') throw new AppError('INVALID_TOKEN', 401, 'Invalid refresh token');

    // Check not revoked
    const hash = crypto.createHash('sha256').update(token).digest('hex');
    const { rows } = await db.query(
      `SELECT id FROM refresh_tokens WHERE token_hash=$1 AND revoked_at IS NULL AND expires_at > NOW()`,
      [hash]
    );
    if (!rows.length) throw new AppError('TOKEN_REVOKED', 401, 'Refresh token revoked or expired');

    // Rotate: revoke old, issue new
    await db.query(`UPDATE refresh_tokens SET revoked_at=NOW() WHERE token_hash=$1`, [hash]);
    const tokens = signTokens(payload.sub);
    await db.transaction(async (client) => {
      await storeRefreshToken(client, payload.sub, tokens.refresh, req.ip, req.headers['user-agent']);
    });

    res.json({ access_token: tokens.access, refresh_token: tokens.refresh });
  } catch (err) {
    if (err.name === 'JsonWebTokenError' || err.name === 'TokenExpiredError')
      return next(new AppError('INVALID_TOKEN', 401, 'Invalid or expired token'));
    next(err);
  }
});

/* ── POST /auth/change-password ────────────────────────────── */
router.post('/change-password', [
  body('current_password').notEmpty(),
  body('new_password').isLength({ min: 8 }),
], async (req, res, next) => {
  try {
    const token = req.headers.authorization?.replace('Bearer ', '');
    if (!token) throw new AppError('NO_TOKEN', 401);
    const payload = jwt.verify(token, process.env.JWT_SECRET);

    const { rows } = await db.query(`SELECT password_hash FROM users WHERE id=$1`, [payload.sub]);
    const valid = await bcrypt.compare(req.body.current_password, rows[0].password_hash);
    if (!valid) throw new AppError('INVALID_PASSWORD', 400, 'Current password is incorrect');

    const hash = await bcrypt.hash(req.body.new_password, 12);
    await db.query(`UPDATE users SET password_hash=$2 WHERE id=$1`, [payload.sub, hash]);
    await db.query(`UPDATE refresh_tokens SET revoked_at=NOW() WHERE user_id=$1`, [payload.sub]);

    res.json({ message: 'Password changed successfully. Please log in again.' });
  } catch (err) { next(err); }
});

module.exports = router;
