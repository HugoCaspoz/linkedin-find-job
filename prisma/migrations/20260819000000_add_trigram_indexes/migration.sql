-- The job search matches skills with a leading wildcard (ILIKE '%React%') and
-- with word-boundary regexes, and no btree index can serve either: without
-- this every search is a sequential scan over the whole listing table.
--
-- pg_trgm ships with Postgres itself (contrib), so no separate install is
-- needed. It also accelerates regex operators (~*), not just LIKE/ILIKE.
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- CreateIndex
CREATE INDEX "JobListing_title_idx" ON "JobListing" USING GIN ("title" gin_trgm_ops);

-- CreateIndex
CREATE INDEX "JobListing_description_idx" ON "JobListing" USING GIN ("description" gin_trgm_ops);
