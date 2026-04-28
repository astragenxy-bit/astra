'use strict';
const express  = require('express');
const crypto   = require('crypto');
const { body } = require('express-validator');
const router   = express.Router();
const db       = require('../utils/db');
const redis    = require('../utils/redis');
const { AppError }   = require('../middleware/errorHandler');
const { spendCredits, rewardCredits } = require('../services/creditService');
const { getConfig }  = require('../utils/config');
const { createFpayOrder, verifyFpayWebhook } = require('../services/fpayService');

/* ── GET /credits/balance ──────────────────────────────────── */
router.get('/balance', async (req, res, next) => {
  try {
    const { rows } = await db.query('SELECT balance FROM credit_wallets WHERE user_id = $1', [req.user.id]);
    if (!rows.length) return res.json({ balance: 0 });
    res.json({ balance: parseFloat(rows[0].balance) });
  } catch (err) { next(err); }
});

/* ── GET /credits/transactions ─────────────────────────────── */
router.get('/transactions', async (req, res, next) => {
  try {
    const { page = 1, limit = 20, type } = req.query;
    const params = [req.user.id, parseInt(limit), (parseInt(page) - 1) * parseInt(limit)];
    const where  = type ? ` AND type = '${type}'` : '';

    const { rows } = await db.query(`
      SELECT id, type, amount, balance_before, balance_after, credit_type,
             expires_at, ref_type, ref_id, description, fpay_txn_id, created_at
      FROM credit_ledger
      WHERE user_id = $1${where}
      ORDER BY created_at DESC
      LIMIT $2 OFFSET $3
    `, params);

    const { rows: countRows } = await db.query(
      `SELECT COUNT(*) FROM credit_ledger WHERE user_id = $1`, [req.user.id]
    );

    res.json({ transactions: rows, total: parseInt(countRows[0].count), page: parseInt(page) });
  } catch (err) { next(err); }
});

/* ── POST /credits/topup — Initiate FPAY payment ───────────── */
router.post('/topup', [
  body('credits').isInt({ min: 50, max: 10000 }).withMessage('Credits must be between 50 and 10000'),
  body('method').isIn(['WALLET', 'ATM', 'QR']),
], async (req, res, next) => {
  try {
    const { credits, method, return_url } = req.body;
    const creditToVnd = parseInt(await getConfig('credit_to_vnd'));
    const amountVnd   = credits * creditToVnd;
    const orderId     = `WL-${req.user.id.slice(0,8)}-${Date.now()}`;
    const idempotency = `topup:${req.user.id}:${orderId}`;

    // Check large transaction limit
    if (amountVnd > 50_000_000) {
      return res.json({ requires_additional_auth: true, amount: amountVnd });
    }

    // Create FPAY order
    const fpayOrder = await createFpayOrder({
      orderId, amountVnd, method,
      description: `WorkLearn ${credits} credits`,
      returnUrl: return_url || `${process.env.CORS_ORIGIN}/payment/callback`,
    });

    // Store pending transaction
    await db.query(`
      INSERT INTO fpay_transactions (user_id, amount_vnd, credits, method, fpay_order_id, idempotency_key, status)
      VALUES ($1, $2, $3, $4, $5, $6, 'PENDING')
    `, [req.user.id, amountVnd, credits, method, orderId, idempotency]);

    // Cache for webhook lookup
    await redis.setex(`fpay:order:${orderId}`, 3600, JSON.stringify({
      userId: req.user.id, credits, amountVnd, idempotency
    }));

    res.json({
      order_id:    orderId,
      payment_url: fpayOrder.payment_url,
      qr_url:      fpayOrder.qr_url,
      expires_in:  300,  // 5 minutes
    });
  } catch (err) { next(err); }
});


/* ── POST /credits/withdraw (DTDT) ────────────────────────────*/
router.post('/withdraw', [
  body('credits').isInt({ min: 500 }),
  body('bank_name').notEmpty(),
  body('bank_account').notEmpty(),
  body('bank_owner').notEmpty(),
], async (req, res, next) => {
  try {
    if (req.user.user_type !== 'TRAINER') throw new AppError('FORBIDDEN', 403);

    const { credits, bank_name, bank_account, bank_owner } = req.body;
    const feePct   = parseInt(await getConfig('platform_fee_pct')) / 100;
    const feeCredit = Math.round(credits * feePct);
    const netCredit = credits - feeCredit;
    const creditToVnd = parseInt(await getConfig('credit_to_vnd'));
    const netVnd    = netCredit * creditToVnd;

    const idempotency = `withdraw:${req.user.id}:${Date.now()}`;
    const spendResult = await spendCredits({
      userId: req.user.id, amount: credits,
      refType: 'WITHDRAWAL', description: `Withdrawal request: ${credits} credits`,
      idempotencyKey: idempotency,
    });
    if (!spendResult.success) throw new AppError('INSUFFICIENT_CREDIT', 402, `Need ${credits} credits. Have: ${spendResult.balance}`);

    await db.query(`
      INSERT INTO withdrawal_requests (trainer_id, ledger_id, gross_credits, fee_credits, net_credits, net_vnd, bank_name, bank_account, bank_owner)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
    `, [req.user.id, spendResult.ledger_id, credits, feeCredit, netCredit, netVnd, bank_name, bank_account, bank_owner]);

    res.json({ message: 'Withdrawal request submitted. Processing 3-5 business days.', net_vnd: netVnd, net_credits: netCredit });
  } catch (err) { next(err); }
});

module.exports = router;
