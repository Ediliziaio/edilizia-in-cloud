import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { SupabaseClient } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { withClientTimeout } from "@/lib/query-timeout";

type Operation = { id: string; kind: string; status: string; credit_eur: number | null; created_at: string;
  provider_message_id: string | null; context: { to?: string; tool_name?: string }; reviewed_at: string | null };
// New migration-backed table: keep the shape explicit until generated types are refreshed.
const db = supabase as unknown as SupabaseClient;
export function WhatsAppOperationsReview({ companyId }: { companyId: string | null | undefined }) {
  const cache = useQueryClient();
  const [selected, setSelected] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const query = useQuery({ queryKey: ["whatsapp-operation-review", companyId], enabled: !!companyId,
    refetchInterval: 30_000,
    queryFn: async () => {
      const { data: canManage, error: permissionError } = await db.rpc("puo_gestire_whatsapp", { p_company_id: companyId! });
      if (permissionError || canManage !== true) throw new Error("Registro riservato agli amministratori WhatsApp dell’azienda.");
      const { data, error } = await withClientTimeout(db.from("whatsapp_operations")
        .select("id,kind,status,credit_eur,created_at,provider_message_id,context,reviewed_at")
        .eq("company_id", companyId!).in("status", ["running", "unknown", "rejected"])
        .is("reviewed_at", null).order("created_at", { ascending: false }).limit(25), "Registro invii WhatsApp");
      if (error) throw error;
      return (data ?? []) as Operation[];
    } });
  const review = useMutation({ mutationFn: async () => {
    if (!companyId || !selected || note.trim().length < 5) throw new Error("Descrivi la verifica effettuata.");
    const { data, error } = await db.rpc("whatsapp_operation_review", { p_company: companyId, p_id: selected, p_note: note.trim() });
    if (error) throw error;
    if (data !== true) throw new Error("Operazione non disponibile per la verifica.");
  }, onSuccess: () => { setSelected(null); setNote(""); void cache.invalidateQueries({ queryKey: ["whatsapp-operation-review", companyId] }); } });
  if (!companyId) return null;
  return <section className="rounded-xl border bg-card p-3 sm:p-4 space-y-3" aria-label="Verifica invii WhatsApp">
    <div className="flex items-center justify-between gap-2">
      <h3 className="text-sm font-semibold">Invii e azioni da verificare {query.data?.length ? `(${query.data.length})` : ""}</h3>
      <Button size="sm" variant="outline" disabled={query.isFetching} onClick={() => void query.refetch()}>Aggiorna</Button>
    </div>
    <p className="text-xs text-muted-foreground">Aggiornare legge gli esiti: non reinvia messaggi e non ripete azioni.</p>
    {query.isError ? <p role="alert" className="text-xs text-destructive">Registro non disponibile. Non significa che gli invii siano riusciti.</p>
      : query.isPending ? <p className="text-xs">Caricamento…</p>
      : !query.data?.length ? <p className="text-xs text-muted-foreground">Nessuna operazione in attesa di verifica.</p>
      : query.data.map(op => <div key={op.id} className="rounded-lg border p-3 space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
          <strong>{op.kind === "send" ? `Invio a ${op.context.to ?? "contatto"}` : op.context.tool_name ?? "Azione"}</strong>
          <span>{op.status === "unknown" ? "Esito incerto" : op.status === "rejected" ? "Rifiutato" : "In corso / da riconciliare"}</span>
        </div>
        <p className="text-xs text-muted-foreground">{op.kind !== "send" ? "I costi AI sono nel registro consumi, separati dal costo di invio." : op.credit_eur != null ? `Credito registrato: ${Number(op.credit_eur).toFixed(4)} €${op.status === "rejected" && Number(op.credit_eur) > 0 ? " · rimborsato" : ""}` : "Addebito non confermato"}</p>
        {op.provider_message_id && <p className="text-xs break-all">Ricevuta: {op.provider_message_id}</p>}
        {op.status !== "running" && <Button size="sm" variant="secondary" onClick={() => { setSelected(op.id); setNote(""); }}>Registra verifica</Button>}
        {selected === op.id && <div className="flex flex-col sm:flex-row gap-2">
          <Input aria-label="Esito della verifica" placeholder="Cosa hai verificato?" value={note} onChange={e => setNote(e.target.value)} className="h-9 text-xs" />
          <Button size="sm" disabled={review.isPending || note.trim().length < 5} onClick={() => review.mutate()}>Salva nota</Button>
        </div>}
      </div>)}
    {review.isError && <p role="alert" className="text-xs text-destructive">{review.error.message}</p>}
  </section>;
}
