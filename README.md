# WorkLearn AI Platform - career.jockerow.com

A full-stack AI-native learning platform with career development features.

## Quick Start

```bash
# 1. Clone and setup
git clone https://github.com/your-username/worklearn_ai.git
cd worklearn_ai

# 2. Copy environment variables
cp .env.example .env
# Edit .env with your credentials

# 3. Start services
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d

# 4. Check health
docker compose ps
curl https://career.jockerow.com/api/v1/health
```

## Architecture

- **Frontend**: React + Vite (Nginx)
- **Backend**: Node.js + Express (PostgreSQL)
- **Cache**: Redis
- **Search**: Elasticsearch
- **Storage**: Cloudflare R2 (or MinIO)
- **Reverse Proxy**: Nginx (SSL/TLS)
- **SSL**: Let's Encrypt (Certbot)

## Services

| Service | Port | Purpose |
|---------|------|---------|
| Nginx | 80, 443 | Reverse proxy + SSL |
| Frontend | 3000 | React UI (internal) |
| Backend | 4000 | API Server (internal) |
| PostgreSQL | 5432 | Database |
| Redis | 6379 | Cache & Queue |
| Elasticsearch | 9200 | Search Engine |
| MinIO | 9000-9001 | S3-compatible Storage |

## Deployment

### GitHub

Push to GitHub:
```bash
git add .
git commit -m "Initial commit: WorkLearn AI Platform"
git branch -M main
git remote add origin https://github.com/your-username/worklearn_ai.git
git push -u origin main
```

### Cloudflare DNS

1. Add DNS record in Cloudflare:
   - Type: `CNAME`
   - Name: `career`
   - Target: `your-server.example.com`
   - Proxy: Enabled (optional)

2. Configure SSL in Cloudflare:
   - SSL/TLS → Full (or Full Strict)
   - Edge Certificates → Auto

3. Update Cloudflare R2:
   - Create bucket: `worklearn`
   - Get API token with object storage permissions
   - Add to `.env`: `R2_*` variables

### Docker Deployment

```bash
# Build images
docker compose build

# Start with production compose
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d

# View logs
docker compose logs -f backend

# Health check
docker compose exec backend curl http://localhost:4000/api/v1/health
```

## Configuration

### Environment Variables

See `.env.example` for all options. Key production settings:

- `NODE_ENV=production`
- `POSTGRES_PASSWORD` → Strong password
- `JWT_SECRET` → Generated with `openssl rand -base64 64`
- `ANTHROPIC_API_KEY` → From Claude console
- `R2_*` → Cloudflare R2 credentials

### SSL Certificates

Handled by Certbot in docker-compose.prod.yml. First run requires setup:

```bash
# Initial cert generation
docker compose exec certbot certbot certonly --webroot -w /var/www/certbot \
  -d career.jockerow.com -d www.career.jockerow.com
```

## Monitoring

Check container health:
```bash
docker compose ps
docker compose logs
docker compose stats
```

## Troubleshooting

**Backend won't start:**
```bash
docker compose logs backend
docker compose exec backend npm run dev
```

**Database connection error:**
```bash
docker compose exec postgres psql -U worklearn -d worklearn -c "SELECT 1"
```

**Nginx SSL issues:**
```bash
docker compose logs nginx
docker compose exec nginx nginx -t
```

## Development

For local development:
```bash
docker compose up -d
```

This uses docker-compose.yml with hot-reload volumes.

## License

Proprietary - WorkLearn Inc.
