// ── services/searchService.js ────────────────────────────────
'use strict';
const es = require('../utils/elasticsearch');

async function indexJob(job) {
  try {
    await es.index({
      index: 'jobs',
      id:    job.id,
      document: {
        title:           job.title,
        description:     job.description,
        required_skills: job.required_skills,
        location:        job.location,
        job_type:        job.job_type,
        salary_min:      job.salary_min,
        salary_max:      job.salary_max,
        salary_display:  job.salary_display,
        employer_id:     job.employer_id,
        boosted:         job.boosted || false,
        created_at:      job.created_at,
        expires_at:      job.expires_at,
      },
    });
  } catch (e) { console.error('ES indexJob error:', e.message); }
}

async function indexCourse(course) {
  try {
    await es.index({
      index: 'courses',
      id:    course.id,
      document: {
        title:          course.title,
        description:    course.description,
        outcome_skills: course.outcome_skills,
        level:          course.level,
        price_credits:  course.price_credits,
        rating_avg:     course.rating_avg || 0,
        total_students: course.total_students || 0,
        trainer_id:     course.trainer_id,
      },
    });
  } catch (e) { console.error('ES indexCourse error:', e.message); }
}

async function removeFromIndex(index, id) {
  try { await es.delete({ index, id }); } catch {}
}

async function searchJobs({ q, location, skills, min_salary, max_salary, type, from = 0, size = 20 }) {
  try {
    const must = [{ term: { _exists: 'title' } }]; // placeholder
    const filter = [];

    if (q)          must.push({ multi_match: { query: q, fields: ['title^3','description','required_skills^2'] } });
    if (location)   filter.push({ match: { location } });
    if (type)       filter.push({ term: { job_type: type } });
    if (min_salary) filter.push({ range: { salary_min: { gte: min_salary } } });
    if (max_salary) filter.push({ range: { salary_max: { lte: max_salary } } });
    if (skills?.length) filter.push({ terms: { required_skills: skills } });

    const result = await es.search({
      index: 'jobs',
      from, size,
      query: { bool: { must, filter } },
      sort: [{ boosted: 'desc' }, { _score: 'desc' }, { created_at: 'desc' }],
    });

    return { hits: result.hits.hits, total: result.hits.total.value };
  } catch (e) {
    console.error('ES searchJobs error:', e.message);
    return { hits: [], total: 0 };
  }
}

module.exports = { indexJob, indexCourse, removeFromIndex, searchJobs };
