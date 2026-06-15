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
import { Switch } from "@/components/ui/switch";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import {
  Loader2, Plus, Trash2, Mail, MessageSquare, Phone, ChevronRight, ChevronDown, AlertTriangle, Send, Sparkles, Eye, Split, Copy, LayoutTemplate, Info,
} from "lucide-react";
import { isMissingTableError, MigrationGate } from "./_shared";
import { OutreachEnrollDialog } from "./OutreachEnrollDialog";
import { OutreachSequenceStats } from "./OutreachSequenceStats";
import { OutreachAbzPanel } from "./OutreachAbzPanel";
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
const STATUS_VARIANT: Record<string, "default" | "secondary" | "outline"> = { active: "default", draft: "outline", paused: "secondary", archived: "secondary" };

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
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground">Cadenze multi-step: il contatto entra e riceve lo step giusto ogni giorno.</p>
        <div className="flex shrink-0 items-center gap-1.5">
          <Button size="sm" variant="outline" className="h-8 gap-1" onClick={() => { setAiOpen((v) => !v); setTemplateOpen(false); setCreating(false); }}><Sparkles className="h-3.5 w-3.5" /> Genera con AI</Button>
          <Button size="sm" variant="outline" className="h-8 gap-1" onClick={() => { setTemplateOpen((v) => !v); setAiOpen(false); setCreating(false); }}><LayoutTemplate className="h-3.5 w-3.5" /> Da template</Button>
          <Button size="sm" className="h-8 gap-1" onClick={() => { setCreating((v) => !v); setTemplateOpen(false); setAiOpen(false); }}><Plus className="h-3.5 w-3.5" /> Nuova sequenza</Button>
        </div>
      </div>

      {aiOpen && (
        <Card><CardContent className="space-y-2 p-3">
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
            <Card key={tpl.name} className="flex flex-col">
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
                <Select value={seq.brand_id || "none"} onValueChange={(v) => setBrand.mutate({ id: seq.id, brandId: v === "none" ? null : v })}>
                  <SelectTrigger className="h-7 w-[130px] text-xs" title="Brand: il pool di domini da cui spedisce questa sequenza"><SelectValue placeholder="Brand" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">— brand —</SelectItem>
                    {(brands.data ?? []).map((b) => <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>)}
                  </SelectContent>
                </Select>
                <OutreachEnrollDialog
                  companyId={companyId}
                  sequenceId={seq.id}
                  sequenceName={seq.name}
                  emailStepCount={steps.filter((s) => s.channel === "email").length}
                  onEnrolled={invalidate}
                />
                <Select value={seq.status} onValueChange={(v) => setStatus.mutate({ id: seq.id, status: v })}>
                  <SelectTrigger className="h-7 w-[110px] text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="draft">Bozza</SelectItem><SelectItem value="active">Attiva</SelectItem>
                    <SelectItem value="paused">In pausa</SelectItem><SelectItem value="archived">Archiviata</SelectItem>
                  </SelectContent>
                </Select>
                <Button size="sm" variant="ghost" className="h-7 w-7 p-0" title="Duplica sequenza" disabled={dupSeq.isPending} onClick={() => dupSeq.mutate(seq)}><Copy className="h-3.5 w-3.5" /></Button>
                <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-destructive" onClick={() => delSeq.mutate(seq.id)}><Trash2 className="h-3.5 w-3.5" /></Button>
              </div>
            </CardHeader>
            {isOpen && (
              <CardContent className="space-y-2 pt-0">
                {steps.length > 0 && <CadenceTimeline steps={steps} />}
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
    <div className="flex items-start justify-between gap-3 rounded-lg border bg-muted/20 p-2.5">
      <div className="min-w-0 space-y-0.5">
        <div className="flex items-center gap-1.5">
          <Eye className="h-3.5 w-3.5 text-muted-foreground" />
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

// Timeline visiva della cadenza: step ordinati per giorno con icona canale e G+N.
function CadenceTimeline({ steps }: { steps: { channel: string; delay_days: number }[] }) {
  const ordered = [...steps].sort((a, b) => a.delay_days - b.delay_days);
  return (
    <div className="flex items-center gap-1 overflow-x-auto rounded-lg border bg-muted/20 p-2">
      {ordered.map((s, i) => {
        const Icon = CH_ICON[s.channel] ?? Mail;
        return (
          <div key={i} className="flex items-center gap-1">
            {i > 0 && <div className="h-px w-4 shrink-0 bg-border" />}
            <div className="flex shrink-0 flex-col items-center gap-0.5">
              <div className="flex h-7 w-7 items-center justify-center rounded-full bg-orange-100 text-orange-600"><Icon className="h-3.5 w-3.5" /></div>
              <span className="text-[10px] text-muted-foreground">G+{s.delay_days}</span>
            </div>
          </div>
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
  const [aiBusy, setAiBusy] = useState(false);
  const [showPreview, setShowPreview] = useState(false);

  const bodyVariants = parseVariants(body);
  function addVariant() {
    setBody((b) => (b.trim() ? `${b.trimEnd()}\n===\n` : "===\n"));
    setShowPreview(true);
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
                {(() => { const n = Math.max(parseVariants(s.body || "").length, parseVariants(s.subject || "").length); return n > 1 ? <Badge variant="secondary" className="text-[10px]">A/Z ×{n}</Badge> : null; })()}
                {s.subject && <span className="truncate font-medium">{parseVariants(s.subject)[0] ?? s.subject}</span>}
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
        <div className="flex flex-wrap items-center gap-2">
          <Button size="sm" className="h-8 gap-1" disabled={busy} onClick={addStep}><Send className="h-3.5 w-3.5" /> {busy ? "…" : "Aggiungi step"}</Button>
          <Button type="button" size="sm" variant="outline" className="h-8 gap-1" disabled={aiBusy} onClick={generateAI}>
            {aiBusy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />} Genera con AI
          </Button>
          <Button type="button" size="sm" variant="outline" className="h-8 gap-1" onClick={addVariant} title="Aggiungi una variante A/Z: viene testata separatamente, vince quella con più risposte">
            <Split className="h-3.5 w-3.5" /> Variante A/Z
          </Button>
          {bodyVariants.length > 1 && <Badge variant="secondary" className="text-[10px]">A/Z ×{bodyVariants.length}</Badge>}
          {body.trim() && (
            <Button type="button" size="sm" variant="ghost" className="h-8 gap-1" onClick={() => setShowPreview((v) => !v)}>
              <Eye className="h-3.5 w-3.5" /> {showPreview ? "Nascondi" : "Anteprima"}
            </Button>
          )}
        </div>
        <p className="text-[11px] text-muted-foreground">
          A/Z testing: separa le varianti con <code className="rounded bg-muted px-1">===</code> su una riga. Il dispatcher le ruota tra i destinatari e tiene la migliore per tasso di risposta.
        </p>
        {showPreview && body.trim() && (
          <div className="space-y-1.5">
            {bodyVariants.map((v, i) => (
              <div key={i} className="rounded-lg border bg-card p-2.5 text-xs">
                {bodyVariants.length > 1 && <div className="mb-1 text-[10px] font-semibold uppercase text-muted-foreground">Variante {String.fromCharCode(65 + i)}</div>}
                <div className="whitespace-pre-wrap">{renderTemplate(v, contactToVars(PREVIEW_SAMPLE), { seed: hashSeed(PREVIEW_SAMPLE.email) })}</div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
