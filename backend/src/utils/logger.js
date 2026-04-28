'use strict';
const pino = require('pino');
const { v4: uuidv4 } = require('uuid');

const logger = pino({
  level: process.env.LOG_LEVEL || (process.env.NODE_ENV === 'production' ? 'info' : 'debug'),
  base:  { service: 'worklearn-api', version: '2.0.0' },
  transport: process.env.NODE_ENV !== 'production'
    ? { target: 'pino-pretty', options: { colorize: true, translateTime: 'HH:MM:ss', ignore: 'pid,hostname' } }
    : undefined,
});

/**
 * Express request logger middleware with unique request IDs
 */
function requestLogger(req, res, next) {
  const requestId = req.headers['x-request-id'] || uuidv4();
  req.requestId   = requestId;
  req.log         = logger.child({ requestId, method: req.method, path: req.path, ip: req.ip });

  res.setHeader('X-Request-Id', requestId);
  const start = Date.now();

  res.on('finish', () => {
    const duration = Date.now() - start;
    const level    = res.statusCode >= 500 ? 'error' : res.statusCode >= 400 ? 'warn' : 'info';
    req.log[level]({ status: res.statusCode, duration }, `${req.method} ${req.path} ${res.statusCode} (${duration}ms)`);
  });

  next();
}

module.exports = logger;
module.exports.requestLogger = requestLogger;
