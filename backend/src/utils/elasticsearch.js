// ── utils/elasticsearch.js ────────────────────────────────────
'use strict';
const { Client } = require('@elastic/elasticsearch');

const es = new Client({
  node: process.env.ELASTICSEARCH_URL || 'http://localhost:9200',
  requestTimeout: 10000,
});

// Ensure indices exist on startup
async function initIndices() {
  const indices = [
    {
      name: 'jobs',
      mappings: {
        properties: {
          title:           { type: 'text', analyzer: 'standard' },
          description:     { type: 'text' },
          required_skills: { type: 'keyword' },
          location:        { type: 'keyword' },
          job_type:        { type: 'keyword' },
          salary_min:      { type: 'integer' },
          salary_max:      { type: 'integer' },
          boosted:         { type: 'boolean' },
          created_at:      { type: 'date' },
          expires_at:      { type: 'date' },
        },
      },
    },
    {
      name: 'courses',
      mappings: {
        properties: {
          title:          { type: 'text', analyzer: 'standard' },
          description:    { type: 'text' },
          outcome_skills: { type: 'keyword' },
          level:          { type: 'keyword' },
          price_credits:  { type: 'integer' },
          rating_avg:     { type: 'float' },
          total_students: { type: 'integer' },
        },
      },
    },
  ];

  for (const idx of indices) {
    const exists = await es.indices.exists({ index: idx.name }).catch(() => false);
    if (!exists) {
      await es.indices.create({ index: idx.name, mappings: idx.mappings });
      console.log(`✅ ES index created: ${idx.name}`);
    }
  }
}

initIndices().catch(e => console.warn('ES init warning:', e.message));

module.exports = es;
