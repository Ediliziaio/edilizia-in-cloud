import {TracciaAreaPosa} from "./TracciaAreaPosa";
import {SceltaPosaLocale} from "./SceltaPosaLocale";
import {useState} from "react";
import {pannelliDalDisegnoReale,cambiaModuloReale,sagomeOstacoliEdificio,type SelezioneReale,type InquadraturaReale} from "./tettoReale";
import {FotoTettoReale} from "./FotoTettoReale";
import {VistaReale} from "./VistaTettoReale3D";
import {MaterialeDroneLocale} from "./MaterialeDroneLocale";
import {FvDisegnoPreventivo,type FvDisegnoPreventivoProps} from "../../src/components/fotovoltaico/FvDisegnoPreventivo";
import {aggiornaOstacoloConPosa,ingombroModulo,pannelliDaRivedere,rettangoloNellaFalda,type DisegnoCommercialeFv,type PuntoFv} from "../../supabase/functions/_shared/fvDisegnoCommerciale";
import {CAMPIONE_RUNTIME,RilievoContext,useRilievoArchiviato} from "./RilievoContext";
import {CapannoneLocale} from "./CapannoneLocale";
import {ImportaRilievoLocale} from "./ImportaRilievoLocale";
export default function TettoRealeDemo(props:FvDisegnoPreventivoProps){
  const [areaFalda,setAreaFalda]=useState("");
  const [alto,setAlto]=useState(false),[texture,setTexture]=useState(true),[selezione,setSelezione]=useState<SelezioneReale>(null),[provvisorio,setProvvisorio]=useState<DisegnoCommercialeFv|null>(null);
  const [inquadratura,setInquadratura]=useState<InquadraturaReale>({faldaId:null,versione:0}),[nota,setNota]=useState("");
  const caricato=useRilievoArchiviato(props.value?.rilievo?.id),runtime=caricato.runtime,edificio=runtime?.edificio??CAMPIONE_RUNTIME.edificio;
  const piano=props.value;
  if(!piano)return <FvDisegnoPreventivo {...props}/>;
  const visibile=provvisorio??piano,pannelli=runtime?pannelliDalDisegnoReale(edificio,visibile):[],ostacoli=runtime?sagomeOstacoliEdificio(edificio,visibile):[],ids=visibile.pannelli.map(p=>p.id),invalidi=pannelliDaRivedere(visibile);
  const modulo=selezione?.tipo==="pannello"?piano.pannelli.find(p=>p.id===selezione.id):undefined;
  const ostacolo=selezione?.tipo==="ostacolo"?piano.ostacoli.find(o=>o.id===selezione.id):undefined;
  const faldaId=modulo?.faldaId??(ostacolo?piano.falde.find(f=>rettangoloNellaFalda(ostacolo,f,0))?.id:undefined);
  const inquadra=(fid:string|null)=>setInquadratura(q=>({faldaId:fid,versione:q.versione+1}));
  const renderVista=(salva:(p:DisegnoCommercialeFv)=>void,modo:"foto"|"3d"|"confronto")=>{
    if(!runtime)return <p role="status" className="fv-roof-photo-note">{caricato.errore||"Caricamento del rilievo locale…"} Apri Rilievo e altezza per importare o ripristinare i file.</p>;
    const modifica=(sposta:PuntoFv)=>{
      if(!props.modificabile)return;
      const next=modulo?cambiaModuloReale(piano,modulo.id,{x:modulo.x+sposta.x,y:modulo.y+sposta.y}):ostacolo?aggiornaOstacoloConPosa(piano,{...ostacolo,x:ostacolo.x+sposta.x,y:ostacolo.y+sposta.y}):null;
      if(next){salva(next);setNota("");}else setNota("Posizione non disponibile: controlla bordo, pannelli e ostacoli.");
    };
    const foto=<FotoTettoReale piano={piano} onChange={salva} modificabile={props.modificabile} selezione={selezione} onSelezione={setSelezione} onProvvisorio={setProvvisorio} inquadratura={inquadratura}/>;
    const vista3d=<><div className="fv-roof-photo-tools"><button type="button" onClick={()=>setAlto(v=>!v)}>{alto?"Vista prospettica":"Vista dall’alto"}</button><button type="button" aria-pressed={texture} onClick={()=>setTexture(v=>!v)}>Ortofoto sul modello</button></div><VistaReale pannelli={pannelli} ids={ids} faldaId={faldaId??piano.falde[0]?.id??""} alto={alto} foto={texture} ostacoli={ostacoli} selezione={selezione} onSelezione={setSelezione} inquadratura={inquadratura} invalidi={invalidi} areaPosa={visibile}/><p className="fv-roof-photo-note">Clicca un modulo per selezionarlo anche sulla foto. Trascina lo sfondo per ruotare; rotella per lo zoom. Luce illustrativa, nessun calcolo di ombre.</p></>;
    return <><div className="fv-roof-photo-tools fv-roof-focus-tools"><button type="button" onClick={()=>{setAlto(false);inquadra(null);}}>Tetto intero</button><button type="button" disabled={!faldaId} onClick={()=>inquadra(faldaId??null)}>Inquadra falda selezionata</button><label>Falda <select aria-label="Falda da inquadrare" value={inquadratura.faldaId??""} onChange={e=>inquadra(e.target.value||null)}><option value="">Tutto il tetto</option>{piano.falde.map(f=><option key={f.id} value={f.id}>{f.nome}</option>)}</select></label></div>
      <div className="fv-roof-photo-selection" aria-label="Selezione condivisa foto e 3D">
        <strong>{modulo?`Pannello ${piano.pannelli.findIndex(m=>m.id===modulo.id)+1} · ${piano.falde.find(f=>f.id===modulo.faldaId)?.nome}`:ostacolo?"Ostacolo selezionato":"Seleziona un pannello sulla foto o nel 3D"}</strong>
        {(modulo||ostacolo)&&<div className="fv-roof-photo-tools"><span>Sposta di 5 cm</span>{([{x:-.05,y:0,label:"sinistra",simbolo:"←"},{x:.05,y:0,label:"destra",simbolo:"→"},{x:0,y:-.05,label:"alto",simbolo:"↑"},{x:0,y:.05,label:"basso",simbolo:"↓"}] as const).map(p=><button key={p.label} type="button" disabled={!props.modificabile} aria-label={`Sposta selezione a ${p.label}`} onClick={()=>modifica(p)}>{p.simbolo}</button>)}
          {modulo&&<button type="button" disabled={!props.modificabile} onClick={()=>{if(!props.modificabile)return;const r=ingombroModulo(modulo,piano.modulo),next=cambiaModuloReale(piano,modulo.id,{orizzontale:!modulo.orizzontale,x:modulo.x+(r.w-r.h)/2,y:modulo.y+(r.h-r.w)/2});if(next){salva(next);setNota("");}else setNota("Il pannello ruotato non entra nello spazio disponibile.");}}>Ruota selezione</button>}
          <button type="button" disabled={!props.modificabile} onClick={()=>{if(!props.modificabile)return;salva({...piano,pannelli:piano.pannelli.filter(m=>m.id!==modulo?.id),ostacoli:piano.ostacoli.filter(o=>o.id!==ostacolo?.id)});setSelezione(null);setNota("");}}>Rimuovi selezione</button>
        </div>}
      </div>{nota&&<p role="status" className="fv-roof-photo-note">{nota}</p>}
      {modo==="confronto"?<div className="fv-roof-split"><section aria-label="Foto interattiva"><h4>Foto · modifica la disposizione</h4>{foto}</section><section aria-label="3D sincronizzato"><h4>3D · stessa selezione e stessa posa</h4>{vista3d}</section></div>:modo==="foto"?foto:vista3d}
    </>;
  };
  return <RilievoContext.Provider value={runtime??CAMPIONE_RUNTIME}><FvDisegnoPreventivo {...props} contorniBloccati vistaIniziale={piano.industriale?"3d":"confronto"} visteAggiuntive={[
    ...(!piano.industriale?[{id:"area-posa",nome:"Perimetro sulla foto",contenuto:(salva:(p:DisegnoCommercialeFv)=>void)=>{const fid=piano.falde.some(f=>f.id===areaFalda)?areaFalda:piano.falde[0].id;return runtime?<><label className="block mb-3 text-sm">Falda da delimitare <select className="ml-2 rounded-lg border p-2" aria-label="Falda da delimitare sulla foto" value={fid} onChange={e=>setAreaFalda(e.target.value)}>{piano.falde.map(f=><option key={f.id} value={f.id}>{f.nome}</option>)}</select></label><TracciaAreaPosa key={`${piano.rilievo?.id??"campione"}-${fid}`} piano={piano} runtime={runtime} faldaId={fid} modificabile={props.modificabile} onChange={next=>{setProvvisorio(null);setSelezione(null);salva(next);}}/></>:<p>Carica un rilievo per tracciare il perimetro.</p>;}},{id:"scelta-posa",nome:"Confronta pose",contenuto:(salva:(p:DisegnoCommercialeFv)=>void)=>runtime?<SceltaPosaLocale piano={piano} runtime={runtime} potenzaModuloW={props.potenzaModuloW} modificabile={props.modificabile} riepilogoProposta={props.riepilogoProposta} onChange={next=>{setProvvisorio(null);setSelezione(null);inquadra(null);salva(next);}}/>:<p>Carica un rilievo per confrontare le pose.</p>}]:[]),
    {id:"confronto",nome:"Foto + 3D",contenuto:salva=>renderVista(salva,"confronto")},
    {id:"foto",nome:"Foto sul tetto",contenuto:salva=>renderVista(salva,"foto")},
    {id:"3d",nome:"3D reale",contenuto:salva=>renderVista(salva,"3d")},
    {id:"capannone",nome:"Capannone",contenuto:salva=><CapannoneLocale piano={piano} runtime={runtime} potenzaModuloW={props.potenzaModuloW} localita={props.localita} riepilogoProposta={props.riepilogoProposta} modificabile={props.modificabile} onChange={next=>{setProvvisorio(null);setSelezione(null);inquadra(null);salva(next);}}/>},
    {id:"rilievo",nome:"Rilievo e altezza",contenuto:salva=><ImportaRilievoLocale piano={piano} runtime={runtime} modificabile={props.modificabile} onChange={next=>{setProvvisorio(null);setSelezione(null);inquadra(null);salva(next);}}/>},
  ]}/>
  <details className="fv-drone-details"><summary>Hai immagini del drone? Aggiungi un riferimento visivo</summary><MaterialeDroneLocale/></details>
  {runtime?.fonte?.provenienza==="schema"?<p className="fv-roof-photo-note">Schema dimensionale: {piano.rilievo?.nome}. Geometria illustrativa da misure inserite; nessun rilievo del cliente associato.</p>:piano.rilievo&&runtime?.fonte?.provenienza!=="campione"?<p className="fv-roof-photo-note">Rilievo cliente: {piano.rilievo.nome}. File conservati in questo browser. {runtime?.fonte?.orto?.crs} {runtime?.fonte?.altezzaManuale!==null&&runtime?.fonte?"Altezza corretta manualmente.":""} Contorni e allineamento da verificare sul rilievo originale. {runtime?.fonte&&!runtime.fonte.modello?"Quote inserite manualmente sull’ortofoto; pareti illustrative.":""}</p>:<><p className="fv-roof-photo-note">Campione pubblico di Delft · quattro falde · quote AHN 2023. Gli ostacoli arancioni sono ingombri manuali senza altezza rilevata. {runtime?.fonte?.altezzaManuale?"Altezza corretta manualmente.":""}</p>
  <p className="fv-roof-photo-note">© <a href="https://docs.3dbag.nl/en/copyright/" target="_blank" rel="noreferrer">3DBAG by tudelft3d and 3DGI</a> · CC BY 4.0. Coordinate locali e fotovoltaico simulato aggiunti. Ortofoto: <a href="https://www.pdok.nl/introductie/-/article/pdok-luchtfoto-rgb-open-" target="_blank" rel="noreferrer">Samenwerkingsverband Beeldmateriaal / PDOK, CC BY</a>, scaricata il 10/11/2026; data puntuale di ripresa da verificare.</p></>}
  </RilievoContext.Provider>;
}
