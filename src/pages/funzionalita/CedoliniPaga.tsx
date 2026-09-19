import {
  AlertTriangle,
  Brain,
  Calculator,
  Calendar,
  ClipboardList,
  Clock,
  FileSignature,
  FileText,
  HardHat,
  Landmark,
  Receipt,
  Send,
  ShieldCheck,
  Smartphone,
  TrendingUp,
  Users,
  Wallet,
} from "lucide-react";
import FunzionalitaPageTemplate from "./_template/FunzionalitaPageTemplate";
import type { FunzionalitaPageConfig } from "./_template/types";

// Contenuti verificati nel codice e nel database il 19/09/2026. Il modulo
// prepara una BOZZA di cedolino dalle timbrature (ore ordinarie, straordinari
// 25/50/100%, lordo da anagrafica, INPS, Cassa Edile e IRPEF con le aliquote
// standard dell'Edilizia Industria) e tiene l'archivio dei cedolini. Non fa:
// tabelle CCNL per livello, Artigianato/PMI, casse edili provinciali, malattia,
// tredicesima, TFR, trasferte, banca ore, comunicazioni di assunzione, denunce
// all'INPS o alla Cassa Edile, invio telematico dell'F24, libro unico, firma
// digitale dei cedolini, export verso programmi paghe. Non sostituisce il
// consulente del lavoro: prima di aggiungere una promessa, controllare che ci sia.
// Le ferie approvate in app NON entrano ancora nella bozza (il calcolo legge
// hr_assenze, l'app scrive hr_richieste): non scrivere che «tiene conto delle ferie».
const config: FunzionalitaPageConfig = {
  slug: "cedolini-paga",
  definizione:
    "Cedolini Paga di Edilizia in Cloud prepara la bozza del cedolino di ogni operaio partendo dalle timbrature vere: ore ordinarie, straordinari al 25, 50 e 100%, lordo dallo stipendio in anagrafica, contributi INPS e Cassa Edile e IRPEF con le aliquote standard dell'Edilizia Industria. Il consulente del lavoro controlla e chiude; i cedolini restano in archivio e gli operai li vedono dall'app.",
  vertical: "Cedolini Paga",
  productName: "Modulo Cedolini Paga Edilizia in Cloud",
  audience:
    "Imprese edili, ristrutturatori, general contractor e artigiani edili che vogliono passare al consulente del lavoro ore e presenze già calcolate dalle timbrature, con una bozza di cedolino da controllare e l'archivio dei cedolini consultabile dagli operai",
  audienceShort: "imprese edili e artigiani",

  seo: {
    title:
      "Cedolini Paga Edilizia",
    description:
      "Bozza di cedolino dalle timbrature: ore, straordinari 25/50/100%, INPS, Cassa Edile e IRPEF. Il consulente controlla, gli operai li vedono in app.",
    keywords:
      "cedolini paga edilizia, bozza cedolino operai, straordinari edilizia 25 50 100, calcolo contributi cassa edile, timbrature cantiere buste paga, archivio cedolini dipendenti, ferie ROL edilizia, consulente del lavoro edilizia, paghe operai cantiere",
    ogImage: "https://www.ediliziaincloud.com/og/og-default.png",
  },

  heroBadge: "Funzionalità · Cedolini Paga",
  heroH1Lead: "Cedolini paga edilizia",
  heroH1Highlight: "già calcolati dalle timbrature",
  heroH1Tail: "per il tuo consulente",
  heroSubheadline:
    "Le ore che gli operai timbrano in cantiere diventano la bozza del cedolino: ore ordinarie, straordinari al 25, 50 e 100%, lordo, contributi INPS e Cassa Edile, IRPEF. I giorni con timbrature incomplete sono segnalati. Il consulente del lavoro controlla e chiude, tu smetti di mandargli fogli presenze ricopiati a mano.",
  heroPrimaryCta: "Prova gratis 31 giorni",
  heroSecondaryCta: "Tutte le funzionalità",
  heroSecondaryCtaTo: "/funzionalita",

  reassurancePoints: [
    "Bozza calcolata dalle timbrature vere",
    "Straordinari 25/50/100% separati",
    "Il consulente controlla e chiude",
  ],
  proofPoints: [
    "Archivio cedolini per dipendente",
    "Cedolini visibili dall'app operaio",
    "Saldi ferie, permessi e ROL aggiornati",
  ],

  objectiveRow: [
    ["Obiettivo", "Passare al consulente ore e presenze già calcolate, senza fogli Excel"],
    ["Momento chiave", "Fine mese, quando le presenze vanno chiuse e girate al consulente"],
    ["Risultato", "Meno ricopiature, errori sulle ore visti prima, cedolini consultabili dagli operai"],
  ],

  betaH2:
    "Il cedolino parte da dove nasce il dato: la timbratura in cantiere.",
  betaBody:
    "Carichiamo l'anagrafica dei dipendenti con lo stipendio di ciascuno e colleghiamo le timbrature dell'app di cantiere. Da lì, ogni mese, il modulo calcola la bozza del cedolino con le aliquote standard dell'Edilizia Industria. Se applichi l'Artigianato o un altro contratto, i contributi della bozza vanno verificati con il consulente: oggi quelle aliquote non sono configurate.",

  speedH2:
    "Il consulente paga riceve ore già contate, non un foglio presenze da ricostruire.",
  speedSubheadline:
    "Oggi il foglio presenze passa dal capocantiere all'ufficio e dall'ufficio al consulente, e a ogni passaggio si perde un'ora o se ne conta una di troppo. Con le timbrature in app le ore sono già nel gestionale: la bozza del cedolino si calcola da lì e il consulente parte da numeri che puoi mostrargli giorno per giorno.",
  speedStats: [
    { value: 3, label: "fasce di straordinario separate in bozza: 25, 50 e 100%" },
    { value: 1, label: "bozza di cedolino per operaio al mese, calcolata dalle timbrature" },
    { value: 0, label: "fogli Excel di presenze da mandare al consulente" },
  ],

  familyH2: "Cedolini collegati a timbrature, ferie e cantiere.",
  familySubheadline:
    "Il cedolino non vive da solo: parte dalle timbrature GPS dei cantieri, prende lo stipendio dall'anagrafica del dipendente e segnala le ore che mancano. Le ore restano le stesse ovunque: nella bozza del cedolino, nel costo della commessa, nello storico dell'operaio.",
  familyItems: [
    {
      icon: Users,
      title: "HR Personale",
      text: "Anagrafica dipendenti e stipendio: da qui la bozza del cedolino prende il lordo.",
      to: "/funzionalita/hr-personale",
    },
    {
      icon: Smartphone,
      title: "Timbrature GPS",
      text: "Ore lavorate per cantiere registrate via app: sono la base della bozza mensile.",
      to: "/funzionalita/timbrature-gps",
    },
    {
      icon: Calendar,
      title: "Ferie e Permessi",
      text: "Saldi di ferie, permessi e ROL che scendono quando approvi una richiesta.",
      to: "/funzionalita/ferie-permessi",
    },
    {
      icon: Calculator,
      title: "Contabilità Fiscale",
      text: "Righe F24 di IVA e ritenute IRPEF (codice 1001) precompilate: il versamento lo fai tu.",
      to: "/funzionalita/contabilita-fiscale",
    },
    {
      icon: Wallet,
      title: "Tesoreria",
      text: "Conti, movimenti e previsionale di cassa dell'impresa in un posto solo.",
      to: "/funzionalita/tesoreria",
    },
    {
      icon: HardHat,
      title: "Margini Cantiere",
      text: "Le stesse ore delle timbrature pesano sul costo della commessa giusta.",
      to: "/funzionalita/margini-cantiere",
    },
  ],
  familyBonusTitle: "Un dato inserito una volta. Usato dove serve.",
  familyBonusText:
    "Quando un operaio timbra l'ingresso in cantiere alle 7:30, quell'ora finisce nella bozza del cedolino del mese e nel costo del cantiere su cui ha lavorato. Nessuno la ricopia da un foglio, e se manca l'uscita la bozza te lo segnala prima che il dato arrivi al consulente.",

  painKicker: "Il problema vero",
  painH2: "Il foglio presenze arriva al consulente a fine mese, pieno di buchi e di ore contate a memoria.",
  painSubheadline:
    "L'edilizia ha regole paga sue: straordinari, Cassa Edile, ferie e permessi. Il consulente del lavoro le conosce, ma lavora sui dati che gli mandi tu. Se le ore arrivano da un foglio compilato a fine settimana, gli errori li scopri quando l'operaio apre la busta.",
  painPoints: [
    {
      icon: AlertTriangle,
      title: "Ore contate a memoria",
      text: "Il capocantiere compila il foglio presenze il venerdì, ricostruendo la settimana. Un'uscita dimenticata, uno straordinario del sabato non segnato, e il cedolino è sbagliato prima ancora di essere fatto.",
    },
    {
      icon: Clock,
      title: "Cedolini in ritardo, operai arrabbiati",
      text: "Il consulente consegna i cedolini a fine mese e gli stipendi escono subito dopo. Se un dato di presenza è sbagliato, la correzione slitta al mese dopo. Operai che chiamano arrabbiati ogni 30 giorni.",
    },
    {
      icon: FileText,
      title: "Straordinari da ricostruire",
      text: "25%, 50%, 100%: ogni fascia ha la sua maggiorazione. Se il foglio presenze dice solo 'ore totali', qualcuno deve rifare i conti a mano, e di solito è il consulente, a parcella.",
    },
    {
      icon: Wallet,
      title: "Il costo del mese lo scopri dalla busta",
      text: "Quanto ti costa il personale del mese lo sai solo quando arrivano i cedolini. Lordo, contributi e trattenute: numeri che potevi vedere giorni prima, se le ore fossero già state contate.",
    },
  ],

  baKicker: "Prima e dopo Edilizia in Cloud",
  baH2: "Stessa azienda, stesso consulente, stessi operai. Cambia da dove partono i numeri.",
  baSubheadline:
    "Non sostituisci il consulente del lavoro: gli togli il lavoro di ricostruire le ore. Lui controlla la bozza, applica il contratto giusto, fa gli adempimenti e chiude i cedolini. Tu hai i numeri prima e l'archivio in un posto solo.",
  baAreas: [
    {
      title: "Presenze del mese",
      before:
        "Mandi al consulente un foglio Excel con le presenze, lui torna dopo qualche giorno con le domande, tu ricostruisci le ore di chi aveva dimenticato di segnare l'uscita.",
      after:
        "Le timbrature sono già nel gestionale. A fine mese la bozza conta ore ordinarie e straordinari per ogni operaio e segnala i giorni con la timbratura incompleta, così li sistemi prima.",
    },
    {
      title: "Calcolo della bozza",
      before:
        "Nessuna idea di quanto costerà il mese finché non arrivano i cedolini. Contributi e trattenute li scopri a cose fatte.",
      after:
        "Lordo dallo stipendio in anagrafica, contributi INPS e Cassa Edile e IRPEF calcolati con le aliquote standard dell'Edilizia Industria. Su ogni bozza c'è scritto che va controllata dal consulente del lavoro, ed è così.",
    },
    {
      title: "F24 del mese",
      before:
        "Le cifre da versare le scopri dall'email del consulente o del commercialista, a ridosso della scadenza.",
      after:
        "Le righe dell'F24 per IVA e ritenute IRPEF (codice 1001) le trovi già precompilate. Il versamento lo fai tu dalla banca o lo fa il commercialista: il gestionale non trasmette l'F24.",
    },
    {
      title: "Consegna dei cedolini",
      before:
        "Cedolini stampati e consegnati a mano, o girati su WhatsApp. Quando un operaio chiede quello di marzo, lo cerchi nelle email.",
      after:
        "I cedolini restano nell'archivio di ogni dipendente. L'operaio li vede e li stampa dall'app di cantiere, l'ufficio li trova nell'area personale.",
    },
  ],

  mechanismKicker: "Come funziona",
  mechanismH2: "Tre passaggi a fine mese. Niente Excel da mandare al consulente.",
  mechanismSubheadline:
    "Il modulo lavora sui dati che già esistono nel gestionale: timbrature e stipendio in anagrafica. Ferie e permessi del mese li controlli tu con il consulente sulla bozza. Il sistema calcola la bozza, tu sistemi le anomalie, il consulente controlla e chiude.",
  mechanismSteps: [
    {
      icon: ClipboardList,
      title: "Raccolta delle ore del mese",
      text: "Il sistema prende le timbrature dai cantieri e le separa in ore ordinarie e straordinari al 25, 50 e 100%. I giorni con timbrature incomplete sono segnalati: li sistemi tu prima di andare avanti.",
    },
    {
      icon: Calculator,
      title: "Bozza del cedolino",
      text: "Dal lordo in anagrafica calcola contributi INPS e Cassa Edile e IRPEF con le aliquote standard dell'Edilizia Industria. È una bozza, e lo dice: va controllata dal consulente del lavoro.",
    },
    {
      icon: Send,
      title: "Controllo del consulente e archivio",
      text: "Il consulente verifica, applica il contratto e fa gli adempimenti. I cedolini del mese entrano nell'archivio di ogni dipendente e l'operaio li vede dall'app.",
    },
  ],
  mechanismCta: "Guarda una bozza di cedolino in demo",

  commercialKicker: "Perché conviene davvero",
  commercialH2: "Il consulente lavora su ore vere. Tu vedi il costo del mese prima della busta.",
  commercialBody:
    "Il valore non sta nel fare a meno del consulente del lavoro: sta nel mandargli dati già puliti e nel vedere i numeri prima di lui. Meno domande avanti e indietro, meno correzioni il mese dopo, operai che trovano il cedolino nell'app.",
  commercialLevers: [
    {
      icon: TrendingUp,
      title: "Meno ore di ricostruzione",
      text: "Le presenze non si ricopiano più da un foglio. Il tempo che oggi tu, l'ufficio o il consulente passate a ricostruire le ore del mese si riduce alle anomalie che la bozza ti segnala.",
    },
    {
      icon: ShieldCheck,
      title: "Errori sulle ore visti prima",
      text: "Un'uscita non timbrata o uno straordinario fuori posto lo vedi nella bozza, non quando l'operaio contesta la busta. Lo sistemi prima che arrivi al consulente.",
    },
    {
      icon: Clock,
      title: "Il costo del personale prima dei cedolini",
      text: "Appena chiuse le presenze, la bozza ti dà lordo, contributi e trattenute del mese. Sai quanto esce di stipendi prima che te lo dica qualcun altro.",
    },
    {
      icon: Brain,
      title: "Ore e costo per cantiere",
      text: "Le stesse timbrature che fanno la bozza pesano sul costo della commessa giusta. Sai quanta manodopera sta assorbendo un cantiere mentre è aperto, non a fine lavori.",
    },
  ],

  resultsKicker: "Risultati con Edilizia in Cloud",
  resultsH2: "Niente più 'aspetto le presenze per mandarle al consulente'.",
  resultsBody:
    "Quando le ore arrivano dalle timbrature, il fine mese diventa lineare: presenze già contate, anomalie segnalate, bozza calcolata, controllo del consulente, cedolini in archivio e nell'app degli operai.",
  integrationPillars: [
    {
      icon: Landmark,
      title: "Aliquote Edilizia Industria",
      text: "La bozza usa le aliquote standard dell'Edilizia Industria per INPS e Cassa Edile. Se applichi l'Artigianato o un altro contratto, il consulente verifica: oggi quelle tabelle non sono configurate.",
    },
    {
      icon: HardHat,
      title: "Straordinari separati per fascia",
      text: "Ore ordinarie e straordinari al 25, 50 e 100% contati dalle timbrature, con i giorni incompleti segnalati prima del calcolo.",
    },
    {
      icon: Receipt,
      title: "Righe F24 precompilate",
      text: "Per il mese trovi pronte le righe dell'F24 di IVA e ritenute IRPEF (codice 1001). Il versamento resta a te o al commercialista: il gestionale non lo trasmette.",
    },
    {
      icon: FileSignature,
      title: "Archivio cedolini per dipendente",
      text: "I cedolini restano nell'archivio di ogni dipendente. L'operaio li vede e li stampa dall'app di cantiere, l'ufficio dall'area personale.",
    },
  ],
  resultStats: [
    { value: 0, label: "ore ricopiate a mano da un foglio presenze" },
    { value: 1, label: "archivio dei cedolini per ogni dipendente, consultabile dall'app" },
    { value: 3, label: "voci calcolate in bozza: INPS, Cassa Edile e IRPEF" },
  ],
  resultsCta: "Apri il modulo cedolini paga",

  roiKicker: "Calcola il tuo ROI",
  roiH2: "Quanto tempo recuperi se le presenze non vanno più ricostruite a mano?",
  roiSubheadline:
    "Sposta i cursori sulla tua realtà: numero di dipendenti e costo orario di chi oggi prepara le presenze per il consulente. L'ipotesi di partenza è di 20 minuti al mese per dipendente tra foglio presenze, ricopiatura e chiarimenti: è una stima, non una promessa.",
  roi: {
    input1Label: "Operai e impiegati totali",
    input1Default: 12,
    input1Min: 3,
    input1Max: 200,
    input1Step: 1,
    input2Label: "Costo orario di chi prepara le presenze (€)",
    input2Default: 30,
    input2Min: 15,
    input2Max: 80,
    input2Step: 1,
    input2Suffix: " €",
    outputLabel: "Valore del tempo recuperato/anno",
    computeOutput: (a, b) => Math.round(((a * 12 * 20) / 60) * b),
    computeSecondary: (a) => [
      { label: "Ore di preparazione presenze recuperate/anno", value: `${Math.round((a * 12 * 20) / 60)} h` },
      { label: "Bozze di cedolino calcolate/anno", value: `${a * 12}` },
      { label: "Fogli presenze da ricopiare a mano", value: "0" },
    ],
    closingPitch:
      "Stima basata su 20 minuti al mese per dipendente. Non conta il valore di vedere il costo del personale prima dei cedolini, né le correzioni evitate il mese dopo.",
  },

  salesKicker: "Impatto operativo",
  salesH2: "Non un programma paghe. Il pezzo che mancava tra cantiere e consulente.",
  salesBody:
    "Il consulente del lavoro ha già il suo programma paghe: quello che gli manca sono ore affidabili. Il modulo Cedolini Paga di Edilizia in Cloud gliele prepara dalle timbrature, con una bozza calcolata sulle aliquote dell'Edilizia Industria che lui controlla e chiude.",
  salesImpact: [
    {
      title: "Fine mese più corto",
      text: "Le presenze sono già contate quando il mese finisce. Il consulente parte prima e i cedolini arrivano senza il giro di domande sulle ore.",
    },
    {
      title: "Anomalie sistemate a monte",
      text: "Le timbrature incomplete le vedi tu, subito, e le chiudi con il capocantiere. Al consulente arrivano ore pulite.",
    },
    {
      title: "Costo del lavoro visibile per cantiere",
      text: "Le ore delle timbrature finiscono sulla commessa giusta. Sai quanto stai spendendo di manodopera mentre il cantiere è aperto, non a fine lavori.",
    },
    {
      title: "Operai che trovano il cedolino da soli",
      text: "Il cedolino è nell'app di cantiere. Niente più 'me lo rimandi su WhatsApp?' e niente buste da consegnare a mano.",
    },
  ],

  featureKicker: "Cosa ottieni davvero",
  featureH2: "Un elenco concreto di quello che il modulo fa oggi.",
  featureRows: [
    {
      label: "Bozza di cedolino dalle timbrature",
      value: "Ore ordinarie e straordinari al 25, 50 e 100% contati dalle timbrature del mese, lordo dallo stipendio in anagrafica.",
    },
    {
      label: "Contributi e trattenute in bozza",
      value: "Contributi INPS e Cassa Edile e IRPEF calcolati con le aliquote standard dell'Edilizia Industria. Artigianato e altri contratti non sono configurati: li verifica il consulente.",
    },
    {
      label: "Giorni incompleti segnalati",
      value: "Se manca un'entrata o un'uscita, il giorno è evidenziato nella bozza. Lo sistemi prima che il dato arrivi al consulente.",
    },
    {
      label: "Controllo del consulente del lavoro",
      value: "Ogni bozza dice che va verificata dal consulente. Il gestionale prepara i dati, non sostituisce il consulente né i suoi adempimenti verso INPS e Cassa Edile.",
    },
    {
      label: "Archivio cedolini per dipendente",
      value: "Un archivio mensile per ogni dipendente. L'operaio vede e stampa i suoi cedolini dall'app di cantiere, l'ufficio dall'area personale.",
    },
    {
      label: "Ferie, permessi e ROL a saldo",
      value: "Saldi sempre aggiornati: quando approvi una richiesta di ferie o permesso, il residuo scende da solo.",
    },
    {
      label: "Righe F24 precompilate",
      value: "Righe di IVA e ritenute IRPEF (codice 1001) del mese già pronte. Il versamento non parte dal gestionale: lo fai tu o il commercialista.",
    },
  ],

  scenarioKicker: "Tre casi reali sul campo",
  scenarioH2: "Tre situazioni in cui il modulo Cedolini Paga cambia il fine mese.",
  scenarios: [
    {
      title: "Uscita dimenticata il giovedì",
      text: "Un operaio ha timbrato l'ingresso ma non l'uscita. A fine mese la bozza evidenzia quel giorno: chiami il capocantiere, sistemi l'orario, e al consulente arriva il dato giusto invece di un cedolino da rifare.",
    },
    {
      title: "Chiusura delle presenze a fine mese",
      text: "L'ultimo giorno del mese apri il modulo: ore e straordinari sono già contati per tutta la squadra, con lordo, contributi e trattenute in bozza. Controlli le anomalie e passi i numeri al consulente, che parte da lì.",
    },
    {
      title: "L'operaio chiede il cedolino di marzo",
      text: "Invece di cercarlo tra le email, gli dici di aprire l'app: il cedolino è nel suo archivio, da vedere o stampare. Se chiede quante ferie gli restano, il saldo è lì accanto.",
    },
  ],

  faqKicker: "Domande frequenti",
  faqH2: "Quello che un titolare di impresa edile vuole sapere prima di attivare il modulo paghe.",
  faqs: [
    {
      q: "Il modulo sostituisce il consulente del lavoro?",
      a: "No. Prepara i dati: conta le ore dalle timbrature, calcola una bozza di cedolino e ti segnala le anomalie. Il consulente del lavoro controlla la bozza, applica il contratto giusto, fa gli adempimenti verso INPS e Cassa Edile e chiude i cedolini.",
    },
    {
      q: "Posso usare il modulo se applico il CCNL Edilizia Artigianato?",
      a: "Timbrature, conteggio delle ore e archivio dei cedolini funzionano con qualunque contratto. La bozza però usa le aliquote standard dell'Edilizia Industria: Artigianato e PMI oggi non sono configurati, quindi i contributi della bozza vanno verificati con il consulente.",
    },
    {
      q: "Come funziona con la Cassa Edile della mia provincia?",
      a: "La bozza calcola i contributi Cassa Edile con le aliquote standard dell'Edilizia Industria, non con quelle della singola cassa provinciale. La denuncia mensile alla Cassa Edile non parte dal gestionale: la fa il consulente del lavoro, partendo dalle ore che il modulo gli prepara.",
    },
    {
      q: "Posso continuare ad avere il consulente paga esterno?",
      a: "Sì, ed è il modo giusto di usare il modulo. Il consulente riceve ore già contate e una bozza da controllare invece di un foglio presenze da ricostruire. I cedolini del mese restano nell'archivio di ogni dipendente, visibili dall'app.",
    },
    {
      q: "La bozza calcola malattia, tredicesima e TFR?",
      a: "No. La bozza copre ore ordinarie, straordinari al 25, 50 e 100%, lordo, contributi INPS e Cassa Edile e IRPEF. Indennità di malattia, tredicesima, TFR, trasferte e banca ore restano al consulente del lavoro.",
    },
    {
      q: "In quali piani è incluso il modulo Cedolini Paga?",
      a: "HR e cedolini sono inclusi nei piani Professionista e Impresa AI, con utenti illimitati. Il prezzo lo definiamo in consulenza sulla tua impresa, e cancelli quando vuoi. I dettagli dei piani sono su /prezzi.",
    },
  ],

  internalLinksKicker: "Esplora la piattaforma",
  internalLinksH2: "Cedolini Paga è collegato a tutto il ciclo del personale.",
  internalLinksBody:
    "I cedolini partono dalle timbrature, prendono lo stipendio dall'anagrafica HR e tengono conto di ferie e permessi approvati.",
  internalLinks: [
    { to: "/funzionalita/hr-personale", title: "HR Personale", text: "Anagrafica dipendenti e stipendio: la base della bozza di cedolino." },
    { to: "/funzionalita/timbrature-gps", title: "Timbrature GPS", text: "Ore lavorate per cantiere registrate via app entrano nella bozza del cedolino." },
    { to: "/funzionalita/ferie-permessi", title: "Ferie e Permessi", text: "Saldi di ferie, permessi e ROL che scendono a ogni richiesta approvata." },
    { to: "/funzionalita/contabilita-fiscale", title: "Contabilità Fiscale", text: "Righe F24 di IVA e ritenute IRPEF precompilate, prima nota in CSV." },
    { to: "/funzionalita/tesoreria", title: "Tesoreria", text: "Conti, movimenti e previsionale di cassa dell'impresa." },
    { to: "/funzionalita/margini-cantiere", title: "Margini Cantiere", text: "Le ore delle timbrature pesano sul costo della commessa giusta." },
    { to: "/funzionalita/scadenzario", title: "Scadenzario", text: "Pagamenti da fare e da ricevere, con le scadenze in un posto solo." },
    { to: "/per/imprese-edili", title: "Software per Imprese di Costruzione", text: "Tutta la piattaforma orientata alle imprese edili italiane." },
    { to: "/prezzi", title: "Prezzi e Piani", text: "Cedolini Paga incluso nei piani Professionista e Impresa AI." },
  ],

  finalCtaH2: "Smetti di ricostruire le presenze a fine mese. Passa al consulente ore già contate.",
  finalCtaBody:
    "31 giorni gratuiti per provare la bozza di cedolino calcolata dalle timbrature dei tuoi cantieri. Straordinari separati, contributi e trattenute in bozza, archivio cedolini nell'app degli operai. Il consulente controlla e chiude, tu cancelli quando vuoi.",
  finalCtaButton: "Prova gratis 31 giorni",
  finalCtaMicrocopy: "Bozza dalle timbrature · Il consulente controlla · Cancelli quando vuoi",

  stickyCtaLabel: "Prova gratis Cedolini Paga",
  stickyCtaMicrocopy: "Bozza cedolino dalle timbrature",

  applicationSubCategory: "Construction Payroll Software",

  relatedBlogSlugs: [
    "ccnl-edilizia-guida",
    "cassa-edile-come-funziona",
    "hr-edilizia-presenze-buste-paga",
  ],
};

export default function CedoliniPaga() {
  return <FunzionalitaPageTemplate config={config} />;
}
