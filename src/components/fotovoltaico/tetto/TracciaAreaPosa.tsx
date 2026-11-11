import { useRef, useState, type PointerEvent } from "react";
import type { DisegnoCommercialeFv, PuntoFv } from "../../../../supabase/functions/_shared/fvDisegnoCommerciale";
import { areaPoligono } from "../../../../supabase/functions/_shared/fvDisegnoCommerciale";
import { dalDisegnoAlMondo, dallaFotoAlDisegno } from "./tettoReale";
import { pixelMondo } from "./rilievoLocale";
import { proiettaFoto } from "./RilievoContext";
import type { RilievoRuntime } from "./rilievoLocale";
import { applicaAreaPosa } from "./areaPosa";
type Props = {
    piano: DisegnoCommercialeFv;
    runtime: RilievoRuntime;
    faldaId: string;
    modificabile: boolean;
    onChange: (p: DisegnoCommercialeFv) => void;
    richiediModuli?: boolean;
};
export function TracciaAreaPosa({ piano, runtime, faldaId, modificabile, onChange, richiediModuli = false }: Props) {
    const [punti, setPunti] = useState<PuntoFv[]>([]), [chiuso, setChiuso] = useState(false), [attivo, setAttivo] = useState(false), [zoom, setZoom] = useState(1), [errore, setErrore] = useState(""), [selezionato, setSelezionato] = useState<number | null>(null);
    const svg = useRef<SVGSVGElement>(null), drag = useRef<number | null>(null), { orto, edificio } = runtime, falda = piano.falde.find(f => f.id === faldaId);
    if (!orto || !falda)
        return <p className="text-sm text-slate-600">Serve un’ortofoto allineata al modello per tracciare il perimetro sulla foto.</p>;
    const originali = falda.punti.map(p => proiettaFoto(orto, dalDisegnoAlMondo(edificio, faldaId, p))), base = edificio.facce.find(f => f.id === faldaId)?.anelli[0].map(p => proiettaFoto(orto, p)) ?? originali;
    const minX = Math.min(...base.map(p => p.x)), maxX = Math.max(...base.map(p => p.x)), minY = Math.min(...base.map(p => p.y)), maxY = Math.max(...base.map(p => p.y)), lato = Math.max(maxX - minX, maxY - minY) * 1.45 / zoom, view = { x: (minX + maxX - lato) / 2, y: (minY + maxY - lato) / 2, w: lato };
    const serializza = (ps: PuntoFv[]) => ps.map(p => `${p.x},${p.y}`).join(" ");
    const locali = (ps: PuntoFv[]) => ps.map(p => dallaFotoAlDisegno(edificio, faldaId, pixelMondo(orto.affine, p)));
    const coordinate = (e: PointerEvent<SVGSVGElement>) => { const m = svg.current?.getScreenCTM(); if (!m)
        return null; const q = new DOMPoint(e.clientX, e.clientY).matrixTransform(m.inverse()); return { x: q.x, y: q.y }; };
    const sposta = (i: number, p: PuntoFv) => { if (!modificabile || p.x < 0 || p.y < 0 || p.x > orto.larghezza || p.y > orto.altezza)
        return; setPunti(v => v.map((q, j) => j === i ? p : q)); setErrore(""); };
    let proposta: ReturnType<typeof applicaAreaPosa> | null = null, problema = "";
    if (chiuso && punti.length >= 3) {
        try {
            proposta = applicaAreaPosa(piano, faldaId, locali(punti));
            if (richiediModuli && !proposta.dopo)
                problema = "Con questi bordi non entra un pannello: allarga l’area o verifica le dimensioni.";
        }
        catch (e) {
            problema = e instanceof Error ? e.message : "Perimetro non valido";
        }
    }
    const messaggio = errore || problema;
    return <section className="rounded-2xl border border-sky-200 bg-white p-4 sm:p-6" aria-label="Traccia area di posa sulla foto"><p className="text-xs font-semibold uppercase tracking-widest text-sky-700">1 / Il perimetro lo scegli tu</p><h2 className="mt-2 text-xl font-bold text-slate-800">Segui il bordo del tetto, punto per punto.</h2><p className="mt-2 text-sm text-slate-600">Una falda per volta: clicca i vertici in ordine lungo il bordo visibile. Chiudi sul primo punto, poi trascina i punti per rifinire il contorno. La posa userà quest’area e il margine dal bordo impostato.</p><div className="mt-4 flex flex-wrap gap-2"><button className="rounded-lg bg-sky-800 px-4 py-2 text-sm font-semibold text-white disabled:opacity-40" disabled={!modificabile} onClick={() => { setAttivo(true); setPunti([]); setChiuso(false); setSelezionato(null); setErrore(""); }}>Traccia da zero</button><button className="rounded-lg border px-4 py-2 text-sm" disabled={!modificabile} onClick={() => { setAttivo(true); setPunti(originali); setChiuso(true); setSelezionato(null); setErrore(""); }}>Correggi i punti attuali</button><button className="rounded-lg border px-3 py-2 text-sm" aria-label="Avvicina perimetro" onClick={() => setZoom(z => Math.min(3, z * 1.25))}>+</button><button className="rounded-lg border px-3 py-2 text-sm" aria-label="Allontana perimetro" onClick={() => setZoom(z => Math.max(.65, z / 1.25))}>−</button></div>
 <svg ref={svg} viewBox={`${view.x} ${view.y} ${view.w} ${view.w}`} className="mt-4 block w-full rounded-xl bg-slate-100" style={{ height: 420, touchAction: "none", cursor: attivo && !chiuso ? "crosshair" : "default" }} role="group" aria-label="Foto: clicca i vertici del perimetro" onPointerDown={e => { if (!attivo || chiuso || !modificabile || punti.length >= 64)
        return; const p = coordinate(e); if (!p || p.x < 0 || p.y < 0 || p.x > orto.larghezza || p.y > orto.altezza)
        return; setPunti(v => [...v, p]); setErrore(""); }} onPointerMove={e => { if (drag.current === null)
        return; const p = coordinate(e); if (p)
        sposta(drag.current, p); }} onPointerUp={() => { drag.current = null; }} onPointerCancel={() => { drag.current = null; }}>
 <image href={orto.url} width={orto.larghezza} height={orto.altezza}/>{!attivo && <polygon points={serializza(originali)} fill="#22c55e18" stroke="#eaf4cf" strokeWidth={1.2}/>}{attivo && <>{chiuso ? <polygon points={serializza(punti)} fill={messaggio ? "#dc262622" : "#10b98122"} stroke={messaggio ? "#f87171" : "#8cf5cd"} strokeWidth={1.3}/> : <polyline points={serializza(punti)} fill="none" stroke="#8cf5cd" strokeWidth={1.3}/>} {punti.map((p, i) => <g key={i}><circle cx={p.x} cy={p.y} r={view.w / 65} fill={selezionato === i ? "#fbbf24" : i === 0 ? "#047857" : "#fff"} stroke="#123847" strokeWidth={view.w / 350} role="button" tabIndex={0} aria-label={`Vertice ${i + 1}${i === 0 && !chiuso ? ": chiudi il perimetro" : ""}`} onPointerDown={e => { e.stopPropagation(); if (!modificabile)
        return; if (i === 0 && !chiuso && punti.length >= 3) {
        setChiuso(true);
        return;
    } setSelezionato(i); drag.current = i; svg.current?.setPointerCapture(e.pointerId); }} onKeyDown={e => { if (!modificabile)
        return; const mosse: Record<string, PuntoFv> = { ArrowLeft: { x: -1, y: 0 }, ArrowRight: { x: 1, y: 0 }, ArrowUp: { x: 0, y: -1 }, ArrowDown: { x: 0, y: 1 } }; if (mosse[e.key]) {
        e.preventDefault();
        const d = mosse[e.key], passo = e.shiftKey ? 10 : 1;
        sposta(i, { x: p.x + d.x * passo, y: p.y + d.y * passo });
    } if ((e.key === "Enter" || e.key === " ") && i === 0 && !chiuso && punti.length >= 3) {
        e.preventDefault();
        setChiuso(true);
    } if (e.key === "Delete" || e.key === "Backspace") {
        e.preventDefault();
        setPunti(v => v.filter((_, j) => j !== i));
        setChiuso(false);
        setSelezionato(null);
    } }}/><text x={p.x + view.w / 45} y={p.y - view.w / 65} fill="white" stroke="#123847" strokeWidth={.4} paintOrder="stroke" fontSize={view.w / 35} fontWeight="bold" pointerEvents="none">{i + 1}</text></g>)}</>}
 </svg>{attivo && <><div className="mt-3 flex flex-wrap items-center gap-3 text-sm"><strong>{punti.length} punti · {chiuso ? "perimetro chiuso" : "clicca il punto 1 per chiudere"}</strong><button className="rounded-lg border px-3 py-2" disabled={!modificabile || !punti.length} onClick={() => { setPunti(v => v.slice(0, -1)); setChiuso(false); setErrore(""); }}>Annulla ultimo punto</button><button className="rounded-lg border px-3 py-2" disabled={!modificabile || punti.length < 3 || chiuso} onClick={() => setChiuso(true)}>Chiudi area</button><button className="rounded-lg border px-3 py-2" disabled={!modificabile || selezionato === null} onClick={() => { setPunti(v => v.filter((_, i) => i !== selezionato)); setChiuso(false); setSelezionato(null); }}>Rimuovi punto selezionato</button></div>{proposta && !messaggio && <p className="mt-3 text-sm text-slate-600">Area: {areaPoligono(locali(punti)).toLocaleString("it-IT", { maximumFractionDigits: 1 })} m² sul piano della falda · nuova proposta: {proposta.dopo} moduli dei {proposta.prima} attuali. Gli ostacoli sono conservati.</p>}<button className="mt-3 rounded-lg bg-emerald-700 px-4 py-3 text-sm font-semibold text-white disabled:opacity-40" disabled={!modificabile || !proposta || !!messaggio} onClick={() => { if (!proposta || messaggio)
        return; onChange(proposta.piano); setAttivo(false); setPunti([]); setChiuso(false); setErrore(""); }}>Usa perimetro e ricalcola posa</button></>}{messaggio && <p role="alert" className="mt-3 text-sm text-red-700">{messaggio}</p>}<p className="mt-3 text-xs leading-5 text-slate-500">La correzione definisce l’area commerciale di posa sulla foto. Quota e pendenza rimangono quelle del modello; l’accuratezza dipende da scala e allineamento dell’ortofoto. Puoi annullare l’applicazione dalla bozza. Per rilievi nuovi usa l’importazione drone.</p></section>;
}
