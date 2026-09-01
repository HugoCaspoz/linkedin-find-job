-- Search-result cards carry no job description, so until now `description` was
-- NULL on every scraped listing and the ranking in src/lib/jobQuery.ts was
-- effectively title-only. Descriptions now come from a second pass over each
-- listing's detail page (src/lib/descriptionFetch.ts).
--
-- This column records when that pass last *tried*, not when it last succeeded.
-- Tracking success would be the same as `description IS NOT NULL`, and would
-- leave every listing whose detail page 404s or is behind a login permanently
-- in the queue, re-fetched on every cycle forever.
-- AlterTable
ALTER TABLE "JobListing" ADD COLUMN "descriptionFetchedAt" TIMESTAMP(3);

-- Serves the enrichment queue's ORDER BY. Btree, not GIN: this column is only
-- ever compared with IS NULL and a range.
-- CreateIndex
CREATE INDEX "JobListing_descriptionFetchedAt_idx" ON "JobListing"("descriptionFetchedAt");

-- One cached model-produced verdict per person and listing. Keyed by
-- source+externalId rather than by JobListing.id so live Adzuna results, which
-- are never stored, can be cached here too.
-- CreateTable
CREATE TABLE "JobFit" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "externalId" TEXT NOT NULL,
    "profileStamp" TIMESTAMP(3) NOT NULL,
    "score" INTEGER NOT NULL,
    "verdict" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "strengths" TEXT[],
    "gaps" TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "JobFit_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "JobFit_userId_source_externalId_key" ON "JobFit"("userId", "source", "externalId");

-- CreateIndex
CREATE INDEX "JobFit_userId_idx" ON "JobFit"("userId");

-- Cascade so account deletion keeps working through the User row alone, the
-- same way Profile and Skill already do.
-- AddForeignKey
ALTER TABLE "JobFit" ADD CONSTRAINT "JobFit_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
