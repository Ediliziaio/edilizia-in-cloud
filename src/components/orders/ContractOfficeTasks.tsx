import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { usePermissions } from "@/hooks/usePermissions";
import { useOfficePeople } from "@/hooks/useOfficePeople";
import { CONTRACT_OFFICE_PREFIX } from "@/lib/orders/contractOfficeTasks";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PlaybookEditorDialog } from "./PlaybookEditorDialog";
import { toast } from "sonner";

interface OfficeTask { id: string; title: string; status: string; notes: string | null; assigned_to: string | null; due_date: string | null }
// New activity_scope column is not yet in generated types.
const db = supabase as any;
export function ContractOfficeTasks({ orderId }: { orderId: string }) {
  const { effectiveCompany, user } = useAuth();
  const { canEditOrders, canEditSettingsOrders } = usePermissions();
  const companyId = effectiveCompany?.id;
  const qc = useQueryClient();
  const roster = useOfficePeople(companyId);
  const [title,setTitle] = useState("");
  const [assigned,setAssigned] = useState("");
  const [adding,setAdding] = useState(false);
  const [configuring,setConfiguring] = useState(false);
  const q = useQuery({
    queryKey: ["contract-office-tasks", companyId, orderId], enabled: !!companyId && !!orderId,
    queryFn: async (): Promise<OfficeTask[]> => {
      const { data, error } = await db.from("tasks").select("id,title,status,notes,assigned_to,due_date")
        .eq("company_id",companyId!).eq("order_id",orderId).eq("activity_scope","ufficio").order("created_at");
      if (error) throw error;
      return data ?? [];
    },
  });
  const change = useMutation({
    mutationFn: async ({ id, patch }: {id?: string; patch: Record<string,unknown>}) => {
      if (!companyId || !user || !canEditOrders) throw new Error("Permessi insufficienti");
      const assignee = patch.assigned_to;
      if (assignee && !roster.people.some(p=>p.id===assignee)) throw new Error("Scegli una persona dell’ufficio di questa azienda");
      const result = id
        ? await db.from("tasks").update(patch).eq("company_id",companyId).eq("order_id",orderId).eq("activity_scope","ufficio").eq("id",id).select("id").single()
        : await db.from("tasks").insert({...patch,company_id:companyId,order_id:orderId,activity_scope:"ufficio",created_by:user.id,category:"ordini",priority:"normale",status:"da_fare"}).select("id").single();
      if(result.error) throw result.error;
    },
    onSuccess: () => { void qc.invalidateQueries({queryKey:["contract-office-tasks",companyId,orderId]}); void qc.invalidateQueries({queryKey:["tasks"]}); setAdding(false);setTitle("");setAssigned(""); },
    onError: e => toast.error("Attività non salvata",{description:e.message}),
  });
  const selectClass = "h-10 w-full rounded-md border bg-background px-2 text-sm";
  if(q.isError) return <p role="alert">Non riesco a caricare le attività d’ufficio. Riprova.</p>;
  return <Card aria-label="Attività d’ufficio"><CardHeader><CardTitle className="text-base">Ufficio · attività e responsabili</CardTitle></CardHeader><CardContent className="space-y-4 text-sm">
    <p className="text-muted-foreground">Documenti, autorizzazioni, contabilità e altre attività d’ufficio. Sono separate dalle lavorazioni e non aumentano l’avanzamento del cantiere.</p>
    {q.isLoading ? <p>Caricamento attività…</p> : !q.data?.length ? <p>Nessuna attività d’ufficio inserita.</p> : <>
      {!!q.data.filter(t=>!t.assigned_to).length && <p role="status" className="rounded border border-amber-200 bg-amber-50 p-3">{q.data.filter(t=>!t.assigned_to).length} attività da assegnare. I responsabili non sono ancora confermati.</p>}
      <ul className="space-y-4">{q.data.map(t=><li key={t.id} className="space-y-2 rounded border p-3">
        <details><summary className="cursor-pointer font-medium">{t.title.replace(CONTRACT_OFFICE_PREFIX,"")} · {t.status==="completata"?"Completata":!t.assigned_to?"Da assegnare":"Da fare"}</summary><p className="whitespace-pre-line py-2 text-muted-foreground">{t.notes}</p></details>
        <label className="block">Responsabile<select className={selectClass} aria-label={`Responsabile: ${t.title.replace(CONTRACT_OFFICE_PREFIX,"")}`} value={t.assigned_to ?? ""} disabled={!canEditOrders || change.isPending || roster.isLoading || roster.isError} onChange={e=>change.mutate({id:t.id,patch:{assigned_to:e.target.value||null}})}>
          <option value="">Da assegnare</option>{t.assigned_to && !roster.people.some(p=>p.id===t.assigned_to) && <option value={t.assigned_to}>Responsabile attuale · da verificare</option>}
          {roster.people.map(p=><option key={p.id} value={p.id}>{p.label}</option>)}
        </select></label>
        <label className="block">Scadenza da confermare<Input type="date" aria-label={`Scadenza: ${t.title.replace(CONTRACT_OFFICE_PREFIX,"")}`} value={t.due_date??""} disabled={!canEditOrders || change.isPending} onChange={e=>change.mutate({id:t.id,patch:{due_date:e.target.value||null}})} /></label>
        {canEditOrders && <Button size="sm" variant="outline" disabled={change.isPending || !t.assigned_to} onClick={()=>change.mutate({id:t.id,patch:{status:t.status==="completata"?"da_fare":"completata",completed_at:t.status==="completata"?null:new Date().toISOString()}})}>{t.status==="completata"?"Riapri attività":"Completa attività"}</Button>}
      </li>)}</ul></>}
    {roster.isError && <p role="alert">Elenco responsabili non disponibile. Riprova prima di assegnare.</p>}
    {roster.unlinked.length>0 && <details><summary className="cursor-pointer text-muted-foreground">{roster.unlinked.length} persone d’ufficio senza account collegato</summary><p className="mt-2">{roster.unlinked.map(e=>`${e.first_name} ${e.last_name}`).join(", ")}. Collega un account da Personale prima di assegnare attività nel gestionale.</p></details>}
    {canEditOrders && <Button variant="outline" onClick={()=>setAdding(!adding)}>Aggiungi attività d’ufficio</Button>}
    {adding && <div className="space-y-3 rounded border p-3"><label className="block">Attività<Input aria-label="Titolo attività d’ufficio" maxLength={160} value={title} onChange={e=>setTitle(e.target.value)} /></label><label className="block">Responsabile<select className={selectClass} aria-label="Responsabile nuova attività d’ufficio" value={assigned} onChange={e=>setAssigned(e.target.value)}><option value="">Da assegnare</option>{roster.people.map(p=><option key={p.id} value={p.id}>{p.label}</option>)}</select></label><Button disabled={title.trim().length<3 || change.isPending} onClick={()=>change.mutate({patch:{title:title.trim(),assigned_to:assigned||null}})}>{assigned?"Crea attività assegnata":"Salva da assegnare"}</Button></div>}
    {canEditSettingsOrders && <><Button variant="link" className="h-auto p-0" onClick={()=>setConfiguring(true)}>Configura il flusso di lavoro aziendale</Button><PlaybookEditorDialog open={configuring} onOpenChange={setConfiguring} companyId={companyId!} /></>}
  </CardContent></Card>;
}
