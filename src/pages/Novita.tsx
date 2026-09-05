import { Link } from "react-router-dom";
import { ArrowRight, Sparkles, Wrench, Smartphone, LayoutDashboard, FileText, Bot } from "lucide-react";
import LandingNavbar from "@/components/landing/LandingNavbar";
import LandingFooter from "@/components/landing/LandingFooter";
import { useSEO, SITE_URL } from "@/hooks/useSEO";
import { JsonLd } from "@/components/seo/JsonLd";

/* ──────────────────────────────────────────────────────────────
   DATA — changelog pubblico. Solo funzionalità realmente rilasciate
   (fonte: storia del prodotto); aggiornare ad ogni release rilevante.
────────────────────────────────────────────────────────────── */

type ReleaseArea = "AI" | "Commesse" | "Dashboard" | "Mobile" | "Preventivi" | "Piattaforma";

interface ReleaseEntry {
  area: ReleaseArea;
  title: string;
  desc: string;
}

interface ReleaseMonth {
  month: string;
  entries: ReleaseEntry[];
}

const AREA_META: Record<ReleaseArea, { icon: React.ElementType; color: string }> = {
  AI: { icon: Bot, color: "#8b5cf6" },
  Commesse: { icon: Wrench, color: "#F97415" },
  Dashboard: { icon: LayoutDashboard, color: "#0ea5e9" },
  Mobile: { icon: Smartphone, color: "#10b981" },
  Preventivi: { icon: FileText, color: "#f59e0b" },
  Piattaforma: { icon: Sparkles, color: "#64748b" },
};

const RELEASES: ReleaseMonth[] = [
  {
    month: "Giugno 2026",
    entries: [
      {
        area: "AI",
        title: "Crea automazioni descrivendole a parole",
        desc: "Scrivi cosa vuoi automatizzare (\"quando un preventivo viene accettato, crea la commessa e avvisa il capocantiere\") e l'AI costruisce il flusso completo, pronto da attivare.",
      },
      {
        area: "Commesse",
        title: "Incassi SAL semplificati",
        desc: "Nuovo bottone \"Registra incasso\", avanzamento incassi visibile nella sezione SAL e alert \"prossima azione\" in testata commessa: sai sempre cosa incassare e quando.",
      },
      {
        area: "Dashboard",
        title: "Grafici premium con drill-down",
        desc: "Funnel animato, aree sfumate, click sul mese per il dettaglio, delta % nel tooltip e legenda interattiva su marketing, gestionale e operativa.",
      },
      {
        area: "Mobile",
        title: "Navigazione \"liquid glass\"",
        desc: "Bottom-nav ridisegnata in stile iOS con pillola liquida, feedback aptico e accesso diretto a Silvio AI dal pulsante centrale.",
      },
    ],
  },
  {
    month: "Maggio 2026",
    entries: [
      {
        area: "AI",
        title: "Cervello AI: knowledge graph 3D",
        desc: "La memoria delle AI Personas diventa esplorabile: un grafo interattivo mostra cosa sa l'AI della tua azienda e come collega clienti, cantieri e documenti.",
      },
      {
        area: "AI",
        title: "Sei nuovi sistemi AI operativi",
        desc: "Chatbot pubblico per il tuo sito, gestione visite, pricing dinamico, ottimizzazione percorsi, video di sicurezza e gestione reclami: l'AI entra nei processi quotidiani.",
      },
    ],
  },
  {
    month: "Aprile 2026",
    entries: [
      {
        area: "Dashboard",
        title: "War Room operativa",
        desc: "Dashboard ridisegnata con semafori di salute aziendale, azioni urgenti in evidenza e cashflow reale calcolato su incassi e costi effettivamente pagati.",
      },
      {
        area: "Piattaforma",
        title: "HR edilizia completa",
        desc: "Contributi CCNL Edilizia, alert DURC in scadenza e stato cedolini per ogni dipendente, integrati con presenze di cantiere.",
      },
      {
        area: "AI",
        title: "Render AI v6",
        desc: "Wizard in 6 passaggi, slider prima/dopo da mostrare al cliente, nuovi motori per ristrutturazioni, outdoor e pergole, collegamento diretto a CRM e preventivo.",
      },
      {
        area: "Mobile",
        title: "App da cantiere più veloce",
        desc: "Installazione PWA guidata, pulsanti kiosk più grandi per il giornale lavori, creazione articoli di magazzino direttamente dalla scansione.",
      },
    ],
  },
  {
    month: "Marzo 2026",
    entries: [
      {
        area: "Preventivi",
        title: "Firma digitale con QR e WhatsApp",
        desc: "Il cliente firma il preventivo dal telefono: QR code in copertina, condivisione del link via WhatsApp e righe visibili nella pagina pubblica di firma.",
      },
      {
        area: "Preventivi",
        title: "Dal preventivo al cantiere in un click",
        desc: "Il preventivo accettato diventa cantiere con un click, con storico versioni, reminder automatici di scadenza e KPI con export Excel.",
      },
    ],
  },
];

/* ────────────────────────────────────────────────────────────── */

export default function Novita() {
  useSEO({
    title: "Novità e aggiornamenti del prodotto",
    description:
      "Novità di Edilizia in Cloud mese per mese: funzioni AI, commesse, dashboard, mobile e preventivi. Aggiornamenti inclusi nel piano, senza costi extra.",
    canonical: "/novita",
    keywords:
      "novità edilizia in cloud, changelog gestionale edilizia, aggiornamenti software edilizia, nuove funzionalità gestionale",
  });

  return (
    <div className="min-h-screen bg-white">
      <JsonLd
        id="jsonld-breadcrumb-novita"
        data={{
          "@context": "https://schema.org",
          "@type": "BreadcrumbList",
          itemListElement: [
            { "@type": "ListItem", position: 1, name: "Home", item: `${SITE_URL}/` },
            { "@type": "ListItem", position: 2, name: "Novità", item: `${SITE_URL}/novita/` },
          ],
        }}
      />
      <LandingNavbar />

      {/* HERO */}
      <section className="bg-[#111111] pt-28 pb-14 px-4 md:pt-36 md:pb-20">
        <div className="max-w-4xl mx-auto text-center">
          <p className="inline-block mb-4 px-4 py-1.5 rounded-full text-xs font-semibold uppercase tracking-widest text-[#F97415] bg-[#F97415]/10 border border-[#F97415]/25">
            Prodotto vivo
          </p>
          <h1 className="text-3xl md:text-5xl font-extrabold text-white mb-4">
            Le novità di <span className="text-[#F97415]">Edilizia in Cloud</span>
          </h1>
          <p className="text-white/60 text-base md:text-lg max-w-2xl mx-auto">
            Rilasciamo miglioramenti ogni settimana e sono sempre inclusi nel canone, per tutti i
            piani. Qui trovi le novità principali, mese per mese.
          </p>
        </div>
      </section>

      {/* TIMELINE */}
      <section className="py-14 md:py-20 px-4 bg-[#f7f9fc]">
        <div className="max-w-3xl mx-auto space-y-12">
          {RELEASES.map((m) => (
            <div key={m.month}>
              <div className="flex items-center gap-3 mb-5">
                <h2 className="text-xl md:text-2xl font-extrabold text-[#111111]">{m.month}</h2>
                <div className="h-px flex-1 bg-gray-200" />
              </div>
              <div className="space-y-4">
                {m.entries.map((e) => {
                  const meta = AREA_META[e.area];
                  const Icon = meta.icon;
                  return (
                    <article
                      key={e.title}
                      className="flex gap-4 rounded-2xl border border-gray-200 bg-white p-5 shadow-sm"
                    >
                      <span
                        className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl"
                        style={{ backgroundColor: `${meta.color}1a`, color: meta.color }}
                      >
                        <Icon className="h-5 w-5" />
                      </span>
                      <div>
                        <div className="mb-1 flex flex-wrap items-center gap-2">
                          <h3 className="font-bold text-[#111111]">{e.title}</h3>
                          <span
                            className="rounded-md px-1.5 py-0.5 text-[10px] font-black uppercase tracking-widest text-white"
                            style={{ backgroundColor: meta.color }}
                          >
                            {e.area}
                          </span>
                        </div>
                        <p className="text-sm leading-relaxed text-gray-600">{e.desc}</p>
                      </div>
                    </article>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* CTA */}
      <section className="py-14 px-4 bg-white border-t border-gray-100">
        <div className="max-w-3xl mx-auto text-center">
          <h2 className="text-2xl md:text-3xl font-extrabold text-[#111111] mb-3">
            Tutto questo è già incluso nel tuo piano
          </h2>
          <p className="text-gray-500 mb-6 max-w-xl mx-auto">
            Niente moduli a pagamento, niente upgrade nascosti: ogni novità arriva automaticamente a
            tutte le imprese, dal piano Gestionale a Impresa AI.
          </p>
          <div className="flex flex-col items-center justify-center gap-3 sm:flex-row">
            <Link
              to="/demo/"
              className="inline-flex items-center gap-2 rounded-xl bg-[#F97415] px-7 py-3.5 font-bold text-white shadow-lg shadow-[#F97415]/30 transition-all hover:bg-[#e8650e] hover:scale-105"
            >
              Prova gratis 31 giorni <ArrowRight className="h-5 w-5" />
            </Link>
            <Link
              to="/funzionalita/"
              className="inline-flex items-center gap-2 rounded-xl border border-gray-200 px-6 py-3.5 font-semibold text-[#111111] transition-colors hover:border-[#F97415]/50 hover:text-[#F97415]"
            >
              Vedi tutte le funzionalità
            </Link>
          </div>
        </div>
      </section>

      <LandingFooter />
    </div>
  );
}
