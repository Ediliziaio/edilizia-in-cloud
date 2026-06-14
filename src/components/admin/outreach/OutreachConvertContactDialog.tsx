import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Briefcase, Plus, Loader2 } from "lucide-react";

/**
 * Converte un contatto/lead in opportunità nella pipeline. Risolve pipeline +
 * primo stage dinamicamente (nessun id hard-coded). Inserisce in
 * marketing_opportunities (tabella esistente). Colma il gap CRITICO dell'audit.
 */

interface Contact { id: string; first_name: string; last_name: string | null; company_name: string | null; }

export function OutreachConvertContactDialog({ companyId, onCreated }: { companyId: string; onCreated?: () => void }) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [contactId, setContactId] = useState("");
  const [name, setName] = useState("");
  const [value, setValue] = useState("");
  const [busy, setBusy] = useState(false);

  const contacts = useQuery({
    queryKey: ["convert-contacts", companyId],
    enabled: open,
    queryFn: async () => {
      const { data } = await supabase.from("marketing_contacts")
        .select("id,first_name,last_name,company_name").eq("company_id", companyId)
        .order("last_activity_at", { ascending: false, nullsFirst: false }).limit(100);
      return (data ?? []) as Contact[];
    },
  });

  // Pipeline + primo stage (per posizione) della company admin
  const pipeline = useQuery({
    queryKey: ["convert-pipeline", companyId],
    enabled: open,
    queryFn: async () => {
      const { data: pls } = await supabase.from("marketing_pipelines").select("id,name").eq("company_id", companyId).limit(1);
      const pid = pls?.[0]?.id as string | undefined;
      if (!pid) return null;
      const { data: stages } = await supabase.from("marketing_pipeline_stages")
        .select("id,name,position").eq("pipeline_id", pid).order("position", { ascending: true }).limit(1);
      const st = stages?.[0];
      return st ? { pipelineId: pid, stageId: st.id as string, stageName: st.name as string } : null;
    },
  });

  const selected = contacts.data?.find((c) => c.id === contactId);
  const noPipeline = open && !pipeline.isLoading && !pipeline.data;

  async function create() {
    const finalName = (name.trim() || (selected ? `${selected.first_name} ${selected.last_name ?? ""}`.trim() : "")) || selected?.company_name || "";
    if (!contactId || !finalName) { toast.error("Scegli un contatto e dai un nome all'opportunità"); return; }
    if (!pipeline.data) { toast.error("Nessuna pipeline configurata"); return; }
    setBusy(true);
    try {
      const { error } = await supabase.from("marketing_opportunities").insert({
        company_id: companyId, contact_id: contactId, name: finalName,
        pipeline_id: pipeline.data.pipelineId, stage_id: pipeline.data.stageId,
        value: Number(value) || 0, status: "open",
      } as never);
      if (error) throw error;
      toast.success(`Opportunità "${finalName}" creata`);
      setOpen(false); setContactId(""); setName(""); setValue("");
      qc.invalidateQueries({ queryKey: ["pipeline-analytics", companyId] });
      onCreated?.();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Errore");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" className="gap-2"><Plus className="h-4 w-4" /> Crea opportunità</Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader><DialogTitle className="flex items-center gap-2"><Briefcase className="h-4 w-4" /> Lead → opportunità</DialogTitle></DialogHeader>
        {noPipeline ? (
          <p className="py-4 text-sm text-muted-foreground">Nessuna pipeline configurata per l'admin. Crea prima una pipeline e i suoi stage.</p>
        ) : (
          <div className="space-y-3">
            <div className="space-y-1">
              <Label className="text-xs">Contatto</Label>
              <Select value={contactId} onValueChange={(v) => { setContactId(v); const c = contacts.data?.find((x) => x.id === v); if (c && !name) setName(`${c.first_name} ${c.last_name ?? ""}`.trim()); }}>
                <SelectTrigger className="h-9"><SelectValue placeholder={contacts.isLoading ? "Carico…" : "Scegli contatto"} /></SelectTrigger>
                <SelectContent>
                  {(contacts.data ?? []).map((c) => <SelectItem key={c.id} value={c.id}>{c.first_name} {c.last_name ?? ""}{c.company_name ? ` · ${c.company_name}` : ""}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1"><Label className="text-xs">Nome opportunità</Label><Input value={name} onChange={(e) => setName(e.target.value)} placeholder="es. Gestionale per Rossi Srl" className="h-9" /></div>
            <div className="space-y-1"><Label className="text-xs">Valore stimato (€)</Label><Input type="number" value={value} onChange={(e) => setValue(e.target.value)} placeholder="0" className="h-9" /></div>
            {pipeline.data && <p className="text-[11px] text-muted-foreground">Entra nello stage iniziale: <strong>{pipeline.data.stageName}</strong></p>}
          </div>
        )}
        <DialogFooter>
          <Button variant="ghost" onClick={() => setOpen(false)}>Annulla</Button>
          <Button onClick={create} disabled={busy || noPipeline} className="gap-2">{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Briefcase className="h-4 w-4" />} Crea</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
