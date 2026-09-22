/**
 * Le icone dei blocchi del preventivo nei PDF di react-pdf: i disegni di Lucide
 * (_shared/iconePreventivo.ts), nel colore che si passa. Le usano il documento
 * dei moduli edili e quello di Serramenti.
 */
import { Circle, Ellipse, Line, Path, Polygon, Polyline, Rect, Svg } from "@react-pdf/renderer";
import { ICONE, type NodoIcona, type NomeIcona } from "../../../../supabase/functions/_shared/iconePreventivo";

export function IconaPdf({ nome, colore, lato = 12 }: { nome: NomeIcona; colore: string; lato?: number }) {
  const tratto = { stroke: colore, strokeWidth: 2, strokeLinecap: "round" as const, strokeLinejoin: "round" as const, fill: "none" };
  const numero = (x: string | number | undefined) => (x == null ? undefined : Number(x));
  return (
    <Svg width={lato} height={lato} viewBox="0 0 24 24">
      {(ICONE[nome] as NodoIcona[]).map(([tag, a], i) => {
        switch (tag) {
          case "path": return <Path key={i} d={String(a.d)} {...tratto} />;
          case "circle": return <Circle key={i} cx={numero(a.cx)} cy={numero(a.cy)} r={numero(a.r)} {...tratto} />;
          case "rect": return <Rect key={i} x={numero(a.x) ?? 0} y={numero(a.y) ?? 0} width={numero(a.width)} height={numero(a.height)} rx={numero(a.rx)} ry={numero(a.ry)} {...tratto} />;
          case "line": return <Line key={i} x1={numero(a.x1)} y1={numero(a.y1)} x2={numero(a.x2)} y2={numero(a.y2)} {...tratto} />;
          case "polyline": return <Polyline key={i} points={String(a.points)} {...tratto} />;
          case "polygon": return <Polygon key={i} points={String(a.points)} {...tratto} />;
          case "ellipse": return <Ellipse key={i} cx={numero(a.cx)} cy={numero(a.cy)} rx={numero(a.rx)} ry={numero(a.ry)} {...tratto} />;
          default: return null;
        }
      })}
    </Svg>
  );
}
