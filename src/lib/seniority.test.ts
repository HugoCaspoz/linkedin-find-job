import { describe, expect, it } from "vitest";
import { detectSeniority } from "./seniority";

describe("detectSeniority", () => {
  it("reads the explicit English markers", () => {
    expect(detectSeniority("Senior Backend Engineer")).toBe("senior");
    expect(detectSeniority("Junior Java Developer")).toBe("junior");
    expect(detectSeniority("Mid-Level Frontend Developer")).toBe("mid");
  });

  it("reads the Spanish ones the boards actually use", () => {
    expect(detectSeniority("Programador/a PHP Junior")).toBe("junior");
    expect(detectSeniority("Arquitecto de Software")).toBe("senior");
    expect(detectSeniority("Desarrollador en prácticas")).toBe("junior");
    expect(detectSeniority("Responsable de Desarrollo")).toBe("senior");
  });

  it("handles the abbreviations, with and without the dot", () => {
    expect(detectSeniority("Sr. Data Engineer")).toBe("senior");
    expect(detectSeniority("Jr Fullstack Developer")).toBe("junior");
    expect(detectSeniority("Desarrollador SSR")).toBe("mid");
  });

  it("prefers the more specific marker when one contains the other", () => {
    // "Semi-Senior" contains "Senior"; checking senior first would swallow it.
    expect(detectSeniority("Semi-Senior React Developer")).toBe("mid");
    expect(detectSeniority("Semisenior Backend")).toBe("mid");
  });

  it("returns null when the title advertises a range", () => {
    // Picking either end of "Junior/Senior" would be a coin flip.
    expect(detectSeniority("Desarrollador Junior/Senior")).toBeNull();
    expect(detectSeniority("Java Developer Jr-Sr")).toBeNull();
  });

  it("returns null when the title says nothing, which is the common case", () => {
    expect(detectSeniority("PHP Developer (Laravel)")).toBeNull();
    expect(detectSeniority("Programador/a PHP con frameworks")).toBeNull();
  });

  it("does not fire on a marker buried inside another word", () => {
    // The word boundaries are what keep "sr" out of "usr" and "lead" out of
    // "leading" — without them most titles would read as senior.
    expect(detectSeniority("Ingeniero de datos, equipo leading edge")).toBeNull();
    expect(detectSeniority("Administrador de /usr/local")).toBeNull();
    expect(detectSeniority("Internal Tools Developer")).toBeNull();
  });
});
