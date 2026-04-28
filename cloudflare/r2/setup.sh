#!/bin/bash
# =============================================================
# Cloudflare R2 Setup Script
# Replaces MinIO for production storage
# Run once: bash cloudflare/r2/setup.sh
# =============================================================

echo "🪣 Setting up Cloudflare R2 buckets for WorkLearn..."

# Install Wrangler if not present
if ! command -v wrangler &> /dev/null; then
  npm install -g wrangler
fi

# Login to Cloudflare
echo "Logging in to Cloudflare..."
wrangler login

# Create R2 buckets
echo "Creating R2 buckets..."
wrangler r2 bucket create worklearn-media
wrangler r2 bucket create worklearn-certs
wrangler r2 bucket create worklearn-backups

# Set CORS policy for media bucket (allow frontend to read)
cat > /tmp/cors.json << 'CORSEOF'
[
  {
    "AllowedOrigins": ["https://worklearn.vn", "http://localhost:3000"],
    "AllowedMethods": ["GET", "HEAD"],
    "AllowedHeaders": ["*"],
    "MaxAgeSeconds": 3600
  }
]
CORSEOF

echo "✅ R2 buckets created:"
echo "  worklearn-media   → CVs, videos, thumbnails, avatars"
echo "  worklearn-certs   → PDF certificates"
echo "  worklearn-backups → DB backups"
echo ""
echo "📝 Next steps:"
echo "  1. Copy R2 credentials to .env:"
echo "     R2_ACCOUNT_ID=your_account_id"
echo "     R2_ACCESS_KEY=your_access_key"
echo "     R2_SECRET_KEY=your_secret_key"
echo "     R2_PUBLIC_URL=https://pub-XXXX.r2.dev"
echo ""
echo "  2. Update storageService.js to use R2 in production:"
echo "     if (process.env.R2_ACCOUNT_ID) → use R2"
echo "     else → fallback to MinIO (development)"
echo ""
echo "  3. Deploy Workers: cd cloudflare && wrangler deploy"
