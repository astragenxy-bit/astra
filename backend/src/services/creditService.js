// ── services/creditService.js ────────────────────────────────
'use strict';
const db = require('../utils/db');

async function spendCredits({ userId, amount, refType, refId, description, idempotencyKey }) {
  const result = await db.query('SELECT spend_credits($1,$2,$3,$4,$5,$6) as result', [userId, amount, refType, refId || null, description, idempotencyKey]);
  return result.rows[0].result;
}

async function rewardCredits({ userId, amount, refType, refId, description, idempotencyKey, expiryDays }) {
  // Idempotency check
  const exists = await db.query('SELECT id FROM credit_ledger WHERE idempotency_key=$1', [idempotencyKey]);
  if (exists.rows.length) return { success: true, idempotent: true };

  await db.transaction(async (client) => {
    const { rows } = await client.query('SELECT balance FROM credit_wallets WHERE user_id=$1 FOR UPDATE', [userId]);
    const before = parseFloat(rows[0]?.balance || 0);
    const after  = before + amount;
    const expiry = expiryDays ? new Date(Date.now() + expiryDays * 86400000) : null;

    await client.query(`
      INSERT INTO credit_ledger (user_id, type, amount, balance_before, balance_after,
        credit_type, expires_at, ref_type, ref_id, description, idempotency_key)
      VALUES ($1,'REWARD',$2,$3,$4,'REWARD',$5,$6,$7,$8,$9)
    `, [userId, amount, before, after, expiry, refType, refId || null, description, idempotencyKey]);

    await client.query('UPDATE credit_wallets SET balance=balance+$1, updated_at=NOW() WHERE user_id=$2', [amount, userId]);
  });

  return { success: true, amount };
}

module.exports = { spendCredits, rewardCredits };
