// src/components/orders/generali/pdf/GraficiPdf.tsx
// I grafici dei PDF delle operazioni (Dossier, rendiconto all'investitore), disegnati in
// vettoriale con l'SVG di react-pdf: restano nitidi a qualsiasi ingrandimento e il testo
// delle legende resta testo. I conti stanno in lib/orders/generali/graficiPdf.ts.
// Larghezza utile di una pagina A4 coi margini dei nostri PDF: 515 punti.
import { Fragment, type ReactNode } from "react";
import { Circle, Line, Path, Polygon, Polyline, Rect, Svg, Text as SvgText, Text, View } from "@react-pdf/renderer";
import {
  cifraCompatta, fetteTorta, passiCascata, passoEtichette, percorsoSpicchio, scalaAsse,
} from "@/lib/orders/generali/graficiPdf";

export const COLORI_GRAFICI = {
  navy: "#1E3A5F",
  orange: "#F97316",
  green: "#047857",
  greenChiaro: "#a7f3d0",
  red: "#b91c1c",
  redChiaro: "#fecaca",
  gray200: "#e5e7eb",
  gray300: "#d1d5db",
  gray400: "#9ca3af",
  gray500: "#6b7280",
  gray700: "#374151",
  gray900: "#111827",
};
const C = COLORI_GRAFICI;

// «always»: in italiano Intl non mette il punto nelle cifre a quattro.
const EURO = new Intl.NumberFormat("it-IT", { maximumFractionDigits: 0, useGrouping: "always" });
const soldi = (n: number) => `${n < -0.5 ? "-" : ""}€ ${EURO.format(Math.abs(n))}`;
const percento = (q: number) => `${(q * 100).toLocaleString("it-IT", { maximumFractionDigits: q < 0.1 ? 1 : 0 })}%`;

export const LARGHEZZA_PAGINA = 515;

/** Il riquadro che tiene un grafico: titolo piccolo, il disegno, una nota. Non si spezza tra due pagine. */
export function RiquadroGrafico({ titolo, nota, children, larghezza }: { titolo?: string; nota?: string; children: ReactNode; larghezza?: number | string }) {
  return (
    <View wrap={false} style={{ width: larghezza ?? "100%", border: `0.5pt solid ${C.gray200}`, borderRadius: 4, padding: 8, marginBottom: 8 }}>
      {titolo ? <Text style={{ fontSize: 7, fontFamily: "Helvetica-Bold", color: C.gray500, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 4 }}>{titolo}</Text> : null}
      {children}
      {nota ? <Text style={{ fontSize: 6.5, color: C.gray500, marginTop: 4, lineHeight: 1.35 }}>{nota}</Text> : null}
    </View>
  );
}

/** Due o tre riquadri affiancati. */
export function FilaGrafici({ children }: { children: ReactNode }) {
  return <View style={{ flexDirection: "row", gap: 8 }} wrap={false}>{children}</View>;
}

// ── Torta (a ciambella) ────────────────────────────────────────────────────

/**
 * Ciambella con la legenda accanto: nome, importo e quota di ogni fetta. Al centro il totale.
 * `diametro` in punti; la legenda prende il resto della larghezza.
 */
export function Torta({ voci, diametro = 104, centro, massimo = 7, compatta = false }: {
  voci: { nome: string; valore: number; colore?: string }[];
  diametro?: number;
  centro?: { valore: string; etichetta: string };
  massimo?: number;
  /** Legenda senza importi, per i riquadri stretti. */
  compatta?: boolean;
}) {
  const fette = fetteTorta(voci, massimo);
  if (fette.length === 0) return null;
  const r = diametro / 2;
  let da = 0;
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
      <Svg viewBox={`0 0 ${diametro} ${diametro}`} style={{ width: diametro, height: diametro }}>
        {fette.map((f) => {
          const percorso = percorsoSpicchio(r, r, r, r * 0.58, da, da + f.quota);
          da += f.quota;
          return <Path key={f.nome} d={percorso} fill={f.colore} stroke="#ffffff" strokeWidth={fette.length > 1 ? 0.8 : 0} />;
        })}
        {centro ? (
          <>
            <SvgText x={r} y={r + 1} textAnchor="middle" style={{ fontSize: diametro > 90 ? 9.5 : 8, fontFamily: "Helvetica-Bold" }} fill={C.gray900}>{centro.valore}</SvgText>
            <SvgText x={r} y={r + 10} textAnchor="middle" style={{ fontSize: 6 }} fill={C.gray500}>{centro.etichetta}</SvgText>
          </>
        ) : null}
      </Svg>
      <View style={{ flex: 1, maxWidth: compatta ? undefined : 280 }}>
        {fette.map((f) => (
          <View key={f.nome} style={{ flexDirection: "row", alignItems: "center", gap: 4, marginBottom: 2.5 }}>
            <View style={{ width: 7, height: 7, borderRadius: 1.5, backgroundColor: f.colore }} />
            <Text style={{ fontSize: 7, color: C.gray700, flex: 1 }}>{f.nome}</Text>
            {compatta ? null : <Text style={{ fontSize: 7, color: C.gray700, width: 62, textAlign: "right" }}>{soldi(f.valore)}</Text>}
            <Text style={{ fontSize: 7, fontFamily: "Helvetica-Bold", color: C.gray900, width: 28, textAlign: "right" }}>{percento(f.quota)}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}

// ── Anello di avanzamento ──────────────────────────────────────────────────

/** Un anello che si riempie: lavori al 70%, unità vendute 3 su 4. `quota` da 0 a 1. */
export function Anello({ quota, valore, etichetta, sotto, colore = C.navy, diametro = 58 }: {
  quota: number | null; valore: string; etichetta: string; sotto?: string; colore?: string; diametro?: number;
}) {
  const q = quota === null || !Number.isFinite(quota) ? 0 : Math.max(0, Math.min(1, quota));
  const r = diametro / 2;
  return (
    <View style={{ alignItems: "center", flex: 1 }}>
      <Svg viewBox={`0 0 ${diametro} ${diametro}`} style={{ width: diametro, height: diametro }}>
        <Path d={percorsoSpicchio(r, r, r, r * 0.76, 0, 0.99999)} fill={C.gray200} />
        {q > 0.001 ? <Path d={percorsoSpicchio(r, r, r, r * 0.76, 0, q >= 0.9999 ? 0.99999 : q)} fill={colore} /> : null}
        <SvgText x={r} y={r + 3} textAnchor="middle" style={{ fontSize: diametro > 50 ? 10 : 8.5, fontFamily: "Helvetica-Bold" }} fill={C.gray900}>{valore}</SvgText>
      </Svg>
      <Text style={{ fontSize: 7.5, fontFamily: "Helvetica-Bold", color: C.gray700, marginTop: 3, textAlign: "center" }}>{etichetta}</Text>
      {sotto ? <Text style={{ fontSize: 6.5, color: C.gray500, marginTop: 1, textAlign: "center" }}>{sotto}</Text> : null}
    </View>
  );
}

// ── Cascata: dai ricavi al margine ─────────────────────────────────────────

/**
 * Barre flottanti, come le candele: la prima sono i ricavi, ogni gruppo di costi scende dal
 * livello raggiunto, l'ultima è il margine. Si legge subito dove se ne vanno i soldi.
 */
export function Cascata({ ricavi, costi, larghezza = LARGHEZZA_PAGINA - 18, altezza = 150, massimo = 7 }: {
  ricavi: number; costi: { nome: string; valore: number }[]; larghezza?: number; altezza?: number; massimo?: number;
}) {
  const passi = passiCascata(ricavi, costi, massimo);
  if (passi.length < 3 && ricavi <= 0) return null;
  const livelli = passi.flatMap((p) => [p.da, p.a]);
  const asse = scalaAsse(Math.min(...livelli), Math.max(...livelli), 4);
  const sx = 34;
  const sopra = 12;
  const sotto = 4;
  const h = altezza - sopra - sotto;
  const y = (v: number) => sopra + ((asse.max - v) / (asse.max - asse.min || 1)) * h;
  const passo = (larghezza - sx) / passi.length;
  const barra = Math.min(42, passo * 0.62);
  const colore = (t: (typeof passi)[number]["tipo"], v: number) =>
    t === "totale" ? C.green : t === "meno" ? C.red : t === "piu" ? C.green : v < 0 ? C.red : C.navy;
  return (
    <View>
      <Svg viewBox={`0 0 ${larghezza} ${altezza}`} style={{ width: larghezza, height: altezza }}>
        {asse.valori.map((v) => (
          <Line key={v} x1={sx} x2={larghezza} y1={y(v)} y2={y(v)} stroke={v === 0 ? C.gray700 : C.gray200} strokeWidth={v === 0 ? 0.7 : 0.4} />
        ))}
        {asse.valori.map((v) => (
          <SvgText key={`t${v}`} x={sx - 3} y={y(v) + 2} textAnchor="end" style={{ fontSize: 5.5 }} fill={C.gray500}>{cifraCompatta(v)}</SvgText>
        ))}
        {passi.map((p, i) => {
          const x = sx + i * passo + (passo - barra) / 2;
          const alto = Math.min(y(p.da), y(p.a));
          const hb = Math.max(0.8, Math.abs(y(p.da) - y(p.a)));
          const prossimo = passi[i + 1];
          const differenza = p.a - p.da;
          return (
            <Fragment key={i}>
              <Rect x={x} y={alto} width={barra} height={hb} fill={colore(p.tipo, p.a)} rx={1} />
              {prossimo && prossimo.tipo !== "risultato" ? (
                <Line x1={x + barra} x2={x + passo} y1={y(p.a)} y2={y(p.a)} stroke={C.gray400} strokeWidth={0.5} strokeDasharray="2 1.5" />
              ) : null}
              <SvgText x={x + barra / 2} y={alto - 2.5} textAnchor="middle" style={{ fontSize: 6, fontFamily: "Helvetica-Bold" }} fill={C.gray700}>
                {p.tipo === "meno" ? cifraCompatta(differenza) : cifraCompatta(p.a)}
              </SvgText>
            </Fragment>
          );
        })}
      </Svg>
      <View style={{ flexDirection: "row", paddingLeft: sx }}>
        {passi.map((p, i) => (
          <Text key={i} style={{ width: passo, fontSize: 5.8, color: i === 0 || i === passi.length - 1 ? C.gray900 : C.gray500, fontFamily: i === 0 || i === passi.length - 1 ? "Helvetica-Bold" : "Helvetica", textAlign: "center", paddingHorizontal: 1, lineHeight: 1.2 }}>{p.nome}</Text>
        ))}
      </View>
    </View>
  );
}

// ── Linee nel tempo ────────────────────────────────────────────────────────

export interface SerieLinea {
  nome: string;
  colore: string;
  valori: (number | null)[];
  /** Riempie l'area tra la linea e lo zero (verde sopra, del suo colore sotto). */
  area?: boolean;
  tratteggio?: boolean;
}

/**
 * Una o più serie mese per mese, con lo zero marcato. `evidenzia` segna un punto (il picco del
 * capitale), `oggi` divide il passato dalla stima con una riga verticale.
 */
export function Linee({ etichette, serie, larghezza = LARGHEZZA_PAGINA - 18, altezza = 130, evidenzia, oggi }: {
  etichette: string[]; serie: SerieLinea[]; larghezza?: number; altezza?: number;
  evidenzia?: { indice: number; testo: string } | null; oggi?: number | null;
}) {
  const n = etichette.length;
  if (n < 2) return null;
  const tutti = serie.flatMap((s) => s.valori.filter((v): v is number => v !== null && Number.isFinite(v)));
  if (tutti.length === 0) return null;
  const asse = scalaAsse(Math.min(...tutti), Math.max(...tutti), 4);
  const sx = 34;
  const sopra = 10;
  const sotto = 14;
  const h = altezza - sopra - sotto;
  const x = (i: number) => sx + (i * (larghezza - sx - 6)) / (n - 1);
  const y = (v: number) => sopra + ((asse.max - v) / (asse.max - asse.min || 1)) * h;
  const passo = passoEtichette(n, 9);
  return (
    <View>
      <Svg viewBox={`0 0 ${larghezza} ${altezza}`} style={{ width: larghezza, height: altezza }}>
        {asse.valori.map((v) => (
          <Line key={v} x1={sx} x2={larghezza - 6} y1={y(v)} y2={y(v)} stroke={v === 0 ? C.gray700 : C.gray200} strokeWidth={v === 0 ? 0.7 : 0.4} />
        ))}
        {asse.valori.map((v) => (
          <SvgText key={`t${v}`} x={sx - 3} y={y(v) + 2} textAnchor="end" style={{ fontSize: 5.5 }} fill={C.gray500}>{cifraCompatta(v)}</SvgText>
        ))}
        {/* La fascia della stima solo se i mesi a venire sono almeno due: uno solo è una riga sul bordo. */}
        {oggi !== null && oggi !== undefined && oggi > 0 && oggi <= n - 2 ? (
          <>
            <Rect x={x(oggi)} y={sopra} width={Math.max(0, larghezza - 6 - x(oggi))} height={h} fill="#f3f4f6" />
            <SvgText x={x(oggi) + 3} y={sopra + 7} style={{ fontSize: 5.5 }} fill={C.gray500}>stima</SvgText>
          </>
        ) : null}
        {serie.filter((s) => s.area).map((s) => {
          const punti = s.valori.map((v, i) => (v === null ? null : `${x(i).toFixed(2)},${y(v).toFixed(2)}`)).filter(Boolean) as string[];
          if (punti.length < 2) return null;
          const primo = s.valori.findIndex((v) => v !== null);
          const ultimo = s.valori.length - 1 - [...s.valori].reverse().findIndex((v) => v !== null);
          return (
            <Polygon key={`a${s.nome}`} points={`${x(primo).toFixed(2)},${y(0).toFixed(2)} ${punti.join(" ")} ${x(ultimo).toFixed(2)},${y(0).toFixed(2)}`} fill={s.colore} fillOpacity={0.12} />
          );
        })}
        {serie.map((s) => {
          const punti = s.valori.map((v, i) => (v === null ? null : `${x(i).toFixed(2)},${y(v).toFixed(2)}`)).filter(Boolean) as string[];
          return punti.length >= 2 ? (
            <Polyline key={s.nome} points={punti.join(" ")} fill="none" stroke={s.colore} strokeWidth={s.tratteggio ? 1 : 1.6} strokeDasharray={s.tratteggio ? "3 2" : undefined} />
          ) : null;
        })}
        {serie.filter((s) => !s.tratteggio && n <= 24).flatMap((s) =>
          s.valori.map((v, i) => (v === null ? null : <Circle key={`${s.nome}${i}`} cx={x(i)} cy={y(v)} r={1.3} fill={s.colore} />)))}
        {evidenzia && serie[0]?.valori[evidenzia.indice] !== null && serie[0]?.valori[evidenzia.indice] !== undefined ? (
          <>
            <Circle cx={x(evidenzia.indice)} cy={y(serie[0].valori[evidenzia.indice] as number)} r={3} fill={C.orange} />
            {/* Un fondo bianco sotto la cifra: le altre linee non ci passano sopra. */}
            <Rect x={x(evidenzia.indice) - evidenzia.testo.length * 1.75 - 2} y={y(serie[0].valori[evidenzia.indice] as number) + 4.5} width={evidenzia.testo.length * 3.5 + 4} height={8} fill="#ffffff" rx={1.5} />
            <SvgText x={x(evidenzia.indice)} y={y(serie[0].valori[evidenzia.indice] as number) + 10.5} textAnchor="middle" style={{ fontSize: 6, fontFamily: "Helvetica-Bold" }} fill={C.orange}>{evidenzia.testo}</SvgText>
          </>
        ) : null}
        {etichette.map((e, i) => i % passo === 0 ? (
          <SvgText key={`x${i}`} x={x(i)} y={altezza - 3} textAnchor="middle" style={{ fontSize: 5.5 }} fill={C.gray500}>{e}</SvgText>
        ) : null)}
      </Svg>
      <LegendaGrafico voci={serie.map((s) => ({ colore: s.colore, testo: s.nome, tratteggio: s.tratteggio }))} />
    </View>
  );
}

// ── Barre mensili: entrate sopra, uscite sotto, cumulato in linea ──────────

export function BarreMensili({ etichette, entrate, uscite, cumulato, larghezza = LARGHEZZA_PAGINA - 18, altezza = 140 }: {
  etichette: string[]; entrate: number[]; uscite: number[]; cumulato?: number[]; larghezza?: number; altezza?: number;
}) {
  const n = etichette.length;
  if (n === 0) return null;
  const valori = [...entrate, ...uscite.map((u) => -Math.abs(u)), ...(cumulato ?? [])];
  const asse = scalaAsse(Math.min(...valori), Math.max(...valori), 4);
  const sx = 34;
  const sopra = 8;
  const sotto = 14;
  const h = altezza - sopra - sotto;
  const passo = (larghezza - sx - 4) / n;
  const barra = Math.max(1.5, Math.min(16, passo * 0.38));
  const xc = (i: number) => sx + i * passo + passo / 2;
  const y = (v: number) => sopra + ((asse.max - v) / (asse.max - asse.min || 1)) * h;
  const pe = passoEtichette(n, 10);
  return (
    <View>
      <Svg viewBox={`0 0 ${larghezza} ${altezza}`} style={{ width: larghezza, height: altezza }}>
        {asse.valori.map((v) => (
          <Line key={v} x1={sx} x2={larghezza - 4} y1={y(v)} y2={y(v)} stroke={v === 0 ? C.gray700 : C.gray200} strokeWidth={v === 0 ? 0.7 : 0.4} />
        ))}
        {asse.valori.map((v) => (
          <SvgText key={`t${v}`} x={sx - 3} y={y(v) + 2} textAnchor="end" style={{ fontSize: 5.5 }} fill={C.gray500}>{cifraCompatta(v)}</SvgText>
        ))}
        {entrate.map((v, i) => (v > 0.5 ? <Rect key={`e${i}`} x={xc(i) - barra - 0.4} y={y(v)} width={barra} height={Math.max(0.5, y(0) - y(v))} fill={C.green} /> : null))}
        {uscite.map((v, i) => (Math.abs(v) > 0.5 ? <Rect key={`u${i}`} x={xc(i) + 0.4} y={y(0)} width={barra} height={Math.max(0.5, y(-Math.abs(v)) - y(0))} fill={C.red} /> : null))}
        {cumulato && n >= 2 ? (
          <Polyline points={cumulato.map((v, i) => `${xc(i).toFixed(2)},${y(v).toFixed(2)}`).join(" ")} fill="none" stroke={C.navy} strokeWidth={1.4} />
        ) : null}
        {cumulato ? cumulato.map((v, i) => <Circle key={`c${i}`} cx={xc(i)} cy={y(v)} r={1.2} fill={C.navy} />) : null}
        {etichette.map((e, i) => (i % pe === 0 ? <SvgText key={`x${i}`} x={xc(i)} y={altezza - 3} textAnchor="middle" style={{ fontSize: 5.5 }} fill={C.gray500}>{e}</SvgText> : null))}
      </Svg>
      <LegendaGrafico voci={[
        { colore: C.green, testo: "Entrate" }, { colore: C.red, testo: "Uscite" },
        ...(cumulato ? [{ colore: C.navy, testo: "Cassa cumulata" }] : []),
      ]} />
    </View>
  );
}

// ── Barre orizzontali: previsto contro stima, per categoria ────────────────

export function BarreConfronto({ righe, nomi = ["Previsto", "Stima finale"], colori = [C.gray300, C.navy] }: {
  righe: { nome: string; a: number; b: number }[]; nomi?: [string, string]; colori?: [string, string];
}) {
  const utili = righe.filter((r) => Math.abs(r.a) > 0.5 || Math.abs(r.b) > 0.5);
  if (utili.length === 0) return null;
  const max = Math.max(1, ...utili.flatMap((r) => [Math.abs(r.a), Math.abs(r.b)]));
  const w = (v: number) => `${Math.max(0.4, (Math.abs(v) / max) * 100)}%`;
  return (
    <View>
      {utili.map((r) => {
        const diff = r.b - r.a;
        return (
          <View key={r.nome} style={{ flexDirection: "row", alignItems: "center", marginBottom: 4 }} wrap={false}>
            <Text style={{ width: "29%", fontSize: 6.8, color: C.gray700, paddingRight: 4 }}>{r.nome}</Text>
            <View style={{ width: "43%" }}>
              <View style={{ height: 5, width: w(r.a), backgroundColor: colori[0], marginBottom: 1.2, borderRadius: 1 }} />
              <View style={{ height: 5, width: w(r.b), backgroundColor: colori[1], borderRadius: 1 }} />
            </View>
            <Text style={{ width: "16%", fontSize: 7, textAlign: "right", fontFamily: "Helvetica-Bold", color: C.gray900 }}>{soldi(r.b)}</Text>
            <Text style={{ width: "12%", fontSize: 6.5, textAlign: "right", color: Math.abs(diff) < 1 ? C.gray400 : C.gray500 }}>
              {Math.abs(diff) < 1 ? "=" : `${diff > 0 ? "+" : "-"}${cifraCompatta(Math.abs(diff))}`}
            </Text>
          </View>
        );
      })}
      <LegendaGrafico voci={[{ colore: colori[0], testo: nomi[0] }, { colore: colori[1], testo: nomi[1] }]} />
    </View>
  );
}

// ── Barra impilata: le parti di un intero (incassato, da incassare) ────────

export function BarraImpilata({ parti, altezza = 10 }: { parti: { nome: string; valore: number; colore: string }[]; altezza?: number }) {
  const utili = parti.filter((p) => p.valore > 0.5);
  const totale = utili.reduce((t, p) => t + p.valore, 0);
  if (totale <= 0) return null;
  return (
    <View>
      <View style={{ flexDirection: "row", height: altezza, borderRadius: 2, overflow: "hidden" }}>
        {utili.map((p) => <View key={p.nome} style={{ flex: p.valore, backgroundColor: p.colore }} />)}
      </View>
      <LegendaGrafico voci={utili.map((p) => ({ colore: p.colore, testo: `${p.nome} ${soldi(p.valore)} (${percento(p.valore / totale)})` }))} />
    </View>
  );
}

export function LegendaGrafico({ voci }: { voci: { colore: string; testo: string; tratteggio?: boolean }[] }) {
  return (
    <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10, marginTop: 3 }}>
      {voci.map((v) => (
        <View key={v.testo} style={{ flexDirection: "row", alignItems: "center", gap: 3 }}>
          {v.tratteggio
            ? <View style={{ width: 10, height: 0, borderTop: `1pt dashed ${v.colore}` }} />
            : <View style={{ width: 7, height: 7, borderRadius: 1.5, backgroundColor: v.colore }} />}
          <Text style={{ fontSize: 6.5, color: C.gray500 }}>{v.testo}</Text>
        </View>
      ))}
    </View>
  );
}
