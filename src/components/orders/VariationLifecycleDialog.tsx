import { useCallback, useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useVariationWorkflow, type WorkflowResponse, type WorkflowEvidence } from "@/hooks/useVariationWorkflow";
import { emptyVariationDraft, prepareVariation, type VariationDraft } from "@/lib/orders/variationDraft";
import { variationDocumentContext } from "@/lib/orders/variationDocumentContext";
import { VariationEditor, type VariationContext } from "./VariationEditor";
import { VariationTemplatePicker } from "./VariationTemplatePicker";
import { PdfBlobLivePreviewPanel } from "@/components/shared/PdfBlobLivePreviewPanel";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface Props { id: string; existing: boolean; order: string; company: string; context: VariationContext; canEdit: boolean; onClose: () => void }
export function VariationLifecycleDialog({ id, existing, order, company, context, canEdit, onClose }: Props) {
  const workflow = useVariationWorkflow(order, company);
  const [form, setForm] = useState<VariationDraft>(() => ({ ...emptyVariationDraft(), documentCompanyName: context.companyName, documentCompanyDetails: context.companyDetails, documentCustomerName: context.customerName, documentCustomerDetails: context.customerAddress }));
  const [receipt, setReceipt] = useState<WorkflowResponse | null>(null);
  const [saved, setSaved] = useState(existing ? "" : JSON.stringify(form));
  const [busy, setBusy] = useState(existing);
  const [error, setError] = useState("");
  const [view, setView] = useState(false);
  const [pdf, setPdf] = useState<{url: string; name: string} | null>(null);
  const [evidence, setEvidence] = useState<WorkflowEvidence[]>([]);
  const [selectedEvidence, setSelectedEvidence] = useState("");
  const [signer, setSigner] = useState("");
  const [signedOn, setSignedOn] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const lock = useRef(false), alive = useRef(true);
  const urls = useRef(new Set<string>());
  const dirty = JSON.stringify(form) !== saved;
  const editable = canEdit && (!receipt || receipt.variation.status === "bozza");
  const absorb = (data: WorkflowResponse) => {
    setReceipt(data);
    if (data.workspace) { setForm(data.workspace.content); setSaved(JSON.stringify(data.workspace.content)); }
    else if(data.variation) {const legacy={...emptyVariationDraft(),title:data.variation.titolo,description:data.variation.descrizione,amount:String(Math.abs(data.variation.impatto_economico)),kind:data.variation.impatto_economico<0?"riduzione" as const:"aggiunta" as const,days:String(data.variation.impatto_giorni)};setForm(legacy);setSaved(JSON.stringify(legacy));}
    if (Array.isArray(data.evidence)) setEvidence(data.evidence);
    else if (data.evidence) setEvidence(previous => [data.evidence as WorkflowEvidence, ...previous.filter(item => item.id !== (data.evidence as WorkflowEvidence).id)]);
  };
  useEffect(() => {
    alive.current = true;
    if (existing) void workflow.request(id, "load").then(data => { if (alive.current) absorb(data); }).catch(e => { if (alive.current) setError(e.message); }).finally(() => { if (alive.current) setBusy(false); });
    return () => { alive.current = false; for (const url of urls.current) URL.revokeObjectURL(url); urls.current.clear(); };
    // Dialog is keyed by company/order/id; no background reload can overwrite edits.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, order, company]);
  const phases = useQuery({ queryKey: ["variation-phase-options", order, company], enabled: editable,
    queryFn: async () => { const {data, error} = await supabase.from("order_work_phases").select("id,name,end_date").eq("order_id", order).eq("company_id", company).order("position"); if(error) throw error; return data ?? []; }, staleTime: 30_000 });
  const approval = useQuery({ queryKey: ["variation-approval-permission", company], enabled: canEdit,
    queryFn: async () => { const {data: session} = await supabase.auth.getSession(); const uid = session.session?.user.id; if(!uid) return false; const {data,error} = await supabase.rpc("has_permission_for_company", {_user_id:uid,_company_id:company,_permission:"can_approve_variations"}); if(error) throw error; return data === true; }, staleTime: 60_000 });
  const run = async (operation: () => Promise<void>) => {
    if(lock.current) return; lock.current = true; setBusy(true); setError("");
    try { await operation(); } catch(e) { if(alive.current) setError(e instanceof Error ? e.message : "Operazione non confermata. Riapri la variante prima di riprovare."); }
    finally { lock.current = false; if(alive.current) setBusy(false); }
  };
  const save = async () => {
    const data = await workflow.request(id,"save",{revision:receipt?.workspace?.revision ?? 0,content:form,context:variationDocumentContext(form,context)});
    if(alive.current) absorb(data); return data;
  };
  const showDocument = async (fileId = "proposal") => {
    const result = await workflow.open(id,fileId);
    const url = URL.createObjectURL(result.blob); urls.current.add(url);
    if(alive.current) { setPdf({url,name:result.name}); setView(true); } else { URL.revokeObjectURL(url); urls.current.delete(url); }
  };
  const render = useCallback(async () => pdf?.url ?? "", [pdf]);
  const close = () => { if(busy || lock.current) return; if(dirty && editable && !window.confirm("La bozza contiene modifiche non salvate. Chiudere senza salvarle?")) return; onClose(); };
  const fresh = !!receipt?.document && !dirty && receipt.document.source_revision === receipt.workspace?.revision;
  const pending = receipt?.variation.status === "in_attesa";
  const evidenceForDocument = evidence.filter(item => item.document_id === receipt?.document?.id);
  const canApprove = editable || pending;
  return <Dialog open onOpenChange={open => { if(!open) close(); }}><DialogContent className="flex max-h-[94dvh] flex-col overflow-hidden p-0 sm:max-w-5xl">
    <DialogHeader className="shrink-0 border-b p-4 pr-10"><DialogTitle>{receipt ? `Variante #${receipt.variation.numero_odv}` : "Nuovi lavori extra o variante"}</DialogTitle><DialogDescription>Salva la bozza, prepara il PDF e scegli come inviarlo. Nessun invio automatico.</DialogDescription></DialogHeader>
    <div className="min-h-0 overflow-y-auto p-4 space-y-4">
      {error && <div role="alert" className="text-sm text-destructive">{error} {existing && !receipt && <Button variant="outline" onClick={() => void run(async () => absorb(await workflow.request(id,"load")))}>Riprova</Button>}</div>}
      <div className="flex flex-wrap gap-2"><Button variant={!view?"default":"outline"} onClick={() => setView(false)}>Dati e condizioni</Button>{receipt?.document && <Button variant={view?"default":"outline"} disabled={busy || dirty} onClick={() => void run(() => showDocument())}>PDF conservato e allegati</Button>}</div>
      {!view ? <>
        {editable && <VariationTemplatePicker companyId={company} draft={form} context={variationDocumentContext(form,context)} disabled={busy} onApply={draft => {setForm(draft);setPdf(null);}} />}
        {phases.isError && <p role="alert" className="text-sm text-destructive">Lavorazioni non disponibili. <Button variant="outline" onClick={() => void phases.refetch()}>Riprova</Button></p>}
        <VariationEditor draft={form} setDraft={draft => {setForm(draft);setPdf(null);}} phases={phases.data ?? []} context={variationDocumentContext(form,context)} busy={busy || !editable} review={false} onBack={()=>setView(false)} persistentDraft showPdfPreview={false} error="" />
        {receipt?.workspace && <p role="status" className="text-xs text-muted-foreground">{dirty ? "Modifiche da salvare" : `Bozza salvata · versione ${receipt.workspace.revision}`}. Appunti e costi stimati restano interni.</p>}
      </> : <>
        {pdf && <div className="h-[65dvh] min-h-[380px]"><PdfBlobLivePreviewPanel key={pdf.url} renderBlobUrl={render} depsKey={pdf.url} debounceMs={0} downloadFileName={pdf.name} showDownloadOnMobile /></div>}
        {receipt?.document?.attachments.map(file => <div key={file.id} className="flex items-center justify-between gap-2 rounded-md border p-3"><span className="text-sm break-all">{file.name}</span><Button variant="outline" disabled={busy} onClick={() => void run(() => showDocument(file.id))}>Apri / scarica</Button></div>)}
        {receipt?.variation.status === "approvato" && <div className="rounded-md border p-3 space-y-2"><p className="text-sm">Approvazione {receipt.variation.approval_channel === "offline" ? "ricevuta fuori dal sistema" : "registrata online"}{receipt.variation.firmato_da ? ` · ${receipt.variation.firmato_da}` : ""}. Il PDF originale resta distinto dalla prova di approvazione.</p>{evidence.map(item=><Button key={item.id} variant="outline" disabled={busy} onClick={()=>void run(()=>showDocument(item.id))}>Copia caricata: {item.file_name}</Button>)}</div>}
        <p className="text-xs text-muted-foreground">L'originale e gli allegati sono conservati anche nei Documenti della commessa. Una modifica alla bozza richiede un nuovo PDF; i documenti precedenti non vengono sovrascritti.</p>
      </>}
      {receipt?.document && canEdit && canApprove && <details className="rounded-md border p-3"><summary className="cursor-pointer text-sm font-medium">Hai ricevuto una copia firmata?</summary><div className="space-y-3 mt-3">
        <p className="text-xs text-muted-foreground">Caricala qui. Il solo caricamento non approva la variante e non modifica il contratto.</p>
        <Label htmlFor="variation-evidence">Copia firmata · PDF fino a 10 MB</Label><Input id="variation-evidence" type="file" accept="application/pdf,.pdf" disabled={busy || dirty} onChange={event => { const file=event.target.files?.[0]; event.target.value=""; if(!file)return; const evidenceId=crypto.randomUUID(); void run(async()=>{if(file.size>10*1024*1024)throw new Error("PDF troppo grande: massimo 10 MB.");const base64=await new Promise<string>((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(String(reader.result).split(",")[1]);reader.onerror=()=>reject(new Error("File non leggibile"));reader.readAsDataURL(file);});const data=await workflow.request(id,"upload_evidence",{evidence_id:evidenceId,file_name:file.name,file_base64:base64,proposal_hash:receipt.document!.document_hash});absorb(data);setSelectedEvidence(evidenceId);});}} />
        {evidenceForDocument.map(item => <Button key={item.id} variant="outline" disabled={busy} onClick={() => void run(() => showDocument(item.id))}>Apri {item.file_name}</Button>)}
        {approval.data === true && evidenceForDocument.length > 0 && <div className="space-y-3 border-t pt-3">
          <Label htmlFor="variation-copy">Copia da registrare come approvata</Label><select id="variation-copy" className="w-full border rounded-md p-2" value={selectedEvidence} onChange={e=>{setSelectedEvidence(e.target.value);setConfirmed(false);}}><option value="">Scegli la copia</option>{evidenceForDocument.map(item=><option key={item.id} value={item.id}>{item.file_name}</option>)}</select>
          <Label htmlFor="variation-signer">Nome del firmatario</Label><Input id="variation-signer" value={signer} maxLength={200} onChange={e=>setSigner(e.target.value)} />
          <Label htmlFor="variation-signed-date">Data effettiva di firma</Label><Input id="variation-signed-date" type="date" value={signedOn} onChange={e=>setSignedOn(e.target.value)} />
          <label className="flex items-start gap-2 text-sm"><input type="checkbox" checked={confirmed} onChange={e=>setConfirmed(e.target.checked)} />Ho verificato che la copia firmata corrisponde a questa proposta e ne confermo l'approvazione.</label>
          <Button disabled={busy || dirty || !confirmed || !selectedEvidence || signer.trim().length<2 || !signedOn} onClick={()=>void run(async()=>{if(!window.confirm("Registrare l'approvazione? L'importo della variante entrerà nel valore concordato, una sola volta."))return;absorb(await workflow.request(id,"approve_offline",{evidence_id:selectedEvidence,signer_name:signer,signed_on:signedOn,confirmed}));})}>Registra approvazione ricevuta</Button>
        </div>}
        {approval.isError && <p role="alert" className="text-sm text-destructive">Permesso di approvazione non verificabile. Puoi conservare la copia, non approvarla.</p>}
      </div></details>}
      {receipt?.variation.firma_token && pending && <div className="rounded-md border p-3 space-y-2"><p className="text-sm">Link di firma · scadenza {receipt.variation.link_expires_at ? new Date(receipt.variation.link_expires_at).toLocaleDateString("it-IT") : "non disponibile"}</p><Input aria-label="Link di firma" readOnly value={`${window.location.origin}/firma-odv/${receipt.variation.firma_token}`} /><Button variant="outline" onClick={()=>void navigator.clipboard.writeText(`${window.location.origin}/firma-odv/${receipt.variation.firma_token}`).catch(()=>setError("Copia non riuscita: seleziona il link e copialo manualmente."))}>Copia link</Button></div>}
    </div>
    <DialogFooter className="shrink-0 border-t p-4 flex-wrap gap-2">
      <Button variant="outline" disabled={busy} onClick={close}>Chiudi</Button>
      {editable && <><Button variant="outline" disabled={busy} onClick={()=>void run(async()=>{await save();})}>Salva bozza</Button><Button disabled={busy} onClick={()=>void run(async()=>{prepareVariation(form);const data=dirty || !receipt ? await save() : receipt;const next=await workflow.request(id,"document",{revision:data.workspace!.revision});absorb(next);await showDocument();})}>{busy?"Operazione…":"Prepara PDF da inviare"}</Button></>}
      {editable && fresh && <Button variant="outline" disabled={busy} onClick={()=>void run(async()=>{if(!window.confirm("Hai verificato PDF e allegati? Il documento sarà bloccato e il link durerà 30 giorni. Nessuna email viene inviata ora."))return;absorb(await workflow.request(id,"publish",{revision:receipt!.workspace!.revision,document_hash:receipt!.document!.document_hash,reviewed:true}));})}>Crea link · facoltativo</Button>}
      {canEdit && receipt && ["bozza","in_attesa"].includes(receipt.variation.status) && <Button variant="ghost" disabled={busy} onClick={()=>void run(async()=>{if(window.confirm("Annullare questa proposta e revocare il link? I documenti saranno conservati."))absorb(await workflow.request(id,"cancel"));})}>Annulla proposta</Button>}
    </DialogFooter>
  </DialogContent></Dialog>;
}
