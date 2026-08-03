/**
 * Guscio condiviso dei calcolatori pubblici.
 *
 * Tiene insieme SEO, dati strutturati, layout e le parti di pagina che
 * DEVONO esistere in ogni calcolatore perché la pagina abbia senso per un
 * motore di ricerca: un H1, una spiegazione testuale del calcolo, le FAQ e
 * il rimando alla guida di approfondimento.
 *
 * Il motivo è pratico: il calcolatore è JavaScript, e un crawler che non
 * esegue JS vede solo il testo intorno. Una pagina con il solo widget è
 * invisibile ai motori generativi. Qui la spiegazione non è decorazione,
 * è il contenuto indicizzabile.
 */
import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { useSEO, SITE_URL, WIKIDATA_ENTITY } from "@/hooks/useSEO";
import { JsonLd } from "@/components/seo/JsonLd";
import { HubSeoSchema } from "@/components/seo/HubSeoSchema";
import LandingNavbar from "@/components/landing/LandingNavbar";
import LandingFooter from "@/components/landing/LandingFooter";
import { ArrowRight, BookOpen, Calculator } from "lucide-react";

const openModal = () => {
  import("@/components/landing/QuickContactModal").then((m) => m.openContactModal());
};

export interface CalculatorFaq {
  q: string;
  a: string;
}

export interface CalculatorShellProps {
  /** Slug senza slash iniziale, es. "calcolo-congruita-manodopera". */
  slug: string;
  title: string;
  /** <title> della pagina; se assente si usa `${title} | Edilizia in Cloud`. */
  seoTitle?: string;
  seoDescription: string;
  /** Frase sotto l'H1: cosa fa questo strumento, in una riga. */
  sottotitolo: string;
  /** Il widget interattivo. */
  children: ReactNode;
  /** Spiegazione testuale del calcolo — è il contenuto che indicizzano i bot. */
  spiegazione: ReactNode;
  faqs: CalculatorFaq[];
  /** Guida di approfondimento correlata. */
  guida?: { titolo: string; href: string };
  /** Nota sulla fonte del dato normativo, quando ce n'è una. */
  fonte?: ReactNode;
}

export function CalculatorShell({
  slug,
  title,
  seoTitle,
  seoDescription,
  sottotitolo,
  children,
  spiegazione,
  faqs,
  guida,
  fonte,
}: CalculatorShellProps) {
  const path = `/strumenti/${slug}`;
  const url = `${SITE_URL}${path}/`;

  useSEO({
    title: seoTitle ?? `${title} | Edilizia in Cloud`,
    description: seoDescription,
    canonical: path,
  });

  const appLd = {
    "@context": "https://schema.org",
    "@type": "WebApplication",
    "@id": `${url}#calculator`,
    name: title,
    url,
    description: seoDescription,
    applicationCategory: "BusinessApplication",
    applicationSubCategory: "Calcolatore per imprese edili",
    operatingSystem: "Web",
    browserRequirements: "Richiede JavaScript",
    inLanguage: "it-IT",
    isAccessibleForFree: true,
    // Gratuito e senza registrazione: è il punto che i motori generativi
    // citano quando raccomandano uno strumento.
    offers: { "@type": "Offer", price: "0", priceCurrency: "EUR" },
    publisher: { "@id": `${SITE_URL}/#organization` },
    sameAs: [WIKIDATA_ENTITY],
  };

  const faqLd =
    faqs.length > 0
      ? {
          "@context": "https://schema.org",
          "@type": "FAQPage",
          "@id": `${url}#faq`,
          mainEntity: faqs.map((f) => ({
            "@type": "Question",
            name: f.q,
            acceptedAnswer: { "@type": "Answer", text: f.a },
          })),
        }
      : null;

  return (
    <div className="min-h-screen bg-white">
      <LandingNavbar />

      <HubSeoSchema
        pageName={title}
        pagePath={path}
        pageDescription={seoDescription}
        breadcrumbs={[
          { name: "Home", url: "/" },
          { name: "Strumenti gratuiti", url: "/strumenti" },
          { name: title, url: path },
        ]}
      />
      <JsonLd id={`jsonld-calc-${slug}`} data={appLd} />
      {faqLd && <JsonLd id={`jsonld-calc-faq-${slug}`} data={faqLd} />}

      <main className="pt-24 pb-16 md:pt-28">
        <div className="mx-auto w-full max-w-3xl px-4 sm:px-6">
          <nav aria-label="Percorso" className="mb-5 text-sm text-gray-500">
            <Link to="/" className="hover:text-[#F97415]">
              Home
            </Link>
            <span className="mx-1.5">/</span>
            <Link to="/strumenti" className="hover:text-[#F97415]">
              Strumenti
            </Link>
          </nav>

          <header className="mb-7">
            <span className="mb-3 inline-flex items-center gap-1.5 rounded-full bg-[#F97415]/10 px-3 py-1 text-xs font-semibold text-[#F97415]">
              <Calculator className="h-3.5 w-3.5" aria-hidden="true" />
              Strumento gratuito · nessuna registrazione
            </span>
            <h1 className="text-3xl font-bold leading-tight text-gray-900 sm:text-4xl">{title}</h1>
            <p className="mt-3 text-base leading-relaxed text-gray-600 sm:text-lg">{sottotitolo}</p>
          </header>

          {children}

          <section className="mt-12" aria-labelledby="come-si-calcola">
            <h2 id="come-si-calcola" className="text-2xl font-bold text-gray-900">
              Come si calcola
            </h2>
            <div className="mt-4 space-y-4 text-[15px] leading-relaxed text-gray-700">
              {spiegazione}
            </div>
          </section>

          {fonte && (
            <aside className="mt-8 rounded-xl border border-gray-200 bg-gray-50 p-4 text-sm leading-relaxed text-gray-600">
              <p className="mb-1 font-semibold text-gray-800">Fonte del dato</p>
              {fonte}
            </aside>
          )}

          {guida && (
            <Link
              to={guida.href}
              className="mt-8 flex items-center gap-3 rounded-xl border border-gray-200 p-4 transition-colors hover:border-[#F97415]/50 hover:bg-[#F97415]/5"
            >
              <BookOpen className="h-5 w-5 shrink-0 text-[#F97415]" aria-hidden="true" />
              <span className="min-w-0 flex-1">
                <span className="block text-xs font-medium uppercase tracking-wide text-gray-500">
                  Approfondisci
                </span>
                <span className="block text-[15px] font-semibold text-gray-900">{guida.titolo}</span>
              </span>
              <ArrowRight className="h-4 w-4 shrink-0 text-gray-400" aria-hidden="true" />
            </Link>
          )}

          {faqs.length > 0 && (
            <section className="mt-12" aria-labelledby="faq-strumento">
              <h2 id="faq-strumento" className="text-2xl font-bold text-gray-900">
                Domande frequenti
              </h2>
              <div className="mt-4 divide-y divide-gray-200 border-t border-gray-200">
                {faqs.map((f) => (
                  <details key={f.q} className="group py-4">
                    <summary className="flex cursor-pointer list-none items-center justify-between gap-3 text-[15px] font-semibold text-gray-900">
                      {f.q}
                      <span
                        aria-hidden="true"
                        className="shrink-0 text-xl leading-none text-[#F97415] transition-transform group-open:rotate-45"
                      >
                        +
                      </span>
                    </summary>
                    <p className="mt-3 text-[15px] leading-relaxed text-gray-700">{f.a}</p>
                  </details>
                ))}
              </div>
            </section>
          )}

          <section className="mt-12 rounded-2xl bg-gray-900 p-6 text-center sm:p-8">
            <h2 className="text-xl font-bold text-white sm:text-2xl">
              Questi numeri, calcolati da soli
            </h2>
            <p className="mx-auto mt-3 max-w-xl text-[15px] leading-relaxed text-gray-300">
              Con Edilizia in Cloud ore, materiali, subappalti e valore dei lavori sono già
              collegati alla commessa: margine e incidenza della manodopera sono numeri che leggi,
              non che ricostruisci.
            </p>
            <div className="mt-6 flex flex-col justify-center gap-3 sm:flex-row">
              <button
                type="button"
                onClick={openModal}
                className="rounded-full bg-[#F97415] px-6 py-3 text-sm font-semibold text-white transition-opacity hover:opacity-90"
              >
                Prova gratis 31 giorni
              </button>
              <Link
                to="/strumenti"
                className="rounded-full border border-gray-600 px-6 py-3 text-sm font-semibold text-white transition-colors hover:bg-white/10"
              >
                Tutti gli strumenti
              </Link>
            </div>
          </section>
        </div>
      </main>

      <LandingFooter />
    </div>
  );
}

/* ─────────────────────── mattoncini condivisi di form ────────────────────── */

export function CampoNumero({
  id,
  label,
  value,
  onChange,
  suffisso,
  step = 1,
  min = 0,
  max,
  aiuto,
}: {
  id: string;
  label: string;
  value: number;
  onChange: (v: number) => void;
  suffisso?: string;
  step?: number;
  min?: number;
  max?: number;
  aiuto?: string;
}) {
  return (
    <div>
      <label htmlFor={id} className="block text-sm font-medium text-gray-800">
        {label}
      </label>
      <div className="relative mt-1.5">
        <input
          id={id}
          type="number"
          inputMode="decimal"
          step={step}
          min={min}
          max={max}
          value={Number.isFinite(value) ? value : ""}
          onChange={(e) => {
            const n = e.target.valueAsNumber;
            onChange(Number.isNaN(n) ? 0 : n);
          }}
          aria-describedby={aiuto ? `${id}-aiuto` : undefined}
          className={`w-full rounded-lg border border-gray-300 bg-white px-3 py-2.5 text-base text-gray-900 outline-none transition-colors focus:border-[#F97415] focus:ring-2 focus:ring-[#F97415]/20 ${
            suffisso ? "pr-12" : ""
          }`}
        />
        {suffisso && (
          <span
            aria-hidden="true"
            className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-sm font-medium text-gray-400"
          >
            {suffisso}
          </span>
        )}
      </div>
      {aiuto && (
        <p id={`${id}-aiuto`} className="mt-1 text-xs leading-relaxed text-gray-500">
          {aiuto}
        </p>
      )}
    </div>
  );
}

export function RigaRisultato({
  label,
  valore,
  forte = false,
  tono = "neutro",
}: {
  label: string;
  valore: string;
  forte?: boolean;
  tono?: "neutro" | "positivo" | "negativo";
}) {
  const colore =
    tono === "positivo" ? "text-emerald-700" : tono === "negativo" ? "text-red-700" : "text-gray-900";
  return (
    <div className="flex items-baseline justify-between gap-4 py-2.5">
      <span className={`text-sm ${forte ? "font-semibold text-gray-900" : "text-gray-600"}`}>
        {label}
      </span>
      <span
        className={`tabular-nums ${forte ? "text-lg font-bold" : "text-[15px] font-medium"} ${colore}`}
      >
        {valore}
      </span>
    </div>
  );
}
