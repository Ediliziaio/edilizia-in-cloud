import { Zap, FileText, BarChart3, Users, TrendingUp, Smartphone } from "lucide-react";
import PerTipoPageTemplate, { PerTipoConfig } from "@/components/landing/PerTipoPageTemplate";

const config: PerTipoConfig = {
  seoTitle: "Software Gestionale per Installatori Fotovoltaico — Pratiche GSE, SAL, Incentivi | Edilizia in Cloud",
  seoDescription: "Il gestionale per installatori fotovoltaico che automatizza le pratiche GSE, gestisce SAL impianti FV, coordina i tecnici su più cantieri e calcola i margini per kWp in tempo reale. Zero incentivi persi per errori burocratici. Prova gratis 31 giorni.",
  seoKeywords: "software gestionale fotovoltaico, gestionale installatori pannelli solari, software pratiche GSE, gestionale energie rinnovabili, software impianti fotovoltaici, gestionale SAL fotovoltaico, software incentivi fotovoltaico, CACER software, pratiche ARERA fotovoltaico, allaccio rete gestore",
  seoCanonical: "/per/fotovoltaico",

  badge: "Imprese Fotovoltaico & Rinnovabili",

  heroTitle: (
    <>
      <span className="text-white">Le pratiche GSE non devono</span>{" "}
      <span className="text-[#F97415]">costarti più del cantiere.</span>
    </>
  ),
  heroSubtitle: "Pratiche GSE, SAL impianti FV, allaccio gestore, CACER, pratiche ARERA: ogni passaggio burocratico tracciato, ogni scadenza rispettata. I tuoi tecnici sul tetto a installare — non in ufficio a compilare moduli che poi vengono respinti.",

  heroImage: "https://images.unsplash.com/photo-1509391366360-2e959784a276?auto=format&fit=crop&w=1400&q=80",

  socialProof: [
    { initials: "SE", name: "SolarEnergy Sud Srl", city: "Bari", months: 16, gradient: "from-[#F97415] to-[#c85e0a]" },
    { initials: "FV", name: "FotoVerde Impianti", city: "Palermo", months: 8, gradient: "from-[#0d8f79] to-[#0a6b5a]" },
    { initials: "PR", name: "PowerRoof Srl", city: "Catania", months: 22, gradient: "from-[#1a6fad] to-[#0d4f80]" },
    { initials: "SI", name: "SunInstall Snc", city: "Salerno", months: 13, gradient: "from-[#7c3aed] to-[#5b21b6]" },
  ],

  problemsTitle: "La burocrazia fotovoltaica ti sta bloccando la crescita",
  problemsSubtitle: "Ogni installatore con più di 5 impianti attivi al mese riconosce queste situazioni. Se ne riconosci tre o quattro, stai lasciando soldi sul tavolo ogni giorno.",

  problems: [
    {
      emoji: "📋",
      title: "Pratiche GSE interminabili: ogni impianto è un labirinto a sé",
      desc: "Accesso agli incentivi, Scambio sul Posto, Ritiro Dedicato, CACER: ogni pratica GSE ha documenti diversi, portali diversi, tempistiche diverse. Un errore di compilazione significa ricominciare da capo — e il cliente aspetta, innervosito, mentre tu perdi giorni.",
    },
    {
      emoji: "🌤️",
      title: "Tecnici su 4 cantieri contemporanei: chi fa cosa, nessuno lo sa con certezza",
      desc: "Hai 3 squadre in campo, 2 impianti in fase di collaudo, un allaccio rete in attesa del gestore e un progetto esecutivo da consegnare entro venerdì. Il coordinamento avviene su WhatsApp — e ogni mattina la prima ora se ne va a capire chi è dove.",
    },
    {
      emoji: "💸",
      title: "Margini erosi dalle variazioni prezzo dei pannelli, scoperte a lavoro finito",
      desc: "Il preventivo lo hai fatto 6 settimane fa. Nel frattempo il prezzo dei moduli da 400Wp è cambiato due volte e l'inverter che avevi quotato non è più disponibile. Scopri di aver lavorato sotto costo solo quando chiudi la commessa.",
    },
    {
      emoji: "🔌",
      title: "SAL documentati male: rischi di perdere gli incentivi per un verbale di collaudo incompleto",
      desc: "Il GSE è rigido: un SAL non conforme, una scheda tecnica mancante, una foto di installazione non georeferenziata possono bloccare l'erogazione dell'incentivo. Il tuo cliente resta senza pagamento — e la responsabilità tecnica è tua.",
    },
  ],

  roi: {
    lossValue: "€ 31.000",
    lossLabel: "in incentivi GSE persi per errori burocratici",
    wasteValue: "€ 16.000",
    wasteLabel: "ore su pratiche GSE, ARERA e coordinamento squadre",
    errorValue: "€ 8.000",
    errorLabel: "in margini erosi da variazioni prezzi pannelli non monitorate",
    totalLoss: "€ 55.000",
    softwareCost: "€ 2.388",
    roiX: "23x",
  },

  transformation: {
    title: "Prima di Edilizia in Cloud vs. Dopo",
    subtitle: "Stessa impresa, stesse squadre, stesso mercato. La differenza è solo nell'organizzazione.",
    fromTitle: "Senza gestionale — ogni settimana",
    fromItems: [
      "Pratiche GSE compilate a mano su PDF, documenti inviati via email senza traccia",
      "Margini calcolati a spanne su Excel: scopri il rosso solo a fine commessa",
      "Tecnici coordinati via WhatsApp: chi porta i pannelli da 415Wp? Nessuno lo sa di certo",
      "SAL documentati con foto prese dallo smartphone senza georeferenziazione né numerazione",
      "Allaccio rete e pratiche ARERA gestiti in parallelo senza connessione al cantiere",
      "Progetto esecutivo su PC del geometra: se è fuori ufficio, tutto si ferma",
    ],
    toTitle: "Con Edilizia in Cloud — da subito",
    toItems: [
      "Templates pratiche GSE pre-compilati per tipo di incentivo: Scambio sul Posto, Ritiro Dedicato, CACER",
      "Margini per kWp in real-time: costo installato vs. preventivato aggiornato ad ogni acquisto materiali",
      "Dashboard multi-cantiere: ogni tecnico vede i suoi cantieri, i materiali assegnati e le priorità del giorno",
      "SAL fotovoltaico con foto georeferenziate, misure registrate in app e verbale di collaudo generato automaticamente",
      "Pratiche allaccio e ARERA collegate alla scheda impianto: stato aggiornato, scadenze e riferimenti gestore",
      "Progetto esecutivo e documentazione tecnica archiviati nel cloud, accessibili da qualsiasi dispositivo",
    ],
  },

  stats: [
    { value: "+4", label: "impianti/mese gestiti", sublabel: "con le stesse squadre di prima" },
    { value: "−70%", label: "tempo su pratiche GSE", sublabel: "grazie ai template automatici" },
    { value: "0", label: "incentivi persi per errori burocratici", sublabel: "SAL e collaudi sempre conformi" },
  ],

  modulesTitle: "Strumenti costruiti per chi installa fotovoltaico",
  modulesSubtitle: "Sei moduli che coprono l'intero ciclo di vita dell'impianto: dal progetto esecutivo al collaudo GSE.",

  modules: [
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
      icon: BarChart3,
      name: "Margini per kWp in Tempo Reale",
      desc: "Ogni acquisto di moduli, inverter e BOS aggiorna il costo per kWp installato della commessa. Vedi il margine reale vs. preventivato in ogni momento — non a fine lavori quando è troppo tardi per intervenire.",
      saving: "+22% margine medio impianto",
    },
    {
      icon: Users,
      name: "Dashboard Multi-Cantiere e Coordinamento Squadre",
      desc: "Visualizza tutti i cantieri attivi su un'unica dashboard: stato avanzamento, squadra assegnata, materiali previsti e prossima attività. Ogni tecnico riceve la propria lista lavori dal cantiere, con materiali e checklist di installazione.",
      saving: "+4 impianti/mese con le stesse risorse",
    },
    {
      icon: TrendingUp,
      name: "Gestione Allaccio Rete e Pratiche ARERA",
      desc: "Traccia la pratica di allaccio con il gestore di rete (ENEL, A2A, Areti) dalla richiesta al contatore installato. Le pratiche ARERA sono collegate alla scheda impianto con scadenze, riferimenti e corrispondenza archiviata.",
      saving: "Zero ritardi per pratiche incomplete",
    },
    {
      icon: Smartphone,
      name: "App Cantiere per Tecnici in Campo",
      desc: "Il tecnico apre l'app, vede il cantiere assegnato, registra le ore, foto-documenta l'installazione e chiude il SAL senza tornare in ufficio. Tutto sincronizzato in tempo reale con il gestionale dell'ufficio.",
      saving: "Collaudo e chiusura SAL in cantiere",
    },
  ],

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
      icon: Zap,
      problem: "Pratiche GSE rigettate per errori: ogni errore costa settimane e incentivi persi",
      solution: "Il modulo pratiche GSE di Edilizia in Cloud guida il compilatore campo per campo, con checklist documenti obbligatori per ogni tipo di impianto (SSP, RID, CACER). La pratica viene validata prima dell'invio. Zero rigetti per dimenticanze.",
      economicBenefit: "−85%",
      benefitLabel: "pratiche GSE rigettate nel primo anno di utilizzo",
    },
    {
      icon: Users,
      problem: "Tecnici su 4 cantieri in contemporanea: nessuno sa chi è dove e cosa manca",
      solution: "Il planning installatori mostra ogni tecnico su mappa, con cantiere assegnato, fase di lavoro e materiali da portare. L'ordine del giorno si aggiorna in tempo reale. Il caposquadra riceve la sua lista sull'app ogni mattina — senza una telefonata.",
      economicBenefit: "+4 impianti/mese",
      benefitLabel: "installati con lo stesso numero di tecnici",
    },
    {
      icon: BarChart3,
      problem: "SAL e stati avanzamento: li produci all'ultimo minuto — a volte in ritardo",
      solution: "Ogni impianto ha il suo SAL automatico: percentuale avanzamento, fase attuale (progettazione, permessi, posa, allaccio, collaudo), documenti allegati per fase. Il cliente riceve aggiornamenti automatici. Il SAL per gli incentivi è già pronto quando serve.",
      economicBenefit: "€ 0",
      benefitLabel: "incentivi persi per SAL fuori tempo",
    },
    {
      icon: TrendingUp,
      problem: "Non sai il margine reale per kWp: prezzi che cambiano, costi variabili, preventivi sbagliati",
      solution: "Il cruscotto margini mostra il costo per kWp installato per ogni commessa: pannelli, inverter, manodopera, pratiche, allaccio. Confronta preventivo vs consuntivo in tempo reale. Capisci su quale tipo di impianto guadagni davvero — e regoli i prezzi di conseguenza.",
      economicBenefit: "+ 12%",
      benefitLabel: "margine medio per commessa nel primo anno",
    },
  ],
  verticalFeaturesTitle: "Gestionale fotovoltaico: pratiche GSE, tecnici in campo e margini per kWp",
  verticalFeaturesSubtitle: "Non un generico gestionale cantieri. Un sistema costruito attorno alle pratiche GSE, agli incentivi rinnovabili e a come funziona davvero un'impresa che installa fotovoltaico.",
  demoLabel: "Vedi come un'impresa fotovoltaico installa 14 impianti al mese senza perdere un incentivo GSE",

  ctaTitle: (
    <>
      <span className="text-white">Più kWp installati al mese.</span>{" "}
      <span className="text-[#F97415]">Zero incentivi persi per burocrazia.</span>
    </>
  ),
  ctaSubtitle: "30 minuti di demo: ti mostriamo come gestire pratiche GSE, tecnici in campo e SAL su un impianto tipo — con i tuoi numeri.",

  schemaFaq: [
    {
      q: "Qual è il miglior software gestionale per imprese fotovoltaico?",
      a: "Edilizia in Cloud è il gestionale per installatori fotovoltaico con template pratiche GSE automatizzati, SAL impianti FV generati dall'app, calcolo margini per kWp in tempo reale, coordinamento multi-squadra e gestione pratiche CACER e allaccio rete.",
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
