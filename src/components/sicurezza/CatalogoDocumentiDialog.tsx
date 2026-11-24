import { UniformSelect } from "@/components/ui/uniform-select";
import { useState } from 'react';
import { Dialog,DialogContent,DialogHeader,DialogTitle,DialogDescription,DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { AMBITI_CATALOGO,CATALOGO_DOCUMENTI,DESTINAZIONI_CATALOGO,cercaCatalogo,evidenzeDellaVoce,type VoceCatalogo } from '@/lib/sicurezza/catalogoDocumenti';
import type { EvidenzaFascicolo } from '@/lib/sicurezza/fascicolo';
import { useT } from "@/lib/campo/lingua/LinguaCampo";
const gruppi=[...new Set(CATALOGO_DOCUMENTI.voci.flatMap(v=>v.fonti.map(f=>f.gruppo)))];
export function CatalogoDocumentiDialog({onClose,onScegli,evidenze=[]}:{onClose:()=>void;onScegli?:(v:VoceCatalogo)=>void;evidenze?:readonly EvidenzaFascicolo[]}) {
  const t = useT();
 const [cerca,setCerca]=useState(''),[gruppo,setGruppo]=useState(''),[dest,setDest]=useState('');
 const priorita={sicurezza:0,da_chiarire:1,amministrazione_riservata:2,personale_riservato:3};
 const righe=cercaCatalogo(cerca,gruppo,dest).sort((a,b)=>priorita[a.destinazione]-priorita[b.destinazione]||a.titolo.localeCompare(b.titolo,'it'));
 return <Dialog open onOpenChange={o=>{if(!o)onClose();}}><DialogContent className="flex max-h-[90dvh] max-w-4xl flex-col overflow-hidden">
  <DialogHeader><DialogTitle>{t("Catalogo documenti e requisiti")}</DialogTitle><DialogDescription>{t("{righe} righe dell’Excel, {n} tipi documentali. Scegli cosa serve per il caso concreto: il catalogo non impone obblighi né calcola scadenze.", { righe: String(CATALOGO_DOCUMENTI.righe ?? ""), n: CATALOGO_DOCUMENTI.voci.length })}</DialogDescription></DialogHeader>
  <div className="flex flex-wrap gap-2"><Input className="min-w-48 flex-1" aria-label={t("Cerca nel catalogo")} placeholder={t("Documento, sigla o cella Excel…")} value={cerca} onChange={e=>setCerca(e.target.value)}/><UniformSelect aria-label={t("Gruppo del catalogo")} className="max-w-full rounded-md border bg-background p-2 text-sm" value={gruppo} onChange={e=>setGruppo(e.target.value)}><option value="">{t("Tutti i gruppi")}</option>{gruppi.map(g=><option key={g}>{g}</option>)}</UniformSelect><UniformSelect aria-label={t("Archivio di destinazione")} className="max-w-full rounded-md border bg-background p-2 text-sm" value={dest} onChange={e=>setDest(e.target.value)}><option value="">{t("Tutti gli archivi")}</option>{Object.entries(DESTINAZIONI_CATALOGO).map(([k,l])=><option key={k} value={k}>{l}</option>)}</UniformSelect></div>
  <p className="text-xs text-muted-foreground">{t(righe.length===1?"{n} tipo con questi filtri. Le evidenze precedenti senza classificazione non vengono abbinate automaticamente.":"{n} tipi con questi filtri. Le evidenze precedenti senza classificazione non vengono abbinate automaticamente.", { n: righe.length })}</p>
  <div className="min-h-0 space-y-3 overflow-y-auto pr-1">{!righe.length?<p>{t("Nessuna voce con questi filtri.")}</p>:righe.map(v=>{const n=evidenzeDellaVoce(v,evidenze).length;return <article key={v.id} className="rounded-lg border p-3"><div className="flex flex-wrap items-start justify-between gap-2"><h3 className="font-medium">{v.titolo}</h3><Badge variant="outline">{DESTINAZIONI_CATALOGO[v.destinazione]}</Badge></div><p className="mt-1 text-xs text-muted-foreground">{AMBITI_CATALOGO[v.ambito]} · {t("Catalogo v{versione}", { versione: v.versione })}{n?` · ${t("{n} evidenze classificate nel fascicolo visualizzato", { n })}`:''}</p>{v.nota&&<p className="mt-2 text-sm">{v.nota}</p>}
   <details className="mt-2 text-xs"><summary className="cursor-pointer text-primary">{t("Voci originali e indicazioni dell’Excel ({n})", { n: v.fonti.length })}</summary><ul className="mt-2 space-y-2">{v.fonti.map(f=><li key={f.cella} className="border-l-2 pl-2"><strong>Foglio1!{f.cella}</strong> · {f.titolo}<br/>{t("Scadenza riportata:")} {f.scadenza_originale}<br/><span className="text-muted-foreground">{f.trattamento}</span></li>)}</ul></details>
   {v.destinazione==='sicurezza'?onScegli&&<Button size="sm" className="mt-3" onClick={()=>onScegli(v)}>{t("Usa questa voce")}</Button>:<p className="mt-3 text-xs text-muted-foreground">{v.destinazione==='amministrazione_riservata'?t("Gestisci in Contabilità → Documenti mensili, con il permesso amministrativo dedicato."):v.destinazione==='personale_riservato'?t("Gestisci nell’archivio personale autorizzato; non caricare copie nel fascicolo sicurezza."):t("Serve chiarire il documento prima di configurarne un requisito.")}</p>}
  </article>;})}</div>
  <DialogFooter><Button variant="outline" onClick={onClose}>{t("Chiudi catalogo")}</Button></DialogFooter>
 </DialogContent></Dialog>;
}
