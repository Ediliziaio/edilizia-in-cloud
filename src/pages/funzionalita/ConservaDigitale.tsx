import {
  AlertTriangle,
  Archive,
  Award,
  Database,
  FileCheck,
  FileSignature,
  FileText,
  FolderArchive,
  HardDrive,
  Inbox,
  Lock,
  Receipt,
  Scale,
  Search,
  ShieldCheck,
  Stamp,
  TrendingUp,
  Truck,
  Users,
} from "lucide-react";
import FunzionalitaPageTemplate from "./_template/FunzionalitaPageTemplate";
import type { FunzionalitaPageConfig } from "./_template/types";

const config: FunzionalitaPageConfig = {
  slug: "conserva-digitale",
  definizione:
    "Conserva Digitale di Edilizia in Cloud è la conservazione a norma del Codice dell'Amministrazione Digitale (D.Lgs 82/2005) per fatture elettroniche, contratti, DDT, libri contabili, SAL e documenti tecnici, con marca temporale qualificata AgID e responsabile della conservazione inclusi.",
  vertical: "Conservazione Digitale",
  productName: "Conservazione Digitale a Norma Edilizia in Cloud",
  audience:
    "Imprese edili, ristrutturatori e general contractor che devono conservare per 10 anni fatture, contratti, DDT, libri contabili a norma CAD (D.Lgs 82/2005) con marca temporale qualificata e responsabile della conservazione AgID",
  audienceShort: "imprese edili e amministrazioni",

  seo: {
    title:
      "Conservazione Digitale a Norma per Edilizia",
    description:
      "Conservazione decennale a norma CAD di fatture, contratti, DDT, libri contabili e SAL, con marca temporale AgID e responsabile della conservazione incluso.",
    keywords:
      "conservazione digitale edilizia, conservazione a norma CAD, marca temporale AgID, conservazione fatture elettroniche edilizia, archivio digitale impresa edile, D.Lgs 82/2005 edilizia, responsabile conservazione delegato, conservazione decennale fatture",
    ogImage: "https://www.ediliziaincloud.com/og/og-default.png",
  },

  heroBadge: "Funzionalità · Conservazione Digitale",
  heroH1Lead: "Conservazione decennale",
  heroH1Highlight: "a norma CAD",
  heroH1Tail: "senza pensarci più",
  heroSubheadline:
    "Conservazione digitale a norma D.Lgs 82/2005 (CAD) per fatture elettroniche, contratti, DDT, libri contabili, SAL e documenti tecnici. Marca temporale qualificata AgID, responsabile della conservazione delegato, esibizione GdF in 5 minuti, archivio cifrato per 10 anni. Tutto incluso, niente cartoni di faldoni.",
  heroPrimaryCta: "Prova gratis 31 giorni",
  heroSecondaryCta: "Tutte le funzionalità",
  heroSecondaryCtaTo: "/funzionalita",

  reassurancePoints: [
    "Conformità CAD D.Lgs 82/2005 garantita",
    "Marca temporale qualificata AgID",
    "Responsabile conservazione delegato",
  ],
  proofPoints: [
    "Conservazione automatica 10 anni",
    "Esibizione GdF in 5 minuti",
    "Archivio cifrato e immutabile",
  ],

  objectiveRow: [
    ["Obiettivo", "Eliminare faldoni cartacei e archivi locali"],
    ["Momento chiave", "Verifica GdF, controllo AdE, contestazione cliente"],
    ["Risultato", "60% di costo storico archiviazione risparmiato"],
  ],

  betaH2:
    "Più di 300 imprese italiane affidano la conservazione decennale a Edilizia in Cloud, eliminando faldoni e responsabilità interna sul CAD.",
  betaBody:
    "La Conservazione Digitale la attiviamo in 48 ore: configuriamo il responsabile della conservazione delegato (AgID), importiamo gli archivi storici, configuriamo le classi documentali, attiviamo la marca temporale qualificata e ti accompagniamo in 4 sessioni 1-a-1 fino al primo invio in conservazione.",

  speedH2:
    "Un'impresa edile con 200 fatture/mese genera 24.000 documenti in 10 anni. Tenerli a norma in cartaceo costa 8.000-15.000€.",
  speedSubheadline:
    "L'archivio cartaceo non è solo costo di scaffali e raccoglitori: è tempo di catalogazione, ricerche perse, faldoni rovinati, costi di smaltimento. La conservazione digitale a norma CAD non è un'opzione: è una scelta tra 'pago lo stesso meno' e 'pago di più senza valore aggiunto'.",
  speedStats: [
    { value: 60, prefix: "-", suffix: "%", label: "costo storico archiviazione cartacea" },
    { value: 10, suffix: " anni", label: "conservazione decennale automatica a norma" },
    { value: 5, suffix: " min", label: "esibizione documenti su richiesta GdF" },
  ],

  familyH2: "La conservazione digitale alimentata da tutto il ciclo documentale.",
  familySubheadline:
    "Ogni documento generato dal gestionale (fatture, contratti, DDT, SAL, varianti, foto cantiere) entra automaticamente in conservazione decennale a norma. Niente azioni manuali, niente rischio di documenti persi.",
  familyItems: [
    {
      icon: Receipt,
      title: "Fatturazione Elettronica SDI",
      text: "Fatture attive e passive conservate automaticamente per 10 anni a norma CAD.",
      to: "/funzionalita/fatturazione-elettronica",
    },
    {
      icon: Inbox,
      title: "Cassetto Fiscale SDI",
      text: "Fatture sincronizzate dal cassetto AdE entrano direttamente in conservazione.",
      to: "/funzionalita/cassetto-sdi",
    },
    {
      icon: FileSignature,
      title: "Firma Elettronica",
      text: "SAL, varianti, contratti firmati eIDAS conservati con marca temporale qualificata.",
      to: "/funzionalita/firma-elettronica",
    },
    {
      icon: Truck,
      title: "Ordini Acquisto",
      text: "DDT cantiere e ordini fornitore conservati a norma per 10 anni.",
      to: "/funzionalita/ordini-acquisto",
    },
    {
      icon: FileText,
      title: "Giornale Lavori",
      text: "Giornale lavori cantiere firmato e conservato a norma D.Lgs 81/2008.",
      to: "/funzionalita/giornale-lavori",
    },
    {
      icon: ShieldCheck,
      title: "Sicurezza Cantiere",
      text: "POS, DUVRI, PSC e tutta la documentazione sicurezza conservata 10 anni.",
      to: "/funzionalita/sicurezza-cantiere",
    },
  ],
  familyBonusTitle: "Una sola conservazione. Una sola firma. Una sola responsabilità delegata.",
  familyBonusText:
    "Tutto ciò che il gestionale produce o riceve entra in conservazione decennale automaticamente: fatture, contratti, SAL, DDT, libri contabili, POS sicurezza, foto cantiere geolocalizzate. Marca temporale qualificata AgID applicata su ogni documento, responsabile della conservazione delegato a Edilizia in Cloud (sollievo di responsabilità penale per il titolare).",

  painKicker: "Il problema vero",
  painH2:
    "Faldoni che riempiono lo studio. Fatture introvabili al controllo GdF. Responsabilità penale del titolare in caso di non conformità.",
  painSubheadline:
    "Il D.Lgs 82/2005 (CAD) impone conservazione decennale a norma per fatture elettroniche, libri contabili, DDT e atti aziendali. Conservare 'su disco fisso' non è conformità: serve marca temporale qualificata, responsabile della conservazione, processo certificato AgID. Senza questo, sanzioni e responsabilità penale.",
  painPoints: [
    {
      icon: Archive,
      title: "Faldoni che divorano lo studio",
      text: "Un'impresa media accumula 50-80 faldoni di documenti l'anno. In 10 anni fanno 500-800 faldoni: scaffali, costi affitto archivio, smaltimento sicuro a fine periodo (privacy GDPR). Costi reali 8.000-15.000€.",
    },
    {
      icon: AlertTriangle,
      title: "Documenti introvabili al controllo GdF",
      text: "GdF chiede documenti di 5 anni fa. 2 giorni di ricerca nei faldoni, qualcosa non si trova, qualcosa è rovinato. Sanzione amministrativa, riproposizione documenti, possibili procedimenti penali per omessa conservazione.",
    },
    {
      icon: Scale,
      title: "Responsabilità penale del titolare",
      text: "Il CAD impone un 'responsabile della conservazione'. Se è il titolare, in caso di non conformità risponde personalmente. Penale, civile e fiscale. Pochi titolari sanno di esserne formalmente responsabili.",
    },
    {
      icon: HardDrive,
      title: "'Conservazione su disco fisso' non è conformità",
      text: "Salvare PDF su computer, NAS o cloud non strutturato NON è conservazione a norma. Serve marca temporale qualificata, processo AgID, responsabile delegato. Senza questo, dal punto di vista AdE è come non averli conservati.",
    },
  ],

  baKicker: "Prima e dopo Edilizia in Cloud",
  baH2: "Stessi documenti, stessa normativa CAD. Cambia il rischio penale e il costo operativo.",
  baSubheadline:
    "La conservazione digitale a norma non è un nice-to-have: è un obbligo del D.Lgs 82/2005 con sanzioni e responsabilità penale. La differenza è tra fare le cose bene in modo automatico o sperare di non essere controllati.",
  baAreas: [
    {
      title: "Archiviazione fatture e atti",
      before:
        "Faldoni cartacei e PDF su NAS, organizzazione personale, niente marca temporale. Tempi di ricerca 20-40 minuti per documento, rischio sanzioni in caso di controllo.",
      after:
        "Archivio cifrato a norma CAD con marca temporale qualificata AgID su ogni documento. Ricerca semantica in 5 secondi, esibizione GdF immediata, conformità garantita per 10 anni.",
    },
    {
      title: "Responsabilità della conservazione",
      before:
        "Il titolare è formalmente responsabile della conservazione (anche senza saperlo). In caso di non conformità: sanzioni amministrative + responsabilità penale personale.",
      after:
        "Responsabile della conservazione delegato a Edilizia in Cloud (figura accreditata AgID). Il titolare è sollevato dalla responsabilità penale, l'azienda dalla responsabilità civile.",
    },
    {
      title: "Esibizione documenti a controlli",
      before:
        "GdF/AdE chiede dossier completo: 2-5 giorni di ricerca nei faldoni, possibili documenti mancanti, rifacimento copie, nervosismo dei dipendenti, rischio sanzioni.",
      after:
        "Filtri il periodo, esporti il dossier completo con marca temporale verificabile in 5 minuti. La GdF apre il PDF, verifica la marca AgID e va a casa.",
    },
    {
      title: "Costo totale archiviazione 10 anni",
      before:
        "Faldoni + scaffali + tempo segreteria + costo smaltimento sicuro: 8.000-15.000€ in 10 anni per un'impresa media. Costo nascosto, mai calcolato esplicitamente.",
      after:
        "Conservazione digitale inclusa nei piani Edilizia in Cloud: costo predicibile, scalabile, 60% in meno del costo storico cartaceo. Niente più armadi, niente più traslochi.",
    },
  ],

  mechanismKicker: "Come funziona",
  mechanismH2: "Tre passaggi per portare la tua impresa in conformità CAD totale.",
  mechanismSubheadline:
    "Il sistema applica marca temporale qualificata AgID, archiviazione cifrata, log di accesso e processo certificato. Il responsabile della conservazione delegato è una figura accreditata AgID con polizza professionale.",
  mechanismSteps: [
    {
      icon: Stamp,
      title: "Marca temporale qualificata applicata",
      text: "Su ogni documento (fattura, contratto, SAL, DDT) viene applicata marca temporale qualificata da Certification Authority accreditata AgID. Garantisce data certa, integrità, non ripudio.",
    },
    {
      icon: Lock,
      title: "Archiviazione cifrata immutabile",
      text: "Documenti cifrati AES-256, archiviati su data center europei certificati ISO 27001, replica geografica multi-sito, immutabilità garantita per 10 anni. Niente cancellazioni accidentali.",
    },
    {
      icon: FileCheck,
      title: "Esibizione GdF/AdE in 5 minuti",
      text: "In caso di verifica esporti dossier completo con manifest di conservazione, marca temporale AgID, log accessi, attestazione del responsabile delegato. Conformità immediata e verificabile.",
    },
  ],
  mechanismCta: "Apri la demo Conservazione Digitale",

  commercialKicker: "Perché conviene davvero",
  commercialH2: "Sollievo di responsabilità penale + 60% di costo risparmiato + esibizione immediata.",
  commercialBody:
    "La Conservazione Digitale a norma CAD non è solo riduzione di costi: è trasferimento di responsabilità a una figura accreditata AgID, è eliminazione di rischio penale, è conformità senza sforzo. Le imprese edili che attivano il modulo riducono in media del 60% il costo storico di archiviazione.",
  commercialLevers: [
    {
      icon: ShieldCheck,
      title: "Responsabile conservazione delegato AgID",
      text: "Trasferisci la responsabilità della conservazione a una figura accreditata AgID. Polizza professionale inclusa, sollievo di responsabilità penale e civile per il titolare.",
    },
    {
      icon: TrendingUp,
      title: "60% di costo storico risparmiato",
      text: "Eliminazione faldoni, scaffalature, costi smaltimento, tempo segreteria di catalogazione. Risparmio reale misurato sui clienti che hanno migrato dalla carta.",
    },
    {
      icon: Search,
      title: "Esibizione documenti in 5 minuti",
      text: "GdF/AdE chiede documenti? Filtri periodo e tipo, esporti dossier con marca temporale AgID. La verifica si chiude in 5 minuti, niente faldoni, niente nervosismo.",
    },
    {
      icon: Award,
      title: "Conformità CAD garantita per 10 anni",
      text: "Marca temporale qualificata AgID, processo certificato, replica geografica, immutabilità garantita. Niente più dubbi su 'è conforme?', è conforme per definizione.",
    },
  ],

  resultsKicker: "Risultati con Edilizia in Cloud",
  resultsH2: "Lo studio si svuota di faldoni. La responsabilità si sposta su chi è accreditato.",
  resultsBody:
    "Quando la conservazione decennale è gestita da chi è accreditato AgID con processo certificato, il titolare dell'impresa edile è libero da una responsabilità che spesso ignorava di avere. Le imprese che attivano il modulo Conservazione Digitale vedono cambiare 4 dimensioni operative concrete.",
  integrationPillars: [
    {
      icon: Stamp,
      title: "Marca temporale qualificata AgID",
      text: "Applicata su ogni documento da Certification Authority accreditata. Garantisce data certa, integrità, non ripudio. Validità legale equivalente alla raccomandata.",
    },
    {
      icon: Database,
      title: "Archivio cifrato immutabile",
      text: "AES-256, data center ISO 27001 europei, replica multi-sito, immutabilità garantita 10 anni. GDPR compliant, log accessi tracciato, audit trail completo.",
    },
    {
      icon: Users,
      title: "Responsabile conservazione delegato",
      text: "Figura accreditata AgID con polizza professionale, designata come responsabile ai sensi del CAD. Sollievo di responsabilità penale per il titolare.",
    },
    {
      icon: FolderArchive,
      title: "Classi documentali pre-configurate",
      text: "Fatture, contratti, DDT, libri contabili, SAL, POS sicurezza, foto cantiere. Ogni classe ha la sua policy di conservazione conforme normativa specifica.",
    },
  ],
  resultStats: [
    { value: 60, prefix: "-", suffix: "%", label: "costo storico archiviazione cartacea" },
    { value: 10, suffix: " anni", label: "conservazione automatica a norma garantita" },
    { value: 5, suffix: " min", label: "tempo medio esibizione documenti GdF" },
  ],
  resultsCta: "Apri la demo Conservazione Digitale",

  roiKicker: "Calcola il tuo ROI",
  roiH2: "Quanto risparmi rispetto al costo attuale di archiviazione cartacea?",
  roiSubheadline:
    "Sposta i cursori sulla tua realtà: numero di documenti conservati l'anno e costo storico (faldoni, scaffali, tempo segreteria). La stima parte dal -60% di costo osservato sui clienti che hanno migrato dalla carta.",
  roi: {
    input1Label: "Documenti conservati l'anno",
    input1Default: 5000,
    input1Min: 500,
    input1Max: 50000,
    input1Step: 100,
    input2Label: "Costo storico archiviazione cartacea (€)",
    input2Default: 4000,
    input2Min: 500,
    input2Max: 30000,
    input2Step: 100,
    input2Suffix: " €",
    outputLabel: "Risparmio annuo stimato",
    computeOutput: (a, b) => Math.round((a * 0.6 * b) / 100),
    computeSecondary: (a, b) => [
      { label: "Documenti conservati a norma 10 anni", value: `${(a * 10).toLocaleString("it-IT")}` },
      { label: "Riduzione costo storico", value: "60%" },
      { label: "Costo storico totale evitato (€)", value: `€ ${b.toLocaleString("it-IT")}` },
    ],
    closingPitch:
      "Stima prudenziale basata sul -60% di costo storico osservato sui clienti migrati dalla carta. Aggiungi il sollievo di responsabilità penale del titolare e i tempi di esibizione GdF ridotti del 95%.",
  },

  salesKicker: "Impatto operativo",
  salesH2: "Non un servizio di archiviazione. Un trasferimento di responsabilità a chi è accreditato.",
  salesBody:
    "La Conservazione Digitale Edilizia in Cloud non è un cloud storage premium: è un servizio di conservazione a norma con responsabile delegato accreditato AgID. Le imprese che lo attivano vedono cambiare 4 dimensioni operative concrete.",
  salesImpact: [
    {
      title: "Studio liberato da faldoni",
      text: "Lo spazio dello studio torna disponibile. Niente più scaffali, raccoglitori, costi di affitto archivio esterno. Stima media: 4-8 mq recuperati nello studio.",
    },
    {
      title: "Responsabilità trasferita a chi è accreditato",
      text: "Il titolare smette di essere il responsabile di legge della conservazione. Polizza professionale del responsabile delegato copre eventuali contestazioni.",
    },
    {
      title: "Conformità immediata a controllo GdF",
      text: "Verifica GdF? Filtri periodo e tipo, esporti dossier con marca AgID. Niente più giornate perse a cercare faldoni, niente sanzioni per omessa conservazione.",
    },
    {
      title: "Recupero veloce per contestazioni cliente",
      text: "Cliente contesta SAL del 2022? Cerchi per cantiere, trovi SAL firmato eIDAS con marca temporale, scarichi e mostri. La discussione si chiude in 5 minuti.",
    },
  ],

  featureKicker: "Cosa ottieni davvero",
  featureH2: "Non promesse generiche. Un elenco concreto di cosa attiviamo in 48 ore.",
  featureRows: [
    {
      label: "Marca temporale qualificata AgID",
      value:
        "Applicata su ogni documento da Certification Authority accreditata AgID. Garantisce data certa, integrità, non ripudio, validità legale equivalente alla raccomandata.",
    },
    {
      label: "Responsabile conservazione delegato",
      value:
        "Figura accreditata AgID con polizza professionale, designata formalmente come responsabile della conservazione ai sensi del CAD. Sollievo di responsabilità penale.",
    },
    {
      label: "Archivio cifrato AES-256 immutabile",
      value:
        "Cifratura a riposo e in transito, data center ISO 27001 europei, replica geografica multi-sito, immutabilità garantita per 10 anni, audit trail completo.",
    },
    {
      label: "Classi documentali pre-configurate",
      value:
        "Fatture attive/passive, contratti, DDT, libri contabili, registri IVA, SAL, varianti, POS sicurezza, foto cantiere, autorizzazioni. Ogni classe con policy conforme.",
    },
    {
      label: "Conservazione automatica da tutto il gestionale",
      value:
        "Ogni documento prodotto dal gestionale (fatture, SAL firmati, DDT, ecc.) entra automaticamente in conservazione. Niente azione manuale, niente rischio dimenticanze.",
    },
    {
      label: "Esibizione GdF/AdE 1-click",
      value:
        "Filtra periodo, classe, cantiere, fornitore. Esporta dossier ZIP con manifest di conservazione, marca AgID, log accessi, attestazione responsabile. Pronto in 5 minuti.",
    },
    {
      label: "Migrazione archivio storico inclusa",
      value:
        "Nei primi 30 giorni importiamo gratuitamente fino a 10.000 documenti dell'archivio cartaceo o digitale esistente, applicando marca temporale e classificazione.",
    },
  ],

  scenarioKicker: "Tre casi reali sul campo",
  scenarioH2: "Tre situazioni in cui la Conservazione Digitale cambia la giornata.",
  scenarios: [
    {
      title: "Verifica GdF venerdì pomeriggio",
      text: "Venerdì 16:30 arriva avviso GdF: martedì vogliono dossier 5 anni di fatture passive cantiere X. Senza conservazione: weekend a cercare nei faldoni. Con conservazione digitale: filtri, esporti, finito in 5 minuti.",
    },
    {
      title: "Cliente contesta SAL del 2022",
      text: "Cliente dice 'non ho mai firmato il SAL del 12 luglio 2022'. Cerchi per cantiere, trovi SAL firmato eIDAS con marca temporale qualificata AgID. Mostri la verifica indipendente: la contestazione cade.",
    },
    {
      title: "Avvocato chiede contratto subappalto",
      text: "Tuo avvocato per causa civile chiede contratto subappalto del 2020 con appendici e DURC originali dell'epoca. Cerchi, esporti dossier completo con tutti i documenti datati e marcati. L'avvocato ha tutto in 10 minuti.",
    },
  ],

  testimonialQuote:
    "Avevo 80 faldoni di archivio cartaceo nello studio, era diventato un magazzino. Ho attivato la Conservazione Digitale, in 30 giorni hanno digitalizzato tutto e applicato marca temporale. La GdF è passata 4 mesi dopo, ho esportato il dossier in 7 minuti, sono andati via in 20 minuti. Lo studio adesso sembra un ufficio, non un archivio.",
  testimonialAuthor: "Riccardo F.",
  testimonialRole: "Costruzioni Adriatiche Srl, Ancona",

  faqKicker: "Domande frequenti",
  faqH2: "Quello che un titolare di impresa edile vuole sapere prima di decidere.",
  faqs: [
    {
      q: "La conservazione su disco fisso o su Google Drive non basta?",
      a: "No. Il D.Lgs 82/2005 (CAD) impone marca temporale qualificata, processo certificato e responsabile della conservazione. Senza questi tre elementi i documenti NON sono conservati a norma e in caso di controllo AdE/GdF è come non averli conservati: sanzioni amministrative e possibili procedimenti penali per omessa conservazione.",
    },
    {
      q: "Il responsabile della conservazione delegato copre la mia responsabilità?",
      a: "Sì. Il responsabile delegato è una figura accreditata AgID con polizza professionale, designata formalmente come responsabile ai sensi del CAD. La responsabilità penale della conservazione si trasferisce a lui, il titolare è sollevato da questa specifica responsabilità.",
    },
    {
      q: "Cosa succede se Edilizia in Cloud chiude o smette il servizio?",
      a: "Garantiamo per contratto la portabilità dell'archivio: in caso di cessazione, esportiamo l'intero archivio cifrato con marca temporale verificabile su qualsiasi altro conservatore accreditato AgID. Replica geografica multi-sito impedisce perdita dati.",
    },
    {
      q: "Posso conservare anche documenti non generati dal gestionale?",
      a: "Sì. Puoi caricare manualmente o via API qualsiasi documento (PDF, XML, immagini, file CAD): viene marcato temporalmente e archiviato secondo la classe documentale corretta. Tipico esempio: certificazioni materiali, dichiarazioni di conformità, foto post-collaudo.",
    },
    {
      q: "La marca temporale ha valore legale anche all'estero?",
      a: "Sì. La marca temporale qualificata applicata è conforme al regolamento eIDAS (UE 910/2014), riconosciuta in tutti i paesi UE. Validità legale equivalente alla data certa, opponibile a terzi e in giudizio anche fuori Italia.",
    },
    {
      q: "Quanto costa? Ci sono limiti sul numero di documenti?",
      a: "La Conservazione Digitale è inclusa nei piani Professional e Business di Edilizia in Cloud. Numero di documenti illimitato fino a 50.000/anno, marca temporale e responsabile delegato compresi, migrazione storico inclusa nei primi 30 giorni.",
    },
  ],

  internalLinksKicker: "Esplora la piattaforma",
  internalLinksH2: "La conservazione vive collegata a tutto il ciclo documentale.",
  internalLinksBody:
    "Ogni documento prodotto dal gestionale (fatture SDI, SAL firmati, DDT, contratti) entra automaticamente in conservazione decennale a norma CAD.",
  internalLinks: [
    { to: "/funzionalita/fatturazione-elettronica", title: "Fatturazione Elettronica", text: "Fatture SDI conservate automaticamente a norma CAD per 10 anni." },
    { to: "/funzionalita/cassetto-sdi", title: "Cassetto Fiscale SDI", text: "Fatture passive sincronizzate dal cassetto AdE in conservazione." },
    { to: "/funzionalita/firma-elettronica", title: "Firma Elettronica", text: "SAL e contratti firmati eIDAS conservati con marca temporale." },
    { to: "/funzionalita/giornale-lavori", title: "Giornale Lavori", text: "Giornale di cantiere conservato a norma D.Lgs 81/2008." },
    { to: "/funzionalita/sicurezza-cantiere", title: "Sicurezza Cantiere", text: "POS, DUVRI, PSC conservati 10 anni con marca temporale." },
    { to: "/funzionalita/foto-cantiere", title: "Foto Cantiere", text: "Foto cantiere geolocalizzate conservate con valore probatorio." },
    { to: "/funzionalita/ordini-acquisto", title: "Ordini Acquisto", text: "DDT cantiere e ordini fornitore conservati 10 anni a norma." },
    { to: "/per/imprese-edili", title: "Software per Imprese di Costruzione", text: "Tutta la piattaforma orientata alle imprese edili italiane." },
    { to: "/prezzi", title: "Prezzi e Piani", text: "Conservazione Digitale inclusa nei piani Professional e Business." },
  ],

  finalCtaH2:
    "Smetti di accumulare faldoni. Smetti di essere il responsabile della conservazione di legge.",
  finalCtaBody:
    "31 giorni gratuiti per portare la tua impresa edile in conformità CAD totale. Setup in 48 ore, marca temporale qualificata AgID, responsabile della conservazione delegato e migrazione archivio storico inclusi. Onboarding 1-a-1, cancelli quando vuoi.",
  finalCtaButton: "Prova gratis 31 giorni",
  finalCtaMicrocopy: "Setup in 48 ore · Marca AgID · Responsabile delegato",

  stickyCtaLabel: "Prova gratis Conservazione Digitale",
  stickyCtaMicrocopy: "Setup 48h · Conformità CAD garantita",

  applicationSubCategory: "Construction Digital Preservation Software",

  relatedBlogSlugs: ["come-fare-preventivo-edilizia", "alternativa-excel-cantieri"],
};

export default function ConservaDigitale() {
  return <FunzionalitaPageTemplate config={config} />;
}
