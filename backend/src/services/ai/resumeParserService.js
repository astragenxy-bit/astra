'use strict';
/**
 * Resume Parser Service — AI-native CV intelligence
 * Uses Claude Vision to read PDF CV and auto-fill worker profile
 * No manual entry needed: upload CV → profile populated
 */
const Anthropic = require('@anthropic-ai/sdk');
const logger    = require('../utils/logger');

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const MODEL  = 'claude-sonnet-4-20250514';

/**
 * Parse CV PDF buffer → structured profile data
 * Input: PDF buffer (from Multer)
 * Output: { full_name, headline, bio, skills[], experiences[], education[], location, years_experience }
 */
async function parseResume(pdfBuffer, mimeType = 'application/pdf') {
  const base64 = pdfBuffer.toString('base64');

  const response = await client.messages.create({
    model: MODEL,
    max_tokens: 3000,
    messages: [{
      role: 'user',
      content: [
        {
          type: 'document',
          source: { type: 'base64', media_type: mimeType, data: base64 },
        },
        {
          type: 'text',
          text: `Trich xuat thong tin tu CV nay. Tra ve CHINH XAC JSON (khong co text khac):
{
  "full_name": "Ho va ten",
  "headline": "Chuc danh / Vi tri muc tieu (1 dong)",
  "bio": "Tom tat ngan (2-3 cau ve kinh nghiem va muc tieu)",
  "location": "Thanh pho / Tinh",
  "email": "email neu co",
  "phone": "so dien thoai neu co",
  "linkedin_url": "link neu co",
  "github_url": "link neu co",
  "skills": ["ky nang 1", "ky nang 2"],
  "years_experience": 3,
  "education_level": "university|college|high_school",
  "experiences": [
    {
      "title": "Chuc danh",
      "company": "Ten cong ty",
      "start_date": "2022-03",
      "end_date": "2024-01",
      "is_current": false,
      "description": "Mo ta cong viec",
      "skills": ["ky nang su dung"]
    }
  ],
  "education": [
    {
      "school": "Ten truong",
      "degree": "Bang cap / Nganh",
      "year_start": 2018,
      "year_end": 2022,
      "gpa": 3.4
    }
  ],
  "certifications": ["Chung chi 1", "Chung chi 2"]
}
Neu khong tim thay thong tin, de null. Ngay thang dang YYYY-MM.`,
        },
      ],
    }],
  });

  const text = response.content[0]?.text || '{}';
  const clean = text.replace(/```json|```/g, '').trim();

  let parsed;
  try {
    parsed = JSON.parse(clean);
  } catch (e) {
    logger.warn({ err: e.message }, 'Resume parse JSON error');
    parsed = {};
  }

  // Normalize
  if (parsed.skills) {
    parsed.skills = [...new Set(parsed.skills.map(s => s.trim()).filter(s => s.length > 0))];
  }
  if (parsed.experiences) {
    parsed.experiences = parsed.experiences.map(e => ({
      ...e,
      start_date: normalizeDate(e.start_date),
      end_date:   e.is_current ? null : normalizeDate(e.end_date),
    }));
  }

  logger.info({
    name:        parsed.full_name,
    skills:      parsed.skills?.length,
    experiences: parsed.experiences?.length,
  }, 'CV parsed successfully');

  return parsed;
}

/**
 * Generate profile improvement suggestions based on parsed CV vs job market
 */
async function analyzeResumeGaps(parsedProfile, targetRole) {
  const response = await client.messages.create({
    model: MODEL,
    max_tokens: 800,
    system: 'Ban la career coach. Phan tich CV va dua ra 3 goi y cu the, co the thuc hien ngay, de tang kha nang tim viec. Tieng Viet, thiet thuc.',
    messages: [{
      role: 'user',
      content: `Vi tri muc tieu: ${targetRole}. Ho so: ${parsedProfile.full_name}, ky nang: ${parsedProfile.skills?.join(', ')}. Kinh nghiem: ${parsedProfile.experiences?.map(e => e.title + ' tai ' + e.company).join('; ')}.`,
    }],
  });
  return response.content[0]?.text || '';
}

/**
 * Score CV quality (0-100) and return improvement tips
 */
async function scoreResumeQuality(parsedProfile) {
  let score = 0;
  const tips = [];

  if (parsedProfile.full_name)              { score += 10; }
  if (parsedProfile.headline)               { score += 10; }
  if (parsedProfile.bio)                    { score += 10; }
  if (parsedProfile.location)               { score += 5; }
  if (parsedProfile.linkedin_url)           { score += 5; }
  if (parsedProfile.github_url)             { score += 5; }
  if (parsedProfile.skills?.length >= 5)    { score += 15; }
  else if (parsedProfile.skills?.length > 0){ score += 8; tips.push('Them it nhat 5 ky nang'); }
  else                                       { tips.push('CV chua co phan ky nang'); }
  if (parsedProfile.experiences?.length >= 2) { score += 20; }
  else if (parsedProfile.experiences?.length === 1) { score += 10; tips.push('Them chi tiet cong viec'); }
  else                                       { tips.push('Them kinh nghiem lam viec'); }
  if (parsedProfile.education?.length > 0)  { score += 10; }
  else                                       { tips.push('Them hoc van'); }
  if (parsedProfile.certifications?.length > 0) { score += 5; }
  else                                       { tips.push('Them chung chi de noi bat'); }

  // Check if descriptions have numbers/metrics
  const hasMetrics = parsedProfile.experiences?.some(e => /\d+%|\d+\s*(trieu|million|user|khach)/.test(e.description || ''));
  if (hasMetrics)  { score += 5; }
  else             { tips.push('Them so lieu cu the vao mo ta KN (giam 30% chi phi, tang 20% doanh thu...)'); }

  return { score: Math.min(100, score), tips };
}

function normalizeDate(dateStr) {
  if (!dateStr) return null;
  // Convert "03/2022" or "March 2022" or "2022-03" to ISO format
  const match = dateStr.match(/(\d{4})/);
  if (!match) return null;
  const yearMatch = dateStr.match(/(\d{4})/);
  const monthMatch = dateStr.match(/(\d{1,2})[\/\-](\d{4})/);
  if (monthMatch) return `${monthMatch[2]}-${monthMatch[1].padStart(2,'0')}`;
  if (yearMatch) return `${yearMatch[1]}-01`;
  return null;
}

module.exports = { parseResume, analyzeResumeGaps, scoreResumeQuality };
