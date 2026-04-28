// ── routes/webhooks/fpay.js ─────────────────────────────────
'use strict';
const express = require('express');
const router  = express.Router();
// Re-use the webhook handler from credits route
const { verifyFpayWebhook } = require('../../services/fpayService');
const db    = require('../../utils/db');
const redis = require('../../utils/redis');

router.post('/', express.raw({ type: '*/*' }), async (req, res) => {
  try {
    const signature = req.headers['x-fpay-signature'] || req.headers['x-signature'];
    const rawBody   = req.body;

    if (!verifyFpayWebhook(rawBody, signature)) {
      console.warn('[FPAY Webhook] Invalid signature');
      return res.status(400).json({ error: 'INVALID_SIGNATURE' });
    }

    const data    = JSON.parse(rawBody.toString());
    const orderId = data.order_id;
    const status  = data.status; // SUCCESS | FAILED

    // Idempotency
    const exists = await db.query('SELECT id FROM credit_ledger WHERE idempotency_key=$1', [`topup:webhook:${orderId}`]);
    if (exists.rows.length) {
      console.log(`[FPAY Webhook] Duplicate orderId=${orderId}, skipping`);
      return res.json({ status: 'ok', idempotent: true });
    }

    const cached = await redis.get(`fpay:order:${orderId}`);
    if (!cached) {
      console.warn(`[FPAY Webhook] Order not found in cache: ${orderId}`);
      return res.status(404).json({ error: 'ORDER_NOT_FOUND' });
    }

    const { userId, credits, amountVnd } = JSON.parse(cached);

    if (status === 'SUCCESS') {
      await db.transaction(async (client) => {
        const { rows: wRows } = await client.query('SELECT balance FROM credit_wallets WHERE user_id=$1 FOR UPDATE', [userId]);
        const before = parseFloat(wRows[0].balance);
        const after  = before + credits;

        await client.query(`
          INSERT INTO credit_ledger (user_id, type, amount, balance_before, balance_after,
            credit_type, ref_type, description, idempotency_key, fpay_txn_id)
          VALUES ($1,'TOPUP',$2,$3,$4,'PURCHASED','FPAY_TOPUP',$5,$6,$7)
        `, [userId, credits, before, after,
            `Nạp ${credits} credit qua Foxpay (${orderId})`,
            `topup:webhook:${orderId}`, data.transaction_code]);

        await client.query('UPDATE credit_wallets SET balance=balance+$1, updated_at=NOW() WHERE user_id=$2', [credits, userId]);
        await client.query(`UPDATE fpay_transactions SET status='SUCCESS', fpay_txn_code=$1, confirmed_at=NOW() WHERE fpay_order_id=$2`, [data.transaction_code, orderId]);
      });

      await db.query(`INSERT INTO notifications (user_id, type, title, body) VALUES ($1,'CREDIT_TOPUP',$2,$3)`,
        [userId, `Nạp ${credits} credit thành công`, `Mã GD: ${data.transaction_code}`]);

      await redis.del(`fpay:order:${orderId}`);
      console.log(`[FPAY Webhook] SUCCESS orderId=${orderId} credits=${credits} user=${userId}`);
    } else {
      await db.query(`UPDATE fpay_transactions SET status='FAILED' WHERE fpay_order_id=$1`, [orderId]);
      console.log(`[FPAY Webhook] FAILED orderId=${orderId}`);
    }

    res.json({ status: 'ok' });
  } catch (err) {
    console.error('[FPAY Webhook] Error:', err);
    res.status(500).json({ error: 'INTERNAL_ERROR' });
  }
});

module.exports = router;
