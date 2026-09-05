import { useState, useEffect } from "react";
import { useSEO, WIKIDATA_ENTITY } from "@/hooks/useSEO";
import { JsonLd } from "@/components/seo/JsonLd";
import { HubSeoSchema } from "@/components/seo/HubSeoSchema";
import { Link } from "react-router-dom";
import LandingNavbar from "@/components/landing/LandingNavbar";
import LandingFooter from "@/components/landing/LandingFooter";
import { CheckCircle2, XCircle, AlertCircle, ChevronDown, ChevronUp, ArrowRight } from "lucide-react";


type CellType = "check" | "cross" | "partial" | "text";
type RowCategory = "fiscale" | "cantieri" | "ai" | "mobile" | "prezzo" | "altro";

interface TableCell {
  type: CellType;
  text?: string;
}

const openModal = () => {
  import("@/components/landing/QuickContactModal").then((m) => m.openContactModal());
};

function Cell({ cell, highlight = false }: { cell: TableCell; highlight?: boolean }) {
  if (cell.type === "check") {
    return (
      <div className={`flex items-center justify-center ${highlight ? "text-[#F97415]" : "text-[#F97415]"}`}>
        <CheckCircle2 className="w-5 h-5" />
      </div>
    );
  }
  if (cell.type === "cross") {
    return (
      <div className="flex items-center justify-center text-red-500">
        <XCircle className="w-5 h-5" />
      </div>
    );
  }
  if (cell.type === "partial") {
    return (
      <div className="flex items-center justify-center text-amber-500">
        <AlertCircle className="w-5 h-5" />
        <span className="ml-1 text-xs font-medium">Parziale</span>
      </div>
    );
  }
  return (
    <span className={`text-sm ${highlight ? "font-semibold text-[#F97415]" : "text-[#111111]"}`}>
      {cell.text}
    </span>
  );
}

const TABS = [
  { label: "vs Excel", id: "excel" },
  { label: "vs ERP Generici", id: "erp" },
  { label: "vs Commercialista", id: "commercialista" },
  { label: "vs Concorrenti", id: "concorrenti" },
];

const VENDOR_CARDS = [
  {
    to: "/confronto/vs-primus",
    name: "Edilizia in Cloud vs Primus ACCA",
    tagline: "Da computi e preventivi al ciclo completo della commessa.",
  },
  {
    to: "/confronto/vs-teamsystem",
    name: "Edilizia in Cloud vs TeamSystem Construction",
    tagline: "ERP generalista vs gestionale nativo per l'edilizia.",
  },
  {
    to: "/confronto/vs-edilnet",
    name: "Edilizia in Cloud vs Edilnet",
    tagline: "On-premise tradizionale vs cloud operativo in 48h.",
  },
  {
    to: "/confronto/vs-excel",
    name: "Edilizia in Cloud vs Excel",
    tagline: "Il vero costo nascosto dei fogli di calcolo in cantiere.",
  },
  {
    to: "/confronto/vs-buildertrend",
    name: "Edilizia in Cloud vs Buildertrend",
    tagline: "Software USA senza SDI vs gestionale italiano completo.",
  },
];

/**
 * Confronti che vivono sul blog. Stanno nella STESSA griglia dei cinque sopra:
 * separarli in una sezione a parte faceva sembrare Pillar e PlanRadar
 * concorrenti di serie B, e chi arrivava cercando proprio quelli trovava un
 * blocco secondario invece della risposta.
 * TeamSystem Construction non compare qui: ha gia' la sua scheda dedicata e
 * due card con lo stesso nome confondono e basta.
 */
const CONFRONTI_BLOG = [
  {
    to: "/blog/edilizia-in-cloud-vs-pillar",
    name: "Edilizia in Cloud vs Pillar",
    tagline: "Due gestionali con l'AI dentro: dove cambia davvero il lavoro.",
  },
  {
    to: "/blog/edilizia-in-cloud-vs-planradar",
    name: "Edilizia in Cloud vs PlanRadar",
    tagline: "Documentazione di cantiere o gestione dell'intera commessa.",
  },
  {
    to: "/blog/edilizia-in-cloud-vs-dylog-edilizia",
    name: "Edilizia in Cloud vs Dylog Edilizia",
    tagline: "Gestionale storico installato o cloud nativo.",
  },
];

/** Tutti i confronti in un unico elenco: 5 schede + 3 analisi sul blog. */
const TUTTI_I_CONFRONTI = [
  ...VENDOR_CARDS.map((v) => ({ ...v, approfondito: false })),
  ...CONFRONTI_BLOG.map((v) => ({ ...v, approfondito: true })),
];

const excelRows: { feature: string; excel: TableCell; eic: TableCell }[] = [
  { feature: "Margine reale per cantiere", excel: { type: "cross" }, eic: { type: "text", text: "Automatico, aggiornato al secondo" } },
  { feature: "Previsionale di cassa", excel: { type: "cross" }, eic: { type: "text", text: "Dashboard pronta, 90 giorni" } },
  { feature: "Collaborazione team", excel: { type: "cross" }, eic: { type: "text", text: "Tutti i dati sincronizzati in tempo reale" } },
  { feature: "Aggiornamento dati", excel: { type: "cross" }, eic: { type: "text", text: "Automatico da ogni dispositivo" } },
  { feature: "Accesso da cantiere", excel: { type: "cross" }, eic: { type: "text", text: "App mobile nativa, funziona offline" } },
  { feature: "Alert automatici", excel: { type: "cross" }, eic: { type: "text", text: "Notifica se margine scende, se scade pagamento" } },
  { feature: "Report per il commercialista", excel: { type: "cross" }, eic: { type: "text", text: "PDF e Excel pronti in 1 click" } },
  { feature: "Integrazione fatturazione", excel: { type: "cross" }, eic: { type: "text", text: "SDI nativo, completo" } },
  { feature: "Sicurezza dati", excel: { type: "cross" }, eic: { type: "text", text: "Cloud sicuro, backup automatici" } },
  { feature: "Costo effettivo", excel: { type: "text", text: '"Gratis" ma 10+ ore/sett sprecate' }, eic: { type: "text", text: "Da €127/mese (o €99/mese annuale)" } },
];

const erpRows: { feature: string; erp: TableCell; eic: TableCell }[] = [
  { feature: "Costo setup", erp: { type: "text", text: "€2.000 – €5.000" }, eic: { type: "text", text: "Incluso nel piano" } },
  { feature: "Tempo implementazione", erp: { type: "text", text: "4-12 settimane" }, eic: { type: "text", text: "48 ore" } },
  { feature: "Formazione richiesta", erp: { type: "text", text: "2-8 settimane" }, eic: { type: "text", text: "1-2 giorni" } },
  { feature: "Canone mensile", erp: { type: "text", text: "€250 – €400 (TeamSystem)" }, eic: { type: "text", text: "€127 – €547" } },
  { feature: "Moduli edilizia nativi", erp: { type: "partial" }, eic: { type: "text", text: "100% pensati per edilizia" } },
  { feature: "Supporto in italiano", erp: { type: "text", text: "Ticket, settimane di risposta" }, eic: { type: "text", text: "Telefono/WhatsApp, risposta 2h" } },
  { feature: "Aggiornamenti prodotto", erp: { type: "text", text: "1-2/anno con costi aggiuntivi" }, eic: { type: "text", text: "Mensili, inclusi nel piano" } },
  { feature: "Scalabilità per PMI", erp: { type: "cross" }, eic: { type: "text", text: "Progettato per PMI 200K-5M" } },
  { feature: "Marginalità cantieri", erp: { type: "text", text: "Da configurare con consulente" }, eic: { type: "text", text: "Nativo, pronto dal giorno 1" } },
  { feature: "Rischio blocco vendor", erp: { type: "cross" }, eic: { type: "text", text: "Esporta sempre i tuoi dati" } },
];

const commercialistaRows: { feature: string; solo: TableCell; combined: TableCell }[] = [
  { feature: "Frequenza dati", solo: { type: "text", text: "Mensile/Trimestrale" }, combined: { type: "text", text: "Giornaliera" } },
  { feature: "Margine per cantiere", solo: { type: "cross" }, combined: { type: "text", text: "Aggiornato al secondo" } },
  { feature: "Previsionale cassa", solo: { type: "cross" }, combined: { type: "text", text: "A 90 giorni" } },
  { feature: "Costo manodopera reale", solo: { type: "text", text: "Post-consuntivo" }, combined: { type: "text", text: "In tempo reale" } },
  { feature: "Quando scopri i problemi", solo: { type: "text", text: "Quando è tardi" }, combined: { type: "text", text: "Prima che diventino gravi" } },
  { feature: "Costo totale", solo: { type: "text", text: "€12.000-36.000/anno" }, combined: { type: "text", text: "Da €1.188/anno (+commercialista per sola contabilità)" } },
];

interface ConcorrentiRow {
  feature: string;
  primus: TableCell;
  teamsystem: TableCell;
  eic: TableCell;
  category: RowCategory;
}

const concorrentiRows: ConcorrentiRow[] = [
  { feature: "Previsionale di cassa", primus: { type: "partial" }, teamsystem: { type: "cross" }, eic: { type: "text", text: "Completo, 90 giorni" }, category: "cantieri" },
  { feature: "CRM + Marketing integrato", primus: { type: "cross" }, teamsystem: { type: "cross" }, eic: { type: "check" }, category: "altro" },
  { feature: "Email + WhatsApp marketing", primus: { type: "cross" }, teamsystem: { type: "cross" }, eic: { type: "check" }, category: "altro" },
  { feature: "Agenti AI", primus: { type: "cross" }, teamsystem: { type: "cross" }, eic: { type: "check" }, category: "ai" },
  { feature: "Analisi margini AI in tempo reale", primus: { type: "cross" }, teamsystem: { type: "partial" }, eic: { type: "check" }, category: "ai" },
  { feature: "Portale clienti", primus: { type: "cross" }, teamsystem: { type: "partial" }, eic: { type: "check" }, category: "altro" },
  { feature: "Fatturazione elettronica SDI", primus: { type: "text", text: "Modulo extra" }, teamsystem: { type: "check" }, eic: { type: "check" }, category: "fiscale" },
  { feature: "F24 e gestione tributi", primus: { type: "check" }, teamsystem: { type: "check" }, eic: { type: "check" }, category: "fiscale" },
  { feature: "DURC e scadenze documentali", primus: { type: "partial" }, teamsystem: { type: "check" }, eic: { type: "check" }, category: "fiscale" },
  { feature: "Cassa Edile MUT", primus: { type: "cross" }, teamsystem: { type: "check" }, eic: { type: "check" }, category: "fiscale" },
  { feature: "CIG / CUP appalti pubblici", primus: { type: "check" }, teamsystem: { type: "check" }, eic: { type: "check" }, category: "fiscale" },
  { feature: "Reverse charge edilizia", primus: { type: "partial" }, teamsystem: { type: "check" }, eic: { type: "check" }, category: "fiscale" },
  { feature: "Bonus 110 / PNRR tracking", primus: { type: "partial" }, teamsystem: { type: "partial" }, eic: { type: "check" }, category: "fiscale" },
  { feature: "Prezzari DEI integrati", primus: { type: "check" }, teamsystem: { type: "partial" }, eic: { type: "check" }, category: "cantieri" },
  { feature: "App mobile offline", primus: { type: "cross" }, teamsystem: { type: "check" }, eic: { type: "check" }, category: "mobile" },
  { feature: "Setup in 48h", primus: { type: "cross" }, teamsystem: { type: "cross" }, eic: { type: "check" }, category: "cantieri" },
  { feature: "Supporto italiano WhatsApp", primus: { type: "cross" }, teamsystem: { type: "cross" }, eic: { type: "check" }, category: "altro" },
  { feature: "Garanzia rimborso", primus: { type: "cross" }, teamsystem: { type: "cross" }, eic: { type: "check" }, category: "altro" },
  { feature: "Prezzo", primus: { type: "text", text: "Da €85/mese (modulare)" }, teamsystem: { type: "text", text: "Da €250/mese" }, eic: { type: "text", text: "Da €127/mese" }, category: "prezzo" },
];

const FILTERS: { label: string; value: RowCategory | "all" }[] = [
  { label: "Tutto", value: "all" },
  { label: "Fiscale", value: "fiscale" },
  { label: "Cantieri", value: "cantieri" },
  { label: "AI", value: "ai" },
  { label: "Mobile", value: "mobile" },
  { label: "Prezzo", value: "prezzo" },
];

const faqItems = [
  {
    q: "Qual è il miglior gestionale per imprese edili 2026?",
    a: "Per le PMI edili italiane (200K-5M di fatturato) Edilizia in Cloud è la scelta più completa nel 2026: nativo per il settore, AI per i margini, SDI/Cassa Edile/DURC integrati e prezzo da €127/mese. Primus ACCA resta forte sul computo metrico, TeamSystem Construction su grandi imprese strutturate.",
  },
  {
    q: "Edilizia in Cloud è meglio di Primus?",
    a: "Sono due strumenti diversi. Primus ACCA è eccellente per computi metrici e preventivi tecnici (~85-95€/mese modulare). Edilizia in Cloud copre l'intero ciclo della commessa: cantieri, margini real-time, fatturazione SDI, HR, CRM, AI. Se gestisci cantieri attivi e personale, Edilizia in Cloud è più completo.",
  },
  {
    q: "Che differenza c'è tra Edilizia in Cloud e Pillar?",
    a: "Edilizia in Cloud e Pillar sono entrambi gestionali con AI integrata, ma partono da problemi diversi. Pillar nasce sul controllo documentale e sulla compliance. Edilizia in Cloud usa l'AI sul conto economico della commessa: calcola il margine reale incrociando rapportini, ordini a fornitore e fatture, e avvisa quando scende. Entrambi cloud, entrambi italiani.",
  },
  {
    q: "Edilizia in Cloud è un'alternativa a PlanRadar?",
    a: "Solo in parte, perché coprono fasi diverse. PlanRadar è specializzato nella documentazione di cantiere: rilievi, difetti, foto georeferenziate, verbali. Edilizia in Cloud gestisce l'intera commessa, dal preventivo alla fattura, includendo rapportini e stato avanzamento lavori. Chi cerca solo il rilievo fotografico resta su PlanRadar; chi vuole anche i numeri della commessa usa Edilizia in Cloud.",
  },
  {
    q: "Conviene passare da Dylog Edilizia a un gestionale cloud?",
    a: "Dipende da dove lavori. Dylog Edilizia è un gestionale storico installato sul computer dell'ufficio: solido sulla contabilità, ma raggiungibile solo da quella postazione. Edilizia in Cloud è nativo cloud: il capocantiere aggiorna dal telefono e i dati sono immediatamente in ufficio. La migrazione delle anagrafiche è assistita e gratuita.",
  },
  {
    q: "Posso migrare da Excel a Edilizia in Cloud?",
    a: "Sì. Il team di onboarding importa gratuitamente cantieri, clienti, fornitori e storico da qualsiasi file Excel. La migrazione standard si chiude in 48 ore senza interrompere l'operatività dell'impresa.",
  },
  {
    q: "Quanto costa un gestionale edilizia nel 2026?",
    a: "I prezzi medi di mercato: Excel 0€ ma con costo nascosto di ~2.000€/mese in ore amministrative; Primus ACCA da ~85€/mese (modulare); Edilnet ~150-200€/mese più 2.000-5.000€ di setup; TeamSystem Construction 250-400€/mese; Buildertrend ~370€/mese (in inglese). Edilizia in Cloud parte da 127€/mese all-inclusive (99€/mese su base annuale).",
  },
  {
    q: "Esiste un'alternativa cloud a TeamSystem Construction?",
    a: "Sì: Edilizia in Cloud è l'alternativa cloud-nativa a TeamSystem Construction per le PMI edili. Stesso copertura su SDI/CCNL/Cassa Edile, più funzionalità native per il cantiere, AI inclusa, setup in 48h invece che 4-12 settimane e canone da 127€/mese contro i 250-400€/mese di TeamSystem.",
  },
  {
    q: "Edilizia in Cloud gestisce il DURC e la Cassa Edile?",
    a: "Sì. Edilizia in Cloud integra nativamente DURC, Cassa Edile (MUT), CCNL edilizia, contributi INPS settore costruzioni, F24, reverse charge edilizia e tracking dei bonus 110/PNRR. Tutto incluso nel canone, senza moduli aggiuntivi.",
  },
  {
    q: "Posso integrare Edilizia in Cloud con il mio ERP attuale?",
    a: "Dipende dall'ERP. Offriamo API aperte e connettori nativi per i principali sistemi contabili italiani. Il team tecnico valuta gratuitamente la fattibilità prima della firma di qualsiasi contratto.",
  },
  {
    q: "Avete un periodo di prova gratuito?",
    a: "Sì. Demo personalizzata gratuita (30 minuti con un consulente del controllo) e 31 giorni di accesso completo. Nessuna carta richiesta, cancelli quando vuoi.",
  },
];

export default function Confronto() {
  const [activeSection, setActiveSection] = useState("excel");
  const [openFaq, setOpenFaq] = useState<number | null>(null);
  const [filter, setFilter] = useState<RowCategory | "all">("all");

  useSEO({
    title: "Confronto Software Gestionale Edilizia 2026",
    description: "Edilizia in Cloud a confronto con PriMus, TeamSystem, Edilnet, Buildertrend, PlanRadar, Dylog ed Excel: funzioni, fiscale italiano e uso in cantiere.",
    canonical: "/confronto",
    keywords: "confronto software gestionale edilizia, edilizia in cloud vs primus, edilizia in cloud vs teamsystem, edilizia in cloud vs pillar, edilizia in cloud vs planradar, alternativa ERP edilizia, miglior gestionale imprese edili 2026",
  });

  useEffect(() => {
    const sectionIds = ["excel", "erp", "commercialista", "concorrenti"];
    const observers: IntersectionObserver[] = [];

    sectionIds.forEach((id) => {
      const el = document.getElementById(id);
      if (!el) return;
      const obs = new IntersectionObserver(
        ([entry]) => {
          if (entry.isIntersecting) setActiveSection(id);
        },
        { threshold: 0.3 }
      );
      obs.observe(el);
      observers.push(obs);
    });

    return () => observers.forEach((o) => o.disconnect());
  }, []);

  const scrollTo = (id: string) => {
    document.getElementById(id)?.scrollIntoView({ behavior: "smooth" });
  };

  const filteredConcorrentiRows =
    filter === "all" ? concorrentiRows : concorrentiRows.filter((r) => r.category === filter);

  return (
    <div className="min-h-screen bg-white text-[#111111] overflow-x-hidden">
      <HubSeoSchema
        pageName="Confronto Software"
        pagePath="/confronto"
        pageDescription="Confronta Edilizia in Cloud con Primus, Edilnet, TeamSystem, Buildertrend ed Excel: funzionalità, prezzo, supporto."
        breadcrumbs={[
          { name: "Home", url: "/" },
          { name: "Confronto Software", url: "/confronto" },
        ]}
      />
      <JsonLd id="jsonld-breadcrumb-confronto" data={{
        "@context": "https://schema.org",
        "@type": "BreadcrumbList",
        "itemListElement": [
          { "@type": "ListItem", "position": 1, "name": "Home", "item": "https://www.ediliziaincloud.com/" },
          { "@type": "ListItem", "position": 2, "name": "Confronto Software Edilizia", "item": "https://www.ediliziaincloud.com/confronto" }
        ]
      }} />
      <JsonLd id="jsonld-faq-confronto" data={{
        "@context": "https://schema.org",
        "@type": "FAQPage",
        "mainEntity": faqItems.map((item) => ({
          "@type": "Question",
          "name": item.q,
          "acceptedAnswer": { "@type": "Answer", "text": item.a },
        })),
      }} />
      {/* Nodo software: STESSO @id della home. Un @id diverso spaccherebbe
          l'entità in due invece di consolidarla, e i motori generativi non
          riconcilierebbero questa pagina con il prodotto già noto (Wikidata). */}
      <JsonLd id="jsonld-software-confronto" data={{
        "@context": "https://schema.org",
        "@type": "SoftwareApplication",
        "@id": "https://www.ediliziaincloud.com/#software",
        "name": "Edilizia in Cloud",
        "applicationCategory": "BusinessApplication",
        "applicationSubCategory": "Construction Management Software",
        "operatingSystem": "Web, iOS, Android",
        "description": "Gestionale cloud per imprese edili italiane: preventivi, cantieri, margini in tempo reale, fatturazione elettronica SDI, subappalti e rapportini da mobile.",
        "inLanguage": "it-IT",
        "sameAs": [WIKIDATA_ENTITY],
        // Rating e prezzi ripresi TALI E QUALI dal nodo software della home:
        // stesso @id, quindi valori divergenti darebbero un'entità che si
        // contraddice da sola agli occhi di Google e dei motori generativi.
        "offers": {
          "@type": "AggregateOffer",
          "priceCurrency": "EUR",
          "lowPrice": "99",
          "highPrice": "437",
          "offerCount": "3",
        },
        "aggregateRating": {
          "@type": "AggregateRating",
          "ratingValue": "4.9",
          "reviewCount": "127",
          "bestRating": "5",
          "worstRating": "1",
        },
        "publisher": { "@id": "https://www.ediliziaincloud.com/#organization" },
      }} />
      <JsonLd id="jsonld-itemlist-confronto" data={{
        "@context": "https://schema.org",
        "@type": "ItemList",
        "name": "Confronto Edilizia in Cloud con le Alternative",
        "description": "Confronto dettagliato tra Edilizia in Cloud e i principali software gestionali per imprese edili: Primus, Edilnet, TeamSystem, Buildertrend, Excel.",
        "url": "https://www.ediliziaincloud.com/confronto",
        "numberOfItems": 5,
        "itemListElement": [
          {
            "@type": "ListItem",
            "position": 1,
            "name": "Edilizia in Cloud vs Primus ACCA",
            "url": "https://www.ediliziaincloud.com/confronto/vs-primus",
            "item": {
              "@type": "Article",
              "name": "Edilizia in Cloud vs Primus ACCA: Confronto Completo 2026",
              "description": "Confronto dettagliato tra Edilizia in Cloud e Primus ACCA: funzionalità, prezzi, facilità d'uso e supporto.",
              "url": "https://www.ediliziaincloud.com/confronto/vs-primus"
            }
          },
          {
            "@type": "ListItem",
            "position": 2,
            "name": "Edilizia in Cloud vs Edilnet",
            "url": "https://www.ediliziaincloud.com/confronto/vs-edilnet",
            "item": {
              "@type": "Article",
              "name": "Edilizia in Cloud vs Edilnet: Confronto Completo 2026",
              "description": "Confronto dettagliato tra Edilizia in Cloud e Edilnet per imprese edili italiane.",
              "url": "https://www.ediliziaincloud.com/confronto/vs-edilnet"
            }
          },
          {
            "@type": "ListItem",
            "position": 3,
            "name": "Edilizia in Cloud vs TeamSystem Construction",
            "url": "https://www.ediliziaincloud.com/confronto/vs-teamsystem",
            "item": {
              "@type": "Article",
              "name": "Edilizia in Cloud vs TeamSystem Construction: Confronto Completo 2026",
              "description": "Confronto tra Edilizia in Cloud e TeamSystem Construction per la gestione delle imprese edili.",
              "url": "https://www.ediliziaincloud.com/confronto/vs-teamsystem"
            }
          },
          {
            "@type": "ListItem",
            "position": 4,
            "name": "Edilizia in Cloud vs Excel",
            "url": "https://www.ediliziaincloud.com/confronto/vs-excel",
            "item": {
              "@type": "Article",
              "name": "Edilizia in Cloud vs Excel: Perché il Foglio di Calcolo Non Basta",
              "description": "Perché Excel non è sufficiente per gestire un'impresa edile moderna e come passare a un gestionale specifico.",
              "url": "https://www.ediliziaincloud.com/confronto/vs-excel"
            }
          },
          {
            "@type": "ListItem",
            "position": 5,
            "name": "Edilizia in Cloud vs Buildertrend",
            "url": "https://www.ediliziaincloud.com/confronto/vs-buildertrend",
            "item": {
              "@type": "Article",
              "name": "Edilizia in Cloud vs Buildertrend: Alternativa Italiana 2026",
              "description": "Buildertrend è americano: niente SDI, niente Cassa Edile, niente italiano. Ecco il confronto con Edilizia in Cloud.",
              "url": "https://www.ediliziaincloud.com/confronto/vs-buildertrend"
            }
          }
        ]
      }} />
      <LandingNavbar />

      {/* ── HERO ── */}
      <section
        className="pt-36 pb-20 px-4 text-center"
        style={{ background: "linear-gradient(160deg, #111111 0%, #111111 100%)" }}
      >
        <div className="max-w-3xl mx-auto">
          <span className="inline-block bg-[#F97415]/20 text-[#F97415] text-xs font-bold tracking-widest uppercase px-4 py-1.5 rounded-full mb-6 border border-[#F97415]/30">
            CONFRONTO ONESTO
          </span>
          <h1 className="text-3xl md:text-5xl font-extrabold text-white leading-tight mb-4">
            Edilizia in Cloud vs.{" "}
            <span className="text-[#F97415]">le Alternative</span>
          </h1>
          <p className="text-lg text-blue-100/80 mb-10 max-w-xl mx-auto">
            Confronto onesto e dettagliato. Senza marketing. Decide tu.
          </p>

          {/* Tab pills */}
          <div className="flex flex-wrap gap-3 justify-center">
            {TABS.map((tab) => (
              <button
                key={tab.id}
                onClick={() => scrollTo(tab.id)}
                className={`px-5 py-2.5 rounded-full text-sm font-semibold transition-all duration-200 border ${
                  activeSection === tab.id
                    ? "bg-[#F97415] text-white border-[#F97415] shadow-lg shadow-[#F97415]/30"
                    : "bg-white/10 text-white border-white/20 hover:bg-white/20"
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>
      </section>

      {/* ── TUTTI I CONFRONTI ──
          Un blocco solo. Prima erano due sezioni separate e Pillar, PlanRadar
          e Dylog finivano in un riquadro secondario: chi arrivava cercando
          proprio quelli trovava contenuti di serie B invece della risposta. */}
      <section className="bg-white py-10 px-4 border-b border-gray-100">
        <div className="max-w-6xl mx-auto">
          <h2 className="text-center text-xl md:text-2xl font-bold text-[#111111] mb-3">
            Confronta Edilizia in Cloud con il software che usi oggi
          </h2>
          {/* Answer block: deve reggere da solo se un motore generativo lo
              estrae senza il contesto intorno — soggetto esplicito, niente
              pronomi vaghi, nomi dei competitor per esteso. */}
          <p className="text-center text-sm md:text-base text-[#111111]/70 mb-4 max-w-3xl mx-auto leading-relaxed">
            Edilizia in Cloud è messo a confronto con otto alternative usate dalle imprese edili
            italiane: Primus ACCA, TeamSystem Construction, Edilnet, Buildertrend, Excel, Pillar,
            PlanRadar e Dylog Edilizia. Ogni confronto dice anche quando conviene l'altro software,
            in base a come lavora l'impresa.
          </p>
          {/* Densità statistica (criterio GEO): numeri verificabili invece di
              aggettivi. Voto e prezzi sono gli STESSI dichiarati in home. */}
          <ul className="mb-7 flex flex-wrap items-center justify-center gap-x-5 gap-y-2 text-xs md:text-sm text-[#111111]/70">
            <li className="flex items-center gap-1.5">
              <CheckCircle2 className="h-4 w-4 shrink-0 text-[#F97415]" />
              <span><strong className="text-[#111111]">4,9/5</strong> su 127 recensioni</span>
            </li>
            <li className="flex items-center gap-1.5">
              <CheckCircle2 className="h-4 w-4 shrink-0 text-[#F97415]" />
              <span>SAL aggiornato dal cantiere in <strong className="text-[#111111]">pochi secondi</strong></span>
            </li>
            <li className="flex items-center gap-1.5">
              <CheckCircle2 className="h-4 w-4 shrink-0 text-[#F97415]" />
              <span>Operativo in <strong className="text-[#111111]">48 ore</strong>, migrazione inclusa</span>
            </li>
            <li className="flex items-center gap-1.5">
              <CheckCircle2 className="h-4 w-4 shrink-0 text-[#F97415]" />
              <span>Da <strong className="text-[#111111]">€127/mese</strong> (€99 su base annuale)</span>
            </li>
          </ul>

          {/* Panoramica di mercato: intercetta chi non ha ancora un nome in testa */}
          <Link
            to="/blog/migliori-software-gestionali-edilizia-confronto"
            className="group mb-4 flex flex-col gap-2 rounded-2xl border border-[#F97415]/40 bg-[#F97415]/5 p-5 transition-all hover:shadow-md sm:flex-row sm:items-center sm:justify-between sm:gap-6"
          >
            <div className="min-w-0">
              <span className="mb-1.5 inline-flex w-fit items-center rounded-full bg-[#F97415]/15 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-[#F97415]">
                Panoramica di mercato
              </span>
              <p className="text-base font-bold leading-snug text-[#111111] group-hover:text-[#F97415]">
                I migliori software gestionali per l'edilizia nel 2026
              </p>
              <p className="mt-1 text-sm leading-relaxed text-[#111111]/65">
                Non sai da quale partire? Qui c'è chi fa cosa, e per che tipo di impresa.
              </p>
            </div>
            <span className="inline-flex shrink-0 items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-[#F97415]">
              Leggi l'analisi <ArrowRight className="h-4 w-4" />
            </span>
          </Link>

          {/* Mobile: una colonna piena, tap target ampio. Da sm in poi due, da
              lg quattro — otto card fanno due righe pulite senza orfani. */}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {TUTTI_I_CONFRONTI.map((v) => (
              <Link
                key={v.to}
                to={v.to}
                className="group flex min-h-[132px] flex-col gap-2 rounded-xl border border-gray-200 bg-white p-4 transition-all hover:border-[#F97415] hover:shadow-md"
              >
                <span className="text-sm font-bold leading-snug text-[#111111] group-hover:text-[#F97415]">
                  {v.name}
                </span>
                <span className="flex-1 text-xs leading-relaxed text-[#111111]/60">{v.tagline}</span>
                <span className="mt-1 inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider text-[#F97415]">
                  {v.approfondito ? "Leggi l'analisi" : "Apri confronto"}
                  <ArrowRight className="h-3 w-3" />
                </span>
              </Link>
            ))}
          </div>

          {/* Obiezione migrazione: il confronto convince, il passaggio spaventa */}
          <div className="mt-6 flex flex-col items-center justify-between gap-3 rounded-2xl border border-[#F97415]/25 bg-[#F97415]/5 px-5 py-4 text-center sm:flex-row sm:text-left">
            <p className="text-sm text-[#111111]">
              <strong>Usi già uno di questi software?</strong> La migrazione è assistita e gratuita:
              importiamo anagrafiche, preventivi, fatture e cantieri, con setup in 48 ore.
            </p>
            <Link
              to="/pianifica-migrazione/"
              className="inline-flex shrink-0 items-center gap-1.5 rounded-xl bg-[#F97415] px-4 py-2.5 text-sm font-bold text-white transition-colors hover:bg-[#e8650e]"
            >
              Come funziona la migrazione <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        </div>
      </section>

      {/* ── TL;DR BOX ── */}
      <section className="bg-white pt-10 pb-4 px-4">
        <div className="max-w-4xl mx-auto">
          <div className="rounded-2xl border-l-4 border-[#F97415] bg-[#F97415]/5 p-6 md:p-7">
            <p className="text-xs font-bold tracking-widest uppercase text-[#F97415] mb-3">TL;DR — 3 differenze chiave</p>
            <p className="text-[#111111] text-sm md:text-base leading-relaxed">
              <strong>(1)</strong> Edilizia in Cloud include AI per analisi margini in tempo reale, mentre Primus, TeamSystem ed Edilnet richiedono moduli aggiuntivi.{" "}
              <strong>(2)</strong> Setup in 48 ore garantito vs 4-12 settimane dei concorrenti.{" "}
              <strong>(3)</strong> Prezzo a partire da 127€/mese all-inclusive, contro 250-400€/mese di TeamSystem Construction e configurazione iniziale 2.000-5.000€ dei competitor on-premise.
            </p>
          </div>
        </div>
      </section>

      {/* ── SEZIONE vs EXCEL ── */}
      <section id="excel" className="py-20 bg-white px-4">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-10">
            <h2 className="text-3xl md:text-4xl font-extrabold text-[#111111] mb-3">
              Edilizia in Cloud vs.{" "}
              <span className="text-[#F97415]">Excel</span>
            </h2>
            <p className="text-lg text-gray-600 max-w-2xl mx-auto">
              Excel non è colpa tua. Ma ti sta costando più di quanto pensi.
            </p>
          </div>

          {/* Pain point box */}
          <div
            className="rounded-xl p-5 md:p-6 mb-10 border-l-4 border-[#ffc107]"
            style={{ background: "#fff3cd" }}
          >
            <p className="text-[#111111] font-medium text-sm md:text-base">
              <span className="font-bold text-[#856404]">Il 78% delle PMI edili italiane</span> gestisce i cantieri con Excel. Il problema non è Excel — il problema è che{" "}
              <strong>Excel non ti avvisa quando stai perdendo soldi.</strong>
            </p>
          </div>

          {/* Comparison table */}
          <p className="mb-2 flex items-center justify-end gap-1 text-[11px] font-medium text-gray-400 md:hidden">
            Scorri la tabella per vedere tutte le colonne <span aria-hidden="true">→</span>
          </p>
          <div className="overflow-x-auto rounded-2xl border border-gray-200 shadow-sm mb-10">
            <table className="w-full min-w-[640px]">
              <thead className="sticky top-0 z-10 bg-white">
                <tr className="border-b border-gray-200">
                  <th className="text-left p-4 text-sm font-semibold text-gray-500 w-2/5 bg-white">Funzionalità</th>
                  <th className="text-center p-4 text-sm font-semibold text-gray-700 w-[30%] bg-white">Excel</th>
                  <th className="text-center p-4 text-sm font-bold text-[#F97415] w-[30%] bg-[#F97415]/5 border-l-2 border-[#F97415]">
                    Edilizia in Cloud
                  </th>
                </tr>
              </thead>
              <tbody>
                {excelRows.map((row, i) => (
                  <tr key={i} className={`border-b border-gray-100 ${i % 2 === 0 ? "bg-white" : "bg-gray-50/50"}`}>
                    <td className="p-4 text-sm font-medium text-[#111111]">{row.feature}</td>
                    <td className="p-4 text-center">
                      <Cell cell={row.excel} />
                    </td>
                    <td className="p-4 text-center bg-[#F97415]/5 border-l-2 border-[#F97415]">
                      <Cell cell={row.eic} highlight />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Hidden cost box */}
          <div className="rounded-2xl p-6 md:p-8 mb-10" style={{ background: "#f8fafb" }}>
            <h3 className="text-lg font-bold text-[#111111] mb-4">
              Calcola il costo reale di Excel per la tua impresa
            </h3>
            <div className="space-y-2 text-sm text-gray-700 mb-4">
              <div className="flex items-start gap-2">
                <span className="text-[#F97415] font-bold mt-0.5">•</span>
                <span>10 ore/settimana media spese su fogli Excel</span>
              </div>
              <div className="flex items-start gap-2">
                <span className="text-[#F97415] font-bold mt-0.5">•</span>
                <span>Costo medio imprenditore: <strong>€50/ora</strong></span>
              </div>
              <div className="flex items-start gap-2">
                <span className="text-[#F97415] font-bold mt-0.5">•</span>
                <span>= <strong className="text-[#111111] text-base">€500/settimana = €2.000/mese = €24.000/anno</strong></span>
              </div>
            </div>
            <p className="text-sm text-gray-500 italic">Solo per "usare Excel gratis".</p>
          </div>

          <div className="text-center">
            <button
              onClick={openModal}
              className="inline-flex items-center gap-2 bg-[#F97415] hover:bg-[#e8650e] text-white font-bold px-8 py-4 rounded-xl transition-colors shadow-lg shadow-[#F97415]/20 text-base"
            >
              Smetti di usare Excel. Inizia gratis.
              <ArrowRight className="w-5 h-5" />
            </button>
          </div>
        </div>
      </section>

      {/* ── SEZIONE vs ERP ── */}
      <section id="erp" className="py-20 px-4" style={{ background: "#f7f9fc" }}>
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-10">
            <h2 className="text-3xl md:text-4xl font-extrabold text-[#111111] mb-3">
              Edilizia in Cloud vs.{" "}
              <span className="text-[#F97415]">ERP Generici</span>
            </h2>
            <p className="text-lg text-gray-600 max-w-2xl mx-auto">
              SAP, Zucchetti, TeamSystem e simili sono potenti. Ma non parlano la lingua del cantiere.
            </p>
          </div>

          <p className="mb-2 flex items-center justify-end gap-1 text-[11px] font-medium text-gray-400 md:hidden">
            Scorri la tabella per vedere tutte le colonne <span aria-hidden="true">→</span>
          </p>
          <div className="overflow-x-auto rounded-2xl border border-gray-200 shadow-sm mb-10 bg-white">
            <table className="w-full min-w-[580px]">
              <thead className="sticky top-0 z-10 bg-white">
                <tr className="border-b border-gray-200">
                  <th className="text-left p-4 text-sm font-semibold text-gray-500 w-2/5 bg-white">Funzionalità</th>
                  <th className="text-center p-4 text-sm font-semibold text-gray-700 w-[30%] bg-white">ERP Generici</th>
                  <th className="text-center p-4 text-sm font-bold text-[#F97415] w-[30%] bg-[#F97415]/5 border-l-2 border-[#F97415]">
                    Edilizia in Cloud
                  </th>
                </tr>
              </thead>
              <tbody>
                {erpRows.map((row, i) => (
                  <tr key={i} className={`border-b border-gray-100 ${i % 2 === 0 ? "bg-white" : "bg-gray-50/50"}`}>
                    <td className="p-4 text-sm font-medium text-[#111111]">{row.feature}</td>
                    <td className="p-4 text-center">
                      <Cell cell={row.erp} />
                    </td>
                    <td className="p-4 text-center bg-[#F97415]/5 border-l-2 border-[#F97415]">
                      <Cell cell={row.eic} highlight />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Testimonial */}
          <div className="rounded-2xl border border-gray-200 bg-white p-6 md:p-8 mb-8 shadow-sm">
            <div className="flex items-start gap-4">
              <div className="w-10 h-10 rounded-full bg-[#F97415]/10 flex items-center justify-center shrink-0 mt-1">
                <span className="text-[#F97415] text-xl font-bold leading-none">"</span>
              </div>
              <div>
                <p className="text-gray-700 italic text-sm md:text-base leading-relaxed mb-4">
                  "Usavamo TeamSystem da 3 anni. Pagavamo €350/mese e avevamo bisogno di un consulente per ogni modifica. Con Edilizia in Cloud pago meno, faccio tutto da solo e i margini li vedo in tempo reale."
                </p>
                <p className="text-sm font-semibold text-[#111111]">
                  — Fratelli Conti Costruzioni, Napoli
                  <span className="font-normal text-gray-500 ml-1">· 3,5M di fatturato</span>
                </p>
              </div>
            </div>
          </div>

          {/* Savings box */}
          <div className="rounded-2xl bg-[#111111] text-white p-6 md:p-8 text-center">
            <p className="text-sm text-blue-200 mb-2 uppercase tracking-widest font-semibold">Risparmio medio</p>
            <p className="text-2xl md:text-3xl font-extrabold">
              €2.500 – €6.000<span className="text-[#F97415]">/anno</span>
            </p>
            <p className="text-blue-200 text-sm mt-2">passando da un ERP generico a Edilizia in Cloud</p>
          </div>
        </div>
      </section>

      {/* ── SEZIONE vs COMMERCIALISTA ── */}
      <section id="commercialista" className="py-20 bg-white px-4">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-10">
            <h2 className="text-3xl md:text-4xl font-extrabold text-[#111111] mb-3">
              Edilizia in Cloud vs.{" "}
              <span className="text-[#F97415]">Commercialista per il Controllo</span>
            </h2>
            <p className="text-lg text-gray-600 max-w-2xl mx-auto">
              Il commercialista è fondamentale per la contabilità. Ma non è il posto giusto per controllare i margini.
            </p>
          </div>

          {/* Visual diff box */}
          <div className="grid md:grid-cols-2 gap-0 rounded-2xl overflow-hidden border border-gray-200 shadow-sm mb-10">
            <div className="p-6 md:p-8 bg-gray-50">
              <h3 className="text-base font-bold text-gray-700 mb-5 flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-gray-400 inline-block" />
                Solo Commercialista
              </h3>
              <ul className="space-y-4 text-sm text-gray-700">
                <li>
                  <span className="font-semibold text-gray-900">Ti dice com'è andata</span>
                  <p className="text-gray-500">Report a consuntivo</p>
                </li>
                <li>
                  <span className="font-semibold text-gray-900">1-4 volte l'anno</span>
                  <p className="text-gray-500">Aggiornamenti periodici</p>
                </li>
                <li>
                  <span className="font-semibold text-gray-900">€12.000 – €36.000/anno</span>
                  <p className="text-gray-500">Per il controllo di gestione</p>
                </li>
                <li>
                  <span className="font-semibold text-gray-900">Non conosce il cantiere</span>
                  <p className="text-gray-500">Approccio generico</p>
                </li>
              </ul>
            </div>
            <div className="p-6 md:p-8 bg-[#F97415]/5 border-l-2 border-[#F97415]">
              <h3 className="text-base font-bold text-[#F97415] mb-5 flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-[#F97415] inline-block" />
                Edilizia in Cloud
              </h3>
              <ul className="space-y-4 text-sm text-[#111111]">
                <li>
                  <span className="font-semibold">Ti dice come sta andando</span>
                  <p className="text-gray-600">Dati in tempo reale</p>
                </li>
                <li>
                  <span className="font-semibold">365 giorni l'anno</span>
                  <p className="text-gray-600">Accesso continuo</p>
                </li>
                <li>
                  <span className="font-semibold">Da €127/mese (o €99/mese annuale)</span>
                  <p className="text-gray-600">Tutto incluso</p>
                </li>
                <li>
                  <span className="font-semibold">Pensato per il cantiere</span>
                  <p className="text-gray-600">Margini, costi, cassa — tutto nativo</p>
                </li>
              </ul>
            </div>
          </div>

          {/* Table */}
          <p className="mb-2 flex items-center justify-end gap-1 text-[11px] font-medium text-gray-400 md:hidden">
            Scorri la tabella per vedere tutte le colonne <span aria-hidden="true">→</span>
          </p>
          <div className="overflow-x-auto rounded-2xl border border-gray-200 shadow-sm mb-10">
            <table className="w-full min-w-[640px]">
              <thead className="sticky top-0 z-10">
                <tr className="border-b border-gray-200 bg-gray-50/95 backdrop-blur">
                  <th className="text-left p-4 text-sm font-semibold text-gray-500 w-2/5">Voce</th>
                  <th className="text-center p-4 text-sm font-semibold text-gray-700 w-[28%]">Solo Commercialista</th>
                  <th className="text-center p-4 text-sm font-bold text-[#F97415] w-[32%] bg-[#F97415]/5 border-l-2 border-[#F97415]">
                    EiC + Commercialista (contabilità)
                  </th>
                </tr>
              </thead>
              <tbody>
                {commercialistaRows.map((row, i) => (
                  <tr key={i} className={`border-b border-gray-100 ${i % 2 === 0 ? "bg-white" : "bg-gray-50/50"}`}>
                    <td className="p-4 text-sm font-medium text-[#111111]">{row.feature}</td>
                    <td className="p-4 text-center">
                      <Cell cell={row.solo} />
                    </td>
                    <td className="p-4 text-center bg-[#F97415]/5 border-l-2 border-[#F97415]">
                      <Cell cell={row.combined} highlight />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Key message */}
          <div className="rounded-2xl bg-[#111111] text-white p-6 md:p-8 text-center">
            <p className="text-lg md:text-xl font-bold leading-relaxed max-w-2xl mx-auto">
              "Non si tratta di sostituire il commercialista. Si tratta di{" "}
              <span className="text-[#F97415]">non aspettare fine anno</span> per scoprire se hai guadagnato."
            </p>
          </div>
        </div>
      </section>

      {/* ── SEZIONE vs CONCORRENTI ── */}
      <section id="concorrenti" className="py-20 px-4" style={{ background: "#f7f9fc" }}>
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-10">
            <h2 className="text-3xl md:text-4xl font-extrabold text-[#111111] mb-3">
              Edilizia in Cloud vs.{" "}
              <span className="text-[#F97415]">Primus ACCA & TeamSystem Construction</span>
            </h2>
            <p className="text-lg text-gray-600 max-w-2xl mx-auto">
              Esistono altri software per l'edilizia. Ecco perché i nostri clienti scelgono noi.
            </p>
          </div>

          {/* Filter chips */}
          <div className="flex flex-wrap gap-2 justify-center mb-6">
            {FILTERS.map((f) => (
              <button
                key={f.value}
                onClick={() => setFilter(f.value)}
                className={`px-4 py-1.5 rounded-full text-xs font-semibold border transition-all ${
                  filter === f.value
                    ? "bg-[#F97415] text-white border-[#F97415] shadow shadow-[#F97415]/20"
                    : "bg-white text-[#111111] border-gray-200 hover:border-[#F97415]/40"
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>

          <p className="mb-2 flex items-center justify-end gap-1 text-[11px] font-medium text-gray-400 md:hidden">
            Scorri la tabella per vedere tutte le colonne <span aria-hidden="true">→</span>
          </p>
          <div className="overflow-x-auto rounded-2xl border border-gray-200 shadow-sm mb-10 bg-white">
            <table className="w-full min-w-[700px]">
              <thead className="sticky top-0 z-10">
                <tr className="border-b border-gray-200 bg-gray-50/95 backdrop-blur">
                  <th className="text-left p-4 text-sm font-semibold text-gray-500" style={{ minWidth: "180px" }}>Funzionalità</th>
                  <th className="text-center p-4 text-sm font-semibold text-gray-700" style={{ minWidth: "140px" }}>
                    Primus ACCA
                    <span className="block text-xs font-normal text-gray-400">da €85/mese</span>
                  </th>
                  <th className="text-center p-4 text-sm font-semibold text-gray-700" style={{ minWidth: "140px" }}>
                    TeamSystem Construction
                    <span className="block text-xs font-normal text-gray-400">da €250/mese</span>
                  </th>
                  <th className="text-center p-4 text-sm font-bold text-[#F97415] bg-[#F97415]/5 border-l-2 border-[#F97415]" style={{ minWidth: "160px" }}>
                    Edilizia in Cloud
                    <span className="block text-xs font-normal text-[#F97415]/70">da €127/mese</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {filteredConcorrentiRows.map((row, i) => (
                  <tr
                    key={row.feature}
                    data-category={row.category}
                    className={`border-b border-gray-100 ${i % 2 === 0 ? "bg-white" : "bg-gray-50/30"}`}
                  >
                    <td className="p-4 text-sm font-medium text-[#111111]">{row.feature}</td>
                    <td className="p-4 text-center">
                      <Cell cell={row.primus} />
                    </td>
                    <td className="p-4 text-center">
                      <Cell cell={row.teamsystem} />
                    </td>
                    <td className="p-4 text-center bg-[#F97415]/5 border-l-2 border-[#F97415]">
                      <Cell cell={row.eic} highlight />
                    </td>
                  </tr>
                ))}
                {filteredConcorrentiRows.length === 0 && (
                  <tr>
                    <td colSpan={4} className="p-6 text-center text-sm text-gray-500">
                      Nessuna riga in questa categoria.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {/* Final diff box */}
          <div className="rounded-2xl border-2 border-[#F97415] bg-white p-6 md:p-8">
            <p className="text-sm font-bold text-[#F97415] uppercase tracking-widest mb-3">La differenza vera</p>
            <p className="text-[#111111] font-medium text-sm md:text-base leading-relaxed">
              Edilizia in Cloud ha più funzionalità a un prezzo inferiore di TeamSystem Construction (€250-400/mese) e copertura più ampia di Primus ACCA. Ma la differenza vera è questa:{" "}
              <strong>siamo gli unici ad avere un Consulente del Controllo dedicato incluso nel piano.</strong>
            </p>
          </div>
        </div>
      </section>

      {/* ── FAQ ── */}
      <section className="py-20 bg-white px-4">
        <div className="max-w-3xl mx-auto">
          <div className="text-center mb-12">
            <h2 className="text-3xl md:text-4xl font-extrabold text-[#111111] mb-3">
              Domande frequenti sul confronto
            </h2>
            <p className="text-gray-500 text-base">Risposte dirette alle obiezioni più comuni.</p>
          </div>

          <div className="space-y-3">
            {faqItems.map((item, i) => (
              <div
                key={i}
                className="rounded-xl border border-gray-200 overflow-hidden shadow-sm"
              >
                <button
                  className="w-full flex items-center justify-between p-5 text-left bg-white hover:bg-gray-50/70 transition-colors"
                  onClick={() => setOpenFaq(openFaq === i ? null : i)}
                >
                  <span className="font-semibold text-[#111111] text-sm md:text-base pr-4">{item.q}</span>
                  {openFaq === i ? (
                    <ChevronUp className="w-5 h-5 text-[#F97415] shrink-0" />
                  ) : (
                    <ChevronDown className="w-5 h-5 text-gray-400 shrink-0" />
                  )}
                </button>
                {openFaq === i && (
                  <div className="px-5 pb-5 bg-white border-t border-gray-100">
                    <p className="text-sm text-gray-600 leading-relaxed pt-3">{item.a}</p>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── CONFRONTI SPECIFICI ── */}
      <section className="py-16 px-6 bg-gray-50">
        <div className="max-w-4xl mx-auto">
          <div className="text-center mb-10">
            <h2 className="text-2xl md:text-3xl font-extrabold text-[#111111] mb-3">
              Confronto diretto per software
            </h2>
            <p className="text-[#111111]/60 text-sm max-w-lg mx-auto">
              Analisi feature-by-feature con i competitor più cercati dalle imprese edili italiane.
            </p>
          </div>
          <div className="grid sm:grid-cols-2 gap-5">
            <Link
              to="/confronto/vs-primus/"
              className="group flex flex-col gap-3 rounded-2xl border border-gray-200 bg-white hover:border-[#F97415]/40 p-6 transition-all hover:shadow-md hover:-translate-y-0.5"
            >
              <h3 className="font-bold text-[#111111] text-base group-hover:text-[#F97415] transition-colors">
                Edilizia in Cloud vs Primus ACCA
              </h3>
              <p className="text-sm text-[#111111]/60 leading-relaxed">
                Confronto completo su gestione cantieri, preventivi, fatturazione e assistenza clienti.
              </p>
              <span className="inline-flex items-center gap-1 text-xs font-semibold text-[#F97415] mt-auto">
                Leggi il confronto <ArrowRight className="w-3.5 h-3.5" />
              </span>
            </Link>
            <Link
              to="/confronto/vs-edilnet/"
              className="group flex flex-col gap-3 rounded-2xl border border-gray-200 bg-white hover:border-[#F97415]/40 p-6 transition-all hover:shadow-md hover:-translate-y-0.5"
            >
              <h3 className="font-bold text-[#111111] text-base group-hover:text-[#F97415] transition-colors">
                Edilizia in Cloud vs Edilnet
              </h3>
              <p className="text-sm text-[#111111]/60 leading-relaxed">
                Differenze su prezzo, funzionalità cloud, app mobile e qualità del supporto.
              </p>
              <span className="inline-flex items-center gap-1 text-xs font-semibold text-[#F97415] mt-auto">
                Leggi il confronto <ArrowRight className="w-3.5 h-3.5" />
              </span>
            </Link>
            <Link
              to="/confronto/vs-teamsystem/"
              className="group flex flex-col gap-3 rounded-2xl border border-gray-200 bg-white hover:border-[#F97415]/40 p-6 transition-all hover:shadow-md hover:-translate-y-0.5"
            >
              <h3 className="font-bold text-[#111111] text-base group-hover:text-[#F97415] transition-colors">
                Edilizia in Cloud vs TeamSystem Construction
              </h3>
              <p className="text-sm text-[#111111]/60 leading-relaxed">
                ERP generalista vs gestionale nativo edilizia: funzionalità, prezzo e semplicità d'uso a confronto.
              </p>
              <span className="inline-flex items-center gap-1 text-xs font-semibold text-[#F97415] mt-auto">
                Leggi il confronto <ArrowRight className="w-3.5 h-3.5" />
              </span>
            </Link>
            <Link
              to="/confronto/vs-excel/"
              className="group flex flex-col gap-3 rounded-2xl border border-gray-200 bg-white hover:border-[#F97415]/40 p-6 transition-all hover:shadow-md hover:-translate-y-0.5"
            >
              <h3 className="font-bold text-[#111111] text-base group-hover:text-[#F97415] transition-colors">
                Edilizia in Cloud vs Excel
              </h3>
              <p className="text-sm text-[#111111]/60 leading-relaxed">
                Il vero costo nascosto di gestire i cantieri con i fogli di calcolo. Confronto completo 2026.
              </p>
              <span className="inline-flex items-center gap-1 text-xs font-semibold text-[#F97415] mt-auto">
                Leggi il confronto <ArrowRight className="w-3.5 h-3.5" />
              </span>
            </Link>
            <Link
              to="/confronto/vs-buildertrend/"
              className="group flex flex-col gap-3 rounded-2xl border border-gray-200 bg-white hover:border-[#F97415]/40 p-6 transition-all hover:shadow-md hover:-translate-y-0.5"
            >
              <h3 className="font-bold text-[#111111] text-base group-hover:text-[#F97415] transition-colors">
                Edilizia in Cloud vs Buildertrend
              </h3>
              <p className="text-sm text-[#111111]/60 leading-relaxed">
                Software americano vs gestionale italiano: SDI, Cassa Edile, italiano e prezzo a confronto.
              </p>
              <span className="inline-flex items-center gap-1 text-xs font-semibold text-[#F97415] mt-auto">
                Leggi il confronto <ArrowRight className="w-3.5 h-3.5" />
              </span>
            </Link>
          </div>
        </div>
      </section>


      {/* ── CTA FINALE ── */}
      <section
        className="py-20 px-4 text-center"
        style={{ background: "#111111" }}
      >
        <div className="max-w-2xl mx-auto">
          <h2 className="text-3xl md:text-4xl font-extrabold text-white mb-4">
            Visto abbastanza?{" "}
            <span className="text-[#F97415]">Parliamo.</span>
          </h2>
          <p className="text-blue-200/80 text-base mb-8 max-w-md mx-auto">
            Demo gratuita e personalizzata. Nessun obbligo. Il nostro consulente del controllo ti mostra esattamente cosa cambierebbe nella tua impresa.
          </p>
          <button
            onClick={openModal}
            className="inline-flex items-center gap-2 bg-[#F97415] hover:bg-[#e8650e] text-white font-bold px-10 py-4 rounded-xl transition-colors shadow-xl shadow-[#F97415]/30 text-base"
          >
            Prenota la tua demo gratuita
            <ArrowRight className="w-5 h-5" />
          </button>
          <p className="text-blue-300/50 text-xs mt-5">Cancella quando vuoi · Risposta entro 2 ore · 31 giorni di prova completa</p>
        </div>
      </section>

      <LandingFooter />
    </div>
  );
}
