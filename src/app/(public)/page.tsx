import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { FitGauge, GaugeLegend, buttonClass } from "@/components/ui";
import { SOURCES } from "@/components/SiteFooter";

/**
 * One column, one claim, one specimen.
 *
 * The thing this product has that a job board does not is that it shows its
 * working: a listing's fit is a bar per skill, full when the skill is in the
 * title and half when it is only in the body. Describing that in prose over
 * three numbered cards would be the template answer. Printing an actual
 * specimen of the results says it in one look, and it is the same component
 * the signed-in page renders.
 */

/**
 * The skills the specimen is measured against.
 *
 * Chosen for recognition, not for realism about any one profile: a reader who
 * does not know what Rust or Actix Web are cannot tell whether the gauge is
 * saying something useful. These five are also close to the worker's
 * DEFAULT_QUERIES (src/lib/scrapeWorker.ts), so the sample shows roughly what
 * a brand-new account actually finds indexed.
 */
const SPECIMEN_SKILLS = ["JavaScript", "React", "PHP", "Python", "SQL"];

/**
 * Example rows, not listings. No company names and no links: this is a drawing
 * of the interface, and dressing it up as real postings would be a lie told
 * for decoration.
 *
 * Ordered by the same rule the real results use — a title hit scores three, a
 * description hit one — so the specimen obeys its own sort. Getting that wrong
 * is the sort of detail an attentive reader catches and stops trusting.
 */
const SPECIMEN = [
  {
    // JavaScript + React in the title, SQL in the body: 3 + 3 + 1 = 7
    title: "Full Stack JavaScript — React y Node",
    matched: ["JavaScript", "React", "SQL"],
    inTitle: ["JavaScript", "React"],
    meta: ["Remoto", "senior", "hace 2 días"],
  },
  {
    // Python + SQL in the title: 3 + 3 = 6
    title: "Data Engineer — Python y SQL",
    matched: ["Python", "SQL"],
    inTitle: ["Python", "SQL"],
    meta: ["Híbrido", "hoy"],
  },
  {
    // PHP in the title, JavaScript and SQL in the body: 3 + 1 + 1 = 5
    title: "Desarrollador/a PHP con Symfony",
    matched: ["PHP", "JavaScript", "SQL"],
    inTitle: ["PHP"],
    meta: ["Presencial", "junior", "ayer"],
  },
  {
    // Nothing in the title, SQL in the body: 1. A weak fit belongs in the
    // sample — a gauge that only ever shows near-full bars proves nothing.
    title: "Analista programador/a Java",
    matched: ["SQL"],
    inTitle: [],
    meta: ["Presencial", "hace 4 días"],
  },
];

export default async function Home() {
  const session = await auth();
  if (session?.user) redirect("/empleos");

  return (
    <div className="motion-rise mx-auto w-full max-w-[820px] px-7 pb-24 pt-20">
      <h1 className="max-w-[19ch] text-[clamp(34px,4.6vw,52px)] font-semibold leading-[1.08] tracking-[-0.035em] text-balance">
        Mira si encajas antes de abrir la oferta.
      </h1>

      <p className="mt-5 max-w-[52ch] text-[18px] leading-relaxed text-tx2">
        Subes tu CV y ordenamos las ofertas de cuatro portales por cuánto se
        parecen a lo que sabes hacer.
      </p>

      <div className="mt-[34px] flex flex-wrap items-center gap-3">
        <Link href="/register" className={buttonClass("pill")}>
          Subir mi CV
        </Link>
        <span className="text-[13.5px] text-tx3">Gratis, sin tarjeta. Un minuto.</span>
      </div>

      <section aria-labelledby="muestra" className="mt-16">
        <div className="flex flex-wrap items-baseline gap-x-4 gap-y-2 border-b border-line pb-3.5">
          <h2 id="muestra" className="text-[15px] font-semibold">
            Un perfil de ejemplo
          </h2>
          <p className="valor text-[13px] text-tx3">{SPECIMEN_SKILLS.join(" · ")}</p>
        </div>

        <ul>
          {SPECIMEN.map((row) => (
            <li
              key={row.title}
              className="flex flex-wrap items-center gap-x-6 gap-y-3 border-b border-line px-1 py-5"
            >
              <div className="min-w-0 flex-1">
                <p className="text-[18px] font-semibold leading-[1.3] tracking-[-0.018em]">
                  {row.title}
                </p>
                {/* Joined after the empty fields are dropped: a listing with no
                    stated level must not print a separator with nothing
                    either side of it. */}
                <p className="mt-1 text-sm text-tx2">{row.meta.join(" · ")}</p>
              </div>

              <FitGauge
                skills={SPECIMEN_SKILLS}
                matched={row.matched}
                inTitle={row.inTitle}
                className="shrink-0"
              />
            </li>
          ))}
        </ul>

        {/* The notation, explained where it is used, rather than left for the
            reader to infer. */}
        <GaugeLegend className="mt-5" />

        <p className="mt-[22px] max-w-[56ch] text-[14.5px] leading-[1.65] text-tx3">
          Una barra por cada skill del perfil. Un acierto en el título pesa más
          que uno en la descripción, por eso dos ofertas con las mismas
          coincidencias no quedan igual de arriba.
        </p>
      </section>

      <div className="mt-14 flex flex-wrap items-center gap-x-5 gap-y-2 border-t border-line pt-5 text-[13.5px] text-tx3">
        {SOURCES.map((source) => (
          <span key={source}>{source}</span>
        ))}
        <span className="ml-auto">Actualizado cada día</span>
      </div>
    </div>
  );
}
