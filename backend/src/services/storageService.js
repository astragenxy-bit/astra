// ── services/storageService.js ───────────────────────────────
'use strict';
const Minio = require('minio');

const client = new Minio.Client({
  endPoint:  process.env.MINIO_ENDPOINT  || 'localhost',
  port:      parseInt(process.env.MINIO_PORT || '9000'),
  useSSL:    false,
  accessKey: process.env.MINIO_ACCESS_KEY || 'minioadmin',
  secretKey: process.env.MINIO_SECRET_KEY || 'minioadmin123',
});

const BUCKET = process.env.MINIO_BUCKET || 'worklearn';

async function ensureBucket() {
  const exists = await client.bucketExists(BUCKET);
  if (!exists) {
    await client.makeBucket(BUCKET);
    // Set public read policy
    await client.setBucketPolicy(BUCKET, JSON.stringify({
      Version: '2012-10-17',
      Statement: [{ Effect: 'Allow', Principal: '*', Action: ['s3:GetObject'], Resource: [`arn:aws:s3:::${BUCKET}/*`] }],
    }));
  }
}

async function uploadFile(path, buffer, contentType) {
  await ensureBucket();
  await client.putObject(BUCKET, path, buffer, buffer.length, { 'Content-Type': contentType });
  const endpoint = process.env.MINIO_ENDPOINT || 'localhost';
  const port     = process.env.MINIO_PORT || '9000';
  return `http://${endpoint}:${port}/${BUCKET}/${path}`;
}

async function deleteFile(path) {
  await client.removeObject(BUCKET, path);
}

module.exports = { uploadFile, deleteFile };
