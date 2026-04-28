'use strict';
/**
 * Salary Intelligence Service — AI-native compensation data
 * Predicts salary range based on skills, location, experience, seniority
 * Powers: NTD salary suggestion when posting, NLD filter by realistic salary
 */
const Anthropic = require('@anthropic-ai/sdk');
const db        = require('../utils/db');
const redis     = require('../utils/redis');

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const MODEL  = 'claude-sonnet-4-20250514';

/**
 * Predict salary range for a job profile
 */
async function predictSalary({ title, skills, location, experienceYears, educationLevel, seniority }) {
  const cacheKey = `salary:${[title, location, experienceYears, seniority].join(':').toLowerCase().replace(/\s/g, '_')}`;
  const cached = await redis.get(cacheKey);
  if (cached) return JSON.parse(cached);

  // 1. Check historical data from our own platform first
  const dbResult = await getSalaryFromDB({ title, location, experienceYears });
  if (dbResult.count >= 5) {
    // Enough data: use percentiles from real posted jobs
    const result = {
      min:    dbResult.p25,
      median: dbResult.p50,
      max:    dbResult.p75,
      source: 'platform_data',
      confidence: 'high',
      sample_size: dbResult.count,
    };
    await redis.setex(cacheKey, 3600, JSON.stringify(result));
    return result;
  }

  // 2. Fallback: Claude with Vietnam market knowledge
  const response = await client.messages.create({
    model: MODEL,
    max_tokens: 400,
    messages: [{
      role: 'user',
      content: `Uoc tinh muc luong thi truong Viet Nam nam 2025-2026 cho vi tri sau.
Vi tri: ${title}
Ky nang: ${skills?.join(', ')}
Dia diem: ${location}
Kinh nghiem: ${experienceYears} nam
Cap do: ${seniority || 'mid'}

Tra ve CHINH XAC JSON (khong text khac):
{
  "min": 15000000,
  "median": 20000000,
  "max": 28000000,
  "currency": "VND",
  "note": "ghi chu ngan ve thi truong"
}
Don vi: VND/thang (gross). Chi tra so, khong co text giai thich.`,
    }],
  });

  const text = response.content[0]?.text || '{}';
  let predicted;
  try {
    predicted = JSON.parse(text.replace(/```json|```/g, '').trim());
  } catch {
    predicted = getHeuristicSalary(experienceYears, seniority, location);
  }

  const result = { ...predicted, source: 'ai_estimate', confidence: 'medium', sample_size: dbResult.count };
  await redis.setex(cacheKey, 7200, JSON.stringify(result));
  return result;
}

/**
 * Get salary benchmarks from our own platform's job postings
 */
async function getSalaryFromDB({ title, location, experienceYears }) {
  try {
    const { rows } = await db.query(`
      SELECT
        COUNT(*) as count,
        PERCENTILE_CONT(0.25) WITHIN GROUP (ORDER BY salary_min) as p25,
        PERCENTILE_CONT(0.50) WITHIN GROUP (ORDER BY (salary_min+salary_max)/2) as p50,
        PERCENTILE_CONT(0.75) WITHIN GROUP (ORDER BY salary_max) as p75
      FROM job_postings
      WHERE status = 'ACTIVE'
        AND salary_min IS NOT NULL
        AND salary_max IS NOT NULL
        AND title ILIKE $1
        AND ($2::text IS NULL OR location ILIKE $2)
        AND ($3::int IS NULL OR ABS(experience_years - $3) <= 1)
        AND created_at > NOW() - INTERVAL '90 days'
    `, [`%${title?.split(' ')[0] || ''}%`, location ? `%${location}%` : null, experienceYears]);
    return rows[0] || { count: 0 };
  } catch {
    return { count: 0 };
  }
}

/**
 * Rule-based heuristic fallback (Vietnam 2025 market)
 */
function getHeuristicSalary(expYears, seniority, location) {
  const base = { junior: 12000000, mid: 20000000, senior: 35000000, lead: 50000000 };
  const locationMult = location?.toLowerCase().includes('hcm') || location?.toLowerCase().includes('ha noi') ? 1.15 : 1.0;
  const b = (base[seniority] || base.mid) * locationMult;
  return { min: Math.round(b * 0.8), median: Math.round(b), max: Math.round(b * 1.4), currency: 'VND', note: 'Uoc tinh theo thi truong Viet Nam 2025' };
}

/**
 * Market trends: which skills are commanding salary premiums
 */
async function getSkillSalaryPremiums(skills) {
  if (!skills?.length) return [];
  const cacheKey = `salary:premiums:${skills.slice(0,5).join(',')}`;
  const cached = await redis.get(cacheKey);
  if (cached) return JSON.parse(cached);

  const { rows } = await db.query(`
    SELECT
      unnest(required_skills) as skill,
      AVG((salary_min + salary_max) / 2) as avg_salary,
      COUNT(*) as job_count
    FROM job_postings
    WHERE status = 'ACTIVE' AND salary_min IS NOT NULL
      AND required_skills && $1::text[]
      AND created_at > NOW() - INTERVAL '90 days'
    GROUP BY skill
    HAVING COUNT(*) >= 3
    ORDER BY avg_salary DESC
    LIMIT 10
  `, [skills]);

  const result = rows.map(r => ({
    skill:       r.skill,
    avg_salary:  Math.round(parseFloat(r.avg_salary)),
    job_count:   parseInt(r.job_count),
    premium_pct: 0, // calculated client-side relative to median
  }));

  await redis.setex(cacheKey, 3600, JSON.stringify(result));
  return result;
}

module.exports = { predictSalary, getSkillSalaryPremiums, getSalaryFromDB };
