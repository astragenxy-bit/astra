# WorkLearn AI Deployment Guide

## GitHub Setup

1. **Create a new repository on GitHub:**
   ```
   Name: worklearn_ai
   Description: AI-native learning platform with career development
   Visibility: Private (or Public)
   ```

2. **Push local repo to GitHub:**
   ```bash
   cd ./worklearn_ai_final/worklearn_ai
   git remote add origin https://github.com/your-username/worklearn_ai.git
   git branch -M main
   git push -u origin main
   ```

3. **GitHub Secrets Configuration** (Settings → Secrets):
   - `DEPLOY_KEY`: SSH private key for server access
   - `DEPLOY_HOST`: Your server IP/hostname
   - `DEPLOY_USER`: SSH user (e.g., `root` or `deploy`)
   - `SLACK_WEBHOOK`: Optional Slack notifications

## Cloudflare DNS Configuration

1. **Add DNS record:**
   - Type: `CNAME`
   - Name: `career`
   - Target: `your-server-ip.com` or actual server hostname
   - Proxy status: ✓ Proxied (recommended for security)
   - TTL: Auto

2. **Configure SSL/TLS:**
   - Go to: SSL/TLS → Overview
   - Mode: "Full" or "Full (Strict)"
   - Automatic: Enable "Always Use HTTPS"

3. **Setup Cloudflare R2 (for file storage):**
   ```bash
   # Create bucket in Cloudflare R2 dashboard
   # Bucket name: worklearn
   
   # Get API credentials:
   # Account ID, API Token with Object Storage permission
   
   # Update .env:
   R2_ACCOUNT_ID=<your-account-id>
   R2_ACCESS_KEY=<api-key>
   R2_SECRET_KEY=<api-secret>
   R2_PUBLIC_URL=https://pub-<random>.r2.dev/worklearn
   ```

## Server Setup (Linux)

```bash
# 1. SSH into your server
ssh root@your-server

# 2. Install Docker & Docker Compose
curl -fsSL https://get.docker.com -o get-docker.sh
sh get-docker.sh
curl -L "https://github.com/docker/compose/releases/download/v2.20.0/docker-compose-$(uname -s)-$(uname -m)" -o /usr/local/bin/docker-compose
chmod +x /usr/local/bin/docker-compose

# 3. Create app directory
mkdir -p /app
cd /app

# 4. Clone repository
git clone https://github.com/your-username/worklearn_ai.git
cd worklearn_ai

# 5. Copy and configure .env
cp .env.example .env
nano .env
# Edit with real values: database passwords, API keys, etc.

# 6. Start services
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d

# 7. Verify health
docker compose ps
curl http://localhost/api/v1/health
```

## Production Deployment

### First-time SSL Setup

```bash
# Initial Let's Encrypt certificate
docker compose exec certbot certbot certonly \
  --webroot -w /var/www/certbot \
  -d career.jockerow.com \
  -d www.career.jockerow.com \
  --agree-tos -m admin@jockerow.com
```

### Docker Image Build

```bash
# Build locally
docker compose build

# Or use GitHub Actions (automatic on push to main)
# Builds to: ghcr.io/your-username/worklearn_ai/backend:latest
#            ghcr.io/your-username/worklearn_ai/frontend:latest
```

### Monitoring

```bash
# Check status
docker compose ps

# View logs
docker compose logs -f backend
docker compose logs -f frontend
docker compose logs -f nginx

# Health endpoint
curl https://career.jockerow.com/api/v1/health

# Database check
docker compose exec postgres psql -U worklearn -d worklearn -c "SELECT 1"

# Redis check
docker compose exec redis redis-cli -a <REDIS_PASSWORD> PING
```

### Backups

```bash
# Database backup
docker compose exec postgres pg_dump -U worklearn worklearn > backup-$(date +%Y%m%d).sql

# MinIO/R2 backup
# Files sync via R2 through AWS CLI or Cloudflare Dashboard
```

## Troubleshooting

| Issue | Solution |
|-------|----------|
| **Backend won't start** | `docker compose logs backend` - Check DB connection & JWT_SECRET |
| **Frontend 503** | `docker compose logs frontend` - Check Nginx config |
| **SSL certificate error** | Verify certbot volumes and Let's Encrypt renewal |
| **Database locked** | `docker compose restart postgres` |
| **Out of disk space** | `docker system prune -a` (removes unused images/containers) |
| **Memory issues** | Increase Docker memory limits or scale down services |

## Environment Variables Reference

```
Production domain: career.jockerow.com
Backend API: https://career.jockerow.com/api/v1
Frontend: https://career.jockerow.com

Key passwords (change these in production):
- POSTGRES_PASSWORD
- REDIS_PASSWORD
- JWT_SECRET (use: openssl rand -base64 64)
- MINIO_ROOT_PASSWORD (if not using R2)

API Keys (required):
- ANTHROPIC_API_KEY (from Claude console)
- FPAY_SECRET_KEY (if using FoxPay)
- R2_* (Cloudflare credentials)
- EMAIL credentials (SendGrid or Gmail)
```

## Updating Production

```bash
# Pull latest code
git pull origin main

# Update environment if needed
nano .env

# Rebuild and restart
docker compose -f docker-compose.yml -f docker-compose.prod.yml pull
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d

# Verify
docker compose ps
curl https://career.jockerow.com/api/v1/health
```

## Useful Commands

```bash
# Start services
docker compose up -d

# Stop services
docker compose down

# View real-time logs
docker compose logs -f

# Execute command in container
docker compose exec backend npm run seed

# View container stats
docker compose stats

# Network inspection
docker network inspect worklearn_prod

# Rebuild without cache
docker compose build --no-cache
```

Done! Your platform should now be live at **https://career.jockerow.com**
