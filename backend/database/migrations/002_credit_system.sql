-- ═══════════════════════════════════════════════════════════════
-- WorkLearn Platform — Migration 002: Credit System
-- LEDGER IS APPEND-ONLY — NEVER UPDATE OR DELETE RECORDS
-- ═══════════════════════════════════════════════════════════════

-- ── CREDIT WALLETS ─────────────────────────────────────────────
CREATE TABLE credit_wallets (
  id         UUID    PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id    UUID    NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  balance    DECIMAL(12,4) NOT NULL DEFAULT 0 CHECK (balance >= 0),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_wallet_user ON credit_wallets(user_id);

-- ── CREDIT LEDGER (APPEND-ONLY) ────────────────────────────────
-- CRITICAL: This table is append-only. Never UPDATE or DELETE records.
-- Every balance change creates a new record.
CREATE TABLE credit_ledger (
  id               UUID         PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id          UUID         NOT NULL REFERENCES users(id),
  type             credit_type  NOT NULL,
  amount           DECIMAL(12,4) NOT NULL,   -- positive=credit, negative=debit
  balance_before   DECIMAL(12,4) NOT NULL,   -- snapshot audit
  balance_after    DECIMAL(12,4) NOT NULL,   -- snapshot audit
  credit_type      wallet_credit_type NOT NULL DEFAULT 'PURCHASED',
  expires_at       TIMESTAMPTZ,              -- NULL=no expiry, else reward expiry
  status           ledger_status NOT NULL DEFAULT 'CONFIRMED',
  ref_type         VARCHAR(100),             -- JOB_POST, COURSE_ENROLL, BOOST, REWARD_HIRE...
  ref_id           UUID,                     -- related entity ID
  description      TEXT,
  idempotency_key  VARCHAR(255) UNIQUE,      -- prevent double-processing
  fpay_txn_id      VARCHAR(100),             -- Foxpay transaction ID
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
  -- NO updated_at — immutable
);

-- Ensure truly append-only via rule (belt-and-suspenders)
CREATE RULE no_update_ledger AS ON UPDATE TO credit_ledger DO INSTEAD NOTHING;
CREATE RULE no_delete_ledger AS ON DELETE TO credit_ledger DO INSTEAD NOTHING;

CREATE INDEX idx_ledger_user       ON credit_ledger(user_id);
CREATE INDEX idx_ledger_type       ON credit_ledger(type);
CREATE INDEX idx_ledger_status     ON credit_ledger(status);
CREATE INDEX idx_ledger_created    ON credit_ledger(created_at DESC);
CREATE INDEX idx_ledger_idempotent ON credit_ledger(idempotency_key);

-- ── FPAY TRANSACTIONS ──────────────────────────────────────────
CREATE TABLE fpay_transactions (
  id               UUID    PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id          UUID    NOT NULL REFERENCES users(id),
  ledger_id        UUID    REFERENCES credit_ledger(id),
  amount_vnd       BIGINT  NOT NULL,         -- VND amount
  credits          INT     NOT NULL,         -- credits to add
  method           VARCHAR(50) NOT NULL,     -- WALLET, ATM, QR
  status           VARCHAR(50) NOT NULL DEFAULT 'PENDING',
  fpay_order_id    VARCHAR(255) UNIQUE NOT NULL,
  fpay_txn_code    VARCHAR(100),             -- final txn code FPxxxxxxxx
  idempotency_key  VARCHAR(255) UNIQUE NOT NULL,
  webhook_received BOOLEAN NOT NULL DEFAULT FALSE,
  metadata         JSONB,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  confirmed_at     TIMESTAMPTZ
);

CREATE INDEX idx_fpay_user   ON fpay_transactions(user_id);
CREATE INDEX idx_fpay_order  ON fpay_transactions(fpay_order_id);
CREATE INDEX idx_fpay_status ON fpay_transactions(status);

-- ── WITHDRAWAL REQUESTS ────────────────────────────────────────
CREATE TABLE withdrawal_requests (
  id              UUID    PRIMARY KEY DEFAULT uuid_generate_v4(),
  trainer_id      UUID    NOT NULL REFERENCES users(id),
  ledger_id       UUID    REFERENCES credit_ledger(id),
  gross_credits   INT     NOT NULL,
  fee_credits     INT     NOT NULL,
  net_credits     INT     NOT NULL,
  net_vnd         BIGINT  NOT NULL,
  bank_name       VARCHAR(255) NOT NULL,
  bank_account    VARCHAR(50) NOT NULL,
  bank_owner      VARCHAR(255) NOT NULL,
  status          VARCHAR(50) NOT NULL DEFAULT 'PENDING',
  processed_at    TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── PLATFORM CONFIG ────────────────────────────────────────────
CREATE TABLE platform_config (
  key         VARCHAR(100) PRIMARY KEY,
  value       TEXT         NOT NULL,
  description TEXT,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO platform_config (key, value, description) VALUES
  ('platform_fee_pct',    '20',    'Platform fee percentage on course sales'),
  ('reward_profile_pct',  '50',    'Credits rewarded for 80%+ profile completion'),
  ('reward_course_complete', '50', 'Credits rewarded for completing a course'),
  ('reward_hired',        '200',   'Credits rewarded when application status = HIRED'),
  ('reward_referral',     '30',    'Credits rewarded for referral signup'),
  ('job_post_cost',       '50',    'Credits to post a job (30 days)'),
  ('boost_24h_cost',      '100',   'Credits to boost job for 24 hours'),
  ('boost_48h_cost',      '180',   'Credits to boost job for 48 hours'),
  ('boost_7d_cost',       '500',   'Credits to boost job for 7 days'),
  ('reward_expiry_days',  '365',   'Days before reward credits expire'),
  ('credit_to_vnd',       '1000',  'VND value per 1 credit'),
  ('min_withdrawal',      '500',   'Minimum credits for withdrawal'),
  ('course_min_lessons',  '5',     'Minimum lessons to submit course for review'),
  ('course_min_hours',    '2',     'Minimum content hours to submit course for review'),
  ('course_review_sla_days', '3',  'Admin SLA for course review in business days');

-- ── FUNCTION: Atomic credit spend (used by services) ─────────
CREATE OR REPLACE FUNCTION spend_credits(
  p_user_id       UUID,
  p_amount        INT,
  p_ref_type      VARCHAR,
  p_ref_id        UUID,
  p_description   TEXT,
  p_idempotency   VARCHAR
) RETURNS JSONB AS $$
DECLARE
  v_wallet     credit_wallets%ROWTYPE;
  v_ledger_id  UUID;
BEGIN
  IF EXISTS (SELECT 1 FROM credit_ledger WHERE idempotency_key = p_idempotency) THEN
    RETURN jsonb_build_object('success', true, 'idempotent', true);
  END IF;
  SELECT * INTO v_wallet FROM credit_wallets WHERE user_id = p_user_id FOR UPDATE;
  IF v_wallet.balance < p_amount THEN
    RETURN jsonb_build_object('success', false, 'error', 'INSUFFICIENT_CREDIT',
      'balance', v_wallet.balance, 'required', p_amount);
  END IF;
  INSERT INTO credit_ledger (user_id, type, amount, balance_before, balance_after,
    ref_type, ref_id, description, idempotency_key)
  VALUES (p_user_id, 'SPEND', -p_amount, v_wallet.balance, v_wallet.balance - p_amount,
    p_ref_type, p_ref_id, p_description, p_idempotency)
  RETURNING id INTO v_ledger_id;
  UPDATE credit_wallets SET balance = balance - p_amount, updated_at = NOW()
  WHERE user_id = p_user_id;
  RETURN jsonb_build_object('success', true, 'ledger_id', v_ledger_id,
    'new_balance', v_wallet.balance - p_amount);
END;
$$ LANGUAGE plpgsql;
