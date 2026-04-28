#!/bin/bash

# ============================================================
# WorkLearn AI - Cloudflare Pages + Workers Deployment
# ============================================================
# 3 Quick Steps to Deploy
# ============================================================

echo "🚀 WorkLearn AI - Cloudflare Deployment Setup"
echo "============================================================"
echo ""

# Step 1: GitHub Secrets
echo "📝 STEP 1: Add GitHub Secrets"
echo "───────────────────────────────────────────────────────────"
echo ""
echo "Go to: https://github.com/astragenxy-bit/astra/settings/secrets/actions"
echo ""
echo "Add these 3 secrets:"
echo ""
echo "  1. CLOUDFLARE_API_TOKEN"
echo "     (Your Cloudflare API token)"
echo ""
echo "  2. CLOUDFLARE_ACCOUNT_ID"
echo "     (Your Cloudflare Account ID)"
echo ""
echo "  3. CLOUDFLARE_ZONE_ID"
echo "     (Your jockerow.com Zone ID)"
echo ""

# Step 2: Push to GitHub
echo ""
echo "⏱️  STEP 2: Push to Branch (Triggers Auto Deploy)"
echo "───────────────────────────────────────────────────────────"
echo ""
echo "  Command:"
echo "    git push origin feature/career-worklearn"
echo ""
echo "  GitHub Actions will automatically:"
echo "    ✅ Build React frontend"
echo "    ✅ Deploy to Cloudflare Pages"
echo "    ✅ Deploy API proxy to Workers"
echo "    ✅ Configure DNS"
echo ""

# Step 3: Verify
echo ""
echo "✔️  STEP 3: Verify Deployment"
echo "───────────────────────────────────────────────────────────"
echo ""
echo "  Check status:"
echo "    https://github.com/astragenxy-bit/astra/actions"
echo ""
echo "  Test frontend:"
echo "    curl https://career.jockerow.com/"
echo ""
echo "  Test health:"
echo "    curl https://career.jockerow.com/health"
echo ""

# Summary
echo ""
echo "============================================================"
echo "📊 Deployment Summary"
echo "============================================================"
echo ""
echo "  Repository: https://github.com/astragenxy-bit/astra"
echo "  Branch: feature/career-worklearn"
echo ""
echo "  Frontend Hosting:"
echo "    • Cloudflare Pages"
echo "    • URL: https://career.jockerow.com"
echo ""
echo "  API Proxy:"
echo "    • Cloudflare Workers"
echo "    • URL: https://career.jockerow.com/api/*"
echo ""
echo "  DNS:"
echo "    • CNAME: career.jockerow.com"
echo "    • Target: worklearn-career.pages.dev"
echo ""

# Documentation
echo ""
echo "📚 Documentation:"
echo "───────────────────────────────────────────────────────────"
echo ""
echo "  • CLOUDFLARE_READY.md - Final deployment steps"
echo "  • CLOUDFLARE_DEPLOYMENT.md - Detailed guide"
echo "  • README.md - Project overview"
echo ""

echo ""
echo "✨ Ready to deploy! Add secrets and push to trigger."
echo ""
