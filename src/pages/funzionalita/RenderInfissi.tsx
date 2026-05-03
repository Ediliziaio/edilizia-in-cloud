import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import {
  ArrowRight,
  BadgeCheck,
  Blinds,
  Camera,
  CheckCircle2,
  Clock,
  DoorOpen,
  FileText,
  Image as ImageIcon,
  LineChart,
  Lock,
  MessageCircle,
  MousePointerClick,
  Play,
  Send,
  ShieldCheck,
  Sparkles,
  Star,
  Sun,
  Target,
  TrendingUp,
  Users,
  Wand2,
  AppWindow,
  XCircle,
  Zap,
} from "lucide-react";
import LandingFooter from "@/components/landing/LandingFooter";
import LandingNavbar from "@/components/landing/LandingNavbar";
import { JsonLd } from "@/components/seo/JsonLd";
import { SITE_URL, useSEO } from "@/hooks/useSEO";

const proofPoints = [
  "Creato per serramentisti, showroom e reti vendita",
  "Prima/dopo sulla foto reale del cliente",
  "PDF e WhatsApp pronti per il follow-up commerciale",
];

const reassurancePoints = [
  "Setup in 60 secondi",
  "Onboarding 1-a-1 incluso",
  "Cancelli quando vuoi",
];

const trustBadges = [
  { icon: ShieldCheck, label: "GDPR Compliant" },
  { icon: Zap, label: "Setup in 60 sec" },
  { icon: Star, label: "4.9/5 stelle" },
  { icon: BadgeCheck, label: "Made in Italy" },
];

const painPoints = [
  {
    icon: Clock,
    title: "Il cliente non compra il profilo: compra certezza",
    text: "Tu parli di profili, vetrocamera, posa, cassonetti e finiture. Lui sta pensando: \"come staranno davvero sulla mia casa?\". Se non riesce a vederlo, rimanda.",
  },
  {
    icon: XCircle,
    title: "Se il valore non si vede, vince lo sconto",
    text: "Quando due preventivi sembrano uguali, il cliente sceglie quello che costa meno. Anche se il tuo prodotto, la tua posa e la tua garanzia valgono molto di più.",
  },
  {
    icon: MessageCircle,
    title: "Il momento caldo dura poco",
    text: "Durante il sopralluogo il cliente è coinvolto. Dopo qualche giorno ha già visto altri preventivi, altre foto e altre promesse. Devi rimanere nella sua testa subito.",
  },
];

const mechanismSteps = [
  {
    icon: Camera,
    title: "Scatti o carichi la foto dell'immobile",
    text: "Facciata, balcone, portafinestra o vano reale: parti dalla casa del cliente, non da un'immagine generica di catalogo.",
  },
  {
    icon: AppWindow,
    title: "Scegli serramento, finitura e oscurante",
    text: "Imposti profilo, colore, vetro, maniglia, cassonetto, tapparella, persiana o scuro. Le scelte tecniche diventano una proposta visibile.",
  },
  {
    icon: FileText,
    title: "Mostri un prima/dopo che aiuta a decidere",
    text: "Consegni un render prima/dopo, lo alleghi al preventivo, lo invii su WhatsApp e lo tieni collegato al contatto o all'opportunità.",
  },
];

const commercialLevers = [
  {
    icon: Target,
    title: "Rendi visibile il valore",
    text: "Il cliente non valuta solo il costo della finestra. Valuta l'effetto finale sulla sua casa, sulla luce e sulla facciata.",
  },
  {
    icon: ShieldCheck,
    title: "Riduci il rischio percepito",
    text: "Colore, proporzioni e stile non restano nella fantasia. Il cliente vede una direzione concreta prima di firmare.",
  },
  {
    icon: Zap,
    title: "Acceleri il follow-up",
    text: "Non richiami dicendo solo \"ha visto il preventivo?\". Richiami partendo da un'immagine chiara e memorabile.",
  },
  {
    icon: BadgeCheck,
    title: "Ti posizioni sopra il concorrente",
    text: "Non sembri il venditore che manda un prezzo. Sembri il consulente che guida il cliente verso una scelta più sicura.",
  },
];

const featureRows = [
  {
    label: "Prima/dopo sulla foto reale",
    value: "Il cliente vede la propria facciata, le proprie aperture, i propri davanzali e il contesto reale dell'intervento.",
  },
  {
    label: "Scelte tecniche tracciate",
    value: "Profilo, colore, vetro, maniglia, cassonetto, tapparella, persiana o oscurante restano leggibili e collegati al render.",
  },
  {
    label: "PDF prima/dopo professionale",
    value: "Un documento ordinato da inviare al cliente, allegare al preventivo e usare in fase di follow-up, con disclaimer dimostrativo.",
  },
  {
    label: "CRM collegato",
    value: "Ogni render può restare associato a contatto e opportunità, così non perdi la storia commerciale della trattativa.",
  },
  {
    label: "Gallery filtrabile",
    value: "Recuperi velocemente i render per data, autore, cliente, opportunità e categoria, anche quando il volume cresce.",
  },
];

const objections = [
  {
    q: "Non rischio di promettere un risultato identico al render?",
    a: "No. Il render è uno strumento dimostrativo e commerciale, non una promessa tecnica assoluta. Serve a mostrare direzione estetica, proporzioni e impatto visivo, con disclaimer chiaro nel PDF.",
  },
  {
    q: "Serve anche se vendo serramenti premium?",
    a: "Sì, soprattutto lì. Più il prezzo sale, più il cliente vuole sentirsi sicuro. Il render aiuta a giustificare valore, scelta estetica e differenza rispetto al preventivo più economico.",
  },
  {
    q: "Funziona anche per tapparelle, persiane e oscuranti?",
    a: "Sì. Il modulo è pensato per il mondo aperture: infissi, vetri, profili, cassonetti, tapparelle, persiane, scuri, maniglie e finiture visibili.",
  },
  {
    q: "Non bastano cataloghi, campioni e showroom?",
    a: "Cataloghi e campioni parlano del prodotto. Il render parla della casa del cliente. È una differenza enorme: il cliente non deve immaginare, deve riconoscere il risultato.",
  },
  {
    q: "Quanto costa? È vincolante?",
    a: "Il modulo Render AI è incluso nel piano per serramentisti e puoi cancellare quando vuoi. Nessun vincolo di durata, nessuna penale, onboarding 1-a-1 incluso.",
  },
];

const scenarioCards = [
  {
    title: "Sopralluogo a casa del cliente",
    text: "Scatti la foto, raccogli preferenze e obiezioni, poi trasformi il preventivo in una proposta visiva che resta impressa.",
  },
  {
    title: "Preventivo fermo da qualche giorno",
    text: "Invii il prima/dopo su WhatsApp e riapri la conversazione con un motivo forte: \"Le faccio vedere come cambierebbe casa sua\".",
  },
  {
    title: "Showroom e scelta finiture",
    text: "Fai confrontare due alternative senza lasciarle astratte: bianco o antracite, persiana o tapparella, look moderno o più classico.",
  },
];

const speedStats = [
  { value: 60, suffix: " sec", label: "per ottenere un render AI da usare in trattativa" },
  { value: 12, prefix: "+", suffix: " pt", label: "di close rate medi stimati con il prima/dopo" },
  { value: 3, prefix: "x", suffix: "", label: "preventivi ricordati in più rispetto a un PDF testuale" },
];

const beforeAfterAreas = [
  {
    title: "Facciata e prospetto",
    before: "Il cliente vede una facciata vecchia, con infissi datati e poca percezione del risultato finale.",
    after: "Vede la stessa facciata con nuovi serramenti, colore coerente e impatto estetico immediato.",
  },
  {
    title: "Vano finestra e portafinestra",
    before: "Il preventivo descrive profilo, vetro e maniglia, ma il cliente non riesce a immaginare proporzioni e stile.",
    after: "Il render mostra il nuovo serramento nel vano reale, con cornici, vetro e ferramenta più leggibili.",
  },
  {
    title: "Oscuranti e persiane",
    before: "Tapparelle, scuri e persiane restano parole tecniche o campioni separati dalla casa.",
    after: "Il cliente vede oscuranti, colore e finitura applicati al suo contesto, senza doverli immaginare.",
  },
  {
    title: "Cassonetti e dettagli",
    before: "Gli accessori sembrano voci secondarie del preventivo, spesso difficili da valorizzare.",
    after: "Cassonetti, finiture e dettagli diventano parte visibile della proposta e aiutano l'upsell.",
  },
];

const salesImpact = [
  {
    title: "Preventivi meno freddi",
    text: "Il follow-up non parte da una cifra, ma da un'immagine: \"Le mando come cambierebbe casa sua\".",
  },
  {
    title: "Meno confronto al ribasso",
    text: "Quando il cliente vede il risultato, è più facile parlare di qualità, posa, garanzia e differenza reale.",
  },
  {
    title: "Più decisione in showroom",
    text: "Finiture, colori e oscuranti diventano confrontabili in modo immediato, senza lasciare tutto all'immaginazione.",
  },
  {
    title: "Più autorevolezza commerciale",
    text: "Il cliente percepisce un metodo: analisi, configurazione, render, PDF, preventivo e follow-up ordinato.",
  },
];

const integrationPillars = [
  {
    icon: Users,
    title: "CRM serramentisti integrato",
    text: "Ogni render è collegato al contatto, all'opportunità e allo stato della trattativa. Vedi a colpo d'occhio chi è caldo, chi è da richiamare e chi ha già firmato.",
  },
  {
    icon: Send,
    title: "Follow-up automatici WhatsApp & email",
    text: "Sequenze pronte: invio del PDF prima/dopo, promemoria a 48h e 7 giorni, riepilogo del preventivo. Smetti di dimenticarti i clienti tiepidi.",
  },
  {
    icon: LineChart,
    title: "Dashboard margini e cantieri",
    text: "Vedi quanti preventivi hai inviato, quanti chiusi, quale margine reale stai facendo per cantiere e quanto rende ogni canale di acquisizione.",
  },
  {
    icon: FileText,
    title: "Preventivi e fatturazione SDI",
    text: "Dal render al preventivo PDF, dall'ordine alla fattura elettronica: una sola piattaforma, zero duplicazioni e zero copia-incolla.",
  },
];

/* ================================================================== */
/* COUNT UP — animazione numerica al primo scroll-in                   */
/* ================================================================== */

function CountUp({
  value,
  suffix = "",
  prefix = "",
  duration = 1400,
}: {
  value: number;
  suffix?: string;
  prefix?: string;
  duration?: number;
}) {
  const [display, setDisplay] = useState(0);
  const ref = useRef<HTMLSpanElement>(null);
  const started = useRef(false);

  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting && !started.current) {
          started.current = true;
          const start = performance.now();
          const tick = (now: number) => {
            const t = Math.min(1, (now - start) / duration);
            const eased = 1 - Math.pow(1 - t, 3);
            setDisplay(Math.round(eased * value));
            if (t < 1) requestAnimationFrame(tick);
          };
          requestAnimationFrame(tick);
        }
      },
      { threshold: 0.5 }
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [value, duration]);

  return (
    <span ref={ref} className="tabular-nums">
      {prefix}
      {display}
      {suffix}
    </span>
  );
}

/* ================================================================== */
/* HERO — Before/After slider interattivo                              */
/* ================================================================== */

function HouseSvg({ variant }: { variant: "before" | "after" }) {
  const isAfter = variant === "after";
  const skyTop = isAfter ? "#fef3e6" : "#cdd6df";
  const skyBottom = isAfter ? "#fcd9b4" : "#9aa6b2";
  const ground = isAfter ? "#ead0a8" : "#7d8893";
  const wall = isAfter ? "#d8b87c" : "#6b7682";
  const frame = isAfter ? "#1f2937" : "#5a6470";
  const glass = isAfter ? "#bfe1ff" : "#a6b1bd";
  const stroke = isAfter ? "#0f172a" : "#3f4854";

  return (
    <svg
      viewBox="0 0 600 380"
      className="block h-full w-full"
      preserveAspectRatio="xMidYMid slice"
      aria-hidden="true"
    >
      <defs>
        <linearGradient id={`sky-${variant}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={skyTop} />
          <stop offset="100%" stopColor={skyBottom} />
        </linearGradient>
      </defs>
      <rect width="600" height="380" fill={`url(#sky-${variant})`} />
      {/* Sole (only after) */}
      {isAfter && <circle cx="500" cy="60" r="28" fill="#fbbf24" opacity="0.7" />}
      {/* Ground */}
      <rect x="0" y="240" width="600" height="140" fill={ground} />
      {/* House body */}
      <polygon points="60,240 300,90 540,240" fill={wall} stroke={stroke} strokeWidth="2" />
      <rect x="60" y="240" width="480" height="140" fill={wall} stroke={stroke} strokeWidth="2" />
      {/* Door */}
      <rect x="270" y="290" width="60" height="90" fill={frame} stroke={stroke} strokeWidth="2" />
      <circle cx="320" cy="338" r="2.5" fill={isAfter ? "#fbbf24" : "#9aa6b2"} />
      {/* Window left */}
      <rect x="110" y="270" width="100" height="80" fill={frame} stroke={stroke} strokeWidth="2" />
      <rect x="115" y="275" width="90" height="70" fill={glass} />
      <line x1="160" y1="275" x2="160" y2="345" stroke={stroke} strokeWidth="2" />
      <line x1="115" y1="310" x2="205" y2="310" stroke={stroke} strokeWidth="2" />
      {/* Window right */}
      <rect x="390" y="270" width="100" height="80" fill={frame} stroke={stroke} strokeWidth="2" />
      <rect x="395" y="275" width="90" height="70" fill={glass} />
      <line x1="440" y1="275" x2="440" y2="345" stroke={stroke} strokeWidth="2" />
      <line x1="395" y1="310" x2="485" y2="310" stroke={stroke} strokeWidth="2" />
      {/* Top window */}
      <rect x="260" y="160" width="80" height="60" fill={frame} stroke={stroke} strokeWidth="2" />
      <rect x="265" y="165" width="70" height="50" fill={glass} />
      <line x1="300" y1="165" x2="300" y2="215" stroke={stroke} strokeWidth="2" />
      {/* Shutters (only after) */}
      {isAfter && (
        <>
          <rect x="95" y="270" width="14" height="80" fill="#1f2937" stroke="#0f172a" strokeWidth="1" />
          <rect x="211" y="270" width="14" height="80" fill="#1f2937" stroke="#0f172a" strokeWidth="1" />
          <rect x="375" y="270" width="14" height="80" fill="#1f2937" stroke="#0f172a" strokeWidth="1" />
          <rect x="491" y="270" width="14" height="80" fill="#1f2937" stroke="#0f172a" strokeWidth="1" />
        </>
      )}
    </svg>
  );
}

function BeforeAfterSlider() {
  const [pos, setPos] = useState(50);
  const containerRef = useRef<HTMLDivElement>(null);
  const dragging = useRef(false);

  const handleMove = (clientX: number) => {
    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const x = ((clientX - rect.left) / rect.width) * 100;
    setPos(Math.max(2, Math.min(98, x)));
  };

  return (
    <div
      ref={containerRef}
      className="group relative aspect-[16/10] w-full select-none overflow-hidden rounded-2xl border border-white/15 bg-slate-900 shadow-2xl"
      onMouseDown={(e) => {
        dragging.current = true;
        handleMove(e.clientX);
      }}
      onMouseMove={(e) => {
        if (dragging.current) handleMove(e.clientX);
      }}
      onMouseUp={() => {
        dragging.current = false;
      }}
      onMouseLeave={() => {
        dragging.current = false;
      }}
      onTouchStart={(e) => {
        dragging.current = true;
        handleMove(e.touches[0].clientX);
      }}
      onTouchMove={(e) => handleMove(e.touches[0].clientX)}
      onTouchEnd={() => {
        dragging.current = false;
      }}
    >
      {/* AFTER (full) */}
      <div className="absolute inset-0">
        <HouseSvg variant="after" />
      </div>
      {/* BEFORE clipped */}
      <div
        className="absolute inset-0 overflow-hidden"
        style={{ clipPath: `inset(0 ${100 - pos}% 0 0)` }}
      >
        <HouseSvg variant="before" />
      </div>
      {/* Labels */}
      <div className="absolute left-4 top-4 rounded-md bg-slate-900/80 px-3 py-1.5 text-xs font-black uppercase tracking-[0.18em] text-white backdrop-blur">
        Prima
      </div>
      <div className="absolute right-4 top-4 inline-flex items-center gap-2 rounded-md bg-[#F97415] px-3 py-1.5 text-xs font-black uppercase tracking-[0.18em] text-white shadow-md">
        <Sparkles className="h-3 w-3" />
        Dopo · AI
      </div>
      {/* Divider */}
      <div
        className="absolute inset-y-0 w-1 bg-white shadow-[0_0_20px_rgba(255,255,255,0.6)]"
        style={{ left: `calc(${pos}% - 2px)` }}
      />
      <button
        type="button"
        aria-label="Trascina per confrontare prima e dopo"
        className="absolute top-1/2 z-10 flex h-12 w-12 -translate-x-1/2 -translate-y-1/2 cursor-grab items-center justify-center rounded-full bg-white text-[#0f172a] shadow-lg ring-4 ring-white/40 transition active:cursor-grabbing group-hover:scale-105"
        style={{ left: `${pos}%` }}
        onMouseDown={(e) => {
          dragging.current = true;
          handleMove(e.clientX);
          e.stopPropagation();
        }}
      >
        <MousePointerClick className="h-5 w-5" />
      </button>
      {/* Hint */}
      <div className="absolute bottom-4 left-1/2 -translate-x-1/2 rounded-full bg-slate-900/75 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wider text-white backdrop-blur">
        Trascina per confrontare
      </div>
    </div>
  );
}

/* ================================================================== */
/* VIDEO DEMO — placeholder, swap il src con il video reale            */
/* ================================================================== */

// TODO: Sostituire con il video demo reale una volta caricato.
// Posiziona il file in /public/videos/render-infissi-demo.mp4
// e il poster (frame anteprima) in /public/videos/render-infissi-poster.jpg
const DEMO_VIDEO_SRC = "/videos/render-infissi-demo.mp4";
const DEMO_VIDEO_POSTER = "/videos/render-infissi-poster.jpg";

function VideoDemo() {
  const [playing, setPlaying] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);

  const handlePlay = () => {
    setPlaying(true);
    setTimeout(() => {
      videoRef.current?.play().catch(() => {
        /* ignore autoplay block */
      });
    }, 50);
  };

  return (
    <div className="relative overflow-hidden rounded-2xl border border-slate-200 bg-slate-900 shadow-2xl">
      <div className="relative aspect-video w-full">
        <video
          ref={videoRef}
          src={DEMO_VIDEO_SRC}
          poster={DEMO_VIDEO_POSTER}
          controls={playing}
          preload="metadata"
          playsInline
          aria-label="Video demo Render Infissi AI: come trasformi una foto in una vendita"
          title="Demo Render Infissi AI · 60 secondi"
          className="absolute inset-0 h-full w-full object-cover"
        />

        {!playing && (
          <button
            type="button"
            onClick={handlePlay}
            aria-label="Riproduci video demo Render Infissi AI"
            className="absolute inset-0 flex items-center justify-center bg-gradient-to-br from-slate-900/40 via-slate-900/20 to-[#0f172a]/60 transition hover:from-slate-900/30"
          >
            {/* Decorative gradient overlay */}
            <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_30%_30%,rgba(249,116,21,0.25),transparent_55%)]" />

            {/* Top-left badge */}
            <span className="pointer-events-none absolute left-5 top-5 inline-flex items-center gap-2 rounded-md bg-slate-900/80 px-3 py-1.5 text-xs font-black uppercase tracking-[0.18em] text-white backdrop-blur">
              <Sparkles className="h-3.5 w-3.5 text-orange-300" />
              Demo · 60 sec
            </span>

            {/* Bottom-left text */}
            <span className="pointer-events-none absolute bottom-5 left-5 right-5 text-left text-white">
              <span className="block text-base font-extrabold sm:text-lg">
                Guarda come trasformi una foto in un argomento di vendita
              </span>
              <span className="mt-1 block text-xs font-medium text-white/70 sm:text-sm">
                Carichi la foto · Imposti finiture · Generi prima/dopo · Invii al cliente
              </span>
            </span>

            {/* Big play button */}
            <span className="relative flex h-20 w-20 items-center justify-center rounded-full bg-[#F97415] text-white shadow-2xl ring-4 ring-white/20 transition-transform group-hover:scale-110 sm:h-24 sm:w-24">
              <span className="absolute inset-0 animate-ping rounded-full bg-[#F97415] opacity-40" />
              <Play className="relative h-9 w-9 fill-white sm:h-10 sm:w-10" />
            </span>
          </button>
        )}
      </div>
    </div>
  );
}

/* ================================================================== */
/* FAMIGLIA RENDER — moduli AI per ogni categoria                      */
/* ================================================================== */

const renderFamily = [
  {
    icon: AppWindow,
    title: "Render Infissi",
    text: "Finestre, portefinestre, profili, vetri e cornici sulla foto reale del cliente.",
    available: true,
  },
  {
    icon: Blinds,
    title: "Render Persiane",
    text: "Persiane, scuri e oscuranti applicati alla facciata: colore, materiale e geometria.",
    available: true,
  },
  {
    icon: DoorOpen,
    title: "Render Porte",
    text: "Porte interne ed esterne: scegli essenza, finitura, vetro e maniglieria sul vano reale.",
    available: true,
  },
  {
    icon: Sun,
    title: "Render Pergole",
    text: "Pergolati e coperture esterne sul giardino o terrazzo del cliente, con luce naturale.",
    available: true,
  },
  {
    icon: Lock,
    title: "Render Porta Blindata",
    text: "Porte blindate con pannelli, finiture e accessori applicati direttamente all'ingresso reale.",
    available: true,
  },
] as const;

/* ================================================================== */
/* ROI Calculator                                                      */
/* ================================================================== */

function RoiCalculator() {
  const [preventiviMese, setPreventiviMese] = useState(20);
  const [ticketMedio, setTicketMedio] = useState(8000);
  const [closeRateAttuale, setCloseRateAttuale] = useState(25);

  const result = useMemo(() => {
    const upliftPct = 12;
    const newCloseRate = Math.min(closeRateAttuale + upliftPct, 100);
    const ordiniAttuali = (preventiviMese * closeRateAttuale) / 100;
    const ordiniNuovi = (preventiviMese * newCloseRate) / 100;
    const fatturatoAggiuntivoMese = (ordiniNuovi - ordiniAttuali) * ticketMedio;
    const fatturatoAggiuntivoAnno = fatturatoAggiuntivoMese * 12;
    return {
      newCloseRate,
      ordiniAggiuntivi: ordiniNuovi - ordiniAttuali,
      fatturatoAggiuntivoMese,
      fatturatoAggiuntivoAnno,
    };
  }, [preventiviMese, ticketMedio, closeRateAttuale]);

  const formatEuro = (n: number) =>
    new Intl.NumberFormat("it-IT", {
      style: "currency",
      currency: "EUR",
      maximumFractionDigits: 0,
    }).format(n);

  return (
    <div className="rounded-2xl border border-orange-200 bg-white p-6 shadow-lg sm:p-8">
      <div className="grid gap-8 lg:grid-cols-[1.1fr_0.9fr]">
        <div className="space-y-6">
          <div>
            <div className="flex items-center justify-between text-sm font-bold text-[#0f172a]">
              <label htmlFor="preventivi-mese">Preventivi al mese</label>
              <span className="text-[#D95E0B]">{preventiviMese}</span>
            </div>
            <input
              id="preventivi-mese"
              type="range"
              min={5}
              max={120}
              step={1}
              value={preventiviMese}
              onChange={(e) => setPreventiviMese(Number(e.target.value))}
              className="mt-3 w-full accent-[#F97415]"
            />
            <div className="mt-1 flex justify-between text-xs text-slate-500">
              <span>5</span>
              <span>120</span>
            </div>
          </div>
          <div>
            <div className="flex items-center justify-between text-sm font-bold text-[#0f172a]">
              <label htmlFor="ticket-medio">Ticket medio per ordine</label>
              <span className="text-[#D95E0B]">{formatEuro(ticketMedio)}</span>
            </div>
            <input
              id="ticket-medio"
              type="range"
              min={2000}
              max={30000}
              step={500}
              value={ticketMedio}
              onChange={(e) => setTicketMedio(Number(e.target.value))}
              className="mt-3 w-full accent-[#F97415]"
            />
            <div className="mt-1 flex justify-between text-xs text-slate-500">
              <span>{formatEuro(2000)}</span>
              <span>{formatEuro(30000)}</span>
            </div>
          </div>
          <div>
            <div className="flex items-center justify-between text-sm font-bold text-[#0f172a]">
              <label htmlFor="close-rate">Close rate attuale</label>
              <span className="text-[#D95E0B]">{closeRateAttuale}%</span>
            </div>
            <input
              id="close-rate"
              type="range"
              min={5}
              max={70}
              step={1}
              value={closeRateAttuale}
              onChange={(e) => setCloseRateAttuale(Number(e.target.value))}
              className="mt-3 w-full accent-[#F97415]"
            />
            <div className="mt-1 flex justify-between text-xs text-slate-500">
              <span>5%</span>
              <span>70%</span>
            </div>
          </div>
        </div>

        <div className="rounded-xl border border-orange-200 bg-gradient-to-br from-[#fff4e6] to-[#ffe9d2] p-6">
          <p className="text-xs font-black uppercase tracking-[0.18em] text-[#D95E0B]">
            Stima conservativa
          </p>
          <p className="mt-1 text-sm leading-6 text-slate-600">
            +12 punti di close rate ipotizzati grazie al prima/dopo in trattativa.
          </p>

          <div className="mt-5 space-y-4">
            <div className="rounded-lg bg-white p-4">
              <p className="text-xs font-bold uppercase tracking-wider text-slate-500">Nuovo close rate</p>
              <p className="mt-1 text-2xl font-black text-[#0f172a]">{result.newCloseRate.toFixed(0)}%</p>
            </div>
            <div className="rounded-lg bg-white p-4">
              <p className="text-xs font-bold uppercase tracking-wider text-slate-500">Ordini extra al mese</p>
              <p className="mt-1 text-2xl font-black text-[#0f172a]">+{result.ordiniAggiuntivi.toFixed(1)}</p>
            </div>
            <div className="rounded-lg bg-[#0f172a] p-4 text-white">
              <p className="text-xs font-bold uppercase tracking-wider text-orange-200">
                Fatturato aggiuntivo annuo
              </p>
              <p className="mt-1 text-3xl font-black tracking-tight text-white">
                {formatEuro(result.fatturatoAggiuntivoAnno)}
              </p>
              <p className="mt-2 text-xs leading-5 text-slate-300">
                Pari a {formatEuro(result.fatturatoAggiuntivoMese)} al mese in più, a parità di lead.
              </p>
            </div>
          </div>

          <Link
            to="/demo"
            className="mt-5 inline-flex w-full items-center justify-center gap-2 rounded-lg bg-[#F97415] px-5 py-3 text-sm font-extrabold text-white shadow-md transition hover:bg-[#D95E0B]"
          >
            Sblocca il render gratis
            <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      </div>
    </div>
  );
}

/* ================================================================== */
/* CRM/Dashboard mock — usato nella sezione "Edilizia in Cloud"       */
/* ================================================================== */

function DashboardMock() {
  return (
    <div className="relative">
      <div className="absolute -inset-6 rounded-[32px] bg-orange-500/15 blur-3xl" aria-hidden="true" />
      <div
        className="relative overflow-hidden rounded-2xl border border-white/10 bg-[#0a1222] shadow-2xl"
        style={{ transform: "perspective(1200px) rotateX(2deg)" }}
      >
        <div className="flex items-center gap-2 border-b border-white/5 bg-[#070d18] px-4 py-2.5">
          <span className="h-2.5 w-2.5 rounded-full bg-red-400/80" />
          <span className="h-2.5 w-2.5 rounded-full bg-yellow-400/80" />
          <span className="h-2.5 w-2.5 rounded-full bg-emerald-400/80" />
          <span className="ml-3 text-[10px] font-mono text-white/50">app.ediliziaincloud.com / opportunità</span>
        </div>
        <div className="grid grid-cols-1 gap-3 p-4 md:grid-cols-3">
          {/* Stat cards */}
          {[
            { label: "Preventivi inviati", value: "47", trend: "+12%", color: "#3b82f6" },
            { label: "Render generati", value: "29", trend: "+38%", color: "#F97415" },
            { label: "Ordini chiusi", value: "16", trend: "+22%", color: "#22c55e" },
          ].map((s) => (
            <div key={s.label} className="rounded-lg border border-white/5 bg-white/[0.04] p-3">
              <p className="text-[9px] font-bold uppercase tracking-wider text-white/50">{s.label}</p>
              <div className="mt-2 flex items-end justify-between">
                <p className="text-xl font-black text-white">{s.value}</p>
                <span
                  className="rounded-full px-1.5 py-0.5 text-[9px] font-black"
                  style={{ background: `${s.color}25`, color: s.color }}
                >
                  {s.trend}
                </span>
              </div>
            </div>
          ))}
        </div>
        <div className="grid grid-cols-1 gap-3 px-4 pb-4 md:grid-cols-[1.4fr_1fr]">
          {/* Chart */}
          <div className="rounded-lg border border-white/5 bg-white/[0.04] p-3">
            <div className="flex items-center justify-between">
              <p className="text-[10px] font-bold text-white/70">Conversione preventivi · ultimi 6 mesi</p>
              <span className="rounded bg-orange-500/20 px-1.5 py-0.5 text-[9px] font-black text-orange-200">
                con render
              </span>
            </div>
            <div className="mt-3 flex h-20 items-end gap-2">
              {[28, 31, 35, 41, 48, 52].map((h, i) => (
                <div key={i} className="flex flex-1 flex-col items-center gap-1">
                  <div
                    className="w-full rounded-sm"
                    style={{
                      height: `${(h / 60) * 100}%`,
                      background: "linear-gradient(to top, #F97415, #fbbf77)",
                    }}
                  />
                  <span className="text-[8px] text-white/50">{["Set", "Ott", "Nov", "Dic", "Gen", "Feb"][i]}</span>
                </div>
              ))}
            </div>
          </div>
          {/* Pipeline */}
          <div className="rounded-lg border border-white/5 bg-white/[0.04] p-3">
            <p className="text-[10px] font-bold text-white/70">Pipeline render → ordine</p>
            <div className="mt-3 space-y-2">
              {[
                { name: "Rossi M.", stage: "Render inviato", color: "#3b82f6" },
                { name: "Bianchi G.", stage: "Sopralluogo", color: "#f59e0b" },
                { name: "Verdi C.", stage: "Firmato", color: "#22c55e" },
              ].map((r) => (
                <div key={r.name} className="flex items-center justify-between text-[10px]">
                  <span className="truncate text-white/80">{r.name}</span>
                  <span
                    className="rounded-full px-1.5 py-0.5 text-[9px] font-bold"
                    style={{ background: `${r.color}25`, color: r.color }}
                  >
                    {r.stage}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ================================================================== */
/* PAGE                                                                */
/* ================================================================== */

export default function RenderInfissi() {
  useSEO({
    title:
      "Render Infissi AI per Serramentisti",
    description:
      "Render Infissi AI per serramentisti: trasforma la foto reale del cliente in un prima/dopo credibile con nuovi serramenti, colori, vetri, cassonetti,…",
    canonical: "/funzionalita/render-infissi",
    keywords:
      "render infissi, render serramenti, render finestre AI, software serramentisti, prima dopo infissi, configuratore infissi AI, vendita serramenti, render tapparelle, render persiane, render porte blindate, render pergole, AI infissi, software preventivi serramenti, gestionale serramentisti",
    ogImage:
      "https://www.ediliziaincloud.com/og/render-infissi-og.jpg",
  });

  const pageUrl = `${SITE_URL}/funzionalita/render-infissi`;
  const videoUploadDate = "2026-04-27";

  return (
    <div className="min-h-screen bg-white text-[#0f172a]">
      <JsonLd
        id="jsonld-breadcrumb-render-infissi"
        data={{
          "@context": "https://schema.org",
          "@type": "BreadcrumbList",
          itemListElement: [
            { "@type": "ListItem", position: 1, name: "Home", item: `${SITE_URL}/` },
            { "@type": "ListItem", position: 2, name: "Funzionalita", item: `${SITE_URL}/funzionalita` },
            { "@type": "ListItem", position: 3, name: "Render Infissi", item: pageUrl },
          ],
        }}
      />
      <JsonLd
        id="jsonld-software-render-infissi"
        data={{
          "@context": "https://schema.org",
          "@type": "SoftwareApplication",
          name: "Render Infissi AI",
          alternateName: [
            "Render Serramenti AI",
            "Configuratore Infissi AI",
            "Prima Dopo Infissi",
          ],
          applicationCategory: "BusinessApplication",
          applicationSubCategory: "Sales Enablement",
          operatingSystem: "Web, iOS, Android",
          url: pageUrl,
          image: `${SITE_URL}/og/render-infissi-og.jpg`,
          inLanguage: "it-IT",
          description:
            "Modulo AI per serramentisti che genera render prima/dopo di nuovi infissi, persiane, tapparelle, porte blindate e pergole sulla foto reale del cliente,…",
          provider: {
            "@type": "Organization",
            name: "Edilizia in Cloud",
            url: SITE_URL,
            logo: `${SITE_URL}/logo.png`,
          },
          audience: {
            "@type": "Audience",
            audienceType:
              "Serramentisti, installatori di infissi, showroom serramenti, rivenditori finestre",
            geographicArea: {
              "@type": "Country",
              name: "Italia",
            },
          },
          featureList: [
            "Render prima/dopo sulla foto reale del cliente",
            "Configuratore di colori, vetri e profili",
            "Persiane, tapparelle e oscuranti",
            "Porte interne, esterne e blindate",
            "Pergole e coperture esterne",
            "PDF prima/dopo pronti per WhatsApp",
            "CRM serramentisti integrato",
            "Pipeline preventivi e ordini",
            "Fatturazione elettronica SDI",
          ],
          offers: {
            "@type": "Offer",
            price: "0",
            priceCurrency: "EUR",
            availability: "https://schema.org/InStock",
            url: `${SITE_URL}/demo`,
            description:
              "Accesso beta al modulo Render Infissi AI per i primi 100 serramentisti italiani. Cancelli quando vuoi, onboarding 1-a-1 incluso.",
          },
          aggregateRating: {
            "@type": "AggregateRating",
            ratingValue: "4.9",
            bestRating: "5",
            worstRating: "1",
            ratingCount: "37",
          },
        }}
      />
      <JsonLd
        id="jsonld-video-render-infissi"
        data={{
          "@context": "https://schema.org",
          "@type": "VideoObject",
          name: "Demo Render Infissi AI · Trasforma una foto in una vendita",
          description:
            "Video demo di Render Infissi AI: in 60 secondi carichi la foto del cliente, scegli profilo, colore, vetro e oscurante, generi il prima/dopo e lo invii…",
          thumbnailUrl: [`${SITE_URL}/videos/render-infissi-poster.jpg`],
          uploadDate: videoUploadDate,
          contentUrl: `${SITE_URL}/videos/render-infissi-demo.mp4`,
          embedUrl: `${pageUrl}#video-demo`,
          duration: "PT1M",
          publisher: {
            "@type": "Organization",
            name: "Edilizia in Cloud",
            logo: {
              "@type": "ImageObject",
              url: `${SITE_URL}/logo.png`,
              width: 600,
              height: 60,
            },
          },
        }}
      />
      <JsonLd
        id="jsonld-howto-render-infissi"
        data={{
          "@context": "https://schema.org",
          "@type": "HowTo",
          name: "Come creare un render prima/dopo di nuovi infissi sulla foto del cliente",
          description:
            "Procedura in 3 step per generare un render AI di nuovi serramenti partendo dalla foto reale dell'immobile e usarlo in trattativa.",
          totalTime: "PT1M",
          tool: [
            {
              "@type": "HowToTool",
              name: "Edilizia in Cloud · Modulo Render Infissi AI",
            },
          ],
          step: mechanismSteps.map((step, idx) => ({
            "@type": "HowToStep",
            position: idx + 1,
            name: step.title,
            text: step.text,
            url: `${pageUrl}#step-${idx + 1}`,
          })),
        }}
      />
      <JsonLd
        id="jsonld-itemlist-render-infissi"
        data={{
          "@context": "https://schema.org",
          "@type": "ItemList",
          name: "Famiglia Render AI · Moduli per serramentisti",
          itemListOrder: "https://schema.org/ItemListOrderAscending",
          numberOfItems: renderFamily.length,
          itemListElement: renderFamily.map((m, idx) => ({
            "@type": "ListItem",
            position: idx + 1,
            name: m.title,
            description: m.text,
            url: `${pageUrl}#famiglia-render`,
          })),
        }}
      />
      <JsonLd
        id="jsonld-faq-render-infissi"
        data={{
          "@context": "https://schema.org",
          "@type": "FAQPage",
          mainEntity: objections.map((item) => ({
            "@type": "Question",
            name: item.q,
            acceptedAnswer: { "@type": "Answer", text: item.a },
          })),
        }}
      />
      <JsonLd
        id="jsonld-webpage-render-infissi"
        data={{
          "@context": "https://schema.org",
          "@type": "WebPage",
          "@id": pageUrl,
          url: pageUrl,
          name: "Render Infissi AI per Serramentisti",
          description:
            "Render Infissi AI: trasforma la foto reale del cliente in un prima/dopo credibile e differenziati dal prezzo.",
          inLanguage: "it-IT",
          isPartOf: {
            "@type": "WebSite",
            name: "Edilizia in Cloud",
            url: SITE_URL,
          },
          primaryImageOfPage: {
            "@type": "ImageObject",
            url: `${SITE_URL}/og/render-infissi-og.jpg`,
            width: 1200,
            height: 630,
          },
          about: {
            "@type": "Thing",
            name: "Render AI per serramenti, persiane, porte blindate e pergole",
          },
          audience: {
            "@type": "Audience",
            audienceType: "Serramentisti italiani",
          },
        }}
      />

      <LandingNavbar />

      <noscript>
        <div style={{ padding: "24px", maxWidth: "960px", margin: "0 auto" }}>
          <h1>Render Infissi AI per Serramentisti</h1>
          <p>
            Render Infissi AI trasforma la foto reale del cliente in un prima/dopo
            credibile: nuovi serramenti, colori, vetri, cassonetti, persiane,
            tapparelle, porte blindate e pergole applicati alla stessa facciata.
            Pensato per serramentisti, showroom e reti vendita italiane.
          </p>
          <p>
            Carica una foto, configura finiture, genera il render prima/dopo,
            scarica il PDF e invialo su WhatsApp. Tutto integrato con CRM,
            preventivi e fatturazione elettronica di Edilizia in Cloud.
          </p>
          <p>
            <strong>Provala con onboarding 1-a-1 incluso.</strong>
            <a href="/demo">Prova la demo</a> ·
            <a href="/per/serramentisti">Software per Serramentisti</a> ·
            <a href="/funzionalita">Tutte le funzionalità</a> ·
            <a href="/prezzi">Prezzi</a>
          </p>
        </div>
      </noscript>

      <main className="pb-24 lg:pb-0">
        {/* ============================================================ */}
        {/* HERO — single column centered, immagine sotto i bottoni      */}
        {/* ============================================================ */}
        <section
          aria-labelledby="hero-title"
          className="relative overflow-hidden bg-gradient-to-br from-[#0b1220] via-[#0f1a2e] to-[#1a2540] px-6 pb-16 pt-28 text-white sm:pt-32"
        >
          {/* Subtle orange grid pattern overlay */}
          <div
            className="pointer-events-none absolute inset-0 opacity-[0.18]"
            aria-hidden="true"
            style={{
              backgroundImage:
                "linear-gradient(rgba(249,116,21,0.35) 1px, transparent 1px), linear-gradient(90deg, rgba(249,116,21,0.35) 1px, transparent 1px)",
              backgroundSize: "56px 56px",
              maskImage:
                "radial-gradient(ellipse 80% 60% at 50% 30%, black 40%, transparent 90%)",
              WebkitMaskImage:
                "radial-gradient(ellipse 80% 60% at 50% 30%, black 40%, transparent 90%)",
            }}
          />

          {/* Diagonal orange light beam from top-left */}
          <div
            className="pointer-events-none absolute -top-20 -left-20 h-[120%] w-[60%] -rotate-12 bg-gradient-to-br from-orange-500/25 via-orange-500/5 to-transparent blur-2xl"
            aria-hidden="true"
          />

          {/* Diagonal orange light beam from bottom-right */}
          <div
            className="pointer-events-none absolute -bottom-32 -right-20 h-[100%] w-[55%] rotate-12 bg-gradient-to-tl from-orange-600/20 via-orange-500/5 to-transparent blur-3xl"
            aria-hidden="true"
          />

          {/* Glow blobs */}
          <div
            className="pointer-events-none absolute -top-40 left-1/2 h-[480px] w-[480px] -translate-x-1/2 animate-pulse-glow rounded-full bg-orange-500/35 blur-[120px]"
            aria-hidden="true"
          />
          <div
            className="pointer-events-none absolute top-32 right-10 h-72 w-72 animate-float-slow rounded-full bg-orange-500/25 blur-[100px]"
            aria-hidden="true"
          />
          <div
            className="pointer-events-none absolute bottom-20 left-10 h-80 w-80 animate-float rounded-full bg-orange-600/20 blur-[110px]"
            aria-hidden="true"
          />
          <div
            className="pointer-events-none absolute -bottom-32 right-1/3 h-72 w-72 rounded-full bg-amber-500/15 blur-3xl"
            aria-hidden="true"
          />

          {/* Floating orange "sparks" */}
          <div
            className="pointer-events-none absolute left-[8%] top-[18%] h-2 w-2 animate-float rounded-full bg-orange-300 shadow-[0_0_24px_8px_rgba(249,116,21,0.55)]"
            aria-hidden="true"
          />
          <div
            className="pointer-events-none absolute right-[10%] top-[28%] h-1.5 w-1.5 animate-float-slow rounded-full bg-amber-200 shadow-[0_0_18px_6px_rgba(251,191,36,0.45)]"
            aria-hidden="true"
          />
          <div
            className="pointer-events-none absolute left-[15%] top-[62%] h-1 w-1 animate-float rounded-full bg-orange-400 shadow-[0_0_14px_5px_rgba(249,116,21,0.55)]"
            aria-hidden="true"
          />
          <div
            className="pointer-events-none absolute right-[18%] top-[68%] h-1.5 w-1.5 animate-float-slow rounded-full bg-orange-300 shadow-[0_0_16px_6px_rgba(249,116,21,0.5)]"
            aria-hidden="true"
          />
          <div
            className="pointer-events-none absolute left-[40%] top-[12%] h-1 w-1 animate-float rounded-full bg-amber-300 shadow-[0_0_12px_5px_rgba(251,191,36,0.5)]"
            aria-hidden="true"
          />

          {/* Subtle blue accent for contrast */}
          <div
            className="pointer-events-none absolute -bottom-20 left-1/3 h-72 w-72 rounded-full bg-blue-500/10 blur-3xl"
            aria-hidden="true"
          />

          <div className="relative mx-auto max-w-5xl text-center">
            <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-orange-400/35 bg-orange-500/15 px-4 py-2 text-xs font-extrabold uppercase tracking-[0.18em] text-orange-200">
              <Sparkles className="h-4 w-4" />
              Render AI per serramentisti · Beta
            </div>
            <h1
              id="hero-title"
              className="mx-auto max-w-4xl text-4xl font-black leading-[1.05] tracking-tight text-white sm:text-5xl lg:text-6xl"
            >
              Render Infissi AI per Serramentisti: fai scegliere prima del prezzo, mostra al cliente come cambierà la sua casa.
            </h1>
            <p className="mx-auto mt-6 max-w-3xl text-lg font-medium leading-8 text-slate-200 sm:text-xl">
              Render Infissi AI trasforma la foto reale del cliente in un prima/dopo credibile:
              nuovi serramenti, colori, vetri, cassonetti e oscuranti applicati alla stessa facciata.
              Il preventivo non è più una cifra da confrontare, ma una scelta che il cliente riesce
              finalmente a vedere.
            </p>

            <div className="mt-9 flex flex-col items-center justify-center gap-3 sm:flex-row">
              <Link
                to="/demo"
                className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-[#F97415] px-7 py-4 text-base font-extrabold text-white shadow-lg shadow-orange-950/30 transition hover:bg-[#D95E0B] sm:w-auto"
              >
                Prova GRATIS il Render AI
                <ArrowRight className="h-5 w-5" />
              </Link>
              <a
                href="#video-demo"
                className="inline-flex w-full items-center justify-center gap-2 rounded-lg border border-white/25 bg-white/10 px-7 py-4 text-base font-bold text-white transition hover:bg-white/15 sm:w-auto"
              >
                <Play className="h-4 w-4 fill-white" />
                Guarda il video demo
              </a>
            </div>

            <div className="mt-5 flex flex-wrap items-center justify-center gap-x-5 gap-y-2 text-xs font-semibold text-slate-300 sm:text-sm">
              {reassurancePoints.map((item) => (
                <span key={item} className="inline-flex items-center gap-1.5">
                  <CheckCircle2 className="h-4 w-4 text-emerald-300" />
                  {item}
                </span>
              ))}
            </div>

            {/* HERO IMAGE — sotto i bottoni, full-width centered */}
            <div className="mx-auto mt-12 max-w-5xl">
              <BeforeAfterSlider />
              <p className="mt-3 text-center text-[11px] font-medium uppercase tracking-wider text-white/50">
                Esempio dimostrativo · Il render reale parte dalla foto del cliente
              </p>
            </div>

            {/* Trust badges row */}
            <div className="mx-auto mt-10 flex flex-wrap items-center justify-center gap-x-6 gap-y-3">
              {trustBadges.map(({ icon: Icon, label }) => (
                <span
                  key={label}
                  className="inline-flex items-center gap-2 text-xs font-bold text-slate-300/90"
                >
                  <Icon className="h-4 w-4 text-emerald-300" />
                  {label}
                </span>
              ))}
            </div>

            {/* Original proof points */}
            <div className="mt-6 flex flex-wrap justify-center gap-3">
              {proofPoints.map((item) => (
                <span
                  key={item}
                  className="inline-flex items-center gap-2 rounded-lg border border-white/15 bg-white/10 px-3 py-2 text-xs font-semibold text-slate-100 sm:text-sm"
                >
                  <CheckCircle2 className="h-4 w-4 text-emerald-300" />
                  {item}
                </span>
              ))}
            </div>
          </div>
        </section>

        {/* Quick objective summary */}
        <section className="border-b border-slate-200 bg-white px-6 py-7">
          <div className="mx-auto grid max-w-6xl gap-4 sm:grid-cols-3">
            {[
              ["Obiettivo", "Far dire al cliente: adesso riesco a immaginarlo"],
              ["Momento chiave", "Sopralluogo, showroom e follow-up del preventivo"],
              ["Risultato", "Meno trattativa sul prezzo, più percezione del valore"],
            ].map(([label, value]) => (
              <div key={label} className="rounded-lg border border-slate-200 bg-slate-50 p-4">
                <p className="text-xs font-black uppercase tracking-[0.16em] text-slate-500">{label}</p>
                <p className="mt-2 text-base font-extrabold text-[#0f172a]">{value}</p>
              </div>
            ))}
          </div>
        </section>

        {/* SCARCITY: Beta access */}
        <section
          aria-labelledby="beta-title"
          className="relative overflow-hidden bg-gradient-to-r from-[#F97415] to-[#D95E0B] px-6 py-12 text-white"
        >
          <div
            className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_85%_50%,rgba(255,255,255,0.18),transparent_55%)]"
            aria-hidden="true"
          />
          <div className="relative mx-auto flex max-w-6xl flex-col items-start justify-between gap-6 lg:flex-row lg:items-center">
            <div className="max-w-2xl">
              <div className="inline-flex items-center gap-2 rounded-full bg-white/20 px-3 py-1 text-xs font-black uppercase tracking-[0.18em]">
                <Sparkles className="h-3.5 w-3.5" />
                Accesso Beta · Posti limitati
              </div>
              <h2 id="beta-title" className="mt-3 text-2xl font-black leading-tight sm:text-3xl">
                Stiamo aprendo l'accesso ai primi 100 serramentisti italiani.
              </h2>
              <p className="mt-3 text-base leading-7 text-orange-50">
                Chi entra adesso in beta blocca il prezzo lanciatissimo, riceve onboarding 1-a-1 con un
                consulente Edilizia in Cloud e contribuisce a costruire le funzionalità con feedback diretto.
                Quando i 100 posti saranno chiusi, il prezzo sale.
              </p>
            </div>
            <Link
              to="/demo"
              className="inline-flex shrink-0 items-center justify-center gap-2 rounded-lg bg-white px-6 py-4 text-base font-extrabold text-[#D95E0B] shadow-lg transition hover:bg-orange-50"
            >
              Riserva il tuo posto
              <ArrowRight className="h-5 w-5" />
            </Link>
          </div>
        </section>

        {/* Speed stats with animated counters */}
        <section aria-labelledby="speed-title" className="bg-[#fff7ed] px-6 py-16">
          <div className="mx-auto max-w-6xl">
            <div className="mx-auto max-w-3xl text-center">
              <p className="text-sm font-black uppercase tracking-[0.2em] text-[#D95E0B]">
                Risposta immediata
              </p>
              <h2 id="speed-title" className="mt-3 text-3xl font-black tracking-tight text-[#0f172a] sm:text-4xl">
                In 60 secondi trasformi una foto in un argomento di vendita.
              </h2>
              <p className="mt-4 text-lg leading-8 text-slate-700">
                Non aspetti giorni per far vedere un'idea. Carichi la foto, scegli le finiture e ottieni
                un prima/dopo da usare subito: in showroom, dopo il sopralluogo o nel follow-up del preventivo.
              </p>
            </div>
            <div className="mt-10 grid gap-4 sm:grid-cols-3">
              {speedStats.map((item) => (
                <div
                  key={item.label}
                  className="rounded-2xl border border-orange-200 bg-white p-6 shadow-sm transition hover:shadow-md"
                >
                  <p className="text-5xl font-black tracking-tight text-[#D95E0B]">
                    <CountUp value={item.value} prefix={item.prefix} suffix={item.suffix} />
                  </p>
                  <p className="mt-3 text-sm font-semibold leading-6 text-slate-700">{item.label}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* VIDEO DEMO */}
        <section id="video-demo" aria-labelledby="video-title" className="bg-white px-6 py-20">
          <div className="mx-auto max-w-5xl">
            <div className="mx-auto max-w-3xl text-center">
              <div className="inline-flex items-center gap-2 rounded-full bg-orange-100 px-3 py-1 text-xs font-black uppercase tracking-[0.18em] text-[#D95E0B]">
                <Play className="h-3.5 w-3.5 fill-[#D95E0B]" />
                Guarda il video demo
              </div>
              <h2 id="video-title" className="mt-4 text-3xl font-black tracking-tight text-[#0f172a] sm:text-4xl">
                Vedi in 60 secondi come trasformi una foto in una vendita.
              </h2>
              <p className="mt-4 text-lg leading-8 text-slate-600">
                Carichi la foto del cliente, scegli profilo, colore, vetro e oscurante, generi il
                prima/dopo e lo invii direttamente su WhatsApp. Tutto dentro Edilizia in Cloud.
              </p>
            </div>
            <div className="mt-10">
              <VideoDemo />
            </div>
            <p className="mt-4 text-center text-xs leading-6 text-slate-500">
              Vuoi provarlo sulla foto di un tuo cliente reale? Riserva il tuo accesso beta.
            </p>
          </div>
        </section>

        {/* FAMIGLIA RENDER — moduli AI per ogni categoria */}
        <section
          id="famiglia-render"
          aria-labelledby="famiglia-title"
          className="bg-gradient-to-b from-white to-[#fff7ed] px-6 py-20"
        >
          <div className="mx-auto max-w-6xl">
            <div className="mx-auto max-w-3xl text-center">
              <div className="inline-flex items-center gap-2 rounded-full bg-orange-100 px-3 py-1 text-xs font-black uppercase tracking-[0.18em] text-[#D95E0B]">
                <Sparkles className="h-3.5 w-3.5" />
                Famiglia Render AI
              </div>
              <h2 id="famiglia-title" className="mt-4 text-3xl font-black tracking-tight text-[#0f172a] sm:text-4xl">
                Non solo infissi. Un render AI per ogni prodotto che vendi.
              </h2>
              <p className="mt-4 text-lg leading-8 text-slate-600">
                Lo stesso meccanismo del Render Infissi, esteso a tutte le categorie del mondo
                aperture e outdoor. Una piattaforma, cinque moduli, lo stesso impatto in trattativa.
              </p>
            </div>

            <div className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {renderFamily.map((m, i) => (
                <div
                  key={m.title}
                  className={`group relative overflow-hidden rounded-2xl border border-slate-200 bg-white p-6 shadow-sm transition hover:-translate-y-1 hover:border-orange-300 hover:shadow-lg ${
                    i === 0 ? "lg:col-span-1 lg:row-span-1" : ""
                  }`}
                >
                  <div className="pointer-events-none absolute -top-10 -right-10 h-32 w-32 rounded-full bg-orange-500/10 blur-2xl transition group-hover:bg-orange-500/20" />
                  <div className="relative flex items-start justify-between">
                    <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br from-orange-100 to-orange-200 text-[#D95E0B] shadow-sm">
                      <m.icon className="h-6 w-6" />
                    </div>
                    <span
                      className={`rounded-full px-2.5 py-0.5 text-[10px] font-black uppercase tracking-wider ${
                        m.available
                          ? "bg-emerald-100 text-emerald-700"
                          : "bg-slate-100 text-slate-600"
                      }`}
                    >
                      {m.available ? "Disponibile" : "In arrivo"}
                    </span>
                  </div>
                  <h3 className="relative mt-5 text-xl font-black text-[#0f172a]">{m.title}</h3>
                  <p className="relative mt-2 text-sm leading-7 text-slate-600">{m.text}</p>
                  <div className="relative mt-5 inline-flex items-center gap-1.5 text-xs font-black uppercase tracking-wider text-[#D95E0B]">
                    <Sparkles className="h-3 w-3" />
                    Prima/dopo · PDF · CRM
                  </div>
                </div>
              ))}

              {/* Bonus card: tutto incluso */}
              <div className="relative overflow-hidden rounded-2xl border-2 border-[#F97415] bg-gradient-to-br from-[#0f172a] to-[#1a2540] p-6 text-white shadow-xl">
                <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_70%_30%,rgba(249,116,21,0.35),transparent_55%)]" />
                <div className="relative">
                  <div className="inline-flex items-center gap-2 rounded-full bg-orange-500/20 px-2.5 py-1 text-[10px] font-black uppercase tracking-wider text-orange-200">
                    <Sparkles className="h-3 w-3" />
                    Tutto in 1
                  </div>
                  <h3 className="mt-5 text-xl font-black">Tutta la suite Render AI</h3>
                  <p className="mt-2 text-sm leading-7 text-slate-300">
                    Accedi a tutti i moduli con un unico abbonamento. Nuove categorie aggiunte
                    senza costi extra.
                  </p>
                  <Link
                    to="/demo"
                    className="mt-5 inline-flex items-center justify-center gap-2 rounded-lg bg-[#F97415] px-4 py-2.5 text-xs font-extrabold text-white shadow-md transition hover:bg-[#D95E0B]"
                  >
                    Sblocca tutta la suite
                    <ArrowRight className="h-3.5 w-3.5" />
                  </Link>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="bg-[#f8fafc] px-6 py-20">
          <div className="mx-auto max-w-6xl">
            <div className="max-w-3xl">
              <p className="text-sm font-black uppercase tracking-[0.2em] text-[#D95E0B]">
                Il problema vero
              </p>
              <h2 className="mt-3 text-3xl font-black tracking-tight text-[#0f172a] sm:text-4xl">
                Il cliente non sta scegliendo solo una finestra. Sta decidendo se fidarsi di te.
              </h2>
              <p className="mt-4 text-lg leading-8 text-slate-600">
                Il serramentista bravo spiega bene. Il serramentista che chiude meglio fa vedere.
                Quando il cliente riconosce la propria casa migliorata, smette di ragionare solo
                su marca, scheda tecnica e sconto.
              </p>
            </div>

            <div className="mt-10 grid gap-5 md:grid-cols-3">
              {painPoints.map((item) => (
                <div
                  key={item.title}
                  className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md"
                >
                  <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-orange-50">
                    <item.icon className="h-6 w-6 text-[#F97415]" />
                  </div>
                  <h3 className="mt-5 text-xl font-black text-[#0f172a]">{item.title}</h3>
                  <p className="mt-3 text-sm leading-7 text-slate-600">{item.text}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="bg-white px-6 py-20">
          <div className="mx-auto max-w-6xl">
            <div className="max-w-3xl">
              <p className="text-sm font-black uppercase tracking-[0.2em] text-[#D95E0B]">
                Prima e dopo, dove conta davvero
              </p>
              <h2 className="mt-3 text-3xl font-black tracking-tight text-[#0f172a] sm:text-4xl">
                Non mostri un'immagine generica. Mostri le aree che fanno decidere il cliente.
              </h2>
              <p className="mt-4 text-lg leading-8 text-slate-600">
                Il render deve aiutare il cliente a capire cosa cambia nella sua casa: facciata,
                vano finestra, oscuranti, cassonetti e dettagli che normalmente restano nascosti dentro
                una voce di preventivo.
              </p>
            </div>

            <div className="mt-10 grid gap-5 md:grid-cols-2">
              {beforeAfterAreas.map((area) => (
                <div
                  key={area.title}
                  className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm"
                >
                  <div className="grid min-h-[210px] md:grid-cols-2">
                    <div className="bg-slate-900 p-5 text-white">
                      <p className="text-xs font-black uppercase tracking-[0.18em] text-slate-400">Prima</p>
                      <h3 className="mt-4 text-xl font-black">{area.title}</h3>
                      <p className="mt-4 text-sm leading-7 text-slate-300">{area.before}</p>
                    </div>
                    <div className="bg-orange-50 p-5 text-[#0f172a]">
                      <p className="text-xs font-black uppercase tracking-[0.18em] text-[#D95E0B]">Dopo</p>
                      <h3 className="mt-4 text-xl font-black">Nuovo impatto visivo</h3>
                      <p className="mt-4 text-sm leading-7 text-slate-700">{area.after}</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* MECHANISM — visual timeline */}
        <section id="meccanismo" aria-labelledby="meccanismo-title" className="bg-white px-6 py-20">
          <div className="mx-auto max-w-6xl">
            <div className="mx-auto max-w-3xl text-center">
              <p className="text-sm font-black uppercase tracking-[0.2em] text-[#D95E0B]">Il meccanismo</p>
              <h2 id="meccanismo-title" className="mt-3 text-3xl font-black tracking-tight text-[#0f172a] sm:text-4xl">
                Una dimostrazione visiva che entra nella trattativa al momento giusto.
              </h2>
              <p className="mt-4 text-lg leading-8 text-slate-600">
                Non vendi "intelligenza artificiale". Vendi sicurezza: questa è la sua casa con i serramenti
                che gli stai proponendo.
              </p>
            </div>

            <div className="relative mt-12">
              {/* Connecting line desktop */}
              <div
                className="absolute left-0 right-0 top-6 hidden h-0.5 bg-gradient-to-r from-orange-200 via-orange-400 to-orange-200 md:block"
                aria-hidden="true"
              />
              <div className="grid gap-8 md:grid-cols-3">
                {mechanismSteps.map((step, index) => (
                  <div key={step.title} id={`step-${index + 1}`} className="relative">
                    <div className="relative z-10 mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-[#F97415] text-white shadow-lg shadow-orange-200">
                      <step.icon className="h-5 w-5" />
                    </div>
                    <div className="mt-5 rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
                      <p className="text-xs font-black uppercase tracking-[0.18em] text-[#D95E0B]">
                        Step {index + 1}
                      </p>
                      <h3 className="mt-2 text-lg font-black text-[#0f172a]">{step.title}</h3>
                      <p className="mt-2 text-sm leading-7 text-slate-600">{step.text}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="mt-10 text-center">
              <Link
                to="/demo"
                className="inline-flex items-center justify-center gap-2 rounded-lg bg-[#0f172a] px-7 py-4 text-sm font-extrabold text-white transition hover:bg-[#1e293b]"
              >
                Provalo gratis sulla foto del tuo cliente
                <ArrowRight className="h-4 w-4" />
              </Link>
            </div>
          </div>
        </section>

        {/* Commercial levers */}
        <section className="bg-[#0f172a] px-6 py-20 text-white">
          <div className="mx-auto max-w-6xl">
            <div className="grid gap-10 lg:grid-cols-[0.8fr_1.2fr] lg:items-start">
              <div>
                <p className="text-sm font-black uppercase tracking-[0.2em] text-orange-300">
                  Perché funziona commercialmente
                </p>
                <h2 className="mt-3 text-3xl font-black tracking-tight sm:text-4xl">
                  Se il cliente non vede la differenza, ti chiederà lo sconto.
                </h2>
                <p className="mt-5 text-lg leading-8 text-slate-300">
                  La maggior parte dei concorrenti consegna preventivi pieni di voci tecniche. Tu puoi
                  consegnare una prova visiva: stessa casa, nuovi infissi, impatto immediato.
                </p>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                {commercialLevers.map((item) => (
                  <div
                    key={item.title}
                    className="rounded-lg border border-white/10 bg-white/5 p-5 transition hover:bg-white/10"
                  >
                    <item.icon className="h-6 w-6 text-orange-300" />
                    <h3 className="mt-4 text-lg font-black">{item.title}</h3>
                    <p className="mt-2 text-sm leading-7 text-slate-300">{item.text}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        {/* ============================================================ */}
        {/* RISULTATI CON EDILIZIA IN CLOUD                              */}
        {/* ============================================================ */}
        <section className="bg-gradient-to-br from-[#fff7ed] via-white to-[#fff1e0] px-6 py-20">
          <div className="mx-auto max-w-6xl">
            <div className="mx-auto max-w-3xl text-center">
              <div className="inline-flex items-center gap-2 rounded-full bg-orange-100 px-3 py-1 text-xs font-black uppercase tracking-[0.18em] text-[#D95E0B]">
                <TrendingUp className="h-3.5 w-3.5" />
                Risultati con Edilizia in Cloud
              </div>
              <h2 className="mt-4 text-3xl font-black tracking-tight text-[#0f172a] sm:text-4xl">
                Il render è solo l'inizio. Il vero salto è quando entra nel tuo CRM.
              </h2>
              <p className="mt-4 text-lg leading-8 text-slate-600">
                Edilizia in Cloud collega il render al contatto, all'opportunità, al preventivo e alla
                fattura. Smetti di gestire i clienti tra WhatsApp, Excel e cartelle perse: vedi tutto
                in un'unica timeline e chiudi il cerchio sulla trattativa.
              </p>
            </div>

            <div className="mt-12 grid items-center gap-10 lg:grid-cols-[1.05fr_0.95fr]">
              <DashboardMock />
              <div className="space-y-5">
                {integrationPillars.map((p) => (
                  <div
                    key={p.title}
                    className="rounded-xl border border-orange-200 bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md"
                  >
                    <div className="flex gap-4">
                      <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-orange-50 text-[#D95E0B]">
                        <p.icon className="h-5 w-5" />
                      </div>
                      <div>
                        <h3 className="text-lg font-black text-[#0f172a]">{p.title}</h3>
                        <p className="mt-1.5 text-sm leading-7 text-slate-600">{p.text}</p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="mt-10 grid gap-4 sm:grid-cols-3">
              {[
                { value: 38, suffix: "%", label: "in più di preventivi visualizzati dal cliente" },
                { value: 12, prefix: "+", suffix: " pt", label: "di close rate stimati con il prima/dopo" },
                { value: 6, prefix: "-", suffix: " gg", label: "di tempo medio di chiusura preventivo" },
              ].map((item) => (
                <div
                  key={item.label}
                  className="rounded-2xl border border-slate-200 bg-white p-6 text-center shadow-sm"
                >
                  <p className="text-4xl font-black tracking-tight text-[#0f172a]">
                    <CountUp value={item.value} prefix={item.prefix} suffix={item.suffix} />
                  </p>
                  <p className="mt-2 text-sm font-semibold leading-6 text-slate-600">{item.label}</p>
                </div>
              ))}
            </div>

            <div className="mt-10 text-center">
              <Link
                to="/demo"
                className="inline-flex items-center justify-center gap-2 rounded-lg bg-[#F97415] px-7 py-4 text-base font-extrabold text-white shadow-lg shadow-orange-900/20 transition hover:bg-[#D95E0B]"
              >
                Apri la tua dashboard di prova
                <ArrowRight className="h-5 w-5" />
              </Link>
            </div>
          </div>
        </section>

        {/* ROI CALCULATOR */}
        <section className="bg-white px-6 py-20">
          <div className="mx-auto max-w-6xl">
            <div className="mx-auto max-w-3xl text-center">
              <div className="inline-flex items-center gap-2 rounded-full bg-orange-100 px-3 py-1 text-xs font-black uppercase tracking-[0.18em] text-[#D95E0B]">
                <TrendingUp className="h-3.5 w-3.5" />
                Calcola il tuo ROI
              </div>
              <h2 className="mt-4 text-3xl font-black tracking-tight text-[#0f172a] sm:text-4xl">
                Quanto fatturato in più puoi fare con un prima/dopo in trattativa?
              </h2>
              <p className="mt-4 text-lg leading-8 text-slate-600">
                Sposta i cursori sulla tua realtà: preventivi al mese, ticket medio e close rate.
                La stima parte da un'ipotesi conservativa di +12 punti di chiusura.
              </p>
            </div>
            <div className="mt-10">
              <RoiCalculator />
            </div>
            <p className="mt-4 text-center text-xs leading-6 text-slate-500">
              Stima indicativa basata su benchmark di settore. Il risultato reale dipende da prodotto,
              prezzo, qualità del lead e processo commerciale.
            </p>
          </div>
        </section>

        {/* Sales impact */}
        <section className="bg-[#f8fafc] px-6 py-20">
          <div className="mx-auto max-w-6xl">
            <div className="grid gap-10 lg:grid-cols-[0.9fr_1.1fr] lg:items-start">
              <div>
                <p className="text-sm font-black uppercase tracking-[0.2em] text-[#D95E0B]">
                  Più vendite, meno preventivi dimenticati
                </p>
                <h2 className="mt-3 text-3xl font-black tracking-tight text-[#0f172a] sm:text-4xl">
                  Il render non serve a fare scena. Serve a far avanzare la decisione.
                </h2>
                <p className="mt-5 text-lg leading-8 text-slate-600">
                  Ogni cliente che rimanda ha bisogno di una ragione concreta per tornare sul preventivo.
                  Il prima/dopo crea quella ragione: visuale, semplice, immediata.
                </p>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                {salesImpact.map((item) => (
                  <div
                    key={item.title}
                    className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm transition hover:shadow-md"
                  >
                    <CheckCircle2 className="h-6 w-6 text-emerald-600" />
                    <h3 className="mt-4 text-lg font-black text-[#0f172a]">{item.title}</h3>
                    <p className="mt-2 text-sm leading-7 text-slate-600">{item.text}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        {/* What you deliver */}
        <section className="bg-white px-6 py-20">
          <div className="mx-auto max-w-6xl">
            <div className="max-w-3xl">
              <p className="text-sm font-black uppercase tracking-[0.2em] text-[#D95E0B]">Cosa consegni</p>
              <h2 className="mt-3 text-3xl font-black tracking-tight text-[#0f172a] sm:text-4xl">
                Non una bella immagine. Uno strumento commerciale per vendere meglio.
              </h2>
            </div>

            <div className="mt-10 overflow-hidden rounded-lg border border-slate-200">
              {featureRows.map((row, index) => (
                <div
                  key={row.label}
                  className={`grid gap-3 px-5 py-5 md:grid-cols-[0.36fr_0.64fr] ${
                    index % 2 === 0 ? "bg-slate-50" : "bg-white"
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <ImageIcon className="h-5 w-5 text-[#F97415]" />
                    <p className="font-black text-[#0f172a]">{row.label}</p>
                  </div>
                  <p className="text-sm leading-7 text-slate-600">{row.value}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Use scenarios */}
        <section className="bg-[#f8fafc] px-6 py-20">
          <div className="mx-auto max-w-6xl">
            <div className="grid gap-10 lg:grid-cols-[0.9fr_1.1fr] lg:items-start">
              <div>
                <p className="text-sm font-black uppercase tracking-[0.2em] text-[#D95E0B]">Uso sul campo</p>
                <h2 className="mt-3 text-3xl font-black tracking-tight text-[#0f172a] sm:text-4xl">
                  Tre momenti in cui il render può spostare davvero la trattativa.
                </h2>
              </div>
              <div className="grid gap-4">
                {scenarioCards.map((item) => (
                  <div key={item.title} className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
                    <h3 className="text-lg font-black text-[#0f172a]">{item.title}</h3>
                    <p className="mt-2 text-sm leading-7 text-slate-600">{item.text}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        {/* FAQ */}
        <section id="faq" aria-labelledby="faq-title" className="bg-white px-6 py-20">
          <div className="mx-auto max-w-5xl">
            <div className="text-center">
              <p className="text-sm font-black uppercase tracking-[0.2em] text-[#D95E0B]">Obiezioni frequenti</p>
              <h2 id="faq-title" className="mt-3 text-3xl font-black tracking-tight text-[#0f172a] sm:text-4xl">
                Le domande che un serramentista serio si fa prima di usarlo.
              </h2>
            </div>
            <div className="mt-10 divide-y divide-slate-200 rounded-lg border border-slate-200 bg-white">
              {objections.map((item) => (
                <details key={item.q} className="group p-5">
                  <summary className="flex cursor-pointer list-none items-center justify-between gap-4 text-left text-base font-black text-[#0f172a]">
                    {item.q}
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-orange-50 text-[#D95E0B] transition group-open:rotate-45">
                      +
                    </span>
                  </summary>
                  <p className="mt-4 max-w-3xl text-sm leading-7 text-slate-600">{item.a}</p>
                </details>
              ))}
            </div>
          </div>
        </section>

        {/* Internal linking hub — SEO + UX */}
        <section
          aria-labelledby="approfondisci-title"
          className="bg-[#f8fafc] px-6 py-16"
        >
          <div className="mx-auto max-w-6xl">
            <div className="max-w-3xl">
              <p className="text-sm font-black uppercase tracking-[0.2em] text-[#D95E0B]">
                Approfondisci
              </p>
              <h2
                id="approfondisci-title"
                className="mt-3 text-3xl font-black tracking-tight text-[#0f172a] sm:text-4xl"
              >
                Esplora come Edilizia in Cloud aiuta i serramentisti a vendere meglio.
              </h2>
              <p className="mt-4 text-base leading-7 text-slate-600">
                Render Infissi AI è un modulo della piattaforma Edilizia in Cloud, il software
                gestionale per imprese edili e serramentisti italiani. Scopri tutti i moduli
                collegati: dal CRM al preventivo, dalla pipeline ordini alla fattura elettronica.
              </p>
            </div>

            <nav aria-label="Pagine correlate" className="mt-10 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {[
                {
                  to: "/per/serramentisti",
                  title: "Software per Serramentisti",
                  text: "Gestionale completo per chi vende e installa infissi, persiane e oscuranti.",
                },
                {
                  to: "/funzionalita",
                  title: "Tutte le Funzionalità",
                  text: "Cantieri, preventivi, margini, HR, fatturazione SDI e marketing in una sola piattaforma.",
                },
                {
                  to: "/funzionalita/preventivi-edilizia",
                  title: "Preventivi Edilizia",
                  text: "Crea preventivi serramenti professionali e li alleghi al render prima/dopo.",
                },
                {
                  to: "/funzionalita/fatturazione-elettronica",
                  title: "Fatturazione Elettronica SDI",
                  text: "Dal render all'ordine, dalla conferma alla fattura elettronica senza copia-incolla.",
                },
                {
                  to: "/funzionalita/margini-cantiere",
                  title: "Margini Cantiere",
                  text: "Vedi quanto guadagni davvero su ogni cantiere infissi: costi, ricavi, marginalità.",
                },
                {
                  to: "/prezzi",
                  title: "Prezzi e Piani",
                  text: "Piani trasparenti per imprese edili e serramentisti. Beta dedicata con prezzo bloccato.",
                },
                {
                  to: "/demo",
                  title: "Prova GRATIS la Demo",
                  text: "Accedi all'ambiente demo: carica una foto e genera il tuo primo render in 60 secondi.",
                },
                {
                  to: "/blog",
                  title: "Blog · Vendita serramenti",
                  text: "Consigli pratici su trattativa, follow-up, prezzi e strategie di vendita per serramentisti.",
                },
                {
                  to: "/chi-siamo",
                  title: "Chi Siamo",
                  text: "Edilizia in Cloud: il team italiano che costruisce il gestionale per le imprese edili.",
                },
              ].map((link) => (
                <Link
                  key={link.to}
                  to={link.to}
                  className="group flex flex-col rounded-xl border border-slate-200 bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:border-orange-300 hover:shadow-md"
                >
                  <span className="inline-flex items-center gap-2 text-base font-black text-[#0f172a] group-hover:text-[#D95E0B]">
                    {link.title}
                    <ArrowRight className="h-4 w-4 transition group-hover:translate-x-0.5" />
                  </span>
                  <span className="mt-2 text-sm leading-6 text-slate-600">{link.text}</span>
                </Link>
              ))}
            </nav>
          </div>
        </section>

        {/* Final CTA */}
        <section aria-labelledby="final-cta-title" className="bg-[#0b1220] px-6 py-20 text-center text-white">
          <div className="mx-auto max-w-3xl">
            <Wand2 className="mx-auto h-10 w-10 text-orange-300" />
            <h2 id="final-cta-title" className="mt-5 text-3xl font-black tracking-tight sm:text-4xl">
              Se il tuo concorrente manda solo un preventivo, tu manda una visione.
            </h2>
            <p className="mt-5 text-lg leading-8 text-slate-300">
              Il cliente deve pensare: "Questa è casa mia con i nuovi infissi". Quando succede,
              il preventivo diventa più concreto, più memorabile e più difficile da confrontare
              soltanto sul prezzo.
            </p>
            <div className="mt-8 flex flex-col items-center justify-center gap-3">
              <Link
                to="/demo"
                className="inline-flex items-center justify-center gap-2 rounded-lg bg-[#F97415] px-8 py-4 text-base font-extrabold text-white shadow-lg shadow-orange-900/30 transition hover:bg-[#D95E0B]"
              >
                Prova GRATIS il Render AI
                <ArrowRight className="h-5 w-5" />
              </Link>
              <p className="text-xs font-medium text-slate-400">
                Setup in 60 secondi · Onboarding 1-a-1 · Cancelli quando vuoi
              </p>
            </div>
          </div>
        </section>
      </main>

      {/* STICKY MOBILE CTA */}
      <div className="fixed inset-x-0 bottom-0 z-40 border-t border-slate-200 bg-white/95 px-4 py-3 shadow-[0_-8px_24px_rgba(15,23,42,0.12)] backdrop-blur lg:hidden">
        <Link
          to="/demo"
          className="flex w-full items-center justify-center gap-2 rounded-lg bg-[#F97415] px-5 py-3 text-sm font-extrabold text-white shadow-md transition hover:bg-[#D95E0B]"
        >
          Prova GRATIS il Render AI
          <ArrowRight className="h-4 w-4" />
        </Link>
        <p className="mt-1 text-center text-[10px] font-semibold text-slate-500">
          Onboarding incluso · Cancelli quando vuoi
        </p>
      </div>

      <LandingFooter />
    </div>
  );
}
