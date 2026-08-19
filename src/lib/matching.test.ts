import { describe, expect, it } from "vitest";
import {
  DESCRIPTION_WEIGHT,
  TITLE_WEIGHT,
  jsPattern,
  postgresPattern,
  scoreJob,
} from "./matching";

describe("word-boundary matching", () => {
  it.each([
    ["Go", "Django developer"],
    ["Go", "Golang y Googling"],
    ["R", "React and Redux"],
    ["Java", "JavaScript developer"],
    ["Python", "Pythonista"],
  ])("does not let %s match inside a longer word (%s)", (skill, text) => {
    // Substring matching is what turns a skill list into noise.
    expect(jsPattern(skill).test(text)).toBe(false);
  });

  it.each([
    ["Go", "Backend Go engineer"],
    ["R", "Data analysis in R"],
    ["Java", "Senior Java developer"],
    ["Node.js", "We use Node.js daily"],
  ])("still matches %s as a whole word", (skill, text) => {
    expect(jsPattern(skill).test(text)).toBe(true);
  });

  it.each([
    ["C++", "Programador C++ senior"],
    ["C#", "Desarrollo en C# y .NET"],
    [".NET", "Stack .NET moderno"],
  ])("matches %s, whose edges are not word characters", (skill, text) => {
    // A boundary next to "+" or "#" can never match, so it must be omitted.
    expect(jsPattern(skill).test(text)).toBe(true);
  });

  it("treats metacharacters literally instead of as a pattern", () => {
    // Unescaped, "C++" is an invalid quantifier and "." matches anything.
    expect(jsPattern("C++").test("CXX")).toBe(false);
    expect(jsPattern("Node.js").test("NodeXjs")).toBe(false);
  });

  it("does not throw on a skill made only of metacharacters", () => {
    expect(() => jsPattern("+++")).not.toThrow();
    expect(jsPattern("+++").test("+++")).toBe(true);
  });

  it("matches a single-letter skill inside C++ / C#, which is a known overlap", () => {
    // "C" is a whole word in "C++": the next character is "+", so the boundary
    // holds. Documented rather than special-cased, because the alternative is
    // ad-hoc rules that break "C++" and "C#" matching themselves. A profile
    // listing plain "C" will therefore also match C++ and C# postings.
    expect(jsPattern("C").test("C++ and C# only")).toBe(true);
    // The valuable cases are unaffected: these never leak.
    expect(jsPattern("C").test("Clojure y Cobol")).toBe(false);
  });

  it("is case-insensitive", () => {
    expect(jsPattern("python").test("PYTHON developer")).toBe(true);
  });

  it("builds Postgres boundaries with the same rule", () => {
    expect(postgresPattern("Go")).toBe("\\mGo\\M");
    // No trailing boundary: "+" is not a word character.
    expect(postgresPattern("C++")).toBe("\\mC\\+\\+");
    // No leading boundary: "." is not a word character.
    expect(postgresPattern(".NET")).toBe("\\.NET\\M");
  });
});

describe("scoreJob", () => {
  const SKILLS = ["Python", "React", "Postgres"];

  it("weights a title hit above a description hit", () => {
    const title = scoreJob({ title: "Python developer", description: "nada" }, SKILLS);
    const body = scoreJob({ title: "Developer", description: "usamos Python" }, SKILLS);

    expect(title.score).toBe(TITLE_WEIGHT);
    expect(body.score).toBe(DESCRIPTION_WEIGHT);
    expect(title.score).toBeGreaterThan(body.score);
  });

  it("adds both weights when a skill appears in title and description", () => {
    const result = scoreJob(
      { title: "Python developer", description: "Python a diario" },
      SKILLS
    );

    expect(result.score).toBe(TITLE_WEIGHT + DESCRIPTION_WEIGHT);
    expect(result.matchedSkills).toEqual(["Python"]);
  });

  it("ranks three skills in the title above six in the body", () => {
    const focused = scoreJob({ title: "Python React Postgres", description: "" }, SKILLS);
    const scattered = scoreJob(
      { title: "Ingeniero", description: "Python React Postgres" },
      SKILLS
    );

    expect(focused.score).toBeGreaterThan(scattered.score);
  });

  it("counts a repeated skill once per field", () => {
    const result = scoreJob(
      { title: "Python Python Python", description: null },
      ["Python"]
    );

    expect(result.score).toBe(TITLE_WEIGHT);
  });

  it("returns zero and no matches when nothing lines up", () => {
    expect(scoreJob({ title: "Cocinero", description: "paella" }, SKILLS)).toEqual({
      score: 0,
      matchedSkills: [],
    });
  });

  it("handles a null description", () => {
    expect(() => scoreJob({ title: "Python", description: null }, SKILLS)).not.toThrow();
  });

  it("ignores blank skills instead of matching everything", () => {
    // An empty pattern matches any string, which would score every listing.
    const result = scoreJob({ title: "Cocinero", description: "paella" }, ["", "   "]);

    expect(result).toEqual({ score: 0, matchedSkills: [] });
  });

  it("reports which skills matched, for the UI to show", () => {
    const result = scoreJob(
      { title: "React developer", description: "algo de Postgres" },
      SKILLS
    );

    expect(result.matchedSkills).toEqual(["React", "Postgres"]);
  });
});
