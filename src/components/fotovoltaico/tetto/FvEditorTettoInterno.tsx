import { useOrtoSolarFv } from "./useFotoSolar";
import { aspettoTettoFv, copertureFv, coperturaValidaFv } from "../../../../supabase/functions/_shared/fvAspettoTetto";
import { FvMisureFaldeMappa } from "./FvMisureFaldeMappa";
import { UniformSelect } from "@/components/ui/uniform-select";
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
import { edificioDaMappaFv } from "./mappaGeometria";
import { FotoGoogleMappa } from "./FotoGoogleMappa";
import { FvVistePdfTetto } from "./FvVistePdfTetto";
import { useT } from "@/lib/campo/lingua/LinguaCampo";
export default function EditorTetto(props: FvDisegnoPreventivoProps) {
  const t = useT();
    const [areaFalda, setAreaFalda] = useState("");
    const [alto, setAlto] = useState(false), [texture, setTexture] = useState(true), [selezione, setSelezione] = useState<SelezioneReale>(null), [provvisorio, setProvvisorio] = useState<DisegnoCommercialeFv | null>(null);
    const [inquadratura, setInquadratura] = useState<InquadraturaReale>({ faldaId: null, versione: 0 }), [nota, setNota] = useState("");
    const caricato = useRilievoArchiviato(props.value?.rilievo?.id), runtime = caricato.runtime;
    const ortoSolar=useOrtoSolarFv(props.value?.mappa?.fotoSolar,props.value?.mappa?.origine);
    const schema = useMemo(() => props.value?.mappa ? {piano:props.value,runtime:{edificio:edificioDaMappaFv(props.value.mappa, props.value.schema3d?.altezza ?? 8),orto:ortoSolar,modello:null,fonte:null}} : props.value && !props.value.rilievo ? schemaDalDisegno(props.value) : null, [props.value,ortoSolar]);
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
            return <p role="status" className="fv-roof-photo-note">{caricato.errore || t("Caricamento del rilievo dell’azienda…")} {t("Apri Rilievo e altezza per importare o ripristinare i file.")}</p>;
        const modifica = (sposta: PuntoFv) => {
            if (!props.modificabile)
                return;
            const next = modulo ? cambiaModuloReale(piano, modulo.id, { x: modulo.x + sposta.x, y: modulo.y + sposta.y }) : ostacolo ? aggiornaOstacoloConPosa(piano, { ...ostacolo, x: ostacolo.x + sposta.x, y: ostacolo.y + sposta.y }) : null;
            if (next) {
                salva(next);
                setNota("");
            }
            else
                setNota(t("Posizione non disponibile: controlla bordo, pannelli e ostacoli."));
        };
        const foto = <FotoTettoReale piano={piano} onChange={salva} modificabile={props.modificabile} selezione={selezione} onSelezione={setSelezione} onProvvisorio={setProvvisorio} inquadratura={inquadratura}/>;
        const vista3d = <><div className="fv-roof-photo-tools"><button type="button" onClick={() => setAlto(v => !v)}>{alto ? t("Vista prospettica") : t("Vista dall’alto")}</button><button type="button" disabled={!visualRuntime?.orto} aria-pressed={texture&&!!visualRuntime?.orto} onClick={() => setTexture(v => !v)}>{t("Ortofoto sul modello")}</button></div><VistaReale pannelli={pannelli} ids={ids} faldaId={faldaId ?? piano.falde[0]?.id ?? ""} alto={alto} foto={texture} ostacoli={ostacoli} selezione={selezione} onSelezione={setSelezione} inquadratura={inquadratura} invalidi={invalidi} areaPosa={pianoVista}/><p className="fv-roof-photo-note">{t("Clicca un modulo per selezionarlo anche sulla foto. Trascina lo sfondo per ruotare; rotella per lo zoom. Luce illustrativa, nessun calcolo di ombre.")}{piano.mappa?.fotoSolar && <>{" "}{t("Google Maps · Foto Google Solar del {data}. Source: Includes solar data from Google.", { data: String(piano.mappa.fotoSolar.data ?? "") })}</>}</p></>;
        return <><div className="fv-roof-photo-tools fv-roof-focus-tools"><button type="button" onClick={() => { setAlto(false); inquadra(null); }}>{t("Tetto intero")}</button><button type="button" disabled={!faldaId} onClick={() => inquadra(faldaId ?? null)}>{t("Inquadra falda selezionata")}</button><label>{t("Falda")} <UniformSelect aria-label={t("Falda da inquadrare")} value={inquadratura.faldaId ?? ""} onChange={e => inquadra(e.target.value || null)}><option value="">{t("Tutto il tetto")}</option>{piano.falde.map(f => <option key={f.id} value={f.id}>{f.nome}</option>)}</UniformSelect></label></div>
      <div className="fv-roof-photo-selection" aria-label={t("Selezione condivisa foto e 3D")}>
        <strong>{modulo ? t("Pannello {n} · {falda}", { n: piano.pannelli.findIndex(m => m.id === modulo.id) + 1, falda: String(piano.falde.find(f => f.id === modulo.faldaId)?.nome ?? "") }) : ostacolo ? t("Ostacolo selezionato") : t("Seleziona un pannello sulla foto o nel 3D")}</strong>
        {(modulo || ostacolo) && <div className="fv-roof-photo-tools"><span>{t("Sposta di 5 cm")}</span>{([{ x: -.05, y: 0, label: "sinistra", simbolo: "←" }, { x: .05, y: 0, label: "destra", simbolo: "→" }, { x: 0, y: -.05, label: "alto", simbolo: "↑" }, { x: 0, y: .05, label: "basso", simbolo: "↓" }] as const).map(p => <button key={p.label} type="button" disabled={!props.modificabile} aria-label={t("Sposta selezione a {label}", { label: t(p.label) })} onClick={() => modifica(p)}>{p.simbolo}</button>)}
          {modulo && <button type="button" disabled={!props.modificabile} onClick={() => { if (!props.modificabile)
                return; const r = ingombroModulo(modulo, piano.modulo), next = cambiaModuloReale(piano, modulo.id, { orizzontale: !modulo.orizzontale, x: modulo.x + (r.w - r.h) / 2, y: modulo.y + (r.h - r.w) / 2 }); if (next) {
                salva(next);
                setNota("");
            }
            else
                setNota(t("Il pannello ruotato non entra nello spazio disponibile.")); }}>{t("Ruota selezione")}</button>}
          <button type="button" disabled={!props.modificabile} onClick={() => { if (!props.modificabile)
                return; salva({ ...piano, pannelli: piano.pannelli.filter(m => m.id !== modulo?.id), ostacoli: piano.ostacoli.filter(o => o.id !== ostacolo?.id) }); setSelezione(null); setNota(""); }}>{t("Rimuovi selezione")}</button>
        </div>}
      </div>{nota && <p role="status" className="fv-roof-photo-note">{nota}</p>}
      {modo === "confronto" ? <div className="fv-roof-split"><section aria-label={t("Foto interattiva")}><h4>{t("Foto · modifica la disposizione")}</h4>{foto}</section><section aria-label={t("3D sincronizzato")}><h4>{t("3D · stessa selezione e stessa posa")}</h4>{vista3d}</section></div> : modo === "foto" ? foto : vista3d}
    </>;
    };
    return <RilievoContext.Provider value={visualRuntime ?? RUNTIME_VUOTO}><FvVistePdfTetto piano={piano} modificabile={props.modificabile} onChange={props.onChange}/><FvMisureFaldeMappa piano={piano}/><FvDisegnoPreventivo {...props} contorniBloccati={!!piano.rilievo||!!piano.mappa} vistaIniziale={piano.mappa?"google":piano.rilievo ? (piano.industriale ? "3d" : "confronto") : undefined} visteAggiuntive={[
            ...(piano.mappa?[{id:"google",nome: t("Pannelli sulla mappa"),contenuto:(salva:(p:DisegnoCommercialeFv)=>void)=><FotoGoogleMappa piano={piano} onChange={salva} modificabile={props.modificabile} selezione={selezione} onSelezione={setSelezione} onProvvisorio={setProvvisorio} inquadratura={inquadratura}/>}]:[]),
            ...(!piano.industriale ? [{ id: "area-posa", secondaria: !!piano.mappa, nome: t("Perimetro sulla foto"), contenuto: (salva: (p: DisegnoCommercialeFv) => void) => { const fid = piano.falde.some(f => f.id === areaFalda) ? areaFalda : piano.falde[0].id; return runtime ? <><label className="block mb-3 text-sm">{t("Falda da delimitare")} <UniformSelect className="ml-2 rounded-lg border p-2" aria-label={t("Falda da delimitare sulla foto")} value={fid} onChange={e => setAreaFalda(e.target.value)}>{piano.falde.map(f => <option key={f.id} value={f.id}>{f.nome}</option>)}</UniformSelect></label><TracciaAreaPosa key={`${piano.rilievo?.id ?? "campione"}-${fid}`} piano={piano} runtime={runtime} faldaId={fid} modificabile={props.modificabile} onChange={next => { setProvvisorio(null); setSelezione(null); salva(next); }}/></> : <p>{t("Carica un rilievo per tracciare il perimetro.")}</p>; } }, { id: "scelta-posa", nome: t("Confronta pose"), contenuto: (salva: (p: DisegnoCommercialeFv) => void) => visualRuntime ? <SceltaPosaLocale piano={piano} runtime={visualRuntime} potenzaModuloW={props.potenzaModuloW} modificabile={props.modificabile} riepilogoProposta={props.riepilogoProposta} onChange={next => { setProvvisorio(null); setSelezione(null); inquadra(null); salva(next); }}/> : <p>{t("Carica un rilievo per confrontare le pose.")}</p> }] : []),
            { id: "confronto", secondaria: !!piano.mappa, nome: t("Foto + 3D"), contenuto: salva => renderVista(salva, "confronto") },
            { id: "foto", secondaria: !!piano.mappa, nome: t("Foto sul tetto"), contenuto: salva => renderVista(salva, "foto") },
            { id: "3d", nome: t("Vista 3D"), contenuto: salva => <>{!piano.rilievo && <div className="fv-roof-photo-tools fv-roof-volume-controls"><label>{t("Altezza edificio (m)")}<input aria-label={t("Altezza edificio schema")} type="number" min={2} max={150} step={.5} value={piano.schema3d?.altezza ?? 8} disabled={!props.modificabile} onChange={e => { const n = Number(e.target.value); if (Number.isFinite(n) && n >= 2 && n <= 150)
                    salva({ ...piano, schema3d: { ...piano.schema3d, altezza: n, pendenza: piano.schema3d?.pendenza ?? 20 } }); }}/></label>{!piano.mappa && <label>{t("Pendenza schema (°)")}<input aria-label={t("Pendenza schema 3D")} type="number" min={0} max={75} value={piano.schema3d?.pendenza ?? 20} disabled={!props.modificabile} onChange={e => { const n = Number(e.target.value); if (Number.isFinite(n) && n >= 0 && n <= 75)
                    salva({ ...piano, schema3d: { ...piano.schema3d, altezza: piano.schema3d?.altezza ?? 8, pendenza: n } }); }}/></label>}<label>{t("Copertura")}<UniformSelect aria-label={t("Materiale della copertura 3D")} value={aspettoTettoFv(piano.schema3d?.copertura, !!piano.industriale).tipo} disabled={!props.modificabile} onChange={e => { if (coperturaValidaFv(e.target.value)) salva({ ...piano, schema3d: { altezza: piano.schema3d?.altezza ?? 8, pendenza: piano.schema3d?.pendenza ?? 20, copertura: e.target.value } }); }}>{copertureFv.map(c => <option key={c.valore} value={c.valore}>{c.nome}</option>)}</UniformSelect></label><span>{piano.mappa ? t("Pendenze e orientamenti provengono dalle falde tracciate. L’altezza è una stima per la vista 3D.") : t("Schema da misure inserite, da confermare sul sito.")}</span></div>}{renderVista(salva, "3d")}</> },
            { id: "capannone", secondaria: !!piano.mappa, nome: t("Capannone"), contenuto: salva => <CapannoneLocale piano={piano} runtime={runtime} potenzaModuloW={props.potenzaModuloW} localita={props.localita} riepilogoProposta={props.riepilogoProposta} modificabile={props.modificabile} onChange={next => { setProvvisorio(null); setSelezione(null); inquadra(null); salva(next); }}/> },
            { id: "rilievo", secondaria: !!piano.mappa, nome: t("Rilievo e altezza"), contenuto: salva => <ImportaRilievoLocale piano={piano} runtime={runtime} modificabile={props.modificabile} onChange={next => { setProvvisorio(null); setSelezione(null); inquadra(null); salva(next); }}/> },
        ]}/>
  <details className="fv-drone-details"><summary>{t("Hai immagini del drone? Aggiungi un riferimento visivo")}</summary><MaterialeDroneLocale /></details>
  <p className="fv-roof-photo-note">{runtime?.fonte?.provenienza === "importato" ? t("Rilievo cliente: {nome}. File nell’archivio privato dell’azienda; contorni e allineamento verificati dall’operatore.", { nome: String(piano.rilievo?.nome ?? "") }) : piano.rilievo ? t("Schema dimensionale: {nome}. Geometria illustrativa da misure inserite.", { nome: String(piano.rilievo.nome ?? "") }) : piano.mappa ? t("Tetto ricavato dalle falde sulla mappa. Posa 2D e vista 3D condividono contorni, dimensioni e pannelli; altezza e pendenze sono da confermare sul posto.") : t("Schema 3D costruito dal disegno del preventivo: nessun rilievo reale del cliente associato. Importa un’ortofoto o un modello del cliente per usare il suo tetto.")}</p>
  </RilievoContext.Provider>;
}
