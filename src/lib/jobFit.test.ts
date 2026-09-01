import { describe, expect, it } from "vitest";
import { JobFitError, buildPrompt, parseFit } from "./jobFit";

const VALID = {
  score: 72,
  verdict: "partial",
  summary: "Cubres el stack principal pero te faltan los años que piden.",
  strengths: ["Tienes React y TypeScript, que son el núcleo de la oferta"],
  gaps: ["Piden 6 años y en tu CV constan 3"],
};

describe("parseFit", () => {
  it("parses a clean response", () => {
    expect(parseFit(JSON.stringify(VALID))).toEqual(VALID);
  });

  it("pulls the JSON out of surrounding prose", () => {
    const text = `Aquí tienes el análisis:\n${JSON.stringify(VALID)}\nEspero que ayude.`;
    expect(parseFit(text).score).toBe(72);
  });

  it("clamps a score outside the range instead of failing", () => {
    // A model that answers 120 has still made a usable judgement; throwing the
    // whole analysis away over the number would waste the call.
    expect(parseFit(JSON.stringify({ ...VALID, score: 120 })).score).toBe(0);
  });

  it("falls back to the cautious verdict when the label is unknown", () => {
    expect(parseFit(JSON.stringify({ ...VALID, verdict: "excelente" })).verdict).toBe(
      "weak"
    );
  });

  it("drops malformed lists rather than the whole verdict", () => {
    const result = parseFit(JSON.stringify({ ...VALID, gaps: "ninguno" }));
    expect(result.gaps).toEqual([]);
    expect(result.summary).toBe(VALID.summary);
  });

  it("rejects a response with no verdict text", () => {
    // Everything else is recoverable; a panel with no sentence in it is not a
    // result, it is an empty box that looks like a bug.
    expect(() => parseFit(JSON.stringify({ ...VALID, summary: "  " }))).toThrow(
      JobFitError
    );
  });

  it("rejects a response that is not JSON at all", () => {
    expect(() => parseFit("No puedo evaluar esta oferta.")).toThrow(JobFitError);
    expect(() => parseFit("{ score: }")).toThrow(JobFitError);
  });
});

describe("buildPrompt", () => {
  const job = {
    title: "Backend Engineer",
    company: "Acme",
    location: "Madrid",
    description: "Buscamos backend con Kafka. ".repeat(10),
  };

  it("includes the profile and the full listing", () => {
    const prompt = buildPrompt(
      { summary: "Backend con 3 años", yearsExp: 3, skills: ["Node.js", "Kafka"] },
      job
    );

    expect(prompt).toContain("3 años");
    expect(prompt).toContain("Node.js, Kafka");
    expect(prompt).toContain("Backend Engineer");
    expect(prompt).toContain("Kafka");
  });

  it("says so rather than guessing when the years are unknown", () => {
    const prompt = buildPrompt({ yearsExp: null, skills: [] }, job);

    expect(prompt).toContain("no consta");
    expect(prompt).toContain("ninguna");
  });

  it("truncates a long CV so one profile cannot blow the budget", () => {
    const prompt = buildPrompt(
      { skills: ["Go"], cvText: "x".repeat(50000) },
      job
    );

    expect(prompt.length).toBeLessThan(20000);
  });
});
