import { Line, Polyline, Svg, Text, View } from "@react-pdf/renderer";
import type { DocEdileDati } from "./documentoEdileTipi";

type Grafico = NonNullable<NonNullable<DocEdileDati["sezioniTecniche"]>[number]["grafico"]>;
export function GraficoPreventivo({ dati, colore, larghezza }: { dati: Grafico; colore: string; larghezza: number }) {
  const serie = dati.serie.filter(s => s.valori.length === dati.etichette.length && s.valori.every(Number.isFinite));
  if (!serie.length || dati.etichette.length < 2) return null;
  const valori = serie.flatMap(s => s.valori);
  const min = Math.min(0, ...valori), max = Math.max(0, ...valori);
  const scala = max - min || 1;
  const x = (i: number) => 55 + i * (larghezza - 70) / (dati.etichette.length - 1);
  const y = (v: number) => 15 + (max - v) * 135 / scala;
  const colori = [colore, "#15803D", "#B45309"];
  return <View wrap={false} style={{ marginTop: 18, marginBottom: 12 }}>
    <Svg viewBox={`0 0 ${larghezza} 180`} style={{ width: larghezza, height: 180 }}>
      <Line x1={55} y1={y(0)} x2={larghezza - 15} y2={y(0)} stroke="#94A3B8" strokeWidth={0.7} />
      <Text x={2} y={22} style={{ fontSize: 7 }}>{max.toLocaleString("it-IT", { maximumFractionDigits: 0 })}</Text>
      <Text x={2} y={150} style={{ fontSize: 7 }}>{min.toLocaleString("it-IT", { maximumFractionDigits: 0 })}</Text>
      {serie.map((s, i) => <Polyline key={s.nome} points={s.valori.map((v, j) => `${x(j)},${y(v)}`).join(" ")} fill="none" stroke={colori[i % colori.length]} strokeWidth={2} />)}
      {dati.etichette.map((etichetta, i) => i === 0 || i === dati.etichette.length - 1 || i % Math.ceil(dati.etichette.length / 6) === 0 ? <Text key={i} x={x(i) - 10} y={170} style={{ fontSize: 7 }}>{etichetta}</Text> : null)}
    </Svg>
    {serie.map((s, i) => <Text key={s.nome} style={{ color: colori[i % colori.length], fontSize: 8, marginTop: 3 }}>{s.nome}</Text>)}
  </View>;
}
