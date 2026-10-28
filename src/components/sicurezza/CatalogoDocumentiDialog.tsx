import { useState } from 'react';
import { Dialog,DialogContent,DialogHeader,DialogTitle,DialogDescription,DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { AMBITI_CATALOGO,CATALOGO_DOCUMENTI,DESTINAZIONI_CATALOGO,cercaCatalogo,evidenzeDellaVoce,type VoceCatalogo } from '@/lib/sicurezza/catalogoDocumenti';
import type { EvidenzaFascicolo } from '@/lib/sicurezza/fascicolo';
const gruppi=[...new Set(CATALOGO_DOCUMENTI.voci.flatMap(v=>v.fonti.map(f=>f.gruppo)))];
export function CatalogoDocumentiDialog({onClose,onScegli,evidenze=[]}:{onClose:()=>void;onScegli?:(v:VoceCatalogo)=>void;evidenze?:readonly EvidenzaFascicolo[]}) {
 const [cerca,setCerca]=useState(''),[gruppo,setGruppo]=useState(''),[dest,setDest]=useState('');
 const priorita={sicurezza:0,da_chiarire:1,amministrazione_riservata:2,personale_riservato:3};
 const righe=cercaCatalogo(cerca,gruppo,dest).sort((a,b)=>priorita[a.destinazione]-priorita[b.destinazione]||a.titolo.localeCompare(b.titolo,'it'));
 return <Dialog open onOpenChange={o=>{if(!o)onClose();}}><DialogContent className="flex max-h-[90dvh] max-w-4xl flex-col overflow-hidden">
  <DialogHeader><DialogTitle>Catalogo documenti e requisiti</DialogTitle><DialogDescription>{CATALOGO_DOCUMENTI.righe} righe dell’Excel, {CATALOGO_DOCUMENTI.voci.length} tipi documentali. Scegli cosa serve per il caso concreto: il catalogo non impone obblighi né calcola scadenze.</DialogDescription></DialogHeader>
  <div className="flex flex-wrap gap-2"><Input className="min-w-48 flex-1" aria-label="Cerca nel catalogo" placeholder="Documento, sigla o cella Excel…" value={cerca} onChange={e=>setCerca(e.target.value)}/><select aria-label="Gruppo del catalogo" className="max-w-full rounded-md border bg-background p-2 text-sm" value={gruppo} onChange={e=>setGruppo(e.target.value)}><option value="">Tutti i gruppi</option>{gruppi.map(g=><option key={g}>{g}</option>)}</select><select aria-label="Archivio di destinazione" className="max-w-full rounded-md border bg-background p-2 text-sm" value={dest} onChange={e=>setDest(e.target.value)}><option value="">Tutti gli archivi</option>{Object.entries(DESTINAZIONI_CATALOGO).map(([k,l])=><option key={k} value={k}>{l}</option>)}</select></div>
  <p className="text-xs text-muted-foreground">{righe.length===1?"1 tipo":`${righe.length} tipi`} con questi filtri. Le evidenze precedenti senza classificazione non vengono abbinate automaticamente.</p>
  <div className="min-h-0 space-y-3 overflow-y-auto pr-1">{!righe.length?<p>Nessuna voce con questi filtri.</p>:righe.map(v=>{const n=evidenzeDellaVoce(v,evidenze).length;return <article key={v.id} className="rounded-lg border p-3"><div className="flex flex-wrap items-start justify-between gap-2"><h3 className="font-medium">{v.titolo}</h3><Badge variant="outline">{DESTINAZIONI_CATALOGO[v.destinazione]}</Badge></div><p className="mt-1 text-xs text-muted-foreground">{AMBITI_CATALOGO[v.ambito]} · Catalogo v{v.versione}{n?` · ${n} evidenze classificate nel fascicolo visualizzato`:''}</p>{v.nota&&<p className="mt-2 text-sm">{v.nota}</p>}
   <details className="mt-2 text-xs"><summary className="cursor-pointer text-primary">Voci originali e indicazioni dell’Excel ({v.fonti.length})</summary><ul className="mt-2 space-y-2">{v.fonti.map(f=><li key={f.cella} className="border-l-2 pl-2"><strong>Foglio1!{f.cella}</strong> · {f.titolo}<br/>Scadenza riportata: {f.scadenza_originale}<br/><span className="text-muted-foreground">{f.trattamento}</span></li>)}</ul></details>
   {v.destinazione==='sicurezza'?onScegli&&<Button size="sm" className="mt-3" onClick={()=>onScegli(v)}>Usa questa voce</Button>:<p className="mt-3 text-xs text-muted-foreground">{v.destinazione==='amministrazione_riservata'?'Gestisci in Contabilità → Documenti mensili, con il permesso amministrativo dedicato.':v.destinazione==='personale_riservato'?'Gestisci nell’archivio personale autorizzato; non caricare copie nel fascicolo sicurezza.':'Serve chiarire il documento prima di configurarne un requisito.'}</p>}
  </article>;})}</div>
  <DialogFooter><Button variant="outline" onClick={onClose}>Chiudi catalogo</Button></DialogFooter>
 </DialogContent></Dialog>;
}
