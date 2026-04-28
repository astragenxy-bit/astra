'use strict';
/**
 * WorkLearn Claude AI Service
 * All AI-powered features using claude-sonnet-4-20250514
 */

const Anthropic = require('@anthropic-ai/sdk');

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const MODEL  = 'claude-sonnet-4-20250514';

async function callClaude(systemPrompt, userMessage, maxTokens = 1000) {
  const response = await client.messages.create({
    model: MODEL, max_tokens: maxTokens,
    system: systemPrompt,
    messages: [{ role: 'user', content: userMessage }],
  });
  return response.content[0]?.text || '';
}

/* ── AI Features ──────────────────────────────────────────── */

/**
 * Explain why a worker matches (or doesn't) a job
 */
async function explainMatchScore({ workerSkills, jobSkills, jobTitle, score, matchedSkills, missingSkills }) {
  return callClaude(
    'Bạn là AI tuyển dụng chuyên nghiệp của WorkLearn. Phân tích ngắn gọn (3-4 dòng) tại sao ứng viên phù hợp với vị trí này. Sử dụng tiếng Việt, gọn gàng và thực tế.',
    `Ứng viên có: ${workerSkills.join(', ')}. 
Vị trí ${jobTitle} yêu cầu: ${jobSkills.join(', ')}. 
Matching score: ${score}%. 
Kỹ năng khớp: ${matchedSkills.join(', ') || 'không có'}. 
Còn thiếu: ${missingSkills.join(', ') || 'không có'}.
Hãy giải thích ngắn gọn tại sao score này.`
  );
}

/**
 * Generate personalized cover letter
 */
async function generateCoverLetter({ workerName, jobTitle, company, workerSkills, matchedSkills, jobDescription }) {
  return callClaude(
    'Bạn là chuyên gia viết thư xin việc. Viết thư ứng tuyển chuyên nghiệp bằng tiếng Việt, ngắn gọn (3 đoạn), thân thiện và tự tin. Chỉ viết nội dung thư, không có phần mở đầu hay giải thích.',
    `Ứng viên: ${workerName}. 
Vị trí: ${jobTitle} tại ${company}. 
Kỹ năng: ${workerSkills.join(', ')}. 
Kỹ năng khớp với JD: ${matchedSkills.join(', ')}.
Mô tả công việc: ${jobDescription?.slice(0, 300) || 'N/A'}`
  );
}

/**
 * Analyze profile and give improvement suggestions
 */
async function analyzeProfile({ name, headline, skills, experiences, bio, completionPct }) {
  return callClaude(
    'Bạn là career coach của WorkLearn. Phân tích hồ sơ và đưa ra 3 gợi ý cụ thể để tăng matching score. Dùng tiếng Việt, gạch đầu dòng rõ ràng.',
    `Hồ sơ: ${name}, ${headline || 'N/A'}. 
Bio: ${bio || 'Chưa có'}.
Hoàn thiện: ${completionPct}%.
Kỹ năng: ${skills.join(', ')}.
Kinh nghiệm: ${experiences.map(e => `${e.title} tại ${e.company}`).join('; ') || 'Chưa có'}.`
  );
}

/**
 * Generate interview preparation questions
 */
async function generateInterviewQuestions({ jobTitle, requiredSkills, company }) {
  return callClaude(
    'Bạn là người phỏng vấn chuyên nghiệp. Tạo 5 câu hỏi phỏng vấn thực tế cho vị trí này. Dùng tiếng Việt, đánh số 1-5, mỗi câu hỏi trên 1 dòng.',
    `Vị trí: ${jobTitle} tại ${company || 'công ty'}. 
Kỹ năng yêu cầu: ${requiredSkills.join(', ')}.`,
    600
  );
}

/**
 * Generate personalized learning path
 */
async function generateLearningPath({ targetJob, currentSkills, missingSkills }) {
  return callClaude(
    'Bạn là AI tư vấn học tập của WorkLearn. Đưa ra lộ trình học cụ thể, ngắn gọn (3-4 bước) để đạt được mục tiêu nghề nghiệp. Tiếng Việt, thực tế.',
    `Mục tiêu: ${targetJob}. 
Kỹ năng hiện có: ${currentSkills.join(', ') || 'Chưa có'}. 
Còn thiếu: ${missingSkills.join(', ')}.`
  , 600);
}

/**
 * Career chat response
 */
async function careerChat({ message, userProfile, conversationHistory = [] }) {
  const messages = [
    ...conversationHistory.map(m => ({ role: m.role, content: m.content })),
    { role: 'user', content: message }
  ];

  const response = await client.messages.create({
    model: MODEL, max_tokens: 800,
    system: `Bạn là AI trợ lý nghề nghiệp của WorkLearn Platform. 
Hồ sơ người dùng: ${userProfile.name}, ${userProfile.headline || 'N/A'}, kỹ năng: ${userProfile.skills?.join(', ') || 'N/A'}. 
Trả lời ngắn gọn, thiết thực, thân thiện bằng tiếng Việt. Tập trung vào nghề nghiệp và phát triển kỹ năng.`,
    messages,
  });

  return response.content[0]?.text || '';
}

/**
 * Auto-tag skills from job description
 */
async function extractSkillsFromJD(jobDescription) {
  const text = await callClaude(
    'Bạn là AI phân tích kỹ năng. Trích xuất danh sách kỹ năng kỹ thuật từ mô tả công việc. Trả về JSON array, ví dụ: ["SQL","Python","Excel"]. Chỉ trả về JSON, không có text khác.',
    `Trích xuất kỹ năng từ JD này:\n${jobDescription.slice(0, 1000)}`,
    300
  );
  try {
    return JSON.parse(text.replace(/```json|```/g, '').trim());
  } catch {
    return [];
  }
}

/**
 * Generate course description summary
 */
async function summarizeCourse({ title, description, lessons }) {
  return callClaude(
    'Tóm tắt khóa học bằng tiếng Việt trong 2-3 câu, tập trung vào giá trị thực tiễn cho người học.',
    `Khóa học: ${title}. Mô tả: ${description}. Các bài: ${lessons.map(l => l.title).join(', ')}.`,
    300
  );
}

module.exports = {
  explainMatchScore,
  generateCoverLetter,
  analyzeProfile,
  generateInterviewQuestions,
  generateLearningPath,
  careerChat,
  extractSkillsFromJD,
  summarizeCourse,
};
