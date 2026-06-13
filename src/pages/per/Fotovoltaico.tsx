import {
  Zap, FileText, BarChart3, Users, TrendingUp, Smartphone,
  TrendingDown, Send, Camera, Sparkles, Receipt, Wallet, Warehouse, FolderOpen,
} from "lucide-react";
import PerTipoPageTemplate, { PerTipoConfig } from "@/components/landing/PerTipoPageTemplate";

const config: PerTipoConfig = {
  seoTitle: "Software per Installatori Fotovoltaico | Più Margini, Più Impianti, Zero Caos",
  seoDescription: "Il gestionale per installatori fotovoltaico che controlla i margini per kWp in real-time, gestisce la cassa a 90 giorni, coordina le squadre su più cantieri e automatizza le pratiche GSE.",
  seoKeywords: "software gestionale fotovoltaico, gestionale installatori pannelli solari, software pratiche GSE, gestionale energie rinnovabili, software impianti fotovoltaici, gestionale SAL fotovoltaico, software incentivi fotovoltaico, CACER software, pratiche ARERA fotovoltaico, allaccio rete gestore",
  seoCanonical: "/per/fotovoltaico",

  badge: "Imprese Fotovoltaico & Rinnovabili",

  heroTitle: (
    <>
      <span className="text-white">Aumenta i margini. Blinda la cassa.</span>{" "}
      <span className="text-[#F97415]">Il gestionale con AI per chi installa fotovoltaico.</span>
    </>
  ),
  heroSubtitle: "Non è solo un software per le pratiche GSE: è il sistema che governa tutta l'azienda. Il margine reale per kWp lo vedi mentre lavori (+12% medio per impianto), la cassa la conosci a 90 giorni, le squadre sono coordinate senza WhatsApp — e sì, le pratiche GSE escono con template automatici. Con l'AI che ti avvisa prima che un problema diventi una perdita.",

  heroImage: "https://images.unsplash.com/photo-1509391366360-2e959784a276?auto=format&fit=crop&w=1400&q=80",

  socialProof: [
    { initials: "SE", name: "SolarEnergy Sud Srl", city: "Bari", months: 16, gradient: "from-[#F97415] to-[#c85e0a]" },
    { initials: "FV", name: "FotoVerde Impianti", city: "Palermo", months: 8, gradient: "from-[#0d8f79] to-[#0a6b5a]" },
    { initials: "PR", name: "PowerRoof Srl", city: "Catania", months: 22, gradient: "from-[#1a6fad] to-[#0d4f80]" },
    { initials: "SI", name: "SunInstall Snc", city: "Salerno", months: 13, gradient: "from-[#7c3aed] to-[#5b21b6]" },
  ],

  problemsTitle: "Il vero problema non è il GSE — è perdere margine senza accorgersene.",
  problemsSubtitle: "Le pratiche GSE sono il lavoro visibile. I margini che scivolano, la cassa che manca, i cantieri che si sovrappongono: questo è quello che logora davvero un'impresa che installa fotovoltaico.",

  problems: [
    {
      emoji: "💸",
      title: "Margini erosi dalle variazioni prezzo dei pannelli",
      desc: "Il preventivo lo hai fatto 6 settimane fa. Nel frattempo il prezzo dei moduli da 400Wp è cambiato due volte e l'inverter che avevi quotato non è più disponibile. Scopri di aver lavorato sotto costo solo quando chiudi la commessa.",
    },
    {
      emoji: "🏦",
      title: "Acconti e saldi d'allaccio che tardano",
      desc: "Acconto alla firma del contratto. Saldo quando arriva il contatore. Ma chi segue? Chi sollecita? Su tre impianti aperti in contemporanea, uno ha sempre un pagamento fermo — e la cassa va in negativo mentre stai già installando il quarto.",
    },
    {
      emoji: "🌤️",
      title: "Tecnici su 4 cantieri contemporanei",
      desc: "Hai 3 squadre in campo, 2 impianti in fase di collaudo, un allaccio rete in attesa del gestore e un progetto esecutivo da consegnare entro venerdì. Il coordinamento avviene su WhatsApp — e ogni mattina la prima ora se ne va a capire chi è dove.",
    },
    {
      emoji: "📋",
      title: "Pratiche GSE interminabili",
      desc: "Accesso agli incentivi, Scambio sul Posto, Ritiro Dedicato, CACER: ogni pratica GSE ha documenti diversi, portali diversi, tempistiche diverse. Un errore di compilazione significa ricominciare da capo — e il cliente aspetta, innervosito, mentre tu perdi giorni.",
    },
  ],

  roi: {
    lossValue: "€ 28.000",
    lossLabel: "in margini erosi da variazioni prezzo moduli e inverter non monitorate",
    wasteValue: "€ 14.000",
    wasteLabel: "ore su pratiche GSE, ARERA, coordinamento squadre e SAL fuori spec",
    errorValue: "€ 9.000",
    errorLabel: "in acconti e saldi d'allaccio pagati in ritardo o mai sollecitati",
    totalLoss: "€ 51.000",
    softwareCost: "€ 2.388",
    roiX: "21x",
  },

  transformation: {
    title: "Prima di Edilizia in Cloud vs. Dopo",
    subtitle: "Stessa impresa, stesse squadre, stesso mercato. La differenza è solo nell'organizzazione.",
    fromTitle: "Senza gestionale — ogni settimana",
    fromItems: [
      "Margini calcolati a spanne su Excel: scopri il rosso solo a fine commessa",
      "Acconti e saldi d'allaccio seguiti a memoria: chi sollecita è fortunato",
      "Pratiche GSE compilate a mano su PDF, documenti inviati via email senza traccia",
      "Tecnici coordinati via WhatsApp: chi porta i pannelli da 415Wp? Nessuno lo sa di certo",
      "SAL documentati con foto dallo smartphone senza georeferenziazione né numerazione",
      "Progetto esecutivo su PC del geometra: se è fuori ufficio, tutto si ferma",
    ],
    toTitle: "Con Edilizia in Cloud — da subito",
    toItems: [
      "Margini per kWp in real-time: costo installato vs. preventivato aggiornato ad ogni acquisto",
      "Scadenzario acconti e saldi: ogni pagamento atteso ha la sua data, il suo importo e il suo sollecito automatico",
      "Templates pratiche GSE pre-compilati per tipo di incentivo: Scambio sul Posto, Ritiro Dedicato, CACER",
      "Dashboard multi-cantiere: ogni tecnico vede i suoi cantieri, i materiali assegnati e le priorità del giorno",
      "SAL fotovoltaico con foto georeferenziate, misure registrate in app e verbale di collaudo automatico",
      "Documentazione tecnica e pratiche GSE archiviate nel cloud, accessibili da qualsiasi dispositivo",
    ],
  },

  stats: [
    { value: "+12%", label: "margine medio per impianto", sublabel: "monitorato kWp per kWp" },
    { value: "90gg", label: "cassa prevista", sublabel: "acconti e saldi sempre sotto controllo" },
    { value: "+4", label: "impianti/mese gestiti", sublabel: "con le stesse squadre di prima" },
  ],

  modulesTitle: "Strumenti che governano tutta l'azienda fotovoltaica",
  modulesSubtitle: "Sei moduli che coprono l'intero ciclo di vita dell'impianto: dai margini reali alla cassa, dal coordinamento squadre alle pratiche GSE.",

  modules: [
    {
      icon: BarChart3,
      name: "Margini per kWp in Tempo Reale",
      desc: "Ogni acquisto di moduli, inverter e BOS aggiorna il costo per kWp installato della commessa. Vedi il margine reale vs. preventivato in ogni momento — non a fine lavori quando è troppo tardi per intervenire.",
      saving: "+12% margine medio per impianto",
    },
    {
      icon: Wallet,
      name: "Cassa, Acconti e Scadenzario",
      desc: "Acconti alla firma del contratto, saldi all'allaccio GSE, pagamenti a fornitori di moduli e inverter: tutto in un unico scadenzario. Vedi la cassa prevista a 30, 60 e 90 giorni — e saprai in anticipo quando serve sollecitare un cliente o dilazionare un ordine.",
      saving: "Cassa previsionale a 90 giorni",
    },
    {
      icon: Users,
      name: "Dashboard Multi-Cantiere e Coordinamento Squadre",
      desc: "Visualizza tutti i cantieri attivi su un'unica dashboard: stato avanzamento, squadra assegnata, materiali previsti e prossima attività. Ogni tecnico riceve la propria lista lavori dal cantiere, con materiali e checklist di installazione.",
      saving: "+4 impianti/mese con le stesse risorse",
    },
    {
      icon: FileText,
      name: "Pratiche GSE e Incentivi Automatizzati",
      desc: "Template pre-compilati per Scambio sul Posto, Ritiro Dedicato, Conto Energia e CACER. Il sistema popola automaticamente i dati dell'impianto (kWp, tipologia, indirizzo catastale) nelle pratiche GSE. Checklist documenti specifica per tipo di incentivo con stato avanzamento in tempo reale.",
      saving: "−70% tempo pratiche GSE",
    },
    {
      icon: Zap,
      name: "SAL Impianti FV e Collaudo Digitale",
      desc: "Il tecnico registra le misure dall'app in cantiere, scatta foto georeferenziate e genera il verbale di collaudo in PDF con un click. Il SAL viene prodotto con i documenti richiesti dal GSE: schede tecniche, dichiarazioni di conformità e registro di collaudo.",
      saving: "SAL conforme in 20 minuti",
    },
    {
      icon: Smartphone,
      name: "App Cantiere per Tecnici in Campo",
      desc: "Il tecnico apre l'app, vede il cantiere assegnato, registra le ore, foto-documenta l'installazione e chiude il SAL senza tornare in ufficio. Tutto sincronizzato in tempo reale con il gestionale dell'ufficio.",
      saving: "Collaudo e chiusura SAL in cantiere",
    },
  ],

  aiShowcase: {
    title: "L'AI che lavora per te, anche quando sei sul tetto",
    subtitle:
      "Silvio coordina 19 persone AI specializzate che leggono i dati della tua azienda e agiscono. Per un installatore fotovoltaico significa questo:",
    actions: [
      {
        icon: TrendingDown,
        tag: "Margini",
        title: "Ti avvisa se l'impianto scende sotto margine",
        desc: "Il prezzo dei moduli è cambiato tra preventivo e ordine? L'inverter quotato non è più disponibile? Se il margine per kWp scende sotto la tua soglia, Silvio ti avvisa prima della posa — non a commessa chiusa.",
      },
      {
        icon: Send,
        tag: "Cassa",
        title: "Prepara i solleciti per acconti e saldi",
        desc: "Acconto alla firma, saldo all'allaccio: se un pagamento è in ritardo, Silvio prepara il sollecito con il tono giusto — email o WhatsApp — e te lo mette in firma. Tu approvi, lui invia.",
      },
      {
        icon: Camera,
        tag: "Campo",
        title: "Trasforma foto e vocali in rapportini",
        desc: "Il tecnico carica foto georeferenziate e una nota vocale dal tetto: Silvio genera il rapportino, aggiorna l'avanzamento dell'impianto e prepara la documentazione per il SAL.",
      },
      {
        icon: Sparkles,
        tag: "Vendita",
        title: "Rinforza preventivi e follow-up",
        desc: "Riscrive la proposta puntando su produzione stimata, risparmio in bolletta e incentivi, e prepara il follow-up per i preventivi rimasti fermi — prima che il cliente firmi con un altro.",
      },
    ],
    note: "Non una chat generica: ogni risposta nasce dai dati reali della tua azienda — impianti, listini, pratiche, incassi, squadre.",
  },

  platformExtra: {
    title: "E tutto il resto dell'azienda? Già incluso.",
    subtitle:
      "Non devi incollare cinque software diversi: dentro Edilizia in Cloud c'è tutto quello che serve a un'impresa che installa fotovoltaico, collegato nello stesso posto.",
    items: [
      {
        icon: Receipt,
        name: "Fatturazione elettronica",
        desc: "Fatture SDI attive e passive, acconti e saldi collegati agli impianti, bozze pronte da approvare.",
      },
      {
        icon: Wallet,
        name: "Cassa e scadenzario",
        desc: "Incassi attesi, pagamenti fornitori di moduli e inverter: la cassa prevista a 30, 60 e 90 giorni.",
      },
      {
        icon: Users,
        name: "CRM e pipeline vendite",
        desc: "Richieste, sopralluoghi e trattative in un'unica pipeline: sai sempre chi richiamare e quando.",
      },
      {
        icon: Warehouse,
        name: "Magazzino e DDT",
        desc: "Moduli, inverter e BOS con seriali tracciati, DDT di entrata e uscita collegati a ordini e impianti.",
      },
      {
        icon: FolderOpen,
        name: "Documenti e scadenze",
        desc: "Schede tecniche, conformità, pratiche e garanzie archiviate per impianto: trovi tutto in 5 secondi.",
      },
      {
        icon: BarChart3,
        name: "Report per decidere",
        desc: "Fatturato, margini per kWp e per tipo di impianto, previsioni: i numeri dell'azienda in una schermata.",
      },
    ],
  },

  caseStudy: {
    company: "SolarTech Meridionale SRL",
    city: "Napoli",
    sector: "Installazione impianti fotovoltaici e sistemi di accumulo",
    revenue: "1.8M €",
    person: "Francesco Esposito",
    role: "CEO",
    initials: "FE",
    gradient: "from-[#F97415] to-[#0a7a65]",
    quote: "Prima ogni pratica GSE era una storia a sé: documenti su email, scadenze su Post-it, stato sconosciuto. Gestivamo 3 impianti al mese e stavamo annegando nella burocrazia. Oggi ne gestiamo 7 con le stesse 2 persone in ufficio. Il salto l'ha fatto il gestionale: pratiche GSE con template, SAL generati dall'app, margini per kWp sempre aggiornati. Ho smesso di dormire male.",
    metrics: [
      { label: "Impianti gestiti al mese", before: "3 impianti", after: "7 impianti" },
      { label: "Tempo per pratica GSE completa", before: "2 giorni", after: "4 ore" },
      { label: "SAL non conformi respinti dal GSE", before: "1–2 a trimestre", after: "0 in 18 mesi" },
    ],
  },

  faq: [
    {
      q: "Il software gestisce le pratiche GSE per tutti i tipi di incentivo — Scambio sul Posto, Ritiro Dedicato, CACER?",
      a: "Sì. Il sistema ha template specifici per ogni tipo di pratica GSE: Scambio sul Posto, Ritiro Dedicato, Conto Energia residuo, CACER e pratiche ARERA. I dati dell'impianto (kWp, tipologia, indirizzo catastale, titolare) vengono popolati automaticamente nei documenti. La checklist documenti è diversa per ogni tipo di incentivo e viene aggiornata quando il GSE modifica i requisiti.",
    },
    {
      q: "Come funziona la gestione del SAL per impianti fotovoltaici con incentivi?",
      a: "Il tecnico registra l'avanzamento dall'app in cantiere: misure elettriche, foto georeferenziate, verifica componenti installati. Il sistema genera automaticamente il verbale di SAL con la documentazione richiesta dal GSE: schede tecniche dei moduli, datasheet inverter, dichiarazioni di conformità e registro di collaudo. Il SAL viene collegato alla pratica incentivo attiva sull'impianto.",
    },
    {
      q: "Come si gestisce il coordinamento di più squadre su cantieri diversi contemporaneamente?",
      a: "La dashboard multi-cantiere mostra tutti gli impianti attivi con stato avanzamento, squadra assegnata e materiali previsti. Ogni tecnico vede solo i propri cantieri, con check-list di installazione, materiali assegnati e orari. Lo spostamento di risorse da un cantiere all'altro si fa in 2 click — senza chiamate, senza WhatsApp.",
    },
    {
      q: "Il sistema tiene traccia delle variazioni di prezzo dei pannelli e aggiorna i margini?",
      a: "Sì. Ogni acquisto di materiali — moduli, inverter, BOS, sistemi di accumulo — aggiorna il costo per kWp installato della commessa in tempo reale. Puoi vedere in qualsiasi momento il margine reale vs. preventivato, con dettaglio per voce di costo. Il sistema ti avvisa quando il margine scende sotto la soglia che hai impostato.",
    },
    {
      q: "Gestisce anche le pratiche per i sistemi di accumulo e le CACER?",
      a: "Sì. Il modulo pratiche GSE include template specifici per sistemi di accumulo abbinati al fotovoltaico e per le Comunità Energetiche Rinnovabili (CACER). Per le CACER gestisce la configurazione dei membri, la ripartizione dei benefici e la documentazione per il GSE e il gestore di rete locale.",
    },
    {
      q: "Come gestisce la pratica di allaccio rete con i diversi gestori (ENEL, A2A, Areti)?",
      a: "La scheda impianto include un modulo dedicato all'allaccio rete con tutti i passaggi: richiesta di connessione, preventivo gestore, accettazione, lavori di allaccio e attivazione. Ogni step ha la sua data, il documento allegato e il riferimento del gestore. Il sistema ti avvisa sulle scadenze di risposta del gestore per non perdere i termini previsti dal TICA.",
    },
  ],

  verticalFeatures: [
    {
      icon: BarChart3,
      problem: "Non sai il margine reale per kWp: prezzi che cambiano, costi variabili, preventivi sbagliati",
      solution: "Il cruscotto margini mostra il costo per kWp installato per ogni commessa: pannelli, inverter, manodopera, pratiche, allaccio. Confronta preventivo vs consuntivo in tempo reale. Capisci su quale tipo di impianto guadagni davvero — e regoli i prezzi di conseguenza.",
      economicBenefit: "+ 12%",
      benefitLabel: "margine medio per commessa nel primo anno",
    },
    {
      icon: Users,
      problem: "Tecnici su 4 cantieri in contemporanea: nessuno sa chi è dove e cosa manca",
      solution: "Il planning installatori mostra ogni tecnico su mappa, con cantiere assegnato, fase di lavoro e materiali da portare. L'ordine del giorno si aggiorna in tempo reale. Il caposquadra riceve la sua lista sull'app ogni mattina — senza una telefonata.",
      economicBenefit: "+4 impianti/mese",
      benefitLabel: "installati con lo stesso numero di tecnici",
    },
    {
      icon: Zap,
      problem: "Pratiche GSE rigettate per errori: ogni errore costa settimane e incentivi persi",
      solution: "Il modulo pratiche GSE di Edilizia in Cloud guida il compilatore campo per campo, con checklist documenti obbligatori per ogni tipo di impianto (SSP, RID, CACER). La pratica viene validata prima dell'invio. Zero rigetti per dimenticanze.",
      economicBenefit: "−85%",
      benefitLabel: "pratiche GSE rigettate nel primo anno di utilizzo",
    },
    {
      icon: TrendingUp,
      problem: "SAL e stati avanzamento: li produci all'ultimo minuto — a volte in ritardo",
      solution: "Ogni impianto ha il suo SAL automatico: percentuale avanzamento, fase attuale (progettazione, permessi, posa, allaccio, collaudo), documenti allegati per fase. Il cliente riceve aggiornamenti automatici. Il SAL per gli incentivi è già pronto quando serve.",
      economicBenefit: "€ 0",
      benefitLabel: "incentivi persi per SAL fuori tempo",
    },
  ],
  verticalFeaturesTitle: "Gestionale fotovoltaico: margini reali, cassa previsionale, cantieri coordinati",
  verticalFeaturesSubtitle: "Non un generico gestionale cantieri. Un sistema costruito attorno ai margini per kWp, alla cassa di un'impresa che installa — e sì, anche alle pratiche GSE che devono uscire al primo tentativo.",
  demoLabel: "Vedi come un'impresa fotovoltaico controlla margini, cassa e cantieri — senza perdere un incentivo GSE",

  ctaTitle: (
    <>
      <span className="text-white">Più impianti. Margini monitorati.</span>{" "}
      <span className="text-[#F97415]">Cassa sempre sotto controllo.</span>
    </>
  ),
  ctaSubtitle: "30 minuti di demo: ti mostriamo come controllare margini per kWp, cassa e pratiche GSE su un impianto tipo — con i tuoi numeri.",

  schemaFaq: [
    {
      q: "Qual è il miglior software gestionale per imprese fotovoltaico?",
      a: "Edilizia in Cloud è il gestionale per installatori fotovoltaico con controllo margini per kWp in real-time, cassa previsionale a 90 giorni, dashboard multi-cantiere, template pratiche GSE automatizzati e SAL impianti FV generati dall'app.",
    },
    {
      q: "Come si gestiscono le pratiche GSE con un software gestionale per fotovoltaico?",
      a: "Il software ha template pre-compilati per ogni tipo di pratica GSE (Scambio sul Posto, Ritiro Dedicato, CACER) con checklist documenti specifiche, dati impianto popolati automaticamente e stato avanzamento pratica per ogni installazione. Alert automatici per scadenze e documenti mancanti.",
    },
  ],
};

export default function Fotovoltaico() {
  return <PerTipoPageTemplate config={config} />;
}
