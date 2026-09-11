#!/usr/bin/env bash
# ══════════════════════════════════════════════════════════════════════
#  deploy-cloudrun.sh — Deploy GHCR image to Google Cloud Run
# ══════════════════════════════════════════════════════════════════════
#
#  Prerequisites:
#    1. gcloud CLI installed and authenticated (gcloud auth login)
#    2. Docker image already pushed to ghcr.io (via GitHub Actions)
#    3. DATABASE_URL environment variable set
#
#  Usage:
#    export DATABASE_URL="postgresql://user:pass@host/db?sslmode=require"
#    export GCP_PROJECT="your-gcp-project-id"
#    export GHCR_IMAGE="ghcr.io/OWNER/REPO:latest"
#    bash deploy-cloudrun.sh
#
# ══════════════════════════════════════════════════════════════════════

set -euo pipefail

# ─── Configuration ───────────────────────────────────────────────────
SERVICE_NAME="${SERVICE_NAME:-cloud-run-app}"
REGION="${REGION:-asia-south1}"
GCP_PROJECT="${GCP_PROJECT:?ERROR: Set GCP_PROJECT environment variable}"
GHCR_IMAGE="${GHCR_IMAGE:?ERROR: Set GHCR_IMAGE environment variable (e.g. ghcr.io/OWNER/REPO:latest)}"
DATABASE_URL="${DATABASE_URL:?ERROR: Set DATABASE_URL environment variable}"

echo "═══════════════════════════════════════════════════════════════"
echo "  Deploying to Google Cloud Run"
echo "═══════════════════════════════════════════════════════════════"
echo "  Service:   ${SERVICE_NAME}"
echo "  Region:    ${REGION}"
echo "  Project:   ${GCP_PROJECT}"
echo "  Image:     ${GHCR_IMAGE}"
echo "═══════════════════════════════════════════════════════════════"

# ─── Set active project ──────────────────────────────────────────────
gcloud config set project "${GCP_PROJECT}"

# ─── Enable required APIs ────────────────────────────────────────────
echo "→ Enabling required GCP APIs..."
gcloud services enable \
  run.googleapis.com \
  artifactregistry.googleapis.com \
  --quiet

# ─── Deploy to Cloud Run ─────────────────────────────────────────────
echo "→ Deploying container to Cloud Run..."
gcloud run deploy "${SERVICE_NAME}" \
  --image "${GHCR_IMAGE}" \
  --region "${REGION}" \
  --platform managed \
  --port 8080 \
  --memory 256Mi \
  --cpu 1 \
  --min-instances 0 \
  --max-instances 2 \
  --set-env-vars "DATABASE_URL=${DATABASE_URL},NODE_ENV=production" \
  --allow-unauthenticated \
  --quiet

# ─── Output service URL ──────────────────────────────────────────────
SERVICE_URL=$(gcloud run services describe "${SERVICE_NAME}" \
  --region "${REGION}" \
  --format "value(status.url)")

echo ""
echo "═══════════════════════════════════════════════════════════════"
echo "  ✔ Deployment successful!"
echo "  Service URL: ${SERVICE_URL}"
echo "  Health Check: ${SERVICE_URL}/health"
echo "═══════════════════════════════════════════════════════════════"
