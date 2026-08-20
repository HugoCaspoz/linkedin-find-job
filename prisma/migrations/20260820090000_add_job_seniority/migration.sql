-- Seniority is not reported by any scraped source, so it is derived from the
-- listing title when the worker indexes it (see src/lib/seniority.ts).
--
-- Nullable on purpose: most titles say nothing about the level, and null means
-- "not stated" rather than "mid". The search exposes it as its own filter
-- bucket so a user asking for senior roles doesn't get every unlabelled
-- listing mixed in.
-- AlterTable
ALTER TABLE "JobListing" ADD COLUMN "seniority" TEXT;

-- Btree is enough here: the column has four values including NULL, and it is
-- only ever compared with equality or IS NULL.
-- CreateIndex
CREATE INDEX "JobListing_seniority_idx" ON "JobListing"("seniority");
