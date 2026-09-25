/**
 * MessageTemplatePicker — selettore + gestore di template messaggi, riutilizzabile
 * nei compositori (Clienti, Contatti CRM, Commesse).
 *
 *  - Dropdown: elenca i template del canale; al click inserisce subject/body con
 *    le variabili {{...}} già sostituite (via applyTemplateVars + vars del contesto).
 *  - "Gestisci template": dialog per creare/modificare/eliminare template e
 *    inserire campi personalizzati ({{nome}}, {{commessa}}, …).
 */
import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { FileText, Plus, Pencil, Trash2, Settings2, Sparkles, ChevronDown } from "lucide-react";
import { useMessageTemplates, type MessageTemplateRow, type MessageTemplateInput } from "@/hooks/useMessageTemplates";
import { applyTemplateVars, TEMPLATE_FIELDS, type TemplateChannel } from "@/lib/messageTemplateVars";

interface Props {
  channel: TemplateChannel;
  /** Variabili del contesto (da buildTemplateVars). */
  vars: Record<string, string>;
  /** Inserisce il template selezionato nel compositore. */
  onInsert: (payload: { subject?: string | null; body: string }) => void;
  triggerVariant?: "outline" | "ghost";
  triggerClassName?: string;
  /** Sotto i 768px il bottone resta solo con l'icona (accanto al campo del messaggio). */
  soloIconaSuTelefono?: boolean;
  align?: "start" | "end";
}

const CHANNEL_LABEL: Record<TemplateChannel, string> = {
  email: "Email",
  sms: "SMS",
  whatsapp: "WhatsApp",
  nota_interna: "Nota interna",
};

export function MessageTemplatePicker({ channel, vars, onInsert, triggerVariant = "outline", triggerClassName, align = "start", soloIconaSuTelefono = false }: Props) {
  const { templates, create, update, remove, seedExamples, isMutating } = useMessageTemplates(channel);
  const [manageOpen, setManageOpen] = useState(false);

  const handlePick = (t: MessageTemplateRow) => {
    onInsert({
      subject: t.subject ? applyTemplateVars(t.subject, vars) : null,
      body: applyTemplateVars(t.body, vars),
    });
  };

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button type="button" variant={triggerVariant} size="sm" className={triggerClassName ?? "h-8 gap-1.5 text-xs"}>
            <FileText className="h-3.5 w-3.5" />
            <span className={soloIconaSuTelefono ? "max-md:hidden" : undefined}>Template</span>
            <ChevronDown className={cn("h-3 w-3 opacity-60", soloIconaSuTelefono && "max-md:hidden")} />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align={align} className="w-72">
          <DropdownMenuLabel className="text-[11px]">Template {CHANNEL_LABEL[channel]}</DropdownMenuLabel>
          {templates.length === 0 ? (
            <div className="px-2 py-1.5 text-xs text-muted-foreground">Nessun template per questo canale.</div>
          ) : (
            templates.map((t) => (
              <DropdownMenuItem key={t.id} onClick={() => handlePick(t)} className="flex-col items-start gap-0.5">
                <span className="text-sm font-medium">{t.name}</span>
                <span className="line-clamp-1 text-[11px] text-muted-foreground">{t.subject || t.body}</span>
              </DropdownMenuItem>
            ))
          )}
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={() => setManageOpen(true)} className="gap-2">
            <Settings2 className="h-3.5 w-3.5" /> Gestisci template
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <ManageTemplatesDialog
        open={manageOpen}
        onOpenChange={setManageOpen}
        channel={channel}
        templates={templates}
        onCreate={create}
        onUpdate={update}
        onRemove={remove}
        onSeed={seedExamples}
        isMutating={isMutating}
      />
    </>
  );
}

// ────────────────────────────────────────────────────────────────────────────

function ManageTemplatesDialog({
  open, onOpenChange, channel, templates, onCreate, onUpdate, onRemove, onSeed, isMutating,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  channel: TemplateChannel;
  templates: MessageTemplateRow[];
  onCreate: (input: MessageTemplateInput) => Promise<void>;
  onUpdate: (id: string, input: MessageTemplateInput) => Promise<void>;
  onRemove: (id: string) => Promise<void>;
  onSeed: () => Promise<void>;
  isMutating: boolean;
}) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const bodyRef = useRef<HTMLTextAreaElement>(null);

  const emailChannel = channel === "email";

  const resetForm = () => { setEditingId(null); setName(""); setSubject(""); setBody(""); };

  const startEdit = (t: MessageTemplateRow) => {
    setEditingId(t.id);
    setName(t.name);
    setSubject(t.subject ?? "");
    setBody(t.body);
  };

  const insertField = (key: string) => {
    const token = `{{${key}}}`;
    const el = bodyRef.current;
    if (!el) { setBody((b) => b + token); return; }
    const start = el.selectionStart ?? body.length;
    const end = el.selectionEnd ?? body.length;
    const next = body.slice(0, start) + token + body.slice(end);
    setBody(next);
    // riposiziona il cursore dopo il token
    requestAnimationFrame(() => {
      el.focus();
      const pos = start + token.length;
      el.setSelectionRange(pos, pos);
    });
  };

  const canSave = name.trim().length > 0 && body.trim().length > 0 && (!emailChannel || subject.trim().length > 0);

  const handleSave = async () => {
    const input: MessageTemplateInput = { name, channel, subject: emailChannel ? subject : null, body };
    if (editingId) await onUpdate(editingId, input);
    else await onCreate(input);
    resetForm();
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) resetForm(); onOpenChange(v); }}>
      <DialogContent className="max-w-2xl max-h-[88vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5 text-primary" /> Template {CHANNEL_LABEL[channel]}
          </DialogTitle>
          <DialogDescription>
            Crea messaggi pronti con campi personalizzati come <code className="rounded bg-muted px-1">{"{{nome}}"}</code> o{" "}
            <code className="rounded bg-muted px-1">{"{{commessa}}"}</code>: verranno sostituiti al momento dell'invio.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-5 md:grid-cols-2">
          {/* Lista template esistenti */}
          <section className="space-y-2">
            <div className="flex items-center justify-between">
              <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Salvati ({templates.length})</h4>
              <Button type="button" variant="ghost" size="sm" className="h-7 gap-1 text-xs" onClick={resetForm}>
                <Plus className="h-3.5 w-3.5" /> Nuovo
              </Button>
            </div>
            {templates.length === 0 ? (
              <div className="rounded-md border border-dashed p-4 text-center">
                <p className="text-xs text-muted-foreground">Nessun template salvato.</p>
                <Button type="button" variant="outline" size="sm" className="mt-2 gap-1.5" onClick={() => onSeed()} disabled={isMutating}>
                  <Sparkles className="h-3.5 w-3.5" /> Aggiungi esempi
                </Button>
              </div>
            ) : (
              <ul className="space-y-1.5">
                {templates.map((t) => (
                  <li key={t.id} className={`flex items-center justify-between gap-2 rounded-md border p-2 ${editingId === t.id ? "border-primary bg-primary/5" : ""}`}>
                    <button type="button" className="min-w-0 flex-1 text-left" onClick={() => startEdit(t)}>
                      <p className="truncate text-sm font-medium">{t.name}</p>
                      <p className="truncate text-[11px] text-muted-foreground">{t.subject || t.body}</p>
                    </button>
                    <div className="flex shrink-0 items-center gap-1">
                      <Button type="button" variant="ghost" size="icon" className="h-7 w-7" aria-label="Modifica" onClick={() => startEdit(t)}>
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <Button type="button" variant="ghost" size="icon" className="h-7 w-7 text-destructive" aria-label="Elimina" onClick={() => onRemove(t.id)} disabled={isMutating}>
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>

          {/* Form crea/modifica */}
          <section className="space-y-2.5">
            <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              {editingId ? "Modifica template" : "Nuovo template"}
            </h4>
            <div className="space-y-1">
              <Label className="text-xs">Nome</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Es. Conferma appuntamento" className="h-9 text-sm" />
            </div>
            {emailChannel && (
              <div className="space-y-1">
                <Label className="text-xs">Oggetto</Label>
                <Input value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="Oggetto dell'email" className="h-9 text-sm" />
              </div>
            )}
            <div className="space-y-1">
              <Label className="text-xs">Messaggio</Label>
              <Textarea ref={bodyRef} value={body} onChange={(e) => setBody(e.target.value)} placeholder="Scrivi il testo… usa i campi qui sotto" rows={6} className="text-sm resize-y" />
            </div>
            <div className="flex flex-wrap gap-1">
              {TEMPLATE_FIELDS.map((f) => (
                <Badge
                  key={f.key}
                  variant="secondary"
                  className="cursor-pointer text-[10px] hover:bg-primary hover:text-primary-foreground"
                  title={`Inserisci ${f.label}${f.sample ? ` (es. ${f.sample})` : ""}`}
                  onClick={() => insertField(f.key)}
                >
                  + {f.label}
                </Badge>
              ))}
            </div>
            <div className="flex justify-end gap-2 pt-1">
              {editingId && (
                <Button type="button" variant="outline" size="sm" onClick={resetForm}>Annulla</Button>
              )}
              <Button type="button" size="sm" onClick={handleSave} disabled={!canSave || isMutating}>
                {editingId ? "Salva modifiche" : "Crea template"}
              </Button>
            </div>
          </section>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default MessageTemplatePicker;
