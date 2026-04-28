'use strict';
/**
 * JD Parser Service — AI-native JD intelligence
 * Uses Claude to extract structured data from raw job description text
 * Powers: auto-suggest skills, experience detection, salary parsing
 */
const Anthropic = require('@anthropic-ai/sdk');
const redis     = require('../utils/redis');
const logger    = require('../utils/logger');

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const MODEL  = 'claude-sonnet-4-20250514';

/**
 * Parse raw JD text → structured job requirements
 * Returns: { title, required_skills, nice_to_have, experience_years, education_level,
 *            salary_min, salary_max, job_type, responsibilities[], seniority }
 */
async function parseJobDescription(rawJD, language = 'vi') {
  // Cache by hash of JD text
  const hash = require('crypto').createHash('md5').update(rawJD).digest('hex');
  const cacheKey = `jd:parse:${hash}`;
  const cached = await redis.get(cacheKey);
  if (cached) return JSON.parse(cached);

  const prompt = language === 'vi'
    ? `Phan tich mo ta cong viec sau va trich xuat thong tin co cau truc.
Tra ve CHINH XAC JSON sau (khong co text khac):
{
  "title": "ten vi tri",
  "required_skills": ["ky nang bat buoc 1", "ky nang bat buoc 2"],
  "nice_to_have": ["ky nang uu tien"],
  "experience_years": 2,
  "education_level": "university|college|high_school|any",
  "salary_min": 15000000,
  "salary_max": 20000000,
  "job_type": "Full-time|Part-time|Remote|Hybrid",
  "responsibilities": ["tra loi 1", "tra loi 2"],
  "seniority": "junior|mid|senior|lead",
  "industry": "nganh nghe",
  "benefits": ["quyen loi 1"]
}
Neu khong co thong tin, de null. Luong tinh bang VND.
Mo ta cong viec:\n${rawJD}`
    : `Extract structured data from this job description. Return ONLY valid JSON:
{
  "title": "position name",
  "required_skills": ["skill1", "skill2"],
  "nice_to_have": ["optional skill"],
  "experience_years": 2,
  "education_level": "university|college|high_school|any",
  "salary_min": null,
  "salary_max": null,
  "job_type": "Full-time|Part-time|Remote|Hybrid",
  "responsibilities": ["resp1", "resp2"],
  "seniority": "junior|mid|senior|lead",
  "industry": "industry name",
  "benefits": ["benefit1"]
}
JD:\n${rawJD}`;

  const response = await client.messages.create({
    model: MODEL,
    max_tokens: 1500,
    messages: [{ role: 'user', content: prompt }],
  });

  const text = response.content[0]?.text || '{}';
  const clean = text.replace(/```json|```/g, '').trim();

  let parsed;
  try {
    parsed = JSON.parse(clean);
  } catch (e) {
    logger.warn({ rawText: text.slice(0, 200) }, 'JD parse JSON error, using fallback');
    parsed = extractFallback(rawJD);
  }

  // Normalize skills: dedupe, trim, title-case
  if (parsed.required_skills) {
    parsed.required_skills = [...new Set(parsed.required_skills.map(s => s.trim()).filter(Boolean))];
  }

  await redis.setex(cacheKey, 3600, JSON.stringify(parsed)); // cache 1h
  logger.info({ skills: parsed.required_skills?.length, seniority: parsed.seniority }, 'JD parsed');
  return parsed;
}

/**
 * Suggest skills as user types job title (autocomplete)
 */
async function suggestSkillsForTitle(jobTitle) {
  const cacheKey = `jd:skills:${jobTitle.toLowerCase().trim()}`;
  const cached = await redis.get(cacheKey);
  if (cached) return JSON.parse(cached);

  const response = await client.messages.create({
    model: MODEL,
    max_tokens: 400,
    messages: [{
      role: 'user',
      content: `List the top 8 technical skills typically required for a "${jobTitle}" position in Vietnam tech industry. Return ONLY a JSON array of strings. Example: ["SQL", "Python", "Excel"]. No explanation.`,
    }],
  });

  const text = response.content[0]?.text || '[]';
  let skills;
  try {
    skills = JSON.parse(text.replace(/```json|```/g, '').trim());
  } catch {
    skills = extractSkillsFromText(text);
  }

  await redis.setex(cacheKey, 86400, JSON.stringify(skills)); // cache 24h
  return skills;
}

/**
 * Rewrite / improve a job description with AI
 */
async function improveJobDescription(originalJD, tone = 'professional') {
  const response = await client.messages.create({
    model: MODEL,
    max_tokens: 2000,
    system: 'Ban la chuyen gia viet mo ta cong viec hap dan. Viet lai JD chi tiet, ro rang, hap dan ung vien tai nang. Su dung tieng Viet chuyen nghiep.',
    messages: [{
      role: 'user',
      content: `Viet lai mo ta cong viec sau theo phong cach ${tone}. Giu nguyen thong tin chinh, lam ro yeu cau va quyen loi. JD goc:\n${originalJD}`,
    }],
  });
  return response.content[0]?.text || originalJD;
}

/**
 * Analyze candidate-job fit and write recruiter summary
 */
async function writeRecruiterSummary({ workerName, workerSkills, matchScore, matchedSkills, missingSkills, jobTitle }) {
  const response = await client.messages.create({
    model: MODEL,
    max_tokens: 600,
    system: 'Ban la AI ho tro tuyen dung cua WorkLearn. Viet tom tat ngan gon (3-4 cau) ve muc do phu hop cua ung vien, kem goi y hanh dong. Tieng Viet, khach quan.',
    messages: [{
      role: 'user',
      content: `Ung vien: ${workerName}. Vi tri: ${jobTitle}. Score: ${matchScore}%. Ky nang co: ${matchedSkills.join(', ')}. Con thieu: ${missingSkills.join(', ')}.`,
    }],
  });
  return response.content[0]?.text || '';
}

// ── Fallback extractors (no API) ──────────────────────────────
function extractFallback(text) {
  const skills = extractSkillsFromText(text);
  const expMatch = text.match(/(\d+)\s*(?:nam|year)/i);
  return {
    title: null,
    required_skills: skills,
    nice_to_have: [],
    experience_years: expMatch ? parseInt(expMatch[1]) : null,
    education_level: null,
    salary_min: null, salary_max: null,
    job_type: 'Full-time',
    responsibilities: [],
    seniority: null,
    industry: null,
    benefits: [],
  };
}

const KNOWN_SKILLS = ['SQL','Python','Excel','Power BI','Tableau','JavaScript','React','Node.js','Java','C++',
  'Machine Learning','Deep Learning','TensorFlow','Pandas','NumPy','R','SPSS','Azure','AWS','GCP',
  'Docker','Kubernetes','Git','Agile','Scrum','DAX','Google Analytics','MongoDB','PostgreSQL','Redis'];

function extractSkillsFromText(text) {
  return KNOWN_SKILLS.filter(s => new RegExp(`\\b${s}\\b`, 'i').test(text));
}

module.exports = { parseJobDescription, suggestSkillsForTitle, improveJobDescription, writeRecruiterSummary };
