# WorkLearn AI - Branch feature/career-worklearn

## 📌 Thông Tin Branch

| Thông số | Giá trị |
|---------|--------|
| **Branch** | `feature/career-worklearn` |
| **Subdomain** | career.jockerow.com |
| **Repository** | github.com/astragenxy-bit/astra |
| **Status** | Ready for deployment |

---

## 🏗️ Kiến Trúc

```
┌─────────────────────────────────────┐
│  career.jockerow.com (Cloudflare)   │
└──────────────┬──────────────────────┘
               │
        ┌──────▼──────┐
        │  Nginx SSL  │
        │  (443/80)   │
        └──────┬──────┘
               │
    ┌──────────┼──────────┐
    │          │          │
┌───▼──┐  ┌────▼─────┐  ┌▼────────┐
│ API  │  │ Frontend  │  │ Webhooks│
│ 4000 │  │   3000    │  │  :4000  │
└───┬──┘  └────┬─────┘  └─────────┘
    │         │
┌───▴─────────▴──┐
│  Backend App   │
│  Node.js       │
└────────┬───────┘
         │
   ┌─────┴──────┬───────┬──────┐
   │            │       │      │
┌──▼──┐  ┌─────▼─┐ ┌───▼──┐ ┌─▼─────┐
│ PG  │  │ Redis │ │  ES  │ │MinIO/ │
│5432 │  │ 6379  │ │ 9200 │ │  R2   │
└─────┘  └───────┘ └──────┘ └───────┘
```

---

## 📦 Services

| Service | Port | Image | RAM | Storage |
|---------|------|-------|-----|---------|
| **Nginx** | 80, 443 | nginx:alpine | 256M | - |
| **Backend** | 4000 | node:20-alpine | 512M-1G | - |
| **Frontend** | 3000 | node:20-alpine + nginx | 128M-256M | - |
| **PostgreSQL** | 5432 | postgres:16-alpine | 2G | postgres_data |
| **Redis** | 6379 | redis:7-alpine | 512M | redis_data |
| **Elasticsearch** | 9200 | elasticsearch:8.13.0 | 1.5G | es_data |
| **MinIO** | 9000-9001 | minio:latest | 256M | minio_data |

**Total RAM (Production):** ~6.5 GB recommended

---

## 🚀 Deployment Steps

### 1️⃣ GitHub Setup (✅ Done)
```bash
✅ Branch created: feature/career-worklearn
✅ Code pushed to GitHub
✅ Ready to deploy
```

### 2️⃣ Cloudflare DNS Configuration

**Tạo CNAME record:**
- **Type:** CNAME
- **Name:** career
- **Target:** your-server-ip.com (hoặc tên server)
- **Proxy:** ✓ Proxied
- **TTL:** Auto

**SSL/TLS Settings:**
- **Mode:** Full (Strict)
- **Auto HTTPS:** Enabled
- **Min TLS:** 1.2

### 3️⃣ Server Setup

```bash
# SSH vào server
ssh root@your-server-ip

# Clone repo
git clone https://github.com/astragenxy-bit/astra.git
cd astra
git checkout feature/career-worklearn

# Setup environment
cp .env.example .env
# Edit .env với thông tin thực:
nano .env

# Cần điền:
# - POSTGRES_PASSWORD (mật khẩu mạnh)
# - REDIS_PASSWORD (mật khẩu mạnh)
# - JWT_SECRET (openssl rand -base64 64)
# - ANTHROPIC_API_KEY
# - R2_* credentials (Cloudflare)
# - EMAIL credentials (SendGrid)
# - FPAY credentials (nếu dùng)

# Build images
docker compose build

# Start services
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d

# Setup SSL certificate
docker compose exec certbot certbot certonly \
  --webroot -w /var/www/certbot \
  -d career.jockerow.com \
  -d www.career.jockerow.com
```

### 4️⃣ Verify Deployment

```bash
# Check containers
docker compose ps

# Check health
curl https://career.jockerow.com/api/v1/health

# View logs
docker compose logs -f backend
docker compose logs -f nginx
```

---

## 📋 Environment Variables

### Required (Production)
```env
NODE_ENV=production
POSTGRES_PASSWORD=<strong_password>
REDIS_PASSWORD=<strong_password>
JWT_SECRET=<openssl_rand_base64_64>
ANTHROPIC_API_KEY=sk-ant-xxxxx
```

### Optional (For Features)
```env
FPAY_MERCHANT_ID=your_merchant_id
FPAY_SECRET_KEY=your_secret
R2_ACCOUNT_ID=cloudflare_account_id
R2_ACCESS_KEY=cloudflare_access_key
R2_SECRET_KEY=cloudflare_secret_key
EMAIL_HOST=smtp.sendgrid.net
EMAIL_USER=apikey
EMAIL_PASS=SG.xxxxx
```

---

## 🔧 Useful Commands

```bash
# Xem status các container
docker compose ps

# Xem logs real-time
docker compose logs -f

# Xem logs service cụ thể
docker compose logs -f backend
docker compose logs -f nginx

# Restart service
docker compose restart backend

# Stop/Start
docker compose down
docker compose up -d

# Execute command in container
docker compose exec backend npm run seed

# Database backup
docker compose exec postgres pg_dump -U worklearn worklearn > backup-$(date +%Y%m%d).sql

# Database restore
docker compose exec -T postgres psql -U worklearn worklearn < backup-20240101.sql

# Check disk usage
docker system df

# Cleanup
docker system prune -a
```

---

## 🔍 Troubleshooting

### Backend won't start
```bash
docker compose logs backend
# Check:
# - DATABASE_URL connection string
# - JWT_SECRET format
# - API keys validity
```

### Frontend 503
```bash
docker compose logs frontend
# Check nginx config
docker compose exec nginx nginx -t
```

### SSL Certificate Error
```bash
# Renewal
docker compose exec certbot certbot renew --force-renewal

# Manual setup
docker compose exec certbot certbot certonly --webroot \
  -w /var/www/certbot \
  -d career.jockerow.com
```

### Database Connection Failed
```bash
# Check PostgreSQL
docker compose logs postgres
docker compose exec postgres pg_isready

# Restart
docker compose restart postgres
```

### Out of Memory
```bash
docker system df
docker stats --no-stream

# Prune
docker system prune -a
```

---

## 📊 Monitoring

### Health Check
```bash
curl -i https://career.jockerow.com/api/v1/health
```

### Database
```bash
docker compose exec postgres psql -U worklearn -d worklearn -c "SELECT 1"
```

### Redis
```bash
docker compose exec redis redis-cli -a <REDIS_PASSWORD> PING
```

### Elasticsearch
```bash
curl http://localhost:9200/_cluster/health
```

---

## 🔐 Security Checklist

- [ ] Đổi tất cả default passwords
- [ ] Setup JWT_SECRET strong (min 64 chars)
- [ ] Enable HTTPS/SSL
- [ ] Configure Cloudflare WAF
- [ ] Setup firewall rules
- [ ] Regular database backups
- [ ] Monitor logs
- [ ] Update Docker images

---

## 📞 Support

**Cần giúp?**
- Xem file `DEPLOYMENT.md` để hướng dẫn chi tiết
- Xem file `QUICK_START.md` cho quick reference
- Check logs: `docker compose logs -f`

---

**Branch Status:** ✅ Ready  
**Last Updated:** 2026-04-28  
**Maintained by:** Astra Dev Team
