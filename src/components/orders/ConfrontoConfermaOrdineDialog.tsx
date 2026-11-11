import { useRef, useState } from "react";
import { ArrowLeftRight, ChevronRight, FileUp, Loader2, Mail, RefreshCw, Sparkles } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { usePermissions } from "@/hooks/usePermissions";
import { useBaseConferma, useControlliDocumento, useControlloDocumento, type ObiettivoControllo } from "@/hooks/useControlloDocumento";
import { ESITO_CLASSI, ESITO_LABEL, contaEsiti, emailCorrezione, type ControlloDocumento, type RigaConfronto } from "@/lib/acquisti/controlloDocumento";
import { righeDellaBase } from "../../../supabase/functions/_shared/revisioniConferma";
import { CLASSE_DIALOG_CONFRONTO, RiepilogoConfronto, PannelliConfrontoMobile } from "@/components/acquisti/RiepilogoConfronto";
import { OriginaliOrdineConfronto } from "@/components/acquisti/OriginaliOrdineConfronto";
import { OriginaliConfronto } from "@/components/fatturazione/OriginaliConfronto";
import { originaleDaRiferimento } from "@/lib/fatturazione/originaliConfronto";
import { ACCEPT_DOCUMENTI_DDT } from "@/lib/ddt/preparaDocumento";
import { EmailComposeDialog } from "@/pages/azienda/email/components/EmailComposeDialog";

const numero=(v:number)=>Number(v).toLocaleString('it-IT',{maximumFractionDigits:4});
function fileConferma(c:ControlloDocumento) {
  const lettura=originaleDaRiferimento(c.file_path,'order-attachments',c.file_nome??'Conferma fornitore',c.file_path?.endsWith('.pdf')?'application/pdf':c.file_path?.endsWith('.png')?'image/png':c.file_path?.endsWith('.webp')?'image/webp':'image/jpeg');
  if(!lettura) return [];
  if(!c.originale_path) return [lettura];
  const originale=originaleDaRiferimento(c.originale_path,'order-attachments',c.file_nome??undefined,c.originale_mime);
  return originale ? [{...originale,previewPath:lettura.path,previewMime:lettura.mime}] : [lettura];
}

/** Un solo percorso per lettura, originali e decisioni sulla conferma ricevuta. */
export function ConfrontoConfermaOrdineDialog({companyId,obiettivo,inizialeId,onClose}: {
 companyId:string;obiettivo:ObiettivoControllo;inizialeId?:string;onClose:()=>void;
}) {
 const fileInput=useRef<HTMLInputElement>(null);
 const permessi=usePermissions();
 const modificabile=!permessi.solaLettura&&(permessi.canManagePurchasing||permessi.canEditOrders);
 const lista=useControlliDocumento(obiettivo);
 const base=useBaseConferma(obiettivo);
 const [scelto,setScelto]=useState(inizialeId??'');
 const id=scelto||lista.controlli[0]?.id;
 const {controllo,caricamento,accetta,decidi,abbina,applicaPrezzi}=useControlloDocumento(id);
 const [vistaSinistra,setVistaSinistra]=useState('righe');
 const [pannelloMobile,setPannelloMobile]=useState('sinistra');
 const [tipoCaricamento,setTipoCaricamento]=useState<'offerta'|'conferma'>(obiettivo.purchaseOrderId?'conferma':'offerta');
 const [vistaDestra,setVistaDestra]=useState('righe');
 const [filtro,setFiltro]=useState('tutte');
 const [attiva,setAttiva]=useState('');
 const [decisione,setDecisione]=useState<{riga:RigaConfronto;esito:'verde'|'rosso'}|null>(null);
 const [approva,setApprova]=useState(false);
 const [abbinaAperto,setAbbinaAperto]=useState(false);
 const [indici,setIndici]=useState<number[]>([]);
 const [nota,setNota]=useState('');
 const [emailAperta,setEmailAperta]=useState(false);
 const [prezziAperti,setPrezziAperti]=useState(false);
 const storico=controllo?.base_ordine||base.data;
 const richieste=storico?righeDellaBase(storico):[];
 const righe=controllo?.righe??[];
 const conti=contaEsiti(righe);
 const obsoleto=!!controllo&&(!controllo.impronta_ordine||!!base.data&&controllo.impronta_ordine!==base.data.impronta);
 const letturaInCorso=controllo?.stato==='in_lettura'&&!controllo.lettura_scaduta;
 const busy=lista.avvia.isPending||letturaInCorso||accetta.isPending||decidi.isPending||abbina.isPending||applicaPrezzi.isPending;
 const puoDecidere=modificabile&&!obsoleto&&!base.isError&&!base.isFetching&&controllo?.stato==='letto'&&!controllo.accettato_il;
 const visualizzate=righe.filter(r=>filtro==='tutte'||filtro==='coerenti'&&r.esito==='verde'||filtro==='differenze'&&r.esito!=='verde');
 const prezziProposti=righe.filter(r=>r.indici_fornitore?.length===1&&base.data?.righe.some(x=>x.id===r.chiave&&x.price_pending)&&controllo?.lettura?.righe?.[r.indici_fornitore[0]]?.prezzo_unitario!=null);
 const rigaAttiva=righe.find(r=>r.chiave===attiva);
 const riferimento=String(storico?.testata.numero||'Ordine');
 const avvia=(x:{file?:File;attachmentId?:string;controlloId?:string;allegatoOrdine?:boolean})=>lista.avvia.mutate({tipo:x.controlloId&&controllo?controllo.tipo:tipoCaricamento,...x},{onSuccess:r=>{setScelto(r.id);setFiltro('tutte');setPannelloMobile('destra');}});
 const prossimo=()=>{
  const differenze=righe.filter(r=>r.esito!=='verde');
  if(!differenze.length) return;
  const i=differenze.findIndex(r=>r.chiave===attiva);
  setAttiva(differenze[(i+1)%differenze.length].chiave);
 };
 const mail=controllo?emailCorrezione({numero:riferimento,fornitore:storico?.fornitore?.nome,righe}):null;
 const seleziona=(r:RigaConfronto)=>setAttiva(r.chiave);
 const tabella=(lato:'richiesta'|'fornitore')=><div className="overflow-x-auto rounded-lg border">
  <table className="w-full table-fixed text-xs"><colgroup><col className="w-28"/><col/><col className="w-28"/></colgroup>
   <thead className="h-10 bg-slate-50 text-left text-[11px] text-slate-600"><tr><th className="px-3">Posizione</th><th className="px-3">{lato==='richiesta'?'Richiesto':'Documento fornitore'}</th><th className="px-3">{lato==='richiesta'?'Quantità':'Esito'}</th></tr></thead>
   <tbody>{visualizzate.map(r=>{
    const richiesta=richieste.find(x=>x.chiave===r.chiave);
    return <tr key={r.chiave} className={`h-14 cursor-pointer border-t ${attiva===r.chiave?'bg-blue-50':'hover:bg-slate-50'}`}>
     <td className="px-3"><button className="max-w-full truncate text-left font-medium text-blue-700" onClick={()=>seleziona(r)} title={r.riferimento||r.descrizione}>{r.riferimento||r.descrizione}</button></td>
     <td className="min-w-0 px-3"><button className="block w-full text-left" onClick={()=>seleziona(r)}><span className="block truncate font-medium" title={r.descrizione}>{r.descrizione}</span><span className="block truncate text-[11px] text-slate-500" title={lato==='richiesta'?r.chiesto:r.letto}>{lato==='richiesta'?r.chiesto:r.letto}{lato==='fornitore'&&r.quantita_documento!=null&&r.quantita_richiesta!=null&&r.quantita_documento<r.quantita_richiesta?` · ${numero(r.quantita_richiesta-r.quantita_documento)} ancora da confermare`:''}</span></button></td>
     <td className="px-3">{lato==='richiesta'?richiesta?`${numero(richiesta.quantita)} ${richiesta.unita||''}`:'—':<span className={`rounded-full px-2 py-1 text-[10px] font-medium ${ESITO_CLASSI[r.esito]}`}>{ESITO_LABEL[r.esito]}</span>}</td>
    </tr>;
   })}</tbody>
  </table>
 </div>;
 return <Dialog open onOpenChange={v=>{if(!v)onClose();}}><DialogContent className={CLASSE_DIALOG_CONFRONTO}>
  <DialogHeader className="shrink-0 border-b px-5 py-3 pr-12"><DialogTitle className="flex items-center gap-2 text-lg"><ArrowLeftRight className="h-5 w-5 text-orange-600"/>Confronto {obiettivo.purchaseOrderId?'ordine e conferma fornitore':'richiesta e offerta fornitore'}</DialogTitle><DialogDescription className="text-xs">{riferimento} · Richiesta inviata, documento ricevuto e differenze da verificare.</DialogDescription></DialogHeader>
  <div className="flex shrink-0 flex-wrap items-center gap-2 border-b bg-slate-50/70 px-5 py-2">
   <span className="mr-auto text-xs text-slate-500">{storico?.fonte==='invio'?`Versione inviata il ${String(storico.inviato_il||'').slice(0,10).split('-').reverse().join('/')}`:'Base: dati correnti; nessun invio conservato.'}</span>
   <Button size="sm" variant="outline" disabled={busy} onClick={()=>{lista.avvia.reset?.();void base.refetch();void lista.ricarica();}}> <RefreshCw className="mr-1.5 h-3.5 w-3.5"/>Aggiorna</Button>
   {modificabile&&<Button size="sm" variant="outline" disabled={busy} onClick={()=>fileInput.current?.click()}><FileUp className="mr-1.5 h-3.5 w-3.5"/>Carica {tipoCaricamento==='conferma'?'conferma':'offerta'}</Button>}
   <Button size="sm" disabled={!modificabile||busy||!controllo?.file_path} onClick={()=>avvia({controlloId:controllo!.id})}>{lista.avvia.isPending||letturaInCorso?<Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin"/>:<Sparkles className="mr-1.5 h-3.5 w-3.5"/>}{lista.avvia.isPending||letturaInCorso?'Lettura del documento…':'Controlla con AI'}</Button>
   <input ref={fileInput} type="file" accept={ACCEPT_DOCUMENTI_DDT} className="hidden" aria-label="Carica documento del fornitore" onChange={e=>{const f=e.target.files?.[0];e.target.value='';if(f)avvia({file:f});}}/>
  </div>
  <div className="shrink-0 border-b px-5 py-2"><RiepilogoConfronto indicatori={[
   {label:'Voci coerenti',valore:conti.verde,tono:'verde',attivo:filtro==='coerenti',onClick:()=>setFiltro(filtro==='coerenti'?'tutte':'coerenti')},
   {label:'Da verificare',valore:righe.length-conti.verde,tono:'ambra',attivo:filtro==='differenze',onClick:()=>setFiltro(filtro==='differenze'?'tutte':'differenze')},
   {label:'Documenti ricevuti',valore:lista.controlli.length,attivo:filtro==='tutte',onClick:()=>setFiltro('tutte')},
  ]}/></div>
  {(lista.errore||base.isError)&&<p role="alert" className="border-b bg-red-50 px-5 py-2 text-xs text-red-800">Dati non disponibili. Aggiorna prima di prendere una decisione.</p>}
  {obsoleto&&<p role="alert" className="border-b bg-amber-50 px-5 py-2 text-xs text-amber-950">{controllo?.impronta_ordine?'L’ordine è cambiato. Questo confronto riguarda una revisione precedente.':'Controllo storico senza versione verificabile.'} Usa “Controlla con AI” per aggiornarlo; le decisioni precedenti restano conservate.</p>}
  {controllo?.stato==='errore'&&<p role="alert" className="border-b bg-amber-50 px-5 py-2 text-xs">{controllo.errore} L’originale resta disponibile: puoi riprovare senza ricaricarlo.</p>}
  {lista.avvia.isError&&<p role="alert" className="border-b bg-red-50 px-5 py-2 text-xs text-red-800">{lista.avvia.error.message}</p>}
  {letturaInCorso&&<p role="status" className="border-b bg-blue-50 px-5 py-2 text-xs text-blue-900">Analisi in corso. Puoi chiudere il confronto e riaprirlo: il risultato viene salvato qui.</p>}
  <PannelliConfrontoMobile valore={pannelloMobile} onChange={setPannelloMobile} sinistra="Richiesta" destra="Fornitore"/>
  <div className="grid min-h-0 flex-1 overflow-y-auto lg:grid-cols-2">
   <section className={`${pannelloMobile==='sinistra'?'flex':'hidden lg:flex'} min-h-0 min-w-0 flex-col border-b lg:border-r lg:border-b-0`}>
    <div className="shrink-0 space-y-2 border-b px-5 py-3"><h3 className="text-sm font-semibold">{storico?.fonte==='invio'?'Richiesta inviata':'Richiesta da controllare'}</h3><Tabs value={vistaSinistra} onValueChange={setVistaSinistra}><TabsList className="h-8"><TabsTrigger className="text-xs" value="righe">Righe</TabsTrigger>{obiettivo.purchaseOrderId&&<TabsTrigger className="text-xs" value="pdf">PDF inviato</TabsTrigger>}</TabsList></Tabs></div>
    <div className="min-h-0 flex-1 overflow-auto p-4">
     {vistaSinistra==='pdf'&&obiettivo.purchaseOrderId?<OriginaliOrdineConfronto companyId={companyId} ordineId={obiettivo.purchaseOrderId} numero={riferimento} tipo="inviato" baseCongelata={controllo?.base_ordine??undefined} adatta/>:righe.length?tabella('richiesta'):base.isLoading?<p role="status" className="text-xs">Caricamento richiesta…</p>:<ul className="divide-y rounded-lg border">{richieste.map(r=><li key={r.chiave} className="flex justify-between gap-3 p-3 text-xs"><span className="truncate" title={r.descrizione}>{r.riferimento?`${r.riferimento} · `:''}{r.descrizione}</span><strong className="shrink-0">{numero(r.quantita)} {r.unita}</strong></li>)}</ul>}
    </div>
   </section>
   <section className={`${pannelloMobile==='destra'?'flex':'hidden lg:flex'} min-h-0 min-w-0 flex-col`}>
    <div className="shrink-0 space-y-2 border-b px-5 py-3"><div className="flex items-center justify-between gap-2"><h3 className="text-sm font-semibold">Documento del fornitore</h3>{controllo?.accettato_il&&<span className="text-xs font-medium text-emerald-800">{obsoleto?'Approvazione precedente':'Approvata'}</span>}</div>
     {obiettivo.purchaseOrderId&&<label className="flex items-center gap-2 text-[11px] text-slate-500">Nuovo documento<select aria-label="Tipo di documento del fornitore" className="ml-auto h-7 rounded-md border px-2 text-xs" value={tipoCaricamento} onChange={e=>setTipoCaricamento(e.target.value as 'offerta'|'conferma')}><option value="conferma">Conferma d’ordine</option><option value="offerta">Offerta / preventivo</option></select></label>}
     {lista.controlli.length>0&&<select aria-label="Versione della conferma fornitore" className="h-8 w-full rounded-md border px-2 text-xs" value={id} onChange={e=>{setScelto(e.target.value);setAttiva('');}}>{lista.controlli.map((c,i)=><option key={c.id} value={c.id}>{i+1}. {c.file_nome||'Documento'} · {new Date(c.created_at).toLocaleDateString('it-IT')} · {c.stato==='errore'?'Da rileggere':c.accettato_il?'Approvata':'Da verificare'}</option>)}</select>}
     <Tabs value={vistaDestra} onValueChange={setVistaDestra}><TabsList className="h-8"><TabsTrigger className="text-xs" value="righe">Righe</TabsTrigger><TabsTrigger className="text-xs" value="pdf">PDF / foto originale</TabsTrigger></TabsList></Tabs>
    </div>
    <div className="min-h-0 flex-1 space-y-3 overflow-auto p-4">
     {caricamento||lista.caricamento?<p role="status" className="text-xs">Caricamento conferme…</p>:vistaDestra==='pdf'&&controllo?<OriginaliConfronto key={controllo.id} companyId={companyId} files={fileConferma(controllo)} ricerca={rigaAttiva?.riferimento||rigaAttiva?.descrizione} paginaIniziale={rigaAttiva?.pagina_fornitore??undefined} adatta/>:righe.length?tabella('fornitore'):<div className="rounded-lg border border-dashed p-6 text-center text-sm text-slate-500">{lista.avvia.isPending||letturaInCorso?'Lettura e confronto in corso…':'Carica la conferma ufficiale per confrontarla con la richiesta.'}</div>}
     {!controllo&&base.data?.allegato_fornitore&&<Button size="sm" variant="outline" disabled={!modificabile||busy} onClick={()=>avvia({allegatoOrdine:true})}>Usa l’allegato già presente nell’ordine</Button>}
     {!controllo&&lista.allegati.map(a=><Button key={a.attachment_id} className="w-full justify-start text-xs" size="sm" variant="outline" disabled={!modificabile||busy} onClick={()=>avvia({attachmentId:a.attachment_id})}><Mail className="mr-2 h-3.5 w-3.5"/>Usa allegato email · {a.filename}</Button>)}
    </div>
   </section>
  </div>
  {rigaAttiva&&<div className="max-h-[25dvh] shrink-0 overflow-auto border-t bg-slate-50/60 px-5 py-3"><div className="mb-2 flex items-center justify-between gap-2"><strong className="truncate text-xs">{rigaAttiva.riferimento||rigaAttiva.descrizione}</strong><Button size="sm" variant="ghost" className="h-7 text-xs" onClick={prossimo}>Differenza successiva<ChevronRight className="ml-1 h-3 w-3"/></Button></div>
   <table className="w-full text-xs"><thead className="text-left text-[11px] text-slate-500"><tr><th>Campo</th><th>Richiesto</th><th>Fornitore</th><th>Esito</th></tr></thead><tbody>{rigaAttiva.campi.map((c,i)=><tr key={i} className="border-t"><td className="py-1.5 font-medium">{c.campo}</td><td className="px-2">{c.chiesto||'—'}</td><td className="px-2">{c.letto||'—'}</td><td className="py-1.5">{c.nota||ESITO_LABEL[c.esito]}</td></tr>)}</tbody></table>
   {puoDecidere&&<div className="mt-2 flex flex-wrap gap-2"><Button size="sm" variant="outline" className="h-7 text-xs" onClick={()=>{setNota('');setIndici(rigaAttiva.indici_fornitore??[]);setAbbinaAperto(true);}}>Scegli corrispondenza</Button><Button size="sm" variant="outline" className="h-7 text-xs" onClick={()=>{setNota('');setDecisione({riga:rigaAttiva,esito:'verde'});}}>Conferma controllo manuale</Button><Button size="sm" variant="outline" className="h-7 text-xs" onClick={()=>{setNota('');setDecisione({riga:rigaAttiva,esito:'rosso'});}}>Segnala differenza</Button></div>}
    {(rigaAttiva.nota_persona||rigaAttiva.nota_abbinamento)&&<p className="mt-2 text-[11px] text-slate-600">Verifica registrata: {rigaAttiva.nota_persona||rigaAttiva.nota_abbinamento}</p>}
  </div>}
  {!!controllo?.decisioni_storico?.length&&<details className="max-h-32 shrink-0 overflow-auto border-t px-5 py-2 text-xs"><summary className="cursor-pointer text-slate-600">Storico decisioni ({controllo.decisioni_storico.length})</summary><ol className="mt-2 space-y-2">{controllo.decisioni_storico.map((e,i)=><li key={i} className="border-t pt-1"><span className="font-medium">{e.azione==='approvazione'?'Approvazione':e.azione==='abbinamento'?'Abbinamento manuale':e.azione==='prezzi_applicati'?'Prezzi applicati':'Verifica posizione'}</span> · {new Date(e.data).toLocaleString('it-IT')}<span className="block text-slate-500">{e.nota||'Decisione registrata'} · revisione {e.versione}</span></li>)}</ol></details>}
  <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-t px-5 py-3"><p className="max-w-lg text-[11px] text-slate-500">L’approvazione conserva la decisione. Quantità non confermate restano aperte; arrivi, magazzino e fatture si gestiscono separatamente.</p><div className="flex flex-wrap gap-2">
   <Button size="sm" variant="outline" onClick={onClose}>Chiudi confronto</Button>
   {righe.some(r=>r.esito!=='verde')&&<Button size="sm" variant="outline" onClick={prossimo}>Vai alle differenze</Button>}
   {mail&&righe.some(r=>r.esito==='rosso')&&modificabile&&<Button size="sm" variant="outline" onClick={()=>setEmailAperta(true)}>Prepara correzioni</Button>}
   {modificabile&&controllo?.accettato_il&&!obsoleto&&prezziProposti.length>0&&<Button size="sm" disabled={busy} onClick={()=>setPrezziAperti(true)}>Applica prezzi proposti ({prezziProposti.length})</Button>}
   {modificabile&&!controllo?.accettato_il&&<Button size="sm" disabled={!puoDecidere||busy} onClick={()=>{setNota('');setApprova(true);}}>Approva {obiettivo.purchaseOrderId?'conferma':'offerta'}</Button>}
  </div></div>
  <Dialog open={!!decisione||approva} onOpenChange={v=>{if(!v){setDecisione(null);setApprova(false);}}}><DialogContent className="max-w-md"><DialogHeader><DialogTitle>{decisione?'Registra la verifica manuale':'Approva il documento'}</DialogTitle><DialogDescription>{decisione?'Indica cosa hai verificato sull’originale.':'Le differenze accettate richiedono una motivazione; non modificano automaticamente l’ordine.'}</DialogDescription></DialogHeader>
   <Textarea aria-label="Motivazione della verifica" rows={3} value={nota} onChange={e=>setNota(e.target.value)} placeholder="Verifica sull’originale o variazione concordata con il fornitore"/>
   <DialogFooter><Button variant="outline" onClick={()=>{setDecisione(null);setApprova(false);}}>Annulla</Button><Button disabled={busy||((!!decisione||controllo?.esito!=='verde')&&nota.trim().length<5)} onClick={()=>{if(decisione)decidi.mutate({chiave:decisione.riga.chiave,esito:decisione.esito,nota:nota.trim()},{onSuccess:()=>setDecisione(null)});else accetta.mutate(nota.trim(),{onSuccess:()=>setApprova(false)});}}>Salva decisione</Button></DialogFooter>
  </DialogContent></Dialog>
  <Dialog open={abbinaAperto} onOpenChange={setAbbinaAperto}><DialogContent className="max-w-xl"><DialogHeader><DialogTitle>Scegli le posizioni del fornitore</DialogTitle><DialogDescription>Puoi collegare più righe alla stessa voce. Le quantità si sommano soltanto quando unità e configurazione sono compatibili.</DialogDescription></DialogHeader>
   <div className="max-h-64 space-y-1 overflow-auto">{controllo?.lettura?.righe?.map((r,i)=><label key={i} className="flex cursor-pointer items-start gap-2 rounded-md border p-2 text-xs"><input type="checkbox" checked={indici.includes(i)} onChange={e=>setIndici(v=>e.target.checked?[...v,i]:v.filter(x=>x!==i))}/><span><strong>{r.riferimento||`Pos. ${i+1}`} · {r.descrizione}</strong><span className="mt-0.5 block text-slate-500">{r.quantita} {r.unita} · {r.larghezza_mm??'—'} × {r.altezza_mm??'—'} mm{r.pagina?` · pagina ${r.pagina}`:''}</span></span></label>)}</div>
   <Textarea aria-label="Motivo dell’abbinamento" value={nota} onChange={e=>setNota(e.target.value)} placeholder="Riferimenti verificati oppure rapporto fra kit, confezioni e pezzi"/>
   <DialogFooter><Button variant="outline" onClick={()=>setAbbinaAperto(false)}>Annulla</Button><Button disabled={busy||!indici.length||nota.trim().length<5} onClick={()=>rigaAttiva&&abbina.mutate({chiave:rigaAttiva.chiave,indici,nota:nota.trim()},{onSuccess:()=>setAbbinaAperto(false)})}>Salva abbinamento</Button></DialogFooter>
  </DialogContent></Dialog>
  <Dialog open={prezziAperti} onOpenChange={setPrezziAperti}><DialogContent className="max-w-md"><DialogHeader><DialogTitle>Applica i prezzi del fornitore</DialogTitle><DialogDescription>Vengono aggiornati soltanto i prezzi netti delle voci ancora da valorizzare. Quantità, misure e IVA restano quelle dell’ordine.</DialogDescription></DialogHeader>
   <ul className="max-h-60 divide-y overflow-auto">{prezziProposti.map(r=><li key={r.chiave} className="flex justify-between gap-2 py-2 text-xs"><span className="truncate" title={r.descrizione}>{r.descrizione}</span><strong className="shrink-0">{numero(controllo!.lettura!.righe![r.indici_fornitore![0]].prezzo_unitario!)} €/UM</strong></li>)}</ul>
   <DialogFooter><Button variant="outline" onClick={()=>setPrezziAperti(false)}>Annulla</Button><Button disabled={busy} onClick={()=>applicaPrezzi.mutate(prezziProposti.map(r=>r.chiave),{onSuccess:()=>setPrezziAperti(false)})}>Conferma applicazione prezzi</Button></DialogFooter>
  </DialogContent></Dialog>
  {mail&&<EmailComposeDialog open={emailAperta} onOpenChange={setEmailAperta} context={{mode:'new',initialTo:storico?.fornitore?.email?[storico.fornitore.email]:[],initialSubject:mail.oggetto,initialBodyHtml:mail.corpo}}/>}
 </DialogContent></Dialog>;
}
