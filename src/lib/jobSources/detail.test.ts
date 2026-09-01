import { describe, expect, it } from "vitest";
import { MIN_DESCRIPTION_CHARS, MAX_DESCRIPTION_CHARS, extractDescription } from "./detail";

/** Long enough to clear MIN_DESCRIPTION_CHARS without dominating the fixture. */
const PROSE =
  "Buscamos una persona para nuestro equipo de backend. Trabajarás con Node.js y Postgres " +
  "en un producto con tráfico real, y participarás en el diseño de los servicios nuevos.";

describe("extractDescription", () => {
  it("takes the first candidate selector that has enough text", () => {
    const html = `
      <body>
        <div class="teaser">Oferta destacada</div>
        <div class="detalle">${PROSE}</div>
      </body>`;

    expect(extractDescription(html, [".teaser", ".detalle"])).toContain("Node.js");
  });

  it("skips a selector that matches but is too short to be a description", () => {
    // This is the common failure: the class still exists after a redesign but
    // now holds a label. Matching it and returning three words would be worse
    // than not matching at all.
    const html = `
      <body>
        <div class="detalle">Backend</div>
        <div class="cuerpo">${PROSE}</div>
      </body>`;

    expect(extractDescription(html, [".detalle", ".cuerpo"])).toContain("Postgres");
  });

  it("separates block elements so adjacent words do not fuse", () => {
    // cheerio's own `.text()` returns "ReactNode" here, which the skill matcher
    // then finds neither "React" nor "Node" in.
    const html = `<body><div class="detalle"><ul>
      <li>React</li><li>Node</li></ul><p>${PROSE}</p></div></body>`;

    const text = extractDescription(html, [".detalle"])!;

    expect(text).toMatch(/React\s/);
    expect(text).not.toContain("ReactNode");
  });

  it("drops scripts, navigation and footers", () => {
    const html = `
      <body>
        <nav>Inicio Empleos Empresas</nav>
        <div class="detalle">
          <script>window.dataLayer = [];</script>
          ${PROSE}
        </div>
        <footer>Aviso legal</footer>
      </body>`;

    const text = extractDescription(html, [".detalle"])!;

    expect(text).not.toContain("dataLayer");
    expect(text).not.toContain("Aviso legal");
  });

  it("falls back to the densest block when every selector misses", () => {
    // A redesign renamed the class. The point of the fallback is that the
    // column keeps getting filled instead of silently going back to NULL.
    const html = `
      <body>
        <div class="rediseno-2027">${PROSE}</div>
      </body>`;

    expect(extractDescription(html, [".detalle", "#descripcion"])).toContain("backend");
  });

  it("prefers prose over a longer list of links", () => {
    const links = Array.from(
      { length: 40 },
      (_, i) => `<a href="/of-${i}">Desarrollador backend en Madrid ${i}</a>`
    ).join("");

    const html = `
      <body>
        <div class="relacionadas">${links}</div>
        <div class="cuerpo">${PROSE}</div>
      </body>`;

    const text = extractDescription(html, [])!;

    expect(text).toContain("Postgres");
    expect(text).not.toContain("Desarrollador backend en Madrid 0");
  });

  it("returns undefined when the page has no description at all", () => {
    const html = `<body><div>Esta oferta ya no está disponible.</div></body>`;
    expect(extractDescription(html, [".detalle"])).toBeUndefined();
  });

  it("caps the stored text", () => {
    const html = `<body><div class="detalle">${"palabra ".repeat(5000)}</div></body>`;
    const text = extractDescription(html, [".detalle"])!;

    expect(text.length).toBeLessThanOrEqual(MAX_DESCRIPTION_CHARS);
    expect(text.length).toBeGreaterThan(MIN_DESCRIPTION_CHARS);
  });
});
