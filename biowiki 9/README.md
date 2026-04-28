# BioWiki — AI-powered biohacking knowledge base

An autonomous wiki that synthesizes peer-reviewed research into structured articles using Claude AI.

## Tech stack

| Layer | Tech |
|---|---|
| Framework | Next.js 14 (App Router) |
| Language | TypeScript |
| Styling | Tailwind CSS |
| Database | Supabase (PostgreSQL + pgvector) |
| Auth | Supabase Auth |
| AI | Anthropic Claude API |
| Deployment | Vercel |

---

## Quick start

### 1. Clone and install

```bash
git clone <your-repo>
cd biowiki
npm install
```

### 2. Set up Supabase

1. Create a project at [supabase.com](https://supabase.com)
2. Run the migration in **Supabase SQL Editor**:
   ```
   supabase/migrations/001_initial_schema.sql
   ```
3. In Supabase → SQL Editor, set your admin email config:
   ```sql
   alter database postgres set "app.admin_emails" = 'admin@yourdomain.com';
   ```

### 3. Environment variables

```bash
cp .env.local.example .env.local
```

Fill in:
- `NEXT_PUBLIC_SUPABASE_URL` — from Supabase project settings
- `NEXT_PUBLIC_SUPABASE_ANON_KEY` — from Supabase project settings
- `SUPABASE_SERVICE_ROLE_KEY` — from Supabase project settings (keep secret!)
- `ANTHROPIC_API_KEY` — from [console.anthropic.com](https://console.anthropic.com)
- `ADMIN_EMAILS` — comma-separated admin email(s)

### 4. Create admin user

In Supabase → Authentication → Users → "Invite user", add your admin email.
Or use the SQL editor:

```sql
-- After creating the user via Auth, set admin role:
update auth.users
set raw_app_meta_data = raw_app_meta_data || '{"role": "admin"}'
where email = 'admin@yourdomain.com';
```

### 5. Run locally

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000)

---

## Project structure

```
src/
├── app/
│   ├── page.tsx              # Homepage
│   ├── articles/
│   │   ├── page.tsx          # Article listing
│   │   └── [slug]/page.tsx   # Individual article
│   ├── admin/
│   │   ├── layout.tsx        # Admin auth guard
│   │   ├── page.tsx          # Dashboard
│   │   └── pipeline/page.tsx # Trigger pipeline
│   ├── request/page.tsx      # Public topic request form
│   ├── login/page.tsx        # Admin login
│   └── api/
│       ├── pipeline/route.ts         # POST: trigger pipeline
│       └── articles/request/route.ts # POST: submit topic request
├── components/
│   ├── layout/Nav.tsx
│   ├── article/
│   │   ├── ArticleCard.tsx
│   │   ├── EvidenceScores.tsx
│   │   └── TransparencyPanel.tsx
│   └── ui/
│       ├── CategoryBadge.tsx
│       └── Skeleton.tsx
├── lib/
│   ├── supabase/
│   │   ├── client.ts     # Browser client
│   │   ├── server.ts     # Server + admin client
│   │   └── middleware.ts # Session refresh + route protection
│   └── utils.ts
├── types/index.ts        # All TypeScript types + DB schema
└── styles/globals.css    # Design tokens + component classes
supabase/
└── migrations/
    └── 001_initial_schema.sql  # Full schema + RLS policies
```

---

## RLS (Row Level Security) overview

| Table | Public | Admin |
|---|---|---|
| `papers` | Read | Full CRUD |
| `findings` | Read | Full CRUD |
| `articles` | Read (published) | Full CRUD |
| `evidence_scores` | Read | Full CRUD |
| `embeddings` | Read | Full CRUD |
| `pipeline_runs` | — | Full CRUD |
| `topic_requests` | Insert only | Full CRUD |

Admin is determined by:
1. `ADMIN_EMAILS` env var (email allowlist), OR
2. `app_metadata.role = 'admin'` on the Supabase user

---

## Next steps (Phase 2)

- [ ] PubMed ingestion worker (`src/lib/pipeline/ingest.ts`)
- [ ] Claude extraction prompt (`src/lib/pipeline/extract.ts`)
- [ ] Evidence scoring (`src/lib/pipeline/score.ts`)
- [ ] Article synthesis (`src/lib/pipeline/synthesize.ts`)
- [ ] Embedding generation (`src/lib/pipeline/embed.ts`)
- [ ] Semantic search bar
- [ ] RAG chat interface (`/ask`)
- [ ] Vercel cron for auto-refresh

---

## Design system

Colors are defined as CSS variables in `src/styles/globals.css` and Tailwind tokens in `tailwind.config.ts`.

Primary palette: `bio-*` (teal/green, based on `#1D9E75`)
Dark surfaces: `--color-bg`, `--color-bg-surface`, `--color-bg-elevated`, `--color-bg-card`

Component classes: `.card`, `.btn`, `.btn-primary`, `.btn-secondary`, `.input`, `.badge`, `.evidence-bar`

---

## Deployment (Vercel)

### 1. Push to GitHub
```bash
git init && git add . && git commit -m "initial commit"
git remote add origin https://github.com/you/biowiki.git
git push -u origin main
```

### 2. Connect to Vercel
Import the repo at vercel.com/new. Set **Framework preset** to Next.js.

### 3. Environment variables
Set all vars from `.env.local.example` in Vercel → Settings → Environment Variables.
Add `CRON_SECRET` — any random string (e.g. `openssl rand -hex 32`).

### 4. Run Supabase migrations
In order:
```
001_initial_schema.sql
002_findings_unique_constraint.sql
003_search_functions.sql
```

### 5. Verify cron
After deploying, Vercel will show the cron job in the dashboard under **Cron Jobs**.
It runs every Monday at 06:00 UTC and refreshes articles older than 7 days.

To trigger manually:
```bash
curl -H "Authorization: Bearer YOUR_CRON_SECRET" https://your-app.vercel.app/api/cron/refresh
```

---

## Full file map

```
src/
├── app/
│   ├── page.tsx                       # Homepage
│   ├── sitemap.ts                     # Dynamic sitemap.xml
│   ├── robots.ts                      # robots.txt
│   ├── articles/
│   │   ├── page.tsx                   # Article listing
│   │   └── [slug]/page.tsx            # Article detail + JSON-LD
│   ├── ask/page.tsx                   # RAG chat interface
│   ├── request/page.tsx               # Public topic request form
│   ├── login/page.tsx                 # Admin login
│   └── admin/
│       ├── layout.tsx                 # Auth guard
│       ├── page.tsx                   # Dashboard
│       ├── pipeline/page.tsx          # Pipeline trigger
│       ├── articles/
│       │   ├── page.tsx               # Articles list
│       │   └── [id]/page.tsx          # Article review + publish
│       └── requests/
│           ├── page.tsx               # Topic request queue
│           └── RequestActions.tsx
├── api/
│   ├── pipeline/route.ts              # POST: trigger pipeline
│   ├── articles/
│   │   ├── [id]/route.ts              # PATCH: status update
│   │   └── request/route.ts          # POST: submit topic request
│   ├── requests/[id]/route.ts        # PATCH: approve/reject request
│   ├── search/route.ts               # GET: semantic search
│   ├── embed/route.ts                # POST: generate embeddings
│   ├── chat/route.ts                 # POST: RAG chat (streaming)
│   └── cron/refresh/route.ts         # GET: weekly auto-refresh
├── lib/
│   ├── supabase/
│   │   ├── client.ts
│   │   ├── server.ts
│   │   └── middleware.ts
│   ├── pipeline/
│   │   ├── pubmed.ts                  # PubMed ingestion
│   │   ├── semantic-scholar.ts        # Citation enrichment
│   │   ├── extract.ts                 # Claude extraction
│   │   ├── findings.ts                # Findings persistence
│   │   ├── score.ts                   # Evidence scoring
│   │   ├── synthesise.ts              # Article synthesis
│   │   ├── hallucination-guard.ts     # Claim verification
│   │   ├── article-store.ts           # Article persistence
│   │   ├── article-stub.ts            # Draft article creation
│   │   ├── embed.ts                   # Vector embeddings
│   │   ├── logger.ts                  # Pipeline run logging
│   │   ├── orchestrator.ts            # Full pipeline runner
│   │   └── index.ts                   # Public exports
│   ├── search.ts                      # Semantic + text search
│   └── utils.ts
├── components/
│   ├── layout/Nav.tsx                 # Nav with search bar
│   ├── article/
│   │   ├── ArticleCard.tsx
│   │   ├── EvidenceScores.tsx
│   │   └── TransparencyPanel.tsx
│   └── ui/
│       ├── SearchBar.tsx              # Debounced semantic search
│       ├── CategoryBadge.tsx
│       └── Skeleton.tsx
└── types/index.ts
supabase/
└── migrations/
    ├── 001_initial_schema.sql
    ├── 002_findings_unique_constraint.sql
    └── 003_search_functions.sql
vercel.json                            # Cron + function config
```
