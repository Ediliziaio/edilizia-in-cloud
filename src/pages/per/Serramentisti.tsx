import {
  Ruler, Package, Calendar, FileText, TrendingUp, Smartphone, Wallet,
  TrendingDown, Send, Camera, Sparkles, Receipt, Users, Warehouse, FolderOpen, BarChart3,
} from "lucide-react";
import PerTipoPageTemplate, { PerTipoConfig } from "@/components/landing/PerTipoPageTemplate";

const config: PerTipoConfig = {
  // SEO
  seoTitle: "Software per Serramentisti | Più Margini, Zero Caos",
  seoDescription: "Il gestionale completo per serramentisti e installatori di infissi: margine reale per commessa, cassa a 90 giorni, ordini e pose senza errori, squadre organizzate — e preventivi su misura in 60 secondi.",
  seoKeywords: "software serramentisti, gestionale infissi, preventivo finestre, margini serramenti, controllo di gestione serramentista, cassa serramentista, software installatori infissi, gestione ordini serramenti, listino fornitori serramenti, configuratore preventivi infissi, posa in opera, software porte finestre",
  seoCanonical: "/per/serramentisti",

  // Hero
  badge: "Per Serramentisti e Installatori di Infissi",
  heroTitle: (
    <>
      <span className="text-white">Aumenta i margini. Blinda la cassa. Controlla ogni commessa.</span>{" "}
      <span className="text-[#F97415]">Il gestionale con AI per chi produce e posa serramenti.</span>
    </>
  ),
  heroSubtitle:
    "Non è solo un preventivatore: è il sistema che governa tutta l'azienda. Il margine reale di ogni commessa lo vedi mentre lavori (+12% medio sulle commesse monitorate), la cassa la conosci a 90 giorni, ordini e pose filano senza errori — e sì, il preventivo esce in 60 secondi. Con l'AI che ti avvisa prima che un problema diventi un costo.",
  heroImage: "https://images.unsplash.com/photo-1600585154526-990dced4db0d?auto=format&fit=crop&w=1400&q=80",

  // Social proof
  socialProof: [
    { initials: "IF", name: "Infissi Ferretti", city: "Verona", months: 14, gradient: "from-[#111111] to-[#F97415]" },
    { initials: "SP", name: "Serramenti Pellegrini", city: "Brescia", months: 9, gradient: "from-[#0d8f79] to-[#111111]" },
    { initials: "FC", name: "Finestre & Co.", city: "Treviso", months: 18, gradient: "from-[#F97415] to-[#c45a0c]" },
    { initials: "AM", name: "Alluminio Moretti", city: "Bergamo", months: 11, gradient: "from-[#1a1a2e] to-[#0d8f79]" },
  ],

  // Problems
  problemsTitle: "Quanto ti costa gestire l'azienda a memoria, su Excel e WhatsApp?",
  problemsSubtitle:
    "Margini che si assottigliano senza che nessuno se ne accorga, cassa anticipata ai fornitori, commesse di cui solo tu conosci lo stato, preventivi che escono troppo tardi. Ecco cosa costa davvero gestire i serramenti senza un sistema.",
  problems: [
    {
      emoji: "📐",
      title: "Preventivi su misura che richiedono ore",
      desc: "Ogni finestra ha il suo profilo, il suo colore RAL, la sua finitura, il suo vetrocamera. Calcolare il prezzo a mano sul listino cartaceo significa 2-3 ore a preventivo — e se non rispondi entro 48 ore, il cliente ha già chiamato il concorrente.",
    },
    {
      emoji: "📉",
      title: "Margini che sembrano buoni e spariscono a fine commessa",
      desc: "Il preventivo diceva 30%. Poi lo sconto per chiudere, la posa che dura un giorno in più, i pezzi non previsti, la trasferta: il margine reale è 12%. E lo scopri — se lo scopri — mesi dopo, dal commercialista.",
    },
    {
      emoji: "💶",
      title: "La cassa la anticipi tu, per tutti",
      desc: "Il fornitore vuole il bonifico per i profili adesso, il cliente versa l'acconto e poi salda dopo la posa — quando va bene. Con 4-5 commesse aperte stai anticipando decine di migliaia di euro senza sapere quando rientrano.",
    },
    {
      emoji: "📦",
      title: "Ordini ai fornitori confusi, duplicati o dimenticati",
      desc: "Profili PVC, alluminio, guarnizioni, accessori, vetro triplo: quando gli ordini viaggiano via email e WhatsApp, qualcosa va sempre storto. Materiali in ritardo, pose ferme, clienti che chiamano.",
    },
    {
      emoji: "🗓️",
      title: "Installazioni sovrapposte e sopralluoghi non pianificati",
      desc: "Due squadre di posa allo stesso indirizzo lo stesso giorno. Un sopralluogo di misurazioni fissato e dimenticato. La pianificazione su carta o su Excel non regge quando i cantieri crescono.",
    },
    {
      emoji: "🧭",
      title: "Lo stato delle commesse vive solo nella tua testa",
      desc: "Misure fatte? Ordine partito? Merce arrivata? Posa fissata? Saldo incassato? Ogni commessa è a uno stadio diverso e nessun sistema lo traccia. Basta una settimana piena e qualcosa si perde per strada.",
    },
  ],

  // ROI
  roi: {
    lossValue: "€ 16.000",
    lossLabel: "tra preventivi persi per lentezza e commesse vendute sotto margine",
    wasteValue: "€ 10.400",
    wasteLabel: "in ore su preventivi manuali, ordini fornitori e rincorrere lo stato delle commesse",
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
      "Il margine vero lo scopri a fine anno dal commercialista: commessa per commessa, nessuno lo conosce",
      "Anticipi i fornitori e insegui i saldi dei clienti — la cassa la controlli guardando il conto corrente",
      "Ordini ai fornitori sparsi tra email, WhatsApp e foglietti: impossibile tenere traccia",
      "Installazioni coordinate su calendario cartaceo, sovrapposizioni quasi garantite",
      "Lo stato di ogni commessa (misure, ordine, arrivo merce, posa, incasso) vive solo nella tua testa",
    ],
    toTitle: "Dopo: controllo totale",
    toItems: [
      "Configuratore preventivi automatico: profilo, colore RAL, finitura e vetrocamera — il prezzo esce in secondi",
      "Margine reale per commessa e per linea (PVC, alluminio, portoni): vedi subito dove guadagni e dove no",
      "Scadenzario incassi e pagamenti: sai quanto stai anticipando e quando rientra, prima di accettare la prossima commessa",
      "Ordini fornitori generati direttamente dal preventivo approvato, zero ridigitazioni e zero errori di misura",
      "Calendario installazioni con disponibilità squadre, tempi di posa e notifica automatica al cliente",
      "Ogni commessa ha il suo stato — sopralluogo, ordine, arrivo merce, posa, collaudo, saldo — a colpo d'occhio",
    ],
  },

  // Stats
  stats: [
    {
      value: "+12%",
      label: "Margine medio per commessa",
      sublabel: "Quando vedi i numeri in tempo reale, smetti di vendere sotto costo",
    },
    {
      value: "90 gg",
      label: "Di visibilità sulla cassa",
      sublabel: "Acconti, saldi e pagamenti fornitori: sai cosa entra e cosa esce",
    },
    {
      value: "60 sec",
      label: "Per generare un preventivo",
      sublabel: "Da 2-3 ore a 60 secondi — il dettagliato esce in pochi minuti",
    },
  ],

  // Modules
  modulesTitle: "Gli strumenti che ti servono davvero",
  modulesSubtitle:
    "Niente funzionalità inutili. Solo i moduli che fanno uscire più preventivi, proteggono il margine di ogni commessa e tengono la cassa sotto controllo.",
  modules: [
    {
      icon: TrendingUp,
      name: "Margini e Controllo di Gestione",
      desc: "Ogni commessa ha il suo conto economico: materiali dal listino, ore di posa reali, trasferte, extra. Vedi il margine mentre lavori — per commessa e per linea (PVC, alluminio, portoni) — e scopri dove stai vendendo sotto costo.",
      saving: "Margini migliorati in media del 12%",
    },
    {
      icon: Wallet,
      name: "Cassa e Scadenzario",
      desc: "Acconti da incassare, saldi post-posa da sollecitare, bonifici fornitori in uscita: tutto collegato alle commesse. Vedi quanto stai anticipando e la cassa prevista a 30, 60 e 90 giorni.",
      saving: "Zero sorprese a fine mese",
    },
    {
      icon: Ruler,
      name: "Configuratore Preventivi su Misura",
      desc: "Seleziona tipologia (finestra, porta, portone, schermatura solare), profilo (PVC, alluminio, legno), colore RAL, finitura e vetrocamera. Il prezzo aggiornato al listino fornitore esce in automatico.",
      saving: "Da 2h a 60 secondi a preventivo",
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
      desc: "Pianifica sopralluoghi, giornate di posa e assistenze post-vendita. Disponibilità squadre, zero sovrapposizioni, conferma automatica al cliente — e ogni commessa archivia prodotti installati e garanzie.",
      saving: "Zero cantieri sovrapposti",
    },
    {
      icon: Smartphone,
      name: "App Mobile per Sopralluoghi",
      desc: "Vai dal cliente, misuri con l'app, scatti le foto e compili la scheda tecnica direttamente da smartphone. I dati arrivano in ufficio in tempo reale, pronti per l'ordine di produzione.",
      saving: "Misurazioni senza errori di trascrizione",
    },
  ],

  // Sezione AI: cosa fa Silvio, da solo, per un serramentista.
  aiShowcase: {
    title: "L'AI che lavora per te, anche quando sei in cantiere",
    subtitle:
      "Silvio coordina 19 persone AI specializzate che leggono i dati della tua azienda e agiscono. Per un serramentista significa questo:",
    actions: [
      {
        icon: TrendingDown,
        tag: "Margini",
        title: "Ti avvisa quando una commessa perde",
        desc: "Ore di posa oltre il previsto, extra non fatturati, sconto troppo aggressivo: se il margine scende sotto la tua soglia, Silvio ti avvisa subito — non a lavoro finito.",
      },
      {
        icon: Send,
        tag: "Cassa",
        title: "Prepara i solleciti d'incasso",
        desc: "Saldo non arrivato dopo la posa? Silvio prepara il sollecito con il tono giusto — email o WhatsApp — e te lo mette in firma. Tu approvi, lui invia e tiene traccia.",
      },
      {
        icon: Camera,
        tag: "Campo",
        title: "Trasforma foto e vocali in rapportini",
        desc: "La squadra carica le foto e una nota vocale dal cantiere: Silvio genera il rapportino, aggiorna il diario lavori e collega tutto alla commessa giusta.",
      },
      {
        icon: Sparkles,
        tag: "Vendita",
        title: "Rinforza preventivi e follow-up",
        desc: "Riscrive la proposta con valore e garanzie, genera render prima/dopo per far vedere il risultato finito e prepara il follow-up per i preventivi rimasti fermi.",
      },
    ],
    note: "Non una chat generica: ogni risposta nasce dai dati reali della tua azienda — commesse, listini, incassi, squadre.",
  },

  // Ampiezza piattaforma: tutto ciò che non è il preventivatore.
  platformExtra: {
    title: "E tutto il resto dell'azienda? Già incluso.",
    subtitle:
      "Non devi incollare cinque software diversi: dentro Edilizia in Cloud c'è tutto quello che serve a un'azienda di serramenti, collegato nello stesso posto.",
    items: [
      {
        icon: Receipt,
        name: "Fatturazione elettronica",
        desc: "Fatture SDI attive e passive, acconti e saldi collegati alle commesse, bozze pronte da approvare.",
      },
      {
        icon: Users,
        name: "CRM e pipeline vendite",
        desc: "Richieste, sopralluoghi e trattative in un'unica pipeline: sai sempre chi richiamare e quando.",
      },
      {
        icon: Smartphone,
        name: "App per le squadre di posa",
        desc: "Rapportini, foto, presenze e materiali dal telefono — funziona anche offline in cantiere.",
      },
      {
        icon: Warehouse,
        name: "Magazzino e DDT",
        desc: "Arrivi merce, lotti, DDT di entrata e uscita collegati a ordini fornitori e commesse.",
      },
      {
        icon: FolderOpen,
        name: "Documenti e scadenze",
        desc: "Garanzie, schede tecniche e contratti archiviati per commessa: trovi tutto in 5 secondi.",
      },
      {
        icon: BarChart3,
        name: "Report per decidere",
        desc: "Fatturato, margini per linea di prodotto, previsioni: i numeri dell'azienda in una schermata.",
      },
    ],
  },

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
      "Per anni ho scoperto quanto guadagnavo solo a fine anno, dal commercialista. Adesso il margine di ogni commessa lo vedo mentre è ancora aperta: se scende, intervengo subito. So chi mi deve il saldo senza cercare tra le carte, e quanto sto anticipando ai fornitori. E i preventivi, che facevo la sera con la calcolatrice in due ore, escono in un minuto — anche dal telefono, davanti al cliente.",
    metrics: [
      { label: "Margine reale per commessa", before: "scoperto a fine anno", after: "visibile in tempo reale" },
      { label: "Fatturato annuo", before: "480.000 €", after: "620.000 €" },
      { label: "Tempo per preventivo infissi", before: "2-3 ore", after: "60 secondi" },
      { label: "Errori negli ordini di produzione", before: "3-4 al mese", after: "0" },
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
      a: "Selezioni la tipologia (finestra, porta, portone, schermatura solare), le dimensioni, il profilo (PVC, alluminio, legno), il colore RAL o la finitura, il tipo di vetrocamera e gli accessori. Il sistema calcola il prezzo applicando i tuoi coefficienti di ricarico. Il preventivo standard esce in 60 secondi; quello dettagliato, con tutte le specifiche tecniche in PDF, in pochi minuti.",
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
      q: "Posso vedere il margine reale di ogni commessa di serramenti?",
      a: "Sì, ed è il punto che cambia il lavoro. Ogni commessa ha il suo conto economico: materiali al prezzo del listino fornitore, ore di posa registrate dalla squadra, trasferte ed extra. Il margine si aggiorna mentre la commessa avanza — non a consuntivo, mesi dopo. Vedi anche il margine per linea di prodotto: finestre PVC, alluminio, portoni, schermature.",
    },
    {
      q: "Come tengo sotto controllo acconti, saldi e pagamenti ai fornitori?",
      a: "Lo scadenzario è collegato alle commesse: acconto da incassare alla firma, saldo da sollecitare dopo la posa, bonifici fornitori in uscita. Vedi quanto stai anticipando su ogni cantiere e la cassa prevista a 30, 60 e 90 giorni. I solleciti di incasso partono con un click — o in automatico.",
    },
    {
      q: "Funziona anche per chi vende sia infissi residenziali che serramenti per capannoni industriali?",
      a: "Assolutamente. Il configuratore distingue tra diverse tipologie di prodotto (residenziale, commerciale, industriale) con listini e coefficienti separati. Puoi gestire nello stesso gestionale finestre PVC per appartamenti, portoni sezionali per capannoni e sistemi di schermatura solare per edifici commerciali.",
    },
  ],

  verticalFeatures: [
    {
      icon: TrendingUp,
      problem: "Il preventivo diceva 30% di margine. A fine commessa è il 12% — e nessuno se n'è accorto",
      solution: "Ogni commessa ha il suo conto economico: materiali dal listino, ore di posa reali, trasferte, extra. Il margine si aggiorna mentre lavori, non a fine anno. Se una commessa scende sotto la soglia che hai fissato, ricevi l'avviso prima che il danno sia fatto.",
      economicBenefit: "+12%",
      benefitLabel: "margine medio recuperato sulle commesse monitorate",
    },
    {
      icon: Wallet,
      problem: "Paghi i profili al fornitore oggi, il cliente salda dopo la posa: nel mezzo la cassa la fai tu",
      solution: "Lo scadenzario incassi e pagamenti è collegato alle commesse: acconti da chiedere alla firma, saldi da sollecitare dopo la posa, bonifici fornitori in uscita. Vedi la cassa a 30/60/90 giorni e quanto stai anticipando su ogni cantiere — prima di accettare il prossimo.",
      economicBenefit: "90 gg",
      benefitLabel: "di visibilità sulla cassa, commessa per commessa",
    },
    {
      icon: Ruler,
      problem: "Preventivi su misura in 2-3 ore: troppo lenti per stare sul mercato",
      solution: "Il configuratore preventivi di Edilizia in Cloud importa i listini dei tuoi fornitori (PVC, alluminio, legno). Inserisci larghezza, altezza, profilo, colore RAL, tipo di vetro: il prezzo si calcola in automatico. Preventivo pronto in 60 secondi, quello dettagliato in pochi minuti — completo, firmabile via link.",
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
  verticalFeaturesTitle: "Più margine, più controllo, meno errori — su ogni commessa",
  verticalFeaturesSubtitle: "Margine in tempo reale, cassa sotto controllo, configuratore preventivi, ordini fornitori integrati, planning installazioni, verbale di consegna firmato. Tutto connesso. Tutto tracciato.",
  demoLabel: "Vedi margini, cassa e stato di ogni commessa in un'unica schermata — e un preventivo uscire in 60 secondi",

  // CTA
  ctaTitle: (
    <>
      <span className="text-white">Più margine, più controllo, zero sorprese.</span>{" "}
      <span className="text-[#F97415]">E i preventivi escono in 60 secondi.</span>
    </>
  ),
  ctaSubtitle:
    "30 minuti di demo sui numeri della tua attività: ti mostriamo dove finisce il margine di una commessa tipo, quanto stai anticipando di cassa — e generiamo un preventivo con il tuo listino fornitore sotto i tuoi occhi.",

  // Schema FAQ
  schemaFaq: [
    {
      q: "Posso importare il listino del mio fornitore di infissi?",
      a: "Sì. Supportiamo l'importazione dei listini dai principali fornitori di profili PVC, alluminio e sistemi di schermatura solare.",
    },
    {
      q: "Come funziona il configuratore per preventivi su misura?",
      a: "Selezioni tipologia, dimensioni, profilo, colore RAL, vetrocamera e accessori. Il sistema calcola il prezzo automaticamente. Il preventivo standard esce in 60 secondi, il dettagliato in PDF in pochi minuti.",
    },
    {
      q: "Posso vedere il margine reale di ogni commessa di serramenti?",
      a: "Sì. Ogni commessa ha il suo conto economico con materiali, ore di posa, trasferte ed extra. Il margine si aggiorna in tempo reale, per commessa e per linea di prodotto.",
    },
    {
      q: "Come tengo sotto controllo acconti, saldi e pagamenti ai fornitori?",
      a: "Lo scadenzario è collegato alle commesse: acconti, saldi post-posa e bonifici fornitori. Vedi quanto stai anticipando e la cassa prevista a 30, 60 e 90 giorni.",
    },
  ],
};

export default function Serramentisti() {
  return <PerTipoPageTemplate config={config} />;
}
