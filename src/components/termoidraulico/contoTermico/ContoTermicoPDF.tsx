/**
 * Il preventivo Conto Termico 3.0: lo stesso racconto del preventivo
 * fotovoltaico (copertina blu, numeri grandi, risparmio e cassa negli anni),
 * scritto per chi sostituisce il riscaldamento e riceve il contributo del GSE.
 *
 * È un PDF vero (react-pdf) e non una pagina da stampare: così si scarica, si
 * allega e si firma online come gli altri preventivi dei moduli. Usa solo i
 * caratteri incorporati (Helvetica): niente «−», «→», «✓», che spariscono.
 *
 * I numeri arrivano tutti da calcolaContoTermico: una pagina non può dire una
 * cifra e la successiva un'altra.
 */
import {
  Circle, Defs, Document, G, Image, Line, LinearGradient, Page, Path, RadialGradient, Rect, Stop, Svg, Text, View,
} from "@react-pdf/renderer";
import { IconaPdf } from "@/components/preventivi/pdf/IconaPdf";
import type { NomeIcona } from "../../../../supabase/functions/_shared/iconePreventivo";
import { mescola, normalizzaHex, scurisci } from "../../../../supabase/functions/_shared/temaColori";
import { anniTesto, calcolaContoTermico, euro, type ContoTermicoEconomia, type ContoTermicoRisultato } from "@/lib/contoTermico/calcoli";
import { CONTO_TERMICO, INTERVENTI_CONTO_TERMICO, type InterventoContoTermico } from "@/lib/contoTermico/regole";
import {
  DOCUMENTI_CONTO_TERMICO, FAQ_CONTO_TERMICO, PASSAGGI_CONTO_TERMICO, VANTAGGI_CONTO_TERMICO,
  type DomandaRisposta, type Passaggio, type Vantaggio,
} from "@/lib/contoTermico/testi";

/** Le foto del documento: una per posto. Senza foto, il posto si chiude. */
export type FotoContoTermico =
  | "copertina" | "cosaVuolDire" | "oggi" | "domani" | "interno" | "dettaglio" | "incentivo" | "installazione" | "comfort" | "passaggi" | "domande" | "decisione";

export interface ContoTermicoPdfData {
  azienda: {
    nome: string;
    logoUrl?: string | null;
    telefono?: string | null;
    email?: string | null;
    sito?: string | null;
    piva?: string | null;
  };
  cliente: { nome: string; indirizzo?: string | null };
  preventivo: { codice: string; dataIso: string; validitaGiorni: number; consulente?: string | null };
  intervento: {
    tipo: InterventoContoTermico;
    /** Cosa si installa: «Pompa di calore aria-acqua 8 kW». */
    titolo: string;
    /** Cosa si toglie: «Caldaia a gas del 2008». */
    impiantoAttuale: string;
    voci: { descrizione: string; quantita?: number | null; unita?: string | null }[];
    /** La scheda tecnica del modello proposto: «Potenza termica» → «8 kW». */
    caratteristiche?: { etichetta: string; valore: string }[];
  };
  economia: ContoTermicoEconomia;
  testi?: {
    titoloCopertina?: string | null;
    sottotitoloCopertina?: string | null;
    faq?: DomandaRisposta[] | null;
    passaggi?: Passaggio[] | null;
    vantaggi?: Vantaggio[] | null;
  };
  foto?: Partial<Record<FotoContoTermico, string | null>>;
  /** Il colore dell'azienda al posto del blu, se c'è. */
  colorePrimario?: string | null;
}

// ─── Colori: quelli del preventivo fotovoltaico ─────────────────────────────
const BASE = {
  arancio: "#F97316", arancioScuro: "#C2410C", ambra: "#FBBF24", arancioTenue: "#FFF7ED", arancioBordo: "#FED7AA",
  verde: "#16A34A", verdeScuro: "#15803D", verdeTenue: "#ECFDF3", verdeBordo: "#BBF7D0",
  rosso: "#DC2626", rossoTenue: "#FEF2F2", rossoBordo: "#FECACA",
  bluTenue: "#EFF6FF", bluBordo: "#BFDBFE", blu: "#1D4ED8",
  ink: "#0F172A", testo: "#334155", grigio: "#64748B", grigioChiaro: "#94A3B8", linea: "#E2E8F0", fondo: "#F8FAFC",
};

function palette(primario?: string | null) {
  const navy = normalizzaHex(primario) ?? "#1E3A5F";
  return {
    ...BASE,
    navy,
    navyScuro: scurisci(navy, 0.45),
    navyChiaro: mescola(navy, "#FFFFFF", 0.14),
    vetro: mescola(navy, "#FFFFFF", 0.09),
    vetroBordo: mescola(navy, "#FFFFFF", 0.22),
  };
}
type Palette = ReturnType<typeof palette>;

const W = 595.28;
const H = 841.89;
const MARGINE = 46;
const LARGHEZZA = W - MARGINE * 2;

/**
 * Con i caratteri incorporati react-pdf misura il simbolo € come uno spazio,
 * metà della sua larghezza vera: il simbolo si mangia lo spazio dopo («92 €al
 * mese») ed esce dai riquadri. Nel PDF lo segue uno spazio fisso che copre la
 * metà mancante.
 */
const PDF_EURO = "€\u00A0";
const soldi = (n: number) => euro(n).replace(/€$/, PDF_EURO);
const conEuro = (testo: string) => testo.replace(/€(?!\u00A0)/g, PDF_EURO);

const dataLunga = (iso: string) => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "" : d.toLocaleDateString("it-IT", { day: "numeric", month: "long", year: "numeric" });
};

// ─── Pezzi comuni ───────────────────────────────────────────────────────────
function Testata({ d, c }: { d: ContoTermicoPdfData; c: Palette }) {
  return (
    <View fixed style={{ position: "absolute", top: 0, left: 0, right: 0, paddingHorizontal: MARGINE, paddingTop: 22, paddingBottom: 9, flexDirection: "row", alignItems: "center", justifyContent: "space-between", borderBottomWidth: 1, borderBottomColor: BASE.linea }}>
      <View style={{ flexDirection: "row", alignItems: "center" }}>
        {d.azienda.logoUrl ? (
          <Image src={d.azienda.logoUrl} style={{ height: 16, maxWidth: 90, objectFit: "contain", marginRight: 6 }} />
        ) : (
          <View style={{ width: 14, height: 14, borderRadius: 3, backgroundColor: BASE.arancio, marginRight: 6, alignItems: "center", justifyContent: "center" }}>
            <IconaPdf nome="temperatura" colore="#FFFFFF" lato={9} />
          </View>
        )}
        <Text style={{ fontFamily: "Helvetica-Bold", fontSize: 8.5, color: c.navy }}>{d.azienda.nome}</Text>
      </View>
      <Text style={{ fontSize: 7, color: BASE.grigio }}>
        {"Preventivo "}<Text style={{ fontFamily: "Helvetica-Bold", color: c.navy }}>{d.preventivo.codice}</Text>{` · ${d.cliente.nome}`}
      </Text>
    </View>
  );
}

function PiePagina({ d }: { d: ContoTermicoPdfData }) {
  const contatti = [d.azienda.nome, d.azienda.sito, d.azienda.telefono].filter(Boolean).join(" · ");
  return (
    <View fixed style={{ position: "absolute", bottom: 0, left: 0, right: 0, paddingHorizontal: MARGINE, paddingTop: 8, paddingBottom: 18, flexDirection: "row", justifyContent: "space-between", borderTopWidth: 1, borderTopColor: BASE.linea }}>
      <Text style={{ fontSize: 6.5, color: BASE.grigioChiaro }}>{contatti}</Text>
      <Text style={{ fontSize: 6.5, color: BASE.grigio, fontFamily: "Helvetica-Bold" }} render={({ pageNumber, totalPages }) => `${pageNumber} / ${totalPages}`} />
    </View>
  );
}

function Pagina({ d, c, children }: { d: ContoTermicoPdfData; c: Palette; children: React.ReactNode }) {
  return (
    <Page size="A4" style={{ fontFamily: "Helvetica", fontSize: 9, color: BASE.testo, paddingTop: 64, paddingBottom: 54, paddingHorizontal: MARGINE, backgroundColor: "#FFFFFF" }}>
      <Testata d={d} c={c} />
      {children}
      <PiePagina d={d} />
    </Page>
  );
}

/** Occhiello, titolo con la parte in arancio, sottotitolo. */
function Intestazione({ c, occhiello, titolo, evidenza, sottotitolo }: { c: Palette; occhiello: string; titolo: string; evidenza?: string; sottotitolo?: string }) {
  return (
    <View style={{ marginBottom: 16 }}>
      <Text style={{ fontFamily: "Helvetica-Bold", fontSize: 7, letterSpacing: 1.4, color: BASE.arancio, marginBottom: 7 }}>{occhiello.toUpperCase()}</Text>
      <Text style={{ fontFamily: "Helvetica-Bold", fontSize: 27, lineHeight: 1.1, letterSpacing: -0.9, color: c.navy }}>
        {titolo}{evidenza ? <Text style={{ color: BASE.arancio }}>{evidenza}</Text> : null}
      </Text>
      {sottotitolo ? <Text style={{ fontSize: 9.5, lineHeight: 1.45, color: BASE.grigio, marginTop: 8, maxWidth: 440 }}>{sottotitolo}</Text> : null}
    </View>
  );
}

type Tono = "verde" | "arancio" | "blu" | "neutro" | "rosso";
const TONI: Record<Tono, { fondo: string; bordo: string; valore: string; etichetta: string }> = {
  verde: { fondo: BASE.verdeTenue, bordo: BASE.verdeBordo, valore: BASE.verdeScuro, etichetta: BASE.verdeScuro },
  arancio: { fondo: BASE.arancioTenue, bordo: BASE.arancioBordo, valore: BASE.arancioScuro, etichetta: BASE.arancioScuro },
  blu: { fondo: BASE.bluTenue, bordo: BASE.bluBordo, valore: BASE.blu, etichetta: BASE.blu },
  neutro: { fondo: BASE.fondo, bordo: BASE.linea, valore: BASE.ink, etichetta: BASE.grigio },
  rosso: { fondo: BASE.rossoTenue, bordo: BASE.rossoBordo, valore: BASE.rosso, etichetta: BASE.rosso },
};

function Kpi({ etichetta, valore, nota, tono = "neutro", grande = false, ultimo = false }: { etichetta: string; valore: string; nota?: string; tono?: Tono; grande?: boolean; ultimo?: boolean }) {
  const t = TONI[tono];
  return (
    <View style={{ flex: 1, backgroundColor: t.fondo, borderWidth: 1, borderColor: t.bordo, borderRadius: 8, paddingVertical: 10, paddingHorizontal: 11, marginRight: ultimo ? 0 : 8 }}>
      <Text style={{ fontFamily: "Helvetica-Bold", fontSize: 6.5, letterSpacing: 1, color: t.etichetta }}>{etichetta.toUpperCase()}</Text>
      <Text style={{ fontFamily: "Helvetica-Bold", fontSize: grande ? 24 : 18, letterSpacing: -0.6, color: t.valore, marginTop: 5 }}>{valore}</Text>
      {nota ? <Text style={{ fontSize: 7, color: BASE.grigio, marginTop: 3, lineHeight: 1.35 }}>{nota}</Text> : null}
    </View>
  );
}

function Nota({ tono = "blu", titolo, testo, icona = "verifica" }: { tono?: Tono; titolo: string; testo: string; icona?: NomeIcona }) {
  const t = TONI[tono];
  return (
    <View wrap={false} style={{ flexDirection: "row", backgroundColor: t.fondo, borderLeftWidth: 3, borderLeftColor: t.valore, borderRadius: 6, paddingVertical: 9, paddingHorizontal: 11 }}>
      <View style={{ marginRight: 8, marginTop: 1 }}><IconaPdf nome={icona} colore={t.valore} lato={10} /></View>
      <View style={{ flex: 1 }}>
        <Text style={{ fontFamily: "Helvetica-Bold", fontSize: 8, color: BASE.ink }}>{titolo}</Text>
        <Text style={{ fontSize: 7.5, color: BASE.testo, marginTop: 2, lineHeight: 1.45 }}>{testo}</Text>
      </View>
    </View>
  );
}

function TitoletoSezione({ children }: { children: string }) {
  return <Text style={{ fontFamily: "Helvetica-Bold", fontSize: 9.5, color: BASE.ink, marginBottom: 7 }}>{children}</Text>;
}

function Spinta() {
  return <View style={{ flexGrow: 1 }} />;
}

/** Una foto con gli angoli arrotondati e la dicitura «illustrativa». */
function Foto({ src, altezza, larghezza = LARGHEZZA, didascalia = true, stile }: { src?: string | null; altezza: number; larghezza?: number | string; didascalia?: boolean; stile?: Record<string, unknown> }) {
  if (!src) return null;
  return (
    <View style={{ width: larghezza, ...(stile ?? {}) }}>
      <Image src={src} style={{ width: "100%", height: altezza, objectFit: "cover", borderRadius: 8 }} />
      {didascalia ? <Text style={{ fontSize: 6, color: BASE.grigioChiaro, marginTop: 3 }}>Immagine illustrativa.</Text> : null}
    </View>
  );
}

// ─── Grafici ────────────────────────────────────────────────────────────────
/** Spesa di un anno: oggi e col nuovo impianto. */
function GraficoSpesa({ oggi, domani, etichettaOggi, etichettaDomani, c }: { oggi: number; domani: number; etichettaOggi: string; etichettaDomani: string; c: Palette }) {
  const w = LARGHEZZA; const h = 170; const base = 138; const alto = 34;
  const massimo = Math.max(oggi, domani, 1);
  const altezza = (v: number) => Math.max(2, ((base - alto) * Math.max(0, v)) / massimo);
  const barra = 92;
  const x1 = w * 0.27 - barra / 2; const x2 = w * 0.63 - barra / 2;
  return (
    <Svg viewBox={`0 0 ${w} ${h}`} style={{ width: w, height: h }}>
      <Line x1={24} y1={base} x2={w - 24} y2={base} stroke={BASE.linea} strokeWidth={1} />
      <Rect x={x1} y={base - altezza(oggi)} width={barra} height={altezza(oggi)} rx={4} fill={BASE.arancio} />
      <Rect x={x2} y={base - altezza(domani)} width={barra} height={altezza(domani)} rx={4} fill={BASE.verde} />
      <Text x={x1 + barra / 2} y={base - altezza(oggi) - 7} fill={BASE.arancioScuro} style={{ fontSize: 11, fontFamily: "Helvetica-Bold", textAnchor: "middle" } as never}>{soldi(oggi)}</Text>
      <Text x={x2 + barra / 2} y={base - altezza(domani) - 7} fill={BASE.verdeScuro} style={{ fontSize: 11, fontFamily: "Helvetica-Bold", textAnchor: "middle" } as never}>{soldi(domani)}</Text>
      <Text x={x1 + barra / 2} y={base + 14} fill={BASE.grigio} style={{ fontSize: 7.5, textAnchor: "middle" } as never}>{etichettaOggi}</Text>
      <Text x={x2 + barra / 2} y={base + 14} fill={BASE.grigio} style={{ fontSize: 7.5, textAnchor: "middle" } as never}>{etichettaDomani}</Text>
      {oggi > domani ? (
        <G>
          <Path d={`M ${w * 0.82} ${base - altezza(oggi)} L ${w * 0.82} ${base - altezza(domani)}`} stroke={c.navy} strokeWidth={1.2} strokeDasharray="3 2" />
          <Path d={`M ${w * 0.82 - 4} ${base - altezza(domani) - 6} L ${w * 0.82} ${base - altezza(domani)} L ${w * 0.82 + 4} ${base - altezza(domani) - 6}`} stroke={c.navy} strokeWidth={1.2} fill="none" />
          <Text x={w * 0.82 + 8} y={(2 * base - altezza(oggi) - altezza(domani)) / 2} fill={c.navy} style={{ fontSize: 10, fontFamily: "Helvetica-Bold" } as never}>{`-${soldi(oggi - domani)}`}</Text>
          <Text x={w * 0.82 + 8} y={(2 * base - altezza(oggi) - altezza(domani)) / 2 + 11} fill={BASE.grigio} style={{ fontSize: 7 } as never}>ogni anno</Text>
        </G>
      ) : null}
    </Svg>
  );
}

/**
 * Le due aree fra la curva e lo zero: sotto (rossa) e sopra (verde), tagliate
 * dove la curva attraversa lo zero. Due tracciati pieni invece di un gradiente:
 * nei PDF i gradienti in verticale uscivano rovesciati.
 */
function areeSopraSotto(punti: { x: number; y: number }[], zero: number): { sotto: string; sopra: string } {
  const pezzi = { sotto: [] as { x: number; y: number }[][], sopra: [] as { x: number; y: number }[][] };
  let lato: "sotto" | "sopra" | null = null;
  let corrente: { x: number; y: number }[] = [];
  const chiudi = () => { if (lato && corrente.length > 1) pezzi[lato].push(corrente); corrente = []; };
  for (let i = 0; i < punti.length; i++) {
    const p = punti[i];
    const questo: "sotto" | "sopra" = p.y > zero ? "sotto" : "sopra";
    if (lato && questo !== lato && i > 0) {
      const q = punti[i - 1];
      const t = (zero - q.y) / (p.y - q.y);
      const incrocio = { x: q.x + t * (p.x - q.x), y: zero };
      corrente.push(incrocio);
      chiudi();
      corrente = [incrocio];
    }
    lato = questo;
    corrente.push(p);
  }
  chiudi();
  const tracciato = (pp: { x: number; y: number }[][]) => pp.map((pz) =>
    `M ${pz[0].x} ${zero} ${pz.map((p) => `L ${p.x} ${p.y}`).join(" ")} L ${pz[pz.length - 1].x} ${zero} Z`).join(" ");
  return { sotto: tracciato(pezzi.sotto), sopra: tracciato(pezzi.sopra) };
}

/** Il cumulato anno per anno: sotto lo zero finché la spesa non è ripagata. */
function GraficoCumulato({ r, c }: { r: ContoTermicoRisultato; c: Palette }) {
  const w = LARGHEZZA - 14; const h = 205;
  const padL = 46; const padR = 16; const padT = 16; const padB = 24;
  const anni = r.anniBeneficio;
  const valori = anni.map((a) => a.cumulato);
  const min = Math.min(0, ...valori); const max = Math.max(0, ...valori);
  const span = max - min || 1;
  const xOf = (i: number) => padL + (i * (w - padL - padR)) / Math.max(1, anni.length - 1);
  const yOf = (v: number) => padT + ((max - v) * (h - padT - padB)) / span;
  const zero = yOf(0);
  const punti = anni.map((a, i) => ({ x: xOf(i), y: yOf(a.cumulato) }));
  const linea = punti.map((p, i) => `${i === 0 ? "M" : "L"} ${p.x} ${p.y}`).join(" ");
  const aree = areeSopraSotto(punti, zero);
  const rientroX = r.anniDiRientro != null && r.anniDiRientro > 0
    ? padL + (r.anniDiRientro * (w - padL - padR)) / Math.max(1, anni.length - 1)
    : null;
  const ultimo = anni.length - 1;
  const passo = ultimo > 20 ? 5 : ultimo > 10 ? 2 : 1;
  const etichette = anni.map((_, i) => i).filter((i) => (i % passo === 0 && ultimo - i >= passo) || i === ultimo);
  const tacche = [min, max].filter((v) => v !== 0 && Math.abs(yOf(v) - zero) > 10);
  const kEuro = (v: number) => `${v < 0 ? "-" : ""}${Math.abs(Math.round(v / 1000))}k ${PDF_EURO}`;
  const etichettaX = rientroX != null ? Math.min(rientroX + 5, w - padR - 104) : 0;
  return (
    <Svg viewBox={`0 0 ${w} ${h}`} style={{ width: w, height: h }}>
      {aree.sotto ? <Path d={aree.sotto} fill={BASE.rosso} fillOpacity={0.13} /> : null}
      {aree.sopra ? <Path d={aree.sopra} fill={BASE.verde} fillOpacity={0.16} /> : null}
      <Line x1={padL} y1={zero} x2={w - padR} y2={zero} stroke={BASE.grigioChiaro} strokeWidth={0.8} />
      <Text x={padL - 6} y={zero + 3} fill={BASE.grigio} style={{ fontSize: 7, textAnchor: "end" } as never}>{`0 ${PDF_EURO}`}</Text>
      {tacche.map((v, i) => (
        <G key={`t-${i}`}>
          <Line x1={padL} y1={yOf(v)} x2={w - padR} y2={yOf(v)} stroke={BASE.linea} strokeWidth={0.5} strokeDasharray="2 3" />
          <Text x={padL - 6} y={yOf(v) + 3} fill={BASE.grigio} style={{ fontSize: 7, textAnchor: "end" } as never}>{kEuro(v)}</Text>
        </G>
      ))}
      <Path d={linea} stroke={c.navy} strokeWidth={1.8} fill="none" />
      {etichette.map((i) => (
        <Text key={`x-${i}`} x={xOf(i)} y={h - 8} fill={BASE.grigio} style={{ fontSize: 7, textAnchor: "middle" } as never}>{i === 0 ? "Oggi" : `Anno ${anni[i].anno}`}</Text>
      ))}
      <Circle cx={punti[0].x} cy={punti[0].y} r={3} fill={BASE.rosso} />
      <Circle cx={punti[ultimo].x} cy={punti[ultimo].y} r={3.4} fill={r.beneficioFinale >= 0 ? BASE.verde : BASE.rosso} />
      {rientroX != null ? (
        <G>
          <Line x1={rientroX} y1={padT} x2={rientroX} y2={h - padB} stroke={BASE.arancio} strokeWidth={1} strokeDasharray="3 2" />
          <Rect x={etichettaX} y={padT + 2} width={100} height={17} rx={3} fill={BASE.arancio} />
          <Text x={etichettaX + 50} y={padT + 13.5} fill="#FFFFFF" style={{ fontSize: 7, fontFamily: "Helvetica-Bold", textAnchor: "middle" } as never}>{`SPESA RIPAGATA · ${anniTesto(r.anniDiRientro ?? 0).toUpperCase()}`}</Text>
        </G>
      ) : null}
    </Svg>
  );
}

/** Quanto è tornato in tasca, anno per anno: contributo contro detrazione. */
function GraficoConfronto({ r }: { r: ContoTermicoRisultato }) {
  if (!r.detrazione) return null;
  const w = LARGHEZZA - 14; const h = 160; const padL = 46; const padR = 16; const padT = 12; const padB = 24;
  const anni = Array.from({ length: 11 }, (_, i) => i);
  const contributo = (anno: number) => r.rate.filter((x) => x.anno <= anno).reduce((s, x) => s + x.importo, 0);
  // Con lo sconto in fattura il contributo è già nel prezzo: c'è dall'anno 0.
  const ricevuto = (anno: number) => (r.pagaOggi < r.prezzo ? r.contributo : contributo(anno));
  const detratto = (anno: number) => Math.min(anno, 10) * (r.detrazione?.perAnno ?? 0);
  const max = Math.max(r.contributo, r.detrazione.totale, 1);
  const xOf = (a: number) => padL + (a * (w - padL - padR)) / 10;
  const yOf = (v: number) => padT + ((max - v) * (h - padT - padB)) / max;
  const tracciato = (f: (a: number) => number) => anni.map((a, i) => `${i === 0 ? "M" : "L"} ${xOf(a)} ${yOf(f(a))}`).join(" ");
  return (
    <Svg viewBox={`0 0 ${w} ${h}`} style={{ width: w, height: h }}>
      <Line x1={padL} y1={yOf(0)} x2={w - padR} y2={yOf(0)} stroke={BASE.grigioChiaro} strokeWidth={0.8} />
      <Line x1={padL} y1={yOf(max)} x2={w - padR} y2={yOf(max)} stroke={BASE.linea} strokeWidth={0.5} strokeDasharray="2 3" />
      <Text x={padL - 6} y={yOf(0) + 3} fill={BASE.grigio} style={{ fontSize: 7, textAnchor: "end" } as never}>{`0 ${PDF_EURO}`}</Text>
      <Text x={padL - 6} y={yOf(max) + 3} fill={BASE.grigio} style={{ fontSize: 7, textAnchor: "end" } as never}>{soldi(max)}</Text>
      <Path d={tracciato(detratto)} stroke={BASE.grigioChiaro} strokeWidth={1.6} strokeDasharray="4 3" fill="none" />
      <Path d={tracciato(ricevuto)} stroke={BASE.verde} strokeWidth={2.2} fill="none" />
      {anni.map((a) => (
        <Text key={`x-${a}`} x={xOf(a)} y={h - 8} fill={BASE.grigio} style={{ fontSize: 7, textAnchor: "middle" } as never}>{a === 0 ? "Oggi" : `Anno ${a}`}</Text>
      ))}
    </Svg>
  );
}

function Legenda({ voci }: { voci: { colore: string; testo: string; tratteggio?: boolean }[] }) {
  return (
    <View style={{ flexDirection: "row", marginLeft: 8, marginTop: 4 }}>
      {voci.map((v) => (
        <View key={v.testo} style={{ flexDirection: "row", alignItems: "center", marginRight: 14 }}>
          <View style={{ width: 14, height: 0, borderTopWidth: 2, borderTopColor: v.colore, borderStyle: v.tratteggio ? "dashed" : "solid", marginRight: 5 }} />
          <Text style={{ fontSize: 7, color: BASE.testo }}>{v.testo}</Text>
        </View>
      ))}
    </View>
  );
}

// ─── Pagine ─────────────────────────────────────────────────────────────────
function Copertina({ d, r, c }: { d: ContoTermicoPdfData; r: ContoTermicoRisultato; c: Palette }) {
  const titolo = d.testi?.titoloCopertina?.trim() || "Il calore di casa.\nCon l'aiuto\ndello Stato.";
  const foto = d.foto?.copertina;
  const FASCIA = 395;
  const sottotitolo = d.testi?.sottotitoloCopertina?.trim()
    || `${d.intervento.titolo} al posto di: ${d.intervento.impiantoAttuale.toLowerCase()}${d.cliente.indirizzo ? `, per ${d.cliente.indirizzo}` : ""}.`;
  return (
    // Niente wrap={false}: con gli elementi posizionati a mano il PDF bloccava
    // l'anteprima di macOS (Anteprima, Quick Look). Lo sfondo è alto un punto
    // meno della pagina, così non la fa andare a capo.
    <Page size="A4" style={{ fontFamily: "Helvetica", backgroundColor: c.navyScuro }}>
      <Svg viewBox={`0 0 ${W} ${H}`} style={{ position: "absolute", top: 0, left: 0, width: W, height: H - 1 }}>
        <Defs>
          <LinearGradient id="ct-fondo" x1="0" y1="0" x2="1" y2="1">
            <Stop offset="0" stopColor={c.navyScuro} />
            <Stop offset="1" stopColor={c.navyChiaro} />
          </LinearGradient>
          <RadialGradient id="ct-calore" cx="0.5" cy="0.5" r="0.5">
            <Stop offset="0" stopColor={BASE.arancio} stopOpacity={0.55} />
            <Stop offset="0.55" stopColor={BASE.arancio} stopOpacity={0.14} />
            <Stop offset="1" stopColor={BASE.arancio} stopOpacity={0} />
          </RadialGradient>
        </Defs>
        {foto ? <Rect x={0} y={0} width={W} height={H} fill={c.navyScuro} /> : <Rect x={0} y={0} width={W} height={H} fill="url(#ct-fondo)" />}
        {foto ? null : (
          <G>
            <Circle cx={455} cy={190} r={190} fill="url(#ct-calore)" />
            {[46, 74, 102, 130].map((raggio, i) => (
              <Circle key={raggio} cx={455} cy={190} r={raggio} stroke={BASE.ambra} strokeOpacity={0.34 - i * 0.07} strokeWidth={1} fill="none" />
            ))}
            <Circle cx={455} cy={190} r={22} fill={BASE.arancio} fillOpacity={0.9} />
          </G>
        )}
      </Svg>
      {foto ? (
        <View style={{ position: "absolute", top: 0, left: 0, width: W, height: FASCIA }}>
          <Image src={foto} style={{ width: W, height: FASCIA, objectFit: "cover" }} />
          {/* Il velo sta nello stesso disegno che lo usa: nel PDF ogni disegno
              ha le sue sfumature, e da un altro non si vedono. Le fasce sono
              rettangoli pieni sovrapposti, che scuriscono verso il basso. */}
          <Svg viewBox={`0 0 ${W} ${FASCIA}`} style={{ position: "absolute", top: 0, left: 0, width: W, height: FASCIA }}>
            {Array.from({ length: 10 }, (_, i) => (
              <Rect key={`alto-${i}`} x={0} y={i * 11} width={W} height={11.6} fill={c.navyScuro} fillOpacity={0.5 * (1 - i / 10) ** 1.5} />
            ))}
            {Array.from({ length: 16 }, (_, i) => (
              <Rect key={i} x={0} y={FASCIA * 0.5 + (i * FASCIA * 0.5) / 16} width={W} height={FASCIA * 0.5 / 16 + 0.6} fill={c.navyScuro} fillOpacity={Math.min(1, ((i + 1) / 16) ** 1.6)} />
            ))}
          </Svg>
        </View>
      ) : null}

      <View style={{ position: "absolute", top: 46, left: MARGINE, right: MARGINE, flexDirection: "row", alignItems: "center" }}>
        {d.azienda.logoUrl ? (
          <View style={{ backgroundColor: "#FFFFFF", borderRadius: 6, paddingVertical: 5, paddingHorizontal: 7, marginRight: 9 }}>
            <Image src={d.azienda.logoUrl} style={{ height: 22, maxWidth: 110, objectFit: "contain" }} />
          </View>
        ) : (
          <View style={{ width: 30, height: 30, borderRadius: 7, backgroundColor: BASE.arancio, alignItems: "center", justifyContent: "center", marginRight: 9 }}>
            <IconaPdf nome="temperatura" colore="#FFFFFF" lato={16} />
          </View>
        )}
        <View>
          <Text style={{ fontFamily: "Helvetica-Bold", fontSize: 12, color: "#FFFFFF" }}>{d.azienda.nome}</Text>
          <Text style={{ fontSize: 7.5, color: "#FFFFFF", opacity: 0.7, marginTop: 1 }}>Riscaldamento con il Conto Termico 3.0</Text>
        </View>
      </View>

      <View style={{ position: "absolute", top: foto ? FASCIA - 28 : 330, left: MARGINE, right: MARGINE }}>
        <Text style={{ fontFamily: "Helvetica-Bold", fontSize: 7.5, letterSpacing: 1.8, color: BASE.ambra, marginBottom: 10 }}>CONTO TERMICO 3.0 · LA TUA PROPOSTA</Text>
        <Text style={{ fontFamily: "Helvetica-Bold", fontSize: foto ? 33 : 38, lineHeight: 1.06, letterSpacing: -1.2, color: "#FFFFFF" }}>{titolo}</Text>
        <Text style={{ fontSize: 10.5, lineHeight: 1.45, color: "#FFFFFF", opacity: 0.82, marginTop: 12, maxWidth: 420 }}>{sottotitolo}</Text>

        <View style={{ flexDirection: "row", marginTop: foto ? 18 : 26 }}>
          <View style={{ flex: 1, backgroundColor: c.vetro, borderWidth: 1, borderColor: c.vetroBordo, borderRadius: 10, padding: foto ? 11 : 14, marginRight: 10 }}>
            <Text style={{ fontFamily: "Helvetica-Bold", fontSize: 6.5, letterSpacing: 1.2, color: BASE.ambra }}>CONTRIBUTO GSE STIMATO</Text>
            <Text style={{ fontFamily: "Helvetica-Bold", fontSize: foto ? 22 : 26, letterSpacing: -0.8, color: BASE.ambra, marginTop: 6 }}>{soldi(r.contributo)}</Text>
            <Text style={{ fontSize: 7, color: "#FFFFFF", opacity: 0.72, marginTop: 3 }}>{`il ${r.coperturaPct}% del prezzo chiavi in mano`}</Text>
          </View>
          <View style={{ flex: 1, backgroundColor: c.vetro, borderWidth: 1, borderColor: c.vetroBordo, borderRadius: 10, padding: foto ? 11 : 14 }}>
            <Text style={{ fontFamily: "Helvetica-Bold", fontSize: 6.5, letterSpacing: 1.2, color: "#FFFFFF", opacity: 0.8 }}>RESTA A TE</Text>
            <Text style={{ fontFamily: "Helvetica-Bold", fontSize: foto ? 22 : 26, letterSpacing: -0.8, color: "#FFFFFF", marginTop: 6 }}>{soldi(r.restaATe)}</Text>
            <Text style={{ fontSize: 7, color: "#FFFFFF", opacity: 0.72, marginTop: 3 }}>{`su ${soldi(r.prezzo)} IVA inclusa`}</Text>
          </View>
        </View>

        <View style={{ backgroundColor: c.vetro, borderWidth: 1, borderColor: c.vetroBordo, borderRadius: 10, paddingVertical: foto ? 9 : 12, paddingHorizontal: 14, marginTop: 8 }}>
          <Text style={{ fontFamily: "Helvetica-Bold", fontSize: 6.5, letterSpacing: 1.2, color: BASE.ambra }}>PREPARATO PER</Text>
          <Text style={{ fontFamily: "Helvetica-Bold", fontSize: 13, color: "#FFFFFF", marginTop: 5 }}>{d.cliente.nome}</Text>
          {d.cliente.indirizzo ? <Text style={{ fontSize: 8, color: "#FFFFFF", opacity: 0.72, marginTop: 2 }}>{d.cliente.indirizzo}</Text> : null}
        </View>
      </View>

      <View style={{ position: "absolute", bottom: 40, left: MARGINE, right: MARGINE, borderTopWidth: 1, borderTopColor: c.vetroBordo, paddingTop: 10, flexDirection: "row", justifyContent: "space-between" }}>
        <View>
          <Text style={{ fontSize: 7.5, color: "#FFFFFF" }}>{"Preventivo "}<Text style={{ fontFamily: "Helvetica-Bold", color: BASE.ambra }}>{d.preventivo.codice}</Text></Text>
          <Text style={{ fontSize: 7.5, color: "#FFFFFF", opacity: 0.72, marginTop: 2 }}>{`${dataLunga(d.preventivo.dataIso)} · valido ${d.preventivo.validitaGiorni} giorni`}</Text>
        </View>
        {d.preventivo.consulente ? (
          <View style={{ alignItems: "flex-end" }}>
            <Text style={{ fontSize: 7.5, color: "#FFFFFF", opacity: 0.72 }}>A cura di</Text>
            <Text style={{ fontFamily: "Helvetica-Bold", fontSize: 7.5, color: "#FFFFFF", marginTop: 2 }}>{d.preventivo.consulente}</Text>
          </View>
        ) : null}
      </View>
    </Page>
  );
}

function Scheda({ icona, titolo, testo, c, ultimaColonna }: { icona: NomeIcona; titolo: string; testo: string; c: Palette; ultimaColonna: boolean }) {
  return (
    <View style={{ width: (LARGHEZZA - 10) / 2, marginRight: ultimaColonna ? 0 : 10, marginBottom: 10, backgroundColor: BASE.fondo, borderWidth: 1, borderColor: BASE.linea, borderRadius: 8, padding: 12, flexDirection: "row" }}>
      <View style={{ width: 24, height: 24, borderRadius: 12, backgroundColor: BASE.arancioTenue, alignItems: "center", justifyContent: "center", marginRight: 9 }}>
        <IconaPdf nome={icona} colore={BASE.arancioScuro} lato={12} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={{ fontFamily: "Helvetica-Bold", fontSize: 9, color: c.navy }}>{titolo}</Text>
        <Text style={{ fontSize: 7.8, lineHeight: 1.45, color: BASE.testo, marginTop: 3 }}>{testo}</Text>
      </View>
    </View>
  );
}

function Spunta({ testo }: { testo: string }) {
  return (
    <View style={{ flexDirection: "row", marginBottom: 5 }}>
      <View style={{ marginRight: 6, marginTop: 1 }}><IconaPdf nome="verifica" colore={BASE.verde} lato={9} /></View>
      <Text style={{ flex: 1, fontSize: 8, lineHeight: 1.4, color: BASE.testo }}>{testo}</Text>
    </View>
  );
}

function CosaVuolDire({ d, c }: { d: ContoTermicoPdfData; c: Palette }) {
  const schede: { icona: NomeIcona; titolo: string; testo: string }[] = [
    { icona: "pagamento", titolo: "Soldi sul conto, non sconti sulle tasse", testo: "Il GSE versa il contributo sul tuo conto corrente. Non è una detrazione: non serve avere tasse da scalare." },
    { icona: "calendario", titolo: "Arriva presto", testo: `Fino a ${soldi(CONTO_TERMICO.sogliaUnicaRata)} in un'unica soluzione dopo l'accettazione della domanda; oltre, in 2 o 5 rate annuali.` },
    { icona: "risparmio", titolo: `Fino al ${CONTO_TERMICO.percentualeMassima}% della spesa`, testo: "Quanto esattamente lo decide il GSE: dipende da potenza ed efficienza del generatore e dalla zona climatica." },
    { icona: "pratiche", titolo: "Ti accompagniamo nella pratica", testo: `La domanda va inviata al GSE entro ${CONTO_TERMICO.giorniPerLaDomanda} giorni dalla fine dei lavori, con foto, fatture e documenti.` },
  ];
  return (
    <Pagina d={d} c={c}>
      <Intestazione c={c} occhiello="Il Conto Termico 3.0" titolo={"Un contributo,\n"} evidenza="non una detrazione." sottotitolo="In parole semplici: lo Stato ti restituisce una parte di quello che spendi per sostituire il vecchio riscaldamento con uno che usa energia rinnovabile." />
      <Foto src={d.foto?.cosaVuolDire} altezza={128} stile={{ marginBottom: 10 }} />
      <View style={{ flexDirection: "row", flexWrap: "wrap" }}>
        {schede.map((s, i) => <Scheda key={s.titolo} {...s} c={c} ultimaColonna={i % 2 === 1} />)}
      </View>
      <View style={{ flexDirection: "row", marginTop: 10 }}>
        <View style={{ flex: 1, marginRight: 18 }}>
          <TitoletoSezione>Chi può chiederlo</TitoletoSezione>
          <Spunta testo="Chi ha la casa: il proprietario o chi ha un diritto reale sull'immobile." />
          <Spunta testo="Chi la usa con un contratto: l'inquilino o il comodatario." />
          <Spunta testo="Per interventi sulla casa in cui vive o che mette a disposizione." />
        </View>
        <View style={{ flex: 1 }}>
          <TitoletoSezione>Cosa serve</TitoletoSezione>
          <Spunta testo="Un impianto di riscaldamento funzionante, che viene sostituito." />
          <Spunta testo="Un generatore nuovo che rispetta i requisiti minimi di efficienza." />
          <Spunta testo={`La domanda al GSE entro ${CONTO_TERMICO.giorniPerLaDomanda} giorni dalla fine dei lavori.`} />
        </View>
      </View>
      <Spinta />
      <Nota tono="blu" icona="documenti" titolo={`Le regole: ${CONTO_TERMICO.decreto}, in vigore dal ${CONTO_TERMICO.inVigoreDal}.`} testo="Il contributo di questo preventivo è una stima: l'importo definitivo lo stabilisce il GSE alla fine dell'istruttoria. Non si somma alla detrazione fiscale sullo stesso intervento." />
    </Pagina>
  );
}

function Intervento({ d, c }: { d: ContoTermicoPdfData; c: Palette }) {
  const tipo = INTERVENTI_CONTO_TERMICO[d.intervento.tipo] ?? "Il nuovo impianto";
  const voci = d.intervento.voci.slice(0, 12);
  return (
    <Pagina d={d} c={c}>
      <Intestazione c={c} occhiello="Il tuo intervento" titolo={"Cosa cambia\n"} evidenza="in casa tua." sottotitolo="Togliamo il generatore che hai oggi e installiamo quello nuovo: è la sostituzione che dà diritto al contributo." />
      <View style={{ flexDirection: "row", alignItems: "stretch" }}>
        <View style={{ flex: 1, backgroundColor: BASE.rossoTenue, borderWidth: 1, borderColor: BASE.rossoBordo, borderRadius: 10, padding: 12 }}>
          {d.foto?.oggi ? <Image src={d.foto.oggi} style={{ width: "100%", height: 112, objectFit: "cover", borderRadius: 6, marginBottom: 10 }} /> : null}
          <Text style={{ fontFamily: "Helvetica-Bold", fontSize: 6.5, letterSpacing: 1.2, color: BASE.rosso }}>OGGI</Text>
          <Text style={{ fontFamily: "Helvetica-Bold", fontSize: 13, color: BASE.ink, marginTop: 6, lineHeight: 1.25 }}>{d.intervento.impiantoAttuale}</Text>
          <Text style={{ fontSize: 7.5, color: BASE.testo, marginTop: 5, lineHeight: 1.4 }}>Viene smontato e smaltito, e se ne conserva il certificato per la pratica.</Text>
        </View>
        <View style={{ width: 34, alignItems: "center", justifyContent: "center" }}>
          <Svg viewBox="0 0 24 24" style={{ width: 20, height: 20 }}>
            <Path d="M4 12 L19 12 M13 6 L19 12 L13 18" stroke={BASE.arancio} strokeWidth={2.4} fill="none" />
          </Svg>
        </View>
        <View style={{ flex: 1, backgroundColor: BASE.verdeTenue, borderWidth: 1, borderColor: BASE.verdeBordo, borderRadius: 10, padding: 12 }}>
          {d.foto?.domani ? <Image src={d.foto.domani} style={{ width: "100%", height: 112, objectFit: "cover", borderRadius: 6, marginBottom: 10 }} /> : null}
          <Text style={{ fontFamily: "Helvetica-Bold", fontSize: 6.5, letterSpacing: 1.2, color: BASE.verdeScuro }}>{`DOMANI · ${tipo.toUpperCase()}`}</Text>
          <Text style={{ fontFamily: "Helvetica-Bold", fontSize: 13, color: BASE.ink, marginTop: 6, lineHeight: 1.25 }}>{d.intervento.titolo}</Text>
          <Text style={{ fontSize: 7.5, color: BASE.testo, marginTop: 5, lineHeight: 1.4 }}>Energia rinnovabile dall'aria, dall'acqua o dal sole: il requisito del Conto Termico.</Text>
        </View>
      </View>

      {d.foto?.oggi || d.foto?.domani ? <Text style={{ fontSize: 6, color: BASE.grigioChiaro, marginTop: 4 }}>Immagini illustrative.</Text> : null}
      <View style={{ marginTop: 14 }}>
        <TitoletoSezione>Cosa comprende la proposta</TitoletoSezione>
        <View style={{ borderWidth: 1, borderColor: BASE.linea, borderRadius: 8 }}>
          {voci.map((v, i) => (
            <View key={i} style={{ flexDirection: "row", alignItems: "center", paddingVertical: 7, paddingHorizontal: 11, borderTopWidth: i === 0 ? 0 : 1, borderTopColor: BASE.linea }}>
              <View style={{ marginRight: 8 }}><IconaPdf nome="verifica" colore={BASE.verde} lato={9} /></View>
              <Text style={{ flex: 1, fontSize: 8.2, color: BASE.ink, lineHeight: 1.35 }}>{v.descrizione}</Text>
              {v.quantita != null && v.quantita !== 1 ? <Text style={{ fontSize: 8, color: BASE.grigio, marginLeft: 8 }}>{`${String(v.quantita).replace(".", ",")} ${v.unita ?? ""}`.trim()}</Text> : null}
            </View>
          ))}
        </View>
      </View>
      <Spinta />
      <Nota tono="verde" icona="garanzia" titolo="Il prezzo è chiavi in mano." testo="Comprende quello che è elencato qui sopra. Lavori o materiali non elencati non sono compresi e si concordano prima." />
    </Pagina>
  );
}

const ICONE_VANTAGGI: NomeIcona[] = ["energia", "fiamma", "verifica", "temperatura", "sole", "pagamento"];

function Caratteristiche({ d, c }: { d: ContoTermicoPdfData; c: Palette }) {
  const scheda = (d.intervento.caratteristiche ?? []).filter((x) => x.etichetta?.trim() && x.valore?.trim()).slice(0, 9);
  const vantaggi = (d.testi?.vantaggi?.length ? d.testi.vantaggi : VANTAGGI_CONTO_TERMICO[d.intervento.tipo] ?? VANTAGGI_CONTO_TERMICO.pompa_calore).slice(0, 6);
  const conFoto = Boolean(d.foto?.interno || d.foto?.dettaglio);
  return (
    <Pagina d={d} c={c}>
      <Intestazione c={c} occhiello="Il tuo nuovo impianto" titolo={"Com'è fatto,\n"} evidenza="punto per punto." sottotitolo={`${d.intervento.titolo}: la scheda tecnica del modello proposto e quello che cambia in casa.`} />
      <View style={{ flexDirection: "row" }}>
        {conFoto ? (
          <View style={{ width: LARGHEZZA * 0.44, marginRight: 14 }}>
            <Foto src={d.foto?.interno} altezza={scheda.length > 5 ? 150 : 128} larghezza="100%" didascalia={false} />
            {d.foto?.dettaglio ? <Foto src={d.foto.dettaglio} altezza={96} larghezza="100%" didascalia={false} stile={{ marginTop: 8 }} /> : null}
            <Text style={{ fontSize: 6, color: BASE.grigioChiaro, marginTop: 3 }}>Immagini illustrative.</Text>
          </View>
        ) : null}
        <View style={{ flex: 1 }}>
          <TitoletoSezione>Scheda tecnica</TitoletoSezione>
          {scheda.length ? (
            <View style={{ borderWidth: 1, borderColor: BASE.linea, borderRadius: 8 }}>
              {scheda.map((x, i) => (
                <View key={x.etichetta} style={{ flexDirection: "row", paddingVertical: 6.5, paddingHorizontal: 10, borderTopWidth: i === 0 ? 0 : 1, borderTopColor: BASE.linea, backgroundColor: i % 2 === 0 ? "#FFFFFF" : BASE.fondo }}>
                  <Text style={{ flex: 1.1, fontSize: 7.5, color: BASE.grigio }}>{x.etichetta}</Text>
                  <Text style={{ flex: 1, fontSize: 8, fontFamily: "Helvetica-Bold", color: BASE.ink, textAlign: "right" }}>{x.valore}</Text>
                </View>
              ))}
            </View>
          ) : (
            <Text style={{ fontSize: 8, color: BASE.grigio, lineHeight: 1.45 }}>I dati del modello proposto si trovano nella scheda tecnica del produttore allegata alla proposta.</Text>
          )}
          {scheda.length ? <Text style={{ fontSize: 6.5, color: BASE.grigioChiaro, marginTop: 4, lineHeight: 1.35 }}>Dati del produttore per il modello proposto. Fa fede la scheda tecnica allegata.</Text> : null}
        </View>
      </View>

      <View style={{ marginTop: 18 }}>
        <TitoletoSezione>Cosa ti porta</TitoletoSezione>
        <View style={{ flexDirection: "row", flexWrap: "wrap" }}>
          {vantaggi.map((v, i) => (
            <View key={v.titolo} style={{ width: (LARGHEZZA - 16) / 3, marginRight: i % 3 === 2 ? 0 : 8, marginBottom: 8, backgroundColor: BASE.fondo, borderWidth: 1, borderColor: BASE.linea, borderRadius: 8, padding: 10 }}>
              <View style={{ width: 22, height: 22, borderRadius: 11, backgroundColor: i === vantaggi.length - 1 ? BASE.arancioTenue : BASE.verdeTenue, alignItems: "center", justifyContent: "center", marginBottom: 6 }}>
                <IconaPdf nome={ICONE_VANTAGGI[i] ?? "verifica"} colore={i === vantaggi.length - 1 ? BASE.arancioScuro : BASE.verdeScuro} lato={11} />
              </View>
              <Text style={{ fontFamily: "Helvetica-Bold", fontSize: 8.5, color: c.navy }}>{v.titolo}</Text>
              <Text style={{ fontSize: 7.2, color: BASE.testo, marginTop: 3, lineHeight: 1.4 }}>{conEuro(v.testo)}</Text>
            </View>
          ))}
        </View>
      </View>
    </Pagina>
  );
}

function Incentivo({ d, r, c }: { d: ContoTermicoPdfData; r: ContoTermicoRisultato; c: Palette }) {
  const sconto = d.economia.modalita === "sconto_in_fattura";
  const quotaContributo = r.prezzo > 0 ? r.contributo / r.prezzo : 0;
  return (
    <Pagina d={d} c={c}>
      <Intestazione c={c} occhiello="Il tuo incentivo" titolo={`${soldi(r.contributo)}\n`} evidenza="li mette lo Stato." sottotitolo={`Il Conto Termico copre il ${r.coperturaPct}% del prezzo chiavi in mano. Ecco quanto resta a te e come ricevi il contributo.`} />
      <View style={{ flexDirection: "row" }}>
        <Kpi etichetta="Prezzo chiavi in mano" valore={soldi(r.prezzo)} nota={`IVA ${d.economia.ivaPct}% inclusa`} />
        <Kpi etichetta="Contributo GSE stimato" valore={`-${soldi(r.contributo)}`} nota="stima: lo conferma il GSE" tono="arancio" />
        <Kpi etichetta="Resta a te" valore={soldi(r.restaATe)} nota="il costo vero dell'impianto" tono="verde" ultimo />
      </View>

      <View style={{ marginTop: 18 }}>
        <TitoletoSezione>Chi paga cosa</TitoletoSezione>
        <View style={{ flexDirection: "row", height: 30, borderRadius: 6, overflow: "hidden" }}>
          <View style={{ flex: Math.max(0.001, 1 - quotaContributo), backgroundColor: c.navy, justifyContent: "center", paddingHorizontal: 8 }}>
            <Text style={{ fontFamily: "Helvetica-Bold", fontSize: 8, color: "#FFFFFF" }}>{`Tu · ${soldi(r.restaATe)}`}</Text>
          </View>
          <View style={{ flex: Math.max(0.001, quotaContributo), backgroundColor: BASE.arancio, justifyContent: "center", paddingHorizontal: 8 }}>
            <Text style={{ fontFamily: "Helvetica-Bold", fontSize: 8, color: "#FFFFFF" }}>{`GSE · ${soldi(r.contributo)}`}</Text>
          </View>
        </View>
      </View>

      <View style={{ marginTop: 20 }}>
        <TitoletoSezione>Come ricevi il contributo</TitoletoSezione>
        {sconto ? (
          <Nota tono="verde" icona="pagamento" titolo={`Sconto in fattura: paghi ${soldi(r.pagaOggi)} invece di ${soldi(r.prezzo)}.`} testo="Il contributo lo incassiamo noi dal GSE, con il tuo mandato all'incasso, e te lo scontiamo subito sul prezzo. Tu non anticipi la parte del GSE." />
        ) : (
          <View>
            <Nota tono="blu" icona="pagamento" titolo={`Paghi ${soldi(r.prezzo)} ai lavori; il GSE ti versa ${soldi(r.contributo)}.`} testo={r.rate.length <= 1 ? "In un'unica soluzione, dopo che il GSE ha accettato la domanda." : `In ${r.rate.length} rate annuali, la prima dopo che il GSE ha accettato la domanda.`} />
            {r.rate.length > 0 ? (
              <View style={{ marginTop: 10, borderWidth: 1, borderColor: BASE.linea, borderRadius: 8 }}>
                <View style={{ flexDirection: "row", backgroundColor: c.navy, borderTopLeftRadius: 7, borderTopRightRadius: 7, paddingVertical: 6, paddingHorizontal: 11 }}>
                  <Text style={{ flex: 1, fontFamily: "Helvetica-Bold", fontSize: 7, color: "#FFFFFF" }}>RATA</Text>
                  <Text style={{ flex: 2, fontFamily: "Helvetica-Bold", fontSize: 7, color: "#FFFFFF" }}>QUANDO</Text>
                  <Text style={{ flex: 1, fontFamily: "Helvetica-Bold", fontSize: 7, color: "#FFFFFF", textAlign: "right" }}>IMPORTO</Text>
                </View>
                {r.rate.map((x) => (
                  <View key={x.numero} style={{ flexDirection: "row", paddingVertical: 6, paddingHorizontal: 11, borderTopWidth: 1, borderTopColor: BASE.linea }}>
                    <Text style={{ flex: 1, fontSize: 8, color: BASE.ink }}>{r.rate.length === 1 ? "Unica" : `${x.numero}ª`}</Text>
                    <Text style={{ flex: 2, fontSize: 8, color: BASE.testo }}>{x.anno === 1 ? "Dopo l'accettazione della domanda" : `Dopo ${x.anno - 1} ${x.anno - 1 === 1 ? "anno" : "anni"} dalla prima`}</Text>
                    <Text style={{ flex: 1, fontSize: 8, fontFamily: "Helvetica-Bold", color: BASE.verdeScuro, textAlign: "right" }}>{soldi(x.importo)}</Text>
                  </View>
                ))}
              </View>
            ) : null}
          </View>
        )}
      </View>
      <Foto src={d.foto?.incentivo} altezza={132} stile={{ marginTop: 16 }} />
      <Spinta />
      <Nota tono="arancio" icona="verifica" titolo="Perché è una stima." testo="Il GSE calcola il contributo con una formula che tiene conto della potenza del generatore, della sua efficienza stagionale (SCOP) e della zona climatica. La cifra definitiva arriva con l'accettazione della domanda." />
    </Pagina>
  );
}

function Risparmio({ d, r, c }: { d: ContoTermicoPdfData; r: ContoTermicoRisultato; c: Palette }) {
  const e = d.economia;
  const c_risparmia = r.risparmioAnnuo > 0;
  const tipo = INTERVENTI_CONTO_TERMICO[d.intervento.tipo]?.toLowerCase() ?? "nuovo impianto";
  return (
    <Pagina d={d} c={c}>
      {c_risparmia ? (
        <Intestazione c={c} occhiello="Il risparmio in bolletta" titolo={`${soldi(r.risparmioMensile)} al mese\n`} evidenza="che restano a te." sottotitolo="Quello che non paghi più per scaldare casa e produrre acqua calda. Stima del primo anno, con la spesa che ci hai indicato." />
      ) : (
        <Intestazione c={c} occhiello="La spesa di ogni anno" titolo={"Quanto costa\n"} evidenza="scaldare casa." sottotitolo="La spesa di un anno per riscaldamento e acqua calda, oggi e col nuovo impianto." />
      )}
      <View style={{ flexDirection: "row" }}>
        <Kpi etichetta="Al mese" valore={soldi(Math.max(0, r.risparmioMensile))} nota="in media, il primo anno" tono="verde" grande />
        <Kpi etichetta="All'anno" valore={soldi(Math.max(0, r.risparmioAnnuo))} nota="il primo anno" tono="verde" grande ultimo />
      </View>
      <View style={{ marginTop: 18, borderWidth: 1, borderColor: BASE.linea, borderRadius: 8, paddingTop: 12, paddingHorizontal: 10 }}>
        <Text style={{ fontFamily: "Helvetica-Bold", fontSize: 8.5, color: BASE.ink, marginLeft: 4 }}>Spesa di un anno per riscaldamento e acqua calda</Text>
        <GraficoSpesa oggi={e.spesaAnnuaAttuale} domani={e.spesaAnnuaNuova} etichettaOggi={`Oggi · ${d.intervento.impiantoAttuale}`.slice(0, 44)} etichettaDomani={`Domani · ${tipo}`.slice(0, 44)} c={c} />
      </View>
      <View style={{ marginTop: 14, borderWidth: 1, borderColor: BASE.linea, borderRadius: 8 }}>
        <View style={{ flexDirection: "row", backgroundColor: c.navy, borderTopLeftRadius: 7, borderTopRightRadius: 7, paddingVertical: 6, paddingHorizontal: 11 }}>
          <Text style={{ flex: 2, fontFamily: "Helvetica-Bold", fontSize: 7, color: "#FFFFFF" }}>VOCE</Text>
          <Text style={{ flex: 1, fontFamily: "Helvetica-Bold", fontSize: 7, color: "#FFFFFF", textAlign: "right" }}>OGGI</Text>
          <Text style={{ flex: 1, fontFamily: "Helvetica-Bold", fontSize: 7, color: "#FFFFFF", textAlign: "right" }}>DOMANI</Text>
          <Text style={{ flex: 1, fontFamily: "Helvetica-Bold", fontSize: 7, color: "#FFFFFF", textAlign: "right" }}>DIFFERENZA</Text>
        </View>
        <View style={{ flexDirection: "row", paddingVertical: 7, paddingHorizontal: 11 }}>
          <Text style={{ flex: 2, fontSize: 8, color: BASE.ink }}>Riscaldamento e acqua calda, in un anno</Text>
          <Text style={{ flex: 1, fontSize: 8, color: BASE.ink, textAlign: "right" }}>{soldi(e.spesaAnnuaAttuale)}</Text>
          <Text style={{ flex: 1, fontSize: 8, color: BASE.ink, textAlign: "right" }}>{soldi(e.spesaAnnuaNuova)}</Text>
          <Text style={{ flex: 1, fontSize: 8, fontFamily: "Helvetica-Bold", color: r.risparmioAnnuo >= 0 ? BASE.verdeScuro : BASE.rosso, textAlign: "right" }}>{soldi(-r.risparmioAnnuo)}</Text>
        </View>
      </View>
      <Foto src={d.foto?.comfort} altezza={118} stile={{ marginTop: 14 }} />
      <Spinta />
      <Nota tono="blu" icona="energia" titolo="Il risparmio si misura in bolletta, non a parole." testo={`È una stima: parte dalla spesa annua che ci hai indicato (${soldi(e.spesaAnnuaAttuale)}) e da quella prevista col nuovo impianto (${soldi(e.spesaAnnuaNuova)}). Negli anni successivi consideriamo prezzi dell'energia in aumento del ${String(e.aumentoEnergiaPct).replace(".", ",")}% l'anno.`} />
    </Pagina>
  );
}

function Beneficio({ d, r, c }: { d: ContoTermicoPdfData; r: ContoTermicoRisultato; c: Palette }) {
  const anni = r.anniBeneficio.length - 1;
  const positivo = r.beneficioFinale > 0;
  const tappe = [...new Set([0, 1, r.anniDiRientro != null ? Math.ceil(r.anniDiRientro) : -1, 5, 10, anni])]
    .filter((a) => a >= 0 && a <= anni)
    .sort((a, b) => a - b);
  return (
    <Pagina d={d} c={c}>
      <Intestazione
        c={c}
        occhiello="Il beneficio negli anni"
        titolo={positivo ? `+${soldi(r.beneficioFinale)}\n` : `In ${anni} anni\n`}
        evidenza={positivo ? `in ${anni} anni.` : "il conto completo."}
        sottotitolo={r.anniDiRientro != null
          ? `Contributo e risparmi in bolletta, anno dopo anno, meno quello che spendi oggi. La spesa è ripagata in circa ${anniTesto(r.anniDiRientro)}.`
          : "Contributo e risparmi in bolletta, anno dopo anno, meno quello che spendi oggi."}
      />
      <View style={{ flexDirection: "row" }}>
        <Kpi etichetta="Spesa ripagata in" valore={r.anniDiRientro != null ? anniTesto(r.anniDiRientro) : "oltre l'orizzonte"} tono="arancio" />
        <Kpi etichetta={`Risparmi in ${anni} anni`} valore={soldi(Math.max(0, r.risparmiTotali))} tono="verde" />
        <Kpi etichetta="Contributo GSE" valore={soldi(r.contributo)} tono="neutro" ultimo />
      </View>
      <View style={{ marginTop: 16, borderWidth: 1, borderColor: BASE.linea, borderRadius: 8, paddingTop: 12, paddingHorizontal: 6 }}>
        <Text style={{ fontFamily: "Helvetica-Bold", fontSize: 8.5, color: BASE.ink, marginLeft: 8 }}>Quanto hai in tasca, anno dopo anno</Text>
        <Text style={{ fontSize: 7, color: BASE.grigio, marginLeft: 8, marginTop: 2 }}>Sotto lo zero finché la spesa non è ripagata, sopra da lì in poi.</Text>
        <GraficoCumulato r={r} c={c} />
      </View>
      <View style={{ marginTop: 12, borderWidth: 1, borderColor: BASE.linea, borderRadius: 8 }}>
        <View style={{ flexDirection: "row", backgroundColor: c.navy, borderTopLeftRadius: 7, borderTopRightRadius: 7, paddingVertical: 6, paddingHorizontal: 11 }}>
          <Text style={{ width: 60, fontFamily: "Helvetica-Bold", fontSize: 7, color: "#FFFFFF" }}>ANNO</Text>
          <Text style={{ flex: 1, fontFamily: "Helvetica-Bold", fontSize: 7, color: "#FFFFFF" }}>COSA SUCCEDE</Text>
          <Text style={{ width: 90, fontFamily: "Helvetica-Bold", fontSize: 7, color: "#FFFFFF", textAlign: "right" }}>IN TASCA</Text>
        </View>
        {tappe.map((anno) => {
          const a = r.anniBeneficio[anno];
          const cosa = anno === 0
            ? (r.pagaOggi < r.prezzo ? "Lavori: paghi il prezzo già scontato del contributo" : "Lavori: paghi il prezzo chiavi in mano")
            : anno === 1 && a.contributo > 0 ? `Arriva ${r.rate.length > 1 ? "la prima rata" : "il contributo"} del GSE e il primo anno di risparmi`
            : r.anniDiRientro != null && anno === Math.ceil(r.anniDiRientro) ? "La spesa è ripagata: da qui in poi è guadagno"
            : anno === anni ? "Fine del periodo considerato"
            : "Risparmi in bolletta";
          return (
            <View key={anno} style={{ flexDirection: "row", paddingVertical: 6, paddingHorizontal: 11, borderTopWidth: 1, borderTopColor: BASE.linea }}>
              <Text style={{ width: 60, fontSize: 8, fontFamily: "Helvetica-Bold", color: BASE.ink }}>{anno === 0 ? "Oggi" : String(anno)}</Text>
              <Text style={{ flex: 1, fontSize: 8, color: BASE.testo }}>{cosa}</Text>
              <Text style={{ width: 90, fontSize: 8, fontFamily: "Helvetica-Bold", color: a.cumulato >= 0 ? BASE.verdeScuro : BASE.rosso, textAlign: "right" }}>{soldi(a.cumulato)}</Text>
            </View>
          );
        })}
      </View>
    </Pagina>
  );
}

function Confronto({ d, r, c }: { d: ContoTermicoPdfData; r: ContoTermicoRisultato; c: Palette }) {
  if (!r.detrazione) return null;
  const sconto = d.economia.modalita === "sconto_in_fattura";
  return (
    <Pagina d={d} c={c}>
      <Intestazione c={c} occhiello="Contributo o detrazione" titolo={"Il contributo arriva subito.\n"} evidenza="La detrazione in 10 anni." sottotitolo="Sullo stesso intervento si sceglie l'uno o l'altra: non si sommano. Ecco la differenza, con i numeri di questa proposta." />
      <View style={{ flexDirection: "row" }}>
        <View style={{ flex: 1, backgroundColor: BASE.verdeTenue, borderWidth: 1, borderColor: BASE.verdeBordo, borderRadius: 10, padding: 14, marginRight: 10 }}>
          <Text style={{ fontFamily: "Helvetica-Bold", fontSize: 6.5, letterSpacing: 1.2, color: BASE.verdeScuro }}>CONTO TERMICO 3.0</Text>
          <Text style={{ fontFamily: "Helvetica-Bold", fontSize: 24, letterSpacing: -0.7, color: BASE.verdeScuro, marginTop: 6 }}>{soldi(r.contributo)}</Text>
          <Text style={{ fontSize: 7.5, color: BASE.testo, marginTop: 3 }}>{sconto ? "subito, scontati in fattura" : r.rate.length > 1 ? `in ${r.rate.length} rate annuali` : "in un'unica soluzione"}</Text>
          <View style={{ marginTop: 10 }}>
            <Spunta testo="Soldi versati sul conto (o sconto sul prezzo)." />
            <Spunta testo="Non servono tasse da scalare." />
            <Spunta testo="Importo confermato dal GSE." />
          </View>
        </View>
        <View style={{ flex: 1, backgroundColor: BASE.fondo, borderWidth: 1, borderColor: BASE.linea, borderRadius: 10, padding: 14 }}>
          <Text style={{ fontFamily: "Helvetica-Bold", fontSize: 6.5, letterSpacing: 1.2, color: BASE.grigio }}>{`DETRAZIONE FISCALE ${r.detrazione.pct}%`}</Text>
          <Text style={{ fontFamily: "Helvetica-Bold", fontSize: 24, letterSpacing: -0.7, color: BASE.ink, marginTop: 6 }}>{soldi(r.detrazione.totale)}</Text>
          <Text style={{ fontSize: 7.5, color: BASE.testo, marginTop: 3 }}>{`in 10 anni, ${soldi(r.detrazione.perAnno)} per dichiarazione dei redditi`}</Text>
          <View style={{ marginTop: 10 }}>
            <Spunta testo="Si recupera come minori tasse, un decimo l'anno." />
            <Spunta testo="Serve avere abbastanza IRPEF ogni anno." />
            <Spunta testo="Paghi tutto il prezzo ai lavori." />
          </View>
        </View>
      </View>
      <View style={{ marginTop: 16, borderWidth: 1, borderColor: BASE.linea, borderRadius: 8, paddingTop: 12, paddingHorizontal: 6 }}>
        <Text style={{ fontFamily: "Helvetica-Bold", fontSize: 8.5, color: BASE.ink, marginLeft: 8 }}>Quanto ti è tornato, anno dopo anno</Text>
        <Legenda voci={[{ colore: BASE.verde, testo: "Conto Termico" }, { colore: BASE.grigioChiaro, testo: `Detrazione ${r.detrazione.pct}% in 10 anni`, tratteggio: true }]} />
        <GraficoConfronto r={r} />
      </View>
      <Spinta />
      <Nota tono="arancio" icona="detrazione" titolo="Non si sommano." testo="Il Conto Termico non si cumula con altri incentivi dello Stato sullo stesso intervento: scegliendo il contributo, per questo impianto non si chiede la detrazione." />
    </Pagina>
  );
}

function Passaggi({ d, c }: { d: ContoTermicoPdfData; c: Palette }) {
  const passaggi = (d.testi?.passaggi?.length ? d.testi.passaggi : PASSAGGI_CONTO_TERMICO).slice(0, 6);
  const icone: NomeIcona[] = ["sopralluogo", "firma", "installazione", "pratiche", "pagamento", "verifica"];
  return (
    <Pagina d={d} c={c}>
      <Intestazione c={c} occhiello="I passaggi" titolo={"Dalla firma\n"} evidenza="al contributo." sottotitolo="Cosa succede, in ordine. I tempi del GSE dipendono dall'istruttoria della domanda." />
      <View style={{ flexDirection: "row" }}>
      <View style={{ flex: 1.25 }}>
        {passaggi.map((p, i) => (
          <View key={p.titolo} style={{ flexDirection: "row" }}>
            <View style={{ width: 30, alignItems: "center" }}>
              <View style={{ width: 22, height: 22, borderRadius: 11, backgroundColor: i === passaggi.length - 1 ? BASE.verde : c.navy, alignItems: "center", justifyContent: "center" }}>
                <IconaPdf nome={icone[i] ?? "verifica"} colore="#FFFFFF" lato={11} />
              </View>
              {i < passaggi.length - 1 ? <View style={{ width: 1.5, flexGrow: 1, minHeight: 16, backgroundColor: BASE.linea, marginVertical: 2 }} /> : null}
            </View>
            <View style={{ flex: 1, paddingLeft: 8, paddingBottom: 14 }}>
              <Text style={{ fontFamily: "Helvetica-Bold", fontSize: 6.5, letterSpacing: 1.1, color: BASE.arancio }}>{`PASSO ${i + 1}`}</Text>
              <Text style={{ fontFamily: "Helvetica-Bold", fontSize: 10, color: c.navy, marginTop: 2 }}>{p.titolo}</Text>
              <Text style={{ fontSize: 8, color: BASE.testo, marginTop: 2, lineHeight: 1.4 }}>{conEuro(p.testo)}</Text>
            </View>
          </View>
        ))}
      </View>
      {d.foto?.passaggi || d.foto?.installazione ? (
        <View style={{ flex: 1, marginLeft: 14 }}>
          <Foto src={d.foto?.passaggi} altezza={d.foto?.installazione ? 130 : 230} larghezza="100%" didascalia={false} />
          {d.foto?.installazione ? <Foto src={d.foto.installazione} altezza={120} larghezza="100%" didascalia={false} stile={{ marginTop: 8 }} /> : null}
          <Text style={{ fontSize: 6, color: BASE.grigioChiaro, marginTop: 3 }}>Immagini illustrative.</Text>
        </View>
      ) : null}
      </View>
      <View style={{ marginTop: 6 }}>
        <TitoletoSezione>I documenti da conservare</TitoletoSezione>
        <View style={{ flexDirection: "row", flexWrap: "wrap" }}>
          {DOCUMENTI_CONTO_TERMICO.map((doc, i) => (
            <View key={doc} style={{ width: (LARGHEZZA - 16) / 3, marginRight: i % 3 === 2 ? 0 : 8, marginBottom: 8, flexDirection: "row", alignItems: "center", backgroundColor: BASE.fondo, borderWidth: 1, borderColor: BASE.linea, borderRadius: 7, paddingVertical: 8, paddingHorizontal: 9 }}>
              <View style={{ marginRight: 6 }}><IconaPdf nome="documenti" colore={BASE.arancioScuro} lato={10} /></View>
              <Text style={{ flex: 1, fontFamily: "Helvetica-Bold", fontSize: 7.5, color: BASE.ink }}>{doc}</Text>
            </View>
          ))}
        </View>
      </View>
      <Spinta />
      <Nota tono="blu" icona="garanzia" titolo="Un impegno da conoscere." testo={`L'impianto va mantenuto per tutta la durata dell'incentivo e per i ${CONTO_TERMICO.anniDiMantenimento} anni successivi all'ultima rata: in quel periodo il GSE può fare controlli.`} />
    </Pagina>
  );
}

function Domande({ d, c }: { d: ContoTermicoPdfData; c: Palette }) {
  const faq = (d.testi?.faq?.length ? d.testi.faq : FAQ_CONTO_TERMICO).slice(0, 8);
  return (
    <Pagina d={d} c={c}>
      <Intestazione c={c} occhiello="Le tue domande" titolo={"Prima di scegliere,\n"} evidenza="le risposte." />
      {faq.map((q, i) => (
        <View key={q.domanda} wrap={false} style={{ paddingVertical: 8, borderTopWidth: i === 0 ? 0 : 1, borderTopColor: BASE.linea }}>
          <Text style={{ fontFamily: "Helvetica-Bold", fontSize: 9, color: c.navy }}>{q.domanda}</Text>
          <Text style={{ fontSize: 8, color: BASE.testo, marginTop: 3, lineHeight: 1.45 }}>{conEuro(q.risposta)}</Text>
        </View>
      ))}
      <Spinta />
      <Foto src={d.foto?.domande} altezza={118} />
    </Pagina>
  );
}

function Decisione({ d, r, c }: { d: ContoTermicoPdfData; r: ContoTermicoRisultato; c: Palette }) {
  const anni = r.anniBeneficio.length - 1;
  const contatti = [["Telefono", d.azienda.telefono], ["Email", d.azienda.email], ["Sito", d.azienda.sito]].filter(([, v]) => v) as [string, string][];
  return (
    <Pagina d={d} c={c}>
      <Intestazione c={c} occhiello="La tua decisione" titolo={"Pronto a\n"} evidenza="cambiare?" />
      <View style={{ borderRadius: 12, overflow: "hidden" }}>
        <Svg viewBox="0 0 503 190" style={{ position: "absolute", top: 0, left: 0, width: LARGHEZZA, height: 190 }}>
          <Defs>
            <LinearGradient id="ct-offerta" x1="0" y1="0" x2="1" y2="1">
              <Stop offset="0" stopColor={c.navyScuro} />
              <Stop offset="1" stopColor={c.navy} />
            </LinearGradient>
            <RadialGradient id="ct-offerta-calore" cx="0.5" cy="0.5" r="0.5">
              <Stop offset="0" stopColor={BASE.arancio} stopOpacity={0.45} />
              <Stop offset="1" stopColor={BASE.arancio} stopOpacity={0} />
            </RadialGradient>
          </Defs>
          <Rect x={0} y={0} width={503} height={190} fill="url(#ct-offerta)" />
          <Circle cx={440} cy={60} r={110} fill="url(#ct-offerta-calore)" />
        </Svg>
        <View style={{ height: 190, padding: 18 }}>
          <Text style={{ fontFamily: "Helvetica-Bold", fontSize: 6.5, letterSpacing: 1.3, color: BASE.ambra }}>{`RIEPILOGO OFFERTA · VALIDA ${d.preventivo.validitaGiorni} GIORNI`}</Text>
          <Text style={{ fontFamily: "Helvetica-Bold", fontSize: 13, color: "#FFFFFF", marginTop: 8, maxWidth: 380, lineHeight: 1.25 }}>{`${d.intervento.titolo}, chiavi in mano`}</Text>
          <Text style={{ fontFamily: "Helvetica-Bold", fontSize: 30, letterSpacing: -1, color: BASE.ambra, marginTop: 10 }}>{soldi(r.prezzo)}</Text>
          <Text style={{ fontSize: 8, color: "#FFFFFF", opacity: 0.8, marginTop: 4 }}>{`IVA ${d.economia.ivaPct}% inclusa · contributo GSE stimato ${soldi(r.contributo)}`}</Text>
          <Text style={{ fontSize: 8, color: "#FFFFFF", marginTop: 3 }}>{"Con il Conto Termico resta a te: "}<Text style={{ fontFamily: "Helvetica-Bold", color: BASE.ambra }}>{soldi(r.restaATe)}</Text></Text>
        </View>
      </View>

      <View style={{ marginTop: 16 }}>
        <TitoletoSezione>Cosa ti porta a casa</TitoletoSezione>
        <View style={{ flexDirection: "row" }}>
          <Kpi etichetta="Contributo" valore={soldi(r.contributo)} tono="arancio" />
          <Kpi etichetta="Risparmio annuo" valore={soldi(Math.max(0, r.risparmioAnnuo))} tono="verde" />
          <Kpi etichetta="Spesa ripagata" valore={r.anniDiRientro != null ? anniTesto(r.anniDiRientro) : "oltre"} tono="neutro" />
          <Kpi etichetta={`In ${anni} anni`} valore={soldi(r.beneficioFinale)} tono={r.beneficioFinale >= 0 ? "verde" : "rosso"} ultimo />
        </View>
      </View>

      <Foto src={d.foto?.decisione} altezza={128} stile={{ marginTop: 16 }} />
      <View style={{ flexDirection: "row", marginTop: 14 }}>
        <View style={{ flex: 1, marginRight: 18 }}>
          <TitoletoSezione>Per accettare la proposta</TitoletoSezione>
          {["Firma la proposta: online, con il link ricevuto, oppure su carta.", "Fissiamo il sopralluogo e la data dei lavori.", "Dopo i lavori raccogliamo insieme i documenti per il GSE."].map((t, i) => (
            <Text key={t} style={{ fontSize: 8, color: BASE.testo, lineHeight: 1.45, marginBottom: 3 }}>{`${i + 1}. ${t}`}</Text>
          ))}
        </View>
        <View style={{ flex: 1 }}>
          <TitoletoSezione>Per parlarne ancora</TitoletoSezione>
          {contatti.map(([etichetta, valore]) => (
            <View key={etichetta} style={{ flexDirection: "row", marginBottom: 4 }}>
              <Text style={{ width: 52, fontFamily: "Helvetica-Bold", fontSize: 6.5, letterSpacing: 0.8, color: BASE.grigio, marginTop: 1 }}>{etichetta.toUpperCase()}</Text>
              <Text style={{ flex: 1, fontSize: 8, color: BASE.ink }}>{valore}</Text>
            </View>
          ))}
        </View>
      </View>
    </Pagina>
  );
}

function Firma({ d, r, c }: { d: ContoTermicoPdfData; r: ContoTermicoRisultato; c: Palette }) {
  const sconto = d.economia.modalita === "sconto_in_fattura";
  const righe: [string, string][] = [
    ["Impresa", [d.azienda.nome, d.azienda.piva ? `P.IVA ${d.azienda.piva}` : null].filter(Boolean).join(" · ")],
    ["Committente", d.cliente.nome],
    ["Oggetto", `${d.intervento.titolo} al posto di: ${d.intervento.impiantoAttuale.toLowerCase()}`],
    ...(d.cliente.indirizzo ? [["Luogo dei lavori", d.cliente.indirizzo] as [string, string]] : []),
    ["Documento", `Preventivo ${d.preventivo.codice} del ${dataLunga(d.preventivo.dataIso)}`],
    ["Importo", `${soldi(r.prezzo)} IVA ${d.economia.ivaPct}% inclusa`],
    ["Contributo GSE", `${soldi(r.contributo)} stimato · ${sconto ? "scontato in fattura con mandato all'incasso" : "versato dal GSE al committente"}`],
    ["Validità", `${d.preventivo.validitaGiorni} giorni dalla data del documento`],
  ];
  return (
    <Pagina d={d} c={c}>
      <Intestazione c={c} occhiello="Per accettazione" titolo={"Firma della\n"} evidenza="proposta." />
      <View style={{ borderWidth: 1, borderColor: BASE.linea, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 4 }}>
        {righe.map(([k, v], i) => (
          <View key={k} style={{ flexDirection: "row", paddingVertical: 7, borderTopWidth: i === 0 ? 0 : 1, borderTopColor: BASE.linea }}>
            <Text style={{ width: 110, fontFamily: "Helvetica-Bold", fontSize: 6.5, letterSpacing: 0.9, color: BASE.grigio, marginTop: 1 }}>{k.toUpperCase()}</Text>
            <Text style={{ flex: 1, fontSize: 8.5, color: BASE.ink, fontFamily: k === "Importo" ? "Helvetica-Bold" : "Helvetica" }}>{v}</Text>
          </View>
        ))}
      </View>
      <View style={{ marginTop: 16, borderWidth: 1.2, borderColor: c.navy, borderStyle: "dashed", borderRadius: 10, padding: 16 }}>
        <Text style={{ fontSize: 8, color: BASE.testo, lineHeight: 1.45 }}>Il committente dichiara di aver ricevuto, letto e accettato la presente proposta in ogni sua parte: l'impianto, l'importo, il modo in cui riceve il contributo e le condizioni allegate. Sa che il contributo è stimato e che l'importo definitivo lo stabilisce il GSE.</Text>
        <View style={{ flexDirection: "row", marginTop: 34 }}>
          {["Luogo e data", `Per l'impresa · ${d.azienda.nome}`, `Firma del committente · ${d.cliente.nome}`].map((t, i) => (
            <View key={t} style={{ flex: 1, marginRight: i < 2 ? 14 : 0, borderTopWidth: 1, borderTopColor: BASE.grigioChiaro, paddingTop: 5 }}>
              <Text style={{ fontFamily: "Helvetica-Bold", fontSize: 6.5, letterSpacing: 0.8, color: BASE.grigio }}>{t.toUpperCase()}</Text>
            </View>
          ))}
        </View>
      </View>
    </Pagina>
  );
}

export function ContoTermicoPDF({ data }: { data: ContoTermicoPdfData }) {
  const c = palette(data.colorePrimario);
  const r = calcolaContoTermico(data.economia);
  return (
    <Document title={`Preventivo ${data.preventivo.codice} · Conto Termico 3.0`} author={data.azienda.nome} subject="Preventivo Conto Termico 3.0" language="it-IT">
      <Copertina d={data} r={r} c={c} />
      <CosaVuolDire d={data} c={c} />
      <Intervento d={data} c={c} />
      <Caratteristiche d={data} c={c} />
      <Incentivo d={data} r={r} c={c} />
      <Risparmio d={data} r={r} c={c} />
      <Beneficio d={data} r={r} c={c} />
      {r.detrazione ? <Confronto d={data} r={r} c={c} /> : null}
      <Passaggi d={data} c={c} />
      <Domande d={data} c={c} />
      <Decisione d={data} r={r} c={c} />
      <Firma d={data} r={r} c={c} />
    </Document>
  );
}
