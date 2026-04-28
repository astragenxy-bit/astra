// ── database/seeds/seed.js ───────────────────────────────────
'use strict';
require('dotenv').config({ path: '../../.env' });
const { Pool } = require('pg');
const bcrypt   = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function seed() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    console.log('🌱 Seeding WorkLearn demo data...');

    // ── Users
    const pass = await bcrypt.hash('password123', 10);
    const users = [
      { id: uuidv4(), email: 'minh@worklearn.demo',    type: 'WORKER',   name: 'Nguyễn Văn Minh' },
      { id: uuidv4(), email: 'hoa@worklearn.demo',     type: 'EMPLOYER', name: 'Trần Thị Hoa' },
      { id: uuidv4(), email: 'tuan@worklearn.demo',    type: 'TRAINER',  name: 'Lê Văn Tuấn' },
      { id: uuidv4(), email: 'admin@worklearn.demo',   type: 'ADMIN',    name: 'Admin WorkLearn' },
    ];

    for (const u of users) {
      await client.query(
        `INSERT INTO users (id,email,password_hash,user_type,status,email_verified_at) VALUES ($1,$2,$3,$4,'ACTIVE',NOW()) ON CONFLICT DO NOTHING`,
        [u.id, u.email, pass, u.type]
      );
      await client.query(`INSERT INTO credit_wallets (user_id,balance) VALUES ($1,$2) ON CONFLICT DO NOTHING`, [u.id, 500]);
    }

    const [wId, eId, tId] = users.map(u => u.id);

    // ── Worker Profile
    await client.query(`
      INSERT INTO worker_profiles (user_id, full_name, headline, bio, location, skills, years_experience, education_level, completion_pct, is_seeking)
      VALUES ($1, $2, $3, $4, $5, $6, 2, 'university', 75, true) ON CONFLICT DO NOTHING
    `, [wId, 'Nguyễn Văn Minh', 'Kế toán → Data Analyst',
        'Chuyên viên kế toán 2 năm đang chuyển hướng sang Data Analytics.',
        'TP.HCM', ['Excel', 'SQL', 'Power BI']]);

    await client.query(`INSERT INTO profile_stats (worker_id, profile_views) SELECT id, 128 FROM worker_profiles WHERE user_id=$1 ON CONFLICT DO NOTHING`, [wId]);

    // ── Employer Profile
    await client.query(`
      INSERT INTO employer_profiles (user_id, company_name, industry, company_size, verified_at)
      VALUES ($1, 'TechCorp VN', 'Công nghệ thông tin', '50-200', NOW()) ON CONFLICT DO NOTHING
    `, [eId]);

    // ── Trainer Profile
    await client.query(`
      INSERT INTO trainer_profiles (user_id, full_name, bio, specialties, rating_avg)
      VALUES ($1, 'Lê Văn Tuấn', 'Giảng viên Data Science 8 năm kinh nghiệm', '{Python, SQL, Machine Learning}', 4.8) ON CONFLICT DO NOTHING
    `, [tId]);

    // ── Job Postings
    const jobs = [
      { title: 'Data Analyst', skills: ['SQL','Python','Tableau','Excel'],    salary_min: 15000000, salary_max: 20000000, loc: 'TP.HCM' },
      { title: 'BI Developer',  skills: ['Power BI','SQL','DAX','Azure'],     salary_min: 20000000, salary_max: 28000000, loc: 'Hà Nội' },
      { title: 'Data Scientist',skills: ['Python','Machine Learning','SQL'],  salary_min: 18000000, salary_max: 25000000, loc: 'TP.HCM' },
    ];

    for (const j of jobs) {
      await client.query(`
        INSERT INTO job_postings (employer_id, title, description, required_skills, location, job_type, salary_min, salary_max, salary_display, status, expires_at)
        VALUES ($1,$2,$3,$4,$5,'Full-time',$6,$7,$8,'ACTIVE', NOW()+INTERVAL '30 days') ON CONFLICT DO NOTHING
      `, [eId, j.title, `Vị trí ${j.title} tại TechCorp VN. Yêu cầu kinh nghiệm 2+ năm.`, j.skills, j.loc,
          j.salary_min, j.salary_max, `${j.salary_min/1000000}-${j.salary_max/1000000}tr`]);
    }

    // ── Courses
    const courseId = uuidv4();
    await client.query(`
      INSERT INTO courses (id, trainer_id, title, description, outcome_skills, price_credits, level, duration_hours, status, rating_avg, total_students)
      VALUES ($1,$2,$3,$4,$5,150,'Beginner',24,'ACTIVE',4.8,1240) ON CONFLICT DO NOTHING
    `, [courseId, tId, 'Python for Data Analysis',
        'Khóa học Python thực hành từ cơ bản đến phân tích dữ liệu với Pandas và NumPy.',
        ['Python', 'Pandas', 'NumPy']]);

    for (let i = 1; i <= 6; i++) {
      await client.query(`
        INSERT INTO lessons (course_id, title, duration_min, order_index, is_free)
        VALUES ($1, $2, $3, $4, $5) ON CONFLICT DO NOTHING
      `, [courseId, `Bài ${i}: ${['Giới thiệu Python','Biến & kiểu dữ liệu','Pandas cơ bản','NumPy arrays','Data cleaning','Visualization'][i-1]}`,
          [45,60,90,70,85,80][i-1], i, i === 1]);
    }

    await client.query('UPDATE courses SET lessons_count=6 WHERE id=$1', [courseId]);

    // ── Sample enrollment
    await client.query(`
      INSERT INTO enrollments (course_id, worker_id, progress_pct, credits_paid)
      VALUES ($1,$2,65,150) ON CONFLICT DO NOTHING
    `, [courseId, wId]);

    // ── Ledger entries for worker
    const ledgerEntries = [
      { type:'TOPUP',  amt:500,  before:0,   after:500,  desc:'Nạp credit qua Foxpay' },
      { type:'SPEND',  amt:-150, before:500, after:350,  desc:'Đăng ký Python for Data Analysis' },
      { type:'REWARD', amt:50,   before:350, after:400,  desc:'Thưởng hoàn thiện hồ sơ' },
      { type:'SPEND',  amt:-50,  before:400, after:350,  desc:'Mua gói nạp thêm' },
      { type:'REWARD', amt:50,   before:350, after:400,  desc:'Thưởng hoàn thành SQL course' },
    ];

    for (const e of ledgerEntries) {
      await client.query(`
        INSERT INTO credit_ledger (user_id, type, amount, balance_before, balance_after, credit_type, description, idempotency_key)
        VALUES ($1,$2,$3,$4,$5,'PURCHASED',$6,$7) ON CONFLICT DO NOTHING
      `, [wId, e.type, e.amt, e.before, e.after, e.desc, `seed:${wId}:${e.type}:${e.before}`]);
    }

    await client.query('UPDATE credit_wallets SET balance=400 WHERE user_id=$1', [wId]);

    // ── Sample notifications
    await client.query(`
      INSERT INTO notifications (user_id, type, title, body, channel)
      VALUES ($1,'CREDIT_TOPUP','Nạp 500 credit thành công','Số dư: 400 credit','IN_APP') ON CONFLICT DO NOTHING
    `, [wId]);

    await client.query('COMMIT');
    console.log('✅ Seed complete!');
    console.log('');
    console.log('Demo accounts:');
    console.log('  NLĐ:    minh@worklearn.demo   / password123');
    console.log('  NTD:    hoa@worklearn.demo    / password123');
    console.log('  ĐTĐT:   tuan@worklearn.demo   / password123');
    console.log('  Admin:  admin@worklearn.demo  / password123');

  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Seed failed:', err);
  } finally {
    client.release();
    pool.end();
  }
}

seed();
