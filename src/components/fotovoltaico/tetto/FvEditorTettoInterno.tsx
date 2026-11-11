import { TracciaAreaPosa } from "./TracciaAreaPosa";
import { SceltaPosaLocale } from "./SceltaPosaLocale";
import { useState, useMemo } from "react";
import { schemaDalDisegno } from "./schema3d";
import { pannelliDalDisegnoReale, cambiaModuloReale, sagomeOstacoliEdificio, type SelezioneReale, type InquadraturaReale } from "./tettoReale";
import { FotoTettoReale } from "./FotoTettoReale";
import { VistaReale } from "./VistaTettoReale3D";
import { MaterialeDroneLocale } from "./MaterialeDroneLocale";
import { FvDisegnoPreventivo, type FvDisegnoPreventivoProps } from "../FvDisegnoPreventivo";
import { aggiornaOstacoloConPosa, ingombroModulo, pannelliDaRivedere, rettangoloNellaFalda, type DisegnoCommercialeFv, type PuntoFv } from "../../../../supabase/functions/_shared/fvDisegnoCommerciale";
import { RUNTIME_VUOTO, RilievoContext, useRilievoArchiviato } from "./RilievoContext";
import { CapannoneLocale } from "./CapannoneLocale";
import { ImportaRilievoLocale } from "./ImportaRilievoLocale";
export default function EditorTetto(props: FvDisegnoPreventivoProps) {
    const [areaFalda, setAreaFalda] = useState("");
    const [alto, setAlto] = useState(false), [texture, setTexture] = useState(true), [selezione, setSelezione] = useState<SelezioneReale>(null), [provvisorio, setProvvisorio] = useState<DisegnoCommercialeFv | null>(null);
    const [inquadratura, setInquadratura] = useState<InquadraturaReale>({ faldaId: null, versione: 0 }), [nota, setNota] = useState("");
    const caricato = useRilievoArchiviato(props.value?.rilievo?.id), runtime = caricato.runtime;
    const schema = useMemo(() => props.value && !props.value.rilievo ? schemaDalDisegno(props.value) : null, [props.value]);
    const edificio = runtime?.edificio ?? schema?.runtime.edificio ?? RUNTIME_VUOTO.edificio;
    const piano = props.value;
    if (!piano)
        return <FvDisegnoPreventivo {...props}/>;
    const visibile = provvisorio ?? piano, pianoVista = runtime ? visibile : schema?.piano ?? visibile, visualRuntime = runtime ?? schema?.runtime, pannelli = visualRuntime ? pannelliDalDisegnoReale(edificio, pianoVista) : [], ostacoli = visualRuntime ? sagomeOstacoliEdificio(edificio, pianoVista) : [], ids = visibile.pannelli.map(p => p.id), invalidi = pannelliDaRivedere(visibile);
    const modulo = selezione?.tipo === "pannello" ? piano.pannelli.find(p => p.id === selezione.id) : undefined;
    const ostacolo = selezione?.tipo === "ostacolo" ? piano.ostacoli.find(o => o.id === selezione.id) : undefined;
    const faldaId = modulo?.faldaId ?? (ostacolo ? piano.falde.find(f => rettangoloNellaFalda(ostacolo, f, 0))?.id : undefined);
    const inquadra = (fid: string | null) => setInquadratura(q => ({ faldaId: fid, versione: q.versione + 1 }));
    const renderVista = (salva: (p: DisegnoCommercialeFv) => void, modo: "foto" | "3d" | "confronto") => {
        if (!visualRuntime)
            return <p role="status" className="fv-roof-photo-note">{caricato.errore || "Caricamento del rilievo dell’azienda…"} Apri Rilievo e altezza per importare o ripristinare i file.</p>;
        const modifica = (sposta: PuntoFv) => {
            if (!props.modificabile)
                return;
            const next = modulo ? cambiaModuloReale(piano, modulo.id, { x: modulo.x + sposta.x, y: modulo.y + sposta.y }) : ostacolo ? aggiornaOstacoloConPosa(piano, { ...ostacolo, x: ostacolo.x + sposta.x, y: ostacolo.y + sposta.y }) : null;
            if (next) {
                salva(next);
                setNota("");
            }
            else
                setNota("Posizione non disponibile: controlla bordo, pannelli e ostacoli.");
        };
        const foto = <FotoTettoReale piano={piano} onChange={salva} modificabile={props.modificabile} selezione={selezione} onSelezione={setSelezione} onProvvisorio={setProvvisorio} inquadratura={inquadratura}/>;
        const vista3d = <><div className="fv-roof-photo-tools"><button type="button" onClick={() => setAlto(v => !v)}>{alto ? "Vista prospettica" : "Vista dall’alto"}</button><button type="button" disabled={!runtime?.orto} aria-pressed={texture&&!!runtime?.orto} onClick={() => setTexture(v => !v)}>Ortofoto sul modello</button></div><VistaReale pannelli={pannelli} ids={ids} faldaId={faldaId ?? piano.falde[0]?.id ?? ""} alto={alto} foto={texture} ostacoli={ostacoli} selezione={selezione} onSelezione={setSelezione} inquadratura={inquadratura} invalidi={invalidi} areaPosa={pianoVista}/><p className="fv-roof-photo-note">Clicca un modulo per selezionarlo anche sulla foto. Trascina lo sfondo per ruotare; rotella per lo zoom. Luce illustrativa, nessun calcolo di ombre.</p></>;
        return <><div className="fv-roof-photo-tools fv-roof-focus-tools"><button type="button" onClick={() => { setAlto(false); inquadra(null); }}>Tetto intero</button><button type="button" disabled={!faldaId} onClick={() => inquadra(faldaId ?? null)}>Inquadra falda selezionata</button><label>Falda <select aria-label="Falda da inquadrare" value={inquadratura.faldaId ?? ""} onChange={e => inquadra(e.target.value || null)}><option value="">Tutto il tetto</option>{piano.falde.map(f => <option key={f.id} value={f.id}>{f.nome}</option>)}</select></label></div>
      <div className="fv-roof-photo-selection" aria-label="Selezione condivisa foto e 3D">
        <strong>{modulo ? `Pannello ${piano.pannelli.findIndex(m => m.id === modulo.id) + 1} · ${piano.falde.find(f => f.id === modulo.faldaId)?.nome}` : ostacolo ? "Ostacolo selezionato" : "Seleziona un pannello sulla foto o nel 3D"}</strong>
        {(modulo || ostacolo) && <div className="fv-roof-photo-tools"><span>Sposta di 5 cm</span>{([{ x: -.05, y: 0, label: "sinistra", simbolo: "←" }, { x: .05, y: 0, label: "destra", simbolo: "→" }, { x: 0, y: -.05, label: "alto", simbolo: "↑" }, { x: 0, y: .05, label: "basso", simbolo: "↓" }] as const).map(p => <button key={p.label} type="button" disabled={!props.modificabile} aria-label={`Sposta selezione a ${p.label}`} onClick={() => modifica(p)}>{p.simbolo}</button>)}
          {modulo && <button type="button" disabled={!props.modificabile} onClick={() => { if (!props.modificabile)
                return; const r = ingombroModulo(modulo, piano.modulo), next = cambiaModuloReale(piano, modulo.id, { orizzontale: !modulo.orizzontale, x: modulo.x + (r.w - r.h) / 2, y: modulo.y + (r.h - r.w) / 2 }); if (next) {
                salva(next);
                setNota("");
            }
            else
                setNota("Il pannello ruotato non entra nello spazio disponibile."); }}>Ruota selezione</button>}
          <button type="button" disabled={!props.modificabile} onClick={() => { if (!props.modificabile)
                return; salva({ ...piano, pannelli: piano.pannelli.filter(m => m.id !== modulo?.id), ostacoli: piano.ostacoli.filter(o => o.id !== ostacolo?.id) }); setSelezione(null); setNota(""); }}>Rimuovi selezione</button>
        </div>}
      </div>{nota && <p role="status" className="fv-roof-photo-note">{nota}</p>}
      {modo === "confronto" ? <div className="fv-roof-split"><section aria-label="Foto interattiva"><h4>Foto · modifica la disposizione</h4>{foto}</section><section aria-label="3D sincronizzato"><h4>3D · stessa selezione e stessa posa</h4>{vista3d}</section></div> : modo === "foto" ? foto : vista3d}
    </>;
    };
    return <RilievoContext.Provider value={visualRuntime ?? RUNTIME_VUOTO}><FvDisegnoPreventivo {...props} contorniBloccati={!!piano.rilievo} vistaIniziale={piano.rilievo ? (piano.industriale ? "3d" : "confronto") : undefined} visteAggiuntive={[
            ...(!piano.industriale ? [{ id: "area-posa", nome: "Perimetro sulla foto", contenuto: (salva: (p: DisegnoCommercialeFv) => void) => { const fid = piano.falde.some(f => f.id === areaFalda) ? areaFalda : piano.falde[0].id; return runtime ? <><label className="block mb-3 text-sm">Falda da delimitare <select className="ml-2 rounded-lg border p-2" aria-label="Falda da delimitare sulla foto" value={fid} onChange={e => setAreaFalda(e.target.value)}>{piano.falde.map(f => <option key={f.id} value={f.id}>{f.nome}</option>)}</select></label><TracciaAreaPosa key={`${piano.rilievo?.id ?? "campione"}-${fid}`} piano={piano} runtime={runtime} faldaId={fid} modificabile={props.modificabile} onChange={next => { setProvvisorio(null); setSelezione(null); salva(next); }}/></> : <p>Carica un rilievo per tracciare il perimetro.</p>; } }, { id: "scelta-posa", nome: "Confronta pose", contenuto: (salva: (p: DisegnoCommercialeFv) => void) => visualRuntime ? <SceltaPosaLocale piano={piano} runtime={visualRuntime} potenzaModuloW={props.potenzaModuloW} modificabile={props.modificabile} riepilogoProposta={props.riepilogoProposta} onChange={next => { setProvvisorio(null); setSelezione(null); inquadra(null); salva(next); }}/> : <p>Carica un rilievo per confrontare le pose.</p> }] : []),
            { id: "confronto", nome: "Foto + 3D", contenuto: salva => renderVista(salva, "confronto") },
            { id: "foto", nome: "Foto sul tetto", contenuto: salva => renderVista(salva, "foto") },
            { id: "3d", nome: "Vista 3D", contenuto: salva => <>{!piano.rilievo && <div className="fv-roof-photo-tools"><label>Altezza edificio (m)<input aria-label="Altezza edificio schema" type="number" min={2} max={150} step={.5} value={piano.schema3d?.altezza ?? 8} disabled={!props.modificabile} onChange={e => { const n = Number(e.target.value); if (Number.isFinite(n) && n >= 2 && n <= 150)
                    salva({ ...piano, schema3d: { altezza: n, pendenza: piano.schema3d?.pendenza ?? 20 } }); }}/></label><label>Pendenza schema (°)<input aria-label="Pendenza schema 3D" type="number" min={0} max={75} value={piano.schema3d?.pendenza ?? 20} disabled={!props.modificabile} onChange={e => { const n = Number(e.target.value); if (Number.isFinite(n) && n >= 0 && n <= 75)
                    salva({ ...piano, schema3d: { altezza: piano.schema3d?.altezza ?? 8, pendenza: n } }); }}/></label><span>Schema da misure inserite, da confermare sul sito.</span></div>}{renderVista(salva, "3d")}</> },
            { id: "capannone", nome: "Capannone", contenuto: salva => <CapannoneLocale piano={piano} runtime={runtime} potenzaModuloW={props.potenzaModuloW} localita={props.localita} riepilogoProposta={props.riepilogoProposta} modificabile={props.modificabile} onChange={next => { setProvvisorio(null); setSelezione(null); inquadra(null); salva(next); }}/> },
            { id: "rilievo", nome: "Rilievo e altezza", contenuto: salva => <ImportaRilievoLocale piano={piano} runtime={runtime} modificabile={props.modificabile} onChange={next => { setProvvisorio(null); setSelezione(null); inquadra(null); salva(next); }}/> },
        ]}/>
  <details className="fv-drone-details"><summary>Hai immagini del drone? Aggiungi un riferimento visivo</summary><MaterialeDroneLocale /></details>
  <p className="fv-roof-photo-note">{runtime?.fonte?.provenienza === "importato" ? `Rilievo cliente: ${piano.rilievo?.nome}. File nell’archivio privato dell’azienda; contorni e allineamento verificati dall’operatore.` : piano.rilievo ? `Schema dimensionale: ${piano.rilievo.nome}. Geometria illustrativa da misure inserite.` : "Schema 3D costruito dal disegno del preventivo: nessun rilievo reale del cliente associato. Importa un’ortofoto o un modello del cliente per usare il suo tetto."}</p>
  </RilievoContext.Provider>;
}
