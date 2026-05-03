import {
  AlertTriangle,
  BarChart3,
  Battery,
  Bell,
  Building2,
  CheckCircle2,
  ClipboardList,
  Cpu,
  Euro,
  FileSignature,
  FileText,
  Gauge,
  HardHat,
  Layers,
  Leaf,
  Receipt,
  Search,
  ShieldCheck,
  Sparkles,
  Sun,
  Target,
  Timer,
  TrendingUp,
  Wallet,
  Wrench,
  Zap,
} from "lucide-react";
import FunzionalitaPageTemplate from "./_template/FunzionalitaPageTemplate";
import type { FunzionalitaPageConfig } from "./_template/types";

const config: FunzionalitaPageConfig = {
  slug: "fotovoltaico",
  vertical: "Gestione Cantieri Fotovoltaico",
  productName: "Modulo Cantieri Fotovoltaico Edilizia in Cloud",
  audience:
    "Imprese installatrici fotovoltaico residenziale e industriale, EPC, system integrator e general contractor energia che devono gestire pratiche GSE, Superbonus, Conto Termico, pratiche enel/distributore, schede tecniche pannelli e cantieri rapidi ad alta marginalità",
  audienceShort: "installatori fotovoltaico ed EPC",

  seo: {
    title:
      "Software Gestione Cantieri Fotovoltaico",
    description:
      "Gestisci impianti fotovoltaici residenziali e industriali con pratiche GSE, Superbonus 110%, Conto Termico, pratiche distributore e schede tecniche…",
    keywords:
      "software gestione fotovoltaico, gestionale impianti fotovoltaici, pratiche GSE software, software Superbonus fotovoltaico, gestionale EPC fotovoltaico, software installatori solare, pratiche enel distributore software, conto termico software, scambio sul posto gestione, gestione impianti residenziali industriali",
    ogImage: "https://www.ediliziaincloud.com/og/fotovoltaico-og.jpg",
  },

  heroBadge: "Funzionalità · Cantieri Fotovoltaico",
  heroH1Lead: "Gestisci ogni impianto fotovoltaico",
  heroH1Highlight: "dal sopralluogo all'allaccio",
  heroH1Tail: "senza Excel",
  heroSubheadline:
    "Una piattaforma unica per impianti residenziali e industriali: gestione cantieri FV, pratiche GSE per Scambio sul Posto e Ritiro Dedicato, dossier Superbonus 110% e Conto Termico, pratica TICA al distributore, schede tecniche pannelli e inverter, tracking marginalità per impianto e portale cliente con monitoraggio produzione.",
  heroPrimaryCta: "Prova gratis 31 giorni",
  heroSecondaryCta: "Tutte le funzionalità",
  heroSecondaryCtaTo: "/funzionalita",

  reassurancePoints: [
    "Setup in 48 ore con import portafoglio impianti",
    "Pratiche GSE e distributore preconfigurate",
    "Modelli Superbonus 110% e Conto Termico inclusi",
  ],
  proofPoints: [
    "Pratiche GSE/Enel guidate passo-passo",
    "Schede tecniche pannelli e inverter integrate",
    "Marginalità per impianto in tempo reale",
  ],

  objectiveRow: [
    ["Obiettivo", "Chiudere ogni impianto FV con allaccio e GSE in 60 giorni"],
    ["Momento chiave", "Sopralluogo, pratica TICA, montaggio, allaccio, GSE"],
    ["Risultato", "Più impianti/anno, marginalità tracciata, zero pratiche perse"],
  ],

  betaH2:
    "Più di 180 imprese installatrici fotovoltaico in Italia gestiscono il loro portafoglio impianti con Edilizia in Cloud.",
  betaBody:
    "Attiviamo il modulo Fotovoltaico in 48 ore: importiamo i tuoi impianti attivi, configuriamo i template di pratica GSE (Scambio sul Posto, Ritiro Dedicato, autoconsumo), i modelli Superbonus 110% / Conto Termico, le pratiche TICA al distributore e i prezzari pannelli/inverter. 4 sessioni 1-a-1 con un consulente verticale FV fino al primo impianto chiuso end-to-end.",

  speedH2:
    "Da sopralluogo ad allaccio in 60 giorni. Non in 6 mesi come capita oggi a chi tiene tutto su Excel.",
  speedSubheadline:
    "Un impianto FV residenziale ha mediamente 9 step burocratici (sopralluogo, preventivo, contratto, TICA, montaggio, collaudo, allaccio, GSE, fattura) e 4 attori (cliente, distributore, GSE, agenzia). Senza un sistema unico ogni step si dilata: con Edilizia in Cloud chiudi il ciclo in 60 giorni medi e raddoppi gli impianti gestibili a parità di team.",
  speedStats: [
    { value: 60, suffix: " gg", label: "tempo medio sopralluogo → allaccio" },
    { value: 2, prefix: "x", suffix: "", label: "impianti gestibili a parità di team" },
    { value: 100, suffix: "%", label: "pratiche GSE tracciate senza scadenze perse" },
  ],

  familyH2: "Fotovoltaico è un cantiere, una pratica e un cliente. Tutto già nella piattaforma.",
  familySubheadline:
    "Un impianto FV non è solo montaggio pannelli: è preventivazione tecnica, pratica GSE, dossier Superbonus, fattura, manutenzione decennale. Con Edilizia in Cloud i moduli parlano tra loro: il preventivo diventa cantiere, il cantiere genera la pratica, la pratica produce la fattura, il monitoraggio produzione vive sul portale cliente.",
  familyItems: [
    {
      icon: Sun,
      title: "Cantieri Fotovoltaico",
      text: "Gestione end-to-end impianti residenziali e industriali, pratiche GSE, Superbonus, schede pannelli.",
      to: "/funzionalita/fotovoltaico",
    },
    {
      icon: ClipboardList,
      title: "Preventivi Edilizia",
      text: "Computo metrico fotovoltaico con prezzari pannelli, inverter, accumulo, manodopera.",
      to: "/funzionalita/preventivi-edilizia",
    },
    {
      icon: HardHat,
      title: "Gestione Cantieri",
      text: "Pianificazione installazione, squadre montaggio, fornitori pannelli, tempistiche allaccio.",
      to: "/funzionalita/gestione-cantieri",
    },
    {
      icon: Receipt,
      title: "Fatturazione Elettronica SDI",
      text: "Fatture acconto, SAL, saldo con codici natura corretti per Superbonus e cessione del credito.",
      to: "/funzionalita/fatturazione-elettronica",
    },
    {
      icon: Wallet,
      title: "Finanziamenti Cantieri",
      text: "Cessione credito Superbonus, anticipo SAL, factoring fatture impianti FV industriali.",
      to: "/funzionalita/finanziamenti-cantieri",
    },
    {
      icon: Wrench,
      title: "Manutenzione Impianti",
      text: "Manutenzione programmata decennale impianti FV, libretti, scadenze normative.",
      to: "/funzionalita/manutenzione-impianti",
    },
  ],
  familyBonusTitle: "Una sola piattaforma. Dal lead al monitoraggio post-allaccio.",
  familyBonusText:
    "Quando un lead Facebook entra come 'fotovoltaico residenziale', il CRM lo qualifica, il preventivo viene generato dal modulo Quote Builder AI, l'impianto entra in cantiere, la pratica GSE parte automatica con scadenze tracciate, la fattura viene emessa via SDI con codice natura corretto per cessione del credito. Tutto senza data entry duplicato.",

  painKicker: "Il problema vero",
  painH2:
    "Excel più cartelle GSE più WhatsApp con il distributore. È così che si perdono pratiche e marginalità.",
  painSubheadline:
    "L'installatore FV medio gestisce 30-150 impianti/anno con strumenti scollegati: preventivo Excel, contratto Word, pratica GSE manuale sul portale, pratica TICA via PEC, fattura sul gestionale fiscale. Nessun sistema vede l'impianto end-to-end. Risultato: scadenze GSE perse, ritardi allaccio, marginalità reali ignote.",
  painPoints: [
    {
      icon: AlertTriangle,
      title: "Pratica GSE persa = anno di incentivi bruciato",
      text: "Lo Scambio sul Posto va richiesto entro 60 giorni dall'allaccio. Se la segreteria si dimentica, l'incentivo salta per un anno intero. Su un impianto da 6 kW sono 600-900€ di mancato ricavo per il cliente, contestazioni inevitabili.",
    },
    {
      icon: FileText,
      title: "Schede tecniche pannelli/inverter rincorse a mano",
      text: "Pratica GSE richiede schede tecniche, certificati CE, datasheet inverter, garanzie. Senza un archivio strutturato per modello, ogni pratica costa 2-3 ore di ricerca tra email, cartelle Drive e siti produttori.",
    },
    {
      icon: Euro,
      title: "Marginalità reale dell'impianto sconosciuta",
      text: "Tra preventivo (10% marg.) e consuntivo (4% marg.) ci sono ore extra installazione, sopralluoghi multipli, contestazioni cliente. Senza tracking per impianto, vendi 30 kW e scopri a fine anno di averci perso. Su FV i margini sono sottili: serve precisione.",
    },
    {
      icon: Timer,
      title: "TICA al distributore lenta perché sparpagliata",
      text: "Pratica TICA va inviata al distributore (E-Distribuzione, Areti, Unareti, Acea) con planimetrie, schemi unifilari, certificazioni. Senza template per distributore, ogni pratica è 4 ore. E ogni rifiuto per 'documenti incompleti' aggiunge 30-45 giorni di ritardo.",
    },
  ],

  baKicker: "Prima e dopo Edilizia in Cloud",
  baH2: "Stessi pannelli, stesso cliente, stesso allaccio. Cambia il tempo di chiusura e la marginalità.",
  baSubheadline:
    "Edilizia in Cloud non installa pannelli al posto tuo. Ma elimina il caos burocratico che divora il 40% del tempo di chi installa fotovoltaico oggi. Risultato: più impianti chiusi, meno errori GSE, marginalità tracciata.",
  baAreas: [
    {
      title: "Pratica GSE Scambio sul Posto",
      before:
        "Tecnico apre il portale GSE, copia dati dal preventivo Excel, allega manualmente schede pannelli cercate su Drive, scrive a mano matricole inverter. 3 ore per pratica, errore di matricola = pratica respinta.",
      after:
        "Pratica GSE generata automaticamente dai dati cantiere: matricole inverter da scheda tecnica, schede pannelli dall'archivio prodotti, dati cliente dal CRM. 20 minuti per pratica, zero errori di trascrizione.",
    },
    {
      title: "Dossier Superbonus 110%",
      before:
        "Dossier Superbonus su 12 cartelle Drive: APE pre/post, asseverazione tecnica, computo metrico, fatture, bonifici parlanti, visto di conformità. Ogni cessione credito serve 2 settimane di preparazione.",
      after:
        "Dossier Superbonus generato automatico in PDF con indice, tutti i documenti firmati eIDAS, fatture SDI con codice natura corretto, asseverazioni timbrate dal tecnico abilitato. Pronto per cessione in 1 giorno.",
    },
    {
      title: "Pratica TICA distributore",
      before:
        "TICA a E-Distribuzione: planimetria stampata, schema unifilare disegnato a mano, dati impianto trascritti, invio via PEC. Spesso respinta per 'documenti non leggibili'. 4 ore + 30 giorni di rilavorazione.",
      after:
        "TICA precompilata con template per ogni distributore (E-Distribuzione, Areti, Unareti, Acea), planimetrie georiferite, schema unifilare auto-generato dai dati impianto. Invio PEC tracciato, rifiuti -90%.",
    },
    {
      title: "Marginalità impianto in tempo reale",
      before:
        "Marginalità nota solo a fine anno guardando il bilancio. Impianti in perdita scoperti dopo 6 mesi, troppo tardi per correggere preventivi futuri o rinegoziare con fornitori pannelli.",
      after:
        "Marginalità per impianto aggiornata ogni giorno: costi diretti (pannelli, inverter, manodopera), costi indiretti (sopralluogo, pratiche, garanzia), ricavo. Vedi subito quale impianto sta erodendo margine.",
    },
  ],

  mechanismKicker: "Come funziona",
  mechanismH2: "Tre passaggi dal lead al monitoraggio post-allaccio.",
  mechanismSubheadline:
    "Il modulo Fotovoltaico è progettato per chi installa 30-300 impianti/anno: ogni step ha template precompilati, pratiche guidate, scadenze automatiche. Non serve formare il team: il sistema accompagna ogni pratica.",
  mechanismSteps: [
    {
      icon: Search,
      title: "Sopralluogo digitale e preventivo tecnico",
      text: "Capocantiere fa sopralluogo da app mobile: foto tetto, dati orientamento/inclinazione, ombreggiamenti, contatore. Il sistema genera preventivo con dimensionamento pannelli/inverter, simulazione produzione kWh/anno, ROI cliente.",
    },
    {
      icon: ClipboardList,
      title: "Cantiere + pratica GSE + TICA in parallelo",
      text: "Impianto entra in cantiere, squadra installazione pianificata, materiali ordinati ai fornitori. In parallelo parte la pratica TICA al distributore e si predispone la pratica GSE. Scadenze sincronizzate.",
    },
    {
      icon: Bell,
      title: "Allaccio, GSE, fattura, monitoraggio",
      text: "Distributore comunica allaccio, sistema lancia automatico la richiesta Scambio sul Posto entro 60 giorni, fattura emessa con codice natura corretto, cliente riceve accesso al portale per monitoraggio produzione kWh in tempo reale.",
    },
  ],
  mechanismCta: "Apri la dashboard Fotovoltaico",

  commercialKicker: "Perché conviene davvero",
  commercialH2: "Più impianti chiusi, marginalità più alta, zero scadenze GSE perse.",
  commercialBody:
    "Le imprese installatrici che adottano Edilizia in Cloud chiudono in media il 40% di impianti in più all'anno a parità di team, alzano il margine medio di 3-4 punti grazie al tracking puntuale dei costi e azzerano le pratiche GSE perse per dimenticanza. Il fotovoltaico ha margini sottili: la differenza la fa l'efficienza burocratica.",
  commercialLevers: [
    {
      icon: TrendingUp,
      title: "Più impianti chiusi/anno a parità di team",
      text: "Riducendo il tempo burocratico per impianto (oggi 30-40 ore/impianto), il tuo team gestisce 40% di impianti in più con stesso costo fisso. Ricavi su, costi fissi stabili: margine operativo amplificato.",
    },
    {
      icon: Euro,
      title: "Marginalità +3-4 punti per impianto",
      text: "Tracking puntuale costi diretti (pannelli, inverter, manodopera) e indiretti (sopralluoghi extra, pratiche, garanzie). Identifichi quali fornitori erodono margine e quali clienti chiedono troppe modifiche.",
    },
    {
      icon: ShieldCheck,
      title: "Zero pratiche GSE perse per dimenticanza",
      text: "Scadenze Scambio sul Posto, Ritiro Dedicato, Conto Termico tracciate automaticamente. Notifiche prima della deadline. Niente più 'ci siamo dimenticati' che brucia un anno di incentivi al cliente.",
    },
    {
      icon: Sparkles,
      title: "Brand percepito come EPC strutturato",
      text: "Cliente residenziale e industriale percepisce immediatamente la differenza tra 'installatore con Excel' e 'EPC con piattaforma cloud'. Ticket medio +15%, sconti chiesti -20%, recensioni 5★ in crescita.",
    },
  ],

  resultsKicker: "Risultati con Edilizia in Cloud",
  resultsH2: "Dal sopralluogo all'allaccio in 60 giorni medi. Marginalità reale per ogni impianto.",
  resultsBody:
    "Quando ogni impianto FV vive in un sistema unico — preventivo, cantiere, pratica GSE, fattura, monitoraggio — i tempi calano, la marginalità sale e la qualità del servizio al cliente diventa la tua arma commerciale. Chi installa 50 impianti/anno con Excel passa a 75-90 con Edilizia in Cloud.",
  integrationPillars: [
    {
      icon: Sun,
      title: "Pratiche GSE preconfigurate",
      text: "Scambio sul Posto, Ritiro Dedicato, Conto Termico, Superbonus 110%. Template per ogni regime, scadenze automatiche, archivio documentale conforme.",
    },
    {
      icon: Zap,
      title: "TICA distributore template-driven",
      text: "E-Distribuzione, Areti, Unareti, Acea, AEEW e distributori locali. Schema unifilare auto-generato, planimetrie georiferite, invio PEC tracciato.",
    },
    {
      icon: Layers,
      title: "Archivio prodotti pannelli/inverter",
      text: "Schede tecniche, certificati CE, datasheet, garanzie organizzati per modello. La pratica GSE pesca i documenti corretti senza ricerca manuale.",
    },
    {
      icon: BarChart3,
      title: "Monitoraggio produzione cliente",
      text: "Portale cliente con kWh prodotti in tempo reale, risparmio CO2, ROI dell'impianto. Trasparenza che alimenta passaparola caldo.",
    },
  ],
  resultStats: [
    { value: 40, prefix: "+", suffix: "%", label: "impianti chiusi/anno a parità di team" },
    { value: 60, suffix: " gg", label: "tempo medio sopralluogo → allaccio" },
    { value: 100, suffix: "%", label: "pratiche GSE tracciate senza scadenze perse" },
  ],
  resultsCta: "Apri la dashboard Fotovoltaico",

  roiKicker: "Calcola il tuo ROI",
  roiH2: "Quanto vale alzare di un punto la marginalità su ogni impianto FV che installi?",
  roiSubheadline:
    "Sposta i cursori sui tuoi numeri reali: impianti FV chiusi all'anno e ticket medio per impianto. La stima parte dal +5% di marginalità incrementale registrata dai clienti Edilizia in Cloud nel primo anno.",
  roi: {
    input1Label: "Impianti FV/anno installati",
    input1Default: 40,
    input1Min: 5,
    input1Max: 200,
    input1Step: 1,
    input2Label: "Ticket medio impianto (€)",
    input2Default: 18000,
    input2Min: 6000,
    input2Max: 250000,
    input2Step: 500,
    input2Suffix: " €",
    outputLabel: "Marginalità incrementale annua stimata",
    computeOutput: (a, b) => Math.round(a * b * 0.05),
    computeSecondary: (a, b) => [
      { label: "Volume gestito/anno", value: `${(a * b).toLocaleString("it-IT")} €` },
      { label: "Impianti extra gestibili (+40%)", value: `${Math.round(a * 0.4)}` },
      { label: "Ore burocratiche risparmiate/anno", value: `${Math.round(a * 18)} h` },
    ],
    closingPitch:
      "Stima conservativa al 5% di marginalità extra. Aggiungi gli impianti extra che il team riesce a gestire (+40%) e il valore delle pratiche GSE non più perse: il ROI reale è superiore.",
  },

  salesKicker: "Impatto operativo",
  salesH2: "Non un gestionale generico. Una piattaforma costruita per chi vive di kWp installati.",
  salesBody:
    "Edilizia in Cloud parla la lingua del fotovoltaico: GSE, TICA, asseverazione, scambio sul posto, cessione credito. Le 4 dimensioni operative che cambiano dal primo mese.",
  salesImpact: [
    {
      title: "Pipeline impianti sempre sotto controllo",
      text: "Ogni impianto ha uno stato visibile (sopralluogo, preventivo, contratto, TICA, montaggio, allaccio, GSE, fatturato). Niente più impianti 'fermi' che nessuno sa più dove sono.",
    },
    {
      title: "Pratiche burocratiche dimezzate",
      text: "TICA, GSE, Conto Termico, Superbonus generate da template. Tempo per pratica passa da 3-4 ore a 30-45 minuti. La segreteria torna a fare lavoro a valore.",
    },
    {
      title: "Cessione credito Superbonus pronta in 1 giorno",
      text: "Dossier completo (asseverazione, APE, fatture, bonifici, visto) generato automatico in PDF. Banche e factoring accettano cessione senza richieste integrative.",
    },
    {
      title: "Manutenzione decennale come ricavo ricorrente",
      text: "Ogni impianto allacciato genera scheda manutenzione decennale, libretto FV, scadenze pulizia/verifica. Trasformi la garanzia in ricavo ricorrente con contratti annuali.",
    },
  ],

  featureKicker: "Cosa ottieni davvero",
  featureH2: "Funzioni concrete per chi installa fotovoltaico, non promesse generiche.",
  featureRows: [
    {
      label: "Dimensionamento impianto da sopralluogo",
      value:
        "App mobile capocantiere: foto tetto, orientamento, inclinazione, ombreggiamento, contatore. Sistema suggerisce kWp, n° pannelli, inverter, accumulo coerenti con consumi cliente.",
    },
    {
      label: "Pratiche GSE Scambio sul Posto e Ritiro Dedicato",
      value:
        "Template precompilati con dati impianto, matricole inverter, schede pannelli. Invio guidato al portale GSE, tracking scadenze 60 giorni post-allaccio, archivio convenzioni.",
    },
    {
      label: "Dossier Superbonus 110% e Conto Termico",
      value:
        "APE pre/post, asseverazione tecnica abilitata, computo metrico, fatture SDI con codice natura corretto, bonifici parlanti tracciati, visto di conformità. Pronto per cessione credito o sconto in fattura.",
    },
    {
      label: "Pratica TICA per ogni distributore",
      value:
        "Template specifici E-Distribuzione, Areti, Unareti, Acea, AEEW. Schema unifilare auto-generato, planimetrie georiferite, invio PEC tracciato con ricevute archiviate.",
    },
    {
      label: "Archivio schede tecniche pannelli e inverter",
      value:
        "Database prodotti con datasheet, certificati CE, dichiarazioni di prestazione, garanzie 25 anni. La pratica GSE pesca automaticamente i documenti corretti per modello installato.",
    },
    {
      label: "Marginalità per impianto in tempo reale",
      value:
        "Costi diretti (pannelli, inverter, manodopera squadra), costi indiretti (sopralluogo, pratiche, garanzia), ricavo. Vedi quale impianto sta erodendo margine prima della consuntivazione.",
    },
    {
      label: "Portale cliente con monitoraggio produzione",
      value:
        "Cliente vede in tempo reale kWh prodotti, autoconsumo, scambio rete, risparmio bolletta, CO2 evitata. Integrazione con datalogger principali (SolarEdge, Huawei, Fronius, SMA).",
    },
  ],

  scenarioKicker: "Tre casi reali sul campo",
  scenarioH2: "Tre situazioni in cui il modulo Fotovoltaico cambia la giornata.",
  scenarios: [
    {
      title: "Pratica GSE da chiudere entro 7 giorni",
      text:
        "Impianto allacciato 53 giorni fa, scadenza Scambio sul Posto tra 7. Sistema notifica capocantiere e segreteria, apre task con tutti i documenti già pronti (matricole, schede, dati cliente). Pratica inviata in 25 minuti, incentivo salvato.",
    },
    {
      title: "Cliente industriale da 200 kWp con cessione credito",
      text:
        "Capannone 200 kWp Superbonus richiede dossier completo per banca. Sistema genera PDF unico con asseverazione, APE, computo, fatture SDI, bonifici parlanti. Banca accetta cessione in 48 ore, niente richieste integrative.",
    },
    {
      title: "Sopralluogo veloce con preventivo in giornata",
      text:
        "Lead Facebook entra alle 9. Capocantiere fa sopralluogo alle 14 con app mobile, foto e dati. Preventivo generato alle 16:30 con simulazione produzione e ROI. Cliente riceve via email + portale, firma online entro sera.",
    },
  ],

  testimonialQuote:
    "Installavo 35 impianti l'anno con Excel e cartelle Drive: passavo le serate a inseguire pratiche GSE. Con Edilizia in Cloud sono salito a 58 impianti l'anno con lo stesso team, e ho recuperato 4 punti di marginalità grazie al tracking dei costi reali. La cosa che mi ha sorpreso di più: zero pratiche GSE perse in 14 mesi.",
  testimonialAuthor: "Marco P.",
  testimonialRole: "Sole Energy Srl, Padova",

  faqKicker: "Domande frequenti",
  faqH2: "Quello che un installatore FV vuole sapere prima di decidere.",
  faqs: [
    {
      q: "Gestisce sia impianti residenziali che industriali sopra 200 kWp?",
      a: "Sì. Il modulo è dimensionato per impianti da 3 kWp residenziali fino a 1 MWp industriali. Cambiano i template (Scambio sul Posto fino a 200 kWp, Ritiro Dedicato sopra), gli schemi unifilari, le pratiche TICA. Tutti già preconfigurati nel sistema.",
    },
    {
      q: "Si integra con i datalogger degli inverter per il monitoraggio?",
      a: "Sì, integrazione nativa con SolarEdge, Huawei, Fronius, SMA via API ufficiali. Il portale cliente mostra kWh prodotti, autoconsumo, immissione in rete, risparmio bolletta in tempo reale. Niente sviluppo custom richiesto.",
    },
    {
      q: "Genera il dossier Superbonus 110% completo per la cessione del credito?",
      a: "Sì. Il dossier include APE pre/post, asseverazione tecnica firmata digitalmente da tecnico abilitato, computo metrico, fatture SDI con codice natura N6.7, bonifici parlanti tracciati, visto di conformità del commercialista. PDF unico pronto per banca o piattaforma cessione.",
    },
    {
      q: "Tiene traccia delle scadenze GSE in modo affidabile?",
      a: "Sì. Per ogni impianto allacciato il sistema crea timer automatici: 60 giorni per Scambio sul Posto, scadenze Conto Termico, rinnovi convenzioni. Notifiche al referente pratica 30/15/7 giorni prima della deadline. Storico completo nel cassetto pratiche.",
    },
    {
      q: "Posso gestire anche pompe di calore e accumulo, non solo pannelli?",
      a: "Sì. Il modulo è esteso a pompe di calore (con pratica Conto Termico 2.0), sistemi di accumulo (con detrazione fiscale dedicata), colonnine di ricarica EV. Stesso flusso: cantiere, pratica, fattura, manutenzione decennale.",
    },
    {
      q: "Quanto costa? È incluso nei piani standard o è add-on?",
      a: "Il modulo Fotovoltaico è incluso nei piani Professional e Business di Edilizia in Cloud. Numero di impianti illimitato, integrazioni datalogger incluse, template GSE/TICA aggiornati gratuitamente quando GSE cambia normativa. Cancelli quando vuoi.",
    },
  ],

  internalLinksKicker: "Esplora la piattaforma",
  internalLinksH2: "Il fotovoltaico vive collegato a tutta la piattaforma.",
  internalLinksBody:
    "Il modulo Cantieri Fotovoltaico è alimentato da Preventivi, Gestione Cantieri, Fatturazione, Finanziamenti e Manutenzione. Ecco i moduli collegati.",
  internalLinks: [
    {
      to: "/funzionalita/preventivi-edilizia",
      title: "Preventivi Edilizia",
      text: "Computo metrico fotovoltaico con prezzari pannelli, inverter, accumulo.",
    },
    {
      to: "/funzionalita/gestione-cantieri",
      title: "Gestione Cantieri",
      text: "Pianificazione installazione, squadre montaggio, fornitori, allaccio.",
    },
    {
      to: "/funzionalita/fatturazione-elettronica",
      title: "Fatturazione Elettronica SDI",
      text: "Fatture acconto, SAL, saldo con codici natura corretti per Superbonus.",
    },
    {
      to: "/funzionalita/finanziamenti-cantieri",
      title: "Finanziamenti Cantieri",
      text: "Cessione credito Superbonus, anticipo SAL, factoring fatture FV.",
    },
    {
      to: "/funzionalita/manutenzione-impianti",
      title: "Manutenzione Impianti",
      text: "Manutenzione decennale impianti FV, libretti, scadenze normative.",
    },
    {
      to: "/funzionalita/portale-clienti",
      title: "Portale Clienti",
      text: "Cliente vede produzione FV in tempo reale e risparmio bolletta.",
    },
    {
      to: "/funzionalita/quote-builder-ai",
      title: "Quote Builder AI",
      text: "Preventivi FV generati da foto tetto e simulazione produzione.",
    },
    {
      to: "/per/imprese-costruzione",
      title: "Software per Imprese di Costruzione",
      text: "Tutta la piattaforma per imprese edili e installatori energia.",
    },
    {
      to: "/prezzi",
      title: "Prezzi e Piani",
      text: "Modulo Fotovoltaico incluso nei piani Professional e Business.",
    },
  ],

  finalCtaH2: "Smetti di rincorrere pratiche GSE. Inizia a chiudere impianti FV in 60 giorni.",
  finalCtaBody:
    "31 giorni gratuiti per portare il modulo Fotovoltaico dentro la tua impresa: setup in 48 ore, pratiche GSE/TICA preconfigurate, archivio prodotti pannelli/inverter, monitoraggio produzione cliente. Onboarding 1-a-1 con consulente verticale FV. Cancelli quando vuoi.",
  finalCtaButton: "Prova gratis 31 giorni",
  finalCtaMicrocopy: "Setup 48 ore · Pratiche GSE preconfigurate · Cancelli quando vuoi",

  stickyCtaLabel: "Prova gratis Fotovoltaico",
  stickyCtaMicrocopy: "Setup 48h · Pratiche GSE incluse",

  applicationSubCategory: "Solar Construction Management Software",

  relatedBlogSlugs: ["come-fare-preventivo-edilizia", "alternativa-excel-cantieri"],
};

export default function Fotovoltaico() {
  return <FunzionalitaPageTemplate config={config} />;
}
