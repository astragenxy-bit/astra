// ── utils/mailer.js ───────────────────────────────────────────
'use strict';
const nodemailer = require('nodemailer');

const transporter = nodemailer.createTransport({
  host:   process.env.EMAIL_HOST || 'smtp.gmail.com',
  port:   parseInt(process.env.EMAIL_PORT || '587'),
  secure: false,
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
});

async function sendMail({ to, subject, html, text }) {
  if (process.env.NODE_ENV === 'test') return;
  if (!process.env.EMAIL_USER) {
    console.log(`[Mailer DEV] To: ${to} | Subject: ${subject}`);
    return;
  }
  await transporter.sendMail({ from: process.env.EMAIL_FROM || 'WorkLearn <noreply@worklearn.vn>', to, subject, html, text });
}

async function sendOTP(email, otp) {
  return sendMail({
    to: email,
    subject: 'WorkLearn – Mã xác thực OTP',
    html: `
      <div style="font-family:Arial,sans-serif;max-width:480px;margin:0 auto;padding:32px;">
        <div style="text-align:center;margin-bottom:24px">
          <h2 style="color:#F97316">WorkLearn</h2>
          <p style="color:#666">Nền tảng Việc làm & Đào tạo</p>
        </div>
        <div style="background:#FFF7ED;border-radius:12px;padding:24px;text-align:center">
          <p style="color:#374151;margin:0 0 16px">Mã OTP của bạn:</p>
          <div style="font-size:40px;font-weight:900;letter-spacing:12px;color:#F97316">${otp}</div>
          <p style="color:#6B7280;font-size:13px;margin:16px 0 0">Mã có hiệu lực trong <strong>5 phút</strong>. Không chia sẻ với ai.</p>
        </div>
      </div>
    `,
  });
}

async function sendApplicationStatus(workerEmail, jobTitle, status) {
  const statusText = { REVIEW: 'đang được xem xét', INTERVIEW: 'được mời phỏng vấn', HIRED: 'được tuyển dụng! 🎉', REJECTED: 'chưa phù hợp lần này' }[status] || status;
  return sendMail({
    to:      workerEmail,
    subject: `WorkLearn – Cập nhật hồ sơ: ${jobTitle}`,
    html:    `<p>Hồ sơ của bạn cho vị trí <strong>${jobTitle}</strong> ${statusText}.</p>`,
  });
}

module.exports = { sendMail, sendOTP, sendApplicationStatus };
