import { useRef, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import {
  Loader2, Plus, Trash2, Mail, MessageSquare, Phone, ChevronRight, ChevronDown, AlertTriangle,
  Sparkles, Eye, Copy, LayoutTemplate, Info, Network, Pencil, ArrowUp, ArrowDown, Check, X, Clock, ListPlus, Inbox,
} from "lucide-react";
import { isMissingTableError, MigrationGate, htmlToPreviewText } from "./_shared";
import { OutreachEnrollDialog } from "./OutreachEnrollDialog";
import { OutreachSequenceFlowBuilder } from "./OutreachSequenceFlowBuilder";
import { OutreachSequenceStats } from "./OutreachSequenceStats";
import { OutreachAbzPanel } from "./OutreachAbzPanel";
import { OutreachVarChips } from "./OutreachVarChips";
import { renderTemplate, contactToVars, hashSeed } from "../../../../supabase/functions/_shared/outreach-template";
import { parseVariants } from "../../../../supabase/functions/_shared/outreach-abz";

const PREVIEW_SAMPLE = { first_name: "Mario", last_name: "Rossi", company_name: "Rossi Costruzioni", email: "mario@rossi.it" };

/**
 * Builder cadenze (Fase 1). Tabelle outreach_sequences / outreach_sequence_steps
 * della migrazione 20270815000000: gate finché non applicata.
 */

const T_SEQ = "outreach_sequences";
const T_STEP = "outreach_sequence_steps";

interface Seq { id: string; name: string; status: string; description: string | null; created_at: string; brand_id: string | null; track_opens?: boolean | null; }
interface Step { id: string; sequence_id: string; step_order: number; channel: string; delay_days: number; delay_hours: number; subject: string | null; body: string; }

const CH_ICON: Record<string, typeof Mail> = { email: Mail, whatsapp: MessageSquare, sms: Phone };
const CH_LABEL: Record<string, string> = { email: "Email", whatsapp: "WhatsApp", sms: "SMS" };
// Stile accent per canale (coerente con i nodi del builder visuale).
const CH_ACCENT: Record<string, { wrap: string; text: string }> = {
  email: { wrap: "bg-orange-100 dark:bg-orange-900/50", text: "text-orange-600 dark:text-orange-400" },
  whatsapp: { wrap: "bg-emerald-100 dark:bg-emerald-900/50", text: "text-emerald-600 dark:text-emerald-400" },
  sms: { wrap: "bg-sky-100 dark:bg-sky-900/50", text: "text-sky-600 dark:text-sky-400" },
};
const STATUS_VARIANT: Record<string, "default" | "secondary" | "outline"> = { active: "default", draft: "outline", paused: "secondary", archived: "secondary" };
const STATUS_LABEL: Record<string, string> = { draft: "Bozza", active: "Attiva", paused: "In pausa", archived: "Archiviata" };

/** Etichetta ritardo leggibile: "Giorno 0", "+3 giorni", "+2 giorni 4h". */
function delayLabel(days: number, hours = 0): string {
  const d = Math.max(0, Math.trunc(days));
  const h = Math.max(0, Math.trunc(hours));
  if (d === 0 && h === 0) return "Giorno 0";
  const parts: string[] = [];
  if (d > 0) parts.push(`+${d} ${d === 1 ? "giorno" : "giorni"}`);
  if (h > 0) parts.push(`${h}h`);
  return parts.join(" ");
}

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
        <Card className="border-orange-200 bg-orange-50/40 dark:border-orange-900/60 dark:bg-orange-950/20"><CardContent className="space-y-2 p-3">
          <div className="flex items-end gap-2">
            <div className="flex-1 space-y-1">
              <Label className="text-xs">Angolo della cadenza</Label>
              <Input
                value={aiAngle}
                onChange={(e) => setAiAngle(e.target.value)}
                placeholder="es. risparmio su fatturazione e gestione cantieri"
                className="h-8"
                disabled={generateWithAi.isPending}
                onKeyDown={(e) => { if (e.key === "Enter" && !generateWithAi.isPending) generateWithAi.mutate(aiAngle.trim()); }}
              />
            </div>
            <Button size="sm" className="h-8 gap-1" disabled={generateWithAi.isPending} onClick={() => generateWithAi.mutate(aiAngle.trim())}>
              {generateWithAi.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
              {generateWithAi.isPending ? "Genero…" : "Genera"}
            </Button>
          </div>
          <p className="text-[11px] text-muted-foreground">L'AI crea una cadenza di 3 email (apertura + 2 follow-up) come bozza, con variabili e spintax. Potrai rivederla ed editarla prima di attivarla.</p>
        </CardContent></Card>
      )}

      {templateOpen && (
        <div className="grid gap-2 sm:grid-cols-2">
          {TEMPLATES.map((tpl) => (
            <Card key={tpl.name} className="flex flex-col transition-shadow hover:shadow-md">
              <CardContent className="flex flex-1 flex-col gap-2 p-3">
                <div className="flex items-center gap-2"><LayoutTemplate className="h-4 w-4 text-orange-500" /><span className="text-sm font-medium">{tpl.name}</span></div>
                <p className="text-xs text-muted-foreground">{tpl.desc}</p>
                <CadenceTimeline steps={tpl.steps} />
                <Button size="sm" className="mt-auto h-8 w-full" disabled={createFromTemplate.isPending} onClick={() => createFromTemplate.mutate(tpl)}>
                  {createFromTemplate.isPending ? "…" : `Usa questo (${tpl.steps.length} step)`}
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {creating && (
        <Card className="border-primary/30"><CardContent className="flex items-end gap-2 p-3">
          <div className="flex-1 space-y-1"><Label className="text-xs">Nome sequenza</Label><Input autoFocus value={newName} onChange={(e) => setNewName(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && !createSeq.isPending) createSeq.mutate(); }} placeholder="es. Cold edili Lombardia" className="h-8" /></div>
          <Button size="sm" className="h-8" disabled={createSeq.isPending} onClick={() => createSeq.mutate()}>{createSeq.isPending ? "…" : "Crea"}</Button>
        </CardContent></Card>
      )}

      {sequences.length === 0 && !creating && (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center gap-3 py-10 text-center">
            <div className="rounded-full bg-orange-100 p-3 text-orange-600 dark:bg-orange-950/50 dark:text-orange-400"><ListPlus className="h-6 w-6" /></div>
            <div className="space-y-1">
              <p className="text-sm font-medium">Nessuna sequenza</p>
              <p className="mx-auto max-w-md text-xs text-muted-foreground">Crea la prima cadenza per lavorare a step invece che a blast: apertura, follow-up e chiusura, in automatico.</p>
            </div>
            <div className="flex flex-wrap items-center justify-center gap-2 pt-1">
              <Button size="sm" className="h-8 gap-1" onClick={() => { setCreating(true); setTemplateOpen(false); setAiOpen(false); }}><Plus className="h-3.5 w-3.5" /> Nuova sequenza</Button>
              <Button size="sm" variant="outline" className="h-8 gap-1" onClick={() => { setTemplateOpen(true); setAiOpen(false); setCreating(false); }}><LayoutTemplate className="h-3.5 w-3.5" /> Parti da un template</Button>
            </div>
          </CardContent>
        </Card>
      )}

      {sequences.map((seq) => {
        const steps = stepsBySeq.get(seq.id) ?? [];
        const isOpen = expanded === seq.id;
        return (
          <Card key={seq.id} className={`overflow-hidden transition-shadow ${isOpen ? "shadow-md ring-1 ring-border" : "hover:shadow-sm"}`}>
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
              <CardContent className="space-y-2.5 border-t bg-muted/10 pt-3">
                {steps.length > 0 && <CadenceTimeline steps={steps} detailed />}
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

  return (
    <div className="flex flex-col gap-2.5 p-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex min-w-0 flex-1 items-center gap-2">
        <button className="shrink-0 rounded p-0.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground" onClick={onToggle} aria-label={isOpen ? "Comprimi" : "Espandi"}>
          {isOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
        </button>
        <div className="min-w-0 flex-1">
          {editing ? (
            <div className="flex items-center gap-1">
              <Input
                autoFocus value={name} onChange={(e) => setName(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") commit(); if (e.key === "Escape") cancelEdit(); }}
                onBlur={commit}
                className="h-7 max-w-[280px] text-sm font-semibold"
              />
              <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-emerald-600" onMouseDown={(e) => e.preventDefault()} onClick={commit}><Check className="h-3.5 w-3.5" /></Button>
            </div>
          ) : (
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
              <button className="group flex items-center gap-1.5 text-left" onClick={openEdit} title="Rinomina sequenza">
                <span className="truncate text-base font-semibold">{seq.name}</span>
                <Pencil className="h-3 w-3 shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
              </button>
              <Badge variant={STATUS_VARIANT[seq.status] ?? "outline"} className="text-[10px]">{STATUS_LABEL[seq.status] ?? seq.status}</Badge>
              <span className="text-xs text-muted-foreground">{steps.length} {steps.length === 1 ? "step" : "step"}</span>
            </div>
          )}
        </div>
      </div>
      <div className="flex shrink-0 flex-wrap items-center gap-1">
        <Select value={seq.brand_id || "none"} onValueChange={(v) => onSetBrand(v === "none" ? null : v)}>
          <SelectTrigger className="h-7 w-[120px] text-xs" title="Brand: il pool di domini da cui spedisce questa sequenza"><SelectValue placeholder="Brand" /></SelectTrigger>
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
          <SelectTrigger className="h-7 w-[104px] text-xs"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="draft">Bozza</SelectItem><SelectItem value="active">Attiva</SelectItem>
            <SelectItem value="paused">In pausa</SelectItem><SelectItem value="archived">Archiviata</SelectItem>
          </SelectContent>
        </Select>
        <Button size="sm" variant="outline" className="h-7 gap-1 text-xs" title="Apri il builder visuale a nodi (flussi if/then)" onClick={onOpenFlow}><Network className="h-3.5 w-3.5" /> Builder visuale</Button>
        <Button size="sm" variant="ghost" className="h-7 w-7 p-0" title="Duplica sequenza" disabled={dupPending} onClick={onDuplicate}><Copy className="h-3.5 w-3.5" /></Button>
        <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-destructive" title="Elimina sequenza" onClick={onDelete}><Trash2 className="h-3.5 w-3.5" /></Button>
      </div>
    </div>
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
    <div className={`flex items-start justify-between gap-3 rounded-lg border p-2.5 transition-colors ${checked ? "border-orange-200 bg-orange-50/50 dark:border-orange-900/60 dark:bg-orange-950/20" : "bg-card"}`}>
      <div className="min-w-0 space-y-0.5">
        <div className="flex items-center gap-1.5">
          <Eye className={`h-3.5 w-3.5 ${checked ? "text-orange-600" : "text-muted-foreground"}`} />
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
 * Timeline visiva della cadenza: step ordinati per giorno con icona canale.
 * `detailed` mostra anche etichetta canale + ritardo leggibile sotto ogni nodo
 * (versione grande per la sequenza espansa); senza, versione compatta per le card.
 */
function CadenceTimeline({ steps, detailed = false }: { steps: { channel: string; delay_days: number; delay_hours?: number }[]; detailed?: boolean }) {
  const ordered = [...steps].sort((a, b) => a.delay_days - b.delay_days);
  if (ordered.length === 0) return null;
  return (
    <div className={`flex items-stretch gap-1 overflow-x-auto rounded-lg border bg-muted/20 ${detailed ? "p-3" : "p-2"}`}>
      {ordered.map((s, i) => {
        const Icon = CH_ICON[s.channel] ?? Mail;
        const accent = CH_ACCENT[s.channel] ?? CH_ACCENT.email;
        return (
          <div key={i} className="flex items-center gap-1">
            {i > 0 && <div className={`shrink-0 bg-border ${detailed ? "h-px w-6" : "h-px w-4"}`} />}
            <div className="flex shrink-0 flex-col items-center gap-1">
              <div className={`flex items-center justify-center rounded-full ${accent.wrap} ${accent.text} ${detailed ? "h-9 w-9" : "h-7 w-7"}`}>
                <Icon className={detailed ? "h-4 w-4" : "h-3.5 w-3.5"} />
              </div>
              {detailed ? (
                <div className="flex flex-col items-center leading-tight">
                  <span className="text-[10px] font-medium">{CH_LABEL[s.channel] ?? s.channel}</span>
                  <span className="text-[10px] text-muted-foreground">{delayLabel(s.delay_days, s.delay_hours)}</span>
                </div>
              ) : (
                <span className="text-[10px] text-muted-foreground">{delayLabel(s.delay_days, s.delay_hours)}</span>
              )}
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

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Step della cadenza</span>
        {ordered.length > 0 && <span className="text-[10px] text-muted-foreground">{ordered.length} step · clicca per modificare</span>}
      </div>

      {ordered.length === 0 && !adding && (
        <div className="flex flex-col items-center gap-2 rounded-lg border border-dashed bg-muted/20 p-5 text-center">
          <Inbox className="h-5 w-5 text-muted-foreground" />
          <p className="text-xs text-muted-foreground">Ancora nessuno step. Aggiungi il primo messaggio della cadenza.</p>
        </div>
      )}

      {ordered.map((s, i) => (
        editingId === s.id ? (
          <StepEditor
            key={s.id}
            initial={draftFromStep(s)}
            busy={busyId === s.id}
            onSave={(d) => saveExisting(s.id, d)}
            onCancel={() => setEditingId(null)}
            title={`Modifica step ${i + 1}`}
          />
        ) : (
          <StepCard
            key={s.id}
            step={s}
            index={i}
            total={ordered.length}
            busy={busyId === s.id}
            onEdit={() => { setAdding(false); setEditingId(s.id); }}
            onDuplicate={() => duplicateStep(s)}
            onDelete={() => delStep(s.id)}
            onMoveUp={() => move(i, -1)}
            onMoveDown={() => move(i, 1)}
          />
        )
      ))}

      {adding ? (
        <StepEditor
          initial={emptyDraft()}
          busy={busyId === "new"}
          onSave={addNew}
          onCancel={() => setAdding(false)}
          title={`Nuovo step ${ordered.length + 1}`}
        />
      ) : (
        <Button
          variant="outline"
          size="sm"
          className="h-9 w-full gap-1.5 border-dashed text-muted-foreground hover:text-foreground"
          onClick={() => { setEditingId(null); setAdding(true); }}
        >
          <Plus className="h-4 w-4" /> Aggiungi step
        </Button>
      )}
    </div>
  );
}

/**
 * Card di uno step in modalità lettura: icona canale, badge ritardo leggibile,
 * oggetto in evidenza, anteprima corpo PULITA (HTML strippato → niente `<br>`
 * grezzi), badge A/Z; azioni per-step (riordina su/giù, modifica, duplica, elimina).
 */
function StepCard({
  step, index, total, busy, onEdit, onDuplicate, onDelete, onMoveUp, onMoveDown,
}: {
  step: Step; index: number; total: number; busy: boolean;
  onEdit: () => void; onDuplicate: () => void; onDelete: () => void; onMoveUp: () => void; onMoveDown: () => void;
}) {
  const Icon = CH_ICON[step.channel] ?? Mail;
  const accent = CH_ACCENT[step.channel] ?? CH_ACCENT.email;
  const subjectVariants = parseVariants(step.subject || "");
  const bodyVariants = parseVariants(step.body || "");
  const variantCount = Math.max(subjectVariants.length, bodyVariants.length);
  const subjectText = subjectVariants[0] ?? step.subject ?? "";
  // ANTEPRIMA LEGGIBILE: strip dei tag HTML (il body può contenere <br>, <p>…),
  // sulla 1ª variante, così non compare HTML grezzo nella card.
  const bodyPreview = htmlToPreviewText(bodyVariants[0] ?? step.body ?? "");

  return (
    <div className={`group relative flex gap-3 rounded-lg border bg-card p-3 transition-all hover:border-primary/40 hover:shadow-sm ${busy ? "opacity-60" : ""}`}>
      {/* Colonna riordino + indice */}
      <div className="flex flex-col items-center gap-1 pt-0.5">
        <button
          type="button" disabled={index === 0 || busy} onClick={onMoveUp}
          className="text-muted-foreground transition-colors enabled:hover:text-foreground disabled:opacity-25"
          title="Sposta su" aria-label="Sposta su"
        ><ArrowUp className="h-3.5 w-3.5" /></button>
        <div className={`flex h-9 w-9 items-center justify-center rounded-full ${accent.wrap} ${accent.text}`}>
          <Icon className="h-4 w-4" />
        </div>
        <button
          type="button" disabled={index === total - 1 || busy} onClick={onMoveDown}
          className="text-muted-foreground transition-colors enabled:hover:text-foreground disabled:opacity-25"
          title="Sposta giù" aria-label="Sposta giù"
        ><ArrowDown className="h-3.5 w-3.5" /></button>
      </div>

      {/* Contenuto */}
      <button type="button" onClick={onEdit} className="min-w-0 flex-1 text-left" title="Modifica step">
        <div className="flex flex-wrap items-center gap-1.5">
          <Badge variant="secondary" className="gap-1 text-[10px]"><Clock className="h-3 w-3" />{delayLabel(step.delay_days, step.delay_hours)}</Badge>
          <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">{CH_LABEL[step.channel] ?? step.channel}</span>
          {variantCount > 1 && <Badge variant="outline" className="text-[10px]">A/Z ×{variantCount}</Badge>}
        </div>
        {step.channel === "email" && (
          <p className="mt-1 truncate text-sm font-medium text-foreground">
            {subjectText.trim() || <span className="font-normal text-muted-foreground">Senza oggetto</span>}
          </p>
        )}
        <p className={`text-xs text-muted-foreground ${step.channel === "email" ? "mt-0.5" : "mt-1"} line-clamp-2`}>
          {bodyPreview || <span className="italic">Nessun testo</span>}
        </p>
      </button>

      {/* Azioni */}
      <div className="flex shrink-0 items-start gap-0.5">
        <Button size="sm" variant="ghost" className="h-7 w-7 p-0" title="Modifica" disabled={busy} onClick={onEdit}><Pencil className="h-3.5 w-3.5" /></Button>
        <Button size="sm" variant="ghost" className="h-7 w-7 p-0" title="Duplica step" disabled={busy} onClick={onDuplicate}><Copy className="h-3.5 w-3.5" /></Button>
        <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-destructive" title="Elimina step" disabled={busy} onClick={onDelete}>
          {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
        </Button>
      </div>
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
          <Select value={channel} onValueChange={setChannel}>
            <SelectTrigger className="h-8 w-[130px]"><SelectValue /></SelectTrigger>
            <SelectContent><SelectItem value="email">Email</SelectItem><SelectItem value="whatsapp">WhatsApp</SelectItem><SelectItem value="sms">SMS</SelectItem></SelectContent>
          </Select>
        </div>
        <DelayStepper label="Giorni" value={delayDays} onChange={setDelayDays} onBump={(d) => bumpDelay("days", d)} max={365} />
        <DelayStepper label="Ore" value={delayHours} onChange={setDelayHours} onBump={(d) => bumpDelay("hours", d)} max={23} />
      </div>

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
