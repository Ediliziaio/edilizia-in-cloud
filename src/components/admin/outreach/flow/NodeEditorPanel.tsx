import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Mail, MessageCircle, Smartphone, Clock, GitBranch, Flag, Trash2, X, Split, Info } from "lucide-react";
import type { Node } from "@xyflow/react";
import type { FlowNodeData, OutreachConditionType } from "./graph";
import { parseVariants } from "../../../../../supabase/functions/_shared/outreach-abz";

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

const CONDITIONS: { value: OutreachConditionType; label: string }[] = [
  { value: "opened", label: "Ha aperto" },
  { value: "not_opened", label: "Non ha aperto" },
  { value: "replied", label: "Ha risposto" },
  { value: "not_replied", label: "Non ha risposto" },
];

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
              <Label className="text-xs">{type === "email" ? "Corpo" : "Messaggio"}</Label>
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
