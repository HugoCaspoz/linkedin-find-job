import { describe, expect, it, vi } from "vitest";

const { create } = vi.hoisted(() => ({ create: vi.fn() }));

vi.mock("@/lib/env", () => ({ requireEnv: () => "test-key" }));
vi.mock("@anthropic-ai/sdk", () => ({
  default: class {
    messages = { create };
  },
}));

import { extractProfile, ProfileExtractionError } from "./extractSkills";

/** Shapes a model reply the way the SDK hands it back. */
function reply(text: string, stopReason = "end_turn") {
  create.mockResolvedValue({
    stop_reason: stopReason,
    content: [{ type: "text", text }],
  });
}

const VALID = JSON.stringify({
  summary: "Backend con 6 anos de experiencia.",
  totalYearsExp: 6,
  skills: [{ name: "Python", category: "language", yearsExp: 6, level: "senior" }],
});

describe("extractProfile", () => {
  it("parses a well-formed reply", async () => {
    reply(VALID);

    await expect(extractProfile("cv")).resolves.toEqual({
      summary: "Backend con 6 anos de experiencia.",
      totalYearsExp: 6,
      skills: [{ name: "Python", category: "language", yearsExp: 6, level: "senior" }],
    });
  });

  it("digs the JSON out of a reply that wraps it in prose", async () => {
    reply(`Claro, aqui tienes:
${VALID}
Espero que ayude.`);

    const profile = await extractProfile("cv");

    expect(profile.skills).toHaveLength(1);
  });

  it("drops duplicate skills case-insensitively", async () => {
    // The unique index is on (profileId, name), so duplicates would break the
    // insert rather than merely look untidy.
    reply(
      JSON.stringify({
        summary: "s",
        totalYearsExp: 1,
        skills: [{ name: "React" }, { name: "react" }, { name: " REACT " }, { name: "Vue" }],
      })
    );

    const profile = await extractProfile("cv");

    expect(profile.skills.map((s) => s.name)).toEqual(["React", "Vue"]);
  });

  it("caps a runaway list at 100 skills", async () => {
    reply(
      JSON.stringify({
        summary: "s",
        totalYearsExp: 1,
        skills: Array.from({ length: 250 }, (_, i) => ({ name: `skill-${i}` })),
      })
    );

    const profile = await extractProfile("cv");

    expect(profile.skills).toHaveLength(100);
  });

  it("coerces an unknown category instead of rejecting the whole profile", async () => {
    reply(
      JSON.stringify({
        summary: "s",
        totalYearsExp: null,
        skills: [{ name: "Kubernetes", category: "inventada", yearsExp: "3" }],
      })
    );

    const profile = await extractProfile("cv");

    expect(profile.skills[0]).toMatchObject({ category: "other", yearsExp: 3 });
  });

  it("rejects a reply cut short by the token limit", async () => {
    // The JSON would parse as truncated garbage otherwise.
    reply(VALID, "max_tokens");

    await expect(extractProfile("cv")).rejects.toBeInstanceOf(ProfileExtractionError);
  });

  it("rejects a reply with no JSON at all", async () => {
    reply("No he podido leer el CV.");

    await expect(extractProfile("cv")).rejects.toBeInstanceOf(ProfileExtractionError);
  });

  it("rejects malformed JSON", async () => {
    reply("{ summary: no quoted keys }");

    await expect(extractProfile("cv")).rejects.toBeInstanceOf(ProfileExtractionError);
  });

  it("truncates the CV before sending it, to bound the paid call", async () => {
    reply(VALID);

    await extractProfile("x".repeat(20_000));

    const sent = create.mock.calls[0][0].messages[0].content as string;
    expect(sent).toHaveLength(15_000);
  });
});
