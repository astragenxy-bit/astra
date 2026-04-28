'use strict';
/**
 * Certificate PDF Generator using pdfkit
 * Generates branded WorkLearn certificates with QR verification
 */
const PDFDocument = require('pdfkit');
const crypto      = require('crypto');
const storage     = require('./storageService');

/**
 * Generate a certificate PDF and upload to MinIO
 * Returns { certUrl, credId }
 */
async function generateCertificate({ workerName, courseTitle, trainerName, completedAt, enrollmentId }) {
  const credId  = `WL-${crypto.randomBytes(4).toString('hex').toUpperCase()}-${new Date().getFullYear()}`;
  const verifyUrl = `${process.env.CORS_ORIGIN || 'https://worklearn.vn'}/verify/${credId}`;

  return new Promise((resolve, reject) => {
    const doc    = new PDFDocument({ size: 'A4', layout: 'landscape', margin: 50 });
    const chunks = [];

    doc.on('data', chunk => chunks.push(chunk));
    doc.on('error', reject);
    doc.on('end', async () => {
      try {
        const buffer  = Buffer.concat(chunks);
        const objPath = `certs/${enrollmentId}/${credId}.pdf`;
        const certUrl = await storage.uploadFile(objPath, buffer, 'application/pdf');
        resolve({ certUrl, credId });
      } catch (e) { reject(e); }
    });

    /* ── Page design ─────────────────────────────────────── */
    const W = doc.page.width, H = doc.page.height;

    // Background
    doc.rect(0, 0, W, H).fill('#FFFDF8');

    // Orange border frame
    doc.rect(20, 20, W-40, H-40).lineWidth(4).stroke('#F97316');
    doc.rect(28, 28, W-56, H-56).lineWidth(1).stroke('#F97316');

    // Top accent bar
    doc.rect(20, 20, W-40, 8).fill('#F97316');

    // Logo / branding
    doc.fontSize(28).fillColor('#F97316').font('Helvetica-Bold').text('WorkLearn', 50, 55, { continued: false });
    doc.fontSize(11).fillColor('#888').font('Helvetica').text('Nền tảng Việc làm & Đào tạo', 50, 90);

    // Main heading
    doc.fontSize(42).fillColor('#0C1222').font('Helvetica-Bold')
       .text('CHỨNG CHỈ HOÀN THÀNH', 0, 130, { align: 'center' });

    // Divider line
    doc.moveTo(100, 190).lineTo(W-100, 190).lineWidth(2).stroke('#F97316');

    // Body text
    doc.fontSize(16).fillColor('#444').font('Helvetica')
       .text('Chứng nhận rằng', 0, 210, { align: 'center' });

    doc.fontSize(32).fillColor('#0C1222').font('Helvetica-Bold')
       .text(workerName || 'Học viên', 0, 240, { align: 'center' });

    doc.fontSize(16).fillColor('#444').font('Helvetica')
       .text('đã hoàn thành xuất sắc khóa học', 0, 290, { align: 'center' });

    doc.fontSize(26).fillColor('#F97316').font('Helvetica-Bold')
       .text(`"${courseTitle}"`, 50, 320, { align: 'center', width: W-100 });

    if (trainerName) {
      doc.fontSize(13).fillColor('#666').font('Helvetica')
         .text(`Giảng viên: ${trainerName}`, 0, 380, { align: 'center' });
    }

    // Date
    const dateStr = completedAt
      ? new Date(completedAt).toLocaleDateString('vi-VN', { day:'2-digit', month:'2-digit', year:'numeric' })
      : new Date().toLocaleDateString('vi-VN', { day:'2-digit', month:'2-digit', year:'numeric' });

    doc.fontSize(13).fillColor('#888').font('Helvetica')
       .text(`Ngày cấp: ${dateStr}`, 0, 410, { align: 'center' });

    // Divider
    doc.moveTo(100, 440).lineTo(W-100, 440).lineWidth(1).stroke('#DDD');

    // Credential ID & verify
    doc.fontSize(10).fillColor('#999').font('Helvetica')
       .text(`Mã chứng chỉ: ${credId}`, 60, 460)
       .text(`Xác thực: ${verifyUrl}`, 60, 478);

    // Signature area
    doc.fontSize(12).fillColor('#333').font('Helvetica-Bold')
       .text('WorkLearn Platform', W-220, 455)
       .moveTo(W-220, 453).lineTo(W-60, 453).lineWidth(1).stroke('#333');
    doc.fontSize(10).fillColor('#888').font('Helvetica')
       .text('Đã ký điện tử', W-220, 470);

    // Watermark
    doc.save().rotate(-45, { origin: [W/2, H/2] })
       .fontSize(60).fillColor('#F97316').fillOpacity(0.04)
       .font('Helvetica-Bold').text('WorkLearn', W/2-120, H/2-30)
       .restore();

    doc.end();
  });
}

module.exports = { generateCertificate };
