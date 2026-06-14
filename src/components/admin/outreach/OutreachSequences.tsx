import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Loader2, Plus, Trash2, Mail, MessageSquare, Phone, ChevronRight, ChevronDown, AlertTriangle, Send,
} from "lucide-react";
import { isMissingTableError, MigrationGate } from "./_shared";

/**
 * Builder cadenze (Fase 1). Tabelle outreach_sequences / outreach_sequence_steps
 * della migrazione 20270815000000: gate finché non applicata.
 */

const T_SEQ = "outreach_sequences";
const T_STEP = "outreach_sequence_steps";

interface Seq { id: string; name: string; status: string; description: string | null; created_at: string; }
interface Step { id: string; sequence_id: string; step_order: number; channel: string; delay_days: number; delay_hours: number; subject: string | null; body: string; }

const CH_ICON: Record<string, typeof Mail> = { email: Mail, whatsapp: MessageSquare, sms: Phone };
const STATUS_VARIANT: Record<string, "default" | "secondary" | "outline"> = { active: "default", draft: "outline", paused: "secondary", archived: "secondary" };

export function OutreachSequences({ companyId }: { companyId: string }) {
  const qc = useQueryClient();
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [expanded, setExpanded] = useState<string | null>(null);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = supabase as any;

  const q = useQuery({
    queryKey: ["outreach-sequences", companyId],
    retry: false,
    queryFn: async () => {
      const { data: seqs, error } = await db.from(T_SEQ).select("*").eq("company_id", companyId).order("created_at", { ascending: false });
      if (error) throw error;
      const ids = (seqs ?? []).map((s: Seq) => s.id);
      let steps: Step[] = [];
      if (ids.length) {
        const { data: st } = await db.from(T_STEP).select("*").in("sequence_id", ids).order("step_order");
        steps = (st ?? []) as Step[];
      }
      return { sequences: (seqs ?? []) as Seq[], steps };
    },
  });

  const invalidate = () => qc.invalidateQueries({ queryKey: ["outreach-sequences", companyId] });

  const createSeq = useMutation({
    mutationFn: async () => {
      const name = newName.trim();
      if (!name) throw new Error("Nome mancante");
      const { error } = await db.from(T_SEQ).insert({ company_id: companyId, name, status: "draft" });
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Sequenza creata"); setNewName(""); setCreating(false); invalidate(); },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Errore"),
  });

  const setStatus = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      const { error } = await db.from(T_SEQ).update({ status }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => invalidate(),
    onError: (e) => toast.error(e instanceof Error ? e.message : "Errore"),
  });

  const delSeq = useMutation({
    mutationFn: async (id: string) => { const { error } = await db.from(T_SEQ).delete().eq("id", id); if (error) throw error; },
    onSuccess: () => { toast.success("Sequenza eliminata"); invalidate(); },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Errore"),
  });

  if (q.isLoading) return <div className="flex items-center justify-center py-10"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>;
  if (q.error && isMissingTableError(q.error)) {
    return <MigrationGate title="Sequenze multi-step — pronto" unlocks={[
      "Cadenze G0 email → G3 follow-up → G7 WhatsApp → G12 chiusura.",
      "Iscrizione contatti e avanzamento automatico step per step.",
      "Stop automatico su risposta / opt-out / bounce.",
    ]} />;
  }
  if (q.error) return <Card><CardContent className="flex items-center gap-2 p-4 text-sm text-red-600"><AlertTriangle className="h-4 w-4" /> Errore: {q.error instanceof Error ? q.error.message : "imprevisto"}</CardContent></Card>;

  const sequences = q.data?.sequences ?? [];
  const stepsBySeq = new Map<string, Step[]>();
  for (const s of q.data?.steps ?? []) {
    const arr = stepsBySeq.get(s.sequence_id) ?? [];
    arr.push(s); stepsBySeq.set(s.sequence_id, arr);
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">Cadenze multi-step: il contatto entra e riceve lo step giusto ogni giorno.</p>
        <Button size="sm" className="h-8 gap-1" onClick={() => setCreating((v) => !v)}><Plus className="h-3.5 w-3.5" /> Nuova sequenza</Button>
      </div>

      {creating && (
        <Card><CardContent className="flex items-end gap-2 p-3">
          <div className="flex-1 space-y-1"><Label className="text-xs">Nome sequenza</Label><Input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="es. Cold edili Lombardia" className="h-8" /></div>
          <Button size="sm" className="h-8" disabled={createSeq.isPending} onClick={() => createSeq.mutate()}>{createSeq.isPending ? "…" : "Crea"}</Button>
        </CardContent></Card>
      )}

      {sequences.length === 0 && !creating && (
        <Card><CardContent className="py-8 text-center text-sm text-muted-foreground">
          Nessuna sequenza. Crea la prima cadenza per iniziare a lavorare a step invece che a blast.
        </CardContent></Card>
      )}

      {sequences.map((seq) => {
        const steps = stepsBySeq.get(seq.id) ?? [];
        const isOpen = expanded === seq.id;
        return (
          <Card key={seq.id}>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 py-3">
              <button className="flex items-center gap-2 text-left" onClick={() => setExpanded(isOpen ? null : seq.id)}>
                {isOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                <CardTitle className="text-base">{seq.name}</CardTitle>
                <Badge variant={STATUS_VARIANT[seq.status] ?? "outline"} className="text-[10px]">{seq.status}</Badge>
                <span className="text-xs text-muted-foreground">{steps.length} step</span>
              </button>
              <div className="flex items-center gap-1">
                <Select value={seq.status} onValueChange={(v) => setStatus.mutate({ id: seq.id, status: v })}>
                  <SelectTrigger className="h-7 w-[110px] text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="draft">Bozza</SelectItem><SelectItem value="active">Attiva</SelectItem>
                    <SelectItem value="paused">In pausa</SelectItem><SelectItem value="archived">Archiviata</SelectItem>
                  </SelectContent>
                </Select>
                <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-destructive" onClick={() => delSeq.mutate(seq.id)}><Trash2 className="h-3.5 w-3.5" /></Button>
              </div>
            </CardHeader>
            {isOpen && <CardContent className="space-y-2 pt-0"><SequenceSteps companyId={companyId} sequenceId={seq.id} steps={steps} onChange={invalidate} db={db} /></CardContent>}
          </Card>
        );
      })}
    </div>
  );
}

function SequenceSteps({ sequenceId, steps, onChange, db }: {
  companyId: string; sequenceId: string; steps: Step[]; onChange: () => void;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  db: any;
}) {
  const [channel, setChannel] = useState("email");
  const [delay, setDelay] = useState("0");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);

  async function addStep() {
    if (!body.trim()) { toast.error("Il corpo del messaggio è obbligatorio"); return; }
    setBusy(true);
    try {
      const nextOrder = steps.length ? Math.max(...steps.map((s) => s.step_order)) + 1 : 0;
      const { error } = await db.from(T_STEP).insert({
        sequence_id: sequenceId, step_order: nextOrder, channel,
        delay_days: Number(delay) || 0, subject: channel === "email" ? subject : null, body,
      });
      if (error) throw error;
      toast.success("Step aggiunto");
      setSubject(""); setBody(""); setDelay("0");
      onChange();
    } catch (e) { toast.error(e instanceof Error ? e.message : "Errore"); } finally { setBusy(false); }
  }

  async function delStep(id: string) {
    const { error } = await db.from(T_STEP).delete().eq("id", id);
    if (error) { toast.error(error.message); return; }
    toast.success("Step rimosso"); onChange();
  }

  return (
    <div className="space-y-2">
      {/* timeline step */}
      {steps.map((s) => {
        const Icon = CH_ICON[s.channel] ?? Mail;
        return (
          <div key={s.id} className="flex items-start gap-3 rounded-lg border p-2.5">
            <div className="flex flex-col items-center pt-0.5">
              <div className="rounded-full bg-orange-100 p-1.5"><Icon className="h-3.5 w-3.5 text-orange-600" /></div>
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 text-xs">
                <Badge variant="outline" className="text-[10px]">G+{s.delay_days}</Badge>
                <span className="font-medium uppercase text-muted-foreground">{s.channel}</span>
                {s.subject && <span className="truncate font-medium">{s.subject}</span>}
              </div>
              <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{s.body}</p>
            </div>
            <Button size="sm" variant="ghost" className="h-6 w-6 p-0 text-destructive" onClick={() => delStep(s.id)}><Trash2 className="h-3 w-3" /></Button>
          </div>
        );
      })}

      {/* add step */}
      <div className="space-y-2 rounded-lg border border-dashed bg-muted/20 p-3">
        <div className="flex flex-wrap items-end gap-2">
          <div className="space-y-1"><Label className="text-xs">Canale</Label>
            <Select value={channel} onValueChange={setChannel}><SelectTrigger className="h-8 w-[130px]"><SelectValue /></SelectTrigger>
              <SelectContent><SelectItem value="email">Email</SelectItem><SelectItem value="whatsapp">WhatsApp</SelectItem><SelectItem value="sms">SMS</SelectItem></SelectContent></Select>
          </div>
          <div className="w-24 space-y-1"><Label className="text-xs">Ritardo (gg)</Label><Input type="number" value={delay} onChange={(e) => setDelay(e.target.value)} className="h-8" /></div>
          {channel === "email" && <div className="min-w-[180px] flex-1 space-y-1"><Label className="text-xs">Oggetto</Label><Input value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="{{first_name}}, una domanda" className="h-8" /></div>}
        </div>
        <Textarea value={body} onChange={(e) => setBody(e.target.value)} rows={3} placeholder={"Ciao {{first_name}},\n…\nVariabili: {{first_name}} {{company_name}}"} className="text-xs" />
        <Button size="sm" className="h-8 gap-1" disabled={busy} onClick={addStep}><Send className="h-3.5 w-3.5" /> {busy ? "…" : "Aggiungi step"}</Button>
      </div>
    </div>
  );
}
