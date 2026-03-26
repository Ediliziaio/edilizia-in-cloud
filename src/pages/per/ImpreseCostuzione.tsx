import { Building2, BarChart3, Users, FileText, TrendingUp, Smartphone } from "lucide-react";
import PerTipoPageTemplate, { PerTipoConfig } from "@/components/landing/PerTipoPageTemplate";

const config: PerTipoConfig = {
  seoTitle: "Gestionale per Imprese di Costruzione — Controllo Margini Commessa in Tempo Reale | Edilizia in Cloud",
  seoDescription: "Il gestionale per imprese di costruzione con AI: controlla margini reali su ogni commessa, gestisci SAL, subappaltatori e computi metrici. Scopri le perdite prima che accadano. Prova gratis 30 giorni.",
  seoKeywords: "gestionale impresa costruzione, software impresa edile, software general contractor, gestione appalti edili, software commesse costruzione, gestionale cantieri multipli, software margini costruzione, SAL software, ERP impresa costruzione italiana",
  seoCanonical: "/per/imprese-costruzione",

  badge: "Imprese di Costruzione & General Contractor",

  heroTitle: (
    <>
      <span className="text-white">Ogni cantiere che chiudi</span>{" "}
      <span className="text-[#F97415]">ti ha davvero guadagnato?</span>
    </>
  ),
  heroSubtitle:
    "L'80% delle imprese edili scopre le perdite a cantiere chiuso — quando non c'è più niente da fare. Con Edilizia in Cloud vedi margini, SAL e costi reali per ogni commessa in tempo reale. Prima che sia troppo tardi.",
  heroImage:
    "https://images.unsplash.com/photo-1504307651254-35680f356dfd?auto=format&fit=crop&w=1400&q=80",

  socialProof: [
    { initials: "CF", name: "Costruzioni Ferretti", city: "Bologna", months: 14, gradient: "from-[#F97415] to-[#e8650e]" },
    { initials: "BG", name: "Bianchi & Grassi Edil", city: "Firenze", months: 9, gradient: "from-[#1a1a2e] to-[#16213e]" },
    { initials: "TM", name: "Tirelli Manufatti", city: "Brescia", months: 22, gradient: "from-[#0f3460] to-[#533483]" },
    { initials: "RE", name: "Romano Edilizia", city: "Napoli", months: 7, gradient: "from-[#2d6a4f] to-[#1b4332]" },
  ],

  problemsTitle: "I problemi che conosce ogni imprenditore edile",
  problemsSubtitle:
    "Se gestisci cantieri multipli con subappaltatori e non hai controllo sui margini in tempo reale, stai lavorando alla cieca.",

  problems: [
    {
      emoji: "🏗️",
      title: "Scopri le perdite solo a cantiere chiuso",
      desc: "Il preventivo era giusto, ma a fine lavori i costi reali erano il 30% in più. Materiali fuori controllo, ore extra non imputate alla commessa, subappaltatori che sforano il contratto. A quel punto non puoi fare nulla.",
    },
    {
      emoji: "📊",
      title: "5 cantieri, 5 Excel diversi, 0 visione d'insieme",
      desc: "Ogni capocantiere ha il suo file, il suo sistema, il suo modo di aggiornare i dati. Tu ogni settimana passi ore a consolidare fogli per avere una fotografia che è già vecchia di 3 giorni.",
    },
    {
      emoji: "💸",
      title: "SAL in ritardo, cassa sempre tesa",
      desc: "I SAL non vengono emessi in tempo, i clienti pagano lentamente e intanto devi pagare subappaltatori e fornitori. Il cash flow diventa un'emergenza mensile invece di un dato sotto controllo.",
    },
    {
      emoji: "📋",
      title: "Computi metrici fatti a sensazione",
      desc: "Prezziario aggiornato a mano, voci di costo stimate, margine calcolato a occhio nel preventivo. Poi arrivano le varianti, le riserve della DL e il margine reale è già evaporato.",
    },
  ],

  transformation: {
    title: "Come cambia il tuo lavoro dal primo mese",
    subtitle: "Non è ottimizzazione. È la differenza tra un'azienda che cresce e una che lavora tanto per guadagnare poco.",
    fromTitle: "Senza Edilizia in Cloud",
    fromItems: [
      "Excel caotico per ogni cantiere — dati sempre in ritardo",
      "Scopri le perdite a lavori finiti, quando non si può rimediare",
      "SAL emessi in ritardo perché nessuno sa quando scattano",
      "Cassa tesa: paghi i subappaltatori prima di incassare",
      "Il capocantiere ti chiama per aggiornarti — o peggio, non ti chiama",
      "Preventivo fatto a sensazione, poi stressato dai costi che salgono",
    ],
    toTitle: "Con Edilizia in Cloud",
    toItems: [
      "Margine reale di ogni commessa aggiornato in tempo reale",
      "Allarmi preventivi quando una commessa sta andando in perdita",
      "SAL generati automaticamente in base all'avanzamento lavori",
      "Forecast di cassa a 90 giorni — liquidità sempre sotto controllo",
      "Il capocantiere aggiorna dall'app: tu vedi tutto senza telefonate",
      "Preventivi da prezziario DEI/regionale con margine protetto",
    ],
  },

  stats: [
    { value: "+8.4%", label: "Margine medio recuperato", sublabel: "su commesse già in corso nei primi 90 giorni" },
    { value: "12h", label: "Risparmiate a settimana", sublabel: "su report, consolidamento dati e riunioni" },
    { value: "87%", label: "Vede le perdite in anticipo", sublabel: "prima che la commessa sia chiusa" },
  ],

  modulesTitle: "I moduli che fanno la differenza su ogni cantiere",
  modulesSubtitle:
    "Non un gestionale generico. Strumenti costruiti per come lavora davvero un'impresa edile italiana.",

  modules: [
    {
      icon: BarChart3,
      name: "Controllo Margini Commessa",
      desc: "Vedi il margine reale di ogni cantiere aggiornato al minuto: costi materiali, manodopera diretta, subappalti e overhead allocato. Allarme automatico se scendi sotto soglia.",
      saving: "Evita perdite medie del 8%",
    },
    {
      icon: FileText,
      name: "SAL & Fatturazione Avanzamento",
      desc: "Genera SAL automatici dall'avanzamento lavori registrato in cantiere. Calcola ritenute di garanzia, residui e scadenze. Zero fogli Excel, zero dimenticanze.",
      saving: "Incassi più veloci di 3 settimane",
    },
    {
      icon: Users,
      name: "Gestione Subappaltatori",
      desc: "Registro completo per ogni subappaltatore: ordini, bolle, fatture ricevute, ritenute di garanzia e stato pagamenti. Nessuna sorpresa a fine lavori.",
      saving: "Zero contenziosi irrisolti",
    },
    {
      icon: TrendingUp,
      name: "Forecast Cassa 90gg",
      desc: "Proiezione automatica di liquidità basata su SAL emessi, scadenze fornitori, costi fissi e rate subappalti. Sai oggi se avrai un problema tra 30 giorni.",
      saving: "Liquidità sempre positiva",
    },
    {
      icon: Building2,
      name: "Computi Metrici & Preventivi",
      desc: "Crea preventivi professionali partendo dal prezziario DEI/regionale o dal tuo listino personalizzato. Converti in commessa attiva in un click.",
      saving: "−3h per ogni preventivo",
    },
    {
      icon: Smartphone,
      name: "App Mobile Cantiere",
      desc: "Il capocantiere aggiorna SAL, carica foto, registra bolle di consegna e timbra le presenze dal telefono. Tutto sincronizzato in tempo reale senza tornare in ufficio.",
      saving: "−80% burocrazia in cantiere",
    },
  ],

  caseStudy: {
    company: "Costruzioni Ferretti S.r.l.",
    city: "Bologna",
    sector: "Costruzioni residenziali e commerciali",
    revenue: "2.4M €",
    person: "Gianluca Ferretti",
    role: "Titolare",
    initials: "GF",
    gradient: "from-[#F97415] to-[#e8650e]",
    quote:
      "In sei mesi ho scoperto che 2 cantieri su 7 erano in perdita. Uno lo sospettavo. L'altro mi ha gelato. Adesso ogni lunedì mattina apro il gestionale e in 10 minuti so esattamente come stanno andando tutti i cantieri — margini, SAL aperti, subappaltatori da pagare. Prima impiegavo mezza giornata per avere la metà delle informazioni.",
    metrics: [
      { label: "Margine medio per commessa", before: "4.2%", after: "11.8%" },
      { label: "Ore settimana su reportistica", before: "14h", after: "2h" },
      { label: "Commesse monitorate in tempo reale", before: "0", after: "7" },
    ],
    image: "https://images.unsplash.com/photo-1504307651254-35680f356dfd?auto=format&fit=crop&w=800&q=80",
  },

  faq: [
    {
      q: "Funziona con SAL a percentuale di avanzamento lavori?",
      a: "Sì, gestisce SAL a percentuale, a misura e misti. Il sistema calcola automaticamente gli importi fatturabili, le ritenute di garanzia da applicare e il residuo a fine lavori. Tutto conforme alla normativa appalti italiana.",
    },
    {
      q: "Come gestisco più subappaltatori sullo stesso cantiere?",
      a: "Ogni subappaltatore ha la sua scheda commessa con contratto, SAL ricevuti, fatture, ritenute di garanzia accumulate e stato pagamenti. Puoi vedere in un colpo solo quanto devi a ciascuno e quando scadono le ritenute.",
    },
    {
      q: "Posso importare i computi metrici che faccio già con PriMus o Excel?",
      a: "Sì. Importiamo computi in formato Excel/CSV e file standard PriMus. Il nostro team ti affianca durante il setup nelle prime 48h: nessun dato va perso e nessun preventivo va riscritto da zero.",
    },
    {
      q: "Il capocantiere deve saper usare il computer?",
      a: "No. L'app mobile è progettata per chi usa il telefono solo per WhatsApp. Foto, bolle, timbrature e aggiornamento SAL si fanno in 3 tocchi. Abbiamo clienti con capicantiere over 55 che la usano senza problemi dal primo giorno.",
    },
  ],

  ctaTitle: (
    <>
      <span className="text-white">Smetti di scoprire le perdite</span>{" "}
      <span className="text-[#F97415]">a cantiere chiuso.</span>
    </>
  ),
  ctaSubtitle:
    "30 minuti di demo gratuita: ti mostriamo i margini reali di un cantiere tipo. Nessun impegno, nessuna carta di credito.",

  schemaFaq: [
    {
      q: "Qual è il miglior gestionale per imprese di costruzione?",
      a: "Edilizia in Cloud è il gestionale per imprese di costruzione più usato in Italia: controlla margini reali per commessa, gestisce SAL automatici, subappaltatori con ritenute di garanzia e previsione cassa a 90 giorni.",
    },
    {
      q: "Come si gestiscono i SAL con un software per costruzioni?",
      a: "Il software genera automaticamente i SAL sulla base dell'avanzamento lavori registrato dal capocantiere in app. Calcola importi, applica le ritenute di garanzia e traccia i residui fino al saldo finale.",
    },
  ],
};

export default function ImpreseCostuzione() {
  return <PerTipoPageTemplate config={config} />;
}
