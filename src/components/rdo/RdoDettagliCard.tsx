import type {TablesUpdate} from "@/integrations/supabase/types";
import {useState,type FormEvent} from "react";
import {Pencil,Save,Loader2,CalendarClock} from "lucide-react";
import {Card,CardContent} from "@/components/ui/card";
import {Button} from "@/components/ui/button";
import {Input} from "@/components/ui/input";
import {Label} from "@/components/ui/label";
import {Textarea} from "@/components/ui/textarea";
import {CommessaCombobox} from "@/components/orders/CommessaCombobox";
import type {SupplierRfq} from "@/hooks/useSupplierRfqs";
import {dataIt} from "@/lib/documentiOperativi/modello";
type Riepilogo={etichetta:string;valore:string};
type Props={rfq:SupplierRfq;disabled:boolean;onSave:(updates:TablesUpdate<"supplier_rfqs">)=>Promise<unknown>;onEditingChange:(editing:boolean)=>void;
 /** Numeri della richiesta mostrati nella stessa striscia (voci, risposte, offerta più bassa). */
 riepilogo?:Riepilogo[]};
/**
 * I dati della richiesta in una striscia sola, come la testata della bolla
 * (11/11/2026): prima era un riquadro alto con tre campi e la descrizione sotto.
 */
export function RdoDettagliCard({rfq,disabled,onSave,onEditingChange,riepilogo=[]}:Props){
 const [editing,setEditing]=useState(false);
 const toggle=(v:boolean)=>{setEditing(v);onEditingChange(v);};
 const celle:Riepilogo[]=[
  {etichetta:"Commessa",valore:rfq.orders?.order_code || "Magazzino / consumo"},
  {etichetta:"Serve entro",valore:dataIt(rfq.data_fabbisogno) || "Da indicare"},
  {etichetta:"Offerte entro",valore:dataIt(rfq.scadenza_offerte) || "Da indicare"},
  ...riepilogo,
 ];
 return <Card>
  <CardContent className="py-3">
   {editing ? <RdoForm rfq={rfq} onSave={async patch=>{await onSave(patch);toggle(false);}} onCancel={()=>toggle(false)}/> : <>
    <div className="flex items-start gap-3">
     <dl className="grid min-w-0 flex-1 grid-cols-2 gap-x-4 gap-y-2 sm:grid-cols-3 lg:grid-cols-6">
      {celle.map(c=><div key={c.etichetta} className="min-w-0"><dt className="flex items-center gap-1 text-[10px] uppercase tracking-wide text-muted-foreground">{c.etichetta==="Serve entro"||c.etichetta==="Offerte entro"?<CalendarClock className="h-3 w-3"/>:null}{c.etichetta}</dt><dd className={`mt-0.5 truncate text-sm ${c.valore==="Da indicare"?"italic text-muted-foreground":"font-medium"}`} title={c.valore}>{c.valore}</dd></div>)}
     </dl>
     {!disabled && <Button variant="ghost" size="sm" className="shrink-0" aria-label="Modifica dettagli" onClick={()=>toggle(true)}><Pencil className="h-3.5 w-3.5 sm:mr-1"/><span className="hidden sm:inline">Modifica dettagli</span></Button>}
    </div>
    {(rfq.descrizione || rfq.note) && <div className="mt-2 space-y-1 border-t pt-2 text-sm">
     {rfq.descrizione && <p className="whitespace-pre-wrap text-slate-700">{rfq.descrizione}</p>}
     {rfq.note && <p className="whitespace-pre-wrap"><span className="text-xs font-semibold text-muted-foreground">Note per i fornitori: </span>{rfq.note}</p>}
    </div>}
   </>}
  </CardContent>
 </Card>;
}
function RdoForm({rfq,onSave,onCancel}:{rfq:SupplierRfq;onSave:Props["onSave"];onCancel:()=>void}){
 const [d,setD]=useState(()=>({titolo:rfq.titolo,descrizione:rfq.descrizione || "",note:rfq.note || "",data_fabbisogno:rfq.data_fabbisogno || "",scadenza_offerte:rfq.scadenza_offerte || "",order_id:rfq.order_id}));
 const [busy,setBusy]=useState(false),[error,setError]=useState<string|null>(null);
 const save=async(e:FormEvent)=>{e.preventDefault();if(busy)return;if(!d.titolo.trim()){setError("Inserisci il titolo della richiesta.");return;}setBusy(true);setError(null);try{await onSave({...d,titolo:d.titolo.trim(),descrizione:d.descrizione.trim() || null,note:d.note.trim() || null,data_fabbisogno:d.data_fabbisogno || null,scadenza_offerte:d.scadenza_offerte || null});}catch{setError("Richiesta non salvata. Le modifiche restano qui: riprova.");setBusy(false);}};
 return <form onSubmit={save}><fieldset disabled={busy} className="space-y-4"><div className="grid gap-4 sm:grid-cols-2"><div><Label htmlFor="rdo-titolo">Titolo richiesta</Label><Input id="rdo-titolo" required value={d.titolo} onChange={e=>setD({...d,titolo:e.target.value})}/></div><div><Label>Commessa (facoltativa)</Label><CommessaCombobox value={d.order_id} onChange={order_id=>setD({...d,order_id})} nessunaLabel="Magazzino / materiali di consumo"/></div><div><Label htmlFor="rdo-fabbisogno">Materiale necessario entro</Label><Input id="rdo-fabbisogno" type="date" value={d.data_fabbisogno} onChange={e=>setD({...d,data_fabbisogno:e.target.value})}/></div><div><Label htmlFor="rdo-scadenza">Scadenza offerte</Label><Input id="rdo-scadenza" type="date" value={d.scadenza_offerte} onChange={e=>setD({...d,scadenza_offerte:e.target.value})}/></div></div><div><Label htmlFor="rdo-descrizione">Descrizione della richiesta</Label><Textarea id="rdo-descrizione" value={d.descrizione} onChange={e=>setD({...d,descrizione:e.target.value})}/></div><div><Label htmlFor="rdo-note">Note per i fornitori</Label><Textarea id="rdo-note" value={d.note} onChange={e=>setD({...d,note:e.target.value})}/></div>{error && <p role="alert" className="text-sm text-red-700">{error}</p>}<div className="flex justify-end gap-2"><Button type="button" variant="ghost" onClick={onCancel}>Annulla</Button><Button type="submit">{busy ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin"/> : <Save className="mr-1.5 h-4 w-4"/>}Salva richiesta</Button></div></fieldset></form>;
}
