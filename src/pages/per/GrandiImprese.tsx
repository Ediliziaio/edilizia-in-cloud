import { Building2, Network, LayoutDashboard, ShieldCheck, ScrollText, FileSearch } from "lucide-react";
import PerTipoPageTemplate, { PerTipoConfig } from "@/components/landing/PerTipoPageTemplate";

const config: PerTipoConfig = {
  // SEO
  seoTitle: "Software Grandi Imprese Edili (50+ Dipendenti)",
  seoDescription:
    "Gestionale enterprise per grandi imprese edili e general contractor 50+ dipendenti, 10-50 cantieri attivi. Multi-società, dashboard direzionale CFO…",
  seoKeywords:
    "software grandi imprese edili, gestionale general contractor, software 50 dipendenti edilizia, ERP edilizia enterprise, multi-società edile, holding edile gestionale, dashboard direzionale costruzioni, software cantieri SAP alternativa, gestionale group edile",
  seoCanonical: "/per/grandi-imprese",

  // Hero
  badge: "Per Grandi Imprese Edili e General Contractor",
  heroTitle: (
    <>
      <span className="text-white">50+ persone, 30 cantieri,</span>{" "}
      <span className="text-[#F97415]">un'unica fonte di verità</span>
    </>
  ),
  heroSubtitle:
    "Hai 3 società operative, 18-30 cantieri attivi e un CdA che alle 9 del lunedì vuole sapere quanto sta perdendo il cantiere di Lecce. Oggi i dati arrivano da SAP, da 4 Excel diversi, da PEC e da WhatsApp del direttore tecnico. Edilizia in Cloud consolida tutto il gruppo in un'unica dashboard direzionale CFO/CEO real-time, si integra con SAP/Microsoft Dynamics via API e impone la governance progetti che il Codice Appalti pretende.",
  heroImage:
    "https://images.unsplash.com/photo-1486406146926-c627a92ad1ab?auto=format&fit=crop&w=1400&q=80",

  // Social proof
  socialProof: [
    { initials: "CG", name: "Costruzioni Grandi SpA", city: "Milano", months: 22, gradient: "from-[#F97415] to-[#0d8f79]" },
    { initials: "EH", name: "Edilholding Group", city: "Roma", months: 18, gradient: "from-[#111111] to-[#F97415]" },
    { initials: "GC", name: "Gruppo Costanzi", city: "Bologna", months: 14, gradient: "from-[#0d8f79] to-[#111111]" },
    { initials: "MI", name: "Marini Infrastrutture", city: "Torino", months: 11, gradient: "from-[#1a1a2e] to-[#F97415]" },
  ],

  // Problems
  problemsTitle: "Quanto ti costa davvero non avere il controllo del gruppo?",
  problemsSubtitle:
    "Le grandi imprese edili che ci contattano hanno tutte gli stessi quattro problemi. Non sono problemi di software: sono problemi di governance e di visibilità che ogni mese erodono margini a sette zeri.",
  problems: [
    {
      emoji: "🧩",
      title: "Dati frammentati tra ERP, Excel, email e PEC",
      desc: "Il gestionale contabile è SAP. Il controllo cantieri è in 4 Excel diversi. Le offerte fornitori arrivano via PEC. Le varianti via WhatsApp del DT. Il CFO chiede il margine consolidato di gruppo e nessuno sa rispondere prima di 5 giorni di lavoro manuale di 3 controller.",
    },
    {
      emoji: "📊",
      title: "La dashboard direzionale ritarda di 30 giorni",
      desc: "Il CdA si riunisce il 5 del mese. I dati di chiusura del mese precedente sono pronti il 25. Stai prendendo decisioni strategiche su 30 milioni di fatturato basandoti su numeri vecchi di 30-40 giorni. Quando scopri che un cantiere sta perdendo 200k€ è tardi per intervenire.",
    },
    {
      emoji: "⚠️",
      title: "Errori subappaltatori distribuiti su 18 cantieri",
      desc: "Ogni cantiere ha 8-15 subappaltatori. Ogni capocantiere gestisce la sua filiera in autonomia. Risultato: stesso fornitore con prezzi diversi su 3 cantieri, DURC scaduti che nessuno controlla, ritenute non versate che escono nelle verifiche, doppi pagamenti, contestazioni a fine lavori per centinaia di migliaia di euro.",
    },
    {
      emoji: "⚖️",
      title: "Conformità Codice Appalti, anticorruzione e GDPR",
      desc: "Lavori con la PA: D.Lgs 36/2023, tracciabilità ex L.136/2010, MOG 231, whistleblowing, conflitto di interessi, antiriciclaggio, GDPR. Ogni audit interno o esterno è un incubo perché la documentazione è sparsa. Una non-conformità ti esclude dalle prossime gare per 12-36 mesi.",
    },
  ],

  // ROI
  roi: {
    lossValue: "€ 350.000",
    lossLabel: "in margine eroso da prezzi non allineati e doppi pagamenti subappaltatori",
    wasteValue: "€ 180.000",
    wasteLabel: "FTE controller dedicati a riconciliazioni manuali Excel/ERP",
    errorValue: "€ 420.000",
    errorLabel: "in penali, varianti non riconosciute e contestazioni cantiere scoperte tardi",
    totalLoss: "€ 950.000",
    softwareCost: "€ 24.000",
    roiX: "39x",
  },

  // Transformation
  transformation: {
    title: "Da governance percepita a governance dimostrabile",
    subtitle:
      "Non sostituisci SAP né Microsoft Dynamics. Ci colleghi sopra il livello operativo cantieri con una single source of truth che il CFO consulta in tempo reale e che gli auditor accettano senza discussione.",
    fromTitle: "Prima: governance per email",
    fromItems: [
      "Reportistica direzionale consolidata 25 giorni dopo la chiusura del mese, fatta a mano in Excel",
      "3 società del gruppo, 3 piani dei conti diversi, riconciliazione intercompany manuale ogni trimestre",
      "Ogni capocantiere gestisce subappalti in autonomia: prezzi disallineati, DURC scaduti, doppi pagamenti",
      "Approvazioni acquisti via email senza tracciabilità: chi ha autorizzato cosa scopri solo in audit",
      "Documentazione Codice Appalti, MOG 231 e tracciabilità sparsa tra 4 software, server di rete e PEC",
      "Integrazione SAP/Dynamics fatta a fine mese con export CSV manuali e ore di pulizia dati",
    ],
    toTitle: "Dopo: governance real-time",
    toItems: [
      "Dashboard CFO/CEO real-time: margine per cantiere, per società, consolidato di gruppo, in qualsiasi momento",
      "Multi-società nativo: una piattaforma, piani dei conti separati, consolidamento automatico, intercompany regolato in 1 click",
      "Albo fornitori e subappaltatori unico di gruppo: prezzi standard, DURC monitorato, blocco automatico se non conforme",
      "Workflow approvazioni multi-livello configurabile per importo e categoria: ogni firma è tracciata e auditabile",
      "Repository documentale unico Codice Appalti compliant: ogni cantiere ha il suo dossier completo, sempre pronto per audit",
      "API REST/SFTP bidirezionali con SAP, Microsoft Dynamics 365, Oracle, TeamSystem: dati che fluiscono ogni notte",
    ],
  },

  // Stats
  stats: [
    {
      value: "50+",
      label: "Utenti concorrenti supportati",
      sublabel: "Direzione, controller, PM, capicantiere, amministrazione, consulenti esterni",
    },
    {
      value: "30",
      label: "Cantieri live in parallelo",
      sublabel: "Multi-cantiere multi-società, performance garantite da SLA",
    },
    {
      value: "Real-time",
      label: "Dashboard CFO direzionale",
      sublabel: "Margine consolidato di gruppo aggiornato al minuto, non al mese",
    },
  ],

  // Modules
  modulesTitle: "Sei moduli enterprise pensati per il livello di gruppo",
  modulesSubtitle:
    "Non un gestionale per cantiere singolo: un layer di governance e controllo che siede sopra le tue strutture operative esistenti e le rende auditabili.",
  modules: [
    {
      icon: Building2,
      name: "Multi-Società e Consolidamento",
      desc: "Holding, controllate, consorzi, ATI, SPV: ogni entità ha il suo piano dei conti, le sue commesse, i suoi utenti, ma il direzionale vede il consolidato di gruppo automatico, con elisione intercompany e conversione valutaria.",
      saving: "Consolidato di gruppo in 1 click",
    },
    {
      icon: Network,
      name: "API Integration ERP-Ready",
      desc: "Connettori certificati con SAP S/4HANA, SAP Business One, Microsoft Dynamics 365 F&O, Oracle NetSuite, TeamSystem Enterprise, Zucchetti AdHoc. API REST documentate, SFTP, EDI, webhook real-time. Niente più export CSV manuali.",
      saving: "Zero re-imputazione dati ERP",
    },
    {
      icon: LayoutDashboard,
      name: "Dashboard Direzionale C-Level",
      desc: "Cruscotto CEO, CFO e COO real-time: margine atteso vs realizzato per cantiere, cash flow consolidato a 90 giorni, KPI per business unit, alert su scostamenti budget. Drill-down dal gruppo al singolo movimento contabile.",
      saving: "Decisioni con dati di oggi, non di 30gg fa",
    },
    {
      icon: ShieldCheck,
      name: "Governance e Approvazioni Multi-Livello",
      desc: "Workflow di approvazione configurabili per importo, categoria di spesa, società e tipo di documento. Deleghe a tempo, escalation automatica, separazione di ruoli (SoD), maker-checker. Ogni approvazione è firmata digitalmente e tracciata.",
      saving: "Audit-ready su ogni decisione",
    },
    {
      icon: ScrollText,
      name: "Codice Appalti e Compliance",
      desc: "D.Lgs 36/2023 (Nuovo Codice Appalti), tracciabilità ex L.136/2010 con CIG/CUP automatici, MOG 231, whistleblowing dedicato, antiriciclaggio, conflitto di interessi: ogni cantiere PA ha il dossier completo sempre pronto.",
      saving: "Esclusioni gara prevenute",
    },
    {
      icon: FileSearch,
      name: "Audit Trail Forense",
      desc: "Log immutabile di ogni azione: chi ha visto cosa, chi ha modificato cosa, quando, da quale IP. Esportabile per ODV 231, Collegio Sindacale, Revisori Legali, Guardia di Finanza. Conservazione a norma 10 anni con marca temporale.",
      saving: "Audit interni risolti in ore, non settimane",
    },
  ],

  // Case Study
  caseStudy: {
    company: "Edilholding Group SpA",
    city: "Roma",
    sector: "General contractor — holding con 3 società operative",
    revenue: "25.000.000 €",
    person: "Marco D'Amico",
    role: "CFO di Gruppo",
    initials: "MD",
    gradient: "from-[#F97415] to-[#0d8f79]",
    quote:
      "Avevamo SAP per la contabilità e 4 Excel di controllo cantiere mantenuti da 3 controller. Il margine consolidato di gruppo lo avevo il 25 del mese, su numeri del mese prima. Con Edilizia in Cloud sopra SAP ora apro il portatile alle 8 del lunedì e vedo i 18 cantieri di tutte le 3 società, il margine atteso vs realizzato, gli scostamenti rossi. Nei primi 6 mesi abbiamo recuperato 380k€ solo riallineando i prezzi dei subappaltatori che ogni cantiere trattava in autonomia.",
    metrics: [
      { label: "Cantieri attivi gestiti in parallelo", before: "12 (con 4 Excel)", after: "18 (vista unica gruppo)" },
      { label: "Tempo chiusura reporting direzionale", before: "25 giorni", after: "real-time" },
      { label: "Margine recuperato anno 1", before: "—", after: "€ 380.000" },
      { label: "FTE controller dedicati a riconciliazioni", before: "3 persone full-time", after: "0,5 FTE supervisione" },
    ],
  },

  // FAQ
  faq: [
    {
      q: "Si integra davvero con SAP S/4HANA, Microsoft Dynamics 365 e Oracle NetSuite?",
      a: "Sì. Disponiamo di connettori certificati e di un'architettura API REST/SOAP/SFTP/EDI documentata. Per SAP supportiamo IDoc e BAPI; per Dynamics 365 lavoriamo via Dataverse e Logic Apps; per Oracle via REST e Database Link. Il flusso è bidirezionale: anagrafiche fornitori, piano dei conti, ordini di acquisto, fatture passive, registrazioni contabili. La nostra integration factory configura il middleware in 4-8 settimane secondo la complessità, con UAT supervisionato da un solution architect dedicato.",
    },
    {
      q: "Quali sono le certificazioni di sicurezza enterprise che possedete?",
      a: "Edilizia in Cloud è hostato su infrastruttura ISO/IEC 27001:2022 e ISO/IEC 27017/27018 certificata, in datacenter europei Tier IV con compliance SOC 2 Type II. Disponiamo di ISO 9001 sui processi di sviluppo, di un programma di penetration test annuale condotto da terze parti, MFA obbligatoria, SSO SAML 2.0/OIDC con Azure AD, Okta e Google Workspace, cifratura at-rest AES-256 e in-transit TLS 1.3. Per clienti regolati possiamo predisporre un data residency italiana dedicata.",
    },
    {
      q: "Quali SLA garantite a livello enterprise?",
      a: "Il piano Enterprise prevede SLA contrattuale del 99,9% (uptime mensile), RPO ≤ 15 minuti, RTO ≤ 4 ore, supporto premium 24/7 con time-to-response 30 minuti per priorità critica e Customer Success Manager dedicato. Le penali per mancato rispetto SLA sono regolate da Service Credit fino al 25% del canone mensile. Forniamo report di disponibilità trimestrali e accesso a una status page real-time. È disponibile un piano di Disaster Recovery geo-ridondante con sito secondario attivo-passivo.",
    },
    {
      q: "Come gestite il consolidamento multi-società di una holding edile?",
      a: "Ogni società del gruppo (controllante, controllate, consorzi, ATI, SPV) è una legal entity separata con il proprio piano dei conti, le proprie commesse, le proprie aliquote IVA, la propria valuta funzionale e i propri permessi utente. Il modulo di consolidato di gruppo applica regole configurabili di elisione intercompany, conversione valutaria, riclassifica di bilancio (CEE, IAS/IFRS) e produce automaticamente il bilancio consolidato pro-forma con drill-down fino al singolo movimento. È compatibile con il principio contabile OIC 17 e con IFRS 10/11/12.",
    },
    {
      q: "Siete conformi GDPR, MOG 231 e gestite il whistleblowing ex D.Lgs 24/2023?",
      a: "Sì. Siamo titolari del trattamento solo per i dati di servizio; per i dati cantiere agiamo come responsabili ex art. 28 GDPR con DPA standard. Disponiamo di un modulo whistleblowing dedicato conforme al D.Lgs 24/2023, con canale segnalazioni cifrato end-to-end, gestione separata del Gestore Segnalazioni e log forense. Il modulo MOG 231 traccia conflitti di interesse, regali e omaggi, attività sensibili, ed è configurabile per Modello Organizzativo proprio. DPO dedicato disponibile, audit GDPR documentati.",
    },
    {
      q: "Quanto costa il piano enterprise e come funziona il pricing?",
      a: "Il piano Enterprise è a quotazione personalizzata: prezzo medio indicativo da 18.000 a 60.000 € all'anno secondo numero di società, utenti concorrenti, volume cantieri, integrazioni richieste e livello SLA. È sempre incluso onboarding dedicato (8-16 settimane), data migration da legacy, formazione per ruolo (direzione, controller, PM, capicantiere, ammnistrazione), Customer Success Manager nominale e supporto premium. Sono disponibili anche modelli OPEX puri o ibridi CAPEX/OPEX su 36 mesi. Richiedi una demo enterprise dedicata: il nostro solution architect prepara un'analisi di fattibilità su misura e un business case con ROI atteso.",
    },
  ],

  verticalFeatures: [
    {
      icon: FileSearch,
      problem: "Audit trail forense: ogni movimento, modifica e accesso deve essere ricostruibile a anni di distanza",
      solution: "Edilizia in Cloud registra in un log immutabile (write-once, append-only) ogni azione utente: chi, cosa, quando, da dove, con quale ruolo, quale valore prima e dopo. Il log è esportabile in formato standard XBRL/JSON firmato digitalmente, conservato a norma con marca temporale per 10 anni, accessibile da ODV 231, Collegio Sindacale, Revisori Legali e autorità di vigilanza in caso di ispezione.",
      economicBenefit: "−85%",
      benefitLabel: "tempo per rispondere a richieste audit interne ed esterne",
    },
    {
      icon: ShieldCheck,
      problem: "Deleghe operative: il CFO deve poter delegare l'amministratore di Lecce per 3 mesi senza perdere il controllo",
      solution: "Sistema di deleghe a tempo configurabile per società, cantiere, importo massimo, categoria di spesa e finestra temporale. Il delegante mantiene visibilità in tempo reale di ogni azione del delegato, riceve notifica per soglie superate, può revocare la delega con un click. Ogni delega è firmata digitalmente, registrata nel log forense e produce un PDF conservato a norma.",
      economicBenefit: "100%",
      benefitLabel: "tracciabilità su ogni delega operativa attivata",
    },
    {
      icon: Building2,
      problem: "Separazione contabile e operativa tra società del gruppo: il consorzio non può vedere i dati della holding",
      solution: "Architettura multi-tenant nativa: ogni società è un tenant logico separato con database isolati, permessi granulari per utente e ruolo, separazione di rete a livello applicativo. Un utente del consorzio non vede la holding e viceversa, salvo esplicita autorizzazione del CdA. Il consolidamento di gruppo passa solo attraverso ruoli direzionali con permesso esplicito 'consolidato', mai per default.",
      economicBenefit: "Compliant",
      benefitLabel: "OIC 17, IFRS 10/11/12 e D.Lgs 175/2016",
    },
    {
      icon: ShieldCheck,
      problem: "Approvazioni multi-livello: nessun acquisto sopra 50k€ deve passare senza firma di CFO + AD",
      solution: "Workflow di approvazione configurabili per categoria di spesa, importo, società e tipo documento. Catene di approvazione fino a 8 livelli, con escalation automatica per timeout, deleghe in caso di assenza, maker-checker su importi critici, separation of duties (SoD) prevenute by-design. Ogni approvazione è firmata digitalmente CAdES/PAdES e immutabilmente registrata.",
      economicBenefit: "0",
      benefitLabel: "approvazioni fuori-policy possibili a sistema",
    },
    {
      icon: Network,
      problem: "Integrazione ERP esistente: sostituire SAP/Dynamics non è in agenda, ma serve unificare i dati cantiere",
      solution: "Edilizia in Cloud non sostituisce il tuo ERP: si integra nativamente. Connettori certificati SAP S/4HANA (IDoc + BAPI), Microsoft Dynamics 365 F&O (Dataverse), Oracle NetSuite (REST), TeamSystem Enterprise, Zucchetti AdHoc. Sincronizzazione bidirezionale notturna o real-time via webhook. La nostra integration factory esegue il go-live in 4-8 settimane con UAT supervisionato.",
      economicBenefit: "4-8 sett",
      benefitLabel: "go-live integrazione ERP enterprise certificata",
    },
  ],
  verticalFeaturesTitle: "Cinque pilastri enterprise per il general contractor moderno",
  verticalFeaturesSubtitle:
    "Audit trail forense, deleghe a tempo, separazione tra società, approvazioni multi-livello, integrazioni ERP certificate: il livello di rigore che il CdA, il Collegio Sindacale e gli enti di vigilanza si aspettano da una holding edile da 25M€+.",
  demoLabel: "Demo enterprise dedicata",

  // CTA
  ctaTitle: (
    <>
      <span className="text-white">Il tuo gruppo merita</span>{" "}
      <span className="text-[#F97415]">una sola fonte di verità</span>
    </>
  ),
  ctaSubtitle:
    "Demo enterprise dedicata di 60 minuti con il nostro solution architect: analisi di fattibilità su misura, integrazione con il tuo ERP, business case ROI a 12-24 mesi. Per holding e general contractor da 15M€ in su.",

  // Schema FAQ
  schemaFaq: [
    {
      q: "Qual è il miglior software gestionale per grandi imprese edili e general contractor?",
      a: "Edilizia in Cloud è la piattaforma enterprise per grandi imprese edili 50+ dipendenti e general contractor con 10-50 cantieri attivi: multi-società nativo, dashboard direzionale CFO real-time, integrazione certificata SAP/Microsoft Dynamics/Oracle, conformità Codice Appalti D.Lgs 36/2023, MOG 231, whistleblowing, audit trail forense e SLA 99,9%.",
    },
    {
      q: "Edilizia in Cloud sostituisce SAP o Microsoft Dynamics in una holding edile?",
      a: "No, Edilizia in Cloud non sostituisce l'ERP esistente: si integra nativamente sopra SAP S/4HANA, Microsoft Dynamics 365, Oracle NetSuite e TeamSystem Enterprise tramite connettori certificati. Aggiunge il livello operativo di controllo cantieri, governance progetti e dashboard direzionale che gli ERP generalisti non coprono per il settore edile.",
    },
    {
      q: "Come si gestisce il consolidamento multi-società in una holding edile?",
      a: "Edilizia in Cloud è multi-società nativo: ogni controllata, consorzio, ATI o SPV è una legal entity separata con piano dei conti proprio. Il modulo consolidato di gruppo applica elisioni intercompany automatiche, conversione valutaria e riclassifica IAS/IFRS, producendo bilancio consolidato pro-forma compatibile con OIC 17 e IFRS 10/11/12.",
    },
  ],
};

export default function GrandiImprese() {
  return <PerTipoPageTemplate config={config} />;
}
