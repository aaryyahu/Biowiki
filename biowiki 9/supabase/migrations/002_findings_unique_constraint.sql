-- Add unique constraint on (paper_id, topic) so findings can be upserted safely.
-- This allows the extraction step to be re-run without creating duplicates.

alter table findings
  add constraint findings_paper_topic_unique unique (paper_id, topic);
