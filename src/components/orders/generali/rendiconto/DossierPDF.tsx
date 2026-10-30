// src/components/orders/generali/rendiconto/DossierPDF.tsx
// Il dossier di rendicontazione della commessa generale: copertina, sintesi con i semafori,
// poi solo le sezioni scelte (DatiDossier.sezioni). Stessa carta del rendiconto all'investitore
// e del rendiconto d'appalto: A4 verticale, Helvetica, blu e arancio. I grafici sono barre
// disegnate con i riquadri di react-pdf: niente immagini, il testo resta testo.
import type { ReactNode } from "react";
import { Document, Image, Page, StyleSheet, Text, View } from "@react-pdf/renderer";
import {
  NOMI_SEZIONE, giornoIt,
  type DatiDossier, type NumeroChiave, type RigaPianoDossier, type Tono,
} from "@/lib/orders/generali/rendiconto";

const C = {
  navy: "#1E3A5F",
  navyChiaro: "#dbe4ef",
  orange: "#F97316",
  gray50: "#f9fafb",
  gray100: "#f3f4f6",
  gray200: "#e5e7eb",
  gray400: "#9ca3af",
  gray500: "#6b7280",
  gray700: "#374151",
  gray900: "#111827",
  green: "#047857",
  greenChiaro: "#d1fae5",
  amber: "#b45309",
  amberChiaro: "#fef3c7",
  red: "#b91c1c",
  redChiaro: "#fee2e2",
  white: "#ffffff",
};

const TONO: Record<Tono, { fondo: string; testo: string; nome: string }> = {
  verde: { fondo: C.greenChiaro, testo: C.green, nome: "Bene" },
  giallo: { fondo: C.amberChiaro, testo: C.amber, nome: "Da guardare" },
  rosso: { fondo: C.redChiaro, testo: C.red, nome: "Intervenire" },
};

const s = StyleSheet.create({
  page: { fontFamily: "Helvetica", fontSize: 9, color: C.gray900, padding: 40, paddingBottom: 64 },
  // Copertina
  coverBand: { backgroundColor: C.navy, marginHorizontal: -40, marginTop: -40, paddingHorizontal: 40, paddingTop: 48, paddingBottom: 36 },
  coverAzienda: { flexDirection: "row", gap: 12, alignItems: "center", marginBottom: 56 },
  coverLogo: { width: 52, height: 52, objectFit: "contain", backgroundColor: C.white, borderRadius: 4 },
  coverAziendaNome: { fontSize: 14, fontFamily: "Helvetica-Bold", color: C.white },
  coverAziendaMeta: { fontSize: 8, color: C.navyChiaro, marginTop: 2 },
  // Senza spaziatura tra le lettere: il testo del PDF resta copiabile e cercabile.
  coverKicker: { fontSize: 10, color: C.orange, fontFamily: "Helvetica-Bold", marginBottom: 8 },
  coverTitolo: { fontSize: 26, fontFamily: "Helvetica-Bold", color: C.white, lineHeight: 1.2 },
  coverSotto: { fontSize: 11, color: C.navyChiaro, marginTop: 8 },
  coverDati: { flexDirection: "row", flexWrap: "wrap", marginTop: 28, gap: 10 },
  coverDato: { width: "48%", borderLeft: `2pt solid ${C.orange}`, paddingLeft: 8, paddingVertical: 2, marginBottom: 10 },
  coverDatoLabel: { fontSize: 7, color: C.gray500, textTransform: "uppercase", letterSpacing: 0.5 },
  coverDatoValore: { fontSize: 11, fontFamily: "Helvetica-Bold", color: C.gray900, marginTop: 2 },
  indice: { marginTop: 18 },
  indiceRiga: { flexDirection: "row", gap: 8, paddingVertical: 3, borderBottom: `0.25pt solid ${C.gray200}` },
  indiceNumero: { width: 18, fontSize: 9, color: C.orange, fontFamily: "Helvetica-Bold" },
  indiceNome: { fontSize: 9, color: C.gray700 },
  // Testata delle pagine interne
  header: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-end", paddingBottom: 6, marginBottom: 14, borderBottom: `1.5pt solid ${C.navy}` },
  headerSx: { fontSize: 9, fontFamily: "Helvetica-Bold", color: C.navy },
  headerDx: { fontSize: 8, color: C.gray500 },
  // Sezioni
  sezione: { marginBottom: 16 },
  h2: { fontSize: 13, fontFamily: "Helvetica-Bold", color: C.navy, marginBottom: 2 },
  h2Sotto: { fontSize: 8, color: C.gray500, marginBottom: 8 },
  label: { fontSize: 7, fontFamily: "Helvetica-Bold", color: C.gray500, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 4, marginTop: 6 },
  numeri: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 8 },
  numero: { width: "31.8%", backgroundColor: C.gray50, border: `0.5pt solid ${C.gray200}`, borderRadius: 4, padding: 7 },
  numeroLabel: { fontSize: 7, color: C.gray500, marginBottom: 2 },
  numeroValore: { fontSize: 12, fontFamily: "Helvetica-Bold" },
  numeroNota: { fontSize: 6.5, color: C.gray500, marginTop: 1 },
  semaforo: { flexDirection: "row", alignItems: "center", gap: 8, borderRadius: 4, paddingVertical: 5, paddingHorizontal: 8, marginBottom: 4 },
  pallino: { width: 9, height: 9, borderRadius: 4.5 },
  semaforoTitolo: { width: 110, fontSize: 8.5, fontFamily: "Helvetica-Bold" },
  semaforoTesto: { flex: 1, fontSize: 8.5, color: C.gray700 },
  semaforoStato: { fontSize: 7, fontFamily: "Helvetica-Bold", textTransform: "uppercase" },
  thead: { flexDirection: "row", backgroundColor: C.navy, paddingVertical: 4, paddingHorizontal: 6 },
  th: { fontSize: 6.8, fontFamily: "Helvetica-Bold", color: C.white, textTransform: "uppercase" },
  tr: { flexDirection: "row", borderBottom: `0.25pt solid ${C.gray200}`, paddingVertical: 3.5, paddingHorizontal: 6, alignItems: "center" },
  trTot: { flexDirection: "row", backgroundColor: C.gray100, paddingVertical: 4, paddingHorizontal: 6 },
  td: { fontSize: 8 },
  bold: { fontFamily: "Helvetica-Bold" },
  destra: { textAlign: "right", paddingRight: 4 },
  nota: { fontSize: 7.5, color: C.gray500, marginTop: 4, lineHeight: 1.4 },
  testo: { fontSize: 9, color: C.gray700, lineHeight: 1.5 },
  barraFondo: { height: 5, backgroundColor: C.gray200, borderRadius: 2.5, flex: 1 },
  foto: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  fotoBox: { width: "31.8%", marginBottom: 6 },
  fotoImg: { width: "100%", height: 110, objectFit: "cover", borderRadius: 3 },
  fotoDid: { fontSize: 6.8, color: C.gray700, marginTop: 2, lineHeight: 1.3 },
  footer: { position: "absolute", bottom: 24, left: 40, right: 40, flexDirection: "row", justifyContent: "space-between", borderTop: `0.5pt solid ${C.gray200}`, paddingTop: 6 },
  footerText: { fontSize: 7, color: C.gray500 },
});

// «always»: in italiano Intl non mette il punto nelle cifre a quattro (3000 invece di 3.000).
const EURO = new Intl.NumberFormat("it-IT", { maximumFractionDigits: 0, useGrouping: "always" });
/**
 * «€ 1.250.000», «-€ 3.500». Il trattino normale, non il segno meno (U+2212): l'Helvetica
 * standard del PDF non ha quel carattere e lo lascia cadere, e un'uscita diventerebbe un'entrata.
 */
const soldi = (n: number | null | undefined) =>
  n === null || n === undefined || !Number.isFinite(n) ? "—" : `${n < -0.5 ? "-" : ""}€ ${EURO.format(Math.abs(n))}`;
const conSegno = (n: number) => (Math.abs(n) < 1 ? "—" : `${n > 0 ? "+" : ""}${soldi(n)}`);
const percento = (n: number | null | undefined) =>
  n === null || n === undefined || !Number.isFinite(n) ? "—" : `${(n * 100).toLocaleString("it-IT", { maximumFractionDigits: 1 })}%`;
const MESI = ["gen", "feb", "mar", "apr", "mag", "giu", "lug", "ago", "set", "ott", "nov", "dic"];
const mese = (m: string | null | undefined) => (m && /^\d{4}-\d{2}/.test(m) ? `${MESI[Number(m.slice(5, 7)) - 1]} ${m.slice(2, 4)}` : "—");
const valoreNumero = (n: NumeroChiave) =>
  n.formato === "euro" ? soldi(typeof n.valore === "number" ? n.valore : null)
    : n.formato === "percento" ? percento(typeof n.valore === "number" ? n.valore : null)
      : n.valore === null ? "—" : String(n.valore);

function Titolo({ sezione, sotto }: { sezione: keyof typeof NOMI_SEZIONE; sotto?: string }) {
  return (
    <View>
      <Text style={s.h2}>{NOMI_SEZIONE[sezione].nome}</Text>
      <Text style={s.h2Sotto}>{sotto ?? NOMI_SEZIONE[sezione].aiuto}</Text>
    </View>
  );
}

function Numero({ n }: { n: NumeroChiave }) {
  const negativo = typeof n.valore === "number" && n.valore < 0;
  return (
    <View style={s.numero}>
      <Text style={s.numeroLabel}>{n.etichetta}</Text>
      <Text style={[s.numeroValore, negativo ? { color: C.red } : {}]}>{valoreNumero(n)}</Text>
      {n.nota ? <Text style={s.numeroNota}>{n.nota}</Text> : null}
    </View>
  );
}

/** Una tabella semplice: colonne con larghezza e allineamento. */
interface Col { titolo: string; w: string; destra?: boolean }
/**
 * L'intestazione non resta mai da sola in fondo alla pagina: va insieme alla prima riga, e
 * con quello che la precede (`prima`: il titolo della sezione o un'etichetta).
 */
function Tabella({ col, righe, totale, prima }: { col: Col[]; righe: (string | ReactNode)[][]; totale?: string[]; prima?: ReactNode }) {
  const riga = (r: (string | ReactNode)[], i: number) => (
    <View key={i} style={s.tr} wrap={false}>
      {r.map((v, j) => typeof v === "string"
        ? <Text key={j} style={[s.td, { width: col[j].w }, col[j].destra ? s.destra : {}]}>{v}</Text>
        : <View key={j} style={{ width: col[j].w }}>{v}</View>)}
    </View>
  );
  return (
    <View>
      <View wrap={false}>
        {prima}
        <View style={s.thead}>
          {col.map((c, i) => <Text key={i} style={[s.th, { width: c.w }, c.destra ? s.destra : {}]}>{c.titolo}</Text>)}
        </View>
        {righe.length > 0 ? riga(righe[0], 0) : null}
      </View>
      {righe.slice(1).map((r, i) => riga(r, i + 1))}
      {totale ? (
        <View style={s.trTot} wrap={false}>
          {totale.map((v, j) => <Text key={j} style={[s.td, s.bold, { width: col[j].w }, col[j].destra ? s.destra : {}]}>{v}</Text>)}
        </View>
      ) : null}
    </View>
  );
}

function Barra({ quota, colore = C.navy }: { quota: number; colore?: string }) {
  const q = Math.max(0, Math.min(100, quota));
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
      <View style={s.barraFondo}>
        <View style={{ width: `${q}%`, height: 5, backgroundColor: colore, borderRadius: 2.5 }} />
      </View>
      <Text style={[s.td, { width: 24, textAlign: "right" }]}>{Math.round(q)}%</Text>
    </View>
  );
}

/** Barre verticali con lo zero: sopra in un colore, sotto in un altro. */
function GraficoBarre({ valori, etichette, alto = 90, colori }: {
  valori: number[]; etichette: string[]; alto?: number; colori?: { su: string; giu: string; evidenzia?: number };
}) {
  const max = Math.max(1, ...valori.map((v) => Math.max(0, v)));
  const min = Math.min(0, ...valori);
  const campo = max - min || 1;
  const hSu = (max / campo) * alto;
  const hGiu = alto - hSu;
  const n = valori.length;
  const passo = Math.max(1, Math.ceil(n / 8));
  return (
    <View wrap={false} style={{ marginTop: 4, marginBottom: 2 }}>
      <View style={{ flexDirection: "row", alignItems: "flex-end", height: hSu, gap: n > 40 ? 0.5 : 1.5 }}>
        {valori.map((v, i) => (
          <View key={i} style={{ flex: 1, height: v > 0 ? Math.max(0.5, (v / campo) * alto) : 0, backgroundColor: i === colori?.evidenzia ? C.orange : colori?.su ?? C.navy }} />
        ))}
      </View>
      <View style={{ height: 0.75, backgroundColor: C.gray700 }} />
      <View style={{ flexDirection: "row", alignItems: "flex-start", height: hGiu, gap: n > 40 ? 0.5 : 1.5 }}>
        {valori.map((v, i) => (
          <View key={i} style={{ flex: 1, height: v < 0 ? Math.max(0.5, (-v / campo) * alto) : 0, backgroundColor: i === colori?.evidenzia ? C.orange : colori?.giu ?? C.red }} />
        ))}
      </View>
      <View style={{ flexDirection: "row", marginTop: 2 }}>
        {etichette.map((e, i) => (
          <Text key={i} style={{ flex: 1, fontSize: 5.5, color: C.gray500, textAlign: "center" }}>{i % passo === 0 ? e : ""}</Text>
        ))}
      </View>
    </View>
  );
}

/** Due barre orizzontali a confronto (previsto e stima) per una riga. */
function Confronto({ etichetta, a, b, max }: { etichetta: string; a: number; b: number; max: number }) {
  const w = (v: number) => `${Math.max(0, Math.min(100, (Math.abs(v) / (max || 1)) * 100))}%`;
  return (
    <View style={{ flexDirection: "row", alignItems: "center", marginBottom: 5 }} wrap={false}>
      <Text style={[s.td, { width: "18%" }]}>{etichetta}</Text>
      <View style={{ width: "58%" }}>
        <View style={{ height: 6, width: w(a), backgroundColor: C.gray400, marginBottom: 1.5 }} />
        <View style={{ height: 6, width: w(b), backgroundColor: b < 0 ? C.red : C.navy }} />
      </View>
      <View style={{ width: "24%" }}>
        <Text style={[s.td, s.destra, { color: C.gray500, fontSize: 7 }]}>{soldi(a)}</Text>
        <Text style={[s.td, s.destra, s.bold, { fontSize: 7.5 }]}>{soldi(b)}</Text>
      </View>
    </View>
  );
}

function Legenda({ voci }: { voci: { colore: string; testo: string }[] }) {
  return (
    <View style={{ flexDirection: "row", gap: 12, marginTop: 2, marginBottom: 6 }}>
      {voci.map((v) => (
        <View key={v.testo} style={{ flexDirection: "row", alignItems: "center", gap: 3 }}>
          <View style={{ width: 7, height: 7, backgroundColor: v.colore }} />
          <Text style={{ fontSize: 7, color: C.gray500 }}>{v.testo}</Text>
        </View>
      ))}
    </View>
  );
}

// ── Le sezioni ──────────────────────────────────────────────────────────────

function Sintesi({ d }: { d: DatiDossier }) {
  if (!d.sintesi) return null;
  return (
    <View style={s.sezione}>
      <Titolo sezione="sintesi" sotto={`Situazione al ${giornoIt(d.data)}`} />
      <View style={s.numeri}>{d.sintesi.numeri.map((n) => <Numero key={n.etichetta} n={n} />)}</View>
      {d.sintesi.semafori.length > 0 ? (
        <View wrap={false}>
          <Text style={s.label}>Semafori</Text>
          {d.sintesi.semafori.map((x) => (
            <View key={x.id} style={[s.semaforo, { backgroundColor: TONO[x.tono].fondo }]}>
              <View style={[s.pallino, { backgroundColor: TONO[x.tono].testo }]} />
              <Text style={s.semaforoTitolo}>{x.titolo}</Text>
              <Text style={s.semaforoTesto}>{x.testo}</Text>
              <Text style={[s.semaforoStato, { color: TONO[x.tono].testo }]}>{TONO[x.tono].nome}</Text>
            </View>
          ))}
          <Text style={s.nota}>Verde: in linea. Giallo: da tenere d'occhio. Rosso: chiede un intervento.</Text>
        </View>
      ) : null}
    </View>
  );
}

function Avanzamento({ d }: { d: DatiDossier }) {
  const a = d.avanzamento;
  if (!a) return null;
  const conImporti = a.scala !== null;
  const col: Col[] = conImporti
    ? [{ titolo: d.operazione.figliaTante, w: "30%" }, { titolo: "Stato", w: "16%" }, { titolo: "Avanzamento", w: "18%" }, { titolo: "Importo", w: "12%", destra: true }, { titolo: "Fatturato", w: "12%", destra: true }, { titolo: "Incassato", w: "12%", destra: true }]
    : [{ titolo: d.operazione.figliaTante, w: "50%" }, { titolo: "Stato", w: "25%" }, { titolo: "Avanzamento", w: "25%" }];
  const titolo = <Titolo sezione="avanzamento" sotto={`Lavori al ${a.medio ?? 0}% · ${d.operazione.figlie} ${d.operazione.figliaTante.toLowerCase()}`} />;
  return (
    <View style={s.sezione}>
      {a.scala ? (
        <View style={s.numeri} wrap={false}>
          <View style={{ width: "100%" }}>{titolo}</View>
          <Numero n={{ etichetta: a.scala.valoreEtichetta, valore: a.scala.valore ?? a.scala.assegnato, formato: "euro" }} />
          <Numero n={{ etichetta: "Eseguito", valore: a.scala.eseguito, formato: "euro" }} />
          <Numero n={{ etichetta: "Fatturato", valore: a.scala.fatturato, formato: "euro" }} />
          <Numero n={{ etichetta: "Incassato", valore: a.scala.incassato, formato: "euro" }} />
          <Numero n={{ etichetta: "Da incassare", valore: a.scala.daIncassare, formato: "euro", nota: "fatturato e non ancora pagato" }} />
        </View>
      ) : null}
      {a.figlie.length > 0 ? (
        <Tabella
          prima={a.scala ? undefined : titolo}
          col={col}
          righe={a.figlie.map((f) => {
            const base = [[f.codice, f.nome].filter(Boolean).join(" · "), f.stato ?? "—", <Barra key="b" quota={f.avanzamento} />];
            return conImporti ? [...base, soldi(f.importo), soldi(f.fatturato), soldi(f.incassato)] : base;
          })}
        />
      ) : <>{a.scala ? null : titolo}<Text style={s.nota}>Nessuna commessa dentro, per ora.</Text></>}
    </View>
  );
}

function Foto({ d }: { d: DatiDossier }) {
  if (d.foto.length === 0) return null;
  return (
    <View style={s.sezione}>
      {Array.from({ length: Math.ceil(d.foto.length / 3) }, (_, r) => (
        <View key={r} wrap={false}>
          {r === 0 ? <Titolo sezione="foto" /> : null}
          <View style={s.foto}>
            {d.foto.slice(r * 3, r * 3 + 3).map((f, i) => (
              <View key={i} style={s.fotoBox}>
                <Image src={f.src} style={s.fotoImg} />
                <Text style={s.fotoDid}>{f.didascalia}</Text>
              </View>
            ))}
          </View>
        </View>
      ))}
    </View>
  );
}

function righePiano(righe: RigaPianoDossier[], costi: boolean) {
  return righe.map((r) => [
    r.etichetta, soldi(r.previsto), soldi(r.reale), soldi(r.aFinire), soldi(r.stima),
    <Text key="s" style={[s.td, s.destra, { color: Math.abs(r.scostamento) < 1 ? C.gray500 : (costi ? r.scostamento < 0 : r.scostamento > 0) ? C.green : C.red }]}>{conSegno(r.scostamento)}</Text>,
  ]);
}

const COL_PIANO = (prima: string): Col[] => [
  { titolo: prima, w: "28%" }, { titolo: "Previsto", w: "12%", destra: true }, { titolo: "Reale", w: "12%", destra: true },
  { titolo: "A finire", w: "12%", destra: true }, { titolo: "Stima finale", w: "18%", destra: true }, { titolo: "Scostamento", w: "18%", destra: true },
];

function Piano({ d }: { d: DatiDossier }) {
  const p = d.piano;
  if (!p) return null;
  const t = p.totali;
  const max = Math.max(t.ricavi.previsto, t.ricavi.stima, t.costi.previsto, t.costi.stima, Math.abs(t.margine.stima), 1);
  const tot = (x: typeof t.ricavi, nome: string) => [nome, soldi(x.previsto), soldi(x.reale), soldi(x.aFinire), soldi(x.stima), conSegno(x.scostamento)];
  return (
    <View style={s.sezione}>
      <View wrap={false}>
        <Titolo sezione="piano" sotto={`${p.versione ? `${p.versione} · ` : ""}importi al netto dell'IVA · stima finale = reale + a finire`} />
        <Confronto etichetta="Ricavi" a={t.ricavi.previsto} b={t.ricavi.stima} max={max} />
        <Confronto etichetta="Costi" a={t.costi.previsto} b={t.costi.stima} max={max} />
        <Confronto etichetta="Margine" a={t.margine.previsto} b={t.margine.stima} max={max} />
        <Legenda voci={[{ colore: C.gray400, testo: "Previsto" }, { colore: C.navy, testo: "Stima finale" }]} />
      </View>
      {p.ricavi.length > 0 ? (
        <View>
          <Tabella prima={<Text style={s.label}>Ricavi</Text>} col={COL_PIANO("Voce")} righe={righePiano(p.ricavi, false)} totale={tot(t.ricavi, "Totale ricavi")} />
        </View>
      ) : null}
      {p.costi.length > 0 ? (
        <View>
          <Tabella prima={<Text style={s.label}>Costi</Text>} col={COL_PIANO("Voce")} righe={righePiano(p.costi, true)} totale={tot(t.costi, "Totale costi")} />
        </View>
      ) : null}
      <View style={[s.trTot, { backgroundColor: C.navy, marginTop: 6 }]} wrap={false}>
        {tot(t.margine, "Margine").map((v, j) => (
          <Text key={j} style={[s.td, s.bold, { color: j === 4 ? C.orange : C.white, width: COL_PIANO("")[j].w }, j > 0 ? s.destra : {}]}>{v}</Text>
        ))}
      </View>
      <View style={[s.numeri, { marginTop: 8 }]} wrap={false}>
        <Numero n={{ etichetta: "Margine sui ricavi", valore: p.indicatori.marginePct, formato: "percento" }} />
        <Numero n={{ etichetta: "ROI (margine sui costi)", valore: p.indicatori.roi, formato: "percento" }} />
        <Numero n={{ etichetta: "TIR annuo stimato", valore: p.indicatori.tir, formato: "percento", nota: p.indicatori.durataMesi ? `durata ${p.indicatori.durataMesi} mesi` : undefined }} />
        {p.indicatori.costoMq !== null ? <Numero n={{ etichetta: "Costo di cantiere al m²", valore: p.indicatori.costoMq, formato: "euro" }} /> : null}
        {p.indicatori.prezzoMq !== null ? <Numero n={{ etichetta: "Ricavo al m²", valore: p.indicatori.prezzoMq, formato: "euro" }} /> : null}
        {p.indicatori.pareggioMq !== null ? <Numero n={{ etichetta: "Pareggio al m²", valore: p.indicatori.pareggioMq, formato: "euro" }} /> : null}
      </View>
      {p.avvisi.map((a, i) => <Text key={i} style={s.nota}>· {a}</Text>)}
    </View>
  );
}

function Andamento({ d }: { d: DatiDossier }) {
  const a = d.andamento;
  if (!a || a.length === 0) return null;
  const ultimo = a[a.length - 1];
  return (
    <View style={s.sezione}>
      <View wrap={false}>
        <Titolo sezione="andamento" sotto="Margine stimato a fine operazione, come risultava a ogni fine mese" />
        <GraficoBarre valori={a.map((x) => x.margineStima)} etichette={a.map((x) => mese(x.mese))} alto={70} colori={{ su: C.navy, giu: C.red }} />
      </View>
      <Tabella
        col={[{ titolo: "Mese", w: "16%" }, { titolo: "Ricavi stimati", w: "18%", destra: true }, { titolo: "Costi stimati", w: "18%", destra: true }, { titolo: "Margine stimato", w: "16%", destra: true }, { titolo: "Margine previsto", w: "16%", destra: true }, { titolo: "Capitale investito", w: "16%", destra: true }]}
        righe={a.slice(-12).map((x) => [mese(x.mese), soldi(x.ricaviStima), soldi(x.costiStima), soldi(x.margineStima), soldi(x.marginePrevisto), soldi(x.capitaleInvestito)])}
      />
      <Text style={s.nota}>
        {a.length > 12 ? `Gli ultimi 12 mesi di ${a.length}. ` : ""}Ultima fotografia ({mese(ultimo.mese)}): margine stimato {soldi(ultimo.margineStima)} contro {soldi(ultimo.marginePrevisto)} previsti.
      </Text>
    </View>
  );
}

function Cassa({ d }: { d: DatiDossier }) {
  const c = d.cassa;
  if (!c) return null;
  const picco = c.mesi.findIndex((m) => m.mese === c.meseCapitaleMassimo);
  return (
    <View style={s.sezione}>
      <View style={s.numeri} wrap={false}>
        <View style={{ width: "100%" }}>
          <Titolo sezione="cassa" sotto="Cassa cumulata dell'operazione mese per mese: sotto lo zero è il capitale che le fonti devono coprire" />
        </View>
        <Numero n={{ etichetta: "Capitale massimo impegnato", valore: c.capitaleMassimo, formato: "euro", nota: c.meseCapitaleMassimo ? `a ${mese(c.meseCapitaleMassimo)}` : undefined }} />
        <Numero n={{ etichetta: "Previsto all'inizio", valore: c.capitaleMassimoPrevisto, formato: "euro" }} />
        <Numero n={{ etichetta: "Capitale investito oggi", valore: c.capitaleInvestitoOggi, formato: "euro", nota: "costi registrati meno incassi" }} />
      </View>
      {c.mesi.length > 0 ? (
        <>
          <GraficoBarre valori={c.mesi.map((m) => m.cumulato)} etichette={c.mesi.map((m) => mese(m.mese))} colori={{ su: C.green, giu: C.navy, evidenzia: picco >= 0 ? picco : undefined }} />
          <Legenda voci={[{ colore: C.navy, testo: "Capitale impegnato" }, { colore: C.green, testo: "Cassa positiva" }, { colore: C.orange, testo: "Picco" }]} />
          <Tabella
            col={[{ titolo: "Mese", w: "20%" }, { titolo: "Entrate", w: "20%", destra: true }, { titolo: "Uscite", w: "20%", destra: true }, { titolo: "Netto", w: "20%", destra: true }, { titolo: "Cumulato", w: "20%", destra: true }]}
            righe={c.mesi.map((m) => [`${mese(m.mese)}${m.passato ? "" : " *"}`, soldi(m.entrate), soldi(m.uscite), soldi(m.netto), soldi(m.cumulato)])}
          />
          <Text style={s.nota}>* mesi futuri: stima dal piano economico.</Text>
        </>
      ) : null}
    </View>
  );
}

function Fonti({ d }: { d: DatiDossier }) {
  const f = d.fonti;
  if (!f) return null;
  const max = Math.max(1, ...f.copertura.map((x) => x.impegno));
  return (
    <View style={s.sezione}>
      <View wrap={false}>
        <Titolo sezione="fonti" />
        <Text style={s.label}>Chi copre il fabbisogno</Text>
        {f.copertura.map((x) => <Confronto key={x.nome} etichetta={x.nome} a={x.impegno} b={x.dentro} max={max} />)}
        <Legenda voci={[{ colore: C.gray400, testo: "Impegno" }, { colore: C.navy, testo: "Versato o erogato" }]} />
        <Text style={s.nota}>
          Impegni {soldi(f.totali.impegno)}, già dentro {soldi(f.totali.dentro)}, ancora da versare {soldi(f.totali.daVersare)}.
          {f.scoperto >= 1 ? ` Per coprire il picco di cassa mancano ${soldi(f.scoperto)}.` : ""}
        </Text>
      </View>
      {f.debito.length > 0 ? (
        <View>
          <Tabella
            prima={<Text style={s.label}>Debito</Text>}
            col={[{ titolo: "Fonte", w: "26%" }, { titolo: "Forma", w: "16%" }, { titolo: "Deliberato", w: "14%", destra: true }, { titolo: "Erogato", w: "14%", destra: true }, { titolo: "Tasso", w: "8%", destra: true }, { titolo: "Scadenza", w: "10%", destra: true }, { titolo: "Interessi", w: "12%", destra: true }]}
            righe={f.debito.map((x) => [x.nome, x.forma, soldi(x.impegno), soldi(x.dentro), x.tassoPct === null ? "—" : `${x.tassoPct.toLocaleString("it-IT")}%`, giornoIt(x.scadenza), soldi(x.interessi)])}
          />
          <Text style={s.nota}>
            Costo del debito stimato: interessi {soldi(f.costoDebito.interessi)}, spese {soldi(f.costoDebito.spese)}, totale {soldi(f.costoDebito.totale)}
            {f.costoDebito.costoAnnuo !== null ? ` (${percento(f.costoDebito.costoAnnuo)} l'anno sul capitale medio)` : ""}.
          </Text>
        </View>
      ) : null}
      {f.rendimenti ? (
        <View wrap={false}>
          <Text style={s.label}>Rendimenti</Text>
          <View style={s.numeri}>
            <Numero n={{ etichetta: "ROI dell'operazione", valore: f.rendimenti.roi, formato: "percento", nota: `margine prima del debito ${soldi(f.rendimenti.margineProgetto)} su ${soldi(f.rendimenti.capitaleProgetto)}` }} />
            <Numero n={{ etichetta: "TIR del progetto", valore: f.rendimenti.tirProgetto, formato: "percento" }} />
            <Numero n={{ etichetta: "ROE dei mezzi propri", valore: f.rendimenti.roe, formato: "percento", nota: f.rendimenti.utileMezziPropri !== null ? `utile ai mezzi propri ${soldi(f.rendimenti.utileMezziPropri)}` : "senza mezzi propri tra le fonti" }} />
            <Numero n={{ etichetta: "TIR dei mezzi propri", valore: f.rendimenti.tirMezziPropri, formato: "percento" }} />
            <Numero n={{ etichetta: "Effetto leva", valore: f.rendimenti.leva === null ? null : `${f.rendimenti.leva >= 0 ? "+" : "-"}${(Math.abs(f.rendimenti.leva) * 100).toLocaleString("it-IT", { maximumFractionDigits: 1 })} punti`, formato: "testo", nota: "ROE meno ROI" }} />
          </View>
        </View>
      ) : null}
    </View>
  );
}

function Investitori({ d }: { d: DatiDossier }) {
  const inv = d.investitori;
  if (!inv || inv.length === 0) return null;
  return (
    <View style={s.sezione}>
      <Tabella
        prima={<Titolo sezione="investitori" sotto="Capitale messo, rendimento stimato e quanto spetta a fine operazione" />}
        col={[{ titolo: "Socio o investitore", w: "24%" }, { titolo: "Tipo", w: "16%" }, { titolo: "Impegno", w: "12%", destra: true }, { titolo: "Dentro oggi", w: "12%", destra: true }, { titolo: "Rendimento", w: "12%", destra: true }, { titolo: "Rend. %", w: "8%", destra: true }, { titolo: "Spetta a fine", w: "16%", destra: true }]}
        righe={inv.map((x) => [x.nome, x.tipo + (x.quotaPct !== null ? ` · ${percento(x.quotaPct)}` : ""), soldi(x.impegno), soldi(x.dentro), `${x.rendimentoNome} ${soldi(x.rendimentoStima)}`, percento(x.rendimentoPct), soldi(x.spettaAFine)])}
        totale={["Totale", "", soldi(inv.reduce((t, x) => t + x.impegno, 0)), soldi(inv.reduce((t, x) => t + x.dentro, 0)), soldi(inv.reduce((t, x) => t + x.rendimentoStima, 0)), "", soldi(inv.reduce((t, x) => t + x.spettaAFine, 0))]}
      />
      <Text style={s.nota}>Rendimento: utile (a capitale) o interessi (a prestito) stimati a fine operazione. Spetta a fine: capitale da restituire più rendimento non ancora pagato.</Text>
    </View>
  );
}

function Unita({ d }: { d: DatiDossier }) {
  const u = d.unita;
  if (!u) return null;
  const stati = [
    { k: "rogitata" as const, nome: "Rogitate", colore: C.green },
    { k: "compromesso" as const, nome: "A compromesso", colore: C.navy },
    { k: "prenotata" as const, nome: "Prenotate", colore: C.orange },
    { k: "libera" as const, nome: "Libere", colore: C.gray400 },
  ];
  const conImporti = u.venduto !== null;
  return (
    <View style={s.sezione}>
      <View wrap={false}>
        <Titolo sezione="unita" sotto={`${u.totale} ${d.operazione.figliaTante.toLowerCase()}`} />
        <View style={{ flexDirection: "row", height: 12, borderRadius: 3, overflow: "hidden", marginBottom: 3 }}>
          {stati.map((x) => (u.conteggi[x.k] > 0 ? <View key={x.k} style={{ flex: u.conteggi[x.k], backgroundColor: x.colore }} /> : null))}
        </View>
        <Legenda voci={stati.map((x) => ({ colore: x.colore, testo: `${x.nome} ${u.conteggi[x.k]}` }))} />
      </View>
      {conImporti ? (
        <View style={s.numeri} wrap={false}>
          <Numero n={{ etichetta: "Venduto", valore: u.venduto, formato: "euro", nota: "compromessi e rogiti" }} />
          <Numero n={{ etichetta: "Prenotato", valore: u.prenotato, formato: "euro" }} />
          <Numero n={{ etichetta: "Ancora in vendita", valore: u.inVendita, formato: "euro", nota: "a prezzo di listino" }} />
          <Numero n={{ etichetta: "Incassato dagli acquirenti", valore: u.incassato, formato: "euro" }} />
          <Numero n={{ etichetta: "Da incassare sul venduto", valore: u.daIncassare, formato: "euro" }} />
        </View>
      ) : null}
      <Tabella
        col={conImporti
          ? [{ titolo: "Unità", w: "18%" }, { titolo: "Tipologia", w: "18%" }, { titolo: "m²", w: "8%", destra: true }, { titolo: "Stato", w: "14%" }, { titolo: "Prezzo", w: "14%", destra: true }, { titolo: "Incassato", w: "14%", destra: true }, { titolo: "Residuo", w: "14%", destra: true }]
          : [{ titolo: "Unità", w: "30%" }, { titolo: "Tipologia", w: "30%" }, { titolo: "m²", w: "15%", destra: true }, { titolo: "Stato", w: "25%" }]}
        righe={u.elenco.map((x) => {
          const base = [x.sigla, x.tipologia ?? "—", x.mq === null ? "—" : x.mq.toLocaleString("it-IT"), x.stato];
          return conImporti ? [...base, soldi(x.prezzo), soldi(x.incassato), soldi(x.residuo)] : base;
        })}
      />
    </View>
  );
}

function Contratto({ d }: { d: DatiDossier }) {
  const k = d.contratto;
  if (!k) return null;
  const v = k.valore;
  return (
    <View style={s.sezione}>
      <View style={s.numeri} wrap={false}>
        <View style={{ width: "100%" }}>
          <Titolo sezione="contratto" sotto={[k.riferimento, k.cig ? `CIG ${k.cig}` : null, k.cup ? `CUP ${k.cup}` : null].filter(Boolean).join(" · ") || undefined} />
        </View>
        <Numero n={{ etichetta: "Valore aggiornato", valore: v?.aggiornato ?? null, formato: "euro", nota: v ? `base ${soldi(v.base)}, ribasso ${soldi(v.ribasso)}, sicurezza ${soldi(v.sicurezza)}, atti ${soldi(v.atti)}` : undefined }} />
        <Numero n={{ etichetta: "Messo a SAL", valore: k.aSal, formato: "euro" }} />
        <Numero n={{ etichetta: "Fatturato · incassato", valore: `${soldi(k.fatture.emesso)} · ${soldi(k.fatture.incassato)}`, formato: "testo" }} />
        <Numero n={{ etichetta: "Ritenute da svincolare", valore: k.ritenute.daSvincolare, formato: "euro", nota: `trattenute ${soldi(k.ritenute.trattenute)}, svincolate ${soldi(k.ritenute.svincolate)}` }} />
        <Numero n={{ etichetta: "Anticipazione da recuperare", valore: k.anticipazione.daRecuperare, formato: "euro", nota: `ricevuta ${soldi(k.anticipazione.importo)}, recuperata ${soldi(k.anticipazione.recuperato)}` }} />
        <Numero n={{ etichetta: "Fine dei lavori", valore: k.ultimazione ? `ultimati il ${giornoIt(k.ultimazione)}` : giornoIt(k.fineAggiornata), formato: "testo", nota: k.penale ? `penale maturata ${soldi(k.penale.importo)} (${k.penale.giorni} giorni)` : k.finePrevista && k.fineAggiornata !== k.finePrevista ? `prevista all'inizio il ${giornoIt(k.finePrevista)}` : undefined }} />
      </View>
      {k.atti.length > 0 ? (
        <View>
          <Tabella
            prima={<Text style={s.label}>Atti aggiuntivi, varianti e proroghe</Text>}
            col={[{ titolo: "Atto", w: "18%" }, { titolo: "Data", w: "12%" }, { titolo: "Descrizione", w: "42%" }, { titolo: "Giorni", w: "10%", destra: true }, { titolo: "Importo", w: "18%", destra: true }]}
            righe={k.atti.map((a) => [`${a.tipo}${a.numero ? ` ${a.numero}` : ""}`, giornoIt(a.data), a.descrizione, a.giorniProroga ? String(a.giorniProroga) : "—", conSegno(a.importo)])}
          />
        </View>
      ) : null}
      {k.sal.length > 0 ? (
        <View>
          <Tabella
            prima={<Text style={s.label}>Stati di avanzamento</Text>}
            col={[{ titolo: "SAL", w: "8%" }, { titolo: "Al", w: "12%" }, { titolo: "Stato", w: "16%" }, { titolo: "Cumulativo", w: "14%", destra: true }, { titolo: "Questo SAL", w: "14%", destra: true }, { titolo: "Ritenuta", w: "12%", destra: true }, { titolo: "Recupero ant.", w: "12%", destra: true }, { titolo: "Netto", w: "12%", destra: true }]}
            righe={k.sal.map((x) => [`n. ${x.numero}`, giornoIt(x.al), x.stato, soldi(x.cumulativo), soldi(x.lordo), soldi(x.ritenuta), soldi(x.recupero), soldi(x.netto)])}
          />
        </View>
      ) : null}
      {k.garanzie.length > 0 ? (
        <View>
          <Tabella
            prima={<Text style={s.label}>Garanzie</Text>}
            col={[{ titolo: "Garanzia", w: "26%" }, { titolo: "Garante", w: "24%" }, { titolo: "Numero", w: "14%" }, { titolo: "Importo", w: "14%", destra: true }, { titolo: "Scadenza", w: "22%", destra: true }]}
            righe={k.garanzie.map((g) => [g.tipo, g.garante ?? "—", g.numero ?? "—", soldi(g.importo), g.svincolataIl ? `svincolata il ${giornoIt(g.svincolataIl)}` : giornoIt(g.scadenza)])}
          />
        </View>
      ) : null}
    </View>
  );
}

const STATO_DOC: Record<string, { testo: string; colore: string }> = {
  presente: { testo: "Presente", colore: C.green },
  mancante: { testo: "Manca", colore: C.red },
  in_scadenza: { testo: "In scadenza", colore: C.amber },
  scaduto: { testo: "Scaduto", colore: C.red },
  non_serve: { testo: "Non serve", colore: C.gray500 },
};

function Documenti({ d }: { d: DatiDossier }) {
  const k = d.documenti;
  if (!k) return null;
  const titolo = <Titolo sezione="documenti" sotto={`${k.conteggi.presenti} presenti su ${k.conteggi.richiesti} richiesti · ${k.conteggi.mancanti} mancanti · ${k.conteggi.scaduti} scaduti · ${k.conteggi.inScadenza} in scadenza`} />;
  return (
    <View style={s.sezione}>
      {k.generale.length > 0 ? (
        <Tabella
          prima={titolo}
          col={[{ titolo: "Documento dell'operazione", w: "56%" }, { titolo: "Stato", w: "22%" }, { titolo: "Scadenza", w: "22%", destra: true }]}
          righe={k.generale.map((x) => [
            `${x.nome}${x.obbligatoria ? "" : " (facoltativo)"}`,
            <Text key="s" style={[s.td, s.bold, { color: STATO_DOC[x.stato].colore }]}>{STATO_DOC[x.stato].testo}</Text>,
            x.scadenza ? giornoIt(x.scadenza) : "—",
          ])}
        />
      ) : null}
      {k.figlie.length > 0 ? (
        <View>
          <Tabella
            prima={<>{k.generale.length > 0 ? null : titolo}<Text style={s.label}>Su ogni {d.operazione.figliaTante.toLowerCase()}</Text></>}
            col={[{ titolo: "Documento", w: "56%" }, { titolo: "Presenti", w: "22%", destra: true }, { titolo: "Da fare", w: "22%", destra: true }]}
            righe={k.figlie.map((x) => [x.nome, `${x.presenti} su ${x.valgono}`, x.daFare ? String(x.daFare) : "—"])}
          />
        </View>
      ) : null}
    </View>
  );
}

function Note({ d }: { d: DatiDossier }) {
  if (!d.note) return null;
  return (
    <View style={s.sezione} wrap={false}>
      <Titolo sezione="note" sotto={d.azienda.nome} />
      <Text style={s.testo}>{d.note}</Text>
    </View>
  );
}

function Copertina({ d }: { d: DatiDossier }) {
  const o = d.operazione;
  const indice = d.sezioni.map((x) => NOMI_SEZIONE[x].nome);
  const periodo = d.periodo.dal ? `dal ${giornoIt(d.periodo.dal)} al ${giornoIt(d.periodo.al)}` : `fino al ${giornoIt(d.periodo.al)}`;
  return (
    <Page size="A4" style={s.page}>
      <View style={s.coverBand}>
        <View style={s.coverAzienda}>
          {d.azienda.logo ? <Image src={d.azienda.logo} style={s.coverLogo} /> : null}
          <View>
            <Text style={s.coverAziendaNome}>{d.azienda.nome}</Text>
            <Text style={s.coverAziendaMeta}>
              {[d.azienda.indirizzo, d.azienda.partitaIva ? `P.IVA ${d.azienda.partitaIva}` : null].filter(Boolean).join(" · ")}
            </Text>
          </View>
        </View>
        <Text style={s.coverKicker}>{d.titolo}</Text>
        <Text style={s.coverTitolo}>{o.nome}</Text>
        <Text style={s.coverSotto}>{[o.modelloNome, o.codice ? `codice ${o.codice}` : null].filter(Boolean).join(" · ")}</Text>
      </View>
      <View style={s.coverDati}>
        <View style={s.coverDato}><Text style={s.coverDatoLabel}>Data</Text><Text style={s.coverDatoValore}>{giornoIt(d.data)}</Text></View>
        <View style={s.coverDato}><Text style={s.coverDatoLabel}>Periodo</Text><Text style={s.coverDatoValore}>{periodo}</Text></View>
        {o.cliente ? <View style={s.coverDato}><Text style={s.coverDatoLabel}>{o.clienteEtichetta}</Text><Text style={s.coverDatoValore}>{o.cliente}</Text></View> : null}
        <View style={s.coverDato}><Text style={s.coverDatoLabel}>{o.figliaTante}</Text><Text style={s.coverDatoValore}>{String(o.figlie)}</Text></View>
      </View>
      {indice.length > 0 ? (
        <View style={s.indice}>
          <Text style={s.label}>Contenuto</Text>
          {indice.map((nome, i) => (
            <View key={nome} style={s.indiceRiga}>
              <Text style={s.indiceNumero}>{i + 1}</Text>
              <Text style={s.indiceNome}>{nome}</Text>
            </View>
          ))}
        </View>
      ) : null}
      <Text style={[s.nota, { marginTop: 18 }]}>
        Importi in euro al netto dell'IVA.
        {d.piano || d.cassa || d.fonti || d.investitori ? " I numeri «a finire» e le stime sono calcolati sul piano economico alla data del dossier e possono cambiare." : ""}
      </Text>
      <Piede d={d} />
    </Page>
  );
}

function Piede({ d, platformName = "Edilizia in Cloud" }: { d: DatiDossier; platformName?: string }) {
  return (
    <View style={s.footer} fixed>
      <Text style={s.footerText}>{d.azienda.nome} · {d.operazione.nome}</Text>
      <Text style={s.footerText} render={({ pageNumber, totalPages }) => `Pag. ${pageNumber} / ${totalPages}`} />
      <Text style={s.footerText}>Generato da {platformName}</Text>
    </View>
  );
}

export function DossierPDF({ d }: { d: DatiDossier }) {
  const interne = d.sezioni.some((x) => x !== "sintesi");
  return (
    <Document title={`Rendiconto ${d.operazione.nome} ${d.data}`} author={d.azienda.nome} subject={d.titolo}>
      <Copertina d={d} />
      {d.sintesi ? (
        <Page size="A4" style={s.page}>
          <Testata d={d} />
          <Sintesi d={d} />
          <Piede d={d} />
        </Page>
      ) : null}
      {interne ? (
        <Page size="A4" style={s.page}>
          <Testata d={d} />
          <Avanzamento d={d} />
          <Foto d={d} />
          <Piano d={d} />
          <Andamento d={d} />
          <Cassa d={d} />
          <Fonti d={d} />
          <Investitori d={d} />
          <Unita d={d} />
          <Contratto d={d} />
          <Documenti d={d} />
          <Note d={d} />
          <Piede d={d} />
        </Page>
      ) : null}
    </Document>
  );
}

function Testata({ d }: { d: DatiDossier }) {
  return (
    <View style={s.header} fixed>
      <Text style={s.headerSx}>{d.operazione.nome}</Text>
      <Text style={s.headerDx}>Rendiconto al {giornoIt(d.data)}</Text>
    </View>
  );
}

export default DossierPDF;
