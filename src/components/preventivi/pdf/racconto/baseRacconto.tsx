/**
 * Il documento «racconto»: le pagine dei preventivi che raccontano un intervento
 * coi numeri grandi, come il fotovoltaico (Conto Termico 3.0, Casa Full
 * Electric). Qui i pezzi comuni: colori, pagina con testata e piè di pagina,
 * intestazioni, riquadri, grafici. Le pagine di ogni preventivo (chi siamo, voce
 * per voce, condizioni, firma) stanno in `pagineRacconto`.
 *
 * Solo i caratteri incorporati (Helvetica): niente «−», «→», «✓», che spariscono.
 */
import type * as React from "react";
import { Circle, G, Image, Line, Page, Path, Rect, Svg, Text, View } from "@react-pdf/renderer";
import { IconaPdf } from "@/components/preventivi/pdf/IconaPdf";
import type { NomeIcona } from "../../../../../supabase/functions/_shared/iconePreventivo";
import { anniTesto } from "@/lib/contoTermico/calcoli";
import { BASE, LARGHEZZA, MARGINE, PDF_EURO, TONI, areeSopraSotto, soldi, type Palette, type Tono } from "./temaRacconto";
import { htmlToRichBlocks } from "@/lib/ristrutturazione/richTextPdf";
import type { DocEdileDati } from "@/components/preventivi/pdf/documentoEdileTipi";

/** Quello che ogni documento racconto ha: chi lo manda, a chi, quale preventivo. */
export interface DatiRacconto {
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
  /**
   * Le pagine che ogni preventivo ha — chi siamo, voce per voce, foto, garanzie,
   * recensioni, condizioni e firma — con i dati del documento degli altri
   * interventi (adattatoreEdile). Senza (le anteprime d'esempio) quelle pagine non escono.
   */
  standard?: DocEdileDati | null;
}

// ─── Pezzi comuni ───────────────────────────────────────────────────────────
export function Testata({ d, c }: { d: DatiRacconto; c: Palette }) {
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

export function PiePagina({ d }: { d: DatiRacconto }) {
  const contatti = [d.azienda.nome, d.azienda.sito, d.azienda.telefono].filter(Boolean).join(" · ");
  return (
    <View fixed style={{ position: "absolute", bottom: 0, left: 0, right: 0, paddingHorizontal: MARGINE, paddingTop: 8, paddingBottom: 18, flexDirection: "row", justifyContent: "space-between", borderTopWidth: 1, borderTopColor: BASE.linea }}>
      <Text style={{ fontSize: 6.5, color: BASE.grigioChiaro }}>{contatti}</Text>
      <Text style={{ fontSize: 6.5, color: BASE.grigio, fontFamily: "Helvetica-Bold" }} render={({ pageNumber, totalPages }) => `${pageNumber} / ${totalPages}`} />
    </View>
  );
}

export function Pagina({ d, c, children }: { d: DatiRacconto; c: Palette; children: React.ReactNode }) {
  return (
    <Page size="A4" style={{ fontFamily: "Helvetica", fontSize: 9, color: BASE.testo, paddingTop: 64, paddingBottom: 54, paddingHorizontal: MARGINE, backgroundColor: "#FFFFFF" }}>
      <Testata d={d} c={c} />
      {children}
      <PiePagina d={d} />
    </Page>
  );
}

/**
 * Occhiello, titolo con la parte in arancio, sottotitolo. La parte in arancio è
 * `evidenza`, oppure le parole fra asterischi del titolo («Le parole di chi
 * *ci ha scelto*.»), come nei titoli delle pagine scritti dall'azienda.
 */
export function Intestazione({ c, occhiello, titolo, evidenza, sottotitolo }: { c: Palette; occhiello: string; titolo: string; evidenza?: string; sottotitolo?: string | null }) {
  const pezzi = titolo.split("*");
  return (
    <View style={{ marginBottom: 16 }}>
      <Text style={{ fontFamily: "Helvetica-Bold", fontSize: 7, letterSpacing: 1.4, color: BASE.arancio, marginBottom: 7 }}>{occhiello.toUpperCase()}</Text>
      <Text style={{ fontFamily: "Helvetica-Bold", fontSize: 27, lineHeight: 1.1, letterSpacing: -0.9, color: c.navy }}>
        {pezzi.map((p, i) => (i % 2 === 1 ? <Text key={i} style={{ color: BASE.arancio }}>{p}</Text> : p))}
        {evidenza ? <Text style={{ color: BASE.arancio }}>{evidenza}</Text> : null}
      </Text>
      {sottotitolo ? <Text style={{ fontSize: 9.5, lineHeight: 1.45, color: BASE.grigio, marginTop: 8, maxWidth: 440 }}>{sottotitolo}</Text> : null}
    </View>
  );
}

export function Kpi({ etichetta, valore, nota, tono = "neutro", grande = false, ultimo = false }: { etichetta: string; valore: string; nota?: string; tono?: Tono; grande?: boolean; ultimo?: boolean }) {
  const t = TONI[tono];
  return (
    <View style={{ flex: 1, backgroundColor: t.fondo, borderWidth: 1, borderColor: t.bordo, borderRadius: 8, paddingVertical: 10, paddingHorizontal: 11, marginRight: ultimo ? 0 : 8 }}>
      <Text style={{ fontFamily: "Helvetica-Bold", fontSize: 6.5, letterSpacing: 1, color: t.etichetta }}>{etichetta.toUpperCase()}</Text>
      <Text style={{ fontFamily: "Helvetica-Bold", fontSize: grande ? 24 : 18, letterSpacing: -0.6, color: t.valore, marginTop: 5 }}>{valore}</Text>
      {nota ? <Text style={{ fontSize: 7, color: BASE.grigio, marginTop: 3, lineHeight: 1.35 }}>{nota}</Text> : null}
    </View>
  );
}

export function Nota({ tono = "blu", titolo, testo, icona = "verifica" }: { tono?: Tono; titolo: string; testo: string; icona?: NomeIcona }) {
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

export function TitoletoSezione({ children }: { children: string }) {
  return <Text style={{ fontFamily: "Helvetica-Bold", fontSize: 9.5, color: BASE.ink, marginBottom: 7 }}>{children}</Text>;
}

export function Spinta() {
  return <View style={{ flexGrow: 1 }} />;
}

/** Una foto con gli angoli arrotondati e la dicitura «illustrativa». */
export function Foto({ src, altezza, larghezza = LARGHEZZA, didascalia = true, stile }: { src?: string | null; altezza: number; larghezza?: number | string; didascalia?: boolean; stile?: Record<string, unknown> }) {
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
export function GraficoSpesa({ oggi, domani, etichettaOggi, etichettaDomani, c, formato = soldi, sottoDifferenza = "ogni anno" }: {
  oggi: number; domani: number; etichettaOggi: string; etichettaDomani: string; c: Palette;
  /** Come si scrivono i valori: di serie in euro («2.100 €»); per la CO2 in tonnellate. */
  formato?: (n: number) => string;
  sottoDifferenza?: string;
}) {
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
      <Text x={x1 + barra / 2} y={base - altezza(oggi) - 7} fill={BASE.arancioScuro} style={{ fontSize: 11, fontFamily: "Helvetica-Bold", textAnchor: "middle" } as never}>{formato(oggi)}</Text>
      <Text x={x2 + barra / 2} y={base - altezza(domani) - 7} fill={BASE.verdeScuro} style={{ fontSize: 11, fontFamily: "Helvetica-Bold", textAnchor: "middle" } as never}>{formato(domani)}</Text>
      <Text x={x1 + barra / 2} y={base + 14} fill={BASE.grigio} style={{ fontSize: 7.5, textAnchor: "middle" } as never}>{etichettaOggi}</Text>
      <Text x={x2 + barra / 2} y={base + 14} fill={BASE.grigio} style={{ fontSize: 7.5, textAnchor: "middle" } as never}>{etichettaDomani}</Text>
      {oggi > domani ? (
        <G>
          <Path d={`M ${w * 0.82} ${base - altezza(oggi)} L ${w * 0.82} ${base - altezza(domani)}`} stroke={c.navy} strokeWidth={1.2} strokeDasharray="3 2" />
          <Path d={`M ${w * 0.82 - 4} ${base - altezza(domani) - 6} L ${w * 0.82} ${base - altezza(domani)} L ${w * 0.82 + 4} ${base - altezza(domani) - 6}`} stroke={c.navy} strokeWidth={1.2} fill="none" />
          <Text x={w * 0.82 + 8} y={(2 * base - altezza(oggi) - altezza(domani)) / 2} fill={c.navy} style={{ fontSize: 10, fontFamily: "Helvetica-Bold" } as never}>{`-${formato(oggi - domani)}`}</Text>
          <Text x={w * 0.82 + 8} y={(2 * base - altezza(oggi) - altezza(domani)) / 2 + 11} fill={BASE.grigio} style={{ fontSize: 7 } as never}>{sottoDifferenza}</Text>
        </G>
      ) : null}
    </Svg>
  );
}

/** Il cumulato anno per anno: sotto lo zero finché la spesa non è ripagata. */
export function GraficoCumulato({ anni, rientro, c }: { anni: { anno: number; cumulato: number }[]; rientro: number | null; c: Palette }) {
  const w = LARGHEZZA - 14; const h = 205;
  const padL = 46; const padR = 16; const padT = 16; const padB = 24;
  const valori = anni.map((a) => a.cumulato);
  const min = Math.min(0, ...valori); const max = Math.max(0, ...valori);
  const span = max - min || 1;
  const xOf = (i: number) => padL + (i * (w - padL - padR)) / Math.max(1, anni.length - 1);
  const yOf = (v: number) => padT + ((max - v) * (h - padT - padB)) / span;
  const zero = yOf(0);
  const punti = anni.map((a, i) => ({ x: xOf(i), y: yOf(a.cumulato) }));
  const linea = punti.map((p, i) => `${i === 0 ? "M" : "L"} ${p.x} ${p.y}`).join(" ");
  const aree = areeSopraSotto(punti, zero);
  const rientroX = rientro != null && rientro > 0
    ? padL + (rientro * (w - padL - padR)) / Math.max(1, anni.length - 1)
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
      <Circle cx={punti[ultimo].x} cy={punti[ultimo].y} r={3.4} fill={anni[ultimo].cumulato >= 0 ? BASE.verde : BASE.rosso} />
      {rientroX != null ? (
        <G>
          <Line x1={rientroX} y1={padT} x2={rientroX} y2={h - padB} stroke={BASE.arancio} strokeWidth={1} strokeDasharray="3 2" />
          <Rect x={etichettaX} y={padT + 2} width={100} height={17} rx={3} fill={BASE.arancio} />
          <Text x={etichettaX + 50} y={padT + 13.5} fill="#FFFFFF" style={{ fontSize: 7, fontFamily: "Helvetica-Bold", textAnchor: "middle" } as never}>{`SPESA RIPAGATA · ${anniTesto(rientro ?? 0).toUpperCase()}`}</Text>
        </G>
      ) : null}
    </Svg>
  );
}

export function Legenda({ voci }: { voci: { colore: string; testo: string; tratteggio?: boolean }[] }) {
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

// ─── Riquadri ───────────────────────────────────────────────────────────────
export function Scheda({ icona, titolo, testo, c, ultimaColonna }: { icona: NomeIcona; titolo: string; testo: string; c: Palette; ultimaColonna: boolean }) {
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

export function Spunta({ testo }: { testo: string }) {
  return (
    <View style={{ flexDirection: "row", marginBottom: 5 }}>
      <View style={{ marginRight: 6, marginTop: 1 }}><IconaPdf nome="verifica" colore={BASE.verde} lato={9} /></View>
      <Text style={{ flex: 1, fontSize: 8, lineHeight: 1.4, color: BASE.testo }}>{testo}</Text>
    </View>
  );
}

/** Testo scritto dall'azienda nell'editor (chi siamo, modalità di pagamento). */
export function TestoRicco({ html, stile }: { html: string | null | undefined; stile: Record<string, unknown> }) {
  const blocchi = htmlToRichBlocks(html);
  if (!blocchi.length) return null;
  return (
    <View>
      {blocchi.map((b, i) => {
        const righe = b.runs.map((r, j) => (
          <Text key={j} style={r.bold ? { fontFamily: r.italic ? "Helvetica-BoldOblique" : "Helvetica-Bold" } : r.italic ? { fontFamily: "Helvetica-Oblique" } : {}}>{r.text}</Text>
        ));
        return b.type === "bullet" ? (
          <View key={i} style={{ flexDirection: "row", marginBottom: 3 }}>
            <Text style={[stile, { width: 10 }]}>•</Text>
            <Text style={[stile, { flex: 1 }]}>{righe}</Text>
          </View>
        ) : (
          <Text key={i} style={[stile, { marginBottom: 6 }]}>{righe}</Text>
        );
      })}
    </View>
  );
}

