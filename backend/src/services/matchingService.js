'use strict';
/**
 * WorkLearn AI Matching Service
 * Computes 5-component matching score:
 *   40% Skill Match (with semantic similarity)
 *   25% Experience Level
 *   15% Education
 *   10% Location
 *   10% Behavioral Signals
 */

const db    = require('../utils/db');
const redis = require('../utils/redis');

// Skill semantic similarity groups (simplified Word2Vec clusters)
const SKILL_CLUSTERS = {
  'data_viz':      ['Power BI', 'Tableau', 'Looker', 'Data Studio', 'Qlik'],
  'python_lang':   ['Python', 'Pandas', 'NumPy', 'Scipy', 'Jupyter'],
  'sql_family':    ['SQL', 'PostgreSQL', 'MySQL', 'BigQuery', 'Snowflake', 'dbt'],
  'ml_ai':         ['Machine Learning', 'ML', 'AI', 'Deep Learning', 'TensorFlow', 'Scikit-learn', 'PyTorch'],
  'spreadsheet':   ['Excel', 'Google Sheets', 'Spreadsheet'],
  'stat_lang':     ['R', 'SPSS', 'SAS', 'Statistics'],
  'cloud_data':    ['Azure', 'AWS', 'GCP', 'Databricks', 'Spark'],
  'web_analytics': ['Google Analytics', 'Mixpanel', 'Amplitude', 'Adobe Analytics'],
  'bi_tools':      ['Power BI', 'DAX', 'M Query', 'Power Query'],
  'finance':       ['Financial Modeling', 'DCF', 'Accounting', 'Excel', 'Financial Analysis'],
};

/**
 * Get semantic similarity between two skills (0-1)
 */
function skillSimilarity(skillA, skillB) {
  const a = skillA.toLowerCase().trim();
  const b = skillB.toLowerCase().trim();
  if (a === b) return 1.0;

  // Check same cluster
  for (const cluster of Object.values(SKILL_CLUSTERS)) {
    const clusterLower = cluster.map(s => s.toLowerCase());
    if (clusterLower.includes(a) && clusterLower.includes(b)) return 0.8;
  }

  // Partial string match
  if (a.includes(b) || b.includes(a)) return 0.6;

  return 0.0;
}

/**
 * Compute skill match score (0-100)
 */
function computeSkillScore(workerSkills, requiredSkills) {
  if (!requiredSkills.length) return 100;
  if (!workerSkills.length)   return 0;

  const wLower = workerSkills.map(s => s.toLowerCase().trim());
  let totalScore   = 0;
  const matched    = [];
  const missing    = [];

  for (const reqSkill of requiredSkills) {
    const reqLower = reqSkill.toLowerCase().trim();
    let best = 0;

    for (const wSkill of wLower) {
      const sim = skillSimilarity(reqLower, wSkill);
      if (sim > best) best = sim;
    }

    if (best >= 0.8) {
      matched.push(reqSkill);
      totalScore += 1.0;
    } else if (best >= 0.6) {
      matched.push(reqSkill);
      totalScore += 0.7; // partial match
    } else {
      missing.push(reqSkill);
    }
  }

  const score = (totalScore / requiredSkills.length) * 100;
  return { score, matched, missing };
}

/**
 * Compute experience match score (0-100)
 */
function computeExpScore(workerYears, requiredYears) {
  if (!requiredYears) return 100;
  if (workerYears >= requiredYears)     return 100;
  if (workerYears >= requiredYears - 1) return 70;
  if (workerYears >= 1)                 return 40;
  return 10;
}

/**
 * Compute education match score (0-100)
 */
function computeEduScore(workerEdu, requiredEdu) {
  const rank = { 'self': 30, 'college': 65, 'university': 85, 'master': 100, 'phd': 100 };
  const wRank = rank[workerEdu?.toLowerCase()] || 50;
  const rRank = rank[requiredEdu?.toLowerCase()] || 50;
  if (wRank >= rRank) return 100;
  return Math.round((wRank / rRank) * 100);
}

/**
 * Compute location match score (0-100)
 */
function computeLocScore(workerLoc, jobLoc, jobType) {
  if (jobType === 'Remote') return 100;
  if (!workerLoc || !jobLoc) return 80;

  const wCity = extractCity(workerLoc);
  const jCity = extractCity(jobLoc);

  if (wCity === jCity) return 100;
  if (sameRegion(wCity, jCity)) return 60;
  return 40;
}

function extractCity(location) {
  if (!location) return '';
  const loc = location.toLowerCase();
  if (loc.includes('hồ chí minh') || loc.includes('hcm') || loc.includes('tp.hcm')) return 'hcm';
  if (loc.includes('hà nội') || loc.includes('hanoi')) return 'hanoi';
  if (loc.includes('đà nẵng') || loc.includes('da nang')) return 'danang';
  return loc.split(',')[0].trim();
}

function sameRegion(cityA, cityB) {
  const south = ['hcm', 'bình dương', 'đồng nai', 'long an', 'vũng tàu'];
  const north = ['hanoi', 'bắc ninh', 'hải phòng', 'hưng yên'];
  const citiesA = [cityA], citiesB = [cityB];
  if (south.some(c => citiesA[0]?.includes(c)) && south.some(c => citiesB[0]?.includes(c))) return true;
  if (north.some(c => citiesA[0]?.includes(c)) && north.some(c => citiesB[0]?.includes(c))) return true;
  return false;
}

/**
 * Main: Compute full matching score
 */
function calcMatchingScore(workerProfile, job) {
  const { score: skillScoreRaw, matched, missing } = computeSkillScore(
    workerProfile.skills || [],
    job.required_skills || []
  );

  const skillScore = skillScoreRaw;
  const expScore   = computeExpScore(workerProfile.years_experience || 0, job.experience_years || 0);
  const eduScore   = computeEduScore(workerProfile.education_level, job.education_level);
  const locScore   = computeLocScore(workerProfile.location, job.location, job.job_type);
  const behavScore = 50; // Fast sync default; use getBehavioralScore() for real-time enhancement

  const total = Math.round(
    skillScore * 0.40 +
    expScore   * 0.25 +
    eduScore   * 0.15 +
    locScore   * 0.10 +
    behavScore * 0.10
  );

  return { score: total, matched: matched || [], missing: missing || [], breakdown: { skillScore, expScore, eduScore, locScore, behavScore } };
}

/**
 * Batch compute scores for a worker vs many jobs (with cache)
 */
async function batchComputeScores(workerId, jobIds) {
  const cacheKey = `batch:scores:${workerId}`;
  const cached   = await redis.get(cacheKey);
  if (cached) {
    const map = JSON.parse(cached);
    const allCached = jobIds.every(id => map[id] !== undefined);
    if (allCached) return map;
  }

  // Fetch worker profile
  const { rows: wp } = await db.query('SELECT * FROM worker_profiles WHERE user_id = $1', [workerId]);
  if (!wp.length) return {};
  const profile = wp[0];

  // Fetch jobs
  const { rows: jobs } = await db.query(
    'SELECT id, required_skills, location, job_type, experience_years, education_level FROM job_postings WHERE id = ANY($1)',
    [jobIds]
  );

  const result = {};
  for (const job of jobs) {
    const { score, matched, missing } = calcMatchingScore(profile, job);
    result[job.id] = { score, matched, missing };
  }

  await redis.setex(cacheKey, 86400, JSON.stringify(result)); // 24h TTL
  return result;
}

/**
 * Get top job recommendations for a worker
 */
async function getJobRecommendations(workerId, limit = 10) {
  const cacheKey = `recs:jobs:${workerId}`;
  const cached   = await redis.get(cacheKey);
  if (cached) return JSON.parse(cached);

  const { rows: wp } = await db.query('SELECT * FROM worker_profiles WHERE user_id = $1', [workerId]);
  if (!wp.length) return [];
  const profile = wp[0];

  // Fetch recent active jobs
  const { rows: jobs } = await db.query(`
    SELECT j.*, ep.company_name, ep.logo_url
    FROM job_postings j
    LEFT JOIN employer_profiles ep ON ep.user_id = j.employer_id
    WHERE j.status = 'ACTIVE' AND j.expires_at > NOW()
    ORDER BY j.created_at DESC LIMIT 100
  `);

  // Score and sort
  const scored = jobs.map(job => {
    const { score, matched, missing } = calcMatchingScore(profile, job);
    return { ...job, matching_score: score, matched_skills: matched, missing_skills: missing };
  }).sort((a, b) => b.matching_score - a.matching_score).slice(0, limit);

  await redis.setex(cacheKey, 3600, JSON.stringify(scored));
  return scored;
}

/**
 * Get course recommendations based on missing skills
 */
async function getCourseRecommendations(workerId, limit = 5) {
  const cacheKey = `recs:courses:${workerId}`;
  const cached   = await redis.get(cacheKey);
  if (cached) return JSON.parse(cached);

  // Find most common missing skills
  const { rows: gaps } = await db.query(`
    SELECT unnest(missing_skills) as skill, COUNT(*) as frequency
    FROM matching_scores WHERE worker_id = $1
    GROUP BY skill ORDER BY frequency DESC LIMIT 10
  `, [workerId]);

  if (!gaps.length) {
    // Fallback: popular courses
    const { rows } = await db.query(
      `SELECT * FROM courses WHERE status = 'ACTIVE' ORDER BY total_students DESC LIMIT ${limit}`
    );
    return rows;
  }

  const missingSkills = gaps.map(g => g.skill);

  // Find courses that teach missing skills
  const { rows: courses } = await db.query(`
    SELECT c.*, tp.full_name as trainer_name,
           (c.rating_avg * 0.3 + GREATEST(0, 1 - c.price_credits::float/500) * 0.2 + 
            (c.total_students::float / NULLIF((SELECT MAX(total_students) FROM courses),0)) * 0.2) as relevance_score
    FROM courses c
    LEFT JOIN trainer_profiles tp ON tp.user_id = c.trainer_id
    WHERE c.status = 'ACTIVE'
      AND c.outcome_skills && $1::text[]
    ORDER BY relevance_score DESC
    LIMIT $2
  `, [missingSkills, limit]);

  await redis.setex(cacheKey, 3600, JSON.stringify(courses));
  return courses;
}


/**
 * Cold Start 4-Phase Recommendation Strategy
 * Phase 0: 0 interactions  → Pure CBF (skills + career goal from onboarding)
 * Phase 1: 1-10           → CBF + Popular items in category
 * Phase 2: 10-50          → Hybrid 80% CBF + 20% CF user-kNN
 * Phase 3: 50+            → Full hybrid 50/50 with time-decay
 */
async function getColdStartPhase(workerId) {
  const { rows } = await db.query(
    `SELECT COUNT(*) as cnt FROM behavioral_events WHERE user_id=$1`, [workerId]
  );
  const count = parseInt(rows[0].cnt);
  if (count === 0)   return 0;
  if (count <= 10)   return 1;
  if (count <= 50)   return 2;
  return 3;
}

/**
 * Get behavioral signal score for a worker-job pair (0-100)
 * Considers: job views, search clicks, category affinity, time-decay
 */
async function getBehavioralScore(workerId, job) {
  try {
    const { rows } = await db.query(`
      SELECT event_type, COUNT(*) as count,
             MAX(created_at) as last_seen
      FROM behavioral_events
      WHERE user_id=$1 AND created_at > NOW()-INTERVAL '30 days'
        AND (ref_id=$2 OR metadata->>'job_type'=$3)
      GROUP BY event_type
    `, [workerId, job.id, job.job_type]);

    if (!rows.length) return 50; // default neutral

    let score = 50;
    for (const r of rows) {
      const decay = timeDecay(r.last_seen);
      if (r.event_type === 'JOB_VIEW')     score += 10 * decay;
      if (r.event_type === 'JOB_SAVE')     score += 20 * decay;
      if (r.event_type === 'SEARCH_CLICK') score += 5  * decay;
    }
    return Math.min(100, Math.round(score));
  } catch { return 50; }
}

/** Exponential time decay: recent events weighted more heavily */
function timeDecay(timestamp, halfLifeDays = 7) {
  const ageMs   = Date.now() - new Date(timestamp).getTime();
  const ageDays = ageMs / (1000 * 60 * 60 * 24);
  return Math.exp(-Math.log(2) * ageDays / halfLifeDays);
}

/**
 * Track behavioral event (fire-and-forget)
 */
async function trackEvent(userId, eventType, refType, refId, metadata = {}) {
  try {
    await db.query(
      `INSERT INTO behavioral_events (user_id,event_type,ref_type,ref_id,metadata) VALUES ($1,$2,$3,$4,$5)`,
      [userId, eventType, refType, refId, metadata]
    );
  } catch { /* non-critical */ }
}

module.exports = {
  calcMatchingScore,
  batchComputeScores,
  getJobRecommendations,
  getCourseRecommendations,
  getColdStartPhase,
  getBehavioralScore,
  trackEvent,
};

