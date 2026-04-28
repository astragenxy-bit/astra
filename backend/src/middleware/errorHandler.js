// ── middleware/errorHandler.js ────────────────────────────────
'use strict';
class AppError extends Error {
  constructor(code, status, message) {
    super(message || code);
    this.code   = code;
    this.status = status;
    this.isOperational = true;
  }
}

function errorHandler(err, req, res, next) {
  if (err.isOperational) {
    return res.status(err.status || 500).json({ error: err.code, message: err.message });
  }

  console.error('Unexpected error:', err);
  res.status(500).json({ error: 'INTERNAL_ERROR', message: 'An unexpected error occurred' });
}

module.exports = { AppError, errorHandler };
