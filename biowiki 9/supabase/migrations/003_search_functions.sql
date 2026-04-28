-- Update match_embeddings to accept text input (pgvector casting from string)
-- and add full-text search for fallback text search

-- Drop and recreate with text parameter for flexibility
drop function if exists match_embeddings;

create or replace function match_embeddings(
  query_embedding text,
  match_threshold float default 0.45,
  match_count     int   default 10
)
returns table (
  article_id uuid,
  chunk_text text,
  similarity float
) language sql stable as $$
  select
    e.article_id,
    e.chunk_text,
    1 - (e.embedding <=> query_embedding::vector) as similarity
  from embeddings e
  join articles a on a.id = e.article_id
  where a.status = 'published'
    and 1 - (e.embedding <=> query_embedding::vector) > match_threshold
  order by e.embedding <=> query_embedding::vector
  limit match_count;
$$;

-- Full-text search index on articles for fallback text search
create index if not exists articles_title_summary_fts
  on articles
  using gin(to_tsvector('english', coalesce(title, '') || ' ' || coalesce(summary, '')));

-- Index for faster embedding lookup by article
create index if not exists embeddings_article_chunk_idx
  on embeddings (article_id, chunk_index);
