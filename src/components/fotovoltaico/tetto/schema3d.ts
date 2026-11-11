import { creaPianoReale, dot, sub, riferimentiTettoReale, type P3 } from "./tettoReale";
import { edificioDaFalde, nuovaFalda, type RilievoRuntime } from "./rilievoLocale";
import { ingombroModulo, limitiDisegno, type DisegnoCommercialeFv, type PuntoFv } from "../../../../supabase/functions/_shared/fvDisegnoCommerciale";
/** Vista metrica derivata dal disegno, senza attribuire un rilievo reale al cliente. */
export function schemaDalDisegno(p: DisegnoCommercialeFv): {
    runtime: RilievoRuntime;
    piano: DisegnoCommercialeFv;
} {
    const b = limitiDisegno(p), altezza = p.schema3d?.altezza ?? 8, ang = (p.schema3d?.pendenza ?? 20) * Math.PI / 180, c = Math.cos(ang), s = Math.sin(ang), due = p.falde.length === 2;
    const mondo = (fid: string, q: PuntoFv): P3 => { const f = p.falde.find(f => f.id === fid)!, ys = f.punti.map(q => q.y), min = Math.min(...ys), max = Math.max(...ys), seconda = due && p.falde.indexOf(f) === 1; return { x: q.x - b.x - b.w / 2, y: (q.y - b.y - b.h / 2) * c, z: altezza + (seconda ? max - q.y : q.y - min) * s }; };
    const falde = p.falde.map(f => ({ ...nuovaFalda(f.punti.map(q => mondo(f.id, q)), f.id, f.nome), nome: f.nome })), edificio = { ...edificioDaFalde(falde, true), id: "schema-preventivo", attributi: { paretiIllustrative: true, schemaPreventivo: true } };
    const refs = riferimentiTettoReale(edificio), proietta = (fid: string, q: PuntoFv) => { const r = refs.find(r => r.faccia.id === fid)!, v = sub(mondo(fid, q), r.piano.origine); return { x: dot(v, r.piano.u) + r.offset.x, y: dot(v, r.piano.v) + r.offset.y }; };
    const rect = (fid: string, r: {
        x: number;
        y: number;
        w: number;
        h: number;
    }) => { const qs = [{ x: r.x, y: r.y }, { x: r.x + r.w, y: r.y }, { x: r.x + r.w, y: r.y + r.h }, { x: r.x, y: r.y + r.h }].map(q => proietta(fid, q)), xs = qs.map(q => q.x), ys = qs.map(q => q.y); return { x: Math.min(...xs), y: Math.min(...ys), w: Math.max(...xs) - Math.min(...xs), h: Math.max(...ys) - Math.min(...ys) }; };
    const piano = { ...creaPianoReale(edificio, p.modulo), distanzaBordo: p.distanzaBordo, spazioModuli: p.spazioModuli, pannelli: p.pannelli.map(m => { const r = rect(m.faldaId, ingombroModulo(m, p.modulo)); return { ...m, x: r.x, y: r.y }; }), ostacoli: p.ostacoli.map(o => { const f = p.falde.find(f => o.x >= Math.min(...f.punti.map(q => q.x)) && o.y >= Math.min(...f.punti.map(q => q.y)) && o.y < Math.max(...f.punti.map(q => q.y))) ?? p.falde[0]; return { ...o, ...rect(f.id, o) }; }) };
    return { runtime: { edificio, orto: null, modello: null, fonte: null }, piano };
}
export const RUNTIME_VUOTO: RilievoRuntime = { edificio: edificioDaFalde([], false), orto: null, modello: null, fonte: null };
