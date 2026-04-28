// ── middleware/auth.js ────────────────────────────────────────
'use strict';
const jwt = require('jsonwebtoken');
const db  = require('../utils/db');
const { AppError } = require('./errorHandler');

async function authenticate(req, res, next) {
  try {
    const header = req.headers.authorization;
    if (!header?.startsWith('Bearer ')) throw new AppError('NO_TOKEN', 401, 'Authentication required');

    const token   = header.replace('Bearer ', '');
    const payload = jwt.verify(token, process.env.JWT_SECRET);

    const { rows } = await db.query(
      `SELECT u.id, u.email, u.user_type, u.status, w.balance
       FROM users u LEFT JOIN credit_wallets w ON w.user_id = u.id
       WHERE u.id = $1`,
      [payload.sub]
    );

    if (!rows.length)                throw new AppError('USER_NOT_FOUND', 401, 'User not found');
    if (rows[0].status !== 'ACTIVE') throw new AppError('ACCOUNT_INACTIVE', 403, 'Account is not active');

    req.user = rows[0];
    next();
  } catch (err) {
    if (err.name === 'JsonWebTokenError' || err.name === 'TokenExpiredError')
      return next(new AppError('INVALID_TOKEN', 401, 'Invalid or expired token'));
    next(err);
  }
}

function optionalAuth(req, res, next) {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) return next();
  authenticate(req, res, next);
}

function requireRole(...roles) {
  return (req, res, next) => {
    if (!roles.includes(req.user?.user_type))
      return next(new AppError('FORBIDDEN', 403, `Required role: ${roles.join(' or ')}`));
    next();
  };
}

module.exports = { authenticate, optionalAuth, requireRole };
