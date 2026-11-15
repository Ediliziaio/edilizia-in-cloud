// src/components/orders/generali/investitori/RendicontoInvestitorePDF.tsx
// Il rendiconto che riceve l'investitore: la sua posizione (capitale, utile o interessi,
// quanto gli spetta a fine operazione), come va l'operazione (lavori, vendite, incassi,
// previsto contro stima, con anelli, cascata e la cassa in grafico), il piano economico voce per
// voce raggruppato per categoria (dal 15/11/2026, richiesto dal titolare) e la regola con cui si
// divide l'utile.
// Palette e impaginazione come RendicontoAppaltoPDF (A4 verticale, Helvetica).
import { Document, Font, Image, Page, StyleSheet, Text, View } from "@react-pdf/renderer";
import type { DatiRendiconto } from "@/lib/orders/generali/investitoriRendiconto";
import { gruppiPerCategoria } from "@/lib/orders/generali/graficiPdf";
import {
  Anello, BarreConfronto, BarreMensili, Cascata, FilaGrafici, Linee, RiquadroGrafico, Torta,
} from "@/components/orders/generali/pdf/GraficiPdf";
import { LARGHEZZE_PIANO, TabellaPianoPdf } from "@/components/orders/generali/pdf/TabellaPianoPdf";

// Le parole non si spezzano col trattino («giardi-no»): vanno a capo intere.
Font.registerHyphenationCallback((word) => [word]);

const C = {
  navy: "#1E3A5F",
  orange: "#F97316",
  gray50: "#f9fafb",
  gray100: "#f3f4f6",
  gray200: "#e5e7eb",
  gray500: "#6b7280",
  gray700: "#374151",
  gray900: "#111827",
  green: "#047857",
  red: "#b91c1c",
  white: "#ffffff",
  gray400: "#9ca3af",
};

const s = StyleSheet.create({
  page: { fontFamily: "Helvetica", fontSize: 9, color: C.gray900, padding: 40, paddingBottom: 64 },
  header: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", paddingBottom: 10, marginBottom: 14, borderBottom: `2pt solid ${C.navy}` },
  headerLeft: { flexDirection: "row", gap: 10, flex: 1 },
  logo: { width: 44, height: 44, objectFit: "contain" },
  azienda: { fontSize: 13, fontFamily: "Helvetica-Bold", color: C.navy, marginBottom: 2 },
  meta: { fontSize: 8, color: C.gray700, lineHeight: 1.4 },
  titolo: { fontSize: 15, fontFamily: "Helvetica-Bold", color: C.navy },
  data: { fontSize: 8, color: C.gray500, marginTop: 2, textAlign: "right" },
  row2: { flexDirection: "row", gap: 10, marginBottom: 12 },
  col: { flex: 1 },
  label: { fontSize: 7, fontFamily: "Helvetica-Bold", color: C.gray500, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 4 },
  box: { backgroundColor: C.gray50, border: `0.5pt solid ${C.gray200}`, borderRadius: 4, padding: 9 },
  nome: { fontSize: 10, fontFamily: "Helvetica-Bold", marginBottom: 3 },
  riga: { fontSize: 8, color: C.gray700, lineHeight: 1.45 },
  sezione: { marginBottom: 12 },
  thead: { flexDirection: "row", backgroundColor: C.navy, paddingVertical: 4, paddingHorizontal: 7 },
  th: { fontSize: 7, fontFamily: "Helvetica-Bold", color: C.white, textTransform: "uppercase" },
  tr: { flexDirection: "row", borderBottom: `0.25pt solid ${C.gray200}`, paddingVertical: 4, paddingHorizontal: 7 },
  td: { fontSize: 8.5 },
  c1: { width: "28%" },
  cN: { width: "18%", textAlign: "right" },
  spetta: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", backgroundColor: C.navy, borderRadius: 4, paddingVertical: 8, paddingHorizontal: 10, marginTop: 6 },
  spettaLabel: { fontSize: 10, fontFamily: "Helvetica-Bold", color: C.white },
  spettaValore: { fontSize: 14, fontFamily: "Helvetica-Bold", color: C.orange },
  nota: { fontSize: 7.5, color: C.gray500, marginTop: 4, lineHeight: 1.4 },
  numeri: { flexDirection: "row", gap: 8, marginBottom: 8 },
  numero: { flex: 1, backgroundColor: C.gray50, border: `0.5pt solid ${C.gray200}`, borderRadius: 4, padding: 7 },
  numeroLabel: { fontSize: 7, color: C.gray500, marginBottom: 2 },
  numeroValore: { fontSize: 11, fontFamily: "Helvetica-Bold" },
  regola: { fontSize: 8, color: C.gray700, lineHeight: 1.45, marginBottom: 3 },
  footer: { position: "absolute", bottom: 24, left: 40, right: 40, flexDirection: "row", justifyContent: "space-between", borderTop: `0.5pt solid ${C.gray200}`, paddingTop: 6 },
  footerText: { fontSize: 7, color: C.gray500 },
});

// «always»: in italiano Intl non mette il punto nelle cifre a quattro (3000 invece di 3.000).
const EURO = new Intl.NumberFormat("it-IT", { maximumFractionDigits: 0, useGrouping: "always" });
/** «€ 1.250.000», «-€ 3.500»: trattino normale, l'Helvetica del PDF non ha il segno meno «−» (spariva). */
const soldi = (n: number | null | undefined) =>
  n === null || n === undefined || !Number.isFinite(n) ? "—" : `${n < -0.5 ? "-" : ""}€ ${EURO.format(Math.abs(n))}`;
const percento = (n: number | null | undefined) =>
  n === null || n === undefined || !Number.isFinite(n) ? "—" : `${(n * 100).toLocaleString("it-IT", { maximumFractionDigits: 1 })}%`;
const giorno = (d: string | null | undefined) => (d && /^\d{4}-\d{2}-\d{2}/.test(d) ? `${d.slice(8, 10)}/${d.slice(5, 7)}/${d.slice(0, 4)}` : "—");
const MESI = ["gennaio", "febbraio", "marzo", "aprile", "maggio", "giugno", "luglio", "agosto", "settembre", "ottobre", "novembre", "dicembre"];
const mese = (m: string | null | undefined) => (m && /^\d{4}-\d{2}/.test(m) ? `${MESI[Number(m.slice(5, 7)) - 1]} ${m.slice(0, 4)}` : null);
const meseBreve = (m: string) => `${MESI[Number(m.slice(5, 7)) - 1].slice(0, 3)} ${m.slice(2, 4)}`;
/** «€ 1,78 mln», «€ 450k»: per il centro delle torte. */
const cifraBreve = (n: number) => {
  const a = Math.abs(n);
  const segno = n < -0.5 ? "-" : "";
  if (a >= 1_000_000) return `${segno}€ ${(a / 1_000_000).toLocaleString("it-IT", { maximumFractionDigits: 2 })} mln`;
  if (a >= 1_000) return `${segno}€ ${Math.round(a / 1_000)}k`;
  return soldi(n);
};

function Numero({ etichetta, valore }: { etichetta: string; valore: string }) {
  return (
    <View style={s.numero}>
      <Text style={s.numeroLabel}>{etichetta}</Text>
      <Text style={s.numeroValore}>{valore}</Text>
    </View>
  );
}

/** Il punto più basso della cassa stimata: il capitale massimo che l'operazione chiede. */
function picco(flusso: NonNullable<DatiRendiconto["flusso"]>): { indice: number; testo: string } | null {
  let indice = -1;
  let minimo = 0;
  flusso.forEach((m, i) => {
    if (m.cumulato < minimo) {
      minimo = m.cumulato;
      indice = i;
    }
  });
  return indice >= 0 ? { indice, testo: soldi(minimo) } : null;
}

function PianoEconomico({ piano }: { piano: NonNullable<DatiRendiconto["piano"]> }) {
  const somma = (righe: typeof piano.ricavi) => ({
    previsto: righe.reduce((t, r) => t + r.previsto, 0), reale: righe.reduce((t, r) => t + r.reale, 0),
    aFinire: righe.reduce((t, r) => t + r.aFinire, 0), stima: righe.reduce((t, r) => t + r.stima, 0),
    scostamento: righe.reduce((t, r) => t + r.scostamento, 0),
  });
  const ricavi = somma(piano.ricavi);
  const costi = somma(piano.costi);
  const margine = {
    previsto: ricavi.previsto - costi.previsto, reale: ricavi.reale - costi.reale, aFinire: ricavi.aFinire - costi.aFinire,
    stima: ricavi.stima - costi.stima, scostamento: ricavi.scostamento - costi.scostamento,
  };
  const gruppiCosti = gruppiPerCategoria(piano.costi);
  return (
    <View style={s.sezione}>
      <View wrap={false}>
        <Text style={s.label}>Il piano economico</Text>
        {gruppiCosti.length > 0 ? (
          <FilaGrafici>
            <RiquadroGrafico titolo="Dove vanno i costi" larghezza="44%">
              <Torta voci={gruppiCosti.map((g) => ({ nome: g.nome, valore: g.totali.stima }))} diametro={86} compatta centro={{ valore: cifraBreve(costi.stima), etichetta: "costi" }} />
            </RiquadroGrafico>
            <RiquadroGrafico titolo="Previsto contro stima, per categoria" larghezza="54.5%">
              <BarreConfronto righe={[
                ...gruppiPerCategoria(piano.ricavi).map((g) => ({ nome: g.nome, a: g.totali.previsto, b: g.totali.stima })),
                ...gruppiCosti.map((g) => ({ nome: g.nome, a: g.totali.previsto, b: g.totali.stima })),
              ]} />
            </RiquadroGrafico>
          </FilaGrafici>
        ) : null}
      </View>
      {piano.ricavi.length > 0 ? <TabellaPianoPdf titolo="Ricavi" righe={piano.ricavi} totale={ricavi} costi={false} /> : null}
      {piano.costi.length > 0 ? <View style={{ marginTop: 4 }}><TabellaPianoPdf titolo="Costi" righe={piano.costi} totale={costi} costi /></View> : null}
      <View style={{ flexDirection: "row", backgroundColor: C.navy, paddingVertical: 4, paddingHorizontal: 6, marginTop: 6 }} wrap={false}>
        {["Margine", soldi(margine.previsto), soldi(margine.reale), soldi(margine.aFinire), soldi(margine.stima), Math.abs(margine.scostamento) < 1 ? "—" : `${margine.scostamento > 0 ? "+" : ""}${soldi(margine.scostamento)}`].map((v, j) => (
          <Text key={j} style={{ fontSize: 8, fontFamily: "Helvetica-Bold", color: j === 4 ? C.orange : C.white, width: LARGHEZZE_PIANO[j], textAlign: j > 0 ? "right" : "left", paddingRight: j > 0 ? 4 : 0 }}>{v}</Text>
        ))}
      </View>
      <Text style={s.nota}>Importi al netto dell'IVA. Reale: quanto già registrato. A finire: quanto resta da spendere o incassare secondo il piano. Stima finale = reale + a finire.</Text>
    </View>
  );
}

export function RendicontoInvestitorePDF({ d, platformName = "Edilizia in Cloud" }: { d: DatiRendiconto; platformName?: string }) {
  const c = d.conto;
  const v = d.vendite;
  const venduteRogitate = v ? v.perStato.rogitata : 0;
  const impegnate = v ? v.perStato.compromesso + v.perStato.prenotata : 0;
  return (
    <Document title={`Rendiconto ${d.operazione.nome} - ${d.investitore.nome}`} author={d.azienda.nome}>
      <Page size="A4" style={s.page}>
        <View style={s.header}>
          <View style={s.headerLeft}>
            {d.azienda.logo ? <Image src={d.azienda.logo} style={s.logo} /> : null}
            <View>
              <Text style={s.azienda}>{d.azienda.nome}</Text>
              {d.azienda.indirizzo ? <Text style={s.meta}>{d.azienda.indirizzo}</Text> : null}
              <Text style={s.meta}>
                {[d.azienda.partitaIva ? `P.IVA ${d.azienda.partitaIva}` : null, d.azienda.telefono, d.azienda.email].filter(Boolean).join(" · ")}
              </Text>
            </View>
          </View>
          <View>
            <Text style={s.titolo}>Rendiconto all'investitore</Text>
            <Text style={s.data}>al {giorno(d.data)}</Text>
          </View>
        </View>

        <View style={s.row2}>
          <View style={s.col}>
            <Text style={s.label}>Investitore</Text>
            <View style={s.box}>
              <Text style={s.nome}>{d.investitore.nome}</Text>
              <Text style={s.riga}>{d.investitore.tipoNome}</Text>
              {d.investitore.email ? <Text style={s.riga}>{d.investitore.email}</Text> : null}
            </View>
          </View>
          <View style={s.col}>
            <Text style={s.label}>Operazione</Text>
            <View style={s.box}>
              <Text style={s.nome}>{d.operazione.nome}</Text>
              {d.operazione.codice ? <Text style={s.riga}>Codice {d.operazione.codice}</Text> : null}
              <Text style={s.riga}>
                {d.figlie} {d.operazione.unitaNome.toLowerCase()}
                {d.avanzamento !== null ? ` · lavori al ${d.avanzamento}%` : ""}
              </Text>
            </View>
          </View>
        </View>

        {/* La sua posizione */}
        <View style={s.sezione} wrap={false}>
          <Text style={s.label}>La sua posizione</Text>
          <View style={s.thead}>
            <Text style={[s.th, s.c1]}> </Text>
            <Text style={[s.th, s.cN]}>Previsto</Text>
            <Text style={[s.th, s.cN]}>Ad oggi</Text>
            <Text style={[s.th, s.cN]}>A finire</Text>
            <Text style={[s.th, s.cN]}>Stima finale</Text>
          </View>
          <View style={s.tr}>
            <Text style={[s.td, s.c1]}>Capitale</Text>
            <Text style={[s.td, s.cN]}>{soldi(c.capitale.previsto)}</Text>
            <Text style={[s.td, s.cN]}>{soldi(c.capitale.adOggi)}</Text>
            <Text style={[s.td, s.cN]}>{soldi(c.capitale.aFinire)}</Text>
            <Text style={[s.td, s.cN]}>{soldi(c.capitale.stima)}</Text>
          </View>
          <View style={s.tr}>
            <Text style={[s.td, s.c1]}>{c.rendimentoNome}</Text>
            <Text style={[s.td, s.cN]}>{soldi(c.rendimento.previsto)}</Text>
            <Text style={[s.td, s.cN]}>{soldi(c.rendimento.adOggi)}</Text>
            <Text style={[s.td, s.cN]}>{soldi(c.rendimento.aFinire)}</Text>
            <Text style={[s.td, s.cN, { color: c.rendimento.stima < 0 ? C.red : C.gray900 }]}>{soldi(c.rendimento.stima)}</Text>
          </View>
          <View style={s.spetta}>
            <Text style={s.spettaLabel}>Le spetta ancora a fine operazione</Text>
            <Text style={s.spettaValore}>{soldi(c.spettaAFine)}</Text>
          </View>
          <Text style={s.nota}>
            Capitale: previsto è l'impegno, ad oggi quello versato e non ancora rimborsato, a finire quello ancora da versare.{" "}
            {c.rendimentoNome}: ad oggi è quanto le è già stato pagato, a finire quanto deve ancora ricevere.
            {c.interessiMaturati !== null ? ` Interessi maturati fino a oggi: ${soldi(c.interessiMaturati)}.` : ""}
            {c.rendimentoPct !== null ? ` Rendimento atteso sul capitale: ${percento(c.rendimentoPct)}.` : ""}
            {c.tir !== null ? ` Rendimento annuo composto (TIR): ${percento(c.tir)}.` : ""}
            {c.spese ? ` Spese del finanziamento: ${soldi(c.spese)}.` : ""}
            {c.costoAnnuo !== null ? ` Costo effettivo annuo, interessi e spese: ${percento(c.costoAnnuo)}.` : ""}
            {c.quotaPct !== null ? ` Quota dell'utile: ${percento(c.quotaPct)}.` : ""} Conteggio fino al {giorno(c.fine)}.
          </Text>
        </View>
        {c.capitale.stima > 0 ? (
          <RiquadroGrafico titolo="Quello che le torna a fine operazione">
            <Torta
              voci={[
                { nome: "Capitale restituito", valore: c.capitale.stima, colore: C.navy },
                { nome: c.rendimentoNome, valore: Math.max(0, c.rendimento.stima), colore: C.orange },
              ]}
              centro={{ valore: cifraBreve(c.capitale.stima + Math.max(0, c.rendimento.stima)), etichetta: "in tutto" }}
            />
          </RiquadroGrafico>
        ) : null}

        {/* L'operazione */}
        <View style={s.sezione} wrap={false}>
          <Text style={s.label}>Come va l'operazione</Text>
          <View style={{ flexDirection: "row", gap: 6, marginBottom: 8, paddingVertical: 8, backgroundColor: C.gray50, borderRadius: 4 }}>
            <Anello quota={d.avanzamento === null ? null : d.avanzamento / 100} valore={d.avanzamento !== null ? `${d.avanzamento}%` : "—"} etichetta="Avanzamento lavori" />
            {v && v.totale > 0 ? (
              <Anello quota={venduteRogitate / v.totale} valore={`${venduteRogitate}/${v.totale}`} etichetta={`${d.operazione.unitaNome} rogitate`} sotto={impegnate > 0 ? `${impegnate} prenotate o a compromesso` : undefined} colore={C.green} />
            ) : null}
            {d.incassato !== null ? (
              <Anello
                quota={d.economia && d.economia.ricavi.stima > 0 ? d.incassato / d.economia.ricavi.stima : null}
                valore={d.economia && d.economia.ricavi.stima > 0 ? percento(d.incassato / d.economia.ricavi.stima) : "—"}
                etichetta="Incassato" sotto={soldi(d.incassato)} colore={C.orange}
              />
            ) : null}
            {d.economia?.tirAnnuo !== null && d.economia?.tirAnnuo !== undefined ? (
              <Anello quota={Math.min(1, Math.max(0, d.economia.tirAnnuo))} valore={percento(d.economia.tirAnnuo)} etichetta="TIR dell'operazione" sotto={d.economia.durataMesi ? `in ${d.economia.durataMesi} mesi` : undefined} colore={C.gray700} />
            ) : null}
          </View>
          {d.economia ? (
            <>
              <View style={s.thead}>
                <Text style={[s.th, s.c1]}> </Text>
                <Text style={[s.th, s.cN]}>Previsto</Text>
                <Text style={[s.th, s.cN]}>Stima finale</Text>
                <Text style={[s.th, s.cN]}>Differenza</Text>
                <Text style={[s.th, s.cN]}> </Text>
              </View>
              {(["ricavi", "costi", "margine"] as const).map((k) => {
                const r = d.economia![k];
                const diff = r.stima - r.previsto;
                const bene = k === "costi" ? diff <= 0 : diff >= 0;
                return (
                  <View key={k} style={s.tr}>
                    <Text style={[s.td, s.c1, k === "margine" ? { fontFamily: "Helvetica-Bold" } : {}]}>
                      {k === "ricavi" ? "Ricavi" : k === "costi" ? "Costi" : "Margine"}
                    </Text>
                    <Text style={[s.td, s.cN]}>{soldi(r.previsto)}</Text>
                    <Text style={[s.td, s.cN]}>{soldi(r.stima)}</Text>
                    <Text style={[s.td, s.cN, { color: Math.abs(diff) < 1 ? C.gray500 : bene ? C.green : C.red }]}>
                      {Math.abs(diff) < 1 ? "—" : `${diff > 0 ? "+" : ""}${soldi(diff)}`}
                    </Text>
                    <Text style={[s.td, s.cN]}> </Text>
                  </View>
                );
              })}
              <Text style={s.nota}>
                Importi al netto dell'IVA. Stima finale = quanto già registrato più quanto resta da fare secondo il piano.
                {d.economia.tirAnnuo !== null ? ` Rendimento dell'operazione (TIR annuo stimato): ${percento(d.economia.tirAnnuo)}.` : ""}
                {d.economia.durataMesi ? ` Durata: ${d.economia.durataMesi} mesi.` : ""}
              </Text>
            </>
          ) : (
            <Text style={s.nota}>Il piano economico dell'operazione non è ancora pronto: le stime arriveranno nei prossimi rendiconti.</Text>
          )}
        </View>

        {d.piano && d.economia && d.economia.ricavi.stima > 0 && d.piano.costi.length > 0 ? (
          <RiquadroGrafico titolo="Dai ricavi al margine" nota="Stima finale. Ogni barra rossa è una categoria di costi che scende dai ricavi; l'ultima è il margine che resta da dividere.">
            <Cascata ricavi={d.economia.ricavi.stima} costi={gruppiPerCategoria(d.piano.costi).map((g) => ({ nome: g.nome, valore: g.totali.stima }))} />
          </RiquadroGrafico>
        ) : null}

        {d.piano && (d.piano.ricavi.length > 0 || d.piano.costi.length > 0) ? <PianoEconomico piano={d.piano} /> : null}

        {d.flusso && d.flusso.length > 1 ? (
          <View style={s.sezione}>
            <View wrap={false}>
              <Text style={s.label}>La cassa dell'operazione</Text>
              <RiquadroGrafico nota="Cassa cumulata mese per mese: sotto lo zero è il capitale che soci, investitori e banca coprono. Il punto arancio è il picco.">
                <Linee
                  etichette={d.flusso.map((m) => meseBreve(m.mese))}
                  serie={[
                    { nome: "Stima", colore: C.navy, valori: d.flusso.map((m) => m.cumulato), area: true },
                    ...(d.flusso.some((m) => m.previsto !== null) ? [{ nome: "Piano com'era scritto", colore: C.gray400, tratteggio: true, valori: d.flusso.map((m) => m.previsto) }] : []),
                  ]}
                  evidenzia={picco(d.flusso)}
                />
              </RiquadroGrafico>
            </View>
            <RiquadroGrafico titolo="Entrate e uscite, mese per mese">
              <BarreMensili etichette={d.flusso.map((m) => meseBreve(m.mese))} entrate={d.flusso.map((m) => m.entrate)} uscite={d.flusso.map((m) => m.uscite)} />
            </RiquadroGrafico>
          </View>
        ) : null}

        {d.capitale ? (
          <View style={s.sezione} wrap={false}>
            <Text style={s.label}>Capitale impiegato</Text>
            <View style={s.numeri}>
              <Numero etichetta={`Capitale massimo${mese(d.capitale.meseMassimo) ? ` (${mese(d.capitale.meseMassimo)})` : ""}`} valore={soldi(d.capitale.massimo)} />
              <Numero etichetta="Impiegato a oggi" valore={soldi(d.capitale.investitoOggi)} />
              <Numero etichetta="Raccolto dalle fonti" valore={soldi(d.capitale.raccolto)} />
              <Numero etichetta="Impegni delle fonti" valore={soldi(d.capitale.impegni)} />
            </View>
          </View>
        ) : null}

        {c.movimenti.length > 0 ? (
          <View style={s.sezione}>
            <Text style={s.label}>I suoi movimenti</Text>
            <View style={s.thead}>
              <Text style={[s.th, { width: "20%" }]}>Data</Text>
              <Text style={[s.th, { width: "55%" }]}>Movimento</Text>
              <Text style={[s.th, { width: "25%", textAlign: "right" }]}>Importo</Text>
            </View>
            {c.movimenti.map((m, i) => (
              <View key={i} style={s.tr} wrap={false}>
                <Text style={[s.td, { width: "20%" }]}>{giorno(m.data)}</Text>
                <Text style={[s.td, { width: "55%" }]}>{m.tipo}</Text>
                <Text style={[s.td, { width: "25%", textAlign: "right" }]}>{soldi(m.importo)}</Text>
              </View>
            ))}
          </View>
        ) : null}

        <View style={s.sezione} wrap={false}>
          <Text style={s.label}>Come si calcola quanto le spetta</Text>
          <Text style={s.regola}>{c.regola}</Text>
          {d.regole.map((r, i) => <Text key={i} style={s.regola}>· {r}</Text>)}
        </View>

        {d.note ? (
          <View style={s.sezione} wrap={false}>
            <Text style={s.label}>Note</Text>
            <Text style={s.regola}>{d.note}</Text>
          </View>
        ) : null}

        <Text style={s.nota}>
          I numeri a finire sono stime fatte sul piano economico al {giorno(d.data)}: possono cambiare con l'andamento dei lavori e delle vendite.
        </Text>

        <View style={s.footer} fixed>
          <Text style={s.footerText}>{d.azienda.nome} · {d.operazione.nome}</Text>
          <Text style={s.footerText} render={({ pageNumber, totalPages }) => `Pag. ${pageNumber} / ${totalPages}`} />
          <Text style={s.footerText}>Generato da {platformName}</Text>
        </View>
      </Page>
    </Document>
  );
}

export default RendicontoInvestitorePDF;
