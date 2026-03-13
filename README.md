# Video Editor — AI-powered video editing

Éditeur vidéo web avec sous-titres IA, chapitrage automatique et génération de clips viraux.

## Stack technique

- **Frontend** : Next.js 14 (App Router) + React + Tailwind CSS
- **State** : Zustand
- **Base de données** : Supabase (PostgreSQL)
- **Stockage vidéo** : Cloudflare R2
- **Traitement vidéo** : FFmpeg sur Railway
- **IA Transcription** : OpenAI Whisper
- **IA Analyse** : GPT-4o
- **IA Face tracking** : FAL.ai (clips viraux uniquement)

## Installation

### 1. Cloner et installer

```bash
git clone <repo>
cd video-editor
npm install
```

### 2. Configurer les variables d'environnement

Copier `.env.local.example` en `.env.local` et remplir toutes les valeurs :

```bash
cp .env.local.example .env.local
```

### 3. Créer la table Supabase

Dans le SQL Editor de Supabase, exécuter :

```sql
CREATE TABLE projects (
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

CREATE TABLE processing_jobs (
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
```

### 4. Configurer Cloudflare R2

1. Créer un bucket dans Cloudflare R2
2. Activer l'accès public (Settings → Public access)
3. Créer des clés API (R2 → Manage R2 API Tokens)
4. Configurer les CORS :

```json
[
  {
    "AllowedOrigins": ["http://localhost:3000", "https://votre-domaine.vercel.app"],
    "AllowedMethods": ["GET", "PUT", "POST"],
    "AllowedHeaders": ["*"],
    "MaxAgeSeconds": 3600
  }
]
```

### 5. Lancer en dev

```bash
npm run dev
```

Ouvrir http://localhost:3000

### 6. Déployer sur Vercel

```bash
npx vercel --prod
```

Ajouter toutes les variables d'environnement dans Vercel → Settings → Environment Variables.

## Fonctionnalités

- **Upload vidéo** : Drag & drop, upload direct vers R2, extraction métadonnées
- **Sous-titres IA** : Whisper + GPT-4o correction, highlight mot par mot, style personnalisable, export SRT
- **Chapitres** : Détection automatique GPT-4o, marqueurs sur la timeline, éditable
- **Clips viraux** : Détection GPT-4o, face tracking FAL.ai, crop 9:16
- **Export MP4 HD** : Composition finale via FFmpeg
- **Sauvegarde** : JSON dans Supabase, undo/redo

## Raccourcis clavier

| Raccourci | Action |
|-----------|--------|
| `Espace` | Play / Pause |
| `←` / `→` | Reculer / Avancer 5s |
| `Cmd+Z` | Annuler |
| `Cmd+Shift+Z` | Refaire |
| `Cmd+S` | Sauvegarder |

## Architecture des fichiers

```
app/
├── api/
│   ├── upload/route.ts        → Génération URL pré-signée R2
│   ├── transcribe/route.ts    → Whisper + GPT-4o
│   ├── chapters/route.ts      → Détection chapitres GPT-4o
│   ├── viral-clips/route.ts   → Détection clips viraux GPT-4o
│   ├── process/route.ts       → Proxy vers service FFmpeg
│   └── projects/route.ts      → CRUD Supabase
├── layout.tsx
├── page.tsx
└── globals.css

components/
├── editor/
│   ├── Editor.tsx             → Orchestrateur principal
│   ├── Header.tsx             → Barre projet + save + export
│   ├── VideoPlayer.tsx        → Lecteur + timeline + contrôles
│   ├── TranscriptPanel.tsx    → Transcript éditable
│   └── ActionPanel.tsx        → Panneau IA avec onglets
├── actions/
│   ├── CaptionsTab.tsx        → Config sous-titres
│   ├── ChaptersTab.tsx        → Config chapitres
│   └── ClipsTab.tsx           → Config clips viraux
└── ui/
    ├── UploadZone.tsx         → Drag & drop upload
    ├── ProgressBar.tsx        → Barre de progression
    └── ColorPicker.tsx        → Sélecteur de couleur

lib/
├── store.ts                   → État global Zustand
├── types.ts                   → Types TypeScript
├── utils.ts                   → Helpers (formatTime, etc.)
├── supabase.ts                → Client Supabase
├── r2.ts                      → Utils Cloudflare R2
└── ffmpeg.ts                  → Client service FFmpeg
```
