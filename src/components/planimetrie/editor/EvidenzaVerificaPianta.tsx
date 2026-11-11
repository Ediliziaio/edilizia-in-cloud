import type { Pianta, Punto } from "./adattatore";
import type { VerificaLettura } from "../../../../shared/planimetrie/letturaTipi.ts";
import { punti, vanoApertura } from "./disegno";

/** Evidenza di confronto, senza modificare o confermare la geometria. */
export function EvidenzaVerificaPianta({ pianta, verifica, scala = 1 }: { pianta: Pianta; verifica?: VerificaLettura; scala?: number }) {
  const r = verifica?.riferimento;
  if (!r) return null;
  let contorno: Punto[] | undefined;
  if (r.tipo === "locale") contorno = pianta.locali.find((l) => l.id === r.oggettoId)?.contorno;
  else {
    const a = pianta.aperture.find((a) => a.id === r.oggettoId);
    const m = pianta.muri.find((m) => m.id === a?.muroId);
    if (a && m) contorno = vanoApertura(a, m);
  }
  if (!contorno?.length) return null;
  const minX = Math.min(...contorno.map((p) => p.x)), maxX = Math.max(...contorno.map((p) => p.x));
  const minY = Math.min(...contorno.map((p) => p.y)), maxY = Math.max(...contorno.map((p) => p.y));
  const distanza = 18 / scala;
  const linea = r.tipo === "locale" && ["larghezza", "profondita"].includes(r.campo)
    ? r.campo === "profondita" ? { x1: maxX + distanza, y1: minY, x2: maxX + distanza, y2: maxY }
      : { x1: minX, y1: minY - distanza, x2: maxX, y2: minY - distanza }
    : null;
  return <g role="img" aria-label={`Quota evidenziata sulla pianta: ${verifica!.descrizione}`} pointerEvents="none" stroke="#ea580c" strokeWidth={3 / scala} strokeLinejoin="round">
    <title>{verifica!.descrizione}</title>
    <polygon points={punti(contorno)} fill="#ffedd5" fillOpacity={0.24} strokeDasharray={`${6 / scala} ${3 / scala}`} />
    {linea && <><line {...linea} strokeWidth={5 / scala} />{[{ x: linea.x1, y: linea.y1 }, { x: linea.x2, y: linea.y2 }].map((p, i) => <circle key={i} cx={p.x} cy={p.y} r={4 / scala} fill="#ea580c" />)}</>}
  </g>;
}

export function MiniPiantaVerifica({ pianta, verifica }: { pianta: Pianta; verifica?: VerificaLettura }) {
  const ps = pianta.muri.flatMap((m) => [m.p1, m.p2]);
  if (!ps.length) return null;
  const x = Math.min(...ps.map((p) => p.x)) - 50, y = Math.min(...ps.map((p) => p.y)) - 50;
  const w = Math.max(...ps.map((p) => p.x)) - x + 50, h = Math.max(...ps.map((p) => p.y)) - y + 50;
  return <svg role="img" aria-label="Pianta di confronto con quota evidenziata" viewBox={`${x} ${y} ${w} ${h}`} className="h-full min-h-48 w-full rounded-lg border bg-white">
    {pianta.locali.map((l) => <polygon key={l.id} points={punti(l.contorno)} fill="#f1f5f9" />)}
    {pianta.muri.map((m) => <line key={m.id} x1={m.p1.x} y1={m.p1.y} x2={m.p2.x} y2={m.p2.y} stroke="#475569" strokeWidth={m.spessore} />)}
    {pianta.aperture.map((a) => { const m = pianta.muri.find((m) => m.id === a.muroId); return m ? <polygon key={a.id} points={punti(vanoApertura(a, m))} fill="white" stroke="#94a3b8" /> : null; })}
    <EvidenzaVerificaPianta pianta={pianta} verifica={verifica} scala={Math.min(240 / w, 420 / h)} />
  </svg>;
}
