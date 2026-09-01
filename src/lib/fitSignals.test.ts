import { describe, expect, it } from "vitest";
import { EXCERPT_CHARS, excerpt, requiredYears, yearsShortfall } from "./fitSignals";

describe("requiredYears", () => {
  it("reads the plain Spanish form", () => {
    expect(requiredYears("Buscamos alguien con 3 años de experiencia en React")).toBe(3);
  });

  it("reads the English form", () => {
    expect(requiredYears("At least 5 years of experience with Go")).toBe(5);
  });

  it("takes the lower end of a range", () => {
    // The range is the bar plus a preference; the bar is what decides whether
    // applying is worth it.
    expect(requiredYears("Entre 3-5 años trabajando con Kubernetes")).toBe(3);
    expect(requiredYears("3 a 5 años en backend")).toBe(3);
  });

  it("takes the lowest of several stated requirements", () => {
    const text = "5 años en backend, 2 años en cloud, 8 years of SQL";
    expect(requiredYears(text)).toBe(2);
  });

  it("ignores numbers that are not years of experience", () => {
    expect(requiredYears("Equipo de 12 personas en 3 sedes")).toBeUndefined();
    expect(requiredYears("Facturamos 200 millones")).toBeUndefined();
  });

  it("ignores a calendar year sitting next to the word", () => {
    // "desde 2015 años" is not a thing anyone writes, but "2015" adjacent to
    // the unit is — and 2015 years of experience is not a requirement.
    expect(requiredYears("Somos referentes. Pedimos 4 años de experiencia")).toBe(4);
  });

  it("ignores the years a company has been around", () => {
    // The false positive that matters: taking this at face value tells someone
    // they are two decades short of a bar the listing never set.
    expect(requiredYears("Somos una empresa con 20 años en el mercado")).toBeUndefined();
    expect(requiredYears("Fundada hace 30 años en Bilbao")).toBeUndefined();
    expect(requiredYears("Llevamos 15 años desarrollando software")).toBeUndefined();
  });

  it("still reads the requirement when the boilerplate is in the same listing", () => {
    // Both figures are present; only one of them is a requirement, and the
    // window is what keeps them apart.
    const text =
      "Empresa con 25 años en el mercado. Buscamos backend con 3 años de experiencia en Go.";
    expect(requiredYears(text)).toBe(3);
  });

  it("says nothing when the listing says nothing", () => {
    expect(requiredYears("Buscamos un perfil senior de React")).toBeUndefined();
    expect(requiredYears(null)).toBeUndefined();
    expect(requiredYears(undefined)).toBeUndefined();
  });

  it("does not leak regex state between calls", () => {
    // The patterns are module-level and carry /g, so `lastIndex` survives a
    // call. Without the reset the second call starts mid-string and misses.
    const text = "Pedimos 6 años de experiencia";
    expect(requiredYears(text)).toBe(6);
    expect(requiredYears(text)).toBe(6);
  });
});

describe("excerpt", () => {
  it("flattens whitespace so the preview is one paragraph", () => {
    expect(excerpt("Buscamos\n\n  un   perfil\nbackend")).toBe(
      "Buscamos un perfil backend"
    );
  });

  it("returns a short description unchanged and unmarked", () => {
    expect(excerpt("Perfil backend")).toBe("Perfil backend");
  });

  it("cuts on a word boundary and marks the cut", () => {
    const long = "palabra ".repeat(200);
    const result = excerpt(long)!;

    expect(result.length).toBeLessThanOrEqual(EXCERPT_CHARS + 1);
    expect(result.endsWith("…")).toBe(true);
    // The cut landed between words, not inside one.
    expect(result.slice(0, -1).endsWith("palabra")).toBe(true);
  });

  it("falls back to a hard cut when there is no space to cut on", () => {
    const result = excerpt("x".repeat(EXCERPT_CHARS * 2))!;
    expect(result).toBe(`${"x".repeat(EXCERPT_CHARS)}…`);
  });

  it("treats empty and missing text the same", () => {
    expect(excerpt("   ")).toBeUndefined();
    expect(excerpt(null)).toBeUndefined();
  });
});

describe("yearsShortfall", () => {
  it("reports the gap only when the listing asks for more", () => {
    expect(yearsShortfall(5, 2)).toBe(3);
    expect(yearsShortfall(2, 5)).toBeUndefined();
    expect(yearsShortfall(3, 3)).toBeUndefined();
  });

  it("says nothing when either side is unknown", () => {
    // Not "you fall short": a profile with no stated years is unmeasured, and
    // a listing that never asked cannot be fallen short of.
    expect(yearsShortfall(5, null)).toBeUndefined();
    expect(yearsShortfall(undefined, 2)).toBeUndefined();
  });
});
