-- ═══════════════════════════════════════════════════════════════
-- WorkLearn Platform — Database Schema v2.0
-- Migration 001: Core tables
-- Run order: 001 → 002 → 003 → 004
-- ═══════════════════════════════════════════════════════════════

-- Extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";  -- trigram for fuzzy search

-- ── ENUMS ─────────────────────────────────────────────────────
CREATE TYPE user_type AS ENUM ('WORKER', 'EMPLOYER', 'TRAINER', 'ADMIN');
CREATE TYPE user_status AS ENUM ('PENDING_VERIFY', 'ACTIVE', 'SUSPENDED', 'DELETED');
CREATE TYPE job_status AS ENUM ('DRAFT', 'ACTIVE', 'EXPIRED', 'CLOSED');
CREATE TYPE application_status AS ENUM ('NEW', 'REVIEW', 'INTERVIEW', 'HIRED', 'REJECTED', 'WITHDRAWN');
CREATE TYPE course_status AS ENUM ('DRAFT', 'PENDING_REVIEW', 'ACTIVE', 'REJECTED', 'ARCHIVED');
CREATE TYPE credit_type AS ENUM ('TOPUP', 'SPEND', 'REWARD', 'WITHDRAWAL', 'ADMIN_ADJUST', 'REFUND');
CREATE TYPE wallet_credit_type AS ENUM ('PURCHASED', 'REWARD');
CREATE TYPE ledger_status AS ENUM ('PENDING', 'CONFIRMED', 'FAILED', 'REFUNDED');
CREATE TYPE notification_channel AS ENUM ('IN_APP', 'EMAIL', 'PUSH');
CREATE TYPE course_level AS ENUM ('Beginner', 'Intermediate', 'Advanced');

-- ── USERS ─────────────────────────────────────────────────────
CREATE TABLE users (
  id                UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  email             VARCHAR(255) NOT NULL UNIQUE,
  phone             VARCHAR(20),
  password_hash     VARCHAR(255) NOT NULL,
  user_type         user_type   NOT NULL DEFAULT 'WORKER',
  status            user_status NOT NULL DEFAULT 'PENDING_VERIFY',
  email_verified_at TIMESTAMPTZ,
  last_login_at     TIMESTAMPTZ,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_users_email  ON users(email);
CREATE INDEX idx_users_type   ON users(user_type);
CREATE INDEX idx_users_status ON users(status);

-- ── WORKER PROFILES ───────────────────────────────────────────
CREATE TABLE worker_profiles (
  id                  UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id             UUID        NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  full_name           VARCHAR(255) NOT NULL,
  headline            VARCHAR(500),
  bio                 TEXT,
  location            VARCHAR(255),
  avatar_url          VARCHAR(1000),
  cv_url              VARCHAR(1000),
  skills              TEXT[]      NOT NULL DEFAULT '{}',
  years_experience    INT         NOT NULL DEFAULT 0,
  education_level     VARCHAR(100),
  completion_pct      INT         NOT NULL DEFAULT 0 CHECK (completion_pct BETWEEN 0 AND 100),
  is_seeking          BOOLEAN     NOT NULL DEFAULT TRUE,
  linkedin_url        VARCHAR(500),
  github_url          VARCHAR(500),
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_worker_skills ON worker_profiles USING GIN(skills);
CREATE INDEX idx_worker_location ON worker_profiles(location);

-- ── WORKER EXPERIENCE ─────────────────────────────────────────
CREATE TABLE work_experiences (
  id          UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  worker_id   UUID        NOT NULL REFERENCES worker_profiles(id) ON DELETE CASCADE,
  title       VARCHAR(255) NOT NULL,
  company     VARCHAR(255) NOT NULL,
  company_logo VARCHAR(100),
  start_date  DATE        NOT NULL,
  end_date    DATE,
  is_current  BOOLEAN     NOT NULL DEFAULT FALSE,
  description TEXT,
  skills      TEXT[]      DEFAULT '{}',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_exp_worker ON work_experiences(worker_id);

-- ── WORKER EDUCATION ──────────────────────────────────────────
CREATE TABLE educations (
  id          UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  worker_id   UUID        NOT NULL REFERENCES worker_profiles(id) ON DELETE CASCADE,
  school      VARCHAR(255) NOT NULL,
  degree      VARCHAR(255) NOT NULL,
  field       VARCHAR(255),
  year_start  INT,
  year_end    INT,
  gpa         DECIMAL(3,2),
  logo        VARCHAR(100),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── EMPLOYER PROFILES ─────────────────────────────────────────
CREATE TABLE employer_profiles (
  id            UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id       UUID        NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  company_name  VARCHAR(255) NOT NULL,
  tax_code      VARCHAR(50),
  industry      VARCHAR(100),
  company_size  VARCHAR(50),
  description   TEXT,
  website       VARCHAR(500),
  logo_url      VARCHAR(1000),
  verified_at   TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── TRAINER PROFILES ──────────────────────────────────────────
CREATE TABLE trainer_profiles (
  id            UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id       UUID        NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  full_name     VARCHAR(255) NOT NULL,
  bio           TEXT,
  specialties   TEXT[]      DEFAULT '{}',
  avatar_url    VARCHAR(1000),
  rating_avg    DECIMAL(3,2) DEFAULT 0,
  total_students INT        DEFAULT 0,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── JOB POSTINGS ──────────────────────────────────────────────
CREATE TABLE job_postings (
  id               UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  employer_id      UUID        NOT NULL REFERENCES users(id),
  title            VARCHAR(255) NOT NULL,
  description      TEXT        NOT NULL,
  required_skills  TEXT[]      NOT NULL DEFAULT '{}',
  location         VARCHAR(255) NOT NULL,
  job_type         VARCHAR(50) NOT NULL DEFAULT 'Full-time',
  salary_min       INT,
  salary_max       INT,
  salary_display   VARCHAR(100),
  experience_years INT         DEFAULT 0,
  education_level  VARCHAR(100),
  status           job_status  NOT NULL DEFAULT 'ACTIVE',
  boosted          BOOLEAN     NOT NULL DEFAULT FALSE,
  boosted_until    TIMESTAMPTZ,
  applications_count INT       DEFAULT 0,
  views_count      INT         DEFAULT 0,
  expires_at       TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '30 days'),
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_jobs_employer  ON job_postings(employer_id);
CREATE INDEX idx_jobs_status    ON job_postings(status);
CREATE INDEX idx_jobs_skills    ON job_postings USING GIN(required_skills);
CREATE INDEX idx_jobs_location  ON job_postings(location);
CREATE INDEX idx_jobs_expires   ON job_postings(expires_at);
CREATE INDEX idx_jobs_boosted   ON job_postings(boosted, boosted_until);

-- ── APPLICATIONS ──────────────────────────────────────────────
CREATE TABLE applications (
  id              UUID             PRIMARY KEY DEFAULT uuid_generate_v4(),
  job_id          UUID             NOT NULL REFERENCES job_postings(id),
  worker_id       UUID             NOT NULL REFERENCES users(id),
  status          application_status NOT NULL DEFAULT 'NEW',
  matching_score  DECIMAL(5,2)     CHECK (matching_score BETWEEN 0 AND 100),
  cover_letter    TEXT,
  ai_cover_letter TEXT,
  applied_at      TIMESTAMPTZ      NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ      NOT NULL DEFAULT NOW(),
  withdrawn_at    TIMESTAMPTZ,
  UNIQUE(job_id, worker_id)
);

CREATE INDEX idx_apps_job     ON applications(job_id);
CREATE INDEX idx_apps_worker  ON applications(worker_id);
CREATE INDEX idx_apps_status  ON applications(status);

-- ── COURSES ───────────────────────────────────────────────────
CREATE TABLE courses (
  id               UUID         PRIMARY KEY DEFAULT uuid_generate_v4(),
  trainer_id       UUID         NOT NULL REFERENCES users(id),
  title            VARCHAR(500) NOT NULL,
  description      TEXT         NOT NULL,
  outcome_skills   TEXT[]       NOT NULL DEFAULT '{}',
  price_credits    INT          NOT NULL CHECK (price_credits > 0),
  level            course_level NOT NULL DEFAULT 'Beginner',
  thumbnail_url    VARCHAR(1000),
  duration_hours   DECIMAL(5,1),
  lessons_count    INT          DEFAULT 0,
  status           course_status NOT NULL DEFAULT 'DRAFT',
  rating_avg       DECIMAL(3,2) DEFAULT 0,
  rating_count     INT          DEFAULT 0,
  total_students   INT          DEFAULT 0,
  reject_reason    TEXT,
  submitted_at     TIMESTAMPTZ,
  approved_at      TIMESTAMPTZ,
  created_at       TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_courses_trainer  ON courses(trainer_id);
CREATE INDEX idx_courses_status   ON courses(status);
CREATE INDEX idx_courses_skills   ON courses USING GIN(outcome_skills);
CREATE INDEX idx_courses_level    ON courses(level);
CREATE INDEX idx_courses_price    ON courses(price_credits);

-- ── LESSONS ───────────────────────────────────────────────────
CREATE TABLE lessons (
  id           UUID    PRIMARY KEY DEFAULT uuid_generate_v4(),
  course_id    UUID    NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  title        VARCHAR(500) NOT NULL,
  description  TEXT,
  video_url    VARCHAR(1000),
  duration_min INT     DEFAULT 0,
  order_index  INT     NOT NULL,
  is_free      BOOLEAN NOT NULL DEFAULT FALSE,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_lessons_course ON lessons(course_id, order_index);

-- ── ENROLLMENTS ───────────────────────────────────────────────
CREATE TABLE enrollments (
  id               UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  course_id        UUID        NOT NULL REFERENCES courses(id),
  worker_id        UUID        NOT NULL REFERENCES users(id),
  progress_pct     INT         NOT NULL DEFAULT 0 CHECK (progress_pct BETWEEN 0 AND 100),
  completed_lessons TEXT[]     DEFAULT '{}',
  credits_paid     INT         NOT NULL,
  certificate_url  VARCHAR(1000),
  completed_at     TIMESTAMPTZ,
  enrolled_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(course_id, worker_id)
);

CREATE INDEX idx_enroll_worker ON enrollments(worker_id);
CREATE INDEX idx_enroll_course ON enrollments(course_id);

-- ── COURSE REVIEWS ────────────────────────────────────────────
CREATE TABLE course_reviews (
  id         UUID    PRIMARY KEY DEFAULT uuid_generate_v4(),
  course_id  UUID    NOT NULL REFERENCES courses(id),
  worker_id  UUID    NOT NULL REFERENCES users(id),
  rating     INT     NOT NULL CHECK (rating BETWEEN 1 AND 5),
  content    TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(course_id, worker_id)
);

-- ── CERTIFICATES ──────────────────────────────────────────────
CREATE TABLE certificates (
  id            UUID    PRIMARY KEY DEFAULT uuid_generate_v4(),
  enrollment_id UUID    NOT NULL UNIQUE REFERENCES enrollments(id),
  worker_id     UUID    NOT NULL REFERENCES users(id),
  course_id     UUID    NOT NULL REFERENCES courses(id),
  cert_url      VARCHAR(1000) NOT NULL,
  cred_id       VARCHAR(100) NOT NULL UNIQUE,
  issued_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_certs_worker ON certificates(worker_id);
