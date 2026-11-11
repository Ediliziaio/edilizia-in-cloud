import { useMemo, useState } from "react";
import { facceConAreePosa } from "./areaPosa";
import { propostePosa, firmaPosa, type PropostaPosa } from "./propostePosa";
import { pannelliDalDisegnoReale, sagomeOstacoliEdificio, type P3 } from "./tettoReale";
import { proiettaFoto } from "./RilievoContext";
import type { RilievoRuntime } from "./rilievoLocale";
import { svgDisegnoCommerciale, type DisegnoCommercialeFv } from "../../../../supabase/functions/_shared/fvDisegnoCommerciale";
import type { FvDisegnoPreventivoProps } from "../FvDisegnoPreventivo";
const num = (n: number) => n.toLocaleString("it-IT", { maximumFractionDigits: 2, minimumFractionDigits: 0 });
const eur = (n: number) => n.toLocaleString("it-IT", { style: "currency", currency: "EUR", maximumFractionDigits: 0 });
function FotoProposta({ runtime, piano, faldaId }: {
    runtime: RilievoRuntime;
    piano: DisegnoCommercialeFv;
    faldaId: string;
}) {
    const { edificio, orto } = runtime;
    if (!orto)
        return <div aria-label="Anteprima posa in pianta" dangerouslySetInnerHTML={{ __html: svgDisegnoCommerciale(piano) }}/>;
    const ps = facceConAreePosa(edificio, piano).filter(f => f.id === faldaId).flatMap(f => f.anelli[0].map(p => proiettaFoto(orto, p)));
    if (!ps.length)
        return null;
    const minX = Math.min(...ps.map(p => p.x)), maxX = Math.max(...ps.map(p => p.x)), minY = Math.min(...ps.map(p => p.y)), maxY = Math.max(...ps.map(p => p.y)), lato = Math.max(maxX - minX, maxY - minY) * 1.3;
    const punti = (vs: P3[]) => vs.map(p => { const q = proiettaFoto(orto, p); return `${q.x},${q.y}`; }).join(" ");
    return <svg viewBox={`${(minX + maxX - lato) / 2} ${(minY + maxY - lato) / 2} ${lato} ${lato}`} role="img" aria-label="Anteprima posa sulla foto del tetto" className="block w-full aspect-square rounded-xl"><image href={orto.url} width={orto.larghezza} height={orto.altezza}/>{facceConAreePosa(edificio, piano).filter(f => f.id === faldaId).map(f => <polygon key={f.id} points={punti(f.anelli[0])} fill="none" stroke="#f1f6dc" strokeWidth={.8}/>)}{pannelliDalDisegnoReale(edificio, piano).map((m, i) => <polygon key={i} points={punti(m.vertici)} fill="#132830" stroke="#b9ccd3" strokeWidth={.7}/>)}{sagomeOstacoliEdificio(edificio, piano).map(o => <polygon key={o.id} points={punti(o.vertici)} fill="#e5a45155" stroke="#ffbe66" strokeWidth={1} strokeDasharray="3 2"/>)}</svg>;
}
type Props = {
    piano: DisegnoCommercialeFv;
    runtime: RilievoRuntime;
    potenzaModuloW: number;
    modificabile: boolean;
    onChange: (p: DisegnoCommercialeFv) => void;
    riepilogoProposta?: FvDisegnoPreventivoProps["riepilogoProposta"];
    stimaProduzione?: (p: DisegnoCommercialeFv) => number | null;
    faldaFissa?: string;
    richiestiIniziali?: number;
};
export function SceltaPosaLocale({ piano, runtime, potenzaModuloW, modificabile, onChange, riepilogoProposta, stimaProduzione, faldaFissa, richiestiIniziali }: Props) {
    const [falda, setFalda] = useState(faldaFissa ?? piano.pannelli[0]?.faldaId ?? piano.falde[0]?.id ?? ""), [richiesti, setRichiesti] = useState(richiestiIniziali ?? Math.max(1, piano.pannelli.filter(m => m.faldaId === (faldaFissa ?? piano.pannelli[0]?.faldaId ?? piano.falde[0]?.id)).length)), [scelta, setScelta] = useState<PropostaPosa["id"]>("verticale"), [nota, setNota] = useState("");
    const faldaId = piano.falde.some(f => f.id === falda) ? falda : piano.falde[0]?.id ?? "", proposte = useMemo(() => propostePosa(piano, faldaId, richiesti), [piano, faldaId, richiesti]), visibile = proposte.find(p => p.id === scelta) ?? proposte[0], attuale = firmaPosa(piano), piuModuli = Math.max(...proposte.map(p => p.moduliFalda), 0);
    return <section className="rounded-2xl border border-emerald-100 bg-white p-4 sm:p-6" aria-label="Confronto disposizioni pannelli"><p className="text-xs font-semibold uppercase tracking-widest text-emerald-700">Scegli la posa sulla copertura</p><h2 className="mt-2 text-xl font-bold text-slate-800">Prima confronti. Poi applichi.</h2><p className="mt-2 text-sm text-slate-600">Le alternative rispettano contorno, bordo impostato e zone escluse. Cambia l’anteprima, poi usa la posa scelta per aggiornare quantità e preventivo. I moduli sulle altre falde restano conservati.</p><div className="mt-4 flex flex-wrap gap-4">{!faldaFissa && <label className="text-sm">Falda<select className="ml-2 rounded-lg border p-2" aria-label="Falda per confronto pose" value={faldaId} onChange={e => { setFalda(e.target.value); setNota(""); }}>{piano.falde.map(f => <option key={f.id} value={f.id}>{f.nome}</option>)}</select></label>}<label className="text-sm">Moduli desiderati sulla falda<input className="ml-2 w-20 rounded-lg border p-2" aria-label="Moduli desiderati confronto" type="number" min={1} max={500} step={1} value={richiesti} onChange={e => { setRichiesti(Number(e.target.value)); setNota(""); }}/></label><span className="self-center text-xs text-slate-500">Bordo {num(piano.distanzaBordo * 100)} cm · intermodulo {num(piano.spazioModuli * 100)} cm</span></div><div className="mt-5 grid gap-4 md:grid-cols-3" role="group" aria-label="Alternative di posa">{proposte.map(p => {
            const selezionata = p.id === visibile?.id, applicata = firmaPosa(p.piano) === attuale, riepilogo = riepilogoProposta?.(p.piano), produzione = stimaProduzione?.(p.piano) ?? null, kwp = p.piano.pannelli.length * potenzaModuloW / 1000;
            return <button key={p.id} aria-pressed={selezionata} aria-label={`Anteprima ${p.titolo}`} onClick={() => { setScelta(p.id); setNota(""); }} className={`rounded-xl border-2 p-3 text-left transition-colors ${selezionata ? "border-emerald-700 bg-emerald-50" : "border-slate-200 bg-white"}`}><div className="mb-2 flex min-h-6 justify-between gap-2 text-xs font-semibold"><span className="text-emerald-800">{applicata ? "Nella bozza" : p.id === "verticale" ? "Punto di partenza" : "Alternativa"}</span><span className="text-slate-500">{p.moduliFalda} / {p.richiesti} richiesti</span></div><FotoProposta runtime={runtime} piano={p.piano} faldaId={faldaId}/><h3 className="mt-3 text-base font-bold">{p.titolo}</h3><p className="mt-1 text-xs leading-5 text-slate-600">{p.descrizione}</p><p className="mt-3 text-lg font-bold text-emerald-800">{num(kwp)} kWp <span className="text-xs font-normal text-slate-500">· {p.piano.pannelli.length} moduli totali</span></p><div className="mt-2 border-t border-slate-200 pt-2 text-xs leading-6 text-slate-600"><p>Produzione: <strong>{produzione !== null ? `${num(Math.round(produzione))} kWh/anno` : "da ricalcolare nella bozza"}</strong></p><p>Totale IVA inclusa: <strong>{riepilogo?.totale != null ? eur(riepilogo.totale) : "da definire"}</strong></p></div>{p.moduliFalda < richiesti && <p className="mt-2 text-xs text-amber-800">Questa proposta inserisce {p.moduliFalda} dei {richiesti} moduli desiderati.</p>}</button>;
        })}</div>{!proposte.length ? <p role="status" className="mt-4 text-sm text-amber-800">Nessuna posa disponibile con questi dati. Scegli da 1 a 500 moduli e verifica falda, misure e ingombri. Per file inclinate usa la funzione Capannone.</p> : visibile && <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-xl bg-slate-800 p-4 text-white"><div><strong>{visibile.titolo} · {visibile.moduliFalda} moduli sulla falda</strong><p className="mt-1 text-xs text-slate-200">{firmaPosa(visibile.piano) === attuale ? "Questa geometria è già nella bozza." : "Stai confrontando un’anteprima: la bozza resta invariata fino all’applicazione."} {visibile.moduliFalda === piuModuli ? "È tra le proposte con più moduli di questo confronto." : visibile.id === "compatta" ? "Privilegia la regolarità rispetto al numero di moduli." : "Questa alternativa dispone meno moduli della proposta più capiente del confronto."}</p></div><button className="rounded-lg bg-emerald-500 px-4 py-3 text-sm font-semibold text-slate-950 disabled:opacity-50" disabled={!modificabile || firmaPosa(visibile.piano) === attuale} onClick={() => { onChange(visibile.piano); setNota(firmaPosa(visibile.piano)); }}>Usa questa disposizione</button></div>}{nota === attuale && <p role="status" className="mt-3 text-sm font-semibold text-emerald-800">Disposizione applicata: foto, quantità, potenza e preventivo aggiornati.</p>}<p className="mt-3 text-xs leading-5 text-slate-500">Sulla stessa falda, a parità di moduli, verticale e orizzontale hanno la stessa stima energetica. Il confronto non simula ombre, collegamenti elettrici o verifiche strutturali. Il numero ottenuto è una proposta geometrica, non una capacità certificata.</p></section>;
}
