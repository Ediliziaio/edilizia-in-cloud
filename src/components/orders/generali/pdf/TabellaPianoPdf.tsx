// src/components/orders/generali/pdf/TabellaPianoPdf.tsx
// Il piano economico come tabella nei PDF (Dossier e rendiconto all'investitore): le voci
// raggruppate per categoria, ogni gruppo col suo subtotale in testa come nella pagina del piano,
// poi il totale. Lo scostamento è verde quando aiuta il margine: meno costi o più ricavi.
import { StyleSheet, Text, View } from "@react-pdf/renderer";
import { gruppiPerCategoria, type ColonnePiano } from "@/lib/orders/generali/graficiPdf";

const C = {
  navy: "#1E3A5F", navyChiaro: "#dbe4ef", gray100: "#f3f4f6", gray200: "#e5e7eb", gray500: "#6b7280",
  green: "#047857", red: "#b91c1c", white: "#ffffff", gray900: "#111827",
};

const s = StyleSheet.create({
  label: { fontSize: 7, fontFamily: "Helvetica-Bold", color: C.gray500, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 4, marginTop: 6 },
  thead: { flexDirection: "row", backgroundColor: C.navy, paddingVertical: 4, paddingHorizontal: 6 },
  th: { fontSize: 6.8, fontFamily: "Helvetica-Bold", color: C.white, textTransform: "uppercase" },
  tr: { flexDirection: "row", borderBottom: `0.25pt solid ${C.gray200}`, paddingVertical: 3.5, paddingHorizontal: 6, alignItems: "center" },
  gruppo: { backgroundColor: C.navyChiaro, borderBottom: `0.5pt solid ${C.gray200}` },
  trTot: { flexDirection: "row", backgroundColor: C.gray100, paddingVertical: 4, paddingHorizontal: 6 },
  td: { fontSize: 8, color: C.gray900 },
  bold: { fontFamily: "Helvetica-Bold" },
  destra: { textAlign: "right", paddingRight: 4 },
});

export const LARGHEZZE_PIANO = ["31%", "12%", "12%", "11%", "17%", "17%"];

// «always»: in italiano Intl non mette il punto nelle cifre a quattro.
const EURO = new Intl.NumberFormat("it-IT", { maximumFractionDigits: 0, useGrouping: "always" });
/** Trattino normale, non il segno meno: l'Helvetica del PDF non ha «−» e lo lascia cadere. */
export const soldiPiano = (n: number) => (Number.isFinite(n) ? `${n < -0.5 ? "-" : ""}€ ${EURO.format(Math.abs(n))}` : "—");
export const conSegnoPiano = (n: number) => (Math.abs(n) < 1 ? "—" : `${n > 0 ? "+" : ""}${soldiPiano(n)}`);

export function TabellaPianoPdf({ titolo, righe, totale, costi }: {
  titolo: string;
  righe: (ColonnePiano & { etichetta: string; categoria: string })[];
  totale: ColonnePiano;
  costi: boolean;
}) {
  const W = LARGHEZZE_PIANO;
  const gruppi = gruppiPerCategoria(righe);
  const coloreScost = (v: number) => (Math.abs(v) < 1 ? C.gray500 : (costi ? v < 0 : v > 0) ? C.green : C.red);
  const celle = (x: ColonnePiano, bold: boolean) => [
    ...[x.previsto, x.reale, x.aFinire, x.stima].map((v, j) => (
      <Text key={j} style={[s.td, s.destra, { width: W[j + 1] }, bold ? s.bold : {}]}>{soldiPiano(v)}</Text>
    )),
    <Text key="sc" style={[s.td, s.destra, { width: W[5], color: coloreScost(x.scostamento) }, bold ? s.bold : {}]}>{conSegnoPiano(x.scostamento)}</Text>,
  ];
  // Un gruppo di una voce sola non ha bisogno del subtotale: sarebbe la stessa riga due volte.
  return (
    <View>
      {/* Il titolo resta attaccato alla testata; la testata (fixed) si ripete su ogni pagina in cui la tabella continua. */}
      <Text style={s.label} minPresenceAhead={60}>{titolo}</Text>
      <View style={s.thead} fixed>
        {["Voce", "Previsto", "Reale", "A finire", "Stima finale", "Scostamento"].map((t, i) => (
          <Text key={t} style={[s.th, { width: W[i] }, i > 0 ? s.destra : {}]}>{t}</Text>
        ))}
      </View>
      {gruppi.map((g) => (
        <View key={g.categoria}>
          {g.righe.length > 1 ? (
            <View style={[s.tr, s.gruppo]} wrap={false}>
              <Text style={[s.td, s.bold, { width: W[0], color: C.navy }]}>{g.nome} ({g.righe.length})</Text>
              {celle(g.totali, true)}
            </View>
          ) : null}
          {g.righe.map((r, i) => (
            <View key={i} style={s.tr} wrap={false}>
              <View style={{ width: W[0], paddingLeft: g.righe.length > 1 ? 8 : 0 }}>
                <Text style={s.td}>{r.etichetta}</Text>
                {g.righe.length === 1 && g.nome.toLowerCase() !== r.etichetta.toLowerCase() ? (
                  <Text style={{ fontSize: 6, color: C.gray500, marginTop: 1 }}>{g.nome}</Text>
                ) : null}
              </View>
              {celle(r, false)}
            </View>
          ))}
        </View>
      ))}
      <View style={s.trTot} wrap={false}>
        <Text style={[s.td, s.bold, { width: W[0] }]}>{costi ? "Totale costi" : "Totale ricavi"}</Text>
        {celle(totale, true)}
      </View>
    </View>
  );
}
