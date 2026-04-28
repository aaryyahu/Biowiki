-- ─── Extensions ──────────────────────────────────────────────────────────────
create extension if not exists "uuid-ossp";
create extension if not exists "vector";

-- ─── Enum types ───────────────────────────────────────────────────────────────
create type article_category as enum (
  'nootropics', 'longevity', 'protocols', 'quantified-self',
  'microbiome', 'genetics', 'diy-biology', 'compounds'
);

create type article_status as enum ('draft', 'published', 'archived');
create type pipeline_status as enum ('pending', 'running', 'completed', 'failed');
create type request_status  as enum ('pending', 'approved', 'rejected', 'generated');
create type paper_source    as enum ('pubmed', 'semantic_scholar', 'arxiv', 'web');
create type study_type      as enum ('RCT', 'meta-analysis', 'observational', 'case_study', 'review', 'in_vitro');
create type effect_size     as enum ('small', 'moderate', 'large', 'unknown');

-- ─── Papers ───────────────────────────────────────────────────────────────────
create table papers (
  id               uuid primary key default uuid_generate_v4(),
  created_at       timestamptz not null default now(),
  doi              text unique,
  pubmed_id        text unique,
  title            text not null,
  abstract         text,
  authors          text[] not null default '{}',
  journal          text,
  published_year   int,
  source           paper_source not null default 'pubmed',
  citation_count   int not null default 0,
  fetched_at       timestamptz not null default now(),
  topic            text not null
);

create index papers_topic_idx on papers (topic);
create index papers_doi_idx   on papers (doi) where doi is not null;

-- ─── Findings ─────────────────────────────────────────────────────────────────
create table findings (
  id                     uuid primary key default uuid_generate_v4(),
  created_at             timestamptz not null default now(),
  paper_id               uuid not null references papers(id) on delete cascade,
  topic                  text not null,
  study_type             study_type not null,
  population_n           int,
  population_description text,
  dosage                 text,
  duration               text,
  key_findings           text[] not null default '{}',
  effect_size            effect_size not null default 'unknown',
  safety_notes           text,
  outcome_dimensions     text[] not null default '{}'
);

create index findings_topic_idx    on findings (topic);
create index findings_paper_id_idx on findings (paper_id);

-- ─── Articles ─────────────────────────────────────────────────────────────────
create table articles (
  id                        uuid primary key default uuid_generate_v4(),
  created_at                timestamptz not null default now(),
  updated_at                timestamptz not null default now(),
  topic                     text not null,
  slug                      text unique not null,
  title                     text not null,
  content                   text not null,
  summary                   text not null,
  category                  article_category not null,
  status                    article_status not null default 'draft',
  papers_count              int not null default 0,
  pipeline_version          text not null default '1.0.0',
  generation_model          text not null default 'claude-sonnet-4-6',
  hallucination_check_passed boolean
);

create index articles_slug_idx     on articles (slug);
create index articles_status_idx   on articles (status);
create index articles_category_idx on articles (category);

-- Auto-update updated_at
create or replace function update_updated_at()
returns trigger as $$
begin new.updated_at = now(); return new; end;
$$ language plpgsql;

create trigger articles_updated_at
  before update on articles
  for each row execute function update_updated_at();

-- ─── Evidence scores ──────────────────────────────────────────────────────────
create table evidence_scores (
  id                uuid primary key default uuid_generate_v4(),
  created_at        timestamptz not null default now(),
  article_id        uuid not null references articles(id) on delete cascade,
  dimension         text not null,
  score             numeric(4,2) not null check (score between 0 and 10),
  reasoning         text not null default '',
  papers_supporting int not null default 0
);

create index evidence_scores_article_idx on evidence_scores (article_id);

-- ─── Embeddings ───────────────────────────────────────────────────────────────
create table embeddings (
  id         uuid primary key default uuid_generate_v4(),
  created_at timestamptz not null default now(),
  article_id uuid not null references articles(id) on delete cascade,
  embedding  vector(1536),  -- OpenAI text-embedding-3-small
  chunk_text text not null,
  chunk_index int not null default 0
);

create index embeddings_article_idx on embeddings (article_id);

-- Vector similarity search function
create or replace function match_embeddings(
  query_embedding vector(1536),
  match_threshold float default 0.7,
  match_count     int default 5
)
returns table (
  article_id uuid,
  chunk_text text,
  similarity float
) language sql stable as $$
  select
    e.article_id,
    e.chunk_text,
    1 - (e.embedding <=> query_embedding) as similarity
  from embeddings e
  join articles a on a.id = e.article_id
  where a.status = 'published'
    and 1 - (e.embedding <=> query_embedding) > match_threshold
  order by e.embedding <=> query_embedding
  limit match_count;
$$;

-- ─── Pipeline runs ────────────────────────────────────────────────────────────
create table pipeline_runs (
  id                  uuid primary key default uuid_generate_v4(),
  created_at          timestamptz not null default now(),
  topic               text not null,
  status              pipeline_status not null default 'pending',
  started_at          timestamptz,
  completed_at        timestamptz,
  papers_found        int not null default 0,
  findings_extracted  int not null default 0,
  error_message       text,
  pipeline_version    text not null default '1.0.0'
);

create index pipeline_runs_status_idx on pipeline_runs (status);
create index pipeline_runs_topic_idx  on pipeline_runs (topic);

-- ─── Topic requests ───────────────────────────────────────────────────────────
create table topic_requests (
  id              uuid primary key default uuid_generate_v4(),
  created_at      timestamptz not null default now(),
  topic           text not null,
  category        article_category not null,
  requester_email text,
  status          request_status not null default 'pending',
  notes           text
);

create index topic_requests_status_idx on topic_requests (status);

-- ─── Row Level Security ───────────────────────────────────────────────────────

-- Enable RLS on all tables
alter table papers          enable row level security;
alter table findings        enable row level security;
alter table articles        enable row level security;
alter table evidence_scores enable row level security;
alter table embeddings      enable row level security;
alter table pipeline_runs   enable row level security;
alter table topic_requests  enable row level security;

-- Helper: check if current user is admin
create or replace function is_admin()
returns boolean language sql security definer as $$
  select
    auth.role() = 'service_role'
    or (auth.jwt() ->> 'email') = any(
      string_to_array(current_setting('app.admin_emails', true), ',')
    )
    or (auth.jwt() -> 'app_metadata' ->> 'role') = 'admin';
$$;

-- ── Papers: public read, admin write ──
create policy "papers_public_read"  on papers for select using (true);
create policy "papers_admin_insert" on papers for insert with check (is_admin());
create policy "papers_admin_update" on papers for update using (is_admin());
create policy "papers_admin_delete" on papers for delete using (is_admin());

-- ── Findings: public read, admin write ──
create policy "findings_public_read"  on findings for select using (true);
create policy "findings_admin_insert" on findings for insert with check (is_admin());
create policy "findings_admin_update" on findings for update using (is_admin());
create policy "findings_admin_delete" on findings for delete using (is_admin());

-- ── Articles: public read (published only), admin full access ──
create policy "articles_public_read" on articles
  for select using (status = 'published' or is_admin());
create policy "articles_admin_insert" on articles for insert with check (is_admin());
create policy "articles_admin_update" on articles for update using (is_admin());
create policy "articles_admin_delete" on articles for delete using (is_admin());

-- ── Evidence scores: public read, admin write ──
create policy "evidence_public_read"  on evidence_scores for select using (true);
create policy "evidence_admin_insert" on evidence_scores for insert with check (is_admin());
create policy "evidence_admin_update" on evidence_scores for update using (is_admin());
create policy "evidence_admin_delete" on evidence_scores for delete using (is_admin());

-- ── Embeddings: public read (for semantic search), admin write ──
create policy "embeddings_public_read"  on embeddings for select using (true);
create policy "embeddings_admin_insert" on embeddings for insert with check (is_admin());
create policy "embeddings_admin_delete" on embeddings for delete using (is_admin());

-- ── Pipeline runs: admin only ──
create policy "pipeline_admin_all" on pipeline_runs
  for all using (is_admin()) with check (is_admin());

-- ── Topic requests: anyone can insert (public form), admin reads all ──
create policy "requests_public_insert" on topic_requests
  for insert with check (true);
create policy "requests_admin_read" on topic_requests
  for select using (is_admin());
create policy "requests_admin_update" on topic_requests
  for update using (is_admin());
