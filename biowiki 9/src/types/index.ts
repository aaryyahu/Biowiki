// ─── Database types ───────────────────────────────────────────────────────────

export type Json = string | number | boolean | null | { [key: string]: Json } | Json[]

export interface Database {
  public: {
    Tables: {
      papers: {
        Row: Paper
        Insert: Omit<Paper, 'id' | 'created_at'>
        Update: Partial<Omit<Paper, 'id' | 'created_at'>>
      }
      findings: {
        Row: Finding
        Insert: Omit<Finding, 'id' | 'created_at'>
        Update: Partial<Omit<Finding, 'id' | 'created_at'>>
      }
      articles: {
        Row: Article
        Insert: Omit<Article, 'id' | 'created_at' | 'updated_at'>
        Update: Partial<Omit<Article, 'id' | 'created_at'>>
      }
      evidence_scores: {
        Row: EvidenceScore
        Insert: Omit<EvidenceScore, 'id' | 'created_at'>
        Update: Partial<Omit<EvidenceScore, 'id' | 'created_at'>>
      }
      pipeline_runs: {
        Row: PipelineRun
        Insert: Omit<PipelineRun, 'id' | 'created_at'>
        Update: Partial<Omit<PipelineRun, 'id' | 'created_at'>>
      }
      topic_requests: {
        Row: TopicRequest
        Insert: Omit<TopicRequest, 'id' | 'created_at'>
        Update: Partial<Omit<TopicRequest, 'id' | 'created_at'>>
      }
    }
  }
}

// ─── Domain types ─────────────────────────────────────────────────────────────

export interface Paper {
  id: string
  created_at: string
  doi: string | null
  pubmed_id: string | null
  title: string
  abstract: string | null
  authors: string[]
  journal: string | null
  published_year: number | null
  source: 'pubmed' | 'semantic_scholar' | 'arxiv' | 'web'
  citation_count: number
  fetched_at: string
  topic: string
}

export interface Finding {
  id: string
  created_at: string
  paper_id: string
  topic: string
  study_type: 'RCT' | 'meta-analysis' | 'observational' | 'case_study' | 'review' | 'in_vitro'
  population_n: number | null
  population_description: string | null
  dosage: string | null
  duration: string | null
  key_findings: string[]
  effect_size: 'small' | 'moderate' | 'large' | 'unknown'
  safety_notes: string | null
  outcome_dimensions: string[]
}

export interface Article {
  id: string
  created_at: string
  updated_at: string
  topic: string
  slug: string
  title: string
  content: string
  summary: string
  category: ArticleCategory
  status: 'draft' | 'published' | 'archived'
  papers_count: number
  pipeline_version: string
  generation_model: string
  hallucination_check_passed: boolean | null
}

export interface EvidenceScore {
  id: string
  created_at: string
  article_id: string
  dimension: string
  score: number // 1–10
  reasoning: string
  papers_supporting: number
}

export interface PipelineRun {
  id: string
  created_at: string
  topic: string
  status: 'pending' | 'running' | 'completed' | 'failed'
  started_at: string | null
  completed_at: string | null
  papers_found: number
  findings_extracted: number
  error_message: string | null
  pipeline_version: string
}

export interface TopicRequest {
  id: string
  created_at: string
  topic: string
  category: ArticleCategory
  requester_email: string | null
  status: 'pending' | 'approved' | 'rejected' | 'generated'
  notes: string | null
}

// ─── Enums & constants ────────────────────────────────────────────────────────

export type ArticleCategory =
  | 'nootropics'
  | 'longevity'
  | 'protocols'
  | 'quantified-self'
  | 'microbiome'
  | 'genetics'
  | 'diy-biology'
  | 'compounds'

export const CATEGORY_LABELS: Record<ArticleCategory, string> = {
  nootropics: 'Nootropics',
  longevity: 'Longevity',
  protocols: 'Protocols',
  'quantified-self': 'Quantified self',
  microbiome: 'Microbiome',
  genetics: 'Genetics',
  'diy-biology': 'DIY biology',
  compounds: 'Compounds',
}

export const CATEGORY_COLORS: Record<ArticleCategory, string> = {
  nootropics: 'bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300',
  longevity: 'bg-bio-100 text-bio-800 dark:bg-bio-900/30 dark:text-bio-300',
  protocols: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300',
  'quantified-self': 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300',
  microbiome: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300',
  genetics: 'bg-pink-100 text-pink-800 dark:bg-pink-900/30 dark:text-pink-300',
  'diy-biology': 'bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-300',
  compounds: 'bg-slate-100 text-slate-800 dark:bg-slate-800/50 dark:text-slate-300',
}

export const STUDY_TYPE_WEIGHT: Record<Finding['study_type'], number> = {
  'meta-analysis': 10,
  'RCT': 8,
  'observational': 5,
  'review': 4,
  'case_study': 2,
  'in_vitro': 1,
}
