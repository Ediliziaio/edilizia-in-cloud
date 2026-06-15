import { useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Mail, MessageCircle, Smartphone, Clock, GitBranch, Flag, Trash2, X, Split, Info, FileText, RefreshCw } from "lucide-react";
import type { Node } from "@xyflow/react";
import type { FlowNodeData, OutreachConditionType, TemplateParams } from "./graph";
import { parseVariants } from "../../../../../supabase/functions/_shared/outreach-abz";
import { useWAMetaTemplates, useSyncMetaTemplates } from "@/hooks/whatsapp/useWAMetaTemplates";

/**
 * Pannello laterale di modifica del nodo selezionato.
 *   • Email     : oggetto + corpo (con inserimento variabili/spintax + varianti A/Z) + ritardo
 *   • WhatsApp  : corpo (variabili/spintax) + ritardo — niente oggetto; richiede telefono
 *   • SMS       : corpo (variabili/spintax) + ritardo — niente oggetto; richiede telefono
 *   • Attesa    : solo ritardo (giorni/ore)
 *   • Condizione: condition_type + hint sul tracking aperture
 *   • Fine      : nessun campo
 * Riusa il pattern di inserimento variabili/spintax (insert-at-cursor) della UI
 * esistente (OutreachMessagePlayground / OutreachSequences) per coerenza/DRY.
 */

const VAR_CHIPS = ["{{first_name}}", "{{last_name}}", "{{company_name}}", "{{email}}"];
const SPINTAX_CHIP = "{Ciao|Salve|Buongiorno}";

// Variabili contatto selezionabili per i parametri del template WhatsApp.
// Il valore è il TOKEN renderizzato al send (renderTemplate coi dati del contatto).
const TEMPLATE_VAR_OPTIONS: { value: string; label: string }[] = [
  { value: "{{first_name}}", label: "Nome" },
  { value: "{{last_name}}", label: "Cognome" },
  { value: "{{company_name}}", label: "Azienda" },
  { value: "{{email}}", label: "Email" },
  { value: "{{phone}}", label: "Telefono" },
];
// Sentinella per "testo fisso" nel Select dei parametri (valore libero, non variabile).
const FIXED_TEXT = "__fixed__";

const CONDITIONS: { value: OutreachConditionType; label: string }[] = [
  { value: "opened", label: "Ha aperto" },
  { value: "not_opened", label: "Non ha aperto" },
  { value: "replied", label: "Ha risposto" },
  { value: "not_replied", label: "Non ha risposto" },
];

/** Componenti del template (forma di wa_meta_templates.components_json). */
type TemplateComponents = { components?: Array<{ type?: string; text?: string }> } | null | undefined;

/** Numero di placeholder body {{n}} DISTINTI di un template (dai suoi components_json). */
function countBodyPlaceholders(componentsJson: TemplateComponents): number {
  const comps = componentsJson?.components;
  if (!Array.isArray(comps)) return 0;
  const body = comps.find((c) => c?.type === "BODY");
  const text = typeof body?.text === "string" ? body.text : "";
  return new Set([...text.matchAll(/\{\{\s*(\d+)\s*\}\}/g)].map((m) => m[1])).size;
}

/** True se il valore param è una delle variabili standard (vs testo fisso). */
function isKnownVar(v: string): boolean {
  return TEMPLATE_VAR_OPTIONS.some((o) => o.value === v);
}

type Props = {
  node: Node<FlowNodeData>;
  trackOpens: boolean;
  onChange: (data: Partial<FlowNodeData>) => void;
  onDelete: () => void;
  onClose: () => void;
};

export function NodeEditorPanel({ node, trackOpens, onChange, onDelete, onClose }: Props) {
  const data = (node.data ?? {}) as FlowNodeData;
  const type = node.type as string;
  const bodyRef = useRef<HTMLTextAreaElement>(null);
  const subjRef = useRef<HTMLInputElement>(null);
  const [activeField, setActiveField] = useState<"subject" | "body">("body");

  const meta: Record<string, { icon: typeof Mail; title: string; color: string }> = {
    email: { icon: Mail, title: "Email", color: "text-orange-600" },
    whatsapp: { icon: MessageCircle, title: "WhatsApp", color: "text-emerald-600" },
    sms: { icon: Smartphone, title: "SMS", color: "text-sky-600" },
    wait: { icon: Clock, title: "Attesa", color: "text-purple-600" },
    condition: { icon: GitBranch, title: "Condizione", color: "text-amber-600" },
    end: { icon: Flag, title: "Fine", color: "text-muted-foreground" },
  };
  const m = meta[type] ?? meta.email;
  const Icon = m.icon;
  // Nodi messaggio non-email: solo corpo (niente oggetto, niente A/Z, niente tracking).
  const isMessageChannel = type === "whatsapp" || type === "sms";
  const isSendNode = type === "email" || isMessageChannel;

  function insertChip(chip: string) {
    if (!isSendNode) return;
    // SMS/WhatsApp non hanno oggetto: l'inserimento variabili va sempre nel corpo.
    if (type === "email" && activeField === "subject") {
      const el = subjRef.current;
      const cur = data.subject ?? "";
      const s = el?.selectionStart ?? cur.length;
      const e = el?.selectionEnd ?? cur.length;
      const next = cur.slice(0, s) + chip + cur.slice(e);
      onChange({ subject: next });
      requestAnimationFrame(() => { el?.focus(); const p = s + chip.length; el?.setSelectionRange(p, p); });
    } else {
      const el = bodyRef.current;
      const cur = data.body ?? "";
      const s = el?.selectionStart ?? cur.length;
      const e = el?.selectionEnd ?? cur.length;
      const next = cur.slice(0, s) + chip + cur.slice(e);
      onChange({ body: next });
      requestAnimationFrame(() => { el?.focus(); const p = s + chip.length; el?.setSelectionRange(p, p); });
    }
  }

  function addVariant() {
    const cur = data.body ?? "";
    onChange({ body: cur.trim() ? `${cur.trimEnd()}\n===\n` : "===\n" });
  }

  const bodyVariants = parseVariants(data.body ?? "");

  return (
    <div className="flex h-full w-[340px] shrink-0 flex-col border-l bg-background">
      <div className="flex items-center justify-between border-b px-3 py-2.5">
        <div className="flex items-center gap-2">
          <Icon className={`h-4 w-4 ${m.color}`} />
          <span className="text-sm font-semibold">{m.title}</span>
        </div>
        <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={onClose}><X className="h-4 w-4" /></Button>
      </div>

      <div className="flex-1 space-y-3 overflow-y-auto p-3">
        {isMessageChannel && (
          <p className="flex items-start gap-1.5 rounded-lg border bg-muted/30 p-2 text-[11px] text-muted-foreground">
            <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            Richiede il numero di telefono del contatto: chi non ha un numero (o ha l'opt-out {type === "whatsapp" ? "WhatsApp" : "SMS"}) viene saltato e la cadenza prosegue.
          </p>
        )}

        {/* WhatsApp: selettore template approvato (compliance Meta cold) + mappatura
            parametri. Senza template, il testo libero sotto vale solo in finestra 24h. */}
        {type === "whatsapp" && (
          <>
            <WhatsAppTemplatePicker data={data} onChange={onChange} />
            {!data.template_name?.trim() && (
              <p className="flex items-start gap-1.5 rounded-lg border border-amber-300 bg-amber-50 p-2 text-[11px] text-amber-700 dark:border-amber-700 dark:bg-amber-950/40 dark:text-amber-300">
                <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                A freddo (fuori dalla finestra 24h) serve un template approvato: senza, il messaggio di testo viene saltato. Usa il testo libero solo per i follow-up entro la finestra.
              </p>
            )}
          </>
        )}

        {isSendNode && (
          <>
            {/* Oggetto: SOLO email. SMS/WhatsApp non hanno oggetto. */}
            {type === "email" && (
              <div className="space-y-1">
                <Label className="text-xs">Oggetto</Label>
                <Input
                  ref={subjRef}
                  value={data.subject ?? ""}
                  onFocus={() => setActiveField("subject")}
                  onChange={(e) => onChange({ subject: e.target.value })}
                  placeholder="{{first_name}}, una domanda veloce"
                  className="h-8"
                />
              </div>
            )}
            <div className="space-y-1">
              <Label className="text-xs">
                {type === "email" ? "Corpo" : "Messaggio"}
                {type === "whatsapp" && data.template_name?.trim() && (
                  <span className="ml-1 font-normal text-[10px] text-muted-foreground">(testo libero, solo in finestra 24h)</span>
                )}
              </Label>
              <Textarea
                ref={bodyRef}
                value={data.body ?? ""}
                onFocus={() => setActiveField("body")}
                onChange={(e) => onChange({ body: e.target.value })}
                rows={8}
                placeholder={"Ciao {{first_name}},\n…"}
                className="text-xs"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-[11px] text-muted-foreground">
                Inserisci variabile{type === "email" ? ` (nel campo ${activeField === "subject" ? "oggetto" : "corpo"})` : ""}
              </Label>
              <div className="flex flex-wrap gap-1">
                {VAR_CHIPS.map((c) => (
                  <button key={c} type="button" onClick={() => insertChip(c)} className="rounded border bg-muted/40 px-1.5 py-0.5 font-mono text-[10px] hover:bg-muted">
                    {c}
                  </button>
                ))}
                <button type="button" onClick={() => insertChip(SPINTAX_CHIP)} className="rounded border bg-muted/40 px-1.5 py-0.5 font-mono text-[10px] hover:bg-muted" title="Spintax: varia il testo tra destinatari">
                  {"{a|b}"}
                </button>
              </div>
              {/* Varianti A/Z: solo email (l'A/Z testing sull'oggetto è email-only). */}
              {type === "email" && (
                <div className="flex items-center gap-2">
                  <Button type="button" size="sm" variant="outline" className="h-7 gap-1 text-xs" onClick={addVariant} title="Variante A/Z separata da ===">
                    <Split className="h-3.5 w-3.5" /> Variante A/Z
                  </Button>
                  {bodyVariants.length > 1 && <Badge variant="secondary" className="text-[10px]">A/Z ×{bodyVariants.length}</Badge>}
                </div>
              )}
            </div>
          </>
        )}

        {type === "condition" && (
          <>
            <div className="space-y-1">
              <Label className="text-xs">Se il contatto…</Label>
              <Select
                value={data.condition_type ?? ""}
                onValueChange={(v) => onChange({ condition_type: v as OutreachConditionType })}
              >
                <SelectTrigger className="h-8"><SelectValue placeholder="Scegli condizione" /></SelectTrigger>
                <SelectContent>
                  {CONDITIONS.map((c) => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <p className="flex items-start gap-1.5 rounded-lg border bg-muted/30 p-2 text-[11px] text-muted-foreground">
              <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              Le condizioni su apertura richiedono il tracking aperture attivo sulla sequenza.
              {!trackOpens && (data.condition_type === "opened" || data.condition_type === "not_opened") && (
                <span className="font-medium text-amber-600"> Attualmente è disattivo: l'apertura sarà considerata "non avvenuta".</span>
              )}
            </p>
            <p className="text-[11px] text-muted-foreground">
              Il ramo <span className="font-semibold text-emerald-600">SÌ</span> segue la condizione vera, il ramo <span className="font-semibold text-red-500">NO</span> quella falsa. Collega entrambi i rami a un nodo successivo.
            </p>
          </>
        )}

        {type === "end" && (
          <p className="text-xs text-muted-foreground">
            Nodo terminale: quando il contatto arriva qui la sequenza si conclude (iscrizione "completata").
          </p>
        )}

        {(isSendNode || type === "wait") && (
          <div className="space-y-1">
            <Label className="text-xs">Ritardo prima di questo step</Label>
            <div className="flex items-center gap-2">
              <div className="space-y-1">
                <Input
                  type="number"
                  min={0}
                  value={data.delay_days ?? 0}
                  onChange={(e) => onChange({ delay_days: Math.max(0, Number(e.target.value) || 0) })}
                  className="h-8 w-20"
                />
                <span className="block text-center text-[10px] text-muted-foreground">giorni</span>
              </div>
              <div className="space-y-1">
                <Input
                  type="number"
                  min={0}
                  max={23}
                  value={data.delay_hours ?? 0}
                  onChange={(e) => onChange({ delay_hours: Math.max(0, Number(e.target.value) || 0) })}
                  className="h-8 w-20"
                />
                <span className="block text-center text-[10px] text-muted-foreground">ore</span>
              </div>
            </div>
          </div>
        )}
      </div>

      {type !== "end" && (
        <div className="border-t p-3">
          <Button size="sm" variant="outline" className="h-8 w-full gap-1 text-destructive hover:text-destructive" onClick={onDelete}>
            <Trash2 className="h-3.5 w-3.5" /> Elimina nodo
          </Button>
        </div>
      )}
    </div>
  );
}

/**
 * Selettore del TEMPLATE WhatsApp approvato (compliance Meta) per il nodo WhatsApp,
 * con mappatura dei parametri del corpo ({{1}},{{2}},…) a una variabile contatto o
 * a testo fisso. Riusa il data-source dei template approvati (useWAMetaTemplates →
 * tabella wa_meta_templates, status='APPROVED') già usato dal Broadcast.
 *
 * Salva su template_name / template_language / template_params (mappa posizionale
 * { "1": valore, … }). Selezionare "Nessuno (testo libero)" azzera i campi → il
 * nodo torna a testo libero (consentito solo entro la finestra 24h al send).
 */
function WhatsAppTemplatePicker({
  data,
  onChange,
}: {
  data: FlowNodeData;
  onChange: (patch: Partial<FlowNodeData>) => void;
}) {
  // Template approvati della company effettiva (per la piattaforma: la company del
  // super-admin che opera l'outreach). Stesso hook del Broadcast (DRY).
  const { data: templates, isLoading, isError } = useWAMetaTemplates(undefined, true);
  const sync = useSyncMetaTemplates();

  const selectedName = data.template_name?.trim() || "";
  const selected = useMemo(
    () => (templates ?? []).find((t) => t.template_name === selectedName) ?? null,
    [templates, selectedName],
  );
  // Numero di parametri body: dal components_json (fallback variables_count del DB).
  const paramCount = useMemo(() => {
    if (!selected) return 0;
    const fromBody = countBodyPlaceholders(selected.components_json as TemplateComponents);
    return fromBody || (selected.variables_count ?? 0);
  }, [selected]);
  const params = (data.template_params ?? {}) as TemplateParams;
  // Posizioni in modalità "testo fisso" (anche quando il testo è ancora vuoto):
  // tiene aperto l'Input prima che l'utente scriva. Non persistito (UI-only).
  const [fixedPos, setFixedPos] = useState<Set<number>>(new Set());

  function selectTemplate(name: string) {
    setFixedPos(new Set());
    if (name === FIXED_TEXT /* nessuno */) {
      onChange({ template_name: null, template_language: null, template_params: null });
      return;
    }
    const tpl = (templates ?? []).find((t) => t.template_name === name);
    onChange({
      template_name: name,
      template_language: tpl?.template_language || "it",
      template_params: {}, // reset mappatura al cambio template
    });
  }

  // Aggiorna il valore del parametro posizionale `pos` (1-based). value="" lo rimuove.
  function setParam(pos: number, value: string) {
    const next: TemplateParams = { ...params };
    if (value) next[String(pos)] = value;
    else delete next[String(pos)];
    onChange({ template_params: next });
  }

  // Scelta nel Select del parametro: variabile, oppure "testo fisso" (apre l'Input).
  function onParamChoice(pos: number, choice: string) {
    setFixedPos((prev) => {
      const n = new Set(prev);
      if (choice === FIXED_TEXT) n.add(pos);
      else n.delete(pos);
      return n;
    });
    // Variabile: salvala subito. "Testo fisso": svuota il valore, l'Input lo riempie.
    setParam(pos, choice === FIXED_TEXT ? "" : choice);
  }

  return (
    <div className="space-y-2 rounded-lg border bg-muted/20 p-2.5">
      <div className="flex items-center justify-between">
        <Label className="flex items-center gap-1.5 text-xs font-semibold">
          <FileText className="h-3.5 w-3.5 text-emerald-600" /> Template approvato
        </Label>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          className="h-6 gap-1 px-1.5 text-[10px]"
          title="Sincronizza i template approvati da Meta"
          disabled={sync.isPending}
          onClick={() => sync.mutate(undefined)}
        >
          <RefreshCw className={`h-3 w-3 ${sync.isPending ? "animate-spin" : ""}`} /> Sync
        </Button>
      </div>

      <Select value={selectedName || FIXED_TEXT} onValueChange={selectTemplate}>
        <SelectTrigger className="h-8"><SelectValue placeholder="Nessuno (testo libero)" /></SelectTrigger>
        <SelectContent>
          <SelectItem value={FIXED_TEXT}>Nessuno (testo libero)</SelectItem>
          {(templates ?? []).map((t) => (
            <SelectItem key={t.id} value={t.template_name}>
              {t.template_name} ({t.variables_count ?? 0} var)
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {isLoading && <p className="text-[11px] text-muted-foreground">Caricamento template…</p>}
      {isError && <p className="text-[11px] text-destructive">Errore nel caricamento dei template.</p>}
      {!isLoading && !isError && (templates ?? []).length === 0 && (
        <p className="text-[11px] text-muted-foreground">
          Nessun template APPROVED. Crealo in WhatsApp → Template e premi Sync.
        </p>
      )}

      {/* Mappatura parametri body {{1}}..{{n}} → variabile o testo fisso. */}
      {selected && paramCount > 0 && (
        <div className="space-y-1.5 pt-1">
          <Label className="text-[11px] text-muted-foreground">Mappa i parametri del corpo</Label>
          {Array.from({ length: paramCount }, (_, i) => i + 1).map((pos) => {
            const raw = params[String(pos)] ?? "";
            // Modalità testo fisso: valore non-variabile non vuoto, oppure scelto a mano.
            const isFixed = fixedPos.has(pos) || (raw !== "" && !isKnownVar(raw));
            const selectValue = isFixed ? FIXED_TEXT : raw === "" ? "" : isKnownVar(raw) ? raw : FIXED_TEXT;
            return (
              <div key={pos} className="space-y-1">
                <div className="flex items-center gap-1.5">
                  <span className="w-10 shrink-0 font-mono text-[10px] text-muted-foreground">{`{{${pos}}}`}</span>
                  <Select value={selectValue} onValueChange={(v) => onParamChoice(pos, v)}>
                    <SelectTrigger className="h-7 text-xs"><SelectValue placeholder="Scegli…" /></SelectTrigger>
                    <SelectContent>
                      {TEMPLATE_VAR_OPTIONS.map((o) => (
                        <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                      ))}
                      <SelectItem value={FIXED_TEXT}>Testo fisso…</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                {isFixed && (
                  <Input
                    value={raw}
                    onChange={(e) => setParam(pos, e.target.value)}
                    placeholder="Testo fisso del parametro"
                    className="ml-[46px] h-7 w-[calc(100%-46px)] text-xs"
                  />
                )}
              </div>
            );
          })}
          <p className="text-[10px] text-muted-foreground">
            Le variabili vengono compilate col dato del contatto all'invio.
          </p>
        </div>
      )}
    </div>
  );
}
