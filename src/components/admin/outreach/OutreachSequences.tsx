import { useRef, useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import {
  Loader2, Plus, Mail, ChevronRight, ChevronDown, AlertTriangle,
  Sparkles, Eye, Copy, LayoutTemplate, Info, Network, Pencil, Check, X, Trash2, ListPlus,
} from "lucide-react";
import { isMissingTableError, MigrationGate } from "./_shared";
import { OutreachEnrollDialog } from "./OutreachEnrollDialog";
import { OutreachSequenceFlowBuilder } from "./OutreachSequenceFlowBuilder";
import { OutreachSequenceStats } from "./OutreachSequenceStats";
import { OutreachAbzPanel } from "./OutreachAbzPanel";
import { OutreachVarChips } from "./OutreachVarChips";
import {
  SequenceStepCard, WaitConnector, TimelineStartCap, TimelineEndCap, TimelineAddRow,
} from "./SequenceTimeline";
import { CH_ICON, CH_ACCENT, delayLabel, type TimelineStep } from "./sequenceShared";
import { renderTemplate, contactToVars, hashSeed } from "../../../../supabase/functions/_shared/outreach-template";
import { parseVariants } from "../../../../supabase/functions/_shared/outreach-abz";
import { spamScore } from "../../../../supabase/functions/_shared/outreach-spam-score";

const PREVIEW_SAMPLE = { first_name: "Mario", last_name: "Rossi", company_name: "Rossi Costruzioni", email: "mario@rossi.it" };

/**
 * Builder cadenze (Fase 1). Tabelle outreach_sequences / outreach_sequence_steps
 * della migrazione 20270815000000: gate finché non applicata.
 */

const T_SEQ = "outreach_sequences";
const T_STEP = "outreach_sequence_steps";

interface Seq { id: string; name: string; status: string; description: string | null; created_at: string; brand_id: string | null; track_opens?: boolean | null; }
interface Step { id: string; sequence_id: string; step_order: number; channel: string; delay_days: number; delay_hours: number; subject: string | null; body: string; }

// Pallino di stato sequenza (Instantly-style health dot): bozza grigio / attiva verde.
const STATUS_DOT: Record<string, string> = {
  active: "bg-emerald-500",
  draft: "bg-muted-foreground/40",
  paused: "bg-amber-500",
  archived: "bg-muted-foreground/30",
};
const STATUS_LABEL: Record<string, string> = { draft: "Bozza", active: "Attiva", paused: "In pausa", archived: "Archiviata" };

// Template cadenze pronte (cold B2B edilizia). delay_days = giorni dall'iscrizione.
interface TplStep { channel: string; delay_days: number; subject?: string; body: string }
const TEMPLATES: { name: string; desc: string; steps: TplStep[] }[] = [
  {
    name: "Cold 3 step (soft)",
    desc: "Apertura + 2 follow-up gentili. Ideale per partire.",
    steps: [
      { channel: "email", delay_days: 0, subject: "Domanda veloce su {{company_name|la vostra impresa}}", body: "{Ciao|Salve} {{first_name|}},\n\nho visto il lavoro di {{company_name|la vostra impresa}} e mi chiedevo come gestite oggi fatturazione, DDT e cantieri.\n\nHa senso una chiacchierata di 10 minuti?" },
      { channel: "email", delay_days: 3, subject: "Re: {{company_name|la vostra impresa}}", body: "{{first_name|}}, ci ho pensato: credo possiamo farvi risparmiare ore ogni settimana sulla parte amministrativa di cantiere.\n\nLe va un confronto rapido questa settimana?" },
      { channel: "email", delay_days: 6, subject: "Chiudo il cerchio", body: "{{first_name|}}, non voglio insistere. Se il tema non è prioritario ora nessun problema — mi dica pure e la lascio in pace. Altrimenti sono qui." },
    ],
  },
  {
    name: "Cold 4 step + caso studio",
    desc: "Apertura, valore, prova sociale, chiusura.",
    steps: [
      { channel: "email", delay_days: 0, subject: "{{first_name|}}, un'idea per {{company_name|la vostra impresa}}", body: "{Ciao|Salve} {{first_name|}},\n\nlavoriamo con imprese edili come {{company_name|la vostra}} per togliere ore di lavoro manuale su fatture e cantieri. Le interessa capire come?" },
      { channel: "email", delay_days: 2, subject: "Come funziona in pratica", body: "{{first_name|}}, in pratica: fatturazione elettronica, DDT, preventivi e cantieri in un unico posto. Niente più fogli Excel sparsi.\n\nLe mando un breve esempio?" },
      { channel: "email", delay_days: 5, subject: "Un'impresa simile alla vostra", body: "{{first_name|}}, un'impresa edile come la vostra ha ridotto del 70% il tempo di fatturazione. Posso raccontarle come in 10 minuti." },
      { channel: "email", delay_days: 9, subject: "Ultima — poi la lascio in pace", body: "{{first_name|}}, capisco che possa non essere il momento. Le lascio il contatto: quando vorrà, sono qui." },
    ],
  },
];

export function OutreachSequences({ companyId }: { companyId: string }) {
  const qc = useQueryClient();
  const [creating, setCreating] = useState(false);
  const [templateOpen, setTemplateOpen] = useState(false);
  const [aiOpen, setAiOpen] = useState(false);
  const [aiAngle, setAiAngle] = useState("");
  const [newName, setNewName] = useState("");
  const [expanded, setExpanded] = useState<string | null>(null);
  // Sequenza aperta nel builder visuale a nodi (dialog fullscreen).
  const [flowSeq, setFlowSeq] = useState<Seq | null>(null);

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

  const brands = useQuery({
    queryKey: ["outreach-brands", companyId],
    retry: false,
    queryFn: async () => {
      const { data } = await db.from("outreach_brands").select("id,name").eq("company_id", companyId).order("name");
      return (data ?? []) as { id: string; name: string }[];
    },
  });

  const setBrand = useMutation({
    mutationFn: async ({ id, brandId }: { id: string; brandId: string | null }) => {
      const { error } = await db.from(T_SEQ).update({ brand_id: brandId }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => invalidate(),
    onError: (e) => toast.error(e instanceof Error ? e.message : "Errore"),
  });

  // Toggle open-tracking per-sequenza (default OFF). Salva outreach_sequences.track_opens:
  // il dispatcher inietta il pixel SOLO quando true. Tooltip di avviso deliverability.
  const setTrackOpens = useMutation({
    mutationFn: async ({ id, value }: { id: string; value: boolean }) => {
      const { error } = await db.from(T_SEQ).update({ track_opens: value }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: (_res, vars) => { toast.success(vars.value ? "Tracking aperture attivo" : "Tracking aperture disattivato"); invalidate(); },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Errore"),
  });

  // Rinomina sequenza (header inline).
  const renameSeq = useMutation({
    mutationFn: async ({ id, name }: { id: string; name: string }) => {
      const n = name.trim();
      if (!n) throw new Error("Nome mancante");
      const { error } = await db.from(T_SEQ).update({ name: n }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Nome aggiornato"); invalidate(); },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Errore"),
  });

  const createSeq = useMutation({
    mutationFn: async () => {
      const name = newName.trim();
      if (!name) throw new Error("Nome mancante");
      const { data: created, error } = await db.from(T_SEQ).insert({ company_id: companyId, name, status: "draft" }).select("id").single();
      if (error) throw error;
      return created?.id as string | undefined;
    },
    onSuccess: (id) => { toast.success("Sequenza creata"); setNewName(""); setCreating(false); if (id) setExpanded(id); invalidate(); },
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

  // Duplica sequenza + i suoi step (fetch fresco degli step, niente dipendenza da closure)
  const dupSeq = useMutation({
    mutationFn: async (seq: Seq) => {
      const { data: created, error } = await db.from(T_SEQ)
        .insert({ company_id: companyId, name: `${seq.name} (copia)`, status: "draft", brand_id: seq.brand_id, description: seq.description })
        .select("id").single();
      if (error) throw error;
      const { data: origSteps } = await db.from(T_STEP).select("*").eq("sequence_id", seq.id).order("step_order");
      if (origSteps?.length) {
        const rows = origSteps.map((s: Step) => ({
          sequence_id: created.id, step_order: s.step_order, channel: s.channel,
          delay_days: s.delay_days, delay_hours: s.delay_hours, subject: s.subject, body: s.body,
        }));
        const { error: sErr } = await db.from(T_STEP).insert(rows);
        if (sErr) throw sErr;
      }
    },
    onSuccess: () => { toast.success("Sequenza duplicata"); invalidate(); },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Errore"),
  });

  // Crea una sequenza completa da un template (cadenza + step preimpostati)
  const createFromTemplate = useMutation({
    mutationFn: async (tpl: typeof TEMPLATES[number]) => {
      const { data: created, error } = await db.from(T_SEQ)
        .insert({ company_id: companyId, name: tpl.name, status: "draft" }).select("id").single();
      if (error) throw error;
      const rows = tpl.steps.map((s, i) => ({
        sequence_id: created.id, step_order: i, channel: s.channel,
        delay_days: s.delay_days, delay_hours: 0, subject: s.subject ?? null, body: s.body,
      }));
      const { error: sErr } = await db.from(T_STEP).insert(rows);
      if (sErr) throw sErr;
      return created.id as string;
    },
    onSuccess: (id) => { toast.success("Sequenza creata da template"); setTemplateOpen(false); setExpanded(id); invalidate(); },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Errore"),
  });

  // Genera una cadenza intera con l'AI (edge outreach-ai-sequence) a partire da
  // un "angle", poi la materializza nel DB come una sequenza in bozza + i suoi
  // step (stesso pattern di createFromTemplate). L'utente la rivede ed edita.
  const generateWithAi = useMutation({
    mutationFn: async (angle: string) => {
      const { data, error } = await supabase.functions.invoke("outreach-ai-sequence", {
        body: { angle, steps: 3 },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      const steps = (data?.steps ?? []) as { delay_days: number; subject: string; body: string }[];
      if (!steps.length) throw new Error("Nessuna sequenza generata");

      const { data: created, error: cErr } = await db.from(T_SEQ)
        .insert({ company_id: companyId, name: String(data.name || "Cadenza AI").slice(0, 120), status: "draft" })
        .select("id").single();
      if (cErr) throw cErr;
      const rows = steps.map((s, i) => ({
        sequence_id: created.id, step_order: i, channel: "email",
        delay_days: Number(s.delay_days) || 0, delay_hours: 0,
        subject: s.subject ?? null, body: s.body ?? "",
      }));
      const { error: sErr } = await db.from(T_STEP).insert(rows);
      if (sErr) throw sErr;
      return created.id as string;
    },
    onSuccess: (id) => {
      toast.success("Sequenza generata con AI");
      setAiOpen(false); setAiAngle(""); setExpanded(id); invalidate();
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Errore AI"),
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
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground">Cadenze multi-step: il contatto entra e riceve lo step giusto ogni giorno.</p>
        <div className="flex shrink-0 items-center gap-1.5">
          <Button size="sm" variant="outline" className="h-8 gap-1" onClick={() => { setAiOpen((v) => !v); setTemplateOpen(false); setCreating(false); }}><Sparkles className="h-3.5 w-3.5" /> Genera con AI</Button>
          <Button size="sm" variant="outline" className="h-8 gap-1" onClick={() => { setTemplateOpen((v) => !v); setAiOpen(false); setCreating(false); }}><LayoutTemplate className="h-3.5 w-3.5" /> Da template</Button>
          <Button size="sm" className="h-8 gap-1" onClick={() => { setCreating((v) => !v); setTemplateOpen(false); setAiOpen(false); }}><Plus className="h-3.5 w-3.5" /> Nuova sequenza</Button>
        </div>
      </div>

      {aiOpen && (
        <Card className="border-primary/25 bg-primary/[0.04]"><CardContent className="space-y-2 p-4">
          <div className="flex items-end gap-2">
            <div className="flex-1 space-y-1">
              <Label className="text-[11px] uppercase tracking-wide text-muted-foreground">Angolo della cadenza</Label>
              <Input
                value={aiAngle}
                onChange={(e) => setAiAngle(e.target.value)}
                placeholder="es. risparmio su fatturazione e gestione cantieri"
                className="h-9"
                disabled={generateWithAi.isPending}
                onKeyDown={(e) => { if (e.key === "Enter" && !generateWithAi.isPending) generateWithAi.mutate(aiAngle.trim()); }}
              />
            </div>
            <Button size="sm" className="h-9 gap-1" disabled={generateWithAi.isPending} onClick={() => generateWithAi.mutate(aiAngle.trim())}>
              {generateWithAi.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
              {generateWithAi.isPending ? "Genero…" : "Genera"}
            </Button>
          </div>
          <p className="text-[11px] text-muted-foreground">L'AI crea una cadenza di 3 email (apertura + 2 follow-up) come bozza, con variabili e spintax. Potrai rivederla ed editarla prima di attivarla.</p>
        </CardContent></Card>
      )}

      {templateOpen && (
        <div className="grid gap-2.5 sm:grid-cols-2">
          {TEMPLATES.map((tpl) => (
            <Card key={tpl.name} className="flex flex-col rounded-xl transition-shadow hover:shadow-md">
              <CardContent className="flex flex-1 flex-col gap-2.5 p-5">
                <div className="flex items-center gap-2">
                  <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary/10 text-primary"><LayoutTemplate className="h-4 w-4" /></div>
                  <span className="text-base font-semibold">{tpl.name}</span>
                </div>
                <p className="text-sm text-muted-foreground">{tpl.desc}</p>
                <CadenceStrip steps={tpl.steps} />
                <Button size="sm" className="mt-auto h-9 w-full" disabled={createFromTemplate.isPending} onClick={() => createFromTemplate.mutate(tpl)}>
                  {createFromTemplate.isPending ? "…" : `Usa questo (${tpl.steps.length} step)`}
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {creating && (
        <Card className="rounded-xl border-primary/30"><CardContent className="flex items-end gap-2 p-4">
          <div className="flex-1 space-y-1"><Label className="text-[11px] uppercase tracking-wide text-muted-foreground">Nome sequenza</Label><Input autoFocus value={newName} onChange={(e) => setNewName(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && !createSeq.isPending) createSeq.mutate(); }} placeholder="es. Cold edili Lombardia" className="h-9" /></div>
          <Button size="sm" className="h-9" disabled={createSeq.isPending} onClick={() => createSeq.mutate()}>{createSeq.isPending ? "…" : "Crea"}</Button>
        </CardContent></Card>
      )}

      {sequences.length === 0 && !creating && (
        <Card className="rounded-xl border-dashed">
          <CardContent className="flex flex-col items-center gap-3 py-12 text-center">
            <div className="rounded-2xl bg-primary/10 p-3.5 text-primary"><ListPlus className="h-6 w-6" /></div>
            <div className="space-y-1">
              <p className="text-base font-semibold">Nessuna sequenza</p>
              <p className="mx-auto max-w-md text-sm text-muted-foreground">Crea la prima cadenza per lavorare a step invece che a blast: apertura, follow-up e chiusura, in automatico.</p>
            </div>
            <div className="flex flex-wrap items-center justify-center gap-2 pt-1">
              <Button size="sm" className="h-9 gap-1" onClick={() => { setCreating(true); setTemplateOpen(false); setAiOpen(false); }}><Plus className="h-3.5 w-3.5" /> Nuova sequenza</Button>
              <Button size="sm" variant="outline" className="h-9 gap-1" onClick={() => { setTemplateOpen(true); setAiOpen(false); setCreating(false); }}><LayoutTemplate className="h-3.5 w-3.5" /> Parti da un template</Button>
            </div>
          </CardContent>
        </Card>
      )}

      {sequences.map((seq) => {
        const steps = stepsBySeq.get(seq.id) ?? [];
        const isOpen = expanded === seq.id;
        return (
          <Card key={seq.id} className={`overflow-hidden rounded-xl transition-shadow ${isOpen ? "shadow-md ring-1 ring-border" : "hover:shadow-sm"}`}>
            <SequenceHeader
              seq={seq}
              steps={steps}
              isOpen={isOpen}
              onToggle={() => setExpanded(isOpen ? null : seq.id)}
              onRename={(name) => renameSeq.mutate({ id: seq.id, name })}
              brands={brands.data ?? []}
              onSetBrand={(brandId) => setBrand.mutate({ id: seq.id, brandId })}
              onSetStatus={(status) => setStatus.mutate({ id: seq.id, status })}
              onOpenFlow={() => setFlowSeq(seq)}
              onDuplicate={() => dupSeq.mutate(seq)}
              onDelete={() => delSeq.mutate(seq.id)}
              dupPending={dupSeq.isPending}
              companyId={companyId}
              onEnrolled={invalidate}
            />
            {isOpen && (
              <CardContent className="space-y-3 border-t bg-muted/30 pt-4">
                <TrackOpensToggle
                  checked={seq.track_opens === true}
                  pending={setTrackOpens.isPending}
                  onChange={(value) => setTrackOpens.mutate({ id: seq.id, value })}
                />
                <OutreachSequenceStats sequenceId={seq.id} />
                <OutreachAbzPanel sequenceId={seq.id} steps={steps} onApplied={invalidate} />
                <SequenceSteps companyId={companyId} sequenceId={seq.id} steps={steps} onChange={invalidate} db={db} />
              </CardContent>
            )}
          </Card>
        );
      })}

      {flowSeq && (
        <OutreachSequenceFlowBuilder
          open={!!flowSeq}
          onClose={() => setFlowSeq(null)}
          sequenceId={flowSeq.id}
          sequenceName={flowSeq.name}
          trackOpens={flowSeq.track_opens === true}
        />
      )}
    </div>
  );
}

/**
 * Header sequenza ridisegnato: nome editabile inline, badge stato, conteggio step
 * e mini-timeline; toolbar ordinata (Brand · Arruola · stato · Builder visuale ·
 * duplica · elimina). Mantiene tutte le azioni originali invariate.
 */
function SequenceHeader({
  seq, steps, isOpen, onToggle, onRename, brands, onSetBrand, onSetStatus, onOpenFlow, onDuplicate, onDelete, dupPending, companyId, onEnrolled,
}: {
  seq: Seq; steps: Step[]; isOpen: boolean; onToggle: () => void; onRename: (name: string) => void;
  brands: { id: string; name: string }[]; onSetBrand: (brandId: string | null) => void; onSetStatus: (status: string) => void;
  onOpenFlow: () => void; onDuplicate: () => void; onDelete: () => void; dupPending: boolean;
  companyId: string; onEnrolled: () => void;
}) {
  // L'editor del nome è "non controllato" dall'esterno: `name` viene inizializzato
  // al valore corrente nel momento in cui si entra in modifica (openEdit), così
  // niente sincronizzazione via effect (no setState-in-effect).
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(seq.name);

  function openEdit() { setName(seq.name); setEditing(true); }
  function cancelEdit() { setEditing(false); }
  function commit() {
    const n = name.trim();
    if (n && n !== seq.name) onRename(n);
    setEditing(false);
  }

  const ordered = [...steps].sort((a, b) => a.step_order - b.step_order);

  return (
    <div className="flex flex-col gap-2.5 p-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex min-w-0 flex-1 items-center gap-2.5">
        <button className="shrink-0 rounded-md p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground" onClick={onToggle} aria-label={isOpen ? "Comprimi" : "Espandi"}>
          {isOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
        </button>
        <div className="min-w-0 flex-1">
          {editing ? (
            <div className="flex items-center gap-1">
              <Input
                autoFocus value={name} onChange={(e) => setName(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") commit(); if (e.key === "Escape") cancelEdit(); }}
                onBlur={commit}
                className="h-8 max-w-[280px] text-sm font-semibold"
              />
              <Button size="sm" variant="ghost" className="h-8 w-8 p-0 text-emerald-600" onMouseDown={(e) => e.preventDefault()} onClick={commit}><Check className="h-3.5 w-3.5" /></Button>
            </div>
          ) : (
            <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
              <button className="group flex items-center gap-1.5 text-left" onClick={openEdit} title="Rinomina sequenza">
                <span className="truncate text-base font-semibold">{seq.name}</span>
                <Pencil className="h-3 w-3 shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
              </button>
              <span className="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground" title={`Stato: ${STATUS_LABEL[seq.status] ?? seq.status}`}>
                <span className={`h-2 w-2 rounded-full ${STATUS_DOT[seq.status] ?? STATUS_DOT.draft}`} />
                {STATUS_LABEL[seq.status] ?? seq.status}
              </span>
              <span className="text-muted-foreground/40">·</span>
              <span className="text-xs text-muted-foreground">{steps.length} {steps.length === 1 ? "step" : "step"}</span>
              {ordered.length > 0 && <ChannelMix steps={ordered} />}
            </div>
          )}
          {/* Numeri vivi anche a card CHIUSA: prima per vedere iscritti/risposte
              bisognava espandere ogni sequenza (i dati vivevano solo dentro). */}
          {!isOpen && !editing && <OutreachSequenceStats sequenceId={seq.id} compact />}
        </div>
      </div>
      <div className="flex shrink-0 flex-wrap items-center gap-1.5">
        <Select value={seq.brand_id || "none"} onValueChange={(v) => onSetBrand(v === "none" ? null : v)}>
          <SelectTrigger className="h-8 w-[120px] text-xs" title="Brand: il pool di domini da cui spedisce questa sequenza"><SelectValue placeholder="Brand" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="none">— brand —</SelectItem>
            {brands.map((b) => <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>)}
          </SelectContent>
        </Select>
        <OutreachEnrollDialog
          companyId={companyId}
          sequenceId={seq.id}
          sequenceName={seq.name}
          emailStepCount={steps.filter((s) => s.channel === "email").length}
          onEnrolled={onEnrolled}
        />
        <Select value={seq.status} onValueChange={onSetStatus}>
          <SelectTrigger className="h-8 w-[104px] text-xs"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="draft">Bozza</SelectItem><SelectItem value="active">Attiva</SelectItem>
            <SelectItem value="paused">In pausa</SelectItem><SelectItem value="archived">Archiviata</SelectItem>
          </SelectContent>
        </Select>
        <Button size="sm" variant="outline" className="h-8 gap-1 text-xs" title="Apri il builder visuale a nodi (flussi if/then)" onClick={onOpenFlow}><Network className="h-3.5 w-3.5" /> Builder visuale</Button>
        <Button size="sm" variant="ghost" className="h-8 w-8 p-0" title="Duplica sequenza" disabled={dupPending} onClick={onDuplicate}><Copy className="h-3.5 w-3.5" /></Button>
        <Button size="sm" variant="ghost" className="h-8 w-8 p-0 text-destructive" title="Elimina sequenza" onClick={onDelete}><Trash2 className="h-3.5 w-3.5" /></Button>
      </div>
    </div>
  );
}

/**
 * Mini-strip canali della cadenza nell'header (anteprima "forma" della sequenza,
 * stile Instantly): piccoli pallini-icona del canale di ogni step, compattati.
 * Mostra fino a 6 step; oltre, un "+N". Pure-presentational.
 */
function ChannelMix({ steps }: { steps: { channel: string }[] }) {
  const shown = steps.slice(0, 6);
  const extra = steps.length - shown.length;
  return (
    <span className="hidden items-center gap-1 sm:inline-flex" title="Canali della cadenza, in ordine">
      {shown.map((s, i) => {
        const Icon = CH_ICON[s.channel] ?? Mail;
        const accent = CH_ACCENT[s.channel] ?? CH_ACCENT.email;
        return (
          <span key={i} className={`flex h-5 w-5 items-center justify-center rounded-md ${accent.wrap} ${accent.text}`}>
            <Icon className="h-3 w-3" />
          </span>
        );
      })}
      {extra > 0 && <span className="text-[10px] font-medium text-muted-foreground">+{extra}</span>}
    </span>
  );
}

/**
 * Toggle "Traccia aperture" per-sequenza (default OFF). Quando attivo, il
 * dispatcher inietta un pixel 1×1 firmato nelle email della sequenza. Avviso
 * esplicito sulla deliverability: nel cold il pixel può ridurre la consegna.
 */
function TrackOpensToggle({ checked, pending, onChange }: {
  checked: boolean;
  pending: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <div className={`flex items-start justify-between gap-3 rounded-xl border p-3 transition-colors ${checked ? "border-primary/30 bg-primary/[0.04]" : "bg-card"}`}>
      <div className="min-w-0 space-y-0.5">
        <div className="flex items-center gap-1.5">
          <Eye className={`h-3.5 w-3.5 ${checked ? "text-primary" : "text-muted-foreground"}`} />
          <span className="text-xs font-medium">Traccia aperture</span>
          <TooltipProvider delayDuration={150}>
            <Tooltip>
              <TooltipTrigger asChild>
                <button type="button" className="text-muted-foreground/70 hover:text-muted-foreground" aria-label="Avviso sul tracking aperture">
                  <Info className="h-3.5 w-3.5" />
                </button>
              </TooltipTrigger>
              <TooltipContent side="top" className="max-w-[260px] text-[11px]">
                Il pixel di tracking può ridurre la consegna nel cold — attiva solo se necessario.
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>
        <p className="text-[11px] text-muted-foreground">
          Inserisce un pixel 1×1 per sapere se l'email è stata aperta. Disattivo di default.
        </p>
      </div>
      <Switch
        checked={checked}
        disabled={pending}
        onCheckedChange={onChange}
        aria-label="Traccia aperture email di questa sequenza"
      />
    </div>
  );
}

/**
 * Strip compatta della cadenza per l'ANTEPRIMA dei template (riga orizzontale di
 * pallini-canale con il giorno sotto). Usata solo nelle card template; il dettaglio
 * della sequenza usa invece la timeline verticale (vedi SequenceSteps).
 */
function CadenceStrip({ steps }: { steps: { channel: string; delay_days: number; delay_hours?: number }[] }) {
  const ordered = [...steps].sort((a, b) => a.delay_days - b.delay_days);
  if (ordered.length === 0) return null;
  return (
    <div className="flex items-stretch gap-1 overflow-x-auto rounded-lg border bg-muted/30 p-2.5">
      {ordered.map((s, i) => {
        const Icon = CH_ICON[s.channel] ?? Mail;
        const accent = CH_ACCENT[s.channel] ?? CH_ACCENT.email;
        return (
          <div key={i} className="flex items-center gap-1">
            {i > 0 && <div className="h-px w-5 shrink-0 bg-border" />}
            <div className="flex shrink-0 flex-col items-center gap-1">
              <div className={`flex h-8 w-8 items-center justify-center rounded-lg ${accent.wrap} ${accent.text}`}>
                <Icon className="h-4 w-4" />
              </div>
              <span className="text-[10px] text-muted-foreground">{delayLabel(s.delay_days, s.delay_hours)}</span>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// Stato del form/editor inline di uno step.
interface StepDraft { channel: string; delay_days: string; delay_hours: string; subject: string; body: string }

function emptyDraft(): StepDraft {
  return { channel: "email", delay_days: "0", delay_hours: "0", subject: "", body: "" };
}
function draftFromStep(s: Step): StepDraft {
  return {
    channel: s.channel,
    delay_days: String(s.delay_days ?? 0),
    delay_hours: String(s.delay_hours ?? 0),
    subject: s.subject ?? "",
    body: s.body ?? "",
  };
}

function SequenceSteps({ sequenceId, steps, onChange, db }: {
  companyId: string; sequenceId: string; steps: Step[]; onChange: () => void;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  db: any;
}) {
  // Editing per-step (id dello step in modifica) oppure "new" per la bozza di aggiunta.
  const [editingId, setEditingId] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  const ordered = [...steps].sort((a, b) => a.step_order - b.step_order);

  async function saveExisting(id: string, draft: StepDraft) {
    if (!draft.body.trim()) { toast.error("Il corpo del messaggio è obbligatorio"); return; }
    setBusyId(id);
    try {
      const { error } = await db.from(T_STEP).update({
        channel: draft.channel,
        delay_days: Number(draft.delay_days) || 0,
        delay_hours: Number(draft.delay_hours) || 0,
        subject: draft.channel === "email" ? (draft.subject || null) : null,
        body: draft.body,
      }).eq("id", id);
      if (error) throw error;
      toast.success("Step aggiornato");
      setEditingId(null);
      onChange();
    } catch (e) { toast.error(e instanceof Error ? e.message : "Errore"); } finally { setBusyId(null); }
  }

  async function addNew(draft: StepDraft) {
    if (!draft.body.trim()) { toast.error("Il corpo del messaggio è obbligatorio"); return; }
    setBusyId("new");
    try {
      const nextOrder = steps.length ? Math.max(...steps.map((s) => s.step_order)) + 1 : 0;
      const { error } = await db.from(T_STEP).insert({
        sequence_id: sequenceId, step_order: nextOrder, channel: draft.channel,
        delay_days: Number(draft.delay_days) || 0, delay_hours: Number(draft.delay_hours) || 0,
        subject: draft.channel === "email" ? (draft.subject || null) : null, body: draft.body,
      });
      if (error) throw error;
      toast.success("Step aggiunto");
      setAdding(false);
      onChange();
    } catch (e) { toast.error(e instanceof Error ? e.message : "Errore"); } finally { setBusyId(null); }
  }

  async function delStep(id: string) {
    setBusyId(id);
    try {
      const { error } = await db.from(T_STEP).delete().eq("id", id);
      if (error) throw error;
      toast.success("Step rimosso");
      if (editingId === id) setEditingId(null);
      onChange();
    } catch (e) { toast.error(e instanceof Error ? e.message : "Errore"); } finally { setBusyId(null); }
  }

  async function duplicateStep(s: Step) {
    setBusyId(s.id);
    try {
      const nextOrder = steps.length ? Math.max(...steps.map((x) => x.step_order)) + 1 : 0;
      const { error } = await db.from(T_STEP).insert({
        sequence_id: sequenceId, step_order: nextOrder, channel: s.channel,
        delay_days: s.delay_days, delay_hours: s.delay_hours, subject: s.subject, body: s.body,
      });
      if (error) throw error;
      toast.success("Step duplicato");
      onChange();
    } catch (e) { toast.error(e instanceof Error ? e.message : "Errore"); } finally { setBusyId(null); }
  }

  // Riordina scambiando lo step_order con il vicino. UNIQUE(sequence_id, step_order):
  // si passa da un valore temporaneo alto per non collidere durante lo swap.
  async function move(index: number, dir: -1 | 1) {
    const a = ordered[index];
    const b = ordered[index + dir];
    if (!a || !b) return;
    setBusyId(a.id);
    try {
      const TMP = 1_000_000;
      let r = await db.from(T_STEP).update({ step_order: TMP }).eq("id", a.id);
      if (r.error) throw r.error;
      r = await db.from(T_STEP).update({ step_order: a.step_order }).eq("id", b.id);
      if (r.error) throw r.error;
      r = await db.from(T_STEP).update({ step_order: b.step_order }).eq("id", a.id);
      if (r.error) throw r.error;
      onChange();
    } catch (e) { toast.error(e instanceof Error ? e.message : "Errore"); } finally { setBusyId(null); }
  }

  // Quick-edit del ritardo di uno step direttamente dal pill-connettore della
  // timeline. Il ritardo nel modello è ASSOLUTO (giorni dall'iscrizione): per il
  // pill TRA lo step i e i+1 si imposta delay assoluto di i+1 = delay di i + delta.
  async function saveDelay(id: string, delayDays: number, delayHours: number) {
    setBusyId(id);
    try {
      const { error } = await db.from(T_STEP).update({
        delay_days: Math.max(0, Math.trunc(delayDays)),
        delay_hours: Math.max(0, Math.trunc(delayHours)),
      }).eq("id", id);
      if (error) throw error;
      onChange();
    } catch (e) { toast.error(e instanceof Error ? e.message : "Errore"); } finally { setBusyId(null); }
  }

  return (
    <div className="space-y-2.5">
      <div className="flex items-center justify-between">
        <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Step della cadenza</span>
        {ordered.length > 0 && <span className="text-[10px] text-muted-foreground">{ordered.length} step · clicca una card per modificare</span>}
      </div>

      {ordered.length === 0 && !adding ? (
        <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed bg-card p-8 text-center">
          <div className="rounded-2xl bg-primary/10 p-3 text-primary"><Mail className="h-5 w-5" /></div>
          <div className="space-y-0.5">
            <p className="text-sm font-medium">Ancora nessuno step</p>
            <p className="text-xs text-muted-foreground">Aggiungi il primo messaggio della cadenza per partire.</p>
          </div>
          <Button size="sm" className="h-8 gap-1.5" onClick={() => { setEditingId(null); setAdding(true); }}>
            <Plus className="h-4 w-4" /> Aggiungi primo step
          </Button>
        </div>
      ) : (
        <div className="rounded-xl border border-border bg-card p-4">
          {ordered.length > 0 && <TimelineStartCap label={delayLabel(ordered[0].delay_days, ordered[0].delay_hours)} />}
          {ordered.length > 0 && (
            <WaitConnector
              deltaDays={ordered[0].delay_days}
              deltaHours={ordered[0].delay_hours}
              onEditDelay={(d, h) => saveDelay(ordered[0].id, d, h)}
            />
          )}

          {ordered.map((s, i) => {
            const prev = ordered[i - 1];
            const isLast = i === ordered.length - 1;
            return (
              <div key={s.id}>
                {i > 0 && (
                  <WaitConnector
                    deltaDays={Math.max(0, s.delay_days - (prev?.delay_days ?? 0))}
                    deltaHours={Math.max(0, (s.delay_hours ?? 0) - (prev?.delay_hours ?? 0))}
                    onEditDelay={(d, h) => saveDelay(s.id, (prev?.delay_days ?? 0) + d, (prev?.delay_hours ?? 0) + h)}
                  />
                )}
                {editingId === s.id ? (
                  <div className="py-1">
                    <StepEditor
                      initial={draftFromStep(s)}
                      busy={busyId === s.id}
                      onSave={(d) => saveExisting(s.id, d)}
                      onCancel={() => setEditingId(null)}
                      title={`Modifica step ${i + 1}`}
                    />
                  </div>
                ) : (
                  <SequenceStepCard
                    step={s as TimelineStep}
                    index={i}
                    total={ordered.length}
                    busy={busyId === s.id}
                    isLast={isLast && !adding}
                    onEdit={() => { setAdding(false); setEditingId(s.id); }}
                    onDuplicate={() => duplicateStep(s)}
                    onDelete={() => delStep(s.id)}
                    onMoveUp={() => move(i, -1)}
                    onMoveDown={() => move(i, 1)}
                  />
                )}
              </div>
            );
          })}

          {adding ? (
            <div className="pt-3">
              <StepEditor
                initial={emptyDraft()}
                busy={busyId === "new"}
                onSave={addNew}
                onCancel={() => setAdding(false)}
                title={`Nuovo step ${ordered.length + 1}`}
              />
            </div>
          ) : ordered.length > 0 ? (
            <>
              <WaitConnector deltaDays={0} />
              <TimelineAddRow onAdd={() => { setEditingId(null); setAdding(true); }} />
              <div className="pt-2"><TimelineEndCap /></div>
            </>
          ) : null}
        </div>
      )}
    </div>
  );
}

/**
 * Editor inline di uno step (nuovo o esistente): canale, ritardo (giorni/ore con
 * stepper), oggetto (solo email), corpo con chip variabili cliccabili + spintax +
 * variante A/Z (separatore ===), "Genera con AI" e anteprima live opzionale.
 * Stato locale: il salvataggio è demandato al chiamante (insert vs update).
 */
function StepEditor({
  initial, busy, onSave, onCancel, title,
}: {
  initial: StepDraft; busy: boolean; onSave: (draft: StepDraft) => void; onCancel: () => void; title: string;
}) {
  const [channel, setChannel] = useState(initial.channel);
  const [delayDays, setDelayDays] = useState(initial.delay_days);
  const [delayHours, setDelayHours] = useState(initial.delay_hours);
  const [subject, setSubject] = useState(initial.subject);
  const [body, setBody] = useState(initial.body);
  const [aiBusy, setAiBusy] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const [activeField, setActiveField] = useState<"subject" | "body">("body");

  const subjRef = useRef<HTMLInputElement>(null);
  const bodyRef = useRef<HTMLTextAreaElement>(null);

  const bodyVariants = parseVariants(body);

  function insertChip(token: string) {
    // SMS/WhatsApp non hanno oggetto: l'inserimento va sempre nel corpo.
    if (channel === "email" && activeField === "subject") {
      const el = subjRef.current;
      const s = el?.selectionStart ?? subject.length;
      const e = el?.selectionEnd ?? subject.length;
      const next = subject.slice(0, s) + token + subject.slice(e);
      setSubject(next);
      requestAnimationFrame(() => { el?.focus(); const p = s + token.length; el?.setSelectionRange(p, p); });
    } else {
      const el = bodyRef.current;
      const s = el?.selectionStart ?? body.length;
      const e = el?.selectionEnd ?? body.length;
      const next = body.slice(0, s) + token + body.slice(e);
      setBody(next);
      requestAnimationFrame(() => { el?.focus(); const p = s + token.length; el?.setSelectionRange(p, p); });
    }
  }

  function addVariant() {
    setBody((b) => (b.trim() ? `${b.trimEnd()}\n===\n` : "===\n"));
    setShowPreview(true);
  }

  function bumpDelay(field: "days" | "hours", dir: 1 | -1) {
    if (field === "days") setDelayDays((v) => String(Math.max(0, (Number(v) || 0) + dir)));
    else setDelayHours((v) => String(Math.min(23, Math.max(0, (Number(v) || 0) + dir))));
  }

  async function generateAI() {
    setAiBusy(true);
    try {
      const { data, error } = await supabase.functions.invoke("outreach-ai-email", { body: { angle: subject || "" } });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      if (data?.body) { if (channel === "email" && data.subject) setSubject(data.subject); setBody(data.body); toast.success("Step generato con AI"); }
      else throw new Error("Nessun testo generato");
    } catch (e) { toast.error(e instanceof Error ? e.message : "Errore AI"); } finally { setAiBusy(false); }
  }

  const ChIcon = CH_ICON[channel] ?? Mail;

  return (
    <div className="space-y-2.5 rounded-lg border-2 border-primary/40 bg-card p-3 shadow-sm">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <ChIcon className={`h-4 w-4 ${(CH_ACCENT[channel] ?? CH_ACCENT.email).text}`} />
          <span className="text-sm font-semibold">{title}</span>
        </div>
        <Button size="sm" variant="ghost" className="h-7 w-7 p-0" title="Chiudi senza salvare" onClick={onCancel}><X className="h-4 w-4" /></Button>
      </div>

      <div className="flex flex-wrap items-end gap-2">
        <div className="space-y-1">
          <Label className="text-xs">Canale</Label>
          {/* Editor lineare = solo Email. Gli step WhatsApp/SMS richiedono il
              modello a GRAFO (node_type + collegamenti): creati qui verrebbero
              salvati con channel ma node_type 'email' e il dispatcher li
              salterebbe in silenzio. Il multicanale si costruisce dal Builder
              visuale (bottone in alto nella sequenza). */}
          <Select value="email" disabled>
            <SelectTrigger className="h-8 w-[130px]"><SelectValue /></SelectTrigger>
            <SelectContent><SelectItem value="email">Email</SelectItem></SelectContent>
          </Select>
        </div>
        <DelayStepper label="Giorni" value={delayDays} onChange={setDelayDays} onBump={(d) => bumpDelay("days", d)} max={365} />
        <DelayStepper label="Ore" value={delayHours} onChange={setDelayHours} onBump={(d) => bumpDelay("hours", d)} max={23} />
      </div>
      <p className="text-[11px] text-muted-foreground">
        Per step <strong>WhatsApp</strong> o <strong>SMS</strong> usa il <strong>Builder visuale</strong> della sequenza.
      </p>

      {channel === "email" && (
        <div className="space-y-1">
          <Label className="text-xs">Oggetto</Label>
          <Input
            ref={subjRef}
            value={subject}
            onFocus={() => setActiveField("subject")}
            onChange={(e) => setSubject(e.target.value)}
            placeholder="{{first_name}}, una domanda veloce"
            className="h-8 text-sm"
          />
        </div>
      )}

      <div className="space-y-1">
        <Label className="text-xs">{channel === "email" ? "Corpo" : "Messaggio"}</Label>
        <Textarea
          ref={bodyRef}
          value={body}
          onFocus={() => setActiveField("body")}
          onChange={(e) => setBody(e.target.value)}
          rows={6}
          placeholder={"Ciao {{first_name}},\n…"}
          className="text-xs"
        />
      </div>

      <OutreachVarChips
        onInsert={insertChip}
        fieldHint={channel === "email" ? (activeField === "subject" ? "oggetto" : "corpo") : undefined}
        onAddVariant={channel === "email" ? addVariant : undefined}
        variantCount={bodyVariants.length}
      />

      {channel === "email" && (
        <p className="text-[11px] text-muted-foreground">
          A/Z testing: separa le varianti con <code className="rounded bg-muted px-1">===</code> su una riga. Il dispatcher le ruota tra i destinatari e tiene la migliore per tasso di risposta.
        </p>
      )}

      {/* Linter deliverability live: mostra il rischio spam mentre scrivi */}
      {channel === "email" && <QualityMeter subject={subject} body={body} />}

      {showPreview && body.trim() && (
        <div className="space-y-1.5">
          {bodyVariants.map((v, i) => (
            <div key={i} className="rounded-lg border bg-muted/30 p-2.5 text-xs">
              {bodyVariants.length > 1 && <div className="mb-1 text-[10px] font-semibold uppercase text-muted-foreground">Variante {String.fromCharCode(65 + i)}</div>}
              <div className="whitespace-pre-wrap">{renderTemplate(v, contactToVars(PREVIEW_SAMPLE), { seed: hashSeed(PREVIEW_SAMPLE.email) })}</div>
            </div>
          ))}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2 border-t pt-2.5">
        <Button size="sm" className="h-8 gap-1" disabled={busy} onClick={() => onSave({ channel, delay_days: delayDays, delay_hours: delayHours, subject, body })}>
          {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />} {busy ? "Salvo…" : "Salva step"}
        </Button>
        <Button type="button" size="sm" variant="outline" className="h-8 gap-1" disabled={aiBusy} onClick={generateAI}>
          {aiBusy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />} Genera con AI
        </Button>
        {body.trim() && (
          <Button type="button" size="sm" variant="ghost" className="h-8 gap-1" onClick={() => setShowPreview((v) => !v)}>
            <Eye className="h-3.5 w-3.5" /> {showPreview ? "Nascondi anteprima" : "Anteprima"}
          </Button>
        )}
        <Button type="button" size="sm" variant="ghost" className="ml-auto h-8" onClick={onCancel}>Annulla</Button>
      </div>
    </div>
  );
}

/**
 * Linter deliverability LIVE dello step: rischio spam (0-100) + segnali
 * azionabili, calcolati mentre scrivi. Riusa la stessa logica del dispatcher
 * (_shared/outreach-spam-score) così quello che vedi qui è quello che conta
 * al momento dell'invio. Meno rischio = più email arrivano in inbox.
 */
function QualityMeter({ subject, body }: { subject: string; body: string }) {
  const result = useMemo(() => {
    // usa la prima variante (A/Z separati da ===) come rappresentativa
    const firstVariant = body.split(/^\s*===\s*$/m)[0] || body;
    return spamScore(subject, firstVariant, firstVariant);
  }, [subject, body]);

  if (!body.trim()) return null;

  const theme = result.level === "rischio"
    ? { bar: "bg-rose-500", text: "text-rose-700", bg: "bg-rose-50", border: "border-rose-200", label: "Rischio spam alto", icon: AlertTriangle }
    : result.level === "attenzione"
      ? { bar: "bg-amber-500", text: "text-amber-700", bg: "bg-amber-50", border: "border-amber-200", label: "Da migliorare", icon: Info }
      : { bar: "bg-emerald-500", text: "text-emerald-700", bg: "bg-emerald-50", border: "border-emerald-200", label: "Ottimo per il cold", icon: Check };
  const Icon = theme.icon;
  const sevDot: Record<string, string> = { high: "bg-rose-500", med: "bg-amber-500", low: "bg-muted-foreground/50" };

  return (
    <div className={`rounded-lg border ${theme.border} ${theme.bg} p-2.5 space-y-1.5`}>
      <div className="flex items-center gap-2">
        <Icon className={`h-3.5 w-3.5 shrink-0 ${theme.text}`} />
        <span className={`text-xs font-semibold ${theme.text}`}>{theme.label}</span>
        <span className="ml-auto text-[10px] tabular-nums text-muted-foreground">rischio {result.score}/100</span>
      </div>
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-white/60">
        <div className={`h-full rounded-full ${theme.bar} transition-all`} style={{ width: `${Math.max(4, result.score)}%` }} />
      </div>
      {result.signals.length > 0 ? (
        <ul className="space-y-0.5 pt-0.5">
          {result.signals.map((s, i) => (
            <li key={i} className="flex items-start gap-1.5 text-[11px] text-foreground/80">
              <span className={`mt-1 h-1.5 w-1.5 shrink-0 rounded-full ${sevDot[s.severity]}`} />
              {s.label}
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-[11px] text-emerald-700">Personalizzato, breve, senza trigger anti-spam. Così arriva in inbox.</p>
      )}
    </div>
  );
}

/** Input numerico con stepper +/- per il ritardo (giorni/ore). */
function DelayStepper({ label, value, onChange, onBump, max }: {
  label: string; value: string; onChange: (v: string) => void; onBump: (dir: 1 | -1) => void; max: number;
}) {
  return (
    <div className="space-y-1">
      <Label className="text-xs">{label}</Label>
      <div className="flex h-8 items-center overflow-hidden rounded-md border">
        <button type="button" onClick={() => onBump(-1)} className="flex h-full w-7 items-center justify-center text-muted-foreground transition-colors hover:bg-muted hover:text-foreground" aria-label={`${label} meno`}>−</button>
        <Input
          type="number" min={0} max={max} value={value}
          onChange={(e) => onChange(e.target.value)}
          className="h-full w-12 rounded-none border-0 border-x px-0 text-center text-sm [appearance:textfield] focus-visible:ring-0 focus-visible:ring-offset-0 [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
        />
        <button type="button" onClick={() => onBump(1)} className="flex h-full w-7 items-center justify-center text-muted-foreground transition-colors hover:bg-muted hover:text-foreground" aria-label={`${label} più`}>+</button>
      </div>
    </div>
  );
}
