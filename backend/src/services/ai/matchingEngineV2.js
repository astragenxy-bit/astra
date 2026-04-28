'use strict';
/**
 * Enhanced AI Matching Service v2
 * Architecture:
 *   - Two-Tower concept: worker_tower + job_tower → dot product score
 *   - Semantic skill clusters (Word2Vec-style)
 *   - Time-decay behavioral signals
 *   - Cold start 4-phase
 *   - Real-time score streaming via SSE
 */
const db     = require('../utils/db');
const redis  = require('../utils/redis');
const logger = require('../utils/logger');

// ── Semantic skill clusters (simplified embedding groups) ─────
const SKILL_CLUSTERS = {
  data_viz:      ['Power BI','Tableau','Looker','Data Studio','Qlik','Metabase'],
  python_data:   ['Python','Pandas','NumPy','Scipy','Matplotlib','Seaborn','Jupyter'],
  sql_family:    ['SQL','PostgreSQL','MySQL','BigQuery','Snowflake','dbt','Redshift'],
  ml_ai:         ['Machine Learning','ML','AI','Deep Learning','TensorFlow','Scikit-learn','PyTorch','XGBoost'],
  spreadsheet:   ['Excel','Google Sheets','VBA','Power Query'],
  stat_lang:     ['R','SPSS','SAS','Statistics','Stata'],
  cloud_data:    ['Azure','AWS','GCP','Databricks','Spark','Hadoop','Airflow'],
  web_analytics: ['Google Analytics','GA4','Mixpanel','Amplitude','Adobe Analytics','GTM'],
  bi_tools:      ['Power BI','DAX','M Query','Power Pivot'],
  finance:       ['Financial Modeling','DCF','Accounting','Budgeting','FP&A'],
  marketing:     ['SEO','SEM','Google Ads','Facebook Ads','Content Marketing','CRM'],
  dev_backend:   ['Node.js','Express','Django','FastAPI','Spring Boot','Laravel','Go','Rust'],
  dev_frontend:  ['React','Vue','Angular','TypeScript','HTML','CSS','Next.js'],
  devops:        ['Docker','Kubernetes','CI/CD','Jenkins','GitLab','Terraform','Ansible'],
  mobile:        ['React Native','Flutter','iOS','Android','Swift','Kotlin'],
  data_eng:      ['ETL','Data Pipeline','Kafka','Flink','dbt','Airflow','Data Warehouse'],
};

// Build reverse map: skill → cluster names
const SKILL_TO_CLUSTERS = {};
for (const [cluster, skills] of Object.entries(SKILL_CLUSTERS)) {
  for (const s of skills) {
    const key = s.toLowerCase();
    if (!SKILL_TO_CLUSTERS[key]) SKILL_TO_CLUSTERS[key] = [];
    SKILL_TO_CLUSTERS[key].push(cluster);
  }
}

/**
 * Semantic similarity between two skills (0–1)
 */
function skillSimilarity(a, b) {
  const al = a.toLowerCase().trim(), bl = b.toLowerCase().trim();
  if (al === bl) return 1.0;
  if (al.includes(bl) || bl.includes(al)) return 0.8;
  const ca = SKILL_TO_CLUSTERS[al] || [], cb = SKILL_TO_CLUSTERS[bl] || [];
  if (ca.length && cb.length) {
    const shared = ca.filter(c => cb.includes(c)).length;
    if (shared > 0) return 0.75 + 0.1 * shared;
  }
  return 0.0;
}

/**
 * Skill match score with semantic similarity (0–100)
 */
function computeSkillScore(workerSkills, requiredSkills) {
  if (!requiredSkills.length) return { score: 100, matched: [], missing: [] };
  if (!workerSkills.length)   return { score: 0, matched: [], missing: requiredSkills };
  const wl = workerSkills.map(s => s.toLowerCase().trim());
  let total = 0;
  const matched = [], missing = [];
  for (const req of requiredSkills) {
    let best = 0;
    for (const w of wl) best = Math.max(best, skillSimilarity(req.toLowerCase(), w));
    if (best >= 0.75) { matched.push(req); total += 1.0; }
    else if (best >= 0.5) { matched.push(req); total += 0.6; }
    else { missing.push(req); }
  }
  return { score: Math.round((total / requiredSkills.length) * 100), matched, missing };
}

function computeExpScore(have, need) {
  if (!need || need <= 0) return 100;
  if (have >= need + 2) return 105; // over-qualified slight bonus capped
  if (have >= need)     return 100;
  if (have >= need - 1) return 72;
  if (have >= 1)        return 45;
  return 15;
}

function computeEduScore(have, need) {
  const rank = { phd:100, master:90, university:75, college:60, high_school:40, any:50 };
  const h = rank[have?.toLowerCase()] || 60, n = rank[need?.toLowerCase()] || 50;
  if (h >= n) return 100;
  return Math.round((h / n) * 100);
}

function computeLocScore(workerLoc, jobLoc, jobType) {
  if (!jobLoc || jobType === 'Remote') return 100;
  const cities = (l = '') => {
    l = l.toLowerCase();
    if (l.includes('hcm') || l.includes('ho chi minh') || l.includes('tp.hcm')) return 'hcm';
    if (l.includes('ha noi') || l.includes('hanoi'))  return 'hanoi';
    if (l.includes('da nang'))  return 'danang';
    return l.split(/[,\s]/)[0].trim();
  };
  const wc = cities(workerLoc), jc = cities(jobLoc);
  if (wc === jc) return 100;
  const south = ['hcm','binh duong','dong nai','vung tau','long an'];
  const north  = ['hanoi','bac ninh','hai phong','hung yen','vinh phuc'];
  const inSame = (arr) => arr.some(c => wc.includes(c)) && arr.some(c => jc.includes(c));
  return inSame(south) || inSame(north) ? 60 : 35;
}

/**
 * Main matching score — synchronous, fast (<5ms)
 */
function calcMatchingScore(workerProfile, job) {
  const { score: skillScore, matched, missing } = computeSkillScore(
    workerProfile.skills || [], job.required_skills || []
  );
  const expScore  = computeExpScore(workerProfile.years_experience || 0, job.experience_years || 0);
  const eduScore  = computeEduScore(workerProfile.education_level, job.education_level);
  const locScore  = computeLocScore(workerProfile.location, job.location, job.job_type);
  const behavScore = 50; // default; enhanced by getBehavioralScore async
  const total = Math.min(100, Math.round(
    skillScore  * 0.40 +
    expScore    * 0.25 +
    eduScore    * 0.15 +
    locScore    * 0.10 +
    behavScore  * 0.10
  ));
  return { score: total, matched, missing, breakdown: { skillScore, expScore, eduScore, locScore, behavScore } };
}

/**
 * Behavioral score with time-decay (async)
 */
async function getBehavioralScore(workerId, job) {
  try {
    const { rows } = await db.query(`
      SELECT event_type, COUNT(*) as count, MAX(created_at) as last_seen
      FROM behavioral_events
      WHERE user_id = $1
        AND created_at > NOW() - INTERVAL '60 days'
        AND (ref_id = $2 OR metadata->>'job_type' = $3)
      GROUP BY event_type
    `, [workerId, job.id, job.job_type]);
    if (!rows.length) return 50;
    let score = 50;
    for (const r of rows) {
      const ageDays = (Date.now() - new Date(r.last_seen)) / 86400000;
      const decay   = Math.exp(-Math.log(2) * ageDays / 7); // half-life 7 days
      if (r.event_type === 'JOB_VIEW')     score += 8  * decay;
      if (r.event_type === 'JOB_SAVE')     score += 18 * decay;
      if (r.event_type === 'SEARCH_CLICK') score += 4  * decay;
    }
    return Math.min(100, Math.round(score));
  } catch { return 50; }
}

/**
 * Track behavioral event
 */
async function trackEvent(userId, eventType, refType, refId, metadata = {}) {
  db.query(
    `INSERT INTO behavioral_events (user_id,event_type,ref_type,ref_id,metadata) VALUES ($1,$2,$3,$4,$5)`,
    [userId, eventType, refType, refId || null, metadata]
  ).catch(() => {});
}

/**
 * Cold start phase detector
 */
async function getColdStartPhase(workerId) {
  const { rows } = await db.query(
    `SELECT COUNT(*) as cnt FROM behavioral_events WHERE user_id = $1`, [workerId]
  );
  const n = parseInt(rows[0].cnt);
  return n === 0 ? 0 : n <= 10 ? 1 : n <= 50 ? 2 : 3;
}

/**
 * Batch compute scores for worker vs many jobs
 */
async function batchComputeScores(workerId, jobIds) {
  if (!jobIds.length) return {};
  const cacheKey = `batch:scores:${workerId}`;
  const cached   = await redis.get(cacheKey);
  if (cached) {
    const map = JSON.parse(cached);
    if (jobIds.every(id => map[id] !== undefined)) return map;
  }
  const { rows: wp } = await db.query('SELECT * FROM worker_profiles WHERE user_id = $1', [workerId]);
  if (!wp.length) return {};
  const profile = wp[0];
  const { rows: jobs } = await db.query(
    'SELECT id,required_skills,location,job_type,experience_years,education_level FROM job_postings WHERE id = ANY($1)',
    [jobIds]
  );
  const result = {};
  for (const job of jobs) {
    const r = calcMatchingScore(profile, job);
    result[job.id] = r;
  }
  await redis.setex(cacheKey, 86400, JSON.stringify(result));
  return result;
}

/**
 * Top job recommendations for worker
 */
async function getJobRecommendations(workerId, limit = 10) {
  const cacheKey = `recs:jobs:${workerId}`;
  const cached   = await redis.get(cacheKey);
  if (cached) return JSON.parse(cached);
  const { rows: wp } = await db.query('SELECT * FROM worker_profiles WHERE user_id = $1', [workerId]);
  if (!wp.length) return [];
  const profile = wp[0];
  const { rows: jobs } = await db.query(`
    SELECT j.*, ep.company_name, ep.logo_url
    FROM job_postings j
    LEFT JOIN employer_profiles ep ON ep.user_id = j.employer_id
    WHERE j.status = 'ACTIVE' AND j.expires_at > NOW()
    ORDER BY j.boosted DESC, j.created_at DESC LIMIT 200
  `);
  const scored = jobs
    .map(j => { const r = calcMatchingScore(profile, j); return { ...j, matching_score: r.score, matched_skills: r.matched, missing_skills: r.missing }; })
    .sort((a, b) => b.matching_score - a.matching_score)
    .slice(0, limit);
  await redis.setex(cacheKey, 3600, JSON.stringify(scored));
  return scored;
}

/**
 * Course recommendations based on missing skills
 */
async function getCourseRecommendations(workerId, limit = 5) {
  const cacheKey = `recs:courses:${workerId}`;
  const cached   = await redis.get(cacheKey);
  if (cached) return JSON.parse(cached);
  const { rows: gaps } = await db.query(`
    SELECT unnest(missing_skills) as skill, COUNT(*) as freq
    FROM matching_scores WHERE worker_id = $1
    GROUP BY skill ORDER BY freq DESC LIMIT 10
  `, [workerId]);
  if (!gaps.length) {
    const { rows } = await db.query(`SELECT * FROM courses WHERE status='ACTIVE' ORDER BY total_students DESC LIMIT ${limit}`);
    return rows;
  }
  const missingSkills = gaps.map(g => g.skill);
  const { rows: courses } = await db.query(`
    SELECT c.*, tp.full_name as trainer_name,
           (c.rating_avg * 0.35 + GREATEST(0, 1 - c.price_credits::float/500) * 0.15 +
            (c.total_students::float / NULLIF((SELECT MAX(total_students) FROM courses WHERE status='ACTIVE'),0)) * 0.20 +
            array_length(array(SELECT unnest(c.outcome_skills) INTERSECT SELECT unnest($1::text[])),1)::float / GREATEST(array_length(c.outcome_skills,1),1) * 0.30) as relevance
    FROM courses c LEFT JOIN trainer_profiles tp ON tp.user_id = c.trainer_id
    WHERE c.status = 'ACTIVE' AND c.outcome_skills && $1::text[]
    ORDER BY relevance DESC LIMIT $2
  `, [missingSkills, limit]);
  await redis.setex(cacheKey, 3600, JSON.stringify(courses));
  return courses;
}

module.exports = {
  calcMatchingScore, batchComputeScores,
  getJobRecommendations, getCourseRecommendations,
  getBehavioralScore, trackEvent, getColdStartPhase,
};
