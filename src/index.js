/**
 * WorkLearn API - Cloudflare Workers
 * Full backend running on edge
 */

import { Router } from 'itty-router'

const router = Router()

// ── Auth Routes ──
router.post('/api/v1/auth/register', async (request, env) => {
  try {
    const { email, password, name } = await request.json()
    
    if (!email || !password) {
      return new Response(JSON.stringify({ error: 'Missing fields' }), { status: 400 })
    }

    // Hash password (simple example - use bcrypt in production)
    const hashedPassword = await hashPassword(password)
    
    // Store in D1
    const db = env.DB
    const stmt = await db.prepare(
      `INSERT INTO users (email, password, name, created_at) VALUES (?, ?, ?, datetime('now'))`
    ).bind(email, hashedPassword, name)
    
    const result = await stmt.run()
    
    if (!result.success) {
      return new Response(JSON.stringify({ error: 'User already exists' }), { status: 400 })
    }

    return new Response(JSON.stringify({ 
      message: 'User registered successfully',
      user_id: result.meta.last_row_id
    }), { status: 201 })
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), { status: 500 })
  }
})

router.post('/api/v1/auth/login', async (request, env) => {
  try {
    const { email, password } = await request.json()
    
    const db = env.DB
    const user = await db.prepare(
      `SELECT id, password, name FROM users WHERE email = ? LIMIT 1`
    ).bind(email).first()

    if (!user) {
      return new Response(JSON.stringify({ error: 'Invalid credentials' }), { status: 401 })
    }

    const passwordMatch = await verifyPassword(password, user.password)
    if (!passwordMatch) {
      return new Response(JSON.stringify({ error: 'Invalid credentials' }), { status: 401 })
    }

    const token = generateToken(user.id, env)
    
    return new Response(JSON.stringify({ 
      token,
      user: { id: user.id, email, name: user.name }
    }), { status: 200 })
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), { status: 500 })
  }
})

// ── Course Routes ──
router.get('/api/v1/courses', async (request, env) => {
  try {
    const db = env.DB
    const courses = await db.prepare(
      `SELECT id, title, description, instructor_id, price, created_at 
       FROM courses LIMIT 50`
    ).all()

    return new Response(JSON.stringify(courses.results), { 
      headers: { 'Content-Type': 'application/json' } 
    })
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), { status: 500 })
  }
})

router.get('/api/v1/courses/:id', async (request, env) => {
  try {
    const { id } = request.params
    const db = env.DB
    const course = await db.prepare(
      `SELECT * FROM courses WHERE id = ? LIMIT 1`
    ).bind(id).first()

    if (!course) {
      return new Response(JSON.stringify({ error: 'Course not found' }), { status: 404 })
    }

    return new Response(JSON.stringify(course), { 
      headers: { 'Content-Type': 'application/json' } 
    })
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), { status: 500 })
  }
})

// ── AI Routes (Claude) ──
router.post('/api/v1/ai/analyze', async (request, env) => {
  try {
    const { text } = await request.json()
    
    if (!text) {
      return new Response(JSON.stringify({ error: 'Missing text' }), { status: 400 })
    }

    // Call Claude API
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json'
      },
      body: JSON.stringify({
        model: 'claude-3-sonnet-20240229',
        max_tokens: 1024,
        messages: [
          {
            role: 'user',
            content: `Analyze this learning content and provide insights:\n\n${text}`
          }
        ]
      })
    })

    const result = await response.json()
    
    return new Response(JSON.stringify({
      analysis: result.content[0].text
    }), { status: 200 })
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), { status: 500 })
  }
})

// ── Health Check ──
router.get('/api/v1/health', () => {
  return new Response(JSON.stringify({ 
    status: 'ok',
    service: 'WorkLearn API',
    timestamp: new Date().toISOString()
  }), { status: 200 })
})

// ── CORS Middleware ──
const corsHeaders = {
  'Access-Control-Allow-Origin': 'https://career.jokerow.com',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization'
}

router.options('*', () => new Response(null, { headers: corsHeaders }))

// ── Main Handler ──
export default {
  fetch: async (request, env, ctx) => {
    // Add CORS headers
    const response = await router.handle(request, env, ctx)
    Object.entries(corsHeaders).forEach(([key, value]) => {
      response.headers.set(key, value)
    })
    return response
  }
}

// ── Utility Functions ──
async function hashPassword(password) {
  // For production, use proper bcrypt
  return btoa(password)
}

async function verifyPassword(password, hash) {
  return btoa(password) === hash
}

function generateToken(userId, env) {
  // Simple JWT-like token
  const payload = {
    sub: userId,
    iat: Math.floor(Date.now() / 1000),
    exp: Math.floor(Date.now() / 1000) + 604800 // 7 days
  }
  return btoa(JSON.stringify(payload))
}
