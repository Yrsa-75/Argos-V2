#!/bin/bash

# ═══════════════════════════════════════════════════════════
# Video Editor — Script d'installation automatique
# ═══════════════════════════════════════════════════════════

set -e

BOLD='\033[1m'
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
RED='\033[0;31m'
CYAN='\033[0;36m'
NC='\033[0m'

echo ""
echo -e "${BOLD}═══════════════════════════════════════════════${NC}"
echo -e "${BOLD}  Video Editor — Installation${NC}"
echo -e "${BOLD}═══════════════════════════════════════════════${NC}"
echo ""

# ── 1. Check prerequisites ──────────────────────────────────

echo -e "${CYAN}[1/6]${NC} Vérification des prérequis..."

if ! command -v node &> /dev/null; then
  echo -e "${RED}✗ Node.js n'est pas installé.${NC}"
  echo "  Installe-le via: brew install node"
  exit 1
fi

NODE_VERSION=$(node -v | sed 's/v//' | cut -d. -f1)
if [ "$NODE_VERSION" -lt 18 ]; then
  echo -e "${RED}✗ Node.js 18+ requis (tu as $(node -v))${NC}"
  exit 1
fi
echo -e "  ${GREEN}✓${NC} Node.js $(node -v)"

if ! command -v npm &> /dev/null; then
  echo -e "${RED}✗ npm n'est pas installé.${NC}"
  exit 1
fi
echo -e "  ${GREEN}✓${NC} npm $(npm -v)"

# ── 2. Install dependencies ─────────────────────────────────

echo ""
echo -e "${CYAN}[2/6]${NC} Installation des dépendances..."
npm install --silent 2>&1 | tail -1
echo -e "  ${GREEN}✓${NC} Dépendances installées"

# ── 3. Collect API keys ─────────────────────────────────────

echo ""
echo -e "${CYAN}[3/6]${NC} Configuration des services"
echo -e "${YELLOW}  Colle chaque clé quand demandé (elle ne s'affichera pas à l'écran)${NC}"
echo ""

# Supabase
echo -e "${BOLD}  ── Supabase ──${NC}"
read -p "  NEXT_PUBLIC_SUPABASE_URL : " SUPABASE_URL
read -s -p "  NEXT_PUBLIC_SUPABASE_ANON_KEY : " SUPABASE_ANON
echo ""
read -s -p "  SUPABASE_SERVICE_ROLE_KEY : " SUPABASE_SERVICE
echo ""
echo ""

# Cloudflare R2
echo -e "${BOLD}  ── Cloudflare R2 ──${NC}"
read -p "  CLOUDFLARE_R2_ACCOUNT_ID : " R2_ACCOUNT
read -s -p "  CLOUDFLARE_R2_ACCESS_KEY_ID : " R2_KEY
echo ""
read -s -p "  CLOUDFLARE_R2_SECRET_ACCESS_KEY : " R2_SECRET
echo ""
read -p "  CLOUDFLARE_R2_BUCKET_NAME : " R2_BUCKET
read -p "  CLOUDFLARE_R2_PUBLIC_URL (ex: https://pub-xxx.r2.dev) : " R2_PUBLIC
echo ""

# OpenAI
echo -e "${BOLD}  ── OpenAI ──${NC}"
read -s -p "  OPENAI_API_KEY : " OPENAI_KEY
echo ""
echo ""

# FAL.ai
echo -e "${BOLD}  ── FAL.ai ──${NC}"
read -s -p "  FAL_KEY : " FAL_KEY
echo ""
echo ""

# FFmpeg service (optional for now)
echo -e "${BOLD}  ── FFmpeg Service (Railway) ──${NC}"
echo -e "  ${YELLOW}Optionnel pour l'instant — appuie sur Entrée pour passer${NC}"
read -p "  FFMPEG_SERVICE_URL (ou Entrée pour passer) : " FFMPEG_URL
read -p "  FFMPEG_SERVICE_SECRET (ou Entrée pour passer) : " FFMPEG_SECRET
echo ""

# ── 4. Generate .env.local ──────────────────────────────────

echo -e "${CYAN}[4/6]${NC} Génération du fichier .env.local..."

cat > .env.local << EOF
# ═══════════════════════════════════════
# Video Editor — Variables d'environnement
# Généré automatiquement le $(date '+%Y-%m-%d à %H:%M')
# ═══════════════════════════════════════

# Supabase
NEXT_PUBLIC_SUPABASE_URL=${SUPABASE_URL}
NEXT_PUBLIC_SUPABASE_ANON_KEY=${SUPABASE_ANON}
SUPABASE_SERVICE_ROLE_KEY=${SUPABASE_SERVICE}

# Cloudflare R2
CLOUDFLARE_R2_ACCOUNT_ID=${R2_ACCOUNT}
CLOUDFLARE_R2_ACCESS_KEY_ID=${R2_KEY}
CLOUDFLARE_R2_SECRET_ACCESS_KEY=${R2_SECRET}
CLOUDFLARE_R2_BUCKET_NAME=${R2_BUCKET}
CLOUDFLARE_R2_PUBLIC_URL=${R2_PUBLIC}

# OpenAI
OPENAI_API_KEY=${OPENAI_KEY}

# FAL.ai
FAL_KEY=${FAL_KEY}

# Service FFmpeg (Railway)
FFMPEG_SERVICE_URL=${FFMPEG_URL:-http://localhost:4000}
FFMPEG_SERVICE_SECRET=${FFMPEG_SECRET:-dev-secret}
EOF

echo -e "  ${GREEN}✓${NC} .env.local créé"

# ── 5. Setup Supabase tables ────────────────────────────────

echo ""
echo -e "${CYAN}[5/6]${NC} Création des tables Supabase..."

# Use the Supabase REST API to execute SQL
SQL_QUERY=$(cat << 'EOSQL'
CREATE TABLE IF NOT EXISTS projects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text DEFAULT 'Nouveau projet',
  video_url text,
  video_duration integer,
  video_resolution text,
  thumbnail_url text,
  state jsonb,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now()
);

CREATE TABLE IF NOT EXISTS processing_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid REFERENCES projects(id) ON DELETE CASCADE,
  type text NOT NULL,
  status text DEFAULT 'pending',
  config jsonb,
  result jsonb,
  error text,
  progress integer DEFAULT 0,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now()
);
EOSQL
)

# Try to create tables via Supabase SQL API
HTTP_STATUS=$(curl -s -o /tmp/supabase_response.txt -w "%{http_code}" \
  "${SUPABASE_URL}/rest/v1/rpc/exec_sql" \
  -H "apikey: ${SUPABASE_SERVICE}" \
  -H "Authorization: Bearer ${SUPABASE_SERVICE}" \
  -H "Content-Type: application/json" \
  -d "{\"query\": \"$(echo "$SQL_QUERY" | tr '\n' ' ')\"}" \
  2>/dev/null || echo "000")

if [ "$HTTP_STATUS" = "200" ] || [ "$HTTP_STATUS" = "204" ]; then
  echo -e "  ${GREEN}✓${NC} Tables créées automatiquement"
else
  echo -e "  ${YELLOW}⚠${NC} Impossible de créer les tables automatiquement."
  echo -e "  ${YELLOW}  Tu dois copier-coller ce SQL dans le SQL Editor de Supabase :${NC}"
  echo ""
  echo -e "${CYAN}  ──────────────────────────────────────────────${NC}"
  echo "  CREATE TABLE IF NOT EXISTS projects ("
  echo "    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),"
  echo "    title text DEFAULT 'Nouveau projet',"
  echo "    video_url text,"
  echo "    video_duration integer,"
  echo "    video_resolution text,"
  echo "    thumbnail_url text,"
  echo "    state jsonb,"
  echo "    created_at timestamp with time zone DEFAULT now(),"
  echo "    updated_at timestamp with time zone DEFAULT now()"
  echo "  );"
  echo ""
  echo "  CREATE TABLE IF NOT EXISTS processing_jobs ("
  echo "    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),"
  echo "    project_id uuid REFERENCES projects(id) ON DELETE CASCADE,"
  echo "    type text NOT NULL,"
  echo "    status text DEFAULT 'pending',"
  echo "    config jsonb,"
  echo "    result jsonb,"
  echo "    error text,"
  echo "    progress integer DEFAULT 0,"
  echo "    created_at timestamp with time zone DEFAULT now(),"
  echo "    updated_at timestamp with time zone DEFAULT now()"
  echo "  );"
  echo -e "${CYAN}  ──────────────────────────────────────────────${NC}"
  echo ""
  read -p "  Appuie sur Entrée une fois les tables créées dans Supabase..."
fi

# ── 6. R2 CORS check ────────────────────────────────────────

echo ""
echo -e "${CYAN}[6/6]${NC} Vérification de la config R2..."
echo -e "  ${YELLOW}⚠${NC} Vérifie que les CORS sont configurés sur ton bucket R2 :"
echo ""
echo -e "${CYAN}  Dans Cloudflare Dashboard → R2 → ${R2_BUCKET} → Settings → CORS :${NC}"
echo '  ['
echo '    {'
echo '      "AllowedOrigins": ["http://localhost:3000", "https://*.vercel.app"],'
echo '      "AllowedMethods": ["GET", "PUT", "POST", "HEAD"],'
echo '      "AllowedHeaders": ["*"],'
echo '      "MaxAgeSeconds": 3600'
echo '    }'
echo '  ]'
echo ""

# ── Done ─────────────────────────────────────────────────────

echo ""
echo -e "${BOLD}═══════════════════════════════════════════════${NC}"
echo -e "${GREEN}${BOLD}  ✓ Installation terminée !${NC}"
echo -e "${BOLD}═══════════════════════════════════════════════${NC}"
echo ""
echo -e "  Lance le serveur de développement :"
echo ""
echo -e "    ${CYAN}npm run dev${NC}"
echo ""
echo -e "  Puis ouvre ${CYAN}http://localhost:3000${NC}"
echo ""
echo -e "  ${YELLOW}Note :${NC} Le service FFmpeg (Railway) n'est pas encore"
echo -e "  déployé — l'upload, les sous-titres, les chapitres et"
echo -e "  la détection de clips fonctionnent déjà sans."
echo ""
