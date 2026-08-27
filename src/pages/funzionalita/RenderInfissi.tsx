import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import {
  ArrowRight,
  BadgeCheck,
  Camera,
  CheckCircle2,
  Clock,
  FileText,
  Image as ImageIcon,
  LineChart,
  MessageCircle,
  Play,
  Send,
  ShieldCheck,
  Sparkles,
  Star,
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
import { BeforeAfterSlider as RenderBeforeAfterSlider } from "@/components/render/BeforeAfterSlider";
import { RenderLeadModal } from "@/components/render/RenderLeadModal";
import { JsonLd } from "@/components/seo/JsonLd";
import { SITE_URL, useSEO } from "@/hooks/useSEO";

const HERO_BEFORE_IMAGE = "/images/render-infissi/demo-prima.webp";
const HERO_AFTER_IMAGE = "/images/render-infissi/demo-dopo.webp";
const JOURNEY_BEFORE_IMAGE = "/images/render-infissi/demo-latest-prima.webp";
const JOURNEY_AFTER_IMAGE = "/images/render-infissi/demo-latest-dopo.webp";
const YOUTUBE_RENDER_DEMO_ID = "wBpdDN21vb0";
const YOUTUBE_RENDER_DEMO_URL = `https://www.youtube.com/watch?v=${YOUTUBE_RENDER_DEMO_ID}`;
const YOUTUBE_RENDER_DEMO_EMBED_URL = `https://www.youtube-nocookie.com/embed/${YOUTUBE_RENDER_DEMO_ID}?rel=0&modestbranding=1`;
const YOUTUBE_RENDER_DEMO_AUTOPLAY_URL = `${YOUTUBE_RENDER_DEMO_EMBED_URL}&autoplay=1`;
const YOUTUBE_RENDER_DEMO_THUMBNAIL = `https://img.youtube.com/vi/${YOUTUBE_RENDER_DEMO_ID}/hqdefault.jpg`;

const proofPoints = [
  "Creato per serramentisti, showroom e reti vendita",
  "Prima/dopo sulla foto reale del cliente",
  "PDF e WhatsApp pronti per il follow-up commerciale",
];

const reassurancePoints = [
  "Render in 60 secondi",
  "Onboarding 1-a-1 incluso",
  "Cancelli quando vuoi",
];

const trustBadges = [
  { icon: ShieldCheck, label: "GDPR Compliant" },
  { icon: Zap, label: "Render in 60 sec" },
  { icon: Star, label: "4.9/5 stelle" },
  { icon: BadgeCheck, label: "Made in Italy" },
];

const painPoints = [
  {
    icon: Clock,
    title: "Il cliente non compra il profilo. Compra certezza.",
    text: "Tu parli di profili, vetro-camera, posa, cassonetti e finiture. Lui sta pensando: \"come staranno davvero sulla mia facciata?\". Se non riesce a vederlo, rimanda. E rimandare, in questo mestiere, vuol dire perdere.",
  },
  {
    icon: XCircle,
    title: "Se il valore non si vede, vince lo sconto",
    text: "Quando due preventivi sembrano uguali, il cliente firma quello più basso. Anche se il tuo serramento dura 25 anni e quello del concorrente molto meno. Il problema non è il prodotto: è che il cliente non lo vede.",
  },
  {
    icon: MessageCircle,
    title: "Il momento caldo dura 48 ore",
    text: "Durante il sopralluogo il cliente è dentro la decisione. Due giorni dopo ha visto altri preventivi, altre promesse e foto generiche di catalogo. Se non rientri nella sua testa con qualcosa di forte, sei fuori dalla scelta.",
  },
];

const mechanismSteps = [
  {
    icon: Camera,
    title: "Passo 1 — Foto",
    text: "Scatti col telefono. Anche storta. Parti dalla casa vera del committente, non da un'immagine di catalogo che vede anche il tuo concorrente.",
  },
  {
    icon: AppWindow,
    title: "Passo 2 — Scelte",
    text: "Profilo, colore, vetro, maniglia, cassonetto, tapparella, persiana o scuro. Le voci tecniche del preventivo diventano cose che il cliente vede.",
  },
  {
    icon: FileText,
    title: "Passo 3 — Invio",
    text: "PDF prima/dopo, WhatsApp, allegato al preventivo. Tutto agganciato al contatto e alla trattativa dentro EdiliziaInCloud.",
  },
];

const commercialLevers = [
  {
    icon: Target,
    title: "Rendi visibile il valore",
    text: "Il cliente non valuta il costo della finestra. Valuta l'effetto sulla sua casa, sulla luce e sulla facciata.",
  },
  {
    icon: ShieldCheck,
    title: "Riduci il dubbio del cliente",
    text: "Colore, proporzioni e stile non restano nella sua testa. Vede una direzione concreta prima di firmare.",
  },
  {
    icon: Zap,
    title: "Riprendi il contatto con un motivo forte",
    text: "Non richiami dicendo \"ha visto il preventivo?\". Richiami partendo da un'immagine che lui ricorda.",
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
    value: "Profilo, colore, vetro, maniglia, cassonetto, tapparella, persiana o scuro: tutto leggibile e collegato all'anteprima visiva.",
  },
  {
    label: "PDF prima/dopo professionale",
    value: "Un documento ordinato da inviare al cliente, allegare al preventivo e usare in fase di follow-up, con disclaimer dimostrativo.",
  },
  {
    label: "Scheda cliente collegata",
    value: "Ogni render resta agganciato al contatto e alla trattativa. La storia commerciale non si perde mai.",
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
    a: "Il Render Infissi fa parte dei piani EdiliziaInCloud. Hai 31 giorni di prova gratuita, setup in 48 ore, affiancamento singolo incluso e disdetta libera quando vuoi.",
  },
  {
    q: "E se il mio cliente non usa WhatsApp o non guarda i video?",
    a: "Generi il render, lo stampi a colori in salone o lo alleghi al preventivo. Il prima/dopo funziona anche spento: non è un giocattolo, è una prova visiva.",
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
  { value: 47, suffix: " sec", label: "tempo medio per generare un'anteprima visiva dal telefono" },
  { value: 18, prefix: "+", suffix: "%", label: "di chiusura stimata: dal 30% al 48% con il prima/dopo" },
  { value: 3, prefix: "× ", suffix: "", label: "quanto resta in mente un'immagine rispetto a un foglio di testo" },
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
    text: "Il cliente percepisce un metodo: analisi, configurazione, anteprima visiva, preventivo e ripresa contatto ordinata.",
  },
];

const integrationPillars = [
  {
    icon: Users,
    title: "Archivio clienti integrato per serramentisti",
    text: "Ogni render è collegato al contatto, all'opportunità e allo stato della trattativa. Vedi a colpo d'occhio chi è caldo, chi è da richiamare e chi ha già firmato.",
  },
  {
    icon: Send,
    title: "Richiami automatici via WhatsApp ed e-mail",
    text: "Sequenze pronte: invio del PDF prima/dopo, promemoria a 48h e 7 giorni, riepilogo del preventivo. Smetti di dimenticarti i clienti tiepidi.",
  },
  {
    icon: LineChart,
    title: "Cruscotto margini per commessa",
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

function VisualDemoStoryboard() {
  return (
    <div className="relative overflow-hidden rounded-2xl border border-slate-200 bg-slate-950 p-3 text-white shadow-2xl sm:rounded-[28px] sm:p-6">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_20%_20%,rgba(249,116,21,0.28),transparent_38%),radial-gradient(circle_at_80%_55%,rgba(16,185,129,0.16),transparent_34%)]" />
      <div className="relative grid gap-5 lg:grid-cols-[1.1fr_0.9fr] lg:items-center">
        <div className="overflow-hidden rounded-xl border border-white/10 bg-white/5 p-2 sm:rounded-2xl sm:p-3">
          <div className="mb-2 flex items-center justify-between px-1 text-[9px] font-black uppercase tracking-[0.16em] text-white/55 sm:mb-3 sm:text-[10px] sm:tracking-[0.18em]">
            <span>Foto cliente</span>
            <span>Render pronto</span>
          </div>
          <RenderBeforeAfterSlider
            beforeUrl={JOURNEY_BEFORE_IMAGE}
            afterUrl={JOURNEY_AFTER_IMAGE}
            beforeLabel="Foto"
            afterLabel="Render"
            beforeOnLeft
            compact
            className="max-h-[58vh] rounded-xl bg-slate-900 sm:max-h-none sm:rounded-2xl"
          />
        </div>

        <div className="space-y-3">
          {[
            ["00 sec", "Scatti o carichi la foto", "Parti dalla casa vera del cliente, non da un catalogo."],
            ["20 sec", "Scegli finiture e oscuranti", "Profilo, colore, vetro, maniglia, cassonetto o persiana diventano visibili."],
            ["47 sec", "Invii prima/dopo", "PDF e WhatsApp pronti per riaprire la trattativa mentre è ancora calda."],
          ].map(([time, title, text]) => (
            <div key={title} className="group rounded-xl border border-white/10 bg-white/[0.06] p-3 transition hover:-translate-y-0.5 hover:bg-white/[0.09] sm:rounded-2xl sm:p-4">
              <div className="flex items-start gap-3">
                <span className="flex h-12 w-14 shrink-0 items-center justify-center rounded-xl bg-[#F97415] text-xs font-black leading-tight text-white shadow-lg shadow-orange-950/20 sm:w-12 sm:text-sm">
                  {time}
                </span>
                <div>
                  <p className="text-sm font-black sm:text-base">{title}</p>
                  <p className="mt-1 text-xs leading-5 text-slate-300 sm:text-sm sm:leading-6">{text}</p>
                </div>
              </div>
            </div>
          ))}
          <p className="rounded-xl border border-orange-300/20 bg-orange-500/10 p-3 text-xs font-semibold leading-5 text-orange-50 sm:rounded-2xl sm:p-4 sm:text-sm sm:leading-6">
            Il cliente non deve immaginare il risultato: lo vede sulla propria casa e puoi usarlo subito nel follow-up.
          </p>
        </div>
      </div>
    </div>
  );
}

function YouTubeDemoEmbed() {
  const srcDoc = `
    <style>
      * { box-sizing: border-box; }
      body { margin: 0; background: #020617; font-family: Inter, system-ui, sans-serif; }
      a {
        position: relative;
        display: flex;
        min-height: 100vh;
        align-items: center;
        justify-content: center;
        overflow: hidden;
        color: white;
        text-decoration: none;
      }
      img {
        position: absolute;
        inset: 0;
        width: 100%;
        height: 100%;
        object-fit: cover;
        opacity: .78;
      }
      .shade {
        position: absolute;
        inset: 0;
        background: radial-gradient(circle at 50% 45%, rgba(249,116,21,.36), transparent 34%), linear-gradient(180deg, rgba(2,6,23,.18), rgba(2,6,23,.72));
      }
      .play {
        position: relative;
        display: grid;
        width: 88px;
        height: 88px;
        place-items: center;
        border-radius: 999px;
        background: #F97415;
        box-shadow: 0 22px 60px rgba(249,116,21,.42);
      }
      .play::before {
        content: "";
        margin-left: 6px;
        border-left: 25px solid white;
        border-top: 16px solid transparent;
        border-bottom: 16px solid transparent;
      }
      .copy {
        position: absolute;
        left: 24px;
        right: 24px;
        bottom: 22px;
        font-weight: 800;
        line-height: 1.45;
        text-shadow: 0 2px 14px rgba(0,0,0,.55);
      }
      .copy span {
        display: block;
        margin-top: 4px;
        color: rgba(255,255,255,.74);
        font-size: 13px;
        font-weight: 700;
      }
    </style>
    <a href="${YOUTUBE_RENDER_DEMO_AUTOPLAY_URL}" aria-label="Guarda il video demo Render Infissi AI">
      <img loading="lazy" src="${YOUTUBE_RENDER_DEMO_THUMBNAIL}" alt="Anteprima video demo Render Infissi AI" />
      <span class="shade"></span>
      <span class="play"></span>
      <span class="copy">Guarda il video demo<span>Click per riprodurre dentro questa card</span></span>
    </a>
  `;

  return (
    <div className="relative overflow-hidden rounded-2xl border border-slate-200 bg-slate-950 p-2 shadow-2xl sm:rounded-[28px] sm:p-4">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_20%_10%,rgba(249,116,21,0.22),transparent_34%)]" />
      <div className="relative">
        <div className="mb-3 flex flex-col gap-2 px-1 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-[10px] font-black uppercase tracking-[0.18em] text-orange-200">
              Video demo reale
            </p>
            <p className="mt-1 hidden text-sm font-semibold text-slate-300 sm:block">
              Guarda come il prima/dopo entra nel flusso commerciale.
            </p>
          </div>
          <a
            href={YOUTUBE_RENDER_DEMO_URL}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1.5 text-xs font-black uppercase tracking-wider text-orange-200 transition hover:text-white"
          >
            Apri su YouTube
            <ArrowRight className="h-3.5 w-3.5" />
          </a>
        </div>
        <div className="relative aspect-video overflow-hidden rounded-2xl border border-white/10 bg-black">
          <iframe
            className="absolute inset-0 h-full w-full"
            src={YOUTUBE_RENDER_DEMO_EMBED_URL}
            srcDoc={srcDoc}
            title="Video demo Render Infissi AI"
            loading="lazy"
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
            allowFullScreen
          />
        </div>
      </div>
    </div>
  );
}

/* ================================================================== */
/* ROI Calculator                                                      */
/* ================================================================== */

function RoiCalculator({ onRequestInfo }: { onRequestInfo: () => void }) {
  const [preventiviMese, setPreventiviMese] = useState(40);
  const [ticketMedio, setTicketMedio] = useState(12000);
  const [closeRateAttuale, setCloseRateAttuale] = useState(30);

  const result = useMemo(() => {
    const upliftPct = 18;
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
      maximumFractionDigits: 0, useGrouping: "always" }).format(n);

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
            Stima prudente: +18% di chiusura preventivi col prima/dopo in trattativa.
          </p>

          <div className="mt-5 space-y-4">
            <div className="rounded-lg bg-white p-4">
              <p className="text-xs font-bold uppercase tracking-wider text-slate-500">Close rate prima / dopo</p>
              <p className="mt-1 text-2xl font-black text-[#0f172a]">
                {closeRateAttuale}% → {result.newCloseRate.toFixed(0)}%
              </p>
              <p className="mt-1 text-xs font-bold text-[#D95E0B]">+18% di chiusura</p>
            </div>
            <div className="rounded-lg bg-white p-4">
              <p className="text-xs font-bold uppercase tracking-wider text-slate-500">Ordini in più al mese</p>
              <p className="mt-1 text-2xl font-black text-[#0f172a]">+{result.ordiniAggiuntivi.toFixed(1)}</p>
            </div>
            <div className="rounded-lg bg-[#0f172a] p-4 text-white">
              <p className="text-xs font-bold uppercase tracking-wider text-orange-200">
                Fatturato aggiuntivo annuo
              </p>
              <p className="mt-1 text-2xl font-black tracking-tight text-white">
                {formatEuro(result.fatturatoAggiuntivoAnno)}
              </p>
              <p className="mt-2 text-xs leading-5 text-slate-300">
                Sono {formatEuro(result.fatturatoAggiuntivoMese)} al mese in più. Stessi clienti. Stesso prezzo. Una foto in più.
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onRequestInfo}
            className="mt-5 inline-flex w-full items-center justify-center gap-2 rounded-lg bg-[#F97415] px-5 py-3 text-sm font-extrabold text-white shadow-md transition hover:bg-[#D95E0B]"
          >
            Sblocca l'anteprima visiva gratis per 31 giorni
            <ArrowRight className="h-4 w-4" />
          </button>
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

function PhoneFollowUpMock() {
  return (
    <div className="relative mx-auto max-w-sm">
      <div className="absolute -inset-5 rounded-[40px] bg-orange-500/20 blur-3xl" aria-hidden="true" />
      <div className="relative overflow-hidden rounded-[34px] border-[10px] border-slate-950 bg-slate-950 shadow-2xl">
        <div className="bg-slate-100 px-4 pb-5 pt-4">
          <div className="mx-auto mb-3 h-1.5 w-16 rounded-full bg-slate-300" />
          <div className="rounded-2xl bg-white p-3 shadow-sm">
            <div className="flex items-center gap-2 border-b border-slate-100 pb-2">
              <div className="flex h-9 w-9 items-center justify-center rounded-full bg-emerald-100 text-emerald-700">
                <MessageCircle className="h-5 w-5" />
              </div>
              <div>
                <p className="text-sm font-black text-slate-900">Cliente · Via Manzoni</p>
                <p className="text-[11px] font-semibold text-emerald-600">online adesso</p>
              </div>
            </div>
            <div className="mt-3 space-y-3">
              <div className="ml-auto max-w-[82%] rounded-2xl rounded-tr-sm bg-[#dcf8c6] p-3 text-sm font-semibold leading-5 text-slate-800">
                Le mando come cambierebbe casa sua con il profilo antracite.
              </div>
              <div className="ml-auto grid max-w-[82%] grid-cols-2 overflow-hidden rounded-2xl rounded-tr-sm border border-emerald-200 bg-white">
                <img src={HERO_BEFORE_IMAGE} alt="Foto prima render infissi" className="h-28 w-full object-cover" loading="lazy" />
                <img src={HERO_AFTER_IMAGE} alt="Render dopo infissi" className="h-28 w-full object-cover" loading="lazy" />
              </div>
              <div className="ml-auto max-w-[82%] rounded-2xl rounded-tr-sm bg-[#dcf8c6] p-3 text-sm font-semibold leading-5 text-slate-800">
                PDF prima/dopo allegato al preventivo. Vuole vederlo anche con oscurante?
              </div>
              <div className="max-w-[76%] rounded-2xl rounded-tl-sm bg-white p-3 text-sm font-semibold leading-5 text-slate-700 shadow-sm">
                Ora lo capisco. Mandami questa versione.
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function ConversionInfographic() {
  return (
    <div className="rounded-[28px] border border-slate-200 bg-white p-4 shadow-xl sm:p-6">
      <div className="grid gap-4 lg:grid-cols-[0.9fr_1.1fr] lg:items-center">
        <div className="rounded-2xl bg-slate-950 p-5 text-white">
          <p className="text-xs font-black uppercase tracking-[0.18em] text-orange-300">Infografica vendite</p>
          <h3 className="mt-3 text-2xl font-black leading-tight">Stessi clienti. Stesso prezzo. Una foto in più.</h3>
          <p className="mt-3 text-sm leading-7 text-slate-300">
            Quando il cliente vede casa sua trasformata, il preventivo smette di essere una tabella tecnica
            e diventa una decisione concreta.
          </p>
          <div className="mt-5 grid grid-cols-2 gap-3">
            <div className="rounded-xl bg-white/8 p-4">
              <p className="text-[11px] font-black uppercase tracking-wider text-slate-400">Prima</p>
              <p className="mt-1 text-3xl font-black">3/10</p>
              <p className="mt-1 text-xs text-slate-300">30% di chiusura</p>
            </div>
            <div className="rounded-xl bg-orange-500 p-4 text-white">
              <p className="text-[11px] font-black uppercase tracking-wider text-orange-100">Con render</p>
              <p className="mt-1 text-3xl font-black">4,8/10</p>
              <p className="mt-1 text-xs text-orange-50">48% di chiusura stimata</p>
            </div>
          </div>
        </div>
        <div className="grid gap-3">
          {[
            { label: "Preventivo PDF", value: 20, color: "bg-slate-300", note: "il cliente confronta il prezzo" },
            { label: "Prima/dopo su casa reale", value: 60, color: "bg-orange-500", note: "il cliente vede il risultato" },
            { label: "Follow-up WhatsApp", value: 74, color: "bg-emerald-500", note: "la trattativa torna calda" },
          ].map((row) => (
            <div key={row.label} className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-black text-slate-900">{row.label}</p>
                  <p className="mt-1 text-xs font-semibold text-slate-500">{row.note}</p>
                </div>
                <p className="text-xl font-black text-slate-900">{row.value}%</p>
              </div>
              <div className="mt-3 h-3 overflow-hidden rounded-full bg-white">
                <div className={`h-full rounded-full ${row.color}`} style={{ width: `${row.value}%` }} />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function VisualProofMosaic() {
  return (
    <div className="grid gap-4 lg:grid-cols-[1.05fr_0.95fr] lg:items-stretch">
      <div className="overflow-hidden rounded-[28px] border border-slate-200 bg-slate-950 p-3 shadow-xl">
        <div className="grid grid-cols-2 overflow-hidden rounded-2xl">
          <div className="relative">
            <img src={HERO_BEFORE_IMAGE} alt="Prima: facciata con vecchi infissi" className="h-72 w-full object-cover sm:h-96" loading="lazy" />
            <span className="absolute left-3 top-3 rounded-full bg-slate-950/80 px-3 py-1 text-[10px] font-black uppercase tracking-wider text-white">
              Prima
            </span>
          </div>
          <div className="relative">
            <img src={HERO_AFTER_IMAGE} alt="Dopo: render con nuovi infissi" className="h-72 w-full object-cover sm:h-96" loading="lazy" />
            <span className="absolute right-3 top-3 rounded-full bg-orange-500 px-3 py-1 text-[10px] font-black uppercase tracking-wider text-white">
              Dopo
            </span>
          </div>
        </div>
      </div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-1">
        {[
          ["Facciata", "Il cliente vede subito l'impatto estetico sul suo prospetto."],
          ["Colore", "Antracite, bianco, legno o finiture speciali smettono di essere campioni astratti."],
          ["Dettagli", "Cassonetti, oscuranti e cornici diventano parte visibile della proposta."],
        ].map(([title, text]) => (
          <div key={title} className="rounded-2xl border border-orange-200 bg-orange-50 p-5">
            <p className="text-xs font-black uppercase tracking-[0.18em] text-[#D95E0B]">{title}</p>
            <p className="mt-2 text-base font-extrabold leading-6 text-slate-900">{text}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

function ContextualCta({
  eyebrow,
  title,
  action,
  onClick,
}: {
  eyebrow: string;
  title: string;
  action: string;
  onClick: () => void;
}) {
  return (
    <div className="mt-10 rounded-2xl border border-orange-200 bg-gradient-to-r from-orange-50 to-white p-5 shadow-sm sm:flex sm:items-center sm:justify-between sm:gap-6">
      <div>
        <p className="text-[11px] font-black uppercase tracking-[0.18em] text-[#D95E0B]">{eyebrow}</p>
        <p className="mt-2 text-lg font-black leading-7 text-[#0f172a]">{title}</p>
      </div>
      <button
        type="button"
        onClick={onClick}
        className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-lg bg-[#0f172a] px-5 py-3 text-sm font-extrabold text-white transition hover:bg-[#1e293b] sm:mt-0 sm:w-auto"
      >
        {action}
        <ArrowRight className="h-4 w-4" />
      </button>
    </div>
  );
}

/* ================================================================== */
/* PAGE                                                                */
/* ================================================================== */

export default function RenderInfissi() {
  const [leadModalOpen, setLeadModalOpen] = useState(false);
  const openLeadModal = () => setLeadModalOpen(true);
  const pageRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cleanup: (() => void) | undefined;

    async function mountScrollAnimations() {
      const root = pageRef.current;
      if (!root || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

      const [{ default: gsap }, { ScrollTrigger }] = await Promise.all([
        import("gsap"),
        import("gsap/ScrollTrigger"),
      ]);

      gsap.registerPlugin(ScrollTrigger);
      const ctx = gsap.context(() => {
        gsap.utils.toArray<HTMLElement>("[data-render-reveal]").forEach((el) => {
          gsap.fromTo(
            el,
            { opacity: 0, y: 34, scale: 0.985 },
            {
              opacity: 1,
              y: 0,
              scale: 1,
              duration: 0.82,
              ease: "power3.out",
              scrollTrigger: {
                trigger: el,
                start: "top 86%",
                once: true,
              },
            }
          );
        });

        gsap.utils.toArray<HTMLElement>("[data-render-stagger]").forEach((group) => {
          const children = group.querySelectorAll<HTMLElement>("[data-render-item]");
          if (!children.length) return;
          gsap.fromTo(
            children,
            { opacity: 0, y: 24 },
            {
              opacity: 1,
              y: 0,
              duration: 0.62,
              ease: "power2.out",
              stagger: 0.08,
              scrollTrigger: {
                trigger: group,
                start: "top 84%",
                once: true,
              },
            }
          );
        });

        gsap.utils.toArray<HTMLElement>("[data-render-orbit]").forEach((el, index) => {
          gsap.to(el, {
            rotate: index % 2 === 0 ? 360 : -360,
            duration: index % 2 === 0 ? 18 : 24,
            ease: "none",
            repeat: -1,
            transformOrigin: "50% 50%",
          });
        });
      }, root);

      cleanup = () => ctx.revert();
    }

    mountScrollAnimations().catch(() => {
      /* Animazioni progressive: se GSAP non carica, la pagina resta comunque usabile. */
    });

    return () => cleanup?.();
  }, []);

  useSEO({
    title:
      "Render Infissi AI per Serramentisti | Aumenta la chiusura preventivi",
    description:
      "Da 3 preventivi chiusi su 10 a quasi 5 su 10: dal 30% al 48% di chiusura stimata con il prima/dopo generato in 60 secondi.",
    canonical: "/funzionalita/render-infissi/",
    keywords:
      "render infissi, render serramenti, render finestre AI, software serramentisti, prima dopo infissi, configuratore infissi AI, vendita serramenti, render tapparelle, render persiane, render porte blindate, render pergole, AI infissi, software preventivi serramenti, gestionale serramentisti",
    ogImage:
      "https://www.ediliziaincloud.com/og/og-default.png",
  });

  const pageUrl = `${SITE_URL}/funzionalita/render-infissi/`;
  const videoUploadDate = "2026-04-27";

  return (
    <div ref={pageRef} className="min-h-screen bg-white text-[#0f172a]">
      <JsonLd
        id="jsonld-breadcrumb-render-infissi"
        data={{
          "@context": "https://schema.org",
          "@type": "BreadcrumbList",
          itemListElement: [
            { "@type": "ListItem", position: 1, name: "Home", item: `${SITE_URL}/` },
            { "@type": "ListItem", position: 2, name: "Funzionalita", item: `${SITE_URL}/funzionalita/` },
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
            "Modulo AI per serramentisti che genera render prima/dopo di nuovi infissi, persiane, tapparelle, porte blindate e pergole sulla foto reale del cliente, pronti per WhatsApp.",
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
            url: `${SITE_URL}/demo/`,
            description:
              "Anteprima riservata alle prime 30 aziende: modulo Render Infissi AI per serramentisti, sale espositive e reti vendita.",
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
            "Video demo di Render Infissi AI: in 60 secondi carichi la foto del cliente, scegli profilo, colore, vetro e oscurante, generi il prima/dopo e lo invii su WhatsApp.",
          thumbnailUrl: [YOUTUBE_RENDER_DEMO_THUMBNAIL],
          uploadDate: videoUploadDate,
          contentUrl: YOUTUBE_RENDER_DEMO_URL,
          embedUrl: YOUTUBE_RENDER_DEMO_EMBED_URL,
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
            "Render Infissi AI: carichi la foto della casa del cliente, scegli profilo, colore, vetro e oscurante e generi un prima/dopo in 60 secondi.",
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
          <h1>Da 3 preventivi chiusi su 10 a quasi 5 su 10.</h1>
          <p>
            Per serramentisti, sale espositive e reti vendita. Carichi la foto
            della casa del cliente, scegli profilo, colore, vetro e oscurante.
            In 60 secondi esce il prima/dopo che il cliente non vedrà da nessun altro.
          </p>
          <p>
            Carica una foto, configura finiture, genera il render prima/dopo,
            scarica il PDF e invialo su WhatsApp. Tutto integrato con CRM,
            preventivi e fatturazione elettronica di Edilizia in Cloud.
          </p>
          <p>
            <strong>Provala con onboarding 1-a-1 incluso.</strong>
            <a href="#render-request">Richiedi informazioni</a> ·
            <a href="/per/serramentisti/">Software per Serramentisti</a> ·
            <a href="/funzionalita/">Tutte le funzionalità</a> ·
            <a href="/prezzi/">Prezzi</a>
          </p>
        </div>
      </noscript>

      <main className="pb-20 lg:pb-0">
        {/* ============================================================ */}
        {/* HERO — single column centered, immagine sotto i bottoni      */}
        {/* ============================================================ */}
        <section
          aria-labelledby="hero-title"
          className="relative overflow-hidden bg-gradient-to-br from-[#0b1220] via-[#0f1a2e] to-[#1a2540] px-4 pb-12 pt-20 text-white sm:px-6 sm:pb-16 sm:pt-32"
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
            className="pointer-events-none absolute -top-20 -left-20 hidden h-[120%] w-[60%] -rotate-12 bg-gradient-to-br from-orange-500/25 via-orange-500/5 to-transparent blur-2xl sm:block"
            aria-hidden="true"
          />

          {/* Diagonal orange light beam from bottom-right */}
          <div
            className="pointer-events-none absolute -bottom-32 -right-20 hidden h-[100%] w-[55%] rotate-12 bg-gradient-to-tl from-orange-600/20 via-orange-500/5 to-transparent blur-3xl sm:block"
            aria-hidden="true"
          />

          {/* Glow blobs */}
          <div
            className="pointer-events-none absolute -top-40 left-1/2 h-[280px] w-[280px] -translate-x-1/2 animate-pulse-glow rounded-full bg-orange-500/25 blur-[90px] sm:h-[480px] sm:w-[480px] sm:bg-orange-500/35 sm:blur-[120px]"
            aria-hidden="true"
          />
          <div
            className="pointer-events-none absolute right-10 top-32 hidden h-72 w-72 animate-float-slow rounded-full bg-orange-500/25 blur-[100px] sm:block"
            aria-hidden="true"
          />
          <div
            className="pointer-events-none absolute bottom-20 left-10 hidden h-80 w-80 animate-float rounded-full bg-orange-600/20 blur-[110px] sm:block"
            aria-hidden="true"
          />
          <div
            className="pointer-events-none absolute -bottom-32 right-1/3 h-72 w-72 rounded-full bg-amber-500/15 blur-3xl"
            aria-hidden="true"
          />

          {/* Floating orange "sparks" */}
          <div
            className="pointer-events-none absolute left-[8%] top-[18%] hidden h-2 w-2 animate-float rounded-full bg-orange-300 shadow-[0_0_24px_8px_rgba(249,116,21,0.55)] sm:block"
            aria-hidden="true"
          />
          <div
            className="pointer-events-none absolute right-[10%] top-[28%] h-1.5 w-1.5 animate-float-slow rounded-full bg-amber-200 shadow-[0_0_18px_6px_rgba(251,191,36,0.45)]"
            aria-hidden="true"
          />
          <div
            className="pointer-events-none absolute left-[15%] top-[62%] hidden h-1 w-1 animate-float rounded-full bg-orange-400 shadow-[0_0_14px_5px_rgba(249,116,21,0.55)] sm:block"
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

          <div className="relative mx-auto flex max-w-5xl flex-col items-center text-center">
            <div className="mb-4 inline-flex max-w-full items-center gap-2 rounded-2xl border border-orange-400/35 bg-orange-500/15 px-3 py-2 text-[9px] font-extrabold uppercase leading-4 tracking-[0.08em] text-orange-200 sm:mb-6 sm:rounded-full sm:px-4 sm:text-xs sm:tracking-[0.18em]">
              <Sparkles className="h-3.5 w-3.5 shrink-0 sm:h-4 sm:w-4" />
              Per serramentisti, sale espositive e reti vendita · Anteprima riservata alle prime 30 aziende
            </div>
            <h1
              id="hero-title"
              className="mx-auto max-w-4xl text-[1.62rem] font-black leading-[1.08] tracking-tight text-white min-[390px]:text-[1.78rem] sm:text-5xl lg:text-6xl"
            >
              Da 3 preventivi chiusi su 10 a quasi 5 su 10. Dal 30% al 48%, senza scendere di prezzo.
            </h1>

            <p className="order-3 mx-auto mt-5 max-w-3xl text-base font-medium leading-7 text-slate-200 sm:mt-6 sm:text-xl sm:leading-8">
              Carichi la foto della casa del cliente. Scegli profilo, colore, vetro e oscurante.
              In 60 secondi esce il prima/dopo che il cliente non vedrà da nessun altro.
              Stesso preventivo. Stesso prezzo. Una foto in più. Fino a +18% di chiusura preventivi.
            </p>

            <div className="order-4 mt-6 flex w-full flex-col items-center justify-center gap-3 sm:mt-9 sm:w-auto sm:flex-row">
              <button
                type="button"
                onClick={openLeadModal}
                className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-[#F97415] px-6 py-3.5 text-sm font-extrabold text-white shadow-lg shadow-orange-950/30 transition hover:bg-[#D95E0B] sm:w-auto sm:px-7 sm:py-4 sm:text-base"
              >
                Prova GRATIS il Render AI
                <ArrowRight className="h-5 w-5" />
              </button>
              <a
                href="#video-demo"
                className="inline-flex w-full items-center justify-center gap-2 rounded-lg border border-white/25 bg-white/10 px-6 py-3.5 text-sm font-bold text-white transition hover:bg-white/15 sm:w-auto sm:px-7 sm:py-4 sm:text-base"
              >
                <Play className="h-4 w-4 fill-white" />
                Guarda il video demo
              </a>
            </div>

            {/* HERO IMAGE — caso reale Demo Azienda */}
            <div className="order-5 mx-auto mt-8 w-full max-w-md sm:mt-10 sm:max-w-xl lg:max-w-[620px] xl:max-w-[680px]">
              <div className="overflow-hidden rounded-2xl border border-white/12 bg-white/6 p-2 shadow-[0_30px_80px_rgba(15,23,42,0.38)] backdrop-blur-sm sm:rounded-[28px] sm:p-4">
                <div className="mb-2 flex items-center justify-between px-1 text-[9px] font-black uppercase tracking-[0.16em] text-white/55 sm:mb-3 sm:text-xs sm:tracking-[0.18em]">
                  <span>Prima</span>
                  <span>Dopo</span>
                </div>
                <RenderBeforeAfterSlider
                  beforeUrl={HERO_BEFORE_IMAGE}
                  afterUrl={HERO_AFTER_IMAGE}
                  beforeLabel="Prima"
                  afterLabel="Dopo"
                  beforeOnLeft
                  compact
                  className="max-h-[54vh] rounded-xl bg-slate-950/70 sm:max-h-none sm:rounded-[22px]"
                />
                <p className="mt-3 hidden text-center text-xs font-semibold text-white/65 sm:block sm:text-sm">
                  Trascina la linea per passare dalla foto reale al render finale.
                </p>
              </div>
              <div className="mt-3 flex flex-wrap items-center justify-center gap-x-2 gap-y-2 text-center text-[9px] font-semibold uppercase tracking-[0.12em] text-white/55 sm:mt-4 sm:gap-x-4 sm:text-xs sm:tracking-[0.18em]">
                <span className="rounded-full border border-white/10 bg-white/6 px-3 py-1.5">
                  Caso reale Demo Azienda
                </span>
                <span className="rounded-full border border-emerald-400/20 bg-emerald-400/10 px-3 py-1.5 text-emerald-100/90">
                  Foto originale del cliente
                </span>
                <span className="rounded-full border border-orange-400/20 bg-orange-400/10 px-3 py-1.5 text-orange-100/90">
                  Render finale usato nel prima/dopo
                </span>
              </div>
              <p className="mt-3 hidden text-center text-[11px] font-medium leading-5 text-white/50 sm:block sm:text-xs">
                Qui non stai vedendo un mockup generico: è un prima/dopo reale preso dall&apos;area render della Demo Azienda S.r.l.
              </p>
            </div>

            <div className="order-6 mt-5 flex flex-wrap items-center justify-center gap-x-4 gap-y-2 text-xs font-semibold text-slate-300 sm:gap-x-5 sm:text-sm">
              {reassurancePoints.map((item) => (
                <span key={item} className="inline-flex items-center gap-1.5">
                  <CheckCircle2 className="h-4 w-4 text-emerald-300" />
                  {item}
                </span>
              ))}
            </div>

            {/* Trust badges row */}
            <div className="order-7 mx-auto mt-8 flex flex-wrap items-center justify-center gap-x-5 gap-y-3 sm:mt-10 sm:gap-x-6">
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
            <div className="order-8 mt-6 flex flex-wrap justify-center gap-2 sm:gap-3">
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
        <section className="border-b border-slate-200 bg-white px-4 py-6 sm:px-6 sm:py-7">
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
          data-render-reveal
          className="relative overflow-hidden bg-gradient-to-br from-[#0b1220] via-[#1a2540] to-[#D95E0B] px-6 py-14 text-white"
        >
          <div
            className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_85%_50%,rgba(255,255,255,0.18),transparent_55%),linear-gradient(90deg,rgba(249,116,21,0.22)_1px,transparent_1px),linear-gradient(rgba(249,116,21,0.16)_1px,transparent_1px)] bg-[length:auto,52px_52px,52px_52px]"
            aria-hidden="true"
          />
          <div
            data-render-orbit
            className="pointer-events-none absolute -right-16 top-6 h-44 w-44 rounded-full border border-orange-200/25"
            aria-hidden="true"
          />
          <div
            data-render-orbit
            className="pointer-events-none absolute -left-10 bottom-4 h-28 w-28 rounded-full border border-white/20"
            aria-hidden="true"
          />
          <div className="relative mx-auto grid max-w-6xl gap-8 lg:grid-cols-[1.1fr_0.9fr] lg:items-center">
            <div>
              <div className="inline-flex items-center gap-2 rounded-full bg-white/15 px-3 py-1 text-xs font-black uppercase tracking-[0.18em] ring-1 ring-white/20">
                <Sparkles className="h-3.5 w-3.5" />
                30 serramentisti italiani · prezzo di lancio · poi condizioni aggiornate
              </div>
              <h2 id="beta-title" className="mt-4 text-2xl font-black leading-tight sm:text-4xl">
                Stiamo aprendo l'anteprima alle prime 30 aziende.
              </h2>
              <p className="mt-3 text-base font-semibold leading-7 sm:text-lg sm:leading-8 text-orange-50">
                Se entri ora blocchi le condizioni di lancio, ricevi affiancamento singolo
                con un Consulente del Controllo e puoi aiutarci a scegliere quali categorie
                aggiungere dopo gli infissi.
              </p>
            </div>
            <div className="rounded-2xl border border-white/18 bg-white/10 p-5 shadow-2xl backdrop-blur" data-render-stagger>
              {[
                "Prezzo di lancio riservato alle prime 30 aziende attivate.",
                "Affiancamento singolo con un Consulente del Controllo dedicato di EdiliziaInCloud.",
                "31 giorni di prova senza rischio, con setup e primi casi reali seguiti passo passo.",
              ].map((item) => (
                <div key={item} data-render-item className="flex gap-3 border-b border-white/10 py-3 last:border-b-0">
                  <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-300" />
                  <p className="text-sm font-semibold leading-6 text-white/88">{item}</p>
                </div>
              ))}
              <p className="mt-4 rounded-xl bg-black/20 p-3 text-sm font-black text-white">
                Quando i posti di lancio si chiudono, riapriremo con condizioni aggiornate.
              </p>
              <button
                type="button"
                onClick={openLeadModal}
                className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-lg bg-white px-6 py-4 text-base font-extrabold text-[#D95E0B] shadow-lg transition hover:bg-orange-50"
              >
                Riserva il tuo posto ora
                <ArrowRight className="h-5 w-5" />
              </button>
            </div>
          </div>
        </section>

        {/* Speed stats with animated counters */}
        <section aria-labelledby="speed-title" data-render-reveal className="bg-[#fff7ed] px-6 py-16">
          <div className="mx-auto max-w-6xl">
            <div className="mx-auto max-w-3xl text-center">
              <p className="text-sm font-black uppercase tracking-[0.2em] text-[#D95E0B]">
                Risposta immediata
              </p>
              <h2 id="speed-title" className="mt-3 text-2xl font-black tracking-tight text-[#0f172a] sm:text-4xl">
                In 60 secondi hai un argomento di vendita che il concorrente non ha.
              </h2>
              <p className="mt-4 text-base leading-7 sm:text-lg sm:leading-8 text-slate-700">
                Il sopralluogo è finito. Sei in macchina. Apri il telefono. Carichi la foto, scegli
                profilo e colore, premi genera. Quando il cliente apre WhatsApp tu sei già lì, col
                prima/dopo della sua casa. Il concorrente sta ancora preparando il preventivo in PDF.
              </p>
            </div>
            <div className="mt-10 grid gap-4 sm:grid-cols-3" data-render-stagger>
              {speedStats.map((item) => (
                <div
                  key={item.label}
                  data-render-item
                  className="group rounded-2xl border border-orange-200 bg-white p-6 shadow-sm transition hover:-translate-y-1 hover:shadow-xl"
                >
                  <p className="text-4xl font-black tracking-tight sm:text-5xl text-[#D95E0B] transition group-hover:scale-105">
                    <CountUp value={item.value} prefix={item.prefix} suffix={item.suffix} />
                  </p>
                  <p className="mt-3 text-sm font-semibold leading-6 text-slate-700">{item.label}</p>
                </div>
              ))}
            </div>
            <p className="mx-auto mt-5 max-w-3xl text-center text-xs leading-6 text-slate-500">
              Stime indicative. Il risultato reale dipende da prodotto, prezzo, qualità del cliente e processo di vendita.
            </p>
          </div>
        </section>

        {/* VISUAL SALES INFOGRAPHIC */}
        <section aria-labelledby="visual-sales-title" data-render-reveal className="bg-white px-6 py-16 sm:py-20">
          <div className="mx-auto max-w-6xl">
            <div className="mx-auto max-w-3xl text-center">
              <p className="text-sm font-black uppercase tracking-[0.2em] text-[#D95E0B]">Prima immagine, poi prezzo</p>
              <h2 id="visual-sales-title" className="mt-3 text-2xl font-black tracking-tight text-[#0f172a] sm:text-4xl">
                Il preventivo non resta più una lista di righe tecniche.
              </h2>
              <p className="mt-4 text-base leading-7 text-slate-600 sm:text-lg sm:leading-8">
                Mostri al cliente una prova visiva, poi colleghi quella prova al preventivo,
                alla trattativa e al follow-up. È qui che il render diventa vendita.
              </p>
            </div>
            <div className="mt-10">
              <ConversionInfographic />
            </div>
            <p className="mx-auto mt-5 max-w-3xl text-center text-xs leading-6 text-slate-500">
              Esempio commerciale prudenziale: non è una promessa di risultato automatico, ma un modello per visualizzare
              cosa succede quando il preventivo viene accompagnato da una prova visiva e da un follow-up ordinato.
            </p>
          </div>
        </section>

        {/* VIDEO DEMO */}
        <section id="video-demo" aria-labelledby="video-title" data-render-reveal className="bg-white px-4 py-14 sm:px-6 sm:py-20">
          <div className="mx-auto max-w-5xl">
            <div className="mx-auto max-w-3xl text-center">
              <div className="inline-flex items-center gap-2 rounded-full bg-orange-100 px-3 py-1 text-[10px] font-black uppercase tracking-[0.14em] text-[#D95E0B] sm:text-xs sm:tracking-[0.18em]">
                <Play className="h-3.5 w-3.5 fill-[#D95E0B]" />
                Demo visuale · 60 secondi
              </div>
              <h2 id="video-title" className="mt-4 text-[1.65rem] font-black leading-tight tracking-tight text-[#0f172a] sm:text-4xl">
                Guarda il percorso: foto, scelta, prima/dopo, WhatsApp.
              </h2>
              <p className="mt-4 text-sm leading-6 text-slate-600 sm:text-lg sm:leading-8">
                Questa demo mostra il flusso commerciale da replicare in trattativa:
                foto reale, scelta delle finiture, prima/dopo e invio al cliente.
              </p>
            </div>
            <div className="mt-7 sm:mt-10">
              <YouTubeDemoEmbed />
            </div>
            <div className="mt-6">
              <VisualDemoStoryboard />
            </div>
            <div className="mt-7 text-center">
              <p className="text-sm font-bold text-slate-700">Non basta. Vuoi vederlo sulla foto di un tuo cliente?</p>
              <button
                type="button"
                onClick={openLeadModal}
                className="mt-4 inline-flex items-center justify-center gap-2 rounded-lg bg-[#F97415] px-6 py-3 text-sm font-extrabold text-white shadow-lg shadow-orange-900/20 transition hover:bg-[#D95E0B]"
              >
                Voglio provarlo su una foto reale
                <ArrowRight className="h-4 w-4" />
              </button>
            </div>
          </div>
        </section>

        {/* WHATSAPP FOLLOW-UP MOCK */}
        <section aria-labelledby="followup-visual-title" data-render-reveal className="bg-[#f8fafc] px-6 py-20">
          <div className="mx-auto grid max-w-6xl gap-10 lg:grid-cols-[0.9fr_1.1fr] lg:items-center">
            <div>
              <p className="text-sm font-black uppercase tracking-[0.2em] text-[#D95E0B]">
                Follow-up che si vede
              </p>
              <h2 id="followup-visual-title" className="mt-3 text-2xl font-black tracking-tight text-[#0f172a] sm:text-4xl">
                Non richiami chiedendo “ha visto il preventivo?”.
              </h2>
              <p className="mt-4 text-base leading-7 text-slate-600 sm:text-lg sm:leading-8">
                Riapri la conversazione con una foto: “Le mando come cambierebbe casa sua”.
                Il cliente non deve ricordarsi una cifra. Deve riconoscere casa sua.
              </p>
              <div className="mt-6 grid gap-3 sm:grid-cols-3">
                {["WhatsApp", "PDF prima/dopo", "Scheda cliente"].map((item) => (
                  <div key={item} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                    <CheckCircle2 className="h-5 w-5 text-emerald-600" />
                    <p className="mt-2 text-sm font-black text-slate-900">{item}</p>
                  </div>
                ))}
              </div>
            </div>
            <PhoneFollowUpMock />
          </div>
        </section>

        {/* REAL VISUAL PROOF MOSAIC */}
        <section aria-labelledby="proof-mosaic-title" data-render-reveal className="bg-white px-6 py-20">
          <div className="mx-auto max-w-6xl">
            <div className="max-w-3xl">
              <p className="text-sm font-black uppercase tracking-[0.2em] text-[#D95E0B]">
                Prova visiva reale
              </p>
              <h2 id="proof-mosaic-title" className="mt-3 text-2xl font-black tracking-tight text-[#0f172a] sm:text-4xl">
                La differenza si capisce prima ancora di leggere il preventivo.
              </h2>
              <p className="mt-4 text-base leading-7 text-slate-600 sm:text-lg sm:leading-8">
                Stessa casa, stesso contesto, stessa apertura. Cambia ciò che il cliente deve decidere:
                il risultato finale.
              </p>
            </div>
            <div className="mt-10">
              <VisualProofMosaic />
            </div>
          </div>
        </section>

        <section className="bg-[#f8fafc] px-6 py-20">
          <div className="mx-auto max-w-6xl" data-render-reveal>
            <div className="max-w-3xl">
              <p className="text-sm font-black uppercase tracking-[0.2em] text-[#D95E0B]">
                Il problema vero
              </p>
              <h2 className="mt-3 text-2xl font-black tracking-tight text-[#0f172a] sm:text-4xl">
                Il cliente non sta scegliendo una finestra. Sta decidendo se fidarsi di te.
              </h2>
              <p className="mt-4 text-base leading-7 sm:text-lg sm:leading-8 text-slate-600">
                Il serramentista bravo spiega bene. Il serramentista che chiude meglio fa vedere.
                Tu fai entrambe le cose. Solo che il cliente, finora, ha sentito solo la prima.
              </p>
            </div>

            <div className="mt-10 grid gap-5 md:grid-cols-3" data-render-stagger>
              {painPoints.map((item) => (
                <div
                  key={item.title}
                  data-render-item
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

            <ContextualCta
              eyebrow="Prossimo passo"
              title="Vuoi vedere se il prima/dopo può sbloccare i preventivi fermi della tua azienda?"
              action="Voglio vedere il prima/dopo"
              onClick={openLeadModal}
            />
          </div>
        </section>

        <section className="bg-white px-6 py-20">
          <div className="mx-auto max-w-6xl" data-render-reveal>
            <div className="max-w-3xl">
              <p className="text-sm font-black uppercase tracking-[0.2em] text-[#D95E0B]">
                Prima e dopo, dove conta davvero
              </p>
              <h2 className="mt-3 text-2xl font-black tracking-tight text-[#0f172a] sm:text-4xl">
                Non un'immagine generica. Le aree che fanno decidere il cliente.
              </h2>
              <p className="mt-4 text-base leading-7 sm:text-lg sm:leading-8 text-slate-600">
                Il render deve aiutare il cliente a capire cosa cambia nella sua casa: facciata,
                vano finestra, oscuranti, cassonetti e dettagli che normalmente restano nascosti dentro
                una voce di preventivo.
              </p>
            </div>

            <div className="mt-10 grid gap-5 md:grid-cols-2" data-render-stagger>
              {beforeAfterAreas.map((area) => (
                <div
                  key={area.title}
                  data-render-item
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
        <section id="meccanismo" aria-labelledby="meccanismo-title" data-render-reveal className="bg-white px-6 py-20">
          <div className="mx-auto max-w-6xl">
            <div className="mx-auto max-w-3xl text-center">
              <p className="text-sm font-black uppercase tracking-[0.2em] text-[#D95E0B]">Il meccanismo</p>
              <h2 id="meccanismo-title" className="mt-3 text-2xl font-black tracking-tight text-[#0f172a] sm:text-4xl">
                Una prova visiva che entra nella trattativa al momento giusto.
              </h2>
              <p className="mt-4 text-base leading-7 sm:text-lg sm:leading-8 text-slate-600">
                Non vendi Intelligenza Artificiale. Vendi sicurezza al cliente.
              </p>
            </div>

            <div className="relative mt-12">
              {/* Connecting line desktop */}
              <div
                className="absolute left-0 right-0 top-6 hidden h-0.5 bg-gradient-to-r from-orange-200 via-orange-400 to-orange-200 md:block"
                aria-hidden="true"
              />
              <div className="grid gap-8 md:grid-cols-3" data-render-stagger>
                {mechanismSteps.map((step, index) => (
                  <div key={step.title} id={`step-${index + 1}`} className="relative" data-render-item>
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
              <button
                type="button"
                onClick={openLeadModal}
                className="inline-flex items-center justify-center gap-2 rounded-lg bg-[#0f172a] px-7 py-4 text-sm font-extrabold text-white transition hover:bg-[#1e293b]"
              >
                Provalo gratis sulla foto del tuo cliente
                <ArrowRight className="h-4 w-4" />
              </button>
            </div>
          </div>
        </section>

        {/* Commercial levers */}
        <section className="bg-[#0f172a] px-6 py-20 text-white" data-render-reveal>
          <div className="mx-auto max-w-6xl">
            <div className="grid gap-10 lg:grid-cols-[0.8fr_1.2fr] lg:items-start">
              <div>
                <p className="text-sm font-black uppercase tracking-[0.2em] text-orange-300">
                  Perché funziona commercialmente
                </p>
                <h2 className="mt-3 text-2xl font-black tracking-tight sm:text-4xl">
                  Se il cliente non vede la differenza, ti chiederà lo sconto.
                </h2>
                <p className="mt-5 text-base leading-7 sm:text-lg sm:leading-8 text-slate-300">
                  La maggior parte dei concorrenti consegna preventivi pieni di voci tecniche. Tu puoi
                  consegnare una prova visiva: stessa casa, nuovi infissi, impatto immediato.
                </p>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                {commercialLevers.map((item) => (
                  <div
                    key={item.title}
                    data-render-item
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
        <section className="bg-gradient-to-br from-[#fff7ed] via-white to-[#fff1e0] px-6 py-20" data-render-reveal>
          <div className="mx-auto max-w-6xl">
            <div className="mx-auto max-w-3xl text-center">
              <div className="inline-flex items-center gap-2 rounded-full bg-orange-100 px-3 py-1 text-xs font-black uppercase tracking-[0.18em] text-[#D95E0B]">
                <TrendingUp className="h-3.5 w-3.5" />
                Risultati con Edilizia in Cloud
              </div>
              <h2 className="mt-4 text-2xl font-black tracking-tight text-[#0f172a] sm:text-4xl">
                L'anteprima visiva è solo l'inizio. Il salto vero è quando entra nel tuo archivio clienti.
              </h2>
              <p className="mt-4 text-base leading-7 sm:text-lg sm:leading-8 text-slate-600">
                L'anteprima da sola la fanno in dieci con un'applicazione qualunque. EdiliziaInCloud
                collega ogni render al contatto, alla trattativa, al preventivo e alla fattura elettronica.
                Smetti di gestire clienti tra WhatsApp, fogli Excel e cartelle perse.
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
                { value: 18, prefix: "+", suffix: "%", label: "di chiusura stimata: dal 30% al 48%" },
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
              <button
                type="button"
                onClick={openLeadModal}
                className="inline-flex items-center justify-center gap-2 rounded-lg bg-[#F97415] px-7 py-4 text-base font-extrabold text-white shadow-lg shadow-orange-900/20 transition hover:bg-[#D95E0B]"
              >
                Apri il tuo cruscotto di prova
                <ArrowRight className="h-5 w-5" />
              </button>
            </div>
          </div>
        </section>

        {/* ROI CALCULATOR */}
        <section className="bg-white px-6 py-20" data-render-reveal>
          <div className="mx-auto max-w-6xl">
            <div className="mx-auto max-w-3xl text-center">
              <div className="inline-flex items-center gap-2 rounded-full bg-orange-100 px-3 py-1 text-xs font-black uppercase tracking-[0.18em] text-[#D95E0B]">
                <TrendingUp className="h-3.5 w-3.5" />
                Calcola il tuo ROI
              </div>
              <h2 className="mt-4 text-2xl font-black tracking-tight text-[#0f172a] sm:text-4xl">
                Sposta i cursori. Vedi quanto stai lasciando al concorrente.
              </h2>
              <p className="mt-4 text-base leading-7 sm:text-lg sm:leading-8 text-slate-600">
                Quanti preventivi mandi al mese. Quanto vale in media un ordine chiuso. Quanti firmi su 10.
                Tre numeri. Sposta i cursori sui tuoi.
              </p>
            </div>
            <div className="mt-10">
              <RoiCalculator onRequestInfo={openLeadModal} />
            </div>
            <p className="mt-4 text-center text-xs leading-6 text-slate-500">
              Stima indicativa basata su benchmark di trattativa visiva. Il risultato reale dipende da prodotto,
              prezzo, qualità del cliente e processo commerciale.
            </p>
            <ContextualCta
              eyebrow="Analisi gratuita"
              title="Porta i tuoi numeri: preventivi al mese, ticket medio e chiusure. Ti mostriamo dove stai lasciando margine."
              action="Calcola sul mio caso"
              onClick={openLeadModal}
            />
          </div>
        </section>

        {/* Sales impact */}
        <section className="bg-[#f8fafc] px-6 py-20" data-render-reveal>
          <div className="mx-auto max-w-6xl">
            <div className="grid gap-10 lg:grid-cols-[0.9fr_1.1fr] lg:items-start">
              <div>
                <p className="text-sm font-black uppercase tracking-[0.2em] text-[#D95E0B]">
                  Più vendite, meno preventivi dimenticati
                </p>
                <h2 className="mt-3 text-2xl font-black tracking-tight text-[#0f172a] sm:text-4xl">
                  Il render non serve a fare scena. Serve a far avanzare la decisione.
                </h2>
                <p className="mt-5 text-base leading-7 sm:text-lg sm:leading-8 text-slate-600">
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
        <section className="bg-white px-6 py-20" data-render-reveal>
          <div className="mx-auto max-w-6xl">
            <div className="max-w-3xl">
              <p className="text-sm font-black uppercase tracking-[0.2em] text-[#D95E0B]">Cosa consegni</p>
              <h2 className="mt-3 text-2xl font-black tracking-tight text-[#0f172a] sm:text-4xl">
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
        <section className="bg-[#f8fafc] px-6 py-20" data-render-reveal>
          <div className="mx-auto max-w-6xl">
            <div className="grid gap-10 lg:grid-cols-[0.9fr_1.1fr] lg:items-start">
              <div>
                <p className="text-sm font-black uppercase tracking-[0.2em] text-[#D95E0B]">Uso sul campo</p>
                <h2 className="mt-3 text-2xl font-black tracking-tight text-[#0f172a] sm:text-4xl">
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
              <h2 id="faq-title" className="mt-3 text-2xl font-black tracking-tight text-[#0f172a] sm:text-4xl">
                Le domande che un serramentista serio si fa prima di firmare.
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
                Esplora gli altri moduli
              </p>
              <h2
                id="approfondisci-title"
                className="mt-3 text-2xl font-black tracking-tight text-[#0f172a] sm:text-4xl"
              >
                Render Infissi è un modulo di EdiliziaInCloud.
              </h2>
              <p className="mt-4 text-base leading-7 text-slate-600">
                Il gestionale per imprese edili e serramentisti italiani. Scopri tutti i moduli collegati:
                archivio clienti, preventivi, ordini, fatturazione SDI, margini di commessa e marketing.
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
              ].map((link) => {
                if (link.to === "/demo") {
                  return (
                    <button
                      key={`${link.title}-render-lead`}
                      type="button"
                      onClick={openLeadModal}
                      className="group flex flex-col rounded-xl border border-slate-200 bg-white p-5 text-left shadow-sm transition hover:-translate-y-0.5 hover:border-orange-300 hover:shadow-md"
                    >
                      <span className="inline-flex items-center gap-2 text-base font-black text-[#0f172a] group-hover:text-[#D95E0B]">
                        {link.title}
                        <ArrowRight className="h-4 w-4 transition group-hover:translate-x-0.5" />
                      </span>
                      <span className="mt-2 text-sm leading-6 text-slate-600">{link.text}</span>
                    </button>
                  );
                }

                return (
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
                );
              })}
            </nav>
          </div>
        </section>

        {/* Final CTA */}
        <section id="render-request" aria-labelledby="final-cta-title" data-render-reveal className="relative overflow-hidden bg-[#0b1220] px-6 py-20 text-center text-white">
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_50%_0%,rgba(249,116,21,0.28),transparent_46%)]" aria-hidden="true" />
          <div className="mx-auto max-w-3xl">
            <Wand2 className="mx-auto h-10 w-10 text-orange-300" />
            <h2 id="final-cta-title" className="mt-5 text-2xl font-black tracking-tight sm:text-4xl">
              Il tuo concorrente sta finendo il preventivo PDF adesso.
            </h2>
            <p className="mt-5 text-base leading-7 sm:text-lg sm:leading-8 text-slate-300">
              Tu puoi mandare la foto di casa sua coi tuoi nuovi infissi. Il cliente apre WhatsApp
              stasera dopo cena. Vede il preventivo del concorrente. Vede il tuo prima/dopo.
              Indovina chi richiama domani mattina.
            </p>
            <div className="mx-auto mt-8 grid max-w-2xl gap-2 text-left text-sm font-semibold text-slate-200 sm:grid-cols-2" data-render-stagger>
              {[
                "31 giorni di prova gratuita",
                "Garanzia di risultato a 90 giorni",
                "Setup in 48 ore · migrazione dati inclusa",
                "Affiancamento singolo dedicato",
                "Disdici quando vuoi, senza penali",
                "Prezzo bloccato a vita per le prime 30 aziende",
              ].map((item) => (
                <div key={item} data-render-item className="flex items-start gap-2 rounded-lg border border-white/10 bg-white/5 p-3">
                  <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-300" />
                  <span>{item}</span>
                </div>
              ))}
            </div>
            <div className="mt-8 flex flex-col items-center justify-center gap-3">
              <button
                type="button"
                onClick={openLeadModal}
                className="inline-flex items-center justify-center gap-2 rounded-lg bg-[#F97415] px-8 py-4 text-base font-extrabold text-white shadow-lg shadow-orange-900/30 transition hover:bg-[#D95E0B]"
              >
                Riserva il tuo posto in anteprima
                <ArrowRight className="h-5 w-5" />
              </button>
              <button
                type="button"
                onClick={openLeadModal}
                className="inline-flex items-center justify-center gap-2 rounded-lg border border-white/20 bg-white/10 px-8 py-4 text-base font-extrabold text-white transition hover:bg-white/15"
              >
                Prenota la dimostrazione gratuita di 30 minuti
              </button>
              <p className="text-xs font-medium text-slate-400">
                Finisci di lavorare a sensazione. Inizia a guadagnare davvero.
              </p>
            </div>
          </div>
        </section>
      </main>

      {/* STICKY MOBILE CTA */}
      <div className="fixed inset-x-0 bottom-0 z-40 border-t border-slate-200 bg-white/95 px-3 py-2 pr-[104px] shadow-[0_-8px_24px_rgba(15,23,42,0.12)] backdrop-blur sm:px-4 sm:py-3 sm:pr-4 lg:hidden">
        <button
          type="button"
          onClick={openLeadModal}
          className="flex min-h-11 w-full items-center justify-center gap-2 rounded-lg bg-[#F97415] px-4 py-2.5 text-xs font-extrabold text-white shadow-md transition hover:bg-[#D95E0B] min-[390px]:text-sm sm:px-5 sm:py-3"
        >
          Prova gratis
          <ArrowRight className="h-4 w-4" />
        </button>
        <p className="mt-1 hidden text-center text-[10px] font-semibold text-slate-500 min-[390px]:block">
          Onboarding incluso · Cancelli quando vuoi
        </p>
      </div>

      <RenderLeadModal slug="render-infissi" open={leadModalOpen} onOpenChange={setLeadModalOpen} />
      <LandingFooter />
    </div>
  );
}
