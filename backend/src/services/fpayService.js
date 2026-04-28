// ── services/fpayService.js ──────────────────────────────────
'use strict';
const crypto = require('crypto');

const FPAY_API  = process.env.FPAY_API_URL    || 'https://api.foxpay.vn/v1';
const SECRET    = process.env.FPAY_SECRET_KEY  || 'dev_secret';
const MERCHANT  = process.env.FPAY_MERCHANT_ID || 'dev_merchant';

async function createFpayOrder({ orderId, amountVnd, method, description, returnUrl }) {
  // In development/demo: return mock URLs
  if (process.env.NODE_ENV !== 'production') {
    return {
      payment_url: `${FPAY_API}/pay?order_id=${orderId}&amount=${amountVnd}&method=${method}`,
      qr_url:      `${FPAY_API}/qr?order_id=${orderId}`,
    };
  }

  const payload = { merchant_id: MERCHANT, order_id: orderId, amount: amountVnd, method, description, return_url: returnUrl };
  const signature = createSignature(payload);

  const res = await fetch(`${FPAY_API}/orders/create`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Signature': signature },
    body: JSON.stringify(payload),
  });

  if (!res.ok) throw new Error(`FPAY API error: ${res.status}`);
  return res.json();
}

function createSignature(payload) {
  const data = Object.keys(payload).sort().map(k => `${k}=${payload[k]}`).join('&');
  return crypto.createHmac('sha256', SECRET).update(data).digest('hex');
}

function verifyFpayWebhook(rawBody, signature) {
  if (!signature) return false;
  const expected = crypto.createHmac('sha256', SECRET).update(rawBody).digest('hex');
  return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(signature));
}

module.exports = { createFpayOrder, verifyFpayWebhook };
