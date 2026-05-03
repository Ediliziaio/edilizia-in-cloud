import { useState, useMemo } from "react";
import { Link } from "react-router-dom";
import { Search, ArrowRight, BookOpen } from "lucide-react";
import LandingNavbar from "@/components/landing/LandingNavbar";
import LandingFooter from "@/components/landing/LandingFooter";
import { useSEO } from "@/hooks/useSEO";
import { JsonLd } from "@/components/seo/JsonLd";
import { HubSeoSchema } from "@/components/seo/HubSeoSchema";

// ── Dati del glossario ────────────────────────────────────────────────────────
interface GlossaryTerm {
  term: string;
  category: string;
  definition: string;
  relatedTerms?: string[];
  relatedBlogSlugs?: { slug: string; title: string }[];
}

const GLOSSARY: GlossaryTerm[] = [
  // A
  { term: "Analisi dei Margini", category: "Finanza", definition: "Calcolo della differenza tra i ricavi ottenuti da una commessa edile e i costi sostenuti (manodopera, materiali, subappaltatori, attrezzature). Un gestionale edile aggiornato consente di monitorare il margine reale su ogni commessa in tempo reale, non solo a consuntivo.", relatedTerms: ["Margine di Commessa", "Costo del Lavoro", "SAL"], relatedBlogSlugs: [{ slug: "analisi-margini-imprese-edili", title: "Analisi dei Margini per Imprese Edili" }, { slug: "ridurre-costi-cantieri-edili", title: "Come Ridurre i Costi nei Cantieri del 20%" }] },
  { term: "Appalto", category: "Contrattualistica", definition: "Contratto con cui un soggetto (appaltatore) si obbliga, verso corrispettivo in denaro, a compiere un'opera o un servizio in favore del committente. In edilizia può essere pubblico (bando di gara) o privato, con capitolato tecnico che definisce le lavorazioni.", relatedTerms: ["Subappalto", "Capitolato", "SAL"], relatedBlogSlugs: [{ slug: "appalti-pubblici-edilizia-guida", title: "Come Partecipare agli Appalti Pubblici in Edilizia" }] },
  { term: "Avanzamento Lavori", category: "Gestione Cantiere", definition: "Percentuale di completamento delle lavorazioni previste in un cantiere rispetto al progetto originale. Il monitoraggio dell'avanzamento lavori in tempo reale permette di identificare ritardi, varianti e scostamenti dal budget prima che diventino critici.", relatedTerms: ["SAL", "Computo Metrico", "Variante"] },
  // B
  { term: "Bolla di Consegna", category: "Documenti", definition: "Documento che accompagna la consegna di materiali in cantiere. Contiene fornitore, materiale, quantità, data e firma del ricevente. Fondamentale per il controllo dei costi dei materiali e la riconciliazione con le fatture.", relatedTerms: ["DDT", "Fattura Elettronica"] },
  { term: "Budget di Commessa", category: "Finanza", definition: "Stima preventiva di tutti i costi da sostenere per realizzare un'opera: manodopera, materiali, noli, subappaltatori, spese generali. Il confronto continuo tra budget e consuntivo è la base del controllo di gestione in edilizia.", relatedTerms: ["Analisi dei Margini", "Computo Metrico", "Variante"] },
  // C
  { term: "Capitolato Speciale d'Appalto", category: "Contrattualistica", definition: "Documento tecnico-contrattuale che descrive in dettaglio le lavorazioni, i materiali, le modalità esecutive e le norme di misurazione per una specifica opera edile. Parte integrante del contratto d'appalto.", relatedTerms: ["Appalto", "Computo Metrico"] },
  { term: "Cassa Integrazione Edilizia (CIE)", category: "HR", definition: "Istituto previdenziale specifico del settore edile che gestisce la Cassa Integrazione Guadagni (CIG), le ferie, i permessi e gli accantonamenti previsti dal CCNL Edilizia. Le imprese edili versano contributi mensili alla Cassa Edile territoriale.", relatedTerms: ["CCNL Edilizia", "Cassa Edile", "Busta Paga"] },
  { term: "Cassa Edile", category: "HR", definition: "Ente bilaterale paritetico che gestisce le prestazioni assistenziali e previdenziali dei lavoratori edili iscritti: ferie, gratifica natalizia, anzianità professionale edile (APE), contributi ENPAIA. Ogni impresa edile è obbligata ad iscrivere i propri operai alla Cassa Edile territorialmente competente.", relatedTerms: ["CCNL Edilizia", "Busta Paga", "Cassa Integrazione Edilizia (CIE)"], relatedBlogSlugs: [{ slug: "cassa-edile-come-funziona", title: "Cassa Edile: Come Funziona, Contributi e Obblighi per…" }] },
  { term: "CCNL Edilizia", category: "HR", definition: "Contratto Collettivo Nazionale di Lavoro del settore edile. Disciplina le condizioni di lavoro, i livelli retributivi, gli orari, la sicurezza e i contributi per tutti gli operai del settore edilizio in Italia. Viene rinnovato periodicamente dalle parti sociali (ANCE, CGIL, CISL, UIL).", relatedTerms: ["Cassa Edile", "Busta Paga", "Sicurezza Cantiere"], relatedBlogSlugs: [{ slug: "ccnl-edilizia-guida", title: "CCNL Edilizia Industria 2024-2026" }] },
  { term: "Certificato di Regolare Esecuzione (CRE)", category: "Documenti", definition: "Documento emesso dal Direttore dei Lavori che attesta la corretta esecuzione di un'opera, in sostituzione del collaudo tecnico-amministrativo per lavori di importo inferiore a determinate soglie. Condizione per il saldo finale del contratto.", relatedTerms: ["SAL", "DL (Direttore dei Lavori)"] },
  { term: "Codice Unico di Progetto (CUP)", category: "Contrattualistica", definition: "Codice alfanumerico che identifica univocamente ogni progetto di investimento pubblico finanziato con risorse pubbliche. Obbligatorio per gli appalti pubblici italiani, deve essere riportato su tutti i documenti contabili.", relatedTerms: ["CIG", "Appalto"] },
  { term: "Computo Metrico Estimativo", category: "Finanza", definition: "Documento tecnico che elenca tutte le lavorazioni di un progetto, con le relative quantità misurate e i prezzi unitari dal prezzario di riferimento. Costituisce la base per il preventivo e il budget di commessa. Nelle gare pubbliche determina il prezzo a base d'asta.", relatedTerms: ["Budget di Commessa", "Prezzario", "Variante"], relatedBlogSlugs: [{ slug: "computo-metrico-estimativo-guida", title: "Computo Metrico Estimativo" }] },
  { term: "Contratto di Subappalto", category: "Contrattualistica", definition: "Accordo con cui l'appaltatore principale affida una parte delle lavorazioni a un'impresa specializzata (subappaltatore). In edilizia richiede l'autorizzazione del committente e, negli appalti pubblici, della stazione appaltante. Soggetto a specifici obblighi DURC e sicurezza.", relatedTerms: ["Subappalto", "DURC", "Appalto"], relatedBlogSlugs: [{ slug: "subappalto-edilizia-guida", title: "Subappalto in Edilizia" }] },
  { term: "Costo del Lavoro", category: "Finanza", definition: "Somma di tutti gli oneri che l'impresa sostiene per ciascun lavoratore: retribuzione lorda, contributi previdenziali (INPS, INAIL, Cassa Edile), TFR e premi. Rappresenta tipicamente il 40-60% dei costi di una commessa edile e va tracciato per cantiere per calcolare il margine reale.", relatedTerms: ["CCNL Edilizia", "Busta Paga", "Analisi dei Margini"] },
  // D
  { term: "DDT (Documento di Trasporto)", category: "Documenti", definition: "Documento fiscale che accompagna il trasporto di beni. In cantiere viene emesso dal fornitore per ogni consegna di materiali. Necessario per la contabilità del cantiere e per la verifica delle quantità consegnate rispetto all'ordinato.", relatedTerms: ["Bolla di Consegna", "Fattura Elettronica"] },
  { term: "DL (Direttore dei Lavori)", category: "Contrattualistica", definition: "Tecnico nominato dal committente per supervisionare l'esecuzione delle opere in conformità al progetto approvato. Emette le contabilità di cantiere, i SAL, le varianti e il certificato di regolare esecuzione.", relatedTerms: ["SAL", "Certificato di Regolare Esecuzione (CRE)", "Variante"] },
  { term: "DURC (Documento Unico di Regolarità Contributiva)", category: "Documenti", definition: "Attestazione della regolarità di un'impresa nei versamenti contributivi a INPS, INAIL e Cassa Edile. Obbligatorio per partecipare a gare d'appalto pubbliche e per ricevere pagamenti dalla pubblica amministrazione. Validità 120 giorni.", relatedTerms: ["Cassa Edile", "CCNL Edilizia", "Appalto"], relatedBlogSlugs: [{ slug: "durc-edilizia-guida-completa", title: "DURC in Edilizia: Guida Completa 2026" }, { slug: "documentazione-obbligatoria-cantiere-2025", title: "Documentazione Obbligatoria per Cantieri Edili" }] },
  // E
  { term: "Elenco Prezzi", category: "Finanza", definition: "Lista delle voci di lavorazione con i relativi prezzi unitari, elaborata sulla base del prezzario regionale o delle analisi dei prezzi specifiche dell'impresa. Strumento fondamentale per la formulazione di preventivi e la contabilità di cantiere.", relatedTerms: ["Prezzario", "Computo Metrico Estimativo", "Preventivo"] },
  // F
  { term: "Fattura Elettronica (FE)", category: "Documenti", definition: "Documento fiscale in formato XML trasmesso tramite il Sistema di Interscambio (SDI) dell'Agenzia delle Entrate. Obbligatoria in Italia per tutte le operazioni B2B e B2C sopra soglia. Le imprese edili la emettono per i SAL e le certificazioni di pagamento.", relatedTerms: ["DDT", "SDI", "SAL"] },
  { term: "Fondo Perdita", category: "Finanza", definition: "Accantonamento contabile che un'impresa effettua quando prevede di chiudere una commessa in perdita. Viene iscritto nel bilancio d'esercizio al momento in cui la perdita diventa prevedibile e misurabile, anticipandola rispetto al completamento dei lavori.", relatedTerms: ["Analisi dei Margini", "Budget di Commessa"] },
  // G
  { term: "Gestionale Edilizia", category: "Software", definition: "Software ERP/gestionale specificamente progettato per le imprese del settore edile. Integra la gestione dei cantieri, la contabilità di commessa, la fatturazione elettronica, la gestione del personale (presenze, buste paga), il CRM e la reportistica. Consente il controllo in tempo reale dei margini su ogni commessa.", relatedTerms: ["ERP", "SAL", "Analisi dei Margini"], relatedBlogSlugs: [{ slug: "software-gestionale-vs-excel", title: "Software Gestionale vs Excel per Edilizia" }, { slug: "alternativa-excel-cantieri", title: "La Migliore Alternativa a Excel per i Cantieri" }, { slug: "digitalizzazione-impresa-edile-passo-passo", title: "Digitalizzazione dell'Impresa Edile: Guida Passo Passo" }] },
  { term: "Giornale dei Lavori", category: "Gestione Cantiere", definition: "Registro obbligatorio in cui il Direttore dei Lavori annota giornalmente l'andamento del cantiere: lavorazioni eseguite, operai presenti, materiali consegnati, condizioni meteo, eventi rilevanti. Ha valore legale in caso di controversie.", relatedTerms: ["DL (Direttore dei Lavori)", "Avanzamento Lavori"], relatedBlogSlugs: [{ slug: "giornale-dei-lavori-cantiere", title: "Il Giornale dei Lavori in Cantiere: Guida Pratica" }] },
  // I
  { term: "INAIL (Istituto Nazionale Assicurazione Infortuni sul Lavoro)", category: "HR", definition: "Ente pubblico che gestisce l'assicurazione obbligatoria contro gli infortuni sul lavoro e le malattie professionali. Le imprese edili pagano premi INAIL calcolati in base al tasso di rischio della lavorazione e al monte retributivo.", relatedTerms: ["DURC", "Sicurezza Cantiere", "Costo del Lavoro"] },
  // L
  { term: "Liquidità di Cassa", category: "Finanza", definition: "Capacità dell'impresa di far fronte ai pagamenti a breve termine con le risorse disponibili. In edilizia è critica per via del disallineamento temporale tra pagamenti ai fornitori/subappaltatori e incassi dai committenti tramite SAL.", relatedTerms: ["SAL", "Previsione Finanziaria", "Fondo Perdita"] },
  // M
  { term: "Margine di Commessa", category: "Finanza", definition: "Differenza tra il valore contrattuale di una commessa e i costi totali sostenuti (manodopera, materiali, subappaltatori, noli, spese generali). Espresso in valore assoluto o percentuale, è il principale indicatore di redditività per un'impresa edile.", relatedTerms: ["Analisi dei Margini", "Budget di Commessa", "Costo del Lavoro"], relatedBlogSlugs: [{ slug: "analisi-margini-imprese-edili", title: "Analisi dei Margini per Imprese Edili" }] },
  // N
  { term: "Nolo a Caldo", category: "Gestione Cantiere", definition: "Noleggio di attrezzatura o macchinario edile comprensivo di operatore. Il noleggiatore fornisce sia il mezzo (gru, escavatore, piattaforma) sia il personale per operarlo. Distinto dal 'nolo a freddo' in cui solo il mezzo viene noleggiato.", relatedTerms: ["Budget di Commessa", "Computo Metrico Estimativo"] },
  // P
  { term: "Piano di Sicurezza e Coordinamento (PSC)", category: "Sicurezza", definition: "Documento redatto dal Coordinatore per la Sicurezza in fase di Progettazione (CSP) che identifica i rischi e le misure di prevenzione per un cantiere con più imprese. Obbligatorio quando sono presenti più imprese esecutrici.", relatedTerms: ["POS", "Sicurezza Cantiere"], relatedBlogSlugs: [{ slug: "sicurezza-cantieri-dlgs-81", title: "Sicurezza Cantieri: D.Lgs 81/2008 Spiegato alle…" }] },
  { term: "POS (Piano Operativo di Sicurezza)", category: "Sicurezza", definition: "Documento redatto dall'impresa esecutrice che descrive le procedure operative per la gestione della sicurezza nelle lavorazioni di propria competenza. Aggiornato ad ogni variazione significativa delle lavorazioni.", relatedTerms: ["Piano di Sicurezza e Coordinamento (PSC)", "Sicurezza Cantiere"], relatedBlogSlugs: [{ slug: "sicurezza-cantieri-dlgs-81", title: "Sicurezza Cantieri: D.Lgs 81/2008 Spiegato alle…" }] },
  { term: "Previsione Finanziaria", category: "Finanza", definition: "Proiezione dei flussi di cassa futuri di un'impresa a 30, 60 o 90 giorni. In edilizia si basa sulle date di emissione dei SAL, i termini di pagamento dei clienti e le scadenze dei pagamenti a fornitori e subappaltatori.", relatedTerms: ["Liquidità di Cassa", "SAL"] },
  { term: "Prezzario Regionale", category: "Finanza", definition: "Raccolta ufficiale dei prezzi unitari delle lavorazioni edili, aggiornata periodicamente dalle Regioni italiane. Costituisce il riferimento per la valutazione dei lavori pubblici e viene usato come base per i computi metrici e le analisi dei prezzi.", relatedTerms: ["Computo Metrico Estimativo", "Elenco Prezzi"] },
  { term: "Preventivo Edile", category: "Commerciale", definition: "Documento commerciale che l'impresa consegna al cliente con la stima dettagliata dei costi per realizzare un'opera. Include descrizione delle lavorazioni, materiali, tempi, condizioni di pagamento e margine dell'impresa.", relatedTerms: ["Computo Metrico Estimativo", "Budget di Commessa", "Elenco Prezzi"], relatedBlogSlugs: [{ slug: "come-fare-preventivo-edilizia", title: "Come Fare un Preventivo Edile Professionale" }, { slug: "preventivi-edilizia-guida", title: "Preventivi Edilizia: Guida Completa 2026" }, { slug: "acquisire-clienti-impresa-edile", title: "Come Acquisire Clienti per un'Impresa Edile nel 2026" }] },
  // R
  { term: "Rendiconto di Cantiere", category: "Gestione Cantiere", definition: "Documento periodico che confronta i costi effettivamente sostenuti con quelli previsti nel budget, per commessa o periodo. Strumento di controllo di gestione essenziale per identificare scostamenti e adottare azioni correttive tempestive.", relatedTerms: ["Analisi dei Margini", "Budget di Commessa", "Avanzamento Lavori"] },
  { term: "Riserva", category: "Contrattualistica", definition: "Dichiarazione formale dell'appaltatore con cui si riserva il diritto di richiedere compensi aggiuntivi per lavorazioni non previste o per cause straordinarie. Deve essere iscritta nel registro di contabilità entro precisi termini per mantenere validità legale.", relatedTerms: ["Variante", "SAL", "DL (Direttore dei Lavori)"] },
  // S
  { term: "SAL (Stato di Avanzamento dei Lavori)", category: "Finanza", definition: "Documento contabile emesso periodicamente dal Direttore dei Lavori che certifica il valore delle opere eseguite fino a un certo momento. Costituisce la base per l'emissione del certificato di pagamento e della relativa fattura all'appaltatore.", relatedTerms: ["Avanzamento Lavori", "Fattura Elettronica (FE)", "DL (Direttore dei Lavori)"], relatedBlogSlugs: [{ slug: "sal-cantiere-come-funziona", title: "SAL Cantiere: Come Funziona e Come Gestirlo" }] },
  { term: "Sicurezza Cantiere", category: "Sicurezza", definition: "Insieme di obblighi normativi (D.Lgs. 81/2008) per la prevenzione degli infortuni e la tutela della salute nei cantieri edili. Include la formazione dei lavoratori, l'uso dei DPI, i piani di sicurezza (PSC, POS) e la nomina delle figure responsabili (RSPP, RLS, CSP).", relatedTerms: ["POS", "Piano di Sicurezza e Coordinamento (PSC)", "INAIL (Istituto Nazionale Assicurazione Infortuni sul Lavoro)"] },
  { term: "Subappalto", category: "Contrattualistica", definition: "Affidamento da parte dell'appaltatore principale di una porzione delle lavorazioni a un'altra impresa specializzata (subappaltatore). Soggetto a limiti percentuali fissati dalla legge per gli appalti pubblici e a obblighi di comunicazione al committente.", relatedTerms: ["Contratto di Subappalto", "DURC", "Appalto"], relatedBlogSlugs: [{ slug: "subappalto-edilizia-guida", title: "Subappalto in Edilizia: Regole, Limiti e Come Gestirlo" }] },
  // T
  { term: "Timbratura Cantiere", category: "HR", definition: "Registrazione dell'orario di entrata e uscita degli operai in cantiere. Può avvenire con badge fisici, app mobile o sistemi geolocalizzati. Fondamentale per il calcolo delle ore lavorate da imputare alla commessa e per le buste paga.", relatedTerms: ["Costo del Lavoro", "CCNL Edilizia", "Giornale dei Lavori"], relatedBlogSlugs: [{ slug: "gestione-operai-cantiere-presenze-ore", title: "Gestione Operai in Cantiere: Presenze e Ore Lavorate" }] },
  // V
  { term: "Variante in Corso d'Opera", category: "Contrattualistica", definition: "Modifica al progetto originale disposta dal committente o dalla DL durante l'esecuzione dei lavori. Comporta una revisione del computo metrico, del contratto e, normalmente, del corrispettivo dovuto all'appaltatore.", relatedTerms: ["Computo Metrico Estimativo", "Riserva", "DL (Direttore dei Lavori)"] },
];

const CATEGORIES = [...new Set(GLOSSARY.map((g) => g.category))].sort();
const ALPHABET = [...new Set(GLOSSARY.map((g) => g.term[0].toUpperCase()))].sort();

export default function Glossario() {
  useSEO({
    title: "Glossario Edilizia — 40 Termini Chiave per Imprese Edili",
    description: "Dizionario completo dei termini tecnici dell'edilizia italiana: SAL, DURC, Computo Metrico, CCNL Edilizia, Cassa Edile, Margine di Commessa e molto altro.",
    canonical: "/glossario-edilizia",
    keywords: "glossario edilizia, termini edilizia, SAL significato, DURC edilizia, computo metrico, CCNL edilizia, cassa edile, margine commessa, dizionario edilizia, terminologia cantiere",
  });

  const [search, setSearch] = useState("");
  const [activeCategory, setActiveCategory] = useState<string>("Tutte");
  const [activeLetter, setActiveLetter] = useState<string>("Tutte");

  const filtered = useMemo(() => {
    let list = [...GLOSSARY];
    if (activeCategory !== "Tutte") list = list.filter((g) => g.category === activeCategory);
    if (activeLetter !== "Tutte") list = list.filter((g) => g.term[0].toUpperCase() === activeLetter);
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(
        (g) => g.term.toLowerCase().includes(q) || g.definition.toLowerCase().includes(q)
      );
    }
    return list.sort((a, b) => a.term.localeCompare(b.term, "it"));
  }, [search, activeCategory, activeLetter]);

  const baseUrl = "https://www.ediliziaincloud.com";

  return (
    <div className="min-h-screen bg-white text-[#111111]">
      <HubSeoSchema
        pageName="Glossario Edilizia"
        pagePath="/glossario-edilizia"
        pageDescription="Glossario di termini tecnici dell'edilizia: SAL, DURC, cassa edile, F24, sicurezza cantieri, contabilità di commessa."
        breadcrumbs={[
          { name: "Home", url: "/" },
          { name: "Glossario Edilizia", url: "/glossario-edilizia" },
        ]}
      />

      {/* Structured Data */}
      <JsonLd id="jsonld-breadcrumb-glossario" data={{
        "@context": "https://schema.org",
        "@type": "BreadcrumbList",
        "itemListElement": [
          { "@type": "ListItem", "position": 1, "name": "Home", "item": `${baseUrl}/` },
          { "@type": "ListItem", "position": 2, "name": "Glossario Edilizia", "item": `${baseUrl}/glossario-edilizia` },
        ]
      }} />
      <JsonLd id="jsonld-glossario-webpage" data={{
        "@context": "https://schema.org",
        "@type": "WebPage",
        "@id": `${baseUrl}/glossario-edilizia`,
        "name": "Glossario dei Termini Edili",
        "description": "Dizionario completo dei termini tecnici, contrattuali e finanziari del settore edile italiano.",
        "url": `${baseUrl}/glossario-edilizia`,
        "inLanguage": "it",
        "isPartOf": { "@id": `${baseUrl}/#website` },
        "publisher": { "@id": `${baseUrl}/#organization` },
        "about": { "@id": `${baseUrl}/#software` },
        "mainEntity": {
          "@type": "DefinedTermSet",
          "name": "Glossario Edilizia in Cloud",
          "hasDefinedTerm": GLOSSARY.map((g) => ({
            "@type": "DefinedTerm",
            "name": g.term,
            "description": g.definition,
            "inDefinedTermSet": `${baseUrl}/glossario-edilizia`,
          })),
        },
      }} />

      <LandingNavbar />

      {/* Hero */}
      <section className="bg-[#111111] pt-36 pb-20">
        <div className="max-w-4xl mx-auto px-6 text-center">
          <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-[#F97415]/10 border border-[#F97415]/20 mb-6">
            <BookOpen size={14} className="text-[#F97415]" />
            <span className="text-[#F97415] text-xs font-bold uppercase tracking-widest">Glossario</span>
          </div>
          <h1 className="text-4xl md:text-5xl lg:text-6xl font-extrabold text-white mb-6 leading-tight">
            Glossario Edilizia
          </h1>
          <p className="text-white/60 text-lg md:text-xl max-w-2xl mx-auto mb-10">
            {GLOSSARY.length} termini tecnici del settore edile spiegati in modo chiaro.
            SAL, DURC, Computo Metrico, Cassa Edile e molto altro.
          </p>
          {/* Search */}
          <div className="relative max-w-lg mx-auto">
            <Search size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              placeholder="Cerca un termine (es. SAL, DURC, Margine…)"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-12 pr-5 py-4 rounded-full bg-white/10 border border-white/20 text-white placeholder-white/40 focus:outline-none focus:ring-2 focus:ring-[#F97415]/60 focus:bg-white/15 transition-all"
            />
          </div>
        </div>
      </section>

      {/* Filters */}
      <section className="sticky top-16 z-30 bg-white/90 backdrop-blur-md border-b border-gray-200 shadow-sm">
        <div className="max-w-5xl mx-auto px-6 py-3">
          {/* Category filter */}
          <div className="flex items-center gap-2 overflow-x-auto scrollbar-hide pb-1 mb-2">
            {["Tutte", ...CATEGORIES].map((cat) => (
              <button
                key={cat}
                onClick={() => setActiveCategory(cat)}
                className={`whitespace-nowrap px-3 py-1.5 rounded-full text-xs font-semibold transition-all flex-shrink-0 ${
                  activeCategory === cat
                    ? "bg-[#F97415] text-white"
                    : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                }`}
              >
                {cat}
              </button>
            ))}
          </div>
          {/* Alphabet filter */}
          <div className="flex items-center gap-1 overflow-x-auto scrollbar-hide pb-1">
            {["Tutte", ...ALPHABET].map((l) => (
              <button
                key={l}
                onClick={() => setActiveLetter(l)}
                className={`w-7 h-7 flex items-center justify-center rounded text-xs font-bold transition-all flex-shrink-0 ${
                  activeLetter === l
                    ? "bg-[#111111] text-white"
                    : "bg-gray-100 text-gray-500 hover:bg-gray-200"
                }`}
              >
                {l}
              </button>
            ))}
          </div>
        </div>
      </section>

      {/* Terms list */}
      <main className="max-w-5xl mx-auto px-6 py-14">
        {filtered.length === 0 ? (
          <div className="text-center py-16">
            <p className="text-gray-400">Nessun termine trovato per "{search}".</p>
            <button onClick={() => { setSearch(""); setActiveCategory("Tutte"); setActiveLetter("Tutte"); }}
              className="mt-4 text-[#F97415] font-medium hover:underline">
              Mostra tutti i termini
            </button>
          </div>
        ) : (
          <dl className="space-y-8">
            {filtered.map((g) => (
              <div key={g.term} id={g.term.toLowerCase().replace(/\s+/g, "-")}
                className="scroll-mt-32 border-b border-gray-100 pb-8 last:border-0">
                <dt className="flex items-start gap-3 mb-2">
                  <span className="mt-1 px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-widest bg-gray-100 text-gray-500 whitespace-nowrap">
                    {g.category}
                  </span>
                  <h2 className="text-xl md:text-2xl font-extrabold text-[#111111] leading-tight">
                    {g.term}
                  </h2>
                </dt>
                <dd>
                  <p className="text-gray-600 leading-relaxed mb-3 ml-[0px]">{g.definition}</p>
                  {g.relatedTerms && g.relatedTerms.length > 0 && (
                    <div className="flex flex-wrap items-center gap-2 mt-3">
                      <span className="text-xs text-gray-400 font-medium">Vedi anche:</span>
                      {g.relatedTerms.map((rt) => (
                        <a
                          key={rt}
                          href={`#${rt.toLowerCase().replace(/\s+/g, "-")}`}
                          onClick={(e) => {
                            // Reset filters to show all terms so the anchor is visible
                            setActiveCategory("Tutte");
                            setActiveLetter("Tutte");
                            setSearch("");
                          }}
                          className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-[#F97415]/10 text-[#F97415] hover:bg-[#F97415]/20 transition-colors"
                        >
                          {rt}
                        </a>
                      ))}
                    </div>
                  )}
                  {g.relatedBlogSlugs && g.relatedBlogSlugs.length > 0 && (
                    <div className="flex flex-wrap items-center gap-2 mt-2">
                      <span className="text-xs text-gray-400 font-medium">Leggi:</span>
                      {g.relatedBlogSlugs.map((b) => (
                        <Link
                          key={b.slug}
                          to={`/blog/${b.slug}`}
                          className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-gray-100 text-gray-600 hover:bg-[#111111] hover:text-white transition-colors"
                        >
                          <ArrowRight size={10} />
                          {b.title}
                        </Link>
                      ))}
                    </div>
                  )}
                </dd>
              </div>
            ))}
          </dl>
        )}

        {/* CTA box */}
        <div className="mt-16 bg-[#111111] rounded-3xl p-8 md:p-12 text-center">
          <h2 className="text-2xl md:text-3xl font-extrabold text-white mb-3">
            Gestisci SAL, margini e DURC da un'unica piattaforma
          </h2>
          <p className="text-white/60 mb-8 max-w-xl mx-auto">
            Edilizia in Cloud automatizza tutta la contabilità di cantiere:
            SAL, avanzamenti, fatturazione elettronica e controllo margini in tempo reale.
          </p>
          <Link
            to="/demo"
            className="inline-flex items-center gap-2 px-8 py-4 rounded-full bg-[#F97415] text-white font-bold hover:bg-[#e8650e] hover:scale-105 transition-all shadow-lg shadow-[#F97415]/30"
          >
            Prova Gratis 31 Giorni <ArrowRight size={18} />
          </Link>
        </div>

        {/* Related blog posts */}
        <div className="mt-16">
          <h2 className="text-xl font-extrabold text-[#111111] mb-6">Guide pratiche correlate</h2>
          <div className="grid md:grid-cols-3 gap-6">
            {[
              { slug: "sal-cantiere-come-funziona", label: "SAL Cantiere: Cos'è e Come Funziona" },
              { slug: "durc-edilizia-guida-completa", label: "DURC in Edilizia: Guida Completa 2026" },
              { slug: "computo-metrico-estimativo-guida", label: "Computo Metrico Estimativo: Guida Pratica" },
              { slug: "cassa-edile-come-funziona", label: "Cassa Edile: Come Funziona per le Imprese" },
              { slug: "appalti-pubblici-edilizia-guida", label: "Appalti Pubblici in Edilizia: Guida 2026" },
              { slug: "analisi-margini-imprese-edili", label: "Analisi dei Margini per Imprese Edili" },
              { slug: "sicurezza-cantieri-dlgs-81", label: "Sicurezza Cantieri: D.Lgs 81/2008 per le Imprese" },
              { slug: "ccnl-edilizia-guida", label: "CCNL Edilizia Industria: Guida Pratica 2024-2026" },
              { slug: "attestazione-soa-imprese-edili", label: "Attestazione SOA: Come Ottenerla e Mantenerla" },
            ].map((post) => (
              <Link key={post.slug} to={`/blog/${post.slug}`}
                className="flex items-center gap-3 p-4 rounded-xl border border-gray-200 hover:border-[#F97415]/40 hover:bg-[#F97415]/5 transition-all group">
                <span className="flex-1 text-sm font-semibold text-[#111111] group-hover:text-[#F97415] transition-colors">
                  {post.label}
                </span>
                <ArrowRight size={14} className="text-[#F97415] flex-shrink-0" />
              </Link>
            ))}
          </div>
        </div>
      </main>

      <LandingFooter />
    </div>
  );
}
