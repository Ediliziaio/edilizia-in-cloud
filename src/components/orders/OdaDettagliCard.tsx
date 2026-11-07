import { PAGAMENTI_FORNITORI, etichettaPagamentoFornitore } from "@/lib/impostazioni/pagamentiFornitori";
import { useState, type FormEvent, type ReactNode } from "react";
import { CreditCard, Loader2, Pencil, Save } from "lucide-react";
import { QuoteCard } from "@/components/marketing/preventivi/ui/builderUI";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { DestinazioneDocumento } from "@/components/documentiOperativi/DestinazioneDocumento";
import { type DocumentoOperativo, dataIt } from "@/lib/documentiOperativi/modello";
import { TERMINI_PRESET } from "@/lib/terminiPagamento";
import { isValidEmail } from "@/lib/email/preferencesValidators";
import type { TablesUpdate } from "@/integrations/supabase/types";
import { aggiornamentoDettagliOda } from "@/lib/orders/dettagliDocumentoOda";

export function OdaDettagliCard({documento,orderId,internalNotes,condizioniFornitore,paymentMethod,canEdit,onSave,onEditingChange}: {
  documento:DocumentoOperativo; orderId:string | null; internalNotes:string | null; condizioniFornitore:string;
  paymentMethod?:string | null; canEdit:boolean; onSave:(patch:TablesUpdate<"purchase_orders">)=>Promise<unknown>; onEditingChange?:(editing:boolean)=>void;
}) {
  const [editing,setEditing] = useState(false);
  const cambiaEditing = (v:boolean) => {setEditing(v);onEditingChange?.(v);};
  const dato = (label:string,value?:ReactNode) => <div><dt className="text-xs text-slate-500">{label}</dt><dd className="mt-1 whitespace-pre-wrap break-words text-sm font-medium text-slate-800">{value || <span className="font-normal text-slate-400">Non indicato</span>}</dd></div>;
  return <QuoteCard title="Dettagli ordine e pagamento" icon={<CreditCard className="h-4 w-4" />} action={canEdit && !editing && <Button size="sm" variant="outline" onClick={()=>cambiaEditing(true)}><Pencil className="mr-1.5 h-3.5 w-3.5" />Modifica dettagli</Button>}>
    {editing ? <DettagliForm documento={documento} orderId={orderId} internalNotes={internalNotes} condizioniFornitore={condizioniFornitore} paymentMethod={paymentMethod} onSave={async patch=>{await onSave(patch);cambiaEditing(false);}} onCancel={()=>cambiaEditing(false)} /> : <>
      <div className="mb-5 rounded-xl border border-orange-100 bg-orange-50/60 p-4">
        <p className="text-xs font-semibold uppercase tracking-wide text-orange-700">Condizioni di pagamento dell’ordine</p>
        <p className="mt-1 whitespace-pre-wrap text-sm font-semibold text-slate-900">{documento.pagamento || condizioniFornitore}</p>
        <p className="mt-2 text-xs text-slate-500">Anagrafica fornitore: {condizioniFornitore}</p>
      </div>
      <dl className="grid gap-x-6 gap-y-4 sm:grid-cols-2 xl:grid-cols-3">
        {dato("Metodo di pagamento",etichettaPagamentoFornitore(paymentMethod ?? null))}
        {dato("Tipo documento",documento.tipo === "servizi" ? "Ordine di servizi e lavori" : "Ordine materiali")}
        {dato("Data emissione",dataIt(documento.data))}{dato("Consegna prevista",dataIt(documento.consegna))}
        {dato("Destinatario",documento.destinatario.nome)}{dato("Email destinatario",documento.destinatario.email)}{dato("Nostro codice cliente",documento.codiceCliente)}
        {dato("Referente fornitore",[documento.referente,documento.referenteEmail,documento.referenteTelefono].filter(Boolean).join("\n"))}
        {dato("Riferimento preventivo / documento",documento.riferimento)}
        {dato("Consegna / ritiro",({cantiere:"Cantiere della commessa",magazzino:"Nostro magazzino",ritiro:"Ritiro dal fornitore",altro:"Altro indirizzo"})[documento.destinazioneTipo || "altro"])}
        {dato("Indirizzo di destinazione",documento.luogo)}{dato("Referente per la consegna",documento.referenteConsegna)}{dato("Istruzioni di consegna",documento.noteConsegna)}
      </dl>
      {(documento.condizioni || internalNotes) && <dl className="mt-5 grid gap-4 border-t border-slate-100 pt-4 sm:grid-cols-2">{dato("Condizioni aggiuntive",documento.condizioni)}{dato("Note interne (escluse da PDF ed email)",internalNotes)}</dl>}
    </>}
  </QuoteCard>;
}

function DettagliForm({documento,orderId,internalNotes,condizioniFornitore,paymentMethod,onSave,onCancel}: {
 documento:DocumentoOperativo;orderId:string | null;internalNotes:string | null;condizioniFornitore:string;paymentMethod?:string | null;
 onSave:(patch:TablesUpdate<"purchase_orders">)=>Promise<unknown>;onCancel:()=>void;
}) {
 const [d,setD]=useState(documento);
 const [metodo,setMetodo]=useState(paymentMethod || "");
 const [noteInterne,setNoteInterne]=useState(internalNotes || "");
 const [saving,setSaving]=useState(false);
 const [error,setError]=useState<string | null>(null);
 const cambia=<K extends keyof DocumentoOperativo>(key:K,value:DocumentoOperativo[K])=>setD(prev=>({...prev,[key]:value}));
 const salva=async(e:FormEvent)=>{
  e.preventDefault();if(saving)return;
  if(!d.destinatario.nome.trim() || !d.data) {setError("Inserisci il destinatario e la data di emissione.");return;}
  if([d.destinatario.email,d.referenteEmail].some(email=>email?.trim() && !isValidEmail(email.trim()))) {setError("Controlla gli indirizzi email del destinatario e del referente.");return;}
  setSaving(true);setError(null);
  try {await onSave(aggiornamentoDettagliOda(d,noteInterne,metodo));}
  catch {setError("Dettagli non salvati. Le modifiche sono ancora qui: riprova.");setSaving(false);}
 };
 const campo=(label:string,key:"data"|"consegna"|"riferimento"|"codiceCliente"|"referente"|"referenteEmail"|"referenteTelefono",type="text")=><div><Label htmlFor={`oda-${key}`}>{label}</Label><Input id={`oda-${key}`} type={type} maxLength={1000} value={d[key] || ""} onChange={e=>cambia(key,e.target.value)} /></div>;
 return <form onSubmit={salva} className="space-y-4">
  <p className="text-sm text-slate-500">Questi dati si salvano sull’ordine e vengono ripresi nel PDF e nelle email. L’anagrafica del fornitore si modifica nel riquadro Fornitore.</p>
  <fieldset disabled={saving} className="space-y-5">
   <div className="rounded-xl border border-orange-100 bg-orange-50/60 p-4">
    <Label htmlFor="oda-metodo-pagamento">Metodo di pagamento</Label>
    <select id="oda-metodo-pagamento" value={metodo} onChange={e=>setMetodo(e.target.value)} className="mb-3 mt-1 h-10 w-full rounded-md border bg-white px-3 text-sm"><option value="">Da concordare</option>{metodo && !PAGAMENTI_FORNITORI.some(m=>m.value === metodo) && <option value={metodo}>{etichettaPagamentoFornitore(metodo)}</option>}{PAGAMENTI_FORNITORI.map(m=><option key={m.value} value={m.value}>{m.label}</option>)}</select>
    <Label htmlFor="oda-pagamento">Condizioni di pagamento dell’ordine</Label><Textarea id="oda-pagamento" value={d.pagamento || ""} maxLength={4000} onChange={e=>cambia("pagamento",e.target.value)} />
    <p className="mt-2 text-xs text-slate-500">Concordato con il fornitore: {condizioniFornitore}</p>
    <Button type="button" variant="ghost" size="sm" className="mt-1 px-0 text-orange-800" onClick={()=>cambia("pagamento",condizioniFornitore)}>Usa condizioni del fornitore</Button>
    <div className="mt-2 flex flex-wrap gap-1.5">{TERMINI_PRESET.map(t=><button type="button" key={t} className="rounded-full border border-orange-100 bg-white px-2 py-1 text-xs text-slate-600 hover:border-orange-300" onClick={()=>cambia("pagamento",t)}>{t}</button>)}</div>
   </div>
   <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
    <div><Label htmlFor="oda-tipo">Tipo documento</Label><select id="oda-tipo" className="h-10 w-full rounded-md border bg-white px-3 text-sm" value={d.tipo} onChange={e=>cambia("tipo",e.target.value === "servizi" ? "servizi" : "materiali")}><option value="materiali">Ordine materiali</option><option value="servizi">Ordine di servizi e lavori</option></select></div>
    {campo("Data emissione","data","date")}{campo("Consegna prevista","consegna","date")}
    <div><Label htmlFor="oda-destinatario">Destinatario</Label><Input id="oda-destinatario" required value={d.destinatario.nome} onChange={e=>cambia("destinatario",{...d.destinatario,nome:e.target.value})} /></div>
    <div><Label htmlFor="oda-destinatario-email">Email destinatario</Label><Input id="oda-destinatario-email" type="email" value={d.destinatario.email || ""} onChange={e=>cambia("destinatario",{...d.destinatario,email:e.target.value})} /></div>
    {campo("Nostro codice cliente","codiceCliente")}
    <div className="sm:col-span-2"><Label htmlFor="oda-destinatario-indirizzo">Sede del destinatario</Label><Input id="oda-destinatario-indirizzo" value={d.destinatario.indirizzo || ""} onChange={e=>cambia("destinatario",{...d.destinatario,indirizzo:e.target.value})} /></div>
    <div><Label htmlFor="oda-destinatario-iva">Partita IVA destinatario</Label><Input id="oda-destinatario-iva" value={d.destinatario.partitaIva || ""} onChange={e=>cambia("destinatario",{...d.destinatario,partitaIva:e.target.value})} /></div>
    {campo("Nome referente fornitore","referente")}{campo("Email referente fornitore","referenteEmail","email")}{campo("Telefono referente fornitore","referenteTelefono","tel")}
    {campo("Riferimento preventivo / documento","riferimento")}
   </div>
   <DestinazioneDocumento documento={d} commessaId={orderId} onChange={patch=>setD(prev=>({...prev,...patch}))} />
   <div className="grid gap-4 sm:grid-cols-2">
    <div><Label htmlFor="oda-note-consegna">Istruzioni per consegna o accesso</Label><Textarea id="oda-note-consegna" value={d.noteConsegna || ""} maxLength={10000} onChange={e=>cambia("noteConsegna",e.target.value)} /></div>
    <div><Label htmlFor="oda-condizioni">Condizioni aggiuntive per il destinatario</Label><Textarea id="oda-condizioni" value={d.condizioni || ""} maxLength={10000} onChange={e=>cambia("condizioni",e.target.value)} /></div>
    <div><Label htmlFor="oda-note">Note dell’ordine per il destinatario</Label><Textarea id="oda-note" value={d.note || ""} maxLength={10000} onChange={e=>cambia("note",e.target.value)} /></div>
    <div><Label htmlFor="oda-note-interne">Note interne (escluse da PDF ed email)</Label><Textarea id="oda-note-interne" value={noteInterne} maxLength={10000} onChange={e=>setNoteInterne(e.target.value)} /></div>
   </div>
   <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={!!d.noteNelMessaggio} onChange={e=>cambia("noteNelMessaggio",e.target.checked)} />Riporta le note anche nel messaggio che accompagna il PDF</label>
   {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
   <div className="flex flex-wrap justify-end gap-2 border-t border-slate-100 pt-4"><Button type="button" variant="ghost" onClick={onCancel}>Annulla</Button><Button type="submit">{saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}Salva dettagli ordine</Button></div>
  </fieldset>
 </form>;
}
