import { Circle, Path, Rect, Svg, Text, View } from "@react-pdf/renderer";
import { fondoPerTestoBianco } from "../../../supabase/functions/_shared/temaColori";

export function riferimentiSistema(voci: ReadonlyArray<{ titolo: string }>): number[] | null {
  const ruoli = [/profil|telaio/i, /vetr/i, /ferrament|manigli/i, /posa/i];
  const indici = ruoli.map(ruolo => voci.findIndex(v => ruolo.test(v.titolo)));
  return indici.every(i => i >= 0) && new Set(indici).size === 4 ? indici.map(i => i + 1) : null;
}

/** Functional illustration only: quote-specific geometry stays in the abaco. */
export function InfograficaSistemaPdf({ colore, riferimenti }: { colore: string; riferimenti: number[] }) {
  const accento = fondoPerTestoBianco(colore);
  const richiami = [
    { x: 154, y: 51, labelX: 132, labelY: 54, label: "Profilo", ancora: "end", path: "M 165 51 H 179 L 195 38", tx: 195, ty: 38 },
    { x: 367, y: 51, labelX: 389, labelY: 54, label: "Vetro", ancora: "start", path: "M 356 51 H 344 L 307 74", tx: 307, ty: 74 },
    { x: 154, y: 178, labelX: 132, labelY: 181, label: "Ferramenta", ancora: "end", path: "M 165 178 H 177 L 253 126", tx: 253, ty: 126 },
    { x: 367, y: 178, labelX: 389, labelY: 181, label: "Posa", ancora: "start", path: "M 356 178 H 349 V 211 H 346", tx: 346, ty: 211 },
  ];
  return <View wrap={false} style={{ marginBottom: 16 }}>
    <Svg viewBox="0 0 520 238" style={{ width: "100%", height: 225 }}>
      <Rect x={179} y={8} width={172} height={222} rx={3} fill="#F2F6F7" stroke="#9DB3BA" strokeWidth={1} strokeDasharray="4 3" />
      <Rect x={190} y={19} width={150} height={200} fill="#D9E3E6" stroke={accento} strokeWidth={1.4} />
      <Rect x={201} y={30} width={58} height={178} fill="#EBF5F7" stroke={accento} strokeWidth={1} />
      <Rect x={271} y={30} width={58} height={178} fill="#EBF5F7" stroke={accento} strokeWidth={1} />
      <Path d="M 205 34 L 254 83 M 205 48 L 254 97 M 275 34 L 324 83 M 275 48 L 324 97" stroke="#D1E5E9" strokeWidth={1} />
      <Rect x={249} y={111} width={7} height={18} rx={2} fill={accento} />
      <Path d="M 252 117 V 139" stroke={accento} strokeWidth={4} strokeLinecap="round" />
      {richiami.map((richiamo, i) => <Path key={`linea-${i}`} d={richiamo.path} stroke={accento} strokeWidth={1} fill="none" />)}
      {richiami.map((richiamo, i) => <Circle key={`punto-${i}`} cx={richiamo.tx} cy={richiamo.ty} r={2.5} fill={accento} />)}
      {richiami.map((richiamo, i) => <Circle key={`numero-${i}`} cx={richiamo.x} cy={richiamo.y} r={11} fill={accento} />)}
      {richiami.map((richiamo, i) => <Text key={`n-${i}`} x={richiamo.x} y={richiamo.y + 3} fill="#FFFFFF" style={{ fontSize: 9, fontWeight: 700, textAnchor: "middle" } as never}>{String(riferimenti[i]).padStart(2, "0")}</Text>)}
      {richiami.map((richiamo, i) => <Text key={`label-${i}`} x={richiamo.labelX} y={richiamo.labelY} fill={accento} style={{ fontSize: 11, textAnchor: richiamo.ancora } as never}>{richiamo.label}</Text>)}
    </Svg>
    <Text style={{ fontSize: 8, color: "#64748B", lineHeight: 1.35, marginTop: 5 }}>
      Schema funzionale illustrativo, non il disegno del prodotto ordinato. Per misure, aperture e configurazione fa fede l'abaco del preventivo.
    </Text>
  </View>;
}

export function InfograficaFascicoloPdf({ colore, voci }: { colore: string; voci: ReadonlyArray<{ titolo: string }> }) {
  const accento = fondoPerTestoBianco(colore);
  return <View wrap={false} style={{ marginBottom: 16 }}>
    <View style={{ height: 190, position: "relative" }}>
      <Svg viewBox="0 0 520 190" style={{ width: "100%", height: 190 }}>
        {voci.map((_, i) => <Path key={i} d={[
          "M 165 43 H 180 L 210 78", "M 355 43 H 340 L 310 78",
          "M 165 145 H 180 L 210 119", "M 355 145 H 340 L 310 119",
        ][i]} stroke="#A5B7BE" strokeWidth={1} fill="none" />)}
        <Rect x={211} y={31} width={98} height={118} rx={3} fill="#FFFFFF" stroke="#B5C5CB" strokeWidth={1} />
        <Rect x={202} y={40} width={98} height={118} rx={3} fill="#FFFFFF" stroke="#B5C5CB" strokeWidth={1} />
        <Path d="M 196 64 V 51 H 239 L 249 64 H 319 V 154 H 196 Z" fill="#EDF3F5" stroke={accento} strokeWidth={1.5} />
        <Path d="M 190 85 H 328 L 316 159 H 196 Z" fill={accento} />
        <Text x={259} y={114} fill="#FFFFFF" style={{ fontSize: 10, fontWeight: 700, textAnchor: "middle" } as never}>IL TUO FASCICOLO</Text>
        <Text x={259} y={132} fill="#FFFFFF" style={{ fontSize: 8, textAnchor: "middle" } as never}>Informazioni da conservare</Text>
      </Svg>
      {voci.map((voce, i) => <View key={i} style={{ position: "absolute", top: i < 2 ? 24 : 120,
        ...(i % 2 === 0 ? { left: 0 } : { right: 0 }), width: 145 }}>
        <Text style={{ fontSize: 8, fontWeight: 700, color: accento, marginBottom: 5 }}>{String(i + 1).padStart(2, "0")}</Text>
        <Text style={{ fontSize: 10, lineHeight: 1.3, color: "#334155" }}>{voce.titolo}</Text>
      </View>)}
    </View>
    <Text style={{ fontSize: 8, color: "#64748B", lineHeight: 1.35, marginTop: 5 }}>
      Schema delle informazioni previste dal percorso: non attesta che i documenti siano già stati consegnati.
    </Text>
  </View>;
}
