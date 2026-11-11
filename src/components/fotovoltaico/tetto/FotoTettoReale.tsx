import { facceConAreePosa } from "./areaPosa";
import { useRef, useState, type PointerEvent as EventoPuntatore } from "react";
import { pannelliDalDisegnoReale, dalDisegnoAlMondo, dallaFotoAlDisegno, cambiaModuloReale, type SelezioneReale, type InquadraturaReale } from "./tettoReale";
import { limiteModuliDisegno, aggiornaOstacoloConPosa, arrotondaMetro, pannelliDaRivedere, posizioneModuloValida, puntoNelPoligono, type DisegnoCommercialeFv, type PuntoFv, type ModuloPosatoFv } from "../../../../supabase/functions/_shared/fvDisegnoCommerciale";
import { useRilievo, proiettaFoto } from "./RilievoContext";
import { pixelMondo } from "./rilievoLocale";
import { sagomeOstacoliEdificio } from "./tettoReale";
type Vista = {
    x: number;
    y: number;
    w: number;
    h: number;
};
type Drag = {
    tipo: "pannello";
    id: string;
    ancora: PuntoFv;
    faldaId: string;
    pixel: PuntoFv;
    proposta: ModuloPosatoFv | null;
    mosso: boolean;
} | {
    tipo: "ostacolo";
    faldaId: string;
    start: PuntoFv;
    end: PuntoFv;
};
export function FotoTettoReale({ piano, onChange, modificabile, selezione, onSelezione, onProvvisorio, inquadratura }: {
    piano: DisegnoCommercialeFv;
    onChange: (p: DisegnoCommercialeFv) => void;
    modificabile: boolean;
    selezione: SelezioneReale;
    onSelezione: (s: SelezioneReale) => void;
    onProvvisorio: (p: DisegnoCommercialeFv | null) => void;
    inquadratura: InquadraturaReale;
}) {
    const { edificio, orto } = useRilievo(), falde = facceConAreePosa(edificio, piano).filter(f => f.tipo === "RoofSurface");
    const puntoFoto = (p: {
        x: number;
        y: number;
        z: number;
    }) => orto ? proiettaFoto(orto, p) : { x: 0, y: 0 };
    const puntiFoto = (ps: Array<{
        x: number;
        y: number;
        z: number;
    }>) => ps.map(p => { const q = puntoFoto(p); return `${q.x},${q.y}`; }).join(" ");
    const [tool, setTool] = useState<"seleziona" | "pannello" | "ostacolo">("seleziona"), [notifica, setNotifica] = useState<{
        testo: string;
        piano: DisegnoCommercialeFv;
    } | null>(null), [disegno, setDisegno] = useState<Drag | null>(null), [preview, setPreview] = useState<DisegnoCommercialeFv | null>(null);
    const [manuale, setManuale] = useState<{
        versione: number;
        vista: Vista;
    } | null>(null);
    const svg = useRef<SVGSVGElement>(null), drag = useRef<Drag | null>(null), seriale = useRef(0);
    const nota = notifica?.piano === piano ? notifica.testo : "";
    const setNota = (testo: string) => setNotifica({ testo, piano });
    const tutti = falde.flatMap(f => f.anelli[0].map(puntoFoto));
    const minX = tutti.length ? Math.min(...tutti.map(p => p.x)) : 0, minY = tutti.length ? Math.min(...tutti.map(p => p.y)) : 0, maxX = tutti.length ? Math.max(...tutti.map(p => p.x)) : orto?.larghezza ?? 800, maxY = tutti.length ? Math.max(...tutti.map(p => p.y)) : orto?.altezza ?? 800;
    const lato = Math.max(maxX - minX, maxY - minY) * 1.45;
    let vista: Vista = { x: (minX + maxX - lato) / 2, y: (minY + maxY - lato) / 2, w: lato, h: lato };
    const fFocus = falde.find(f => f.id === inquadratura.faldaId);
    if (fFocus) {
        const ps = fFocus.anelli[0].map(puntoFoto), x = Math.min(...ps.map(p => p.x)), y = Math.min(...ps.map(p => p.y)), w = Math.max(...ps.map(p => p.x)) - x, h = Math.max(...ps.map(p => p.y)) - y, lato = Math.max(w, h) + 70;
        vista = { x: x + w / 2 - lato / 2, y: y + h / 2 - lato / 2, w: lato, h: lato };
    }
    if (manuale?.versione === inquadratura.versione)
        vista = manuale.vista;
    const zoom = (fattore: number) => { const lato = Math.max(20, Math.min(Math.max(orto?.larghezza ?? 800, orto?.altezza ?? 800) * 2, vista.w * fattore)); setManuale({ versione: inquadratura.versione, vista: { x: vista.x + (vista.w - lato) / 2, y: vista.y + (vista.h - lato) / 2, w: lato, h: lato } }); };
    const punto = (e: EventoPuntatore) => { const m = svg.current?.getScreenCTM(); if (!m)
        return null; const p = new DOMPoint(e.clientX, e.clientY).matrixTransform(m.inverse()); return orto ? pixelMondo(orto.affine, p) : null; };
    const cattura = (e: EventoPuntatore) => { svg.current?.setPointerCapture(e.pointerId); };
    const numeroId = (prefisso: string, usati: string[]) => { let id: string; do {
        id = prefisso + (++seriale.current);
    } while (usati.includes(id)); return id; };
    const cambiaPreview = (p: DisegnoCommercialeFv | null) => { setPreview(p); onProvvisorio(p); };
    const cominciaModulo = (e: EventoPuntatore, m: ModuloPosatoFv) => {
        if (tool !== "seleziona")
            return;
        e.stopPropagation();
        onSelezione({ tipo: "pannello", id: m.id });
        if (!modificabile)
            return;
        const mondo = punto(e);
        if (!mondo)
            return;
        const p = dallaFotoAlDisegno(edificio, m.faldaId, mondo);
        drag.current = { tipo: "pannello", id: m.id, ancora: { x: p.x - m.x, y: p.y - m.y }, faldaId: m.faldaId, pixel: { x: e.clientX, y: e.clientY }, proposta: null, mosso: false };
        cattura(e);
        setNota("");
    };
    const visibile = preview ?? piano, pannelli = pannelliDalDisegnoReale(edificio, visibile), bad = new Set(pannelliDaRivedere(visibile));
    const rett = (d: Extract<Drag, {
        tipo: "ostacolo";
    }>) => ({ x: Math.min(d.start.x, d.end.x), y: Math.min(d.start.y, d.end.y), w: Math.abs(d.end.x - d.start.x), h: Math.abs(d.end.y - d.start.y) });
    if (!orto)
        return <p className="fv-roof-photo-note">Questo rilievo non contiene un’ortofoto. Usa il modello 3D e la pianta delle falde per disporre i pannelli.</p>;
    return <><div className="fv-roof-photo-tools" role="group" aria-label="Comandi sulla foto">
    <button type="button" aria-pressed={tool === "seleziona"} onClick={() => { setTool("seleziona"); setNota(""); }}>Seleziona e trascina</button>
    <button type="button" disabled={!modificabile || (!!piano.industriale && piano.industriale.posa !== "aderente")} aria-pressed={tool === "pannello"} onClick={() => { setTool("pannello"); setNota(""); }}>Aggiungi pannello sulla foto</button>
    <button type="button" disabled={!modificabile} aria-pressed={tool === "ostacolo"} onClick={() => { setTool("ostacolo"); setNota(""); }}>Segna ostacolo sulla foto</button>
    <button type="button" aria-label="Avvicina la foto" onClick={() => zoom(.8)}>+</button><button type="button" aria-label="Allontana la foto" onClick={() => zoom(1.25)}>−</button>
  </div><svg ref={svg} viewBox={`${vista.x} ${vista.y} ${vista.w} ${vista.h}`} className="fv-roof-photo-canvas" role="group" aria-label="Foto del tetto con pannelli e ostacoli" style={{ cursor: tool === "seleziona" ? "default" : "crosshair" }} onPointerDown={e => {
            if (tool === "seleziona") {
                onSelezione(null);
                return;
            }
            if (!modificabile)
                return;
            const mondo = punto(e);
            if (!mondo)
                return;
            const f = falde.find(f => puntoNelPoligono(mondo, f.anelli[0]));
            if (!f) {
                setNota("Scegli un punto all’interno di una falda.");
                return;
            }
            const p = dallaFotoAlDisegno(edificio, f.id, mondo);
            if (tool === "pannello") {
                if (piano.pannelli.length >= limiteModuliDisegno(piano)) {
                    setNota(`Limite di ${limiteModuliDisegno(piano)} moduli raggiunto.`);
                    return;
                }
                const m = { id: numeroId("foto-modulo-", piano.pannelli.map(m => m.id)), faldaId: f.id, x: arrotondaMetro(p.x - piano.modulo.corto / 2), y: arrotondaMetro(p.y - piano.modulo.lungo / 2), orizzontale: false };
                if (!posizioneModuloValida(piano, m)) {
                    setNota("Il pannello qui non entra: rispetta bordo, ingombri e moduli vicini.");
                    return;
                }
                onChange({ ...piano, pannelli: [...piano.pannelli, m] });
                onSelezione({ tipo: "pannello", id: m.id });
                setTool("seleziona");
                setNota("");
                return;
            }
            drag.current = { tipo: "ostacolo", faldaId: f.id, start: p, end: p };
            setDisegno(drag.current);
            cattura(e);
            setNota("");
        }} onPointerMove={e => {
            const d = drag.current, mondo = punto(e);
            if (!d || !mondo)
                return;
            if (d.tipo === "ostacolo") {
                const next = { ...d, end: dallaFotoAlDisegno(edificio, d.faldaId, mondo) };
                drag.current = next;
                setDisegno(next);
                return;
            }
            if (!d.mosso && Math.hypot(e.clientX - d.pixel.x, e.clientY - d.pixel.y) < 3)
                return;
            const faldaId = falde.find(f => puntoNelPoligono(mondo, f.anelli[0]))?.id ?? d.faldaId, p = dallaFotoAlDisegno(edificio, faldaId, mondo), originale = piano.pannelli.find(m => m.id === d.id)!;
            const proposta = { ...originale, faldaId, x: arrotondaMetro(p.x - d.ancora.x), y: arrotondaMetro(p.y - d.ancora.y) };
            drag.current = { ...d, proposta, mosso: true };
            cambiaPreview({ ...piano, pannelli: piano.pannelli.map(m => m.id === d.id ? proposta : m) });
        }} onPointerCancel={() => { drag.current = null; setDisegno(null); cambiaPreview(null); }} onPointerUp={() => {
            const d = drag.current;
            drag.current = null;
            setDisegno(null);
            cambiaPreview(null);
            if (!d)
                return;
            if (d.tipo === "pannello") {
                if (!d.mosso || !d.proposta)
                    return;
                const next = cambiaModuloReale(piano, d.id, d.proposta);
                if (next) {
                    onChange(next);
                    setNota("");
                }
                else
                    setNota("Spostamento annullato: il pannello uscirebbe dal tetto o invaderebbe un altro elemento.");
                return;
            }
            const id = numeroId("foto-ostacolo-", piano.ostacoli.map(o => o.id)), next = aggiornaOstacoloConPosa(piano, { id, ...rett(d) });
            if (!next) {
                setNota("L’ingombro deve misurare almeno 10 cm e restare nella stessa falda, senza sovrapporsi ad altri ostacoli.");
                return;
            }
            onChange(next);
            onSelezione({ tipo: "ostacolo", id });
            setTool("seleziona");
            setNota("");
        }}>
    <image href={orto.url} width={orto.larghezza} height={orto.altezza}/>
    {falde.map(f => <polygon key={f.id} points={puntiFoto(f.anelli[0])} fill={f.id === inquadratura.faldaId ? "#38bdf815" : "#38bdf805"} stroke="#f8fafc" strokeWidth={1.2}/>)}
    {pannelli.map((p, i) => { const m = visibile.pannelli[i], scelto = selezione?.tipo === "pannello" && selezione.id === m.id; return <polygon key={m.id} role="button" tabIndex={0} aria-label={`Modulo foto ${i + 1}`} aria-pressed={scelto} points={puntiFoto(p.vertici)} fill={bad.has(m.id) ? "#b93e3e" : "#101b22"} stroke={scelto ? "#fb923c" : "#b6c6ce"} strokeWidth={scelto ? 2.4 : .8} style={{ cursor: tool === "seleziona" ? (modificabile ? "grab" : "pointer") : "inherit" }} onPointerDown={e => cominciaModulo(e, m)} onKeyDown={e => { if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        onSelezione({ tipo: "pannello", id: m.id });
    } if (modificabile && (e.key === "Delete" || e.key === "Backspace")) {
        e.preventDefault();
        onChange({ ...piano, pannelli: piano.pannelli.filter(p => p.id !== m.id) });
        onSelezione(null);
    } }}/>; })}
    {sagomeOstacoliEdificio(edificio, visibile).map(o => <polygon key={o.id} role="button" tabIndex={0} aria-label={`Ostacolo foto ${o.id}`} aria-pressed={selezione?.tipo === "ostacolo" && selezione.id === o.id} points={puntiFoto(o.vertici)} fill="#fb923c99" stroke={selezione?.id === o.id ? "#facc15" : "#f97316"} strokeWidth={2} onPointerDown={e => { if (tool !== "seleziona")
        return; e.stopPropagation(); onSelezione({ tipo: "ostacolo", id: o.id }); }} onKeyDown={e => { if (e.key === "Enter")
        onSelezione({ tipo: "ostacolo", id: o.id }); }}/>)}
    {disegno?.tipo === "ostacolo" && <polygon points={puntiFoto((() => { const r = rett(disegno); return [{ x: r.x, y: r.y }, { x: r.x + r.w, y: r.y }, { x: r.x + r.w, y: r.y + r.h }, { x: r.x, y: r.y + r.h }].map(p => dalDisegnoAlMondo(edificio, disegno.faldaId, p)); })())} fill="#fb923c66" stroke="#fb923c" strokeWidth={2} strokeDasharray="4 2"/>}
  </svg>{nota && <p role="status" className="fv-roof-photo-note">{nota}</p>}<p className="fv-roof-photo-note">Seleziona un modulo qui o nel 3D. Trascinalo sulla foto: rosso indica una posizione non disponibile, rilasciando viene ripristinata la precedente.</p></>;
}
