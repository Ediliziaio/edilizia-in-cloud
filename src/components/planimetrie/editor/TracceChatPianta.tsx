import { useMemo, type CSSProperties } from "react";
import { aperturaNellaVista, type DatiVista, type Pianta, type Punto } from "./adattatore";
import { visibile, type Vista } from "./comandi";
import { vanoApertura } from "./disegno";
import type { Selezione } from "./TelaPlanimetria";

export interface IstantaneaChat {
  pianta: Pianta;
  locali: DatiVista["locali"];
}

export interface AnimazioneChatTela {
  numero: number;
  prima: IstantaneaChat;
  evidenza?: Selezione;
}

interface Forma {
  tipo: Selezione["tipo"];
  id: string;
  punti: Punto[];
  chiusa?: boolean;
  stato?: string;
}

const chiave = ({ tipo, id }: Pick<Forma, "tipo" | "id">) => `${tipo}:${id}`;
const percorso = (f: Forma) => "M" + f.punti.map(p => `${p.x.toFixed(2)} ${p.y.toFixed(2)}`).join("L") + (f.chiusa ? "Z" : "");

function formeVisibili({ pianta, locali }: IstantaneaChat, vista: Vista): Forma[] {
  const muri = new Map(pianta.muri.filter(m => visibile(m.stato, vista)).map(m => [m.id, m]));
  const forme: Forma[] = Array.from(muri.values(), m => ({
    tipo: "muro", id: m.id, punti: [m.p1, m.p2], stato: `${m.stato}:${m.spessore}:${m.altezza}`,
  }));
  for (const a of pianta.aperture) {
    const muro = muri.get(a.muroId);
    if (!muro || !visibile(a.stato, vista)) continue;
    const apertura = aperturaNellaVista(pianta, a, vista);
    forme.push({ tipo: "apertura", id: a.id, punti: vanoApertura(a, muro), chiusa: true,
      stato: `${a.stato}:${a.tipo}:${a.altezza}:${a.manovra}:${a.verso.cerniera}:${a.verso.lato}:${apertura.zanzariera ?? ""}` });
  }
  for (const l of locali) {
    const finiture = vista === "progetto" ? pianta.nomiProgetto?.[l.id]?.finiture : undefined;
    forme.push({ tipo: "locale", id: l.id, punti: l.contorno, chiusa: true, stato: `${l.nome}:${l.destinazione}:${JSON.stringify(finiture)}` });
  }
  for (const e of pianta.elementi ?? []) {
    if (!visibile(e.stato, vista)) continue;
    const angolo = e.rotazione * Math.PI / 180;
    const c = Math.cos(angolo), s = Math.sin(angolo);
    const w = e.larghezza / 2, h = e.profondita / 2;
    const punti = [[-w, -h], [w, -h], [w, h], [-w, h]].map(([x, y]) => ({ x: e.centro.x + x * c - y * s, y: e.centro.y + x * s + y * c }));
    forme.push({ tipo: "elemento", id: e.id, punti, chiusa: true, stato: `${e.stato}:${e.tipo}:${e.altezza ?? ""}` });
  }
  for (const a of pianta.aree ?? []) {
    if (visibile(a.stato, vista)) forme.push({ tipo: "area", id: a.id, punti: a.contorno, chiusa: true, stato: `${a.stato}:${a.tipo}:${a.recinzione ?? ""}` });
  }
  return forme.filter(f => f.punti.length >= 2);
}

function differenze(prima: IstantaneaChat, dopo: IstantaneaChat, vista: Vista, evidenza?: Selezione, escludiMuro?: string) {
  const vecchie = new Map(formeVisibili(prima, vista).map(f => [chiave(f), f]));
  const aggiunte: { forma: Forma; prima?: Forma; d: string }[] = [];
  const tracciaPrima: string[] = [];
  for (const forma of formeVisibili(dopo, vista)) {
    const id = chiave(forma);
    const precedente = vecchie.get(id);
    vecchie.delete(id);
    if (forma.tipo === "muro" && forma.id === escludiMuro) continue;
    const d = percorso(forma);
    const precedenteD = precedente && percorso(precedente);
    if (d === precedenteD && forma.stato === precedente?.stato && (!evidenza || id !== chiave(evidenza))) continue;
    if (precedenteD && d !== precedenteD) tracciaPrima.push(precedenteD);
    aggiunte.push({ forma, prima: precedente, d });
  }
  for (const f of vecchie.values()) tracciaPrima.push(percorso(f));
  return { aggiunte, tracciaPrima: tracciaPrima.join("") };
}

export function TracceChatPianta({ prima, dopo, vista, numero, evidenza, escludiMuro }: {
  prima: IstantaneaChat;
  dopo: IstantaneaChat;
  vista: Vista;
  numero?: number;
  evidenza?: Selezione;
  escludiMuro?: string;
}) {
  const { aggiunte, tracciaPrima } = useMemo(() => differenze(prima, dopo, vista, evidenza, escludiMuro), [prima, dopo, vista, evidenza, escludiMuro]);
  if (!aggiunte.length && !tracciaPrima) return null;
  const animata = numero !== undefined;
  const trattiAnimati = animata ? aggiunte.slice(0, 24) : [];
  const d = aggiunte.slice(trattiAnimati.length).map(t => t.d).join("");
  return <g pointerEvents="none" aria-hidden="true" data-chat-traccia={numero} data-chat-differenze={animata ? undefined : ""}>
    {tracciaPrima && <path d={tracciaPrima} className={animata ? "pl-chat-traccia-prima" : undefined} fill="none"
      stroke="#b45309" strokeWidth={2.5} strokeDasharray="6 4" vectorEffect="non-scaling-stroke" />}
    {d && <path d={d} className={animata ? "pl-chat-traccia-campo" : undefined}
      fill="none" stroke="#0f766e" strokeWidth={2.5} strokeLinecap="round" vectorEffect="non-scaling-stroke" />}
    {trattiAnimati.map(({ forma, prima: precedente, d }, i) => {
      const ritardo = { "--pl-ritardo": `${Math.min(i, 5) * 22}ms` } as CSSProperties;
      if (forma.chiusa) return <path key={chiave(forma)} d={d} className="pl-chat-traccia-campo" style={ritardo}
        fill="#14b8a6" fillOpacity={0.12} stroke="#0f766e" strokeWidth={3} vectorEffect="non-scaling-stroke" />;
      const [a, b] = forma.punti;
      const x = b.x - a.x, y = b.y - a.y;
      const traslata = precedente && Math.abs(precedente.punti[1].x - precedente.punti[0].x - x) < 0.1
        && Math.abs(precedente.punti[1].y - precedente.punti[0].y - y) < 0.1 && percorso(precedente) !== d;
      const offset = traslata ? { "--pl-da-x": `${precedente.punti[0].x - a.x}px`, "--pl-da-y": `${precedente.punti[0].y - a.y}px` } : undefined;
      return <g key={chiave(forma)} transform={`translate(${a.x} ${a.y})`}>
        <g className={traslata ? "pl-chat-traccia-sposta" : undefined} style={offset as CSSProperties}>
          <g transform={`rotate(${Math.atan2(y, x) * 180 / Math.PI})`}>
            <line x2={Math.hypot(x, y)} className={traslata ? "pl-chat-traccia-campo" : "pl-chat-traccia-disegna"} style={ritardo}
              stroke="#0f766e" strokeWidth={4} strokeLinecap="round" vectorEffect="non-scaling-stroke" />
          </g>
        </g>
      </g>;
    })}
  </g>;
}
