import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { FitGauge, buttonClass, cx } from "@/components/ui";

/**
 * The hero is the gauge, not a headline over three numbered cards.
 *
 * The one thing this product has that a job board does not is that it shows
 * its working: a listing's fit is a segment per skill, filled when the skill is
 * in the title and half when it is only in the body. Describing that in prose
 * and illustrating it with icons would be the template answer. Printing an
 * actual specimen of the results sheet says it in one look, and it is the same
 * component the signed-in page renders.
 */

/** The skills the specimen is measured against — a plausible backend list. */
const SPECIMEN_SKILLS = ["PHP", "Laravel", "Docker", "Go", "Rust"];

/**
 * Example rows, not listings. No company names and no links: this is a drawing
 * of the interface, and dressing it up as real postings would be a lie told for
 * decoration.
 */
const SPECIMEN = [
  {
    title: "Senior PHP Developer (Laravel)",
    matched: ["PHP", "Laravel", "Docker"],
    inTitle: ["PHP", "Laravel"],
    level: "senior",
    mode: "Remoto",
    age: "hace 2 días",
  },
  {
    title: "Backend Engineer — Go, Kubernetes",
    matched: ["Go", "Docker"],
    inTitle: ["Go"],
    level: "—",
    mode: "Híbrido",
    age: "ayer",
  },
  {
    title: "Programador/a PHP con Symfony",
    matched: ["PHP", "Docker"],
    inTitle: ["PHP"],
    level: "—",
    mode: "Presencial",
    age: "hace 4 días",
  },
  {
    title: "Rust Systems Engineer",
    matched: ["Rust"],
    inTitle: ["Rust"],
    level: "senior",
    mode: "Remoto",
    age: "hoy",
  },
];

const SOURCES = ["InfoJobs", "LinkedIn", "Tecnoempleo", "Adzuna"];

const COLUMNS = "md:grid-cols-[5rem_1fr_5.5rem_6rem_5.5rem] md:gap-4";

export default async function Home() {
  const session = await auth();
  if (session?.user) redirect("/empleos");

  return (
    <div className="mx-auto w-full max-w-5xl flex-1 px-6 pb-20">
      <section className="motion-rise border-b border-pauta-fuerte py-14 sm:py-20">
        <p className="rotulo">Buscador de empleo técnico</p>

        <h1 className="display mt-4 max-w-3xl text-4xl leading-[1.05] text-balance sm:text-6xl">
          Cada oferta, medida contra tus skills
        </h1>

        <p className="mt-6 max-w-xl text-lg leading-relaxed text-tinta-2">
          Subes el CV una vez y sacamos tus lenguajes, frameworks y años en cada
          uno. A partir de ahí cada oferta se puntúa contra esa lista — y te
          enseñamos la puntuación desglosada, no un número suelto.
        </p>

        <div className="mt-9 flex flex-wrap gap-3">
          <Link href="/register" className={buttonClass("primary", "px-6")}>
            Crear cuenta
          </Link>
          <Link href="/login" className={buttonClass("outline", "px-6")}>
            Iniciar sesión
          </Link>
        </div>
      </section>

      <section
        className="motion-rise pt-12"
        style={{ animationDelay: "120ms" }}
        aria-labelledby="muestra"
      >
        <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-2">
          <h2 id="muestra" className="rotulo">
            Muestra — así se lee una búsqueda
          </h2>
          <p className="valor text-xs text-tinta-2">
            medido contra {SPECIMEN_SKILLS.join(" · ")}
          </p>
        </div>

        <div className={cx("mt-5 hidden border-b border-pauta-fuerte pb-1.5 md:grid", COLUMNS)}>
          <span className="rotulo">encaje</span>
          <span className="rotulo">puesto</span>
          <span className="rotulo">nivel</span>
          <span className="rotulo">modalidad</span>
          <span className="rotulo text-right">public.</span>
        </div>

        <ul className="divide-y divide-pauta border-b border-pauta">
          {SPECIMEN.map((row, i) => (
            <li
              key={row.title}
              style={{ animationDelay: `${200 + i * 70}ms` }}
              className={cx("motion-rise py-4 md:grid md:items-start", COLUMNS)}
            >
              <div className="mb-3 md:mb-0">
                <FitGauge
                  skills={SPECIMEN_SKILLS}
                  matched={row.matched}
                  inTitle={row.inTitle}
                />
              </div>

              <p className="display text-[0.95rem] leading-snug">{row.title}</p>

              <SpecimenCell label="nivel">{row.level}</SpecimenCell>
              <SpecimenCell label="modalidad">{row.mode}</SpecimenCell>
              <SpecimenCell label="publicado" align="right">
                {row.age}
              </SpecimenCell>
            </li>
          ))}
        </ul>

        {/* The notation, explained where it is used, the way a sheet explains
            its own symbols instead of leaving the reader to infer them. */}
        <div className="mt-5 flex flex-wrap items-center gap-x-6 gap-y-2 border-t border-pauta pt-4">
          <span className="rotulo">encaje</span>
          <Key fill="bg-medida">en el título</Key>
          <Key fill="bg-[linear-gradient(to_top,var(--medida)_50%,var(--pauta)_50%)]">
            solo en la descripción
          </Key>
          <Key fill="bg-pauta">no aparece</Key>
        </div>

        <p className="mt-5 max-w-2xl text-sm leading-relaxed text-tinta-2">
          Una casilla por cada skill que buscas. Un acierto en el título pesa el
          triple que uno en la descripción, así que dos ofertas con el mismo
          número de coincidencias no valen lo mismo — y aquí se ve cuál es cuál
          sin abrir ninguna.
        </p>
      </section>

      <section
        className="motion-rise mt-14 border-t border-pauta-fuerte pt-8"
        style={{ animationDelay: "480ms" }}
      >
        <h2 className="rotulo">De dónde salen</h2>
        <ul className="mt-3 flex flex-wrap gap-x-8 gap-y-2">
          {SOURCES.map((source) => (
            <li key={source} className="valor text-sm">
              {source}
            </li>
          ))}
        </ul>
        <p className="mt-4 max-w-2xl text-sm leading-relaxed text-tinta-2">
          El índice se refresca por su cuenta y las ofertas se sirven hasta dos
          semanas. Filtras por skill, nivel, modalidad, fecha y ubicación, y la
          búsqueda entera cabe en la URL: la copias y quien la abra ve lo mismo
          que tú.
        </p>
      </section>
    </div>
  );
}

function SpecimenCell({
  label,
  align = "left",
  children,
}: {
  label: string;
  align?: "left" | "right";
  children: React.ReactNode;
}) {
  return (
    <div className="mt-1.5 flex gap-3 md:mt-0 md:block">
      <span className="rotulo w-24 shrink-0 md:hidden">{label}</span>
      <span
        className={cx(
          "valor text-sm text-tinta-2",
          align === "right" && "md:block md:text-right"
        )}
      >
        {children}
      </span>
    </div>
  );
}

function Key({ fill, children }: { fill: string; children: React.ReactNode }) {
  return (
    <span className="flex items-center gap-2 text-xs text-tinta-2">
      <span aria-hidden="true" className={cx("h-3 w-2", fill)} />
      {children}
    </span>
  );
}
