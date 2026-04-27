import {
  AlertTriangle,
  Banknote,
  Brain,
  Calculator,
  Calendar,
  CheckCircle2,
  ClipboardList,
  Clock,
  FileSignature,
  FileText,
  HardHat,
  Landmark,
  Lock,
  Receipt,
  Send,
  ShieldCheck,
  Smartphone,
  Sparkles,
  TrendingUp,
  Users,
  Wallet,
  Wrench,
  Zap,
} from "lucide-react";
import FunzionalitaPageTemplate from "./_template/FunzionalitaPageTemplate";
import type { FunzionalitaPageConfig } from "./_template/types";

const config: FunzionalitaPageConfig = {
  slug: "cedolini-paga",
  vertical: "Cedolini Paga",
  productName: "Modulo Cedolini Paga Edilizia in Cloud",
  audience:
    "Imprese edili, ristrutturatori, general contractor e artigiani edili che vogliono produrre cedolini paga internamente con CCNL Edilizia industria/artigianato già configurato, calcolo automatico cassa edile, F24, UNILAV e UNIEMENS senza dipendere dal consulente esterno",
  audienceShort: "imprese edili e artigiani",

  seo: {
    title:
      "Cedolini Paga Edilizia — CCNL Edilizia, Cassa Edile, F24 e UNILAV Automatici | Edilizia in Cloud",
    description:
      "Software cedolini paga per imprese edili: CCNL Edilizia industria e artigianato preconfigurato, calcolo automatico cassa edile, ferie ROL banca ore, F24 telematico, UNILAV e UNIEMENS senza errori.",
    keywords:
      "cedolini paga edilizia, software paghe imprese edili, CCNL edilizia industria, CCNL edilizia artigianato, cassa edile automatica, F24 edilizia, UNILAV edilizia, UNIEMENS edilizia, paghe operai cantiere",
    ogImage: "https://www.ediliziaincloud.com/og/cedolini-paga-og.jpg",
  },

  heroBadge: "Funzionalità · Cedolini Paga",
  heroH1Lead: "Cedolini paga edilizia",
  heroH1Highlight: "senza consulente esterno",
  heroH1Tail: "ogni mese",
  heroSubheadline:
    "Modulo paghe con CCNL Edilizia industria e artigianato preconfigurato, calcolo automatico cassa edile, ferie ROL banca ore, malattia INPS, F24 telematico, denuncia UNILAV e UNIEMENS. Produci cedolini, livelli di inquadramento, accantonamenti GNF e gratifica natalizia direttamente in azienda, riducendo del 50% la dipendenza dal consulente paga esterno.",
  heroPrimaryCta: "Prova gratis 31 giorni",
  heroSecondaryCta: "Tutte le funzionalità",
  heroSecondaryCtaTo: "/funzionalita",

  reassurancePoints: [
    "CCNL Edilizia preconfigurato e aggiornato",
    "Cassa Edile automatica con denuncia MUT",
    "F24 telematico generato in 1 click",
  ],
  proofPoints: [
    "Cedolini in PDF firmati digitalmente",
    "UNILAV e UNIEMENS automatici",
    "Banca ore e ROL sempre a saldo",
  ],

  objectiveRow: [
    ["Obiettivo", "Produrre cedolini paga edilizia internamente, senza errori e senza ritardi"],
    ["Momento chiave", "Ogni fine mese, con il consulente che oggi ti costa €30-100/h"],
    ["Risultato", "-50% dipendenza dal consulente, zero errori cassa edile, F24 in 1 click"],
  ],

  betaH2:
    "Più di 280 imprese edili italiane producono cedolini paga e adempimenti CCNL Edilizia direttamente con Edilizia in Cloud.",
  betaBody:
    "Il modulo Cedolini Paga è attivo in 48 ore: importiamo l'anagrafica dipendenti, configuriamo il CCNL applicato (Industria, Artigianato o PMI Edilizia), agganciamo la tua Cassa Edile provinciale, sincronizziamo banca ore e ferie residue. Quattro sessioni 1-a-1 con il nostro team paghe ti accompagnano fino al primo cedolino mensile chiuso senza errori.",

  speedH2:
    "Il consulente paga ti costa €600-1.500 al mese per 5-15 dipendenti. Il software li fa in 20 minuti.",
  speedSubheadline:
    "Le imprese edili pagano in media €40-80/mese a dipendente al consulente paga esterno per cedolini, F24 e adempimenti. Con il CCNL Edilizia preconfigurato e il calcolo automatico cassa edile, l'elaborazione mensile si fa in azienda in 20 minuti, lasciando al consulente solo la consulenza strategica.",
  speedStats: [
    { value: 50, prefix: "-", suffix: "%", label: "costo consulente paga esterno" },
    { value: 20, suffix: " min", label: "elaborazione mensile cedolini" },
    { value: 100, suffix: "%", label: "conformità CCNL Edilizia aggiornato" },
  ],

  familyH2: "Cedolini paga collegati a presenze, cantiere e contabilità.",
  familySubheadline:
    "Il cedolino paga non vive da solo: parte dalle timbrature GPS dei cantieri, attinge ai dati anagrafici HR, alimenta la contabilità con scritture automatiche, genera F24 sincronizzati con la tesoreria. Una sola piattaforma, nessuna riconciliazione manuale.",
  familyItems: [
    {
      icon: Users,
      title: "HR Personale",
      text: "Anagrafica dipendenti, livelli CCNL Edilizia, contratti e mansioni alimentano i cedolini.",
      to: "/funzionalita/hr-personale",
    },
    {
      icon: Smartphone,
      title: "Timbrature GPS",
      text: "Ore lavorate per cantiere registrate via app entrano automatiche nel cedolino mensile.",
      to: "/funzionalita/timbrature-gps",
    },
    {
      icon: Calendar,
      title: "Ferie e Permessi",
      text: "Saldo ferie ROL banca ore aggiornato in tempo reale, riportato nel cedolino.",
      to: "/funzionalita/ferie-permessi",
    },
    {
      icon: Calculator,
      title: "Contabilità Fiscale",
      text: "Scritture stipendi e oneri sociali generate automaticamente in prima nota.",
      to: "/funzionalita/contabilita-fiscale",
    },
    {
      icon: Wallet,
      title: "Tesoreria",
      text: "F24 e bonifici stipendi sincronizzati con il piano cassa aziendale.",
      to: "/funzionalita/tesoreria",
    },
    {
      icon: HardHat,
      title: "Margini Cantiere",
      text: "Costo del lavoro per cantiere alimentato dai cedolini per analisi marginalità.",
      to: "/funzionalita/margini-cantiere",
    },
  ],
  familyBonusTitle: "Una sola piattaforma. Cedolini, presenze, contabilità e cantiere allineati.",
  familyBonusText:
    "Quando un operaio timbra l'ingresso in cantiere alle 7:30, quel dato confluisce nel cedolino del mese, nel costo orario del cantiere, nella scrittura contabile dello stipendio e nell'F24 di fine mese. Un dato inserito una volta, valorizzato in cinque punti diversi, senza riconciliazioni e senza errori di trascrizione.",

  painKicker: "Il problema vero",
  painH2: "Il consulente paga ti dà i cedolini il giorno 27 e l'F24 lo ricevi via email il 15.",
  painSubheadline:
    "L'edilizia ha regole paga uniche in Italia: cassa edile provinciale, GNF, gratifica natalizia, ferie e permessi specifici. Pochi consulenti le conoscono davvero, e quelli che le conoscono costano. Intanto tu non hai visibilità in tempo reale del costo del lavoro per cantiere e gli errori di calcolo li scopri quando arriva l'ispezione.",
  painPoints: [
    {
      icon: AlertTriangle,
      title: "Cassa edile calcolata male o in ritardo",
      text: "Ogni provincia ha aliquote e scadenze MUT diverse. Il consulente generalista sbaglia accantonamenti GNF, gratifica natalizia o anzianità. Risultato: ispezione, sanzioni e lavoratori che chiedono spiegazioni.",
    },
    {
      icon: Clock,
      title: "Cedolini in ritardo, operai arrabbiati",
      text: "Il consulente consegna i cedolini il 27-28 del mese, gli stipendi escono il 30. Se sbagli un dato di presenza, la correzione slitta al mese dopo. Operai che chiamano arrabbiati ogni 30 giorni.",
    },
    {
      icon: FileText,
      title: "UNILAV e UNIEMENS dimenticati o errati",
      text: "Comunicazione obbligatoria UNILAV entro il giorno prima dell'assunzione, UNIEMENS entro il giorno 30. Gestiti via email tra azienda e consulente, basta una dimenticanza per beccarsi sanzioni INPS.",
    },
    {
      icon: Wallet,
      title: "Costo paghe esterno fuori controllo",
      text: "€40-80/mese a dipendente solo per cedolini ed F24, più consulenze straordinarie a €80-150/h per ogni infortunio, dimissione, malattia lunga. Su 15 operai sono €10.000-15.000/anno.",
    },
  ],

  baKicker: "Prima e dopo Edilizia in Cloud",
  baH2: "Stessa azienda, stesso CCNL, stessi operai. Cambia chi tiene in mano il volante.",
  baSubheadline:
    "Non sostituisci il consulente paga: gli togli il lavoro ripetitivo (cedolini, F24, UNIEMENS) e gli lasci la consulenza strategica (vertenze, contratti complessi, bilancio sociale). Tu paghi meno, lui lavora meglio, gli operai ricevono cedolini puntuali.",
  baAreas: [
    {
      title: "Elaborazione cedolino mensile",
      before:
        "Mandi al consulente foglio Excel con presenze, lui torna 5 giorni dopo con il cedolino, tu controlli, segnali errori, lui ri-elabora dopo altri 2 giorni. Totale: 7 giorni.",
      after:
        "Le timbrature GPS sono già nel sistema. Premi 'genera cedolini', il modulo applica CCNL Edilizia, calcola cassa edile, ferie ROL e malattia INPS. Cedolini pronti in 20 minuti.",
    },
    {
      title: "Calcolo Cassa Edile e MUT",
      before:
        "Il consulente generalista usa il template 'metalmeccanici' e adatta a mano. Errori su GNF, gratifica natalizia, anzianità professionale edile. Denuncia MUT in ritardo, sanzioni provinciali.",
      after:
        "Aliquote provinciali Cassa Edile precaricate per tutte le 91 casse italiane. GNF, gratifica natalizia, anzianità calcolate automaticamente. Denuncia MUT esportata in 1 click con i dati corretti.",
    },
    {
      title: "Pagamento F24 contributi",
      before:
        "Consulente prepara F24 cartaceo o PDF, te lo manda via email, tu lo carichi in home banking, sbagli un codice tributo, scopri l'errore quando arriva la cartella esattoriale 6 mesi dopo.",
      after:
        "F24 generato automatico con tutti i codici tributo edilizia (1001, 1002, contributi cassa edile, INAIL). Telematico via Entratel/Fisconline, ricevuta archiviata, sincronizzato con tesoreria.",
    },
    {
      title: "UNILAV nuova assunzione",
      before:
        "Telefonata al consulente la mattina dell'assunzione, lui invia UNILAV nel pomeriggio. Se chiama dopo le 12, l'operaio entra in cantiere senza UNILAV trasmessa: rischio sanzione €1.500-12.000.",
      after:
        "Compili l'anagrafica dipendente sul gestionale, premi 'genera UNILAV', invio telematico al CPI con ricevuta in 30 secondi. Operaio in cantiere già coperto dalla comunicazione preventiva obbligatoria.",
    },
  ],

  mechanismKicker: "Come funziona",
  mechanismH2: "Tre passaggi mensili. Niente Excel, niente email al consulente per ogni cedolino.",
  mechanismSubheadline:
    "Il modulo Cedolini Paga lavora sui dati che già esistono nel gestionale: timbrature GPS, ferie approvate, malattie registrate. Tu controlli e firmi, il sistema calcola e trasmette.",
  mechanismSteps: [
    {
      icon: ClipboardList,
      title: "Importazione presenze e voci variabili",
      text: "Il sistema raccoglie automaticamente timbrature GPS dai cantieri, ferie e ROL approvati, malattie con certificato INPS, infortuni. Tu validi le anomalie (max 5 minuti).",
    },
    {
      icon: Calculator,
      title: "Elaborazione cedolino con CCNL Edilizia",
      text: "Applicazione automatica del CCNL Edilizia industria/artigianato/PMI: paga base, indennità di trasferta, EVR, anzianità, cassa edile, GNF, gratifica natalizia, accantonamento TFR. Cedolini pronti in PDF.",
    },
    {
      icon: Send,
      title: "Invio F24, UNIEMENS, MUT e cedolini",
      text: "F24 telematico generato e trasmesso via Entratel. UNIEMENS mensile inviato all'INPS. Denuncia MUT alla Cassa Edile provinciale. Cedolini distribuiti agli operai via app, firma digitale inclusa.",
    },
  ],
  mechanismCta: "Genera il primo cedolino in demo",

  commercialKicker: "Perché conviene davvero",
  commercialH2: "Il modulo paghe ti restituisce 8.000-15.000€/anno e zero ansia da scadenza.",
  commercialBody:
    "Le imprese edili che producono i cedolini in autonomia con il modulo Edilizia in Cloud risparmiano in media il 50% del costo paghe esterno e azzerano gli errori cassa edile. Il consulente resta come consulente strategico, non come elaboratore meccanico.",
  commercialLevers: [
    {
      icon: TrendingUp,
      title: "Risparmio diretto sul consulente paga",
      text: "Da €40-80/mese a dipendente a €15-25/mese per la sola consulenza strategica. Su 15 operai sono €4.500-9.000 all'anno di risparmio diretto, certificato in fattura.",
    },
    {
      icon: ShieldCheck,
      title: "Zero errori cassa edile e ispezioni",
      text: "Le 91 casse edili italiane preconfigurate con aliquote, scadenze MUT e accantonamenti aggiornati. Niente più sanzioni provinciali per denunce errate o tardive.",
    },
    {
      icon: Clock,
      title: "Cedolini il giorno 25, stipendi il 27",
      text: "Le imprese pagano gli stipendi 3-5 giorni prima, gli operai sono più sereni, il rapporto azienda-lavoratore migliora. Niente più 'ma quando arriva il cedolino?' in cantiere.",
    },
    {
      icon: Brain,
      title: "Costo del lavoro per cantiere in tempo reale",
      text: "Il cedolino alimenta la marginalità per cantiere giorno per giorno: sai quanto stai spendendo di mano d'opera mentre il cantiere è in corso, non a fine lavori.",
    },
  ],

  resultsKicker: "Risultati con Edilizia in Cloud",
  resultsH2: "Niente più 'aspetto il consulente per chiudere il mese'.",
  resultsBody:
    "Quando i cedolini si producono in azienda con il CCNL Edilizia preconfigurato, il ciclo paghe diventa lineare: presenze, calcolo, F24, UNIEMENS, distribuzione cedolini. Tutto in 20 minuti, tutto verificabile, tutto archiviato secondo CAD per 10 anni.",
  integrationPillars: [
    {
      icon: Landmark,
      title: "CCNL Edilizia sempre aggiornato",
      text: "Industria, Artigianato e PMI Edilizia preconfigurati con tabelle paga aggiornate ad ogni rinnovo contrattuale. Indennità trasferta, EVR, anzianità calcolati per livello.",
    },
    {
      icon: HardHat,
      title: "Cassa Edile provinciale automatica",
      text: "91 casse edili italiane con aliquote e scadenze MUT. Accantonamento GNF, gratifica natalizia, anzianità professionale edile, ferie e permessi calcolati senza intervento manuale.",
    },
    {
      icon: Receipt,
      title: "F24 e UNIEMENS telematici",
      text: "F24 generato con codici tributo corretti per edilizia, invio telematico Entratel. UNIEMENS mensile, UNILAV per assunzioni/cessazioni, ricevute archiviate digitalmente.",
    },
    {
      icon: FileSignature,
      title: "Cedolini firmati digitalmente",
      text: "Cedolino PDF firmato digitalmente con marca temporale, distribuzione via app dipendente o portale, conservazione decennale a norma CAD D.Lgs 82/2005.",
    },
  ],
  resultStats: [
    { value: 50, prefix: "-", suffix: "%", label: "costo annuo consulente paga esterno" },
    { value: 20, suffix: " min", label: "elaborazione mensile cedolini" },
    { value: 0, suffix: "", label: "errori cassa edile dopo 6 mesi di utilizzo" },
  ],
  resultsCta: "Apri il modulo cedolini paga",

  roiKicker: "Calcola il tuo ROI",
  roiH2: "Quanto risparmi se produci i cedolini in azienda invece di pagare il consulente?",
  roiSubheadline:
    "Sposta i cursori sulla tua realtà: numero di dipendenti tra operai e impiegati e costo orario del consulente paga esterno. La stima parte da 30 minuti a operaio al mese di consulenza esterna risparmiata grazie al CCNL Edilizia preconfigurato.",
  roi: {
    input1Label: "Operai e impiegati totali",
    input1Default: 12,
    input1Min: 3,
    input1Max: 200,
    input1Step: 1,
    input2Label: "Costo orario consulente paga (€)",
    input2Default: 50,
    input2Min: 30,
    input2Max: 100,
    input2Step: 1,
    input2Suffix: " €",
    outputLabel: "Risparmio annuo stimato",
    computeOutput: (a, b) => Math.round(a * 12 * 0.5 * b),
    computeSecondary: (a, b) => [
      { label: "Ore consulenza esterna risparmiate/anno", value: `${Math.round(a * 12 * 0.5)} h` },
      { label: "Cedolini elaborati internamente/anno", value: `${a * 13}` },
      { label: "Tempo recuperato titolare/anno", value: `${Math.round(a * 0.3 * 12)} h` },
    ],
    closingPitch:
      "Stima prudenziale basata su 30 minuti/operaio/mese di consulenza esterna eliminata. Aggiungi le sanzioni cassa edile evitate, la gratifica natalizia calcolata correttamente e i cedolini consegnati 5 giorni prima.",
  },

  salesKicker: "Impatto operativo",
  salesH2: "Non un software paghe generico. Un modulo nato per il CCNL Edilizia.",
  salesBody:
    "I software paghe generalisti applicano alle imprese edili template metalmeccanici adattati. Il modulo Cedolini Paga di Edilizia in Cloud nasce con CCNL Edilizia industria, artigianato e PMI preconfigurati e Cassa Edile provinciale già integrata.",
  salesImpact: [
    {
      title: "Stipendi puntuali ogni mese",
      text: "I cedolini si producono in 20 minuti, gli stipendi escono il 27 invece del 30. Operai sereni, clima aziendale migliore, meno turnover.",
    },
    {
      title: "Conformità CCNL Edilizia garantita",
      text: "Tabelle paga aggiornate ad ogni rinnovo contrattuale, indennità di trasferta, EVR, anzianità, cassa edile sempre allineati alle ultime delibere territoriali.",
    },
    {
      title: "Costo del lavoro visibile per cantiere",
      text: "Ogni cedolino alimenta la marginalità per cantiere. Sai quanto stai spendendo di manodopera mentre il cantiere è aperto, non a fine lavori.",
    },
    {
      title: "Consulente paga libero per la consulenza vera",
      text: "Il consulente smette di essere un elaboratore meccanico e torna a essere uno stratega: vertenze, contratti complessi, accordi sindacali, bilancio sociale.",
    },
  ],

  featureKicker: "Cosa ottieni davvero",
  featureH2: "Un elenco concreto di quello che attiviamo in 48 ore.",
  featureRows: [
    {
      label: "CCNL Edilizia industria, artigianato e PMI",
      value: "Tabelle paga preconfigurate per tutti i livelli, indennità di trasferta, EVR, anzianità, scatti, aggiornate ad ogni rinnovo contrattuale.",
    },
    {
      label: "Cassa Edile provinciale automatica",
      value: "91 casse edili italiane con aliquote e scadenze MUT. Accantonamento GNF, gratifica natalizia, anzianità professionale, ferie e permessi.",
    },
    {
      label: "F24 telematico Entratel/Fisconline",
      value: "Generazione automatica con codici tributo edilizia, invio telematico, ricevuta archiviata, sincronizzazione con tesoreria aziendale.",
    },
    {
      label: "UNILAV e UNIEMENS automatici",
      value: "UNILAV trasmesso al CPI il giorno prima dell'assunzione, UNIEMENS mensile inviato all'INPS, ricevute archiviate, niente più sanzioni.",
    },
    {
      label: "Banca ore e ferie/ROL in tempo reale",
      value: "Saldo aggiornato a ogni timbratura, riportato nel cedolino, visibile all'operaio dall'app self-service. Niente più richieste di chiarimento.",
    },
    {
      label: "Cedolini firmati digitalmente",
      value: "PDF firmato con marca temporale, distribuzione via app o portale, conservazione decennale CAD D.Lgs 82/2005, esibizione GdF in 5 minuti.",
    },
    {
      label: "Costo del lavoro per cantiere",
      value: "Ore lavorate per cantiere dalle timbrature GPS valorizzate al costo orario corretto, alimentano la marginalità in tempo reale.",
    },
  ],

  scenarioKicker: "Tre casi reali sul campo",
  scenarioH2: "Tre situazioni in cui il modulo Cedolini Paga cambia il fine mese.",
  scenarios: [
    {
      title: "Assunzione lampo per cantiere urgente",
      text: "Lunedì mattina ti serve un manovale per il cantiere che apre martedì. Compili anagrafica, sistema genera UNILAV, lo trasmette al CPI con ricevuta. Operaio in cantiere il giorno dopo, tutto in regola.",
    },
    {
      title: "Chiusura paga del 25 senza consulente",
      text: "Il 25 del mese premi 'elabora cedolini'. Il sistema raccoglie timbrature GPS, applica CCNL, calcola cassa edile, genera 15 cedolini, F24 e UNIEMENS in 20 minuti. Il 27 gli stipendi sono in conto.",
    },
    {
      title: "Ispezione INL al cantiere",
      text: "L'ispettore chiede cedolini e UNILAV degli ultimi 12 mesi. Apri il gestionale, esporti il dossier completo in 3 minuti: cedolini firmati digitalmente, UNILAV con ricevute CPI, F24 archiviati. Ispezione chiusa senza rilievi.",
    },
  ],

  testimonialQuote:
    "Avevo un consulente paga che mi costava 800€ al mese per 10 operai e mi consegnava i cedolini il giorno 27. Ora li chiudo io il 24, gli stipendi escono il 26, il consulente lo sento solo per le vertenze. Risparmio 6.500€ all'anno e gli operai sono più contenti perché ricevono il cedolino prima.",
  testimonialAuthor: "Marco P.",
  testimonialRole: "Edil P. Costruzioni Srl, Verona",

  faqKicker: "Domande frequenti",
  faqH2: "Quello che un titolare di impresa edile vuole sapere prima di passare al modulo paghe.",
  faqs: [
    {
      q: "Posso usare il modulo se ho il CCNL Edilizia Artigianato?",
      a: "Sì. Il modulo supporta CCNL Edilizia Industria, Artigianato (CNA, Confartigianato) e PMI Edilizia con tabelle paga, EVR, anzianità professionale e indennità di trasferta preconfigurate per ogni contratto. Aggiornamenti automatici a ogni rinnovo.",
    },
    {
      q: "Come funziona con la Cassa Edile della mia provincia?",
      a: "Tutte le 91 casse edili italiane sono precaricate con aliquote contributive, scadenze denuncia MUT, accantonamenti GNF e gratifica natalizia. Il sistema applica automaticamente le aliquote della cassa di riferimento del cantiere e genera la denuncia MUT mensile.",
    },
    {
      q: "Posso continuare ad avere il consulente paga esterno?",
      a: "Sì. Molte imprese mantengono il consulente per la consulenza strategica (vertenze, contratti, bilancio sociale) e producono internamente cedolini e adempimenti ricorrenti. Il consulente accede al gestionale come collaboratore e supervisiona quando serve.",
    },
    {
      q: "Il modulo gestisce anche i contratti a chiamata e gli apprendisti?",
      a: "Sì. Sono previsti tutti i tipi contrattuali edilizia: tempo indeterminato, determinato, apprendistato professionalizzante, tempo parziale, lavoro a chiamata. Calcolo automatico delle aliquote e degli sgravi contributivi specifici per ogni tipologia.",
    },
    {
      q: "Come si gestisce la malattia INPS e l'infortunio INAIL?",
      a: "Inserisci certificato INPS o denuncia INAIL nel gestionale, il sistema calcola automaticamente l'indennità a carico INPS/INAIL e quota azienda. UNIEMENS mensile riporta gli eventi correttamente, evitando contestazioni di calcolo.",
    },
    {
      q: "Quanto costa il modulo Cedolini Paga e ci sono limiti di dipendenti?",
      a: "Il modulo è incluso nei piani Business di Edilizia in Cloud con dipendenti illimitati e nessun costo per cedolino emesso. Setup in 48 ore, formazione 1-a-1 inclusa, cancelli quando vuoi. Vedi /prezzi per dettagli.",
    },
  ],

  internalLinksKicker: "Esplora la piattaforma",
  internalLinksH2: "Cedolini Paga è collegato a tutto il ciclo del personale e contabile.",
  internalLinksBody:
    "I cedolini partono dalle timbrature GPS, attingono all'anagrafica HR, alimentano la contabilità e generano F24 sincronizzati con tesoreria.",
  internalLinks: [
    { to: "/funzionalita/hr-personale", title: "HR Personale", text: "Anagrafica dipendenti, livelli CCNL, contratti alimentano i cedolini." },
    { to: "/funzionalita/timbrature-gps", title: "Timbrature GPS", text: "Ore lavorate per cantiere registrate via app entrano nel cedolino." },
    { to: "/funzionalita/ferie-permessi", title: "Ferie e Permessi", text: "Saldo ferie e ROL aggiornato in tempo reale nel cedolino." },
    { to: "/funzionalita/contabilita-fiscale", title: "Contabilità Fiscale", text: "Scritture stipendi e oneri sociali in prima nota automatici." },
    { to: "/funzionalita/tesoreria", title: "Tesoreria", text: "F24 e bonifici stipendi sincronizzati con il piano cassa." },
    { to: "/funzionalita/margini-cantiere", title: "Margini Cantiere", text: "Costo del lavoro per cantiere alimentato dai cedolini." },
    { to: "/funzionalita/scadenzario", title: "Scadenzario", text: "F24 contributi e scadenze MUT nel calendario aziendale." },
    { to: "/per/imprese-costruzione", title: "Software per Imprese di Costruzione", text: "Tutta la piattaforma orientata alle imprese edili italiane." },
    { to: "/prezzi", title: "Prezzi e Piani", text: "Cedolini Paga incluso nel piano Business con dipendenti illimitati." },
  ],

  finalCtaH2: "Smetti di aspettare il consulente il 27. Chiudi i cedolini il 24, paga il 26.",
  finalCtaBody:
    "31 giorni gratuiti per produrre cedolini paga edilizia direttamente in azienda. CCNL preconfigurato, Cassa Edile provinciale, F24 telematico, UNILAV e UNIEMENS automatici. Onboarding 1-a-1 con il nostro team paghe, cancelli quando vuoi.",
  finalCtaButton: "Prova gratis 31 giorni",
  finalCtaMicrocopy: "Setup in 48 ore · CCNL Edilizia preconfigurato · Cancelli quando vuoi",

  stickyCtaLabel: "Prova gratis Cedolini Paga",
  stickyCtaMicrocopy: "Setup 48h · CCNL Edilizia incluso",

  applicationSubCategory: "Construction Payroll Software",

  relatedBlogSlugs: ["come-fare-preventivo-edilizia", "alternativa-excel-cantieri"],
};

export default function CedoliniPaga() {
  return <FunzionalitaPageTemplate config={config} />;
}
