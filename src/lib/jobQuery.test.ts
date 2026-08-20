import { beforeEach, describe, expect, it, vi } from "vitest";
import { Prisma } from "@prisma/client";

const { queryRaw } = vi.hoisted(() => ({ queryRaw: vi.fn() }));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    $queryRaw: queryRaw,
    jobListing: { findFirst: vi.fn(), groupBy: vi.fn() },
  },
}));

import { DEFAULT_PER_PAGE, MAX_PER_PAGE, searchStoredJobs } from "./jobQuery";

/**
 * `$queryRaw` is a tagged template, so the spy sees the raw strings array and
 * the interpolated values — some of which are nested `Prisma.sql` fragments.
 * Handing them straight back to `Prisma.sql` flattens the whole thing into the
 * statement Postgres would have received, which is what these tests assert on.
 */
function capturedQuery(): { sql: string; values: unknown[] } {
  const [strings, ...values] = queryRaw.mock.calls.at(-1) as [string[], ...unknown[]];
  const withRaw = Object.assign([...strings], { raw: [...strings] });
  const composed = Prisma.sql(withRaw as unknown as TemplateStringsArray, ...values);
  return { sql: composed.sql, values: composed.values };
}

/** One row, shaped like the SELECT's projection. */
function row(over: Record<string, unknown> = {}) {
  return {
    source: "linkedin",
    externalId: "1",
    title: "Senior PHP Developer",
    company: "ACME",
    location: "Madrid",
    url: "https://example.test/1",
    description: "PHP y Laravel",
    workMode: "remote",
    seniority: "senior",
    postedAt: new Date("2026-08-19T09:00:00.000Z"),
    score: 6,
    matchedSkills: ["PHP", "Laravel"],
    titleSkills: ["PHP"],
    total: 211,
    ...over,
  };
}

const SKILLS = ["PHP", "Laravel"];

beforeEach(() => {
  queryRaw.mockReset();
  queryRaw.mockResolvedValue([row()]);
});

describe("searchStoredJobs — paging", () => {
  it("defaults to the first page at the default size", async () => {
    await searchStoredJobs({ skills: SKILLS });
    const { sql, values } = capturedQuery();

    expect(sql).toContain("LIMIT");
    expect(sql).toContain("OFFSET");
    expect(values).toContain(DEFAULT_PER_PAGE);
    expect(values).toContain(0);
  });

  it("turns a page number into the matching offset", async () => {
    await searchStoredJobs({ skills: SKILLS, page: 4, perPage: 12 });
    const { values } = capturedQuery();

    // Page 4 of 12 starts after the first 36 rows.
    expect(values).toContain(12);
    expect(values).toContain(36);
  });

  it("clamps a page size above the ceiling", async () => {
    await searchStoredJobs({ skills: SKILLS, perPage: 5000 });
    expect(capturedQuery().values).toContain(MAX_PER_PAGE);
  });

  it("treats a page below one as the first page", async () => {
    await searchStoredJobs({ skills: SKILLS, page: 0 });
    expect(capturedQuery().values).toContain(0);
  });

  it("reports the total from the window count, not the page length", async () => {
    queryRaw.mockResolvedValue([row(), row({ externalId: "2" })]);
    const result = await searchStoredJobs({ skills: SKILLS, perPage: 12 });

    expect(result.jobs).toHaveLength(2);
    expect(result.total).toBe(211);
  });

  it("still reports the total for a page past the end", async () => {
    // No rows means no window count to read, so the count is re-fetched — the
    // second call is the page-one probe that carries it.
    queryRaw.mockResolvedValueOnce([]).mockResolvedValueOnce([row()]);
    const result = await searchStoredJobs({ skills: SKILLS, page: 999, perPage: 12 });

    expect(result.jobs).toEqual([]);
    expect(result.total).toBe(211);
  });

  it("reports an empty index as zero rather than probing again", async () => {
    queryRaw.mockResolvedValue([]);
    const result = await searchStoredJobs({ skills: SKILLS, page: 1 });

    expect(result.total).toBe(0);
    expect(queryRaw).toHaveBeenCalledTimes(1);
  });
});

describe("searchStoredJobs — ordering", () => {
  it("ends both orderings on the primary key", async () => {
    // Without a unique final term the sort is a partial order: tied rows can
    // come back in a different sequence per query, and two OFFSET pages of the
    // same search then overlap and skip.
    await searchStoredJobs({ skills: SKILLS, sort: "relevance" });
    expect(capturedQuery().sql).toMatch(/ORDER BY[^;]*"id" ASC/);

    await searchStoredJobs({ skills: SKILLS, sort: "date" });
    expect(capturedQuery().sql).toMatch(/ORDER BY[^;]*"id" ASC/);
  });

  it("sorts by score first for relevance and by date first for date", async () => {
    await searchStoredJobs({ skills: SKILLS, sort: "relevance" });
    expect(capturedQuery().sql).toMatch(/ORDER BY\s+"score" DESC/);

    await searchStoredJobs({ skills: SKILLS, sort: "date" });
    expect(capturedQuery().sql).toMatch(/ORDER BY\s+COALESCE/);
  });
});

describe("searchStoredJobs — filters", () => {
  it("returns nothing without asking the database when no skill is usable", async () => {
    const result = await searchStoredJobs({ skills: ["  ", ""] });

    expect(result).toEqual({ jobs: [], total: 0 });
    expect(queryRaw).not.toHaveBeenCalled();
  });

  it("omits the modality clause when every modality is selected", async () => {
    // All three is the same set as no filter, and the clause would only cost a
    // scan of the workMode index for nothing.
    await searchStoredJobs({ skills: SKILLS, modes: ["remote", "hybrid", "onsite"] });
    // The projection names the column either way, so this looks for the WHERE
    // term rather than the identifier.
    expect(capturedQuery().sql).not.toContain('j."workMode" = ANY');
  });

  it("lets listings with no stated modality through a modality filter", async () => {
    await searchStoredJobs({ skills: SKILLS, modes: ["remote"] });
    expect(capturedQuery().sql).toContain('j."workMode" IS NULL');
  });

  it("excludes unstated seniority unless it is asked for", async () => {
    await searchStoredJobs({ skills: SKILLS, seniorities: ["senior"] });
    const withoutUnspecified = capturedQuery().sql;
    expect(withoutUnspecified).toContain('j."seniority" = ANY');
    expect(withoutUnspecified).not.toContain('j."seniority" IS NULL');

    await searchStoredJobs({ skills: SKILLS, seniorities: ["senior", "unspecified"] });
    expect(capturedQuery().sql).toContain('j."seniority" IS NULL');
  });

  it("asks only for unstated seniority when that is the only bucket picked", async () => {
    await searchStoredJobs({ skills: SKILLS, seniorities: ["unspecified"] });
    const { sql } = capturedQuery();

    expect(sql).toContain('j."seniority" IS NULL');
    expect(sql).not.toContain('j."seniority" = ANY');
  });

  it("adds no seniority clause when no bucket is picked", async () => {
    await searchStoredJobs({ skills: SKILLS });
    const { sql } = capturedQuery();

    expect(sql).not.toContain('j."seniority" = ANY');
    expect(sql).not.toContain('j."seniority" IS NULL');
  });

  it("falls back to the indexing date when a listing has no publication date", async () => {
    await searchStoredJobs({ skills: SKILLS, postedWithinDays: 7 });
    expect(capturedQuery().sql).toContain('COALESCE(j."postedAt", j."fetchedAt")');
  });

  it("matches location as a substring, case-insensitively", async () => {
    await searchStoredJobs({ skills: SKILLS, location: "madrid" });
    const { sql, values } = capturedQuery();

    expect(sql).toContain('j."location" ILIKE');
    expect(values).toContain("%madrid%");
  });

  it("ignores a location of only whitespace", async () => {
    await searchStoredJobs({ skills: SKILLS, location: "   " });
    expect(capturedQuery().sql).not.toContain("ILIKE");
  });

  it("anchors skill patterns on word boundaries", async () => {
    // Otherwise "Go" matches "Django" and the score becomes meaningless.
    await searchStoredJobs({ skills: ["Go"] });
    expect(capturedQuery().values).toContain("\\mGo\\M");
  });

  it("maps a row onto the job shape, dropping SQL nulls", async () => {
    queryRaw.mockResolvedValue([
      row({ company: null, location: null, workMode: null, seniority: null, postedAt: null }),
    ]);
    const [job] = (await searchStoredJobs({ skills: SKILLS })).jobs;

    expect(job.company).toBeUndefined();
    expect(job.workMode).toBeUndefined();
    expect(job.seniority).toBeUndefined();
    expect(job.postedAt).toBeUndefined();
    expect(job.score).toBe(6);
  });

  it("separates the title matches from the description-only ones", async () => {
    // The gauge draws a full segment for a title hit and a half one for a
    // description hit, so the two lists have to arrive apart.
    const [job] = (await searchStoredJobs({ skills: SKILLS })).jobs;

    expect(job.matchedSkills).toEqual(["PHP", "Laravel"]);
    expect(job.titleSkills).toEqual(["PHP"]);
  });

  it("asks Postgres for the title matches as their own column", async () => {
    await searchStoredJobs({ skills: SKILLS });
    expect(capturedQuery().sql).toContain('AS "titleSkills"');
  });
});
