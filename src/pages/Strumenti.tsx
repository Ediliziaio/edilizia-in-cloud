/**
 * Hub degli strumenti gratuiti.
 *
 * Pagina di ingresso per i calcolatori: raccoglie il traffico di ricerca
 * generico ("calcolatori edilizia", "strumenti gratuiti imprese edili") e
 * distribuisce l'autorevolezza sulle singole pagine, che sono quelle che
 * intercettano le query specifiche.
 */
import { Link } from "react-router-dom";
import { useSEO, SITE_URL } from "@/hooks/useSEO";
import { JsonLd } from "@/components/seo/JsonLd";
import { HubSeoSchema } from "@/components/seo/HubSeoSchema";
import LandingNavbar from "@/components/landing/LandingNavbar";
import LandingFooter from "@/components/landing/LandingFooter";
import { ArrowRight, Calculator, Clock, Euro, ShieldCheck } from "lucide-react";

const STRUMENTI = [
  {
    slug: "calcolo-congruita-manodopera",
    titolo: "Congruità della manodopera",
    descrizione:
      "Verifica se la manodopera denunciata raggiunge la soglia del DM 143/2021 per la categoria del tuo cantiere. Con la tabella ufficiale completa.",
    icona: ShieldCheck,
    tag: "DM 143/2021",
  },
  {
    slug: "calcolo-costo-orario-operaio",
    titolo: "Costo orario reale di un operaio",
    descrizione:
      "Il costo vero di un'ora di lavoro: costo annuo pieno diviso le ore realmente produttive. Il numero da usare nei preventivi.",
    icona: Clock,
    tag: "Manodopera",
  },
  {
    slug: "calcolatore-margine-commessa",
    titolo: "Margine di commessa",
    descrizione:
      "Quanto stai guadagnando su un cantiere, con punto di pareggio e allarme quando il costo consumato supera l'avanzamento.",
    icona: Calculator,
    tag: "Controllo di gestione",
  },
  {
    slug: "calcolo-ritenuta-garanzia",
    titolo: "Ritenuta di garanzia",
    descrizione:
      "Quanto viene trattenuto su ogni SAL, quanto resta fermo a fine lavori e quanto ti costa quel credito immobilizzato.",
    icona: Euro,
    tag: "SAL e pagamenti",
  },
] as const;

const DESCRIZIONE =
  "Calcolatori gratuiti per imprese edili: congruità della manodopera secondo il DM 143/2021, costo orario reale di un operaio, margine di commessa e ritenuta di garanzia. Nessuna registrazione, calcolo nel browser.";

export default function Strumenti() {
  useSEO({
    title: "Calcolatori Gratuiti per Imprese Edili | Edilizia in Cloud",
    description: DESCRIZIONE,
    canonical: "/strumenti",
  });

  const itemListLd = {
    "@context": "https://schema.org",
    "@type": "ItemList",
    "@id": `${SITE_URL}/strumenti/#lista`,
    name: "Calcolatori gratuiti per imprese edili",
    numberOfItems: STRUMENTI.length,
    itemListElement: STRUMENTI.map((s, i) => ({
      "@type": "ListItem",
      position: i + 1,
      name: s.titolo,
      url: `${SITE_URL}/strumenti/${s.slug}/`,
    })),
  };

  return (
    <div className="min-h-screen bg-white">
      <LandingNavbar />

      <HubSeoSchema
        pageName="Strumenti gratuiti"
        pagePath="/strumenti"
        pageDescription={DESCRIZIONE}
        breadcrumbs={[
          { name: "Home", url: "/" },
          { name: "Strumenti gratuiti", url: "/strumenti" },
        ]}
      />
      <JsonLd id="jsonld-strumenti-list" data={itemListLd} />

      <main className="pt-24 pb-16 md:pt-28">
        <div className="mx-auto w-full max-w-4xl px-4 sm:px-6">
          <header className="mb-10 text-center">
            <span className="mb-3 inline-flex items-center gap-1.5 rounded-full bg-[#F97415]/10 px-3 py-1 text-xs font-semibold text-[#F97415]">
              <Calculator className="h-3.5 w-3.5" aria-hidden="true" />
              Gratuiti · nessuna registrazione
            </span>
            <h1 className="text-3xl font-bold leading-tight text-gray-900 sm:text-4xl">
              Strumenti e calcolatori per imprese edili
            </h1>
            <p className="mx-auto mt-4 max-w-2xl text-base leading-relaxed text-gray-600 sm:text-lg">
              Quattro calcoli che in cantiere servono spesso e che quasi tutti fanno a mano, con il
              rischio di sbagliarli. Funzionano nel browser: nessun dato che inserisci viene
              inviato o memorizzato.
            </p>
          </header>

          <div className="grid gap-4 sm:grid-cols-2">
            {STRUMENTI.map((s) => {
              const Icona = s.icona;
              return (
                <Link
                  key={s.slug}
                  to={`/strumenti/${s.slug}`}
                  className="group flex flex-col rounded-2xl border border-gray-200 p-5 transition-all hover:border-[#F97415]/50 hover:shadow-md"
                >
                  <div className="mb-3 flex items-center gap-3">
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#F97415]/10">
                      <Icona className="h-5 w-5 text-[#F97415]" aria-hidden="true" />
                    </span>
                    <span className="rounded-full bg-gray-100 px-2.5 py-1 text-[11px] font-medium text-gray-600">
                      {s.tag}
                    </span>
                  </div>
                  <h2 className="text-lg font-bold text-gray-900 group-hover:text-[#F97415]">
                    {s.titolo}
                  </h2>
                  <p className="mt-2 flex-1 text-sm leading-relaxed text-gray-600">
                    {s.descrizione}
                  </p>
                  <span className="mt-4 inline-flex items-center gap-1.5 text-sm font-semibold text-[#F97415]">
                    Apri il calcolatore
                    <ArrowRight
                      className="h-4 w-4 transition-transform group-hover:translate-x-0.5"
                      aria-hidden="true"
                    />
                  </span>
                </Link>
              );
            })}
          </div>

          <section className="mt-12" aria-labelledby="perche">
            <h2 id="perche" className="text-2xl font-bold text-gray-900">
              Perché questi quattro
            </h2>
            <div className="mt-4 space-y-4 text-[15px] leading-relaxed text-gray-700">
              <p>
                Sono i calcoli che, sbagliati, costano di più. La{" "}
                <strong>congruità della manodopera</strong> perché un cantiere sotto soglia blocca
                il saldo finale, e a fine lavori il buco non si colma più. Il{" "}
                <strong>costo orario</strong> perché preventivare sulla paga in busta invece che sul
                costo aziendale pieno è il modo più comune per firmare lavori in perdita convinti di
                guadagnarci. Il <strong>margine di commessa</strong> perché senza spese generali un
                cantiere che sembra in utile può stare togliendo soldi. La{" "}
                <strong>ritenuta di garanzia</strong> perché quel credito fermo per mesi ha un costo
                che quasi nessuno mette a bilancio.
              </p>
              <p>
                Dove il calcolo dipende da un dato normativo, la fonte è dichiarata sulla pagina.
                Dove dipende da un dato che varia per territorio o contratto — aliquote contributive,
                percentuali di Cassa Edile — il valore lo inserisci tu: dare un numero «medio»
                significherebbe farti calcolare su un dato falso, che è esattamente il problema da
                risolvere.
              </p>
            </div>
          </section>
        </div>
      </main>

      <LandingFooter />
    </div>
  );
}
