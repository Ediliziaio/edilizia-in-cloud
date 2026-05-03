import { Ruler, Package, Calendar, FileText, TrendingUp, Smartphone } from "lucide-react";
import PerTipoPageTemplate, { PerTipoConfig } from "@/components/landing/PerTipoPageTemplate";

const config: PerTipoConfig = {
  // SEO
  seoTitle: "Software per Serramentisti | Preventivi Infissi in 20 Minuti",
  seoDescription: "Il gestionale pensato per produttori e installatori di infissi, porte, finestre e serramenti. Preventivi su misura in 20 minuti, ordini fornitori…",
  seoKeywords: "software serramentisti, gestionale infissi, preventivo finestre, software installatori infissi, gestione ordini serramenti, listino fornitori serramenti, configuratore preventivi infissi, posa in opera, software porte finestre",
  seoCanonical: "/per/serramentisti",

  // Hero
  badge: "Per Serramentisti e Installatori di Infissi",
  heroTitle: (
    <>
      <span className="text-white">Un preventivo su misura</span>{" "}
      <span className="text-[#F97415]">non dovrebbe richiedere 2 ore.</span>
    </>
  ),
  heroSubtitle:
    "Ogni finestra ha il suo profilo, il suo RAL, la sua finitura. Un preventivo su misura fatto a mano richiede 2 ore e rischia errori nell'ordine di produzione. Con Edilizia in Cloud configuri la finestra, generi il preventivo e mandi l'ordine al fornitore in 20 minuti — con le misure giuste.",
  heroImage: "https://images.unsplash.com/photo-1600585154526-990dced4db0d?auto=format&fit=crop&w=1400&q=80",

  // Social proof
  socialProof: [
    { initials: "IF", name: "Infissi Ferretti", city: "Verona", months: 14, gradient: "from-[#111111] to-[#F97415]" },
    { initials: "SP", name: "Serramenti Pellegrini", city: "Brescia", months: 9, gradient: "from-[#0d8f79] to-[#111111]" },
    { initials: "FC", name: "Finestre & Co.", city: "Treviso", months: 18, gradient: "from-[#F97415] to-[#c45a0c]" },
    { initials: "AM", name: "Alluminio Moretti", city: "Bergamo", months: 11, gradient: "from-[#1a1a2e] to-[#0d8f79]" },
  ],

  // Problems
  problemsTitle: "Sai quanti preventivi perdi ogni settimana per i tempi di risposta?",
  problemsSubtitle:
    "Il cliente chiede un preventivo per 6 finestre il lunedì mattina. Se non risponde entro 48 ore, ha già chiamato il concorrente. Questi sono i problemi che rallentano ogni preventivo.",
  problems: [
    {
      emoji: "📐",
      title: "Preventivi su misura che richiedono ore",
      desc: "Ogni finestra ha il suo profilo, il suo colore RAL, la sua finitura, il suo vetrocamera. Calcolare il prezzo a mano sul listino cartaceo del fornitore significa 2-3 ore a preventivo, rischio di errori nelle misurazioni e ordini di produzione sbagliati.",
    },
    {
      emoji: "📦",
      title: "Ordini ai fornitori confusi, duplicati o dimenticati",
      desc: "Profili PVC, alluminio, guarnizioni, accessori, vetro triplo: quando gli ordini viaggiano via email e WhatsApp, qualcosa va sempre storto. Materiali in ritardo, cantieri fermi, clienti che chiamano.",
    },
    {
      emoji: "🗓️",
      title: "Installazioni sovrapposte e sopralluoghi non pianificati",
      desc: "Due squadre di posa in opera allo stesso indirizzo lo stesso giorno. Un sopralluogo di misurazioni fissato e dimenticato. La pianificazione su carta o su Excel non regge quando i cantieri crescono.",
    },
    {
      emoji: "🔒",
      title: "Garanzie infissi e post-vendita che nessuno traccia",
      desc: "La garanzia decennale sul vetrocamera, la garanzia biennale sulla posa in opera, il cliente che richiama dopo 3 anni: senza un sistema, non sai cosa hai installato, quando, con quale materiale e quale fornitore.",
    },
  ],

  // ROI
  roi: {
    lossValue: "€ 16.000",
    lossLabel: "in preventivi persi per tempi troppo lunghi",
    wasteValue: "€ 10.400",
    wasteLabel: "ore su preventivi manuali, ordini fornitori e sopralluoghi",
    errorValue: "€ 7.200",
    errorLabel: "in errori di misura, ordini sbagliati e resi fornitori",
    totalLoss: "€ 33.600",
    softwareCost: "€ 2.388",
    roiX: "14x",
  },

  // Transformation
  transformation: {
    title: "Com'è lavorare prima e dopo Edilizia in Cloud",
    subtitle:
      "La differenza non è solo nel software. È nel tempo che torna a te, nella qualità dei preventivi e nell'ordine che finalmente regna in officina.",
    fromTitle: "Prima: il solito caos",
    fromItems: [
      "Preventivi calcolati a mano con il listino cartaceo del fornitore — uno sbaglio e si rifa tutto da capo",
      "Ordini ai fornitori sparsi tra email, WhatsApp e foglietti: impossibile tenere traccia",
      "Installazioni coordinate su calendario cartaceo, sovrapposizioni quasi garantite",
      "Misurazioni da sopralluogo trascritte a mano, errori in produzione inevitabili",
      "Garanzie infissi su file Excel che nessuno aggiorna mai",
      "Il cliente chiama e tu non sai cosa gli hai montato 2 anni fa",
    ],
    toTitle: "Dopo: controllo totale",
    toItems: [
      "Configuratore preventivi automatico: selezioni profilo, colore RAL, finitura e vetrocamera — il prezzo esce in secondi",
      "Ordini fornitori generati direttamente dal preventivo approvato, zero ridigitazioni",
      "Calendario installazioni con disponibilità squadre, tempi di posa e notifica automatica al cliente",
      "App mobile per sopralluoghi: misuri, scatti le foto e i dati entrano direttamente nell'ordine di produzione",
      "Archivio garanzie per ogni commessa: hai tutto in un click quando il cliente richiama",
      "Storico completo di ogni finestra, porta e portone installato, con fornitore e data di posa",
    ],
  },

  // Stats
  stats: [
    {
      value: "20 min",
      label: "Tempo medio per preventivo infissi",
      sublabel: "Da 2-3 ore a 20 minuti — verificato dai nostri clienti",
    },
    {
      value: "+40%",
      label: "Preventivi evasi a settimana",
      sublabel: "Stesso tempo, il doppio dei preventivi usciti",
    },
    {
      value: "0",
      label: "Errori di misura in produzione",
      sublabel: "I dati del sopralluogo entrano direttamente nell'ordine",
    },
  ],

  // Modules
  modulesTitle: "Gli strumenti che ti servono davvero",
  modulesSubtitle:
    "Niente funzionalità inutili. Solo i moduli che riducono il tempo su ogni preventivo, ogni ordine ai fornitori e ogni installazione.",
  modules: [
    {
      icon: Ruler,
      name: "Configuratore Preventivi su Misura",
      desc: "Seleziona tipologia (finestra, porta, portone, schermatura solare), profilo (PVC, alluminio, legno), colore RAL, finitura e vetrocamera. Il prezzo aggiornato al listino fornitore esce in automatico.",
      saving: "Da 2h a 20min a preventivo",
    },
    {
      icon: Package,
      name: "Gestione Ordini Fornitori",
      desc: "Dal preventivo approvato all'ordine di produzione in un click. Profili, vetri, ferramenta, accessori: tutto ordinato con le quantità esatte, senza ridigitare nulla.",
      saving: "Risparmio: 45min per ordine",
    },
    {
      icon: Calendar,
      name: "Calendario Installazioni",
      desc: "Pianifica sopralluoghi di misurazione, giornate di posa in opera e interventi di assistenza. Visualizza la disponibilità delle squadre, evita sovrapposizioni e invia conferma automatica al cliente.",
      saving: "Zero cantieri sovrapposti",
    },
    {
      icon: FileText,
      name: "Archivio Garanzie e Post-Vendita",
      desc: "Ogni commessa ha la sua scheda: prodotti installati, fornitore, data di posa in opera, garanzia infissi e garanzia manodopera. Quando il cliente chiama, hai tutto in 5 secondi.",
      saving: "Assistenza post-vendita professionale",
    },
    {
      icon: TrendingUp,
      name: "Analisi Margini per Tipologia",
      desc: "Scopri quale linea ti rende di più: finestre PVC, porte alluminio, schermature solari o portoni. Ottimizza il listino prezzi e smetti di vendere sotto costo senza saperlo.",
      saving: "Margini migliorati in media del 12%",
    },
    {
      icon: Smartphone,
      name: "App Mobile per Sopralluoghi",
      desc: "Vai dal cliente, misuri con l'app, scatti le foto e compili la scheda tecnica direttamente da smartphone. I dati arrivano in ufficio in tempo reale, pronti per l'ordine di produzione.",
      saving: "Misurazioni senza errori di trascrizione",
    },
  ],

  // Case Study
  caseStudy: {
    company: "Infissi & Serramenti Bianchi SRL",
    city: "Padova",
    sector: "Produzione e installazione infissi",
    revenue: "620.000 €",
    person: "Roberto Bianchi",
    role: "Titolare",
    initials: "RB",
    gradient: "from-[#111111] to-[#F97415]",
    quote:
      "Facevo i preventivi la sera, dopo cena, con il listino del fornitore aperto sul tavolo e la calcolatrice in mano. Due ore a preventivo, minimo. Ora lo faccio in 20 minuti dal computer o dal telefono, mentre sono ancora dal cliente. Ho raddoppiato i preventivi evasi senza assumere nessuno.",
    metrics: [
      { label: "Tempo per preventivo infissi", before: "2-3 ore", after: "20 minuti" },
      { label: "Errori negli ordini di produzione", before: "3-4 al mese", after: "0" },
      { label: "Installazioni pianificate digitalmente", before: "0%", after: "100%" },
      { label: "Fatturato annuo", before: "480.000 €", after: "620.000 €" },
    ],
    image: "https://images.unsplash.com/photo-1497366216548-37526070297c?auto=format&fit=crop&w=800&q=80",
  },

  // FAQ
  faq: [
    {
      q: "Posso importare il listino del mio fornitore di infissi?",
      a: "Sì. Supportiamo l'importazione dei listini dai principali fornitori di profili PVC, alluminio e sistemi di schermatura solare. Il configuratore preventivi utilizza automaticamente i prezzi aggiornati. Ogni volta che il fornitore aggiorna il listino, lo aggiorni anche nel tuo configuratore in pochi minuti.",
    },
    {
      q: "Come funziona il configuratore per preventivi su misura?",
      a: "Selezioni la tipologia (finestra, porta, portone, schermatura solare), le dimensioni, il profilo (PVC, alluminio, legno), il colore RAL o la finitura, il tipo di vetrocamera e gli accessori. Il sistema calcola il prezzo applicando i tuoi coefficienti di ricarico. Il preventivo è pronto in PDF con tutte le specifiche tecniche in meno di 20 minuti.",
    },
    {
      q: "L'app mobile funziona anche offline durante il sopralluogo?",
      a: "Sì. L'app funziona offline. Puoi compilare la scheda di misurazione, scattare le foto e annotare le condizioni del cantiere anche senza connessione. Quando torni in zona con segnale, tutto si sincronizza automaticamente con il gestionale in ufficio.",
    },
    {
      q: "Come gestisco le garanzie degli infissi installati?",
      a: "Ogni commessa ha una scheda digitale con: prodotti installati (marca, modello, colore, vetrocamera), data di posa in opera, note del montatore, documenti del fornitore e scadenza garanzia. Quando il cliente chiama per un intervento in garanzia, apri la scheda e hai tutto in 5 secondi.",
    },
    {
      q: "Posso pianificare le installazioni e i sopralluoghi direttamente dal software?",
      a: "Sì. Il calendario installazioni mostra la disponibilità di ogni squadra, i tempi stimati per ogni tipo di intervento e le distanze tra i cantieri. Puoi fissare sopralluoghi di misurazione, giornate di posa e appuntamenti post-vendita. Il cliente riceve automaticamente la conferma con orario e nome del tecnico.",
    },
    {
      q: "Funziona anche per chi vende sia infissi residenziali che serramenti per capannoni industriali?",
      a: "Assolutamente. Il configuratore distingue tra diverse tipologie di prodotto (residenziale, commerciale, industriale) con listini e coefficienti separati. Puoi gestire nello stesso gestionale finestre PVC per appartamenti, portoni sezionali per capannoni e sistemi di schermatura solare per edifici commerciali.",
    },
  ],

  verticalFeatures: [
    {
      icon: Ruler,
      problem: "Preventivi su misura in 2-3 ore: troppo lenti per stare sul mercato",
      solution: "Il configuratore preventivi di Edilizia in Cloud importa i listini dei tuoi fornitori (PVC, alluminio, legno). Inserisci larghezza, altezza, profilo, colore RAL, tipo di vetro: il prezzo si calcola in automatico. Preventivo pronto in 20 minuti — completo, firmabile via link.",
      economicBenefit: "×3 preventivi",
      benefitLabel: "generati nella stessa giornata rispetto a prima",
    },
    {
      icon: Package,
      problem: "Ordini ai fornitori con misure sbagliate: resi, ritardi, cantieri bloccati",
      solution: "L'ordine fornitore si genera direttamente dal preventivo approvato: le misure sono quelle del preventivo, il codice articolo è quello del listino. Zero trascrizioni manuali. Zero errori di misura. L'ordine parte in 1 click.",
      economicBenefit: "−90%",
      benefitLabel: "resi e rilavorazioni per errori di ordinazione",
    },
    {
      icon: Calendar,
      problem: "Calendario installazioni: sovrapposizioni, squadre sbagliate, clienti non avvisati",
      solution: "Il planning installazioni mostra tutti gli interventi su mappa e calendario: chi è dove, quante finestre, tempi stimati. Aggiunta di una posa: trovi il primo slot disponibile per quella zona geografica in 30 secondi. Il cliente riceve notifica automatica.",
      economicBenefit: "+2 pose/sett",
      benefitLabel: "pianificate senza sovrapporre squadre",
    },
    {
      icon: FileText,
      problem: "Consegna senza firma: il cliente dice che manca qualcosa — e non puoi dimostrare nulla",
      solution: "Al termine dell'installazione, l'operaio fa firmare al cliente il verbale di consegna direttamente sull'app: data, articoli installati, foto del lavoro finito, firma digitale. Archiviato sulla commessa. Fine delle contestazioni post-posa.",
      economicBenefit: "€ 0",
      benefitLabel: "contestazioni post-consegna non documentate",
    },
  ],
  verticalFeaturesTitle: "Dal preventivo alla firma di consegna — senza errori e senza perdere tempo",
  verticalFeaturesSubtitle: "Configuratore preventivi, ordini fornitori integrati, planning installazioni, verbale di consegna firmato. Tutto connesso. Tutto tracciato.",
  demoLabel: "Vedi come un serramentista genera 8 preventivi in una mattinata — con ordine fornitore incluso",

  // CTA
  ctaTitle: (
    <>
      <span className="text-white">Preventivi in 20 minuti.</span>{" "}
      <span className="text-[#F97415]">Ordini senza errori di misura.</span>
    </>
  ),
  ctaSubtitle:
    "30 minuti di demo: ti mostriamo come configurare un preventivo su misura con il tuo listino fornitore — dalla finestra all'ordine, senza ricopiare niente.",

  // Schema FAQ
  schemaFaq: [
    {
      q: "Posso importare il listino del mio fornitore di infissi?",
      a: "Sì. Supportiamo l'importazione dei listini dai principali fornitori di profili PVC, alluminio e sistemi di schermatura solare.",
    },
    {
      q: "Come funziona il configuratore per preventivi su misura?",
      a: "Selezioni tipologia, dimensioni, profilo, colore RAL, vetrocamera e accessori. Il sistema calcola il prezzo automaticamente. Il preventivo è pronto in PDF in meno di 20 minuti.",
    },
    {
      q: "Come gestisco le garanzie degli infissi installati?",
      a: "Ogni commessa ha una scheda digitale con prodotti installati, data di posa e scadenza garanzia. Quando il cliente chiama, hai tutto in 5 secondi.",
    },
  ],
};

export default function Serramentisti() {
  return <PerTipoPageTemplate config={config} />;
}
