-- ═══════════════════════════════════════════════════════════════
-- WorkLearn Platform — Migration 003: Notifications, AI, OTP
-- ═══════════════════════════════════════════════════════════════

-- ── OTP VERIFICATIONS ─────────────────────────────────────────
CREATE TABLE otp_verifications (
  id          UUID    PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id     UUID    REFERENCES users(id) ON DELETE CASCADE,
  identifier  VARCHAR(255) NOT NULL,   -- email or phone
  code        VARCHAR(10)  NOT NULL,
  type        VARCHAR(50)  NOT NULL,   -- EMAIL_VERIFY, PHONE_VERIFY, LOGIN, LARGE_TXN
  attempts    INT     NOT NULL DEFAULT 0,
  expires_at  TIMESTAMPTZ NOT NULL,
  verified_at TIMESTAMPTZ,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_otp_identifier ON otp_verifications(identifier, type);

-- ── NOTIFICATIONS ─────────────────────────────────────────────
CREATE TABLE notifications (
  id         UUID    PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id    UUID    NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type       VARCHAR(100) NOT NULL,    -- JOB_APPLIED, STATUS_CHANGED, COURSE_COMPLETE...
  title      VARCHAR(500) NOT NULL,
  body       TEXT    NOT NULL,
  channel    notification_channel NOT NULL DEFAULT 'IN_APP',
  read_at    TIMESTAMPTZ,
  ref_type   VARCHAR(100),
  ref_id     UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_notif_user   ON notifications(user_id);
CREATE INDEX idx_notif_unread ON notifications(user_id, read_at) WHERE read_at IS NULL;

-- ── AI MATCHING SCORES (cached) ───────────────────────────────
CREATE TABLE matching_scores (
  id         UUID    PRIMARY KEY DEFAULT uuid_generate_v4(),
  worker_id  UUID    NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  job_id     UUID    NOT NULL REFERENCES job_postings(id) ON DELETE CASCADE,
  score      DECIMAL(5,2) NOT NULL,
  skill_score    DECIMAL(5,2),
  exp_score      DECIMAL(5,2),
  edu_score      DECIMAL(5,2),
  loc_score      DECIMAL(5,2),
  behavioral_score DECIMAL(5,2),
  matched_skills TEXT[] DEFAULT '{}',
  missing_skills TEXT[] DEFAULT '{}',
  computed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(worker_id, job_id)
);

CREATE INDEX idx_match_worker ON matching_scores(worker_id, score DESC);
CREATE INDEX idx_match_job    ON matching_scores(job_id);

-- ── BEHAVIORAL EVENTS ─────────────────────────────────────────
CREATE TABLE behavioral_events (
  id         UUID    PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id    UUID    NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  event_type VARCHAR(100) NOT NULL,   -- JOB_VIEW, JOB_APPLY, COURSE_VIEW, SEARCH...
  ref_type   VARCHAR(50),
  ref_id     UUID,
  metadata   JSONB,
  weight     DECIMAL(5,2) DEFAULT 1.0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_events_user    ON behavioral_events(user_id);
CREATE INDEX idx_events_type    ON behavioral_events(event_type);
CREATE INDEX idx_events_created ON behavioral_events(created_at DESC);

-- ── PROFILE STATS (view cache) ────────────────────────────────
CREATE TABLE profile_stats (
  worker_id       UUID PRIMARY KEY REFERENCES worker_profiles(id) ON DELETE CASCADE,
  profile_views   INT DEFAULT 0,
  search_appearances INT DEFAULT 0,
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);

-- ── REFRESH TOKENS ────────────────────────────────────────────
CREATE TABLE refresh_tokens (
  id          UUID    PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id     UUID    NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash  VARCHAR(255) NOT NULL UNIQUE,
  expires_at  TIMESTAMPTZ NOT NULL,
  revoked_at  TIMESTAMPTZ,
  user_agent  TEXT,
  ip_address  INET,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_refresh_user  ON refresh_tokens(user_id);
CREATE INDEX idx_refresh_hash  ON refresh_tokens(token_hash);

-- ── TRIGGERS: auto update updated_at ─────────────────────────
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_users_updated           BEFORE UPDATE ON users           FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_worker_profiles_updated BEFORE UPDATE ON worker_profiles FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_employer_updated        BEFORE UPDATE ON employer_profiles FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_jobs_updated            BEFORE UPDATE ON job_postings     FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_courses_updated         BEFORE UPDATE ON courses          FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_enrollments_updated     BEFORE UPDATE ON enrollments      FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_applications_updated    BEFORE UPDATE ON applications     FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ── AUTO-EXPIRE JOBS ──────────────────────────────────────────
-- (Called by cron job / scheduler)
CREATE OR REPLACE FUNCTION expire_jobs()
RETURNS INT AS $$
DECLARE expired_count INT;
BEGIN
  UPDATE job_postings
  SET status = 'EXPIRED'
  WHERE status = 'ACTIVE' AND expires_at < NOW();
  GET DIAGNOSTICS expired_count = ROW_COUNT;
  RETURN expired_count;
END;
$$ LANGUAGE plpgsql;

-- ── FUNCTION: Spend credits (atomic with lock) ────────────────
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
  -- Idempotency check
  IF EXISTS (SELECT 1 FROM credit_ledger WHERE idempotency_key = p_idempotency) THEN
    RETURN jsonb_build_object('success', true, 'idempotent', true);
  END IF;

  -- Lock wallet row
  SELECT * INTO v_wallet FROM credit_wallets WHERE user_id = p_user_id FOR UPDATE;

  IF v_wallet.balance < p_amount THEN
    RETURN jsonb_build_object('success', false, 'error', 'INSUFFICIENT_CREDIT',
      'balance', v_wallet.balance, 'required', p_amount);
  END IF;

  -- Insert ledger record
  INSERT INTO credit_ledger (user_id, type, amount, balance_before, balance_after,
    ref_type, ref_id, description, idempotency_key)
  VALUES (p_user_id, 'SPEND', -p_amount, v_wallet.balance, v_wallet.balance - p_amount,
    p_ref_type, p_ref_id, p_description, p_idempotency)
  RETURNING id INTO v_ledger_id;

  -- Update wallet
  UPDATE credit_wallets SET balance = balance - p_amount, updated_at = NOW()
  WHERE user_id = p_user_id;

  RETURN jsonb_build_object('success', true, 'ledger_id', v_ledger_id,
    'new_balance', v_wallet.balance - p_amount);
END;
$$ LANGUAGE plpgsql;
