import { describe, expect, it } from "vitest";
import { isOnlyLinks, normalizeLinkedinUrl } from "./profileInput";

describe("isOnlyLinks", () => {
  it("catches the bare profile link, which is the whole reason this exists", () => {
    expect(isOnlyLinks("https://www.linkedin.com/in/hugo-casado")).toBe(true);
    expect(isOnlyLinks("linkedin.com/in/hugo-casado")).toBe(true);
    expect(isOnlyLinks("www.linkedin.com/in/hugo-casado")).toBe(true);
  });

  it("catches a link introduced by a few words", () => {
    expect(isOnlyLinks("Mi perfil: https://linkedin.com/in/hugo")).toBe(true);
    expect(isOnlyLinks("aquí lo tienes -> linkedin.com/in/hugo")).toBe(true);
  });

  it("lets short but real prose through", () => {
    // The failure that would matter more than the one being fixed: turning
    // away a genuine profile because it is terse.
    expect(isOnlyLinks("Dev backend, 6 años en PHP y Laravel")).toBe(false);
    expect(isOnlyLinks("")).toBe(false);
  });

  it("lets a real profile that happens to cite a link through", () => {
    const text = `Desarrollador backend con 6 años de experiencia en PHP y Laravel.
      He liderado la migración a microservicios y mantengo varios proyectos
      open source en github.com/hugo/algo`;
    expect(isOnlyLinks(text)).toBe(false);
  });

  it("does not mistake dotted technology names for links", () => {
    // No path, so no link — otherwise this stack would be stripped as one and
    // the remainder judged too short.
    expect(isOnlyLinks("Node.js, Vue.js, ASP.NET")).toBe(false);
  });
});

describe("normalizeLinkedinUrl", () => {
  it("accepts what people actually type, without a scheme", () => {
    expect(normalizeLinkedinUrl("linkedin.com/in/hugo")).toBe(
      "https://linkedin.com/in/hugo"
    );
    expect(normalizeLinkedinUrl("www.linkedin.com/in/hugo")).toBe(
      "https://www.linkedin.com/in/hugo"
    );
  });

  it("keeps a well-formed URL as it is", () => {
    expect(normalizeLinkedinUrl("https://www.linkedin.com/in/hugo")).toBe(
      "https://www.linkedin.com/in/hugo"
    );
  });

  it("accepts the country and mobile subdomains", () => {
    expect(normalizeLinkedinUrl("es.linkedin.com/in/hugo")).toBe(
      "https://es.linkedin.com/in/hugo"
    );
    expect(normalizeLinkedinUrl("https://m.linkedin.com/in/hugo")).toBe(
      "https://m.linkedin.com/in/hugo"
    );
  });

  it("drops the tracking parameters share links carry", () => {
    expect(
      normalizeLinkedinUrl(
        "https://www.linkedin.com/in/hugo?utm_source=share&utm_medium=member_ios"
      )
    ).toBe("https://www.linkedin.com/in/hugo");
  });

  it("rejects a URL that is not LinkedIn", () => {
    // The old schema was a bare z.url(), so this was stored as a LinkedIn
    // profile.
    expect(normalizeLinkedinUrl("https://ejemplo.com")).toBeUndefined();
    expect(normalizeLinkedinUrl("https://notlinkedin.com/in/hugo")).toBeUndefined();
  });

  it("rejects a non-http scheme", () => {
    expect(normalizeLinkedinUrl("javascript:alert(1)")).toBeUndefined();
    expect(normalizeLinkedinUrl("ftp://linkedin.com/in/hugo")).toBeUndefined();
  });

  it("rejects nothing at all", () => {
    expect(normalizeLinkedinUrl("   ")).toBeUndefined();
  });
});
