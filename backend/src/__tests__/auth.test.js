// ── src/__tests__/auth.test.js ────────────────────────────────
'use strict';
const request = require('supertest');
const app     = require('../app');
const db      = require('../utils/db');

beforeAll(async () => {
  // Clean test users
  await db.query("DELETE FROM users WHERE email LIKE '%@test.worklearn'");
});

afterAll(async () => {
  await db.query("DELETE FROM users WHERE email LIKE '%@test.worklearn'");
  await db.pool.end();
});

describe('POST /api/v1/auth/register', () => {
  it('should register a new user and return 201', async () => {
    const res = await request(app).post('/api/v1/auth/register').send({
      email:     'worker1@test.worklearn',
      password:  'password123',
      user_type: 'WORKER',
      full_name: 'Test Worker',
    });
    expect(res.status).toBe(201);
    expect(res.body.status).toBe('PENDING_VERIFY');
  });

  it('should reject duplicate email with 409', async () => {
    await request(app).post('/api/v1/auth/register').send({
      email: 'dup@test.worklearn', password: 'password123', user_type: 'WORKER'
    });
    const res = await request(app).post('/api/v1/auth/register').send({
      email: 'dup@test.worklearn', password: 'password123', user_type: 'WORKER'
    });
    expect(res.status).toBe(409);
  });

  it('should reject weak password with 422', async () => {
    const res = await request(app).post('/api/v1/auth/register').send({
      email: 'weak@test.worklearn', password: '123', user_type: 'WORKER'
    });
    expect(res.status).toBe(422);
  });

  it('should reject invalid user_type with 422', async () => {
    const res = await request(app).post('/api/v1/auth/register').send({
      email: 'bad@test.worklearn', password: 'password123', user_type: 'INVALID'
    });
    expect(res.status).toBe(422);
  });
});

describe('GET /api/v1/health', () => {
  it('should return health status', async () => {
    const res = await request(app).get('/api/v1/health');
    expect(res.status).toBeOneOf([200, 503]);
    expect(res.body).toHaveProperty('status');
    expect(res.body).toHaveProperty('checks');
  });
});

describe('POST /api/v1/auth/login', () => {
  it('should reject non-existent user', async () => {
    const res = await request(app).post('/api/v1/auth/login').send({
      email: 'notexist@test.worklearn', password: 'password123'
    });
    expect(res.status).toBe(401);
  });
});

// Extend expect with custom matcher
expect.extend({
  toBeOneOf(received, values) {
    const pass = values.includes(received);
    return { pass, message: () => `expected ${received} to be one of ${values.join(', ')}` };
  },
});
