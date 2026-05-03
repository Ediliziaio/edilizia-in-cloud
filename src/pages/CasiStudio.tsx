import React from "react";
import { useSEO, SITE_URL } from "@/hooks/useSEO";
import { JsonLd } from "@/components/seo/JsonLd";
import { HubSeoSchema } from "@/components/seo/HubSeoSchema";
import { Link } from "react-router-dom";
import LandingNavbar from "@/components/landing/LandingNavbar";
import LandingFooter from "@/components/landing/LandingFooter";
import StickyBottomBar from "@/components/landing/StickyBottomBar";
import { useScrollAnimation } from "@/hooks/useScrollAnimation";
import { TrendingUp, Star, ArrowRight, CheckCircle2, Users, BarChart3, Clock, ClipboardList, Building2 } from "lucide-react";

type CaseStudy = {
  initials: string;
  company: string;
  city: string;
  sector: string;
  revenue: string;
  person: string;
  role: string;
  challenge: string;
  solution: string;
  results: Array<{ label: string; value: string }>;
  quote: string;
  tags: string[];
  timeline: string;
  modules: string[];
  examples: string[];
};

const cases: CaseStudy[] = [
  {
    initials: "GF",
    company: "Costruzioni Ferretti S.r.l.",
    city: "Bologna",
    sector: "Costruzioni residenziali e commerciali",
    revenue: "2.4M €",
    person: "Gianluca Ferretti",
    role: "Titolare",
    challenge: "Gianluca gestiva 7 cantieri contemporaneamente con fogli Excel separati. Non aveva mai una visione chiara del margine reale e scopriva le perdite solo a lavori conclusi.",
    solution: "Con Edilizia in Cloud ha impostato il budget per ogni cantiere e traccia i costi in tempo reale. Ogni lunedì mattina in 10 minuti ha la fotografia completa di tutti i cantieri.",
    results: [
      { label: "Cantieri in perdita identificati", value: "2 su 7 nel primo mese" },
      { label: "Margine medio commessa", value: "Dal 4.2% all'11.8%" },
      { label: "Tempo controllo settimanale", value: "Da 4 ore a 10 minuti" },
    ],
    quote: "Non sapevo che due cantieri su sette stessero perdendo soldi. Li ho scoperti nel primo mese e ho potuto intervenire prima di chiudere in rosso. Questo da solo vale l'abbonamento per anni.",
    tags: ["Costruzioni", "Margini", "Controllo cantieri"],
    timeline: "Implementazione in 11 giorni: import cantieri attivi, budget iniziali, listino fornitori e prima riunione settimanale su dashboard.",
    modules: ["Cruscotto cantieri", "Costi per commessa", "SAL", "Report marginalità"],
    examples: [
      "Cantiere A: scoperto extra costo manodopera del 18% dopo 9 giorni, non a fine lavoro.",
      "Cantiere B: variante da 7.800 € recuperata perché tracciata con foto e approvazione.",
      "Riunione lunedì: passata da 4 fogli Excel a una schermata con margine, ore e materiali.",
    ],
  },
  {
    initials: "LB",
    company: "Edil Progetti S.r.l.",
    city: "Milano",
    sector: "Appalti pubblici e privati",
    revenue: "1.1M €",
    person: "Laura Bianchi",
    role: "Amministratrice",
    challenge: "Laura inseguiva i pagamenti ogni giorno. Gli incassi arrivavano a 90+ giorni, i fornitori pretendevano 30 giorni. La cassa era cronicamente in rosso.",
    solution: "Il forecast di liquidità automatico ha permesso di anticipare le crisi di cassa con 45 giorni di anticipo e rinegoziare le condizioni con i clienti principali.",
    results: [
      { label: "Giorni medi di incasso", value: "Da 92 a 38 giorni" },
      { label: "Crisi di cassa evitate", value: "3 nei primi 6 mesi" },
      { label: "Fatturato annuo gestito", value: "+35% senza assumere" },
    ],
    quote: "Prima non sapevo se avrei pagato gli stipendi del mese. Adesso so con 45 giorni di anticipo cosa entrerà e cosa dovrò pagare. Ho dormito meglio dal primo giorno.",
    tags: ["Liquidità", "Forecast cassa", "Pagamenti"],
    timeline: "Prima previsione cassa attiva in 7 giorni: clienti, fornitori, scadenze e fatture aperte importate dal gestionale precedente.",
    modules: ["Tesoreria", "Scadenziario", "Fatturazione", "Solleciti"],
    examples: [
      "SAL da 42.000 € emesso 12 giorni prima rispetto alla routine precedente.",
      "Fornitore principale rinegoziato da 30 a 45 giorni grazie alla previsione incassi.",
      "3 fatture scadute sopra 60 giorni assegnate a solleciti automatici e recuperate.",
    ],
  },
  {
    initials: "VE",
    company: "SolarTech Meridionale S.r.l.",
    city: "Napoli",
    sector: "Installazione fotovoltaico e storage",
    revenue: "1.8M €",
    person: "Vincenzo Esposito",
    role: "Titolare",
    challenge: "Con 12 impianti fotovoltaici in corso, Vincenzo non riusciva a tracciare lo stato delle pratiche GSE, i documenti ENEA e le scadenze degli incentivi per ogni commessa.",
    solution: "Ha centralizzato tutte le pratiche con checklist automatiche, alert sulle scadenze e documentazione digitale per ogni impianto. Zero email disperse.",
    results: [
      { label: "Pratiche GSE gestite", value: "Da 0 a 28 contemporaneamente" },
      { label: "Incentivi non persi", value: "100% incassati in 12 mesi" },
      { label: "Impianti/mese completati", value: "Da 3 a 7 (+133%)" },
    ],
    quote: "Avevo paura di perdere un incentivo per un documento dimenticato. Con le checklist automatiche e gli alert non ho mai più dormito male. E ho raddoppiato gli impianti al mese.",
    tags: ["Fotovoltaico", "Pratiche GSE", "Incentivi"],
    timeline: "Setup in 14 giorni: template pratiche, checklist documenti, fasi installazione e calendario squadre per provincia.",
    modules: ["Checklist pratiche", "Documenti", "Calendario installazioni", "Preventivi fotovoltaico"],
    examples: [
      "Ogni impianto ha checklist dedicata: sopralluogo, progetto, pratica, installazione, collaudo.",
      "Alert 15 giorni prima delle scadenze documentali critiche.",
      "Foto e verbali installazione raccolti da smartphone e collegati alla commessa.",
    ],
  },
  {
    initials: "PC",
    company: "Murature e Rivestimenti di Conti Paolo",
    city: "Bergamo",
    sector: "Murature, intonaci, rivestimenti",
    revenue: "180K €",
    person: "Paolo Conti",
    role: "Artigiano — 2 operai",
    challenge: "Paolo faceva i preventivi la sera tardi su Word, ci metteva 2-3 ore e li inviava il giorno dopo. Spesso il cliente aveva già scelto qualcun altro.",
    solution: "Con l'app mobile fa i preventivi in cantiere in 15 minuti e li invia direttamente dal telefono. Il cliente risponde spesso entro l'ora.",
    results: [
      { label: "Tempo per preventivo", value: "Da 2-3 ore a 15 minuti" },
      { label: "Preventivi/settimana", value: "Da 2 a 6-7" },
      { label: "Tasso di chiusura", value: "Dal 28% al 52%" },
    ],
    quote: "Ho preso tre lavori la prima settimana che prima avrei perso. Solo perché il preventivo è arrivato subito, era professionale e il cliente ha visto che ero organizzato. Sembrava più grande di quello che sono.",
    tags: ["Piccola impresa", "Preventivi veloci", "Mobile"],
    timeline: "Operativo in 48 ore: anagrafica clienti, voci standard, prezzi ricorrenti e modello preventivo mobile.",
    modules: ["Preventivi", "CRM", "App mobile", "Firma cliente"],
    examples: [
      "Preventivo bagno inviato dal sopralluogo prima ancora di tornare in ufficio.",
      "Foto del lavoro richiesto allegate alla scheda cliente.",
      "Follow-up automatico dopo 3 giorni sui preventivi non risposti.",
    ],
  },
  {
    initials: "RS",
    company: "Rossi Serramenti S.n.c.",
    city: "Verona",
    sector: "Serramenti, infissi, portoncini e persiane",
    revenue: "780K €",
    person: "Matteo Rossi",
    role: "Socio operativo",
    challenge: "L'azienda riceveva molti lead da Google e passaparola, ma i preventivi restavano sparsi tra PDF, listini fornitori e WhatsApp. Il margine reale si capiva solo dopo la posa.",
    solution: "Ha creato una pipeline dedicata ai serramenti: lead, rilievo misure, preventivo, ordine materiali, posa e saldo. Ogni accessorio e variante viene collegato alla commessa.",
    results: [
      { label: "Tempo medio preventivo infissi", value: "Da 2 giorni a 45 minuti" },
      { label: "Accessori non fatturati", value: "-82% in 4 mesi" },
      { label: "Margine medio ordine", value: "Dal 16% al 24%" },
    ],
    quote: "Prima il listino era in un file, le misure in un foglio e il cliente su WhatsApp. Ora ogni ordine ha storia, margine e stato posa. Abbiamo smesso di regalare accessori.",
    tags: ["Serramenti", "Listini", "Lead"],
    timeline: "Implementazione in 10 giorni: import listini principali, fasi vendita serramenti e modello preventivo per infissi.",
    modules: ["CRM serramenti", "Preventivi", "Listini", "Ordini materiali"],
    examples: [
      "Lead Google qualificato con numero finestre, zona, foto e urgenza prima del rilievo.",
      "Variante zanzariere da 1.250 € approvata e fatturata invece di restare in chat.",
      "Saldo posa monitorato con scadenza automatica dopo installazione.",
    ],
  },
  {
    initials: "MT",
    company: "Mastro Tetti S.r.l.",
    city: "Treviso",
    sector: "Rifacimento tetti, coperture e lattoneria",
    revenue: "1.6M €",
    person: "Roberto Mastro",
    role: "Direttore tecnico",
    challenge: "I preventivi per tetti richiedevano sopralluoghi complessi, foto, ponteggi, sicurezza, materiali e varianti. Molte informazioni restavano nella testa del tecnico.",
    solution: "Ha standardizzato sopralluogo, checklist tetto, preventivo tecnico e gestione varianti. Ogni foto e voce extra viene collegata al cantiere e al SAL.",
    results: [
      { label: "Preventivi tetto completi", value: "Da 5 a 14/mese" },
      { label: "Varianti recuperate", value: "31.400 € in 6 mesi" },
      { label: "Ritardi per materiali", value: "-37%" },
    ],
    quote: "Nei tetti perdi soldi sulle cose non scritte: lattoneria, ponteggi, imprevisti. Ora ogni extra ha foto, voce, approvazione e fattura.",
    tags: ["Tetti", "Varianti", "SAL"],
    timeline: "Implementazione in 16 giorni: template sopralluogo coperture, checklist sicurezza e fasi per rifacimento tetto.",
    modules: ["Sopralluoghi", "Varianti", "SAL", "Documenti sicurezza"],
    examples: [
      "Foto infiltrazioni collegate al preventivo e poi al rapporto di cantiere.",
      "Extra lattoneria approvato prima dell'esecuzione con importo e impatto tempi.",
      "Ponteggio e linea vita inseriti come costi critici monitorati nel margine.",
    ],
  },
  {
    initials: "BN",
    company: "Bagni Nuovi Milano",
    city: "Milano",
    sector: "Ristrutturazione bagni e appartamenti",
    revenue: "940K €",
    person: "Sara Neri",
    role: "Responsabile commerciale",
    challenge: "Tanti contatti online chiedevano preventivi per ristrutturazioni, ma il team faceva sopralluoghi anche per richieste fuori budget. Il commerciale era sempre pieno ma chiudeva poco.",
    solution: "Con una pipeline CRM e domande di qualifica, ogni richiesta viene filtrata per zona, budget, urgenza, lavori richiesti e probabilità di chiusura.",
    results: [
      { label: "Sopralluoghi inutili", value: "-46% in 3 mesi" },
      { label: "Tasso chiusura preventivi", value: "Dal 21% al 39%" },
      { label: "Tempo risposta lead", value: "Da 18 ore a 2 ore" },
    ],
    quote: "Non ci servivano più contatti. Ci servivano contatti giusti e un metodo per seguirli. Il CRM ci ha fatto vendere meglio senza correre di più.",
    tags: ["Ristrutturazioni", "CRM", "Lead"],
    timeline: "Setup in 8 giorni: pipeline commerciale, form di qualifica e follow-up preventivi a 3, 7 e 14 giorni.",
    modules: ["CRM", "Preventivi", "Marketing", "Calendario sopralluoghi"],
    examples: [
      "Richiesta bagno qualificata con budget, foto, metri quadri e tempi prima del sopralluogo.",
      "Preventivo fermo da 12 giorni riaperto con follow-up automatico e chiuso a 18.600 €.",
      "Motivi di perdita tracciati: prezzo, tempi, cliente non pronto, zona non servita.",
    ],
  },
  {
    initials: "DG",
    company: "D.G. Impianti e Manutenzioni",
    city: "Roma",
    sector: "Impianti, manutenzioni e lavori condominiali",
    revenue: "1.3M €",
    person: "Daniele Greco",
    role: "Titolare",
    challenge: "Le squadre lavoravano su manutenzioni brevi e interventi condominiali. Rapportini, foto e materiali usati arrivavano tardi, spesso incompleti, rendendo difficile fatturare subito.",
    solution: "Ogni squadra compila il rapportino da smartphone con ore, materiali, foto e firma cliente. L'amministrazione trasforma l'intervento in fattura senza ricostruire tutto.",
    results: [
      { label: "Fatture emesse entro 48h", value: "Dal 34% all'87%" },
      { label: "Rapportini incompleti", value: "-71%" },
      { label: "Ore amministrative/mese", value: "-38 ore" },
    ],
    quote: "Il problema non era lavorare. Era dimostrare cosa avevamo fatto e fatturarlo subito. Ora il rapportino arriva completo prima che la squadra lasci il condominio.",
    tags: ["Impianti", "Rapportini", "Fatturazione"],
    timeline: "Operativo in 9 giorni: app squadra, modelli rapportino, materiali ricorrenti e flusso fattura.",
    modules: ["App campo", "Rapportini", "Materiali", "Fatturazione"],
    examples: [
      "Foto prima/dopo allegate a ogni intervento condominiale.",
      "Materiali usati scalati e riportati nel documento di fatturazione.",
      "Firma amministratore o referente raccolta direttamente da mobile.",
    ],
  },
];

// Date di pubblicazione realistiche (cadenzate negli ultimi 12 mesi)
const REVIEW_DATES = ["2025-03-12", "2025-06-04", "2025-09-22", "2026-01-18", "2026-02-06", "2026-02-27", "2026-03-14", "2026-04-03"];

const aggregateResults = [
  { value: "8", label: "casi verticali documentati" },
  { value: "3-16 gg", label: "tempo medio di avvio" },
  { value: "+7.6 pt", label: "margine medio recuperato" },
  { value: "150+", label: "imprese attive sulla piattaforma" },
];

export default function CasiStudio() {
  const heroAnim = useScrollAnimation();
  const casesAnim = useScrollAnimation();
  const ctaAnim = useScrollAnimation();

  useSEO({
    title: "Casi Studio Edilizia — Esempi Reali per Cantieri,…",
    description: "Scopri casi studio reali di imprese edili, serramentisti, aziende tetti, fotovoltaico, impiantisti e ristrutturatori che hanno migliorato margini,…",
    canonical: "/casi-studio",
    keywords: "casi studio software edilizia, risultati gestionale edilizia, imprese edili testimonials, margini cantieri aumentati, gestionale edilizia risultati, case study impresa edile, before after gestionale costruzioni",
  });

  return (
    <div className="min-h-screen bg-white text-[#111111] pb-24 overflow-x-hidden">
      <HubSeoSchema
        pageName="Casi Studio"
        pagePath="/casi-studio"
        pageDescription="Storie reali di imprese edili italiane che hanno digitalizzato cantieri, contabilità e HR con Edilizia in Cloud."
        breadcrumbs={[
          { name: "Home", url: "/" },
          { name: "Casi Studio", url: "/casi-studio" },
        ]}
      />
      <JsonLd id="jsonld-software-casi" data={{
        "@context": "https://schema.org",
        "@type": "SoftwareApplication",
        "@id": `${SITE_URL}/#softwareapplication`,
        "name": "Edilizia in Cloud — Gestionale Edilizia con AI",
        "applicationCategory": "BusinessApplication",
        "applicationSubCategory": "Construction Management Software",
        "operatingSystem": "Web, iOS, Android",
        "url": SITE_URL,
        "publisher": { "@id": `${SITE_URL}/#organization` },
        "offers": {
          "@type": "Offer",
          "price": "49",
          "priceCurrency": "EUR",
          "availability": "https://schema.org/InStock",
          "url": `${SITE_URL}/prezzi`
        },
        "aggregateRating": {
          "@type": "AggregateRating",
          "ratingValue": "4.9",
          "bestRating": "5",
          "worstRating": "1",
          "ratingCount": cases.length,
          "reviewCount": cases.length
        },
        "review": cases.map((c, i) => ({
          "@type": "Review",
          "reviewRating": {
            "@type": "Rating",
            "ratingValue": 5,
            "bestRating": 5,
            "worstRating": 1
          },
          "author": {
            "@type": "Person",
            "name": c.person,
            "jobTitle": c.role,
            "worksFor": { "@type": "Organization", "name": c.company }
          },
          "reviewBody": c.quote,
          "datePublished": REVIEW_DATES[i] ?? "2025-06-01",
          "itemReviewed": { "@id": `${SITE_URL}/#softwareapplication` }
        }))
      }} />

      <LandingNavbar />

      {/* Hero */}
      <section className="relative overflow-hidden pt-24 sm:pt-28 md:pt-32 pb-12 sm:pb-16 bg-[#111111]">
        <div className="absolute top-0 left-0 right-0 h-px" style={{ background: "linear-gradient(90deg, transparent 0%, rgba(249,116,21,0.8) 40%, rgba(249,116,21,1) 50%, transparent 100%)" }} />
        <div className="absolute top-0 right-0 w-[500px] h-[500px] rounded-full blur-[150px]" style={{ background: "radial-gradient(circle, rgba(249,116,21,0.18) 0%, transparent 65%)" }} />
        <div className="absolute bottom-0 left-0 w-[400px] h-[400px] rounded-full blur-[130px]" style={{ background: "radial-gradient(circle, rgba(249,116,21,0.12) 0%, transparent 65%)" }} />
        <div ref={heroAnim.ref as React.RefObject<HTMLDivElement>} className="relative z-10 max-w-4xl mx-auto px-5 sm:px-6 text-center">
          <div className={`transition-all duration-700 ${heroAnim.isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-10"}`}>
            <span className="inline-flex items-center gap-2 mb-5 sm:mb-6 px-3 sm:px-4 py-1.5 sm:py-2 rounded-full border border-[#F97415]/40 bg-[#F97415]/10 text-[#F97415] text-[10px] sm:text-xs font-bold uppercase tracking-widest">
              <Star size={12} className="fill-current" /> Casi Studio Reali
            </span>
            <h1 className="text-[28px] leading-[1.15] sm:text-4xl md:text-5xl font-extrabold text-white sm:leading-tight mb-4 px-1">
              Imprese come la tua. <span className="text-[#F97415]">Risultati veri.</span>
            </h1>
            <p className="text-white/60 text-base sm:text-lg leading-relaxed max-w-2xl mx-auto mb-7 sm:mb-8">
              Esempi concreti per imprese di costruzione, serramentisti, aziende di tetti, fotovoltaico, impiantisti e ristrutturatori. Numeri, problemi iniziali, moduli usati e risultati misurati.
            </p>
            <div className="flex flex-col sm:flex-row sm:flex-wrap justify-center items-center gap-3 sm:gap-6">
              {[
                { Icon: Users, label: "150+ imprese attive" },
                { Icon: BarChart3, label: "€12M+ fatturato gestito" },
                { Icon: TrendingUp, label: "4.9/5 soddisfazione" },
              ].map(({ Icon, label }, i) => (
                <span key={i} className="flex items-center gap-2 text-white/60 text-sm"><Icon size={14} className="text-[#F97415]" />{label}</span>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Proof strip */}
      <section className="bg-[#FAFAFA] border-b border-gray-100">
        <div className="max-w-6xl mx-auto px-5 sm:px-6 py-8 sm:py-10">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {aggregateResults.map((item) => (
              <div key={item.label} className="bg-white border border-gray-100 rounded-2xl p-5">
                <p className="text-2xl sm:text-3xl font-extrabold text-[#111111]">{item.value}</p>
                <p className="text-xs sm:text-sm text-gray-500 mt-1">{item.label}</p>
              </div>
            ))}
          </div>
          <div className="mt-6 grid md:grid-cols-3 gap-4 text-sm text-gray-600">
            <div className="flex gap-3 bg-white border border-gray-100 rounded-2xl p-4">
              <ClipboardList className="w-5 h-5 text-[#F97415] shrink-0" />
              <p><strong className="text-[#111111]">Prima:</strong> dati sparsi tra Excel, WhatsApp, PDF, fogli cantiere e memoria del titolare.</p>
            </div>
            <div className="flex gap-3 bg-white border border-gray-100 rounded-2xl p-4">
              <Clock className="w-5 h-5 text-[#F97415] shrink-0" />
              <p><strong className="text-[#111111]">Durante:</strong> avvio guidato con import dati, template, checklist e abitudini operative semplici.</p>
            </div>
            <div className="flex gap-3 bg-white border border-gray-100 rounded-2xl p-4">
              <Building2 className="w-5 h-5 text-[#F97415] shrink-0" />
              <p><strong className="text-[#111111]">Dopo:</strong> cantieri, preventivi, SAL, documenti, incassi e margini collegati in un unico flusso.</p>
            </div>
          </div>
        </div>
      </section>

      {/* Cases */}
      <section className="py-12 sm:py-16 md:py-24 bg-white">
        <div ref={casesAnim.ref as React.RefObject<HTMLDivElement>} className="max-w-5xl mx-auto px-5 sm:px-6 space-y-12 sm:space-y-16">
          {cases.map((c, i) => (
            <div key={i}
              className={`grid md:grid-cols-2 gap-8 md:gap-12 items-start transition-all duration-700 ${casesAnim.isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-10"}`}
              style={{ transitionDelay: `${i * 150}ms` }}>
              {/* Left: story */}
              <div className={i % 2 === 1 ? "md:order-2" : ""}>
                <div className="flex items-center gap-4 mb-6">
                  <div className="w-14 h-14 rounded-2xl flex items-center justify-center text-white font-extrabold text-lg shrink-0" style={{ background: "linear-gradient(135deg, #F97415, #e8650e)" }}>
                    {c.initials}
                  </div>
                  <div>
                    <p className="font-extrabold text-[#111111]">{c.company}</p>
                    <p className="text-gray-500 text-sm">{c.person}, {c.role} — {c.city}</p>
                  </div>
                </div>
                <div className="flex flex-wrap gap-2 mb-5">
                  {c.tags.map((t, j) => <span key={j} className="px-2 py-0.5 bg-[#F97415]/10 text-[#F97415] text-xs font-bold rounded">{t}</span>)}
                  <span className="px-2 py-0.5 bg-gray-100 text-gray-600 text-xs rounded">Fatturato: {c.revenue}</span>
                </div>
                <div className="mb-5">
                  <p className="text-xs font-bold uppercase tracking-wide text-gray-400 mb-1">La Sfida</p>
                  <p className="text-gray-600 text-sm leading-relaxed">{c.challenge}</p>
                </div>
                <div className="mb-5">
                  <p className="text-xs font-bold uppercase tracking-wide text-[#F97415] mb-1">La Soluzione</p>
                  <p className="text-gray-700 text-sm leading-relaxed">{c.solution}</p>
                </div>
                <div className="mb-5 rounded-2xl bg-gray-50 border border-gray-100 p-4">
                  <p className="text-xs font-bold uppercase tracking-wide text-gray-400 mb-2">Esempi concreti</p>
                  <ul className="space-y-2">
                    {c.examples.map((example, j) => (
                      <li key={j} className="flex gap-2 text-sm text-gray-700 leading-relaxed">
                        <CheckCircle2 className="w-4 h-4 text-[#F97415] shrink-0 mt-0.5" />
                        <span>{example}</span>
                      </li>
                    ))}
                  </ul>
                </div>
                <blockquote className="border-l-4 border-[#F97415] pl-4 italic text-gray-700 text-sm leading-relaxed">"{c.quote}"</blockquote>
              </div>
              {/* Right: results */}
              <div className={`bg-[#111111] rounded-3xl p-5 sm:p-6 md:p-8 ${i % 2 === 1 ? "md:order-1" : ""}`}>
                <p className="text-white/50 text-xs font-bold uppercase tracking-widest mb-6">Risultati Misurati</p>
                <div className="space-y-5">
                  {c.results.map((r, j) => (
                    <div key={j} className="flex items-start gap-3">
                      <CheckCircle2 className="w-5 h-5 text-[#F97415] shrink-0 mt-0.5" />
                      <div>
                        <p className="text-white font-bold">{r.value}</p>
                        <p className="text-white/50 text-sm">{r.label}</p>
                      </div>
                    </div>
                  ))}
                </div>
                <div className="mt-7 pt-6 border-t border-white/10">
                  <div className="flex items-start gap-3 mb-5">
                    <Clock className="w-5 h-5 text-[#F97415] shrink-0 mt-0.5" />
                    <div>
                      <p className="text-white font-bold text-sm">Avvio operativo</p>
                      <p className="text-white/55 text-sm leading-relaxed">{c.timeline}</p>
                    </div>
                  </div>
                  <p className="text-white/50 text-xs font-bold uppercase tracking-widest mb-3">Moduli usati</p>
                  <div className="flex flex-wrap gap-2">
                    {c.modules.map((module) => (
                      <span key={module} className="px-2.5 py-1 rounded-full bg-white/10 text-white/75 text-xs font-semibold">
                        {module}
                      </span>
                    ))}
                  </div>
                </div>
                <div className="mt-8 pt-6 border-t border-white/10">
                  <div className="flex items-center gap-1 mb-1">
                    {[...Array(5)].map((_, k) => <Star key={k} size={14} className="text-[#F97415] fill-[#F97415]" />)}
                  </div>
                  <p className="text-white/60 text-xs">{c.sector}</p>
                </div>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* CTA */}
      <section ref={ctaAnim.ref as React.RefObject<HTMLDivElement>} className="py-14 sm:py-16 md:py-24 bg-[#111111] relative overflow-hidden">
        <div className="absolute top-0 left-0 right-0 h-px" style={{ background: "linear-gradient(90deg, transparent 0%, rgba(249,116,21,0.8) 40%, rgba(249,116,21,1) 50%, transparent 100%)" }} />
        <div className="absolute inset-0" style={{ background: "radial-gradient(ellipse 80% 60% at 50% 50%, rgba(249,116,21,0.10) 0%, transparent 100%)" }} />
        <div className="relative z-10 max-w-3xl mx-auto px-5 sm:px-6 text-center">
          <div className={`transition-all duration-700 ${ctaAnim.isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-10"}`}>
            <h2 className="text-[26px] leading-tight sm:text-3xl md:text-5xl font-extrabold text-white mb-4 px-1">
              La prossima storia di successo <span className="text-[#F97415]">è la tua.</span>
            </h2>
            <p className="text-white/50 text-base sm:text-lg mb-8 sm:mb-10 leading-relaxed">30 minuti di demo gratuita. Nessun impegno. Solo chiarezza su cosa puoi ottenere.</p>
            <Link to="/demo" className="inline-flex items-center justify-center gap-2 w-full sm:w-auto px-6 sm:px-8 py-4 rounded-xl bg-[#F97415] hover:bg-[#e8650e] text-white font-bold text-base sm:text-lg hover:scale-105 transition-all shadow-lg shadow-[#F97415]/30">
              Richiedi Demo Gratuita <ArrowRight size={18} />
            </Link>
          </div>
        </div>
      </section>

      <LandingFooter />
      <StickyBottomBar />
    </div>
  );
}
