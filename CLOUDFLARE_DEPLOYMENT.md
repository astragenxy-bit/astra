# Cloudflare Pages + Workers Deployment

## 📋 Thông Tin Deployment

| Thành phần | Chi tiết |
|-----------|---------|
| **Frontend** | Cloudflare Pages (Static hosting) |
| **API Proxy** | Cloudflare Workers (Edge computing) |
| **Domain** | career.jockerow.com (via Cloudflare DNS) |
| **Deployment** | GitHub Actions (auto) |

---

## 🔧 Setup Chi Tiết

### 1. GitHub Actions Secrets

Thêm vào GitHub repo settings (Settings → Secrets and variables → Actions):

```
CLOUDFLARE_API_TOKEN=<your-token-here>
CLOUDFLARE_ACCOUNT_ID=<your-account-id>
CLOUDFLARE_ZONE_ID=<your-zone-id>
```

### 2. Cloudflare Pages Project

```bash
# Tạo project (hoặc tôi sẽ tạo qua API)
# Project name: worklearn-career
# Branch: feature/career-worklearn
# Build command: npm run build (trong folder frontend)
# Build output: frontend/dist
```

### 3. Cloudflare Workers

```bash
# Deploy via wrangler
npx wrangler deploy

# Routes:
# - career.jockerow.com/api/* → Workers (API proxy)
# - career.jockerow.com/* → Pages (Frontend)
```

### 4. DNS Configuration

**Type:** CNAME  
**Name:** career  
**Content:** worklearn-career.pages.dev  
**Proxied:** Yes (🟠)

---

## 🚀 Deployment Process

### Automatic (GitHub Actions)
```bash
# Push code lên branch
git push origin feature/career-worklearn

# GitHub Actions tự động:
# 1. Build frontend React
# 2. Deploy to Cloudflare Pages
# 3. Deploy API proxy to Workers
# 4. Configure DNS records
```

### Manual (Local)
```bash
# 1. Build frontend
cd frontend
npm install
npm run build

# 2. Deploy to Pages
npx wrangler pages deploy frontend/dist

# 3. Deploy Workers
npx wrangler deploy

# 4. Update DNS (qua Cloudflare Dashboard)
```

---

## 📦 File Structure

```
astra/
├── frontend/                   # React app
│   ├── src/
│   ├── dist/                  # Build output → Pages
│   ├── Dockerfile
│   ├── vite.config.js
│   └── package.json
│
├── src/
│   └── index.js               # Workers script (API proxy)
│
├── wrangler.toml              # Workers config
├── package.json               # Workers dependencies
│
└── .github/workflows/
    └── deploy-cf.yml          # GitHub Actions
```

---

## 🔗 URLs

| URL | Điểm đến |
|-----|----------|
| https://career.jockerow.com | Frontend (Pages) |
| https://career.jockerow.com/api/* | API Proxy (Workers) |
| https://worklearn-career.pages.dev | Pages direct |
| https://worklearn-api.{account}.workers.dev | Workers direct |

---

## 🛠️ Troubleshooting

### Frontend not loading
```bash
# Check Pages build logs in Cloudflare Dashboard
# Verify VITE_API_URL environment variable
# Check dist folder exists
```

### API calls failing
```bash
# Check Workers logs in Cloudflare Dashboard
# Verify backend URL in src/index.js
# Test: curl https://career.jockerow.com/api/v1/health
```

### DNS not resolving
```bash
# Verify CNAME record in Cloudflare Dashboard
# Check zone ID is correct
# Wait 5-10 minutes for propagation
nslookup career.jockerow.com
```

---

## 📊 Monitoring

### Pages Analytics
- Login Cloudflare Dashboard
- Account → Pages → worklearn-career
- View analytics, deployments, builds

### Workers Analytics
- Account → Workers & Pages → worklearn-api
- View logs, metrics, errors

---

## 🔐 Security

- ✅ HTTPS enabled (automatic)
- ✅ DDoS protection (Cloudflare)
- ✅ WAF rules (optional)
- ✅ Rate limiting (via Workers)
- ✅ CORS configured

---

## 🔄 Updates

**Khi cần update:**
```bash
# 1. Edit code
vim frontend/src/App.jsx

# 2. Commit & push
git add .
git commit -m "Update frontend"
git push origin feature/career-worklearn

# 3. GitHub Actions tự động deploy ✅
```

---

**Status:** 🟢 Ready to Deploy  
**Next:** Add GitHub secrets & trigger deployment
