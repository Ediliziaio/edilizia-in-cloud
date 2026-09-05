import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import {
  AlertTriangle,
  ArrowRight,
  Calculator,
  CheckCircle2,
  Clock,
  Eye,
  HardHat,
  Layers,
  PiggyBank,
  RotateCcw,
  ShieldCheck,
  Sparkles,
  TrendingDown,
  TrendingUp,
} from "lucide-react";
import LandingFooter from "@/components/landing/LandingFooter";
import LandingNavbar from "@/components/landing/LandingNavbar";
import { JsonLd } from "@/components/seo/JsonLd";
import { SITE_URL, useSEO } from "@/hooks/useSEO";
import { parseDecimalIT } from "@/lib/parseDecimalIT";

/* ==================================================================== */
/* COSTANTI                                                             */
/* ==================================================================== */

const PAGE_PATH = "/strumenti/calcolatore-margine-commessa";
const PAGE_URL = `${SITE_URL}${PAGE_PATH}/`;

/** Soglie del semaforo (margine % sul contratto). */
const SOGLIA_VERDE = 15;
const SOGLIA_GIALLO = 8;

/**
 * Valori di esempio realistici: cantiere di ristrutturazione da 85.000 €
 * che a occhio "sembra buono" ma chiude sotto il 10% di margine.
 * Volutamente in fascia GIALLA: chi apre la pagina vede subito un caso
 * credibile e capisce a cosa serve lo strumento.
 *
 * NOTA: le stringhe di default sono in cifre pure ("85000"). Dal 25/07/2026
 * anche "85.000" verrebbe letto correttamente (vedi parseEuro qui sotto),
 * ma i default restano senza separatori per non dipenderne.
 */
const ESEMPIO = {
  contratto: "85000",
  materiali: "31500",
  ore: "520",
  costoOrario: "34",
  subappalti: "14000",
  noli: "4200",
  generaliPct: "8",
  imprevisti: "2500",
} as const;

const VUOTO = {
  contratto: "",
  materiali: "",
  ore: "",
  costoOrario: "",
  subappalti: "",
  noli: "",
  generaliPct: "8",
  imprevisti: "",
} as const;

type FormState = { [K in keyof typeof ESEMPIO]: string };

/* ==================================================================== */
/* PARSING NUMERICO                                                     */
/* ==================================================================== */

/**
 * Parsing degli importi in formato italiano.
 *
 * Delega tutto a `parseDecimalIT` (helper condiviso del gestionale):
 * virgola decimale, punto delle migliaia, simboli valuta, spazi, formato
 * misto IT/US.
 *
 * Fino al 25/07/2026 qui viveva una normalizzazione locale per il caso
 * "85.000" (punto = migliaia), perché l'helper condiviso lo leggeva come
 * 85. Ora quella regola sta nell'helper — insieme al parser dei listini,
 * che l'aveva già — quindi la copia locale è stata rimossa: una sola
 * definizione di "cosa vale 85.000", non tre che scivolano nel tempo.
 */
export function parseEuro(raw: string): number {
  const n = parseDecimalIT(raw);
  return Number.isFinite(n) ? n : 0;
}

/** Come parseEuro ma senza valori negativi (un costo negativo non esiste). */
function parseCosto(raw: string): number {
  return Math.max(0, parseEuro(raw));
}

/** Ripulisce l'input mentre l'utente scrive: solo cifre, virgola e punto. */
function sanitize(raw: string): string {
  return raw.replace(/[^0-9.,]/g, "").slice(0, 15);
}

/* ==================================================================== */
/* FORMATTAZIONE                                                        */
/* ==================================================================== */

const fmtEuro = new Intl.NumberFormat("it-IT", {
  style: "currency",
  currency: "EUR",
  maximumFractionDigits: 0,
  // CLDR italiano non raggruppa i numeri a 4 cifre ("8320 €" ma "76.680 €"):
  // qui gli importi si leggono incolonnati e confrontati, quindi forziamo il
  // separatore sempre. Nei browser che non conoscono "always" la stringa è
  // truthy e vale come useGrouping: true — nessuna regressione.
  useGrouping: "always",
});
const fmtNum = new Intl.NumberFormat("it-IT", {
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
});

const euro = (n: number) => fmtEuro.format(Number.isFinite(n) ? n : 0);
const perc = (n: number) => `${fmtNum.format(Number.isFinite(n) ? n : 0)} %`;

/* ==================================================================== */
/* MOTORE DI CALCOLO (puro, testabile)                                  */
/* ==================================================================== */

export interface MargineInput {
  contratto: number;
  materiali: number;
  ore: number;
  costoOrario: number;
  subappalti: number;
  noli: number;
  generaliPct: number;
  imprevisti: number;
}

export interface MargineOutput {
  manodopera: number;
  generali: number;
  costiDiretti: number;
  costoTotale: number;
  margineEuro: number;
  marginePct: number;
  breakEven: number;
  fascia: "verde" | "giallo" | "rosso" | "neutro";
}

/**
 * FORMULA
 *
 *   manodopera    = ore × costo orario
 *   generali      = contratto × (% costi generali / 100)
 *   costi diretti = materiali + manodopera + subappalti + noli + imprevisti
 *   costo totale  = costi diretti + generali
 *   margine €     = contratto − costo totale
 *   margine %     = margine € / contratto × 100
 *
 * BREAK-EVEN (a quanto devi vendere per non perderci)
 * I costi generali sono una percentuale del contratto, quindi crescono
 * insieme al prezzo di vendita: non basta "vendere quanto costa".
 * Si risolve X = costi diretti + X × p  →  X = costi diretti / (1 − p)
 * con p = % generali / 100. Se p ≥ 1 il break-even non esiste
 * (i soli costi generali si mangiano tutto il contratto): fallback al
 * costo totale, che resta il numero onesto da mostrare.
 */
export function calcolaMargine(i: MargineInput): MargineOutput {
  const manodopera = i.ore * i.costoOrario;
  const generaliPct = Math.min(Math.max(i.generaliPct, 0), 100);
  const generali = i.contratto * (generaliPct / 100);

  const costiDiretti =
    i.materiali + manodopera + i.subappalti + i.noli + i.imprevisti;
  const costoTotale = costiDiretti + generali;

  const margineEuro = i.contratto - costoTotale;
  const marginePct = i.contratto > 0 ? (margineEuro / i.contratto) * 100 : 0;

  const p = generaliPct / 100;
  const breakEven = p < 1 ? costiDiretti / (1 - p) : costoTotale;

  let fascia: MargineOutput["fascia"] = "neutro";
  if (i.contratto > 0) {
    if (marginePct >= SOGLIA_VERDE) fascia = "verde";
    else if (marginePct >= SOGLIA_GIALLO) fascia = "giallo";
    else fascia = "rosso";
  }

  return {
    manodopera,
    generali,
    costiDiretti,
    costoTotale,
    margineEuro,
    marginePct,
    breakEven,
    fascia,
  };
}

/* ==================================================================== */
/* CONTENUTI STATICI                                                    */
/* ==================================================================== */

const FASCE = [
  {
    key: "verde" as const,
    titolo: "Margine ≥ 15% — sano",
    dot: "bg-emerald-500",
    ring: "ring-emerald-200",
    bg: "bg-emerald-50",
    testo:
      "Il cantiere regge. Hai spazio per assorbire un imprevisto, una variante non riconosciuta o due settimane di ritardo senza andare sotto. È la fascia in cui l'impresa accumula riserva invece di consumarla.",
  },
  {
    key: "giallo" as const,
    titolo: "Margine 8–15% — sottile",
    dot: "bg-amber-500",
    ring: "ring-amber-200",
    bg: "bg-amber-50",
    testo:
      "Guadagni, ma il primo imprevisto se lo porta via. Una squadra ferma tre giorni, un ritorno in cantiere per rifare una posa, un rincaro sul materiale: sono tutte cose che qui pesano più del tuo utile. Da presidiare settimana per settimana.",
  },
  {
    key: "rosso" as const,
    titolo: "Margine sotto l'8% — zona di rischio",
    dot: "bg-red-500",
    ring: "ring-red-200",
    bg: "bg-red-50",
    testo:
      "A questi numeri stai lavorando per pagare i fornitori e gli operai, non l'impresa. E i costi che nessuno registra (ore extra, sprechi, ritorni) di solito valgono più di quel poco che resta: il rischio concreto è chiudere in perdita senza accorgertene.",
  },
];

const COSTI_DIMENTICATI = [
  {
    icon: Clock,
    titolo: "Ore extra mai fatturate",
    testo:
      "Il cliente chiede una modifica «piccola», la squadra ci mette mezza giornata, nessuno apre una variante. Moltiplicato per tutta la durata del cantiere è la voce che erode più margine in assoluto.",
  },
  {
    icon: Layers,
    titolo: "Materiale sprecato o rifatto",
    testo:
      "Sfrido oltre la media, materiale ordinato in eccesso e mai reso, lavorazioni da rifare perché la misura era sbagliata. Esce dal magazzino, non entra in nessun preventivo.",
  },
  {
    icon: RotateCcw,
    titolo: "Ritorni in cantiere dopo la consegna",
    testo:
      "Finiture, ritocchi, chiamate del cliente a lavori chiusi. Due operai e un furgone per una mattina sono un costo reale che arriva quando la commessa è già stata «chiusa» a gestionale.",
  },
  {
    icon: ShieldCheck,
    titolo: "Fideiussioni e polizze",
    testo:
      "Garanzie sui SAL, polizze CAR, cauzioni definitive: costi finanziari legati a quel cantiere che quasi nessuno riporta sulla singola commessa e che finiscono nel calderone delle spese generali.",
  },
  {
    icon: PiggyBank,
    titolo: "Ritenute a garanzia",
    testo:
      "Il 5-10% trattenuto fino al collaudo non è margine, è liquidità che il committente tiene ferma per mesi. Se non lo separi, il margine che leggi è più alto di quello che hai davvero in cassa.",
  },
  {
    icon: HardHat,
    titolo: "Tempi morti e sovrapposizioni",
    testo:
      "Squadra che aspetta il fornitore, cantiere fermo per il maltempo, operai spostati di corsa da un lavoro all'altro. Le ore le paghi comunque: se non le attribuisci alla commessa giusta, il margine è sbagliato su entrambe.",
  },
];

const FAQ = [
  {
    q: "Come si calcola il margine di una commessa edile?",
    a: "Si parte dall'importo del contratto e si sottraggono tutti i costi attribuibili al cantiere: materiali, manodopera (ore × costo orario reale, non lo stipendio lordo diviso 160), subappalti, noli e mezzi, la quota di costi generali di struttura e gli imprevisti non fatturati. Il risultato è il margine in euro; diviso per l'importo del contratto e moltiplicato per 100 dà il margine percentuale. Questo calcolatore applica esattamente questa formula.",
  },
  {
    q: "Qual è un buon margine per un'impresa edile?",
    a: "Non esiste un numero valido per tutti: dipende da lavorazione, rischio e durata. Come regola di lettura, sopra il 15% il cantiere ha abbastanza cuscinetto per assorbire imprevisti; tra l'8% e il 15% guadagni ma sei esposto; sotto l'8% il margine è più piccolo dell'errore di misurazione tipico e il rischio di chiudere in perdita è concreto. Il dato che conta davvero è il confronto con i TUOI cantieri passati.",
  },
  {
    q: "Che differenza c'è tra margine e ricarico?",
    a: "Il margine si calcola sul prezzo di vendita (margine € ÷ contratto), il ricarico sul costo (margine € ÷ costo totale). Un ricarico del 20% sul costo produce circa un 16,7% di margine sul venduto. È l'errore più costoso che si vede nei preventivi edili: si applica un ricarico pensando sia il margine e si scopre a fine cantiere che mancano diversi punti.",
  },
  {
    q: "Quanto devo mettere di costi generali sul cantiere?",
    a: "I costi generali (ufficio, amministrazione, mezzi aziendali, assicurazioni, software, titolare) vanno ripartiti sulle commesse: si prende il totale annuo dei costi di struttura e si divide per il fatturato annuo atteso. Nelle piccole e medie imprese edili italiane il valore si colloca spesso tra il 6% e il 12%: il default dell'8% è una stima prudente da sostituire con il tuo dato reale appena lo conosci.",
  },
  {
    q: "Il break-even che vedo perché è più alto della somma dei costi?",
    a: "Perché i costi generali sono una percentuale del contratto: se alzi il prezzo, cresce anche la quota di struttura assorbita. Il punto di pareggio si calcola quindi come costi diretti ÷ (1 − % costi generali), non come semplice somma dei costi. Vendere «a quanto ti costa» ti lascerebbe comunque sotto.",
  },
  {
    q: "I dati che inserisco vengono salvati o inviati da qualche parte?",
    a: "No. Il calcolo avviene interamente nel tuo browser, in tempo reale: nessun importo viene inviato a un server, salvato o associato a te. Puoi usarlo dal telefono in cantiere senza registrarti e senza lasciare nessun dato.",
  },
];

/* ==================================================================== */
/* JSON-LD (statici: non dipendono dallo stato del form)                */
/* ==================================================================== */

const breadcrumbLd = {
  "@context": "https://schema.org",
  "@type": "BreadcrumbList",
  itemListElement: [
    { "@type": "ListItem", position: 1, name: "Home", item: `${SITE_URL}/` },
    {
      "@type": "ListItem",
      position: 2,
      name: "Calcolatore margine di commessa",
      item: PAGE_URL,
    },
  ],
};

const webAppLd = {
  "@context": "https://schema.org",
  "@type": "WebApplication",
  name: "Calcolatore margine di commessa",
  applicationCategory: "BusinessApplication",
  applicationSubCategory: "Construction Job Costing Calculator",
  operatingSystem: "Web browser (desktop e mobile)",
  url: PAGE_URL,
  description:
    "Calcolatore gratuito del margine di commessa: contratto, materiali, ore, subappalti, noli e costi generali → margine in euro, in % e punto di pareggio.",
  browserRequirements: "Richiede JavaScript. Nessuna registrazione.",
  isAccessibleForFree: true,
  inLanguage: "it-IT",
  offers: {
    "@type": "Offer",
    price: "0",
    priceCurrency: "EUR",
    availability: "https://schema.org/InStock",
    description: "Strumento gratuito, senza registrazione.",
  },
  featureList: [
    "Calcolo margine di commessa in euro e in percentuale",
    "Costo totale del cantiere per voce di costo",
    "Punto di pareggio (break-even) con costi generali proporzionali",
    "Semaforo di lettura del risultato su tre fasce",
    "Composizione visiva dei costi del cantiere",
  ],
  audience: {
    "@type": "Audience",
    audienceType:
      "Imprese edili, ristrutturatori, impiantisti, serramentisti e general contractor che devono controllare la redditività dei cantieri",
  },
  publisher: {
    "@type": "Organization",
    name: "Edilizia in Cloud",
    url: SITE_URL,
  },
};

const faqLd = {
  "@context": "https://schema.org",
  "@type": "FAQPage",
  mainEntity: FAQ.map((f) => ({
    "@type": "Question",
    name: f.q,
    acceptedAnswer: { "@type": "Answer", text: f.a },
  })),
};

const webPageLd = {
  "@context": "https://schema.org",
  "@type": "WebPage",
  name: "Calcolatore margine di commessa",
  description:
    "Strumento gratuito per calcolare il margine reale di un cantiere: margine in euro, margine percentuale, break-even e lettura del risultato.",
  url: PAGE_URL,
  inLanguage: "it-IT",
  isPartOf: {
    "@type": "WebSite",
    url: SITE_URL,
    name: "Edilizia in Cloud",
  },
  about: { "@type": "Thing", name: "Margine di commessa in edilizia" },
};

/* ==================================================================== */
/* CAMPO INPUT                                                          */
/* ==================================================================== */

function CampoImporto({
  id,
  label,
  hint,
  value,
  onChange,
  suffix = "€",
  placeholder = "0",
}: {
  id: string;
  label: string;
  hint?: string;
  value: string;
  onChange: (v: string) => void;
  suffix?: string;
  placeholder?: string;
}) {
  return (
    <div>
      <label
        htmlFor={id}
        className="block text-sm font-bold text-[#111111]"
      >
        {label}
      </label>
      {hint && <p className="mt-0.5 text-xs text-slate-500">{hint}</p>}
      <div className="relative mt-2">
        <input
          id={id}
          name={id}
          type="text"
          inputMode="decimal"
          autoComplete="off"
          enterKeyHint="done"
          value={value}
          placeholder={placeholder}
          onChange={(e) => onChange(sanitize(e.target.value))}
          className="h-14 w-full rounded-xl border border-slate-300 bg-white pl-4 pr-12 text-lg font-semibold tabular-nums text-[#111111] shadow-sm outline-none transition-colors placeholder:font-normal placeholder:text-slate-300 focus:border-[#F97415] focus:ring-2 focus:ring-[#F97415]/30"
        />
        <span
          aria-hidden
          className="pointer-events-none absolute inset-y-0 right-4 flex items-center text-sm font-bold text-slate-400"
        >
          {suffix}
        </span>
      </div>
    </div>
  );
}

/* ==================================================================== */
/* PAGINA                                                               */
/* ==================================================================== */

export default function CalcolatoreMargineCommessa() {
  useSEO({
    title: "Calcolatore Margine di Commessa (gratis)",
    description:
      "Calcolatore gratuito del margine di commessa per imprese edili: contratto, materiali, ore, subappalti e costi generali → margine in €, in % e break-even.",
    canonical: `${PAGE_PATH}/`,
    keywords:
      "calcolatore margine di commessa, calcolo margine cantiere, margine commessa edilizia, redditività cantiere, break even cantiere, costi commessa edile, marginalità impresa edile, calcolo utile cantiere",
    ogImage: "https://www.ediliziaincloud.com/og/og-default.png",
  });

  const [form, setForm] = useState<FormState>({ ...ESEMPIO });
  const calcRef = useRef<HTMLElement>(null);
  const [stickyVisible, setStickyVisible] = useState(false);

  const set = useCallback(
    (k: keyof FormState) => (v: string) =>
      setForm((prev) => ({ ...prev, [k]: v })),
    [],
  );

  /* Sticky CTA mobile: nascosto finché il calcolatore è sotto gli occhi,
     così non copre i campi e il risultato mentre l'utente compila. */
  useEffect(() => {
    const node = calcRef.current;
    if (!node || typeof IntersectionObserver === "undefined") return;
    const observer = new IntersectionObserver(
      ([entry]) => setStickyVisible(!entry.isIntersecting),
      { threshold: 0 },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  const r = useMemo(
    () =>
      calcolaMargine({
        contratto: parseCosto(form.contratto),
        materiali: parseCosto(form.materiali),
        ore: parseCosto(form.ore),
        costoOrario: parseCosto(form.costoOrario),
        subappalti: parseCosto(form.subappalti),
        noli: parseCosto(form.noli),
        generaliPct: parseCosto(form.generaliPct),
        imprevisti: parseCosto(form.imprevisti),
      }),
    [form],
  );

  const voci = useMemo(
    () => [
      { label: "Materiali", value: parseCosto(form.materiali), color: "#F97415" },
      { label: "Manodopera", value: r.manodopera, color: "#C94F06" },
      { label: "Subappalti", value: parseCosto(form.subappalti), color: "#0f172a" },
      { label: "Noli e mezzi", value: parseCosto(form.noli), color: "#64748b" },
      { label: "Costi generali", value: r.generali, color: "#f59e0b" },
      { label: "Imprevisti", value: parseCosto(form.imprevisti), color: "#ef4444" },
    ],
    [form.materiali, form.subappalti, form.noli, form.imprevisti, r.manodopera, r.generali],
  );

  /* Testi e colori del semaforo */
  const semaforo = useMemo(() => {
    if (r.fascia === "neutro") {
      return {
        etichetta: "In attesa dei dati",
        dot: "bg-slate-400",
        accent: "text-slate-300",
        frase:
          "Inserisci l'importo del contratto per vedere il margine reale di questo cantiere.",
        Icona: Calculator,
      };
    }
    if (r.fascia === "verde") {
      return {
        etichetta: "Margine sano",
        dot: "bg-emerald-500",
        accent: "text-emerald-400",
        frase:
          "Questo cantiere ti sta facendo guadagnare. Hai un cuscinetto per reggere un imprevisto senza finire sotto: presidialo, non regalarlo in sconti dell'ultimo minuto.",
        Icona: TrendingUp,
      };
    }
    if (r.fascia === "giallo") {
      return {
        etichetta: "Margine sottile",
        dot: "bg-amber-500",
        accent: "text-amber-400",
        frase:
          "Guadagni, ma poco: bastano una squadra ferma tre giorni o un ritorno in cantiere per azzerare tutto. Da qui in avanti ogni ora extra non fatturata esce dal tuo utile.",
        Icona: AlertTriangle,
      };
    }
    return {
      etichetta:
        r.margineEuro < 0 ? "Cantiere in perdita" : "Zona di rischio",
      dot: "bg-red-500",
      accent: "text-red-400",
      frase:
        r.margineEuro < 0
          ? "Con questi numeri il cantiere chiude in perdita: stai finanziando tu il lavoro. Rivedi subito prezzo, varianti da riconoscere e voci di costo prima di andare avanti."
          : "Sotto l'8% il margine è più piccolo dell'errore di misurazione tipico di un cantiere. Un solo imprevisto e passi in perdita senza accorgertene.",
      Icona: TrendingDown,
    };
  }, [r.fascia, r.margineEuro]);

  const azzera = () => setForm({ ...VUOTO });
  const esempio = () => setForm({ ...ESEMPIO });

  const incidenzaCosti =
    r.costoTotale > 0 && parseCosto(form.contratto) > 0
      ? (r.costoTotale / parseCosto(form.contratto)) * 100
      : 0;

  return (
    <div className="min-h-screen overflow-x-hidden bg-white text-[#111111]">
      <JsonLd id="jsonld-breadcrumb-calc-margine" data={breadcrumbLd} />
      <JsonLd id="jsonld-webapp-calc-margine" data={webAppLd} />
      <JsonLd id="jsonld-faq-calc-margine" data={faqLd} />
      <JsonLd id="jsonld-webpage-calc-margine" data={webPageLd} />

      <LandingNavbar />

      {/* ══════════════════════════════════════════════════════════════ */}
      {/* HERO                                                           */}
      {/* ══════════════════════════════════════════════════════════════ */}
      <section
        aria-labelledby="hero-title"
        className="relative overflow-hidden bg-[#0b0b0b] pb-16 pt-28 sm:pt-36"
      >
        <div className="pointer-events-none absolute inset-0">
          <div
            className="absolute inset-0 opacity-[0.07]"
            style={{
              backgroundImage:
                "linear-gradient(rgba(255,255,255,0.5) 1px, transparent 1px), linear-gradient(to right, rgba(255,255,255,0.5) 1px, transparent 1px)",
              backgroundSize: "50px 50px",
            }}
          />
          <div className="absolute -left-24 top-10 h-72 w-72 rounded-full bg-[#F97415]/30 blur-3xl" />
          <div className="absolute -bottom-24 left-1/2 h-72 w-[36rem] -translate-x-1/2 rounded-full bg-orange-400/15 blur-3xl" />
        </div>

        <div className="relative mx-auto max-w-4xl px-4 text-center">
          <span className="inline-flex items-center gap-2 rounded-full border border-[#F97415]/40 bg-[#F97415]/15 px-4 py-1.5 text-[11px] font-bold uppercase tracking-[0.18em] text-[#F97415] backdrop-blur">
            <Sparkles className="h-3.5 w-3.5" />
            Strumento gratuito
          </span>

          <h1
            id="hero-title"
            className="mt-6 text-3xl font-black leading-tight text-white sm:text-5xl md:text-6xl"
          >
            Calcolatore{" "}
            <span className="bg-gradient-to-br from-orange-300 to-[#F97415] bg-clip-text text-transparent">
              margine di commessa
            </span>
          </h1>

          <p className="mx-auto mt-6 max-w-2xl text-base leading-relaxed text-white/75 sm:text-lg">
            Scopri se quel cantiere ti sta facendo guadagnare o perdere — prima
            di finirlo. Inserisci contratto, materiali, ore, subappalti e costi
            di struttura: in tempo reale vedi margine in euro, margine in
            percentuale e a quanto avresti dovuto venderlo per non rimetterci.
          </p>

          <ul className="mx-auto mt-7 flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-sm text-white/70">
            {[
              "Nessuna registrazione",
              "I dati restano sul tuo telefono",
              "Risultato in 30 secondi",
            ].map((p) => (
              <li key={p} className="inline-flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 text-emerald-400" />
                {p}
              </li>
            ))}
          </ul>

          <div className="mt-9">
            <a
              href="#calcolatore"
              className="group inline-flex min-h-[52px] items-center justify-center gap-2 rounded-2xl bg-[#F97415] px-8 py-4 text-base font-bold text-white shadow-[0_10px_30px_-10px_rgba(249,116,21,0.6)] transition-transform hover:-translate-y-0.5 hover:bg-[#e8650e] sm:text-lg"
            >
              Calcola il margine adesso
              <ArrowRight className="h-5 w-5 transition-transform group-hover:translate-x-0.5" />
            </a>
          </div>
        </div>
      </section>

      {/* ══════════════════════════════════════════════════════════════ */}
      {/* CALCOLATORE                                                    */}
      {/* ══════════════════════════════════════════════════════════════ */}
      <section
        id="calcolatore"
        ref={calcRef}
        aria-labelledby="calcolatore-title"
        className="scroll-mt-24 bg-slate-50 px-4 py-12 sm:py-16"
      >
        <div className="mx-auto max-w-5xl">
          <div className="mx-auto max-w-2xl text-center">
            <h2
              id="calcolatore-title"
              className="text-2xl font-black text-[#111111] sm:text-3xl"
            >
              Metti i numeri del tuo cantiere
            </h2>
            <p className="mt-3 text-sm leading-relaxed text-slate-600 sm:text-base">
              Puoi scrivere gli importi come li scrivi normalmente: 12.500 o
              12500 o 1.234,56. Il risultato si aggiorna mentre digiti.
            </p>
          </div>

          {/* Barra risultato sempre visibile su mobile mentre si compila */}
          <div className="sticky top-[64px] z-30 -mx-4 mt-8 border-y border-slate-200 bg-white/95 px-4 py-3 backdrop-blur lg:hidden">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <span
                  className={`h-2.5 w-2.5 shrink-0 rounded-full ${semaforo.dot}`}
                  aria-hidden
                />
                <span className="text-xs font-bold uppercase tracking-wider text-slate-500">
                  Margine
                </span>
              </div>
              <div className="flex items-baseline gap-3">
                <span className="text-lg font-black tabular-nums text-[#111111]">
                  {euro(r.margineEuro)}
                </span>
                <span className="text-sm font-bold tabular-nums text-[#F97415]">
                  {perc(r.marginePct)}
                </span>
              </div>
            </div>
          </div>

          <div className="mt-6 grid gap-6 lg:mt-10 lg:grid-cols-[1fr_380px] lg:items-start">
            {/* ─── FORM ─────────────────────────────────────────────── */}
            <form
              onSubmit={(e) => e.preventDefault()}
              className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:p-7"
            >
              <fieldset className="space-y-5">
                <legend className="sr-only">Dati del cantiere</legend>

                <CampoImporto
                  id="contratto"
                  label="Importo contratto"
                  hint="Quanto incassi dal cliente, IVA esclusa (comprese le varianti già approvate)."
                  value={form.contratto}
                  onChange={set("contratto")}
                />

                <div className="h-px bg-slate-100" />

                <CampoImporto
                  id="materiali"
                  label="Costo materiali"
                  hint="Tutto ciò che arriva in cantiere: forniture, magazzino prelevato, trasporti."
                  value={form.materiali}
                  onChange={set("materiali")}
                />

                <div className="grid gap-4 sm:grid-cols-2">
                  <CampoImporto
                    id="ore"
                    label="Ore manodopera"
                    hint="Ore totali delle tue squadre su questo cantiere."
                    value={form.ore}
                    onChange={set("ore")}
                    suffix="h"
                  />
                  <CampoImporto
                    id="costo-orario"
                    label="Costo orario"
                    hint="Costo aziendale reale, non la paga netta."
                    value={form.costoOrario}
                    onChange={set("costoOrario")}
                    suffix="€/h"
                  />
                </div>

                <div className="rounded-xl bg-slate-50 px-4 py-3 text-sm text-slate-600 ring-1 ring-slate-200">
                  Costo manodopera calcolato:{" "}
                  <strong className="font-bold tabular-nums text-[#111111]">
                    {euro(r.manodopera)}
                  </strong>
                </div>

                <CampoImporto
                  id="subappalti"
                  label="Subappalti"
                  hint="Importo affidato a terzi: imprese, artigiani, posatori esterni."
                  value={form.subappalti}
                  onChange={set("subappalti")}
                />

                <CampoImporto
                  id="noli"
                  label="Noli e mezzi"
                  hint="Ponteggi, gru, piattaforme, escavatori, furgoni imputati al cantiere."
                  value={form.noli}
                  onChange={set("noli")}
                />

                <CampoImporto
                  id="generali-pct"
                  label="Costi generali e indiretti"
                  hint="Quota di struttura assorbita da questo cantiere (ufficio, amministrazione, assicurazioni, titolare). Percentuale sull'importo del contratto."
                  value={form.generaliPct}
                  onChange={set("generaliPct")}
                  suffix="%"
                  placeholder="8"
                />

                <div className="rounded-xl bg-slate-50 px-4 py-3 text-sm text-slate-600 ring-1 ring-slate-200">
                  Costi generali sul cantiere:{" "}
                  <strong className="font-bold tabular-nums text-[#111111]">
                    {euro(r.generali)}
                  </strong>
                </div>

                <CampoImporto
                  id="imprevisti"
                  label="Imprevisti e varianti non fatturate"
                  hint="Lavoro in più fatto e mai messo in conto al cliente. È la voce più dimenticata: mettila, anche a stima."
                  value={form.imprevisti}
                  onChange={set("imprevisti")}
                />
              </fieldset>

              <div className="mt-7 flex flex-col gap-3 sm:flex-row">
                <button
                  type="button"
                  onClick={azzera}
                  className="inline-flex min-h-[48px] flex-1 items-center justify-center gap-2 rounded-xl border border-slate-300 bg-white px-5 py-3 text-sm font-bold text-slate-700 transition-colors hover:border-slate-400 hover:bg-slate-50"
                >
                  <RotateCcw className="h-4 w-4" />
                  Azzera
                </button>
                <button
                  type="button"
                  onClick={esempio}
                  className="inline-flex min-h-[48px] flex-1 items-center justify-center gap-2 rounded-xl border border-[#F97415]/30 bg-[#F97415]/10 px-5 py-3 text-sm font-bold text-[#C94F06] transition-colors hover:bg-[#F97415]/15"
                >
                  <Calculator className="h-4 w-4" />
                  Ricarica esempio
                </button>
              </div>
            </form>

            {/* ─── RISULTATO ────────────────────────────────────────── */}
            <div className="lg:sticky lg:top-24">
              <div className="overflow-hidden rounded-3xl bg-gradient-to-br from-slate-900 via-slate-800 to-[#0f172a] p-6 text-white shadow-xl">
                <div className="flex items-center gap-2">
                  <span
                    className={`h-2.5 w-2.5 rounded-full ${semaforo.dot}`}
                    aria-hidden
                  />
                  <span className="text-[11px] font-bold uppercase tracking-[0.18em] text-white/60">
                    {semaforo.etichetta}
                  </span>
                </div>

                <div className="mt-4">
                  <div className="text-xs font-semibold uppercase tracking-wider text-orange-300">
                    Margine di commessa
                  </div>
                  <div
                    className="mt-1 text-4xl font-black tabular-nums sm:text-5xl"
                    aria-live="polite"
                  >
                    {euro(r.margineEuro)}
                  </div>
                  <div className="mt-1 flex items-center gap-2">
                    <semaforo.Icona className={`h-4 w-4 ${semaforo.accent}`} />
                    <span className={`text-xl font-black tabular-nums ${semaforo.accent}`}>
                      {perc(r.marginePct)}
                    </span>
                    <span className="text-xs text-white/50">sul contratto</span>
                  </div>
                </div>

                <div className="mt-5 space-y-2 border-t border-white/10 pt-4 text-sm">
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-white/70">Costo totale cantiere</span>
                    <span className="font-bold tabular-nums">{euro(r.costoTotale)}</span>
                  </div>
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-white/70">Incidenza costi</span>
                    <span className="font-bold tabular-nums">{perc(incidenzaCosti)}</span>
                  </div>
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-white/70">Break-even</span>
                    <span className="font-bold tabular-nums">{euro(r.breakEven)}</span>
                  </div>
                </div>

                <p className="mt-4 rounded-xl bg-white/5 p-3 text-xs leading-relaxed text-white/70 ring-1 ring-white/10">
                  <strong className="font-bold text-white">Break-even:</strong>{" "}
                  è l'importo minimo a cui questo cantiere andava venduto per
                  non rimetterci. Sotto quella cifra lavori in perdita.
                </p>

                <p className="mt-4 text-sm leading-relaxed text-white/85">
                  {semaforo.frase}
                </p>
              </div>

              {/* ─── COMPOSIZIONE COSTI ───────────────────────────── */}
              <div className="mt-5 rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
                <h3 className="text-sm font-black uppercase tracking-wider text-slate-500">
                  Composizione dei costi
                </h3>

                <div
                  className="mt-4 flex h-4 w-full overflow-hidden rounded-full bg-slate-100"
                  role="img"
                  aria-label={`Composizione dei costi del cantiere, costo totale ${euro(r.costoTotale)}`}
                >
                  {r.costoTotale > 0 &&
                    voci.map((v) => (
                      <div
                        key={v.label}
                        className="h-full"
                        style={{
                          width: `${(v.value / r.costoTotale) * 100}%`,
                          backgroundColor: v.color,
                        }}
                      />
                    ))}
                </div>

                <ul className="mt-4 space-y-2">
                  {voci.map((v) => (
                    <li
                      key={v.label}
                      className="flex items-center justify-between gap-3 text-sm"
                    >
                      <span className="flex min-w-0 items-center gap-2">
                        <span
                          className="h-2.5 w-2.5 shrink-0 rounded-full"
                          style={{ backgroundColor: v.color }}
                          aria-hidden
                        />
                        <span className="truncate text-slate-600">{v.label}</span>
                      </span>
                      <span className="shrink-0 font-semibold tabular-nums text-[#111111]">
                        {euro(v.value)}
                        <span className="ml-2 text-xs font-normal text-slate-400">
                          {r.costoTotale > 0
                            ? `${Math.round((v.value / r.costoTotale) * 100)}%`
                            : "0%"}
                        </span>
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </div>

          <p className="mx-auto mt-8 max-w-3xl text-center text-xs leading-relaxed text-slate-500">
            Il calcolo avviene interamente nel tuo browser: nessun dato viene
            inviato o salvato. Il risultato è una stima basata sui valori che
            inserisci e non sostituisce la contabilità di cantiere.
          </p>
        </div>
      </section>

      {/* ══════════════════════════════════════════════════════════════ */}
      {/* COME SI LEGGE IL RISULTATO                                     */}
      {/* ══════════════════════════════════════════════════════════════ */}
      <section
        aria-labelledby="lettura-title"
        className="bg-white px-4 py-16 sm:py-20"
      >
        <div className="mx-auto max-w-5xl">
          <div className="mx-auto max-w-2xl text-center">
            <span className="text-[11px] font-bold uppercase tracking-[0.18em] text-[#F97415]">
              Come si legge il risultato
            </span>
            <h2
              id="lettura-title"
              className="mt-3 text-2xl font-black text-[#111111] sm:text-3xl md:text-4xl"
            >
              Tre fasce, tre decisioni diverse.
            </h2>
            <p className="mt-4 text-sm leading-relaxed text-slate-600 sm:text-base">
              La percentuale da sola non dice niente: quello che conta è cosa
              fai il giorno dopo averla letta. Queste sono soglie di lettura
              pratica, non regole contabili — vanno tarate sulla tua
              lavorazione e sul tuo rischio.
            </p>
          </div>

          <div className="mt-12 grid gap-5 sm:grid-cols-3">
            {FASCE.map((f) => (
              <div
                key={f.key}
                className={`rounded-2xl p-6 ring-1 ${f.bg} ${f.ring}`}
              >
                <span className={`inline-block h-3 w-3 rounded-full ${f.dot}`} aria-hidden />
                <h3 className="mt-3 text-base font-black text-[#111111]">
                  {f.titolo}
                </h3>
                <p className="mt-2 text-sm leading-relaxed text-slate-700">
                  {f.testo}
                </p>
              </div>
            ))}
          </div>

          <div className="mt-8 rounded-2xl border border-slate-200 bg-slate-50 p-6">
            <h3 className="text-base font-black text-[#111111]">
              Margine non è ricarico (e qui si perdono più soldi che altrove)
            </h3>
            <p className="mt-2 text-sm leading-relaxed text-slate-600">
              Il margine si calcola sul prezzo di vendita, il ricarico sul
              costo. Se aggiungi il 20% al costo non hai un margine del 20%: ne
              hai circa il 16,7%. Su un cantiere da 85.000 € sono migliaia di
              euro che credevi di avere e non hai. Questo calcolatore ragiona
              sempre sul venduto.
            </p>
          </div>
        </div>
      </section>

      {/* ══════════════════════════════════════════════════════════════ */}
      {/* COSTI DIMENTICATI                                              */}
      {/* ══════════════════════════════════════════════════════════════ */}
      <section
        aria-labelledby="costi-title"
        className="bg-slate-50 px-4 py-16 sm:py-20"
      >
        <div className="mx-auto max-w-5xl">
          <div className="mx-auto max-w-2xl text-center">
            <span className="text-[11px] font-bold uppercase tracking-[0.18em] text-[#F97415]">
              Il buco nero del margine
            </span>
            <h2
              id="costi-title"
              className="mt-3 text-2xl font-black text-[#111111] sm:text-3xl md:text-4xl"
            >
              I costi che le imprese dimenticano di mettere in commessa.
            </h2>
            <p className="mt-4 text-sm leading-relaxed text-slate-600 sm:text-base">
              Quasi nessun cantiere va male per il prezzo sbagliato. Va male per
              i costi che nessuno ha mai attribuito a quella commessa. Se il
              risultato qui sopra ti è sembrato buono, rileggilo dopo aver
              aggiunto queste voci.
            </p>
          </div>

          <div className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {COSTI_DIMENTICATI.map(({ icon: Icona, titolo, testo }) => (
              <div
                key={titolo}
                className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm"
              >
                <span className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-[#F97415]/10 text-[#F97415]">
                  <Icona className="h-5 w-5" />
                </span>
                <h3 className="mt-4 text-base font-bold text-[#111111]">
                  {titolo}
                </h3>
                <p className="mt-2 text-sm leading-relaxed text-slate-600">
                  {testo}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ══════════════════════════════════════════════════════════════ */}
      {/* MARGINE A CANTIERE APERTO                                      */}
      {/* ══════════════════════════════════════════════════════════════ */}
      <section
        aria-labelledby="tempo-title"
        className="bg-white px-4 py-16 sm:py-20"
      >
        <div className="mx-auto max-w-4xl">
          <div className="mx-auto max-w-2xl text-center">
            <span className="text-[11px] font-bold uppercase tracking-[0.18em] text-[#F97415]">
              Il momento giusto
            </span>
            <h2
              id="tempo-title"
              className="mt-3 text-2xl font-black text-[#111111] sm:text-3xl md:text-4xl"
            >
              Il margine va guardato mentre il cantiere è aperto, non a
              consuntivo.
            </h2>
          </div>

          <div className="mt-10 space-y-5">
            {[
              {
                icon: Eye,
                titolo: "A consuntivo il numero è vero ma inutile",
                testo:
                  "Quando chiudi il cantiere e scopri che hai fatto il 4%, non puoi più fare niente: i materiali sono comprati, le ore sono state pagate, la variante non la riconosce più nessuno. Sai solo di aver perso, e lo sai tardi.",
              },
              {
                icon: Clock,
                titolo: "Al 30% di avanzamento hai ancora tutte le leve",
                testo:
                  "Se a un terzo del lavoro vedi che i costi corrono più dell'avanzamento, puoi ancora rinegoziare una variante, cambiare fornitore, spostare una squadra, rivedere una lavorazione. Un punto di margine recuperato lì vale dieci volte lo stesso punto scoperto alla fine.",
              },
              {
                icon: AlertTriangle,
                titolo: "Un cantiere che scivola trascina anche gli altri",
                testo:
                  "Le ore che regali su un lavoro sono ore tolte a un altro, i soldi che non incassi diventano fornitori pagati in ritardo. Il margine per commessa, aggiornato, è il primo segnale d'allarme che hai a disposizione.",
              },
              {
                icon: TrendingUp,
                titolo: "Il preventivo successivo nasce da qui",
                testo:
                  "Sapere che su quel tipo di lavorazione chiudi mediamente al 9% e non al 20% ti cambia il prossimo preventivo. Senza il dato storico per commessa, ogni preventivo è un'ipotesi ripetuta.",
              },
            ].map(({ icon: Icona, titolo, testo }) => (
              <div
                key={titolo}
                className="flex gap-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6"
              >
                <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#111111] text-white">
                  <Icona className="h-5 w-5" />
                </span>
                <div>
                  <h3 className="text-base font-bold text-[#111111]">{titolo}</h3>
                  <p className="mt-1.5 text-sm leading-relaxed text-slate-600">
                    {testo}
                  </p>
                </div>
              </div>
            ))}
          </div>

          {/* CTA intermedia */}
          <div className="mt-12 overflow-hidden rounded-3xl bg-[#0b0b0b] p-7 text-center text-white sm:p-10">
            <h3 className="text-xl font-black sm:text-3xl">
              Questo calcolo su ogni cantiere, in automatico.
            </h3>
            <p className="mx-auto mt-4 max-w-2xl text-sm leading-relaxed text-white/75 sm:text-base">
              Qui lo fai a mano, per un cantiere, con i numeri che ti ricordi.
              Dentro Edilizia in Cloud il margine si aggiorna da solo mentre
              lavori: ore timbrate, materiali usciti dal magazzino, fatture
              fornitore e subappalti finiscono in commessa senza che nessuno
              riapra un foglio Excel.
            </p>
            <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
              <Link
                to="/funzionalita/margini-cantiere/"
                className="group inline-flex min-h-[52px] w-full items-center justify-center gap-2 rounded-2xl bg-[#F97415] px-8 py-4 text-base font-bold text-white transition-transform hover:-translate-y-0.5 hover:bg-[#e8650e] sm:w-auto"
              >
                Vedi il margine di cantiere in tempo reale
                <ArrowRight className="h-5 w-5 transition-transform group-hover:translate-x-0.5" />
              </Link>
              <Link
                to="/demo/"
                className="inline-flex min-h-[52px] w-full items-center justify-center gap-2 rounded-2xl border border-white/25 bg-white/5 px-8 py-4 text-base font-semibold text-white backdrop-blur transition-colors hover:bg-white/10 sm:w-auto"
              >
                Prova gratis 31 giorni
              </Link>
            </div>
            <p className="mt-5 text-xs text-white/55">
              Piano gratuito per partire · 31 giorni di prova completa ·
              Consulenza gratuita per capire cosa ti serve davvero
            </p>
          </div>
        </div>
      </section>

      {/* ══════════════════════════════════════════════════════════════ */}
      {/* FAQ                                                            */}
      {/* ══════════════════════════════════════════════════════════════ */}
      <section
        id="faq"
        aria-labelledby="faq-title"
        className="bg-slate-50 px-4 py-16 sm:py-20"
      >
        <div className="mx-auto max-w-3xl">
          <div className="mx-auto max-w-2xl text-center">
            <span className="text-[11px] font-bold uppercase tracking-[0.18em] text-[#F97415]">
              Domande frequenti
            </span>
            <h2
              id="faq-title"
              className="mt-3 text-2xl font-black text-[#111111] sm:text-3xl md:text-4xl"
            >
              Margine di commessa: quello che chiedono tutti.
            </h2>
          </div>

          <div className="mt-12 divide-y divide-slate-200 rounded-3xl border border-slate-200 bg-white shadow-sm">
            {FAQ.map((f) => (
              <details key={f.q} className="group p-6">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-4 text-base font-bold text-[#111111]">
                  <span>{f.q}</span>
                  <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-orange-100 text-lg font-light text-[#F97415] transition-transform group-open:rotate-45">
                    +
                  </span>
                </summary>
                <p className="mt-4 text-sm leading-relaxed text-slate-600">
                  {f.a}
                </p>
              </details>
            ))}
          </div>
        </div>
      </section>

      {/* ══════════════════════════════════════════════════════════════ */}
      {/* LINK INTERNI                                                   */}
      {/* ══════════════════════════════════════════════════════════════ */}
      <section
        aria-labelledby="link-title"
        className="bg-white px-4 py-16 sm:py-20"
      >
        <div className="mx-auto max-w-5xl">
          <div className="mx-auto max-w-2xl text-center">
            <span className="text-[11px] font-bold uppercase tracking-[0.18em] text-[#F97415]">
              Continua da qui
            </span>
            <h2
              id="link-title"
              className="mt-3 text-2xl font-black text-[#111111] sm:text-3xl"
            >
              Dal calcolo a mano al controllo continuo.
            </h2>
          </div>

          <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {[
              {
                to: "/funzionalita/margini-cantiere/",
                title: "Margini di cantiere",
                text: "Margine per commessa aggiornato in tempo reale, preventivo contro consuntivo.",
              },
              {
                to: "/funzionalita/gestione-commesse/",
                title: "Gestione commesse",
                text: "Ogni costo attribuito al cantiere giusto, dalla firma al collaudo.",
              },
              {
                to: "/funzionalita/computo-metrico/",
                title: "Computo metrico",
                text: "Quantità e prezzi che diventano il budget di partenza della commessa.",
              },
              {
                to: "/funzionalita/preventivi-edilizia/",
                title: "Preventivi edilizia",
                text: "Preventivi con margine calcolato prima di mandarli, non dopo.",
              },
              {
                to: "/funzionalita/contabilita-lavori/",
                title: "Contabilità lavori",
                text: "SAL, stati avanzamento e ritenute a garanzia sotto controllo.",
              },
              {
                to: "/funzionalita/rapportini-cantiere/",
                title: "Rapportini di cantiere",
                text: "Le ore reali delle squadre che alimentano il costo della commessa.",
              },
            ].map((l) => (
              <Link
                key={l.to}
                to={l.to}
                className="group flex h-full flex-col rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition-all hover:-translate-y-0.5 hover:border-[#F97415]/40 hover:shadow-md"
              >
                <h3 className="text-sm font-bold text-[#111111] group-hover:text-[#F97415]">
                  {l.title}
                </h3>
                <p className="mt-1.5 flex-1 text-xs leading-relaxed text-slate-600">
                  {l.text}
                </p>
                <span className="mt-3 inline-flex items-center gap-1 text-xs font-bold text-[#F97415]">
                  Apri <ArrowRight className="h-3 w-3" />
                </span>
              </Link>
            ))}
          </div>
        </div>
      </section>

      {/* ══════════════════════════════════════════════════════════════ */}
      {/* CTA FINALE                                                     */}
      {/* ══════════════════════════════════════════════════════════════ */}
      <section className="relative overflow-hidden bg-[#0b0b0b] px-4 py-20 text-center text-white sm:py-24">
        <div className="pointer-events-none absolute inset-0">
          <div className="absolute -left-32 top-0 h-96 w-96 rounded-full bg-[#F97415]/25 blur-3xl" />
          <div className="absolute -right-32 bottom-0 h-96 w-96 rounded-full bg-orange-400/20 blur-3xl" />
        </div>
        <div className="relative mx-auto max-w-3xl">
          <h2 className="text-2xl font-black sm:text-3xl md:text-5xl">
            Smetti di scoprire il margine quando il cantiere è già chiuso.
          </h2>
          <p className="mx-auto mt-5 max-w-2xl text-base leading-relaxed text-white/80 sm:text-lg">
            Parti dal piano gratuito o prova la piattaforma completa per 31
            giorni: commesse, costi, ore, fornitori e margine in un posto solo.
            Se vuoi capire prima se fa per te, la consulenza iniziale è gratuita
            e finisce con un preventivo su misura per la tua impresa.
          </p>
          <div className="mt-10 flex flex-col items-center justify-center gap-4 sm:flex-row">
            <Link
              to="/demo/"
              className="group inline-flex min-h-[56px] w-full items-center justify-center gap-2 rounded-2xl bg-[#F97415] px-10 py-4 text-base font-bold text-white shadow-[0_20px_40px_-10px_rgba(249,116,21,0.6)] transition-transform hover:-translate-y-0.5 hover:bg-[#e8650e] sm:w-auto sm:text-lg"
            >
              Prova gratis 31 giorni
              <ArrowRight className="h-5 w-5 transition-transform group-hover:translate-x-0.5" />
            </Link>
            <Link
              to="/funzionalita/margini-cantiere/"
              className="inline-flex min-h-[56px] w-full items-center justify-center gap-2 rounded-2xl border border-white/25 bg-white/5 px-10 py-4 text-base font-semibold text-white backdrop-blur transition-colors hover:bg-white/10 sm:w-auto sm:text-lg"
            >
              Come funziona sui cantieri
            </Link>
          </div>
          <p className="mt-5 text-xs text-white/55">
            Piano gratuito disponibile · Nessuna carta per iniziare la prova ·
            Onboarding 1-a-1 incluso
          </p>
        </div>
      </section>

      <LandingFooter />

      {/* Sticky mobile CTA — compare solo quando il calcolatore non è a schermo */}
      <div
        className={`fixed inset-x-3 bottom-3 z-40 transition-opacity duration-300 lg:hidden ${
          stickyVisible ? "opacity-100" : "pointer-events-none opacity-0"
        }`}
      >
        <a
          href="#calcolatore"
          className="flex min-h-[56px] items-center justify-between gap-3 rounded-2xl bg-[#F97415] px-5 py-3.5 text-white shadow-2xl ring-1 ring-orange-300/50"
        >
          <div>
            <div className="text-sm font-black leading-tight">
              Calcola il margine del tuo cantiere
            </div>
            <div className="text-[10px] text-white/85">
              Gratis · Senza registrazione
            </div>
          </div>
          <ArrowRight className="h-5 w-5 shrink-0" />
        </a>
      </div>

      <noscript>
        <div style={{ padding: "2rem", textAlign: "center", fontFamily: "sans-serif" }}>
          <h2>Calcolatore margine di commessa · Edilizia in Cloud</h2>
          <p>
            Il calcolatore del margine di commessa richiede JavaScript. La
            formula è: margine = importo contratto − (materiali + ore ×
            costo orario + subappalti + noli + costi generali + imprevisti).
          </p>
          <p>
            <a href="/funzionalita/margini-cantiere/">
              Scopri il controllo del margine di cantiere in Edilizia in Cloud
            </a>
          </p>
        </div>
      </noscript>
    </div>
  );
}
