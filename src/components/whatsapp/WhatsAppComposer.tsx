// Composer WhatsApp CONFORME (Customer Service Window 24h) — condiviso tra
// Contatti & Lead e scheda Cliente.
//
// Regola Meta: testo libero solo se la finestra 24h è APERTA (ultimo messaggio
// del cliente < 24h fa). Fuori finestra → obbligatorio un TEMPLATE approvato.
// Questo componente:
//  - fa scegliere il NUMERO mittente (se >1 attivo),
//  - mostra lo stato della finestra 24h,
//  - in modalità "smart": testo libero se aperta, template se chiusa,
//  - delega l'invio reale al chiamante via `onSend`.

import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Clock, AlertTriangle, Send, Loader2, FileText, MessageSquare } from "lucide-react";
import { useWhatsAppNumbers } from "@/hooks/whatsapp/useWhatsAppNumbers";
import { useWhatsAppWindow, useApprovedTemplates } from "@/hooks/whatsapp/useWhatsAppCompliance";

export interface WhatsAppSendArgs {
  waNumberId: string | null;
  content: string;
  template: { name: string; language: string; variables: string[] } | null;
}

interface Props {
  phone: string | null | undefined;
  onSend: (args: WhatsAppSendArgs) => Promise<void> | void;
  isSending?: boolean;
  className?: string;
  /**
   * Valori dei campi del contatto già risolti, keyati con la stessa chiave usata
   * nella mappatura del template (es. { nome: "Mario", telefono: "+39…", "cf:<id>": "…" }).
   * Se presenti, le variabili del template vengono pre-compilate automaticamente.
   * Memoizzare nel chiamante per evitare re-render inutili.
   */
  contactFields?: Record<string, string>;
  /** Testo da iniettare nel composer (es. bozza AI). Applicato quando seedAt cambia. */
  seedText?: string;
  seedAt?: number;
}

export function WhatsAppComposer({ phone, onSend, isSending, className, contactFields, seedText, seedAt }: Props) {
  const { data: numbers = [] } = useWhatsAppNumbers();
  const activeNumbers = useMemo(
    () => numbers.filter((n) => n.stato === "active" && n.webhook_verified),
    [numbers],
  );

  const [numberId, setNumberId] = useState<string | null>(null);
  useEffect(() => {
    if (!numberId && activeNumbers.length > 0) setNumberId(activeNumbers[0].id);
  }, [activeNumbers, numberId]);

  const window24 = useWhatsAppWindow(phone);
  const isOpen = window24.data?.open ?? false;
  const windowLoading = window24.isLoading;

  const { data: templates = [] } = useApprovedTemplates(numberId);

  // Modalità: testo se finestra aperta, altrimenti template (forzato).
  const [mode, setMode] = useState<"text" | "template">("text");
  useEffect(() => {
    if (!windowLoading) setMode(isOpen ? "text" : "template");
  }, [isOpen, windowLoading]);

  const [text, setText] = useState("");
  // Inietta una bozza esterna (es. AI) quando seedAt cambia.
  useEffect(() => {
    if (seedText) setText(seedText.slice(0, 4096));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seedAt]);
  const [templateId, setTemplateId] = useState<string | null>(null);
  const [vars, setVars] = useState<string[]>([]);

  const selectedTemplate = templates.find((t) => t.id === templateId) ?? null;
  const selectedMapping = selectedTemplate?.variable_mapping ?? null;

  // Pre-compila le variabili SOLO quando l'utente sceglie un template (non in un
  // useEffect: l'identità di `templates` cambia ad ogni refetch e sovrascriverebbe
  // i valori già digitati dall'operatore).
  const handlePickTemplate = (id: string) => {
    setTemplateId(id);
    const tpl = templates.find((t) => t.id === id);
    const count = tpl?.variables_count ?? 0;
    const mapping = tpl?.variable_mapping ?? null;
    setVars(Array.from({ length: count }, (_, i) => {
      const key = mapping?.[String(i + 1)];
      return key && contactFields ? (contactFields[key] ?? "") : "";
    }));
  };

  const noActiveNumber = activeNumbers.length === 0;

  const canSend =
    !isSending && !!numberId &&
    (mode === "text"
      ? text.trim().length > 0
      : !!selectedTemplate && vars.every((v) => v.trim().length > 0));

  const handleSend = async () => {
    if (!canSend) return;
    if (mode === "template" && selectedTemplate) {
      await onSend({
        waNumberId: numberId,
        content: `📋 ${selectedTemplate.template_name}`,
        template: {
          name: selectedTemplate.template_name,
          language: selectedTemplate.template_language,
          variables: vars,
        },
      });
    } else {
      await onSend({ waNumberId: numberId, content: text.trim(), template: null });
    }
    setText("");
    setTemplateId(null);
    setVars([]);
  };

  if (noActiveNumber) {
    return (
      <Alert className={className}>
        <AlertTriangle className="h-4 w-4" />
        <AlertDescription className="text-xs">
          Nessun numero WhatsApp attivo. Collega/attiva un numero nel Centro WhatsApp per inviare messaggi.
        </AlertDescription>
      </Alert>
    );
  }

  return (
    <div className={`space-y-3 ${className ?? ""}`}>
      {/* Riga: numero mittente + stato finestra 24h */}
      <div className="flex flex-wrap items-center gap-2">
        {activeNumbers.length > 1 && (
          <Select value={numberId ?? undefined} onValueChange={setNumberId}>
            <SelectTrigger className="h-8 w-auto min-w-[180px] text-xs">
              <SelectValue placeholder="Numero mittente" />
            </SelectTrigger>
            <SelectContent>
              {activeNumbers.map((n) => (
                <SelectItem key={n.id} value={n.id} className="text-xs">
                  {n.display_name || n.numero || "Numero"} — {n.numero}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}

        {windowLoading ? (
          <Badge variant="secondary" className="text-[11px]">
            <Clock className="mr-1 h-3 w-3" /> Verifica finestra…
          </Badge>
        ) : isOpen ? (
          <Badge variant="default" className="bg-green-100 text-green-800 hover:bg-green-100 text-[11px]">
            <Clock className="mr-1 h-3 w-3" />
            Finestra 24h aperta{window24.data?.hoursLeft != null ? ` · ~${window24.data.hoursLeft}h` : ""}
          </Badge>
        ) : (
          <Badge variant="secondary" className="bg-amber-100 text-amber-800 hover:bg-amber-100 text-[11px]">
            <AlertTriangle className="mr-1 h-3 w-3" /> Finestra 24h chiusa → serve template
          </Badge>
        )}
      </div>

      {/* Toggle testo/template, disponibile solo a finestra APERTA */}
      {isOpen && !windowLoading && (
        <div className="inline-flex rounded-md border bg-muted/40 p-0.5 text-xs">
          <button
            type="button"
            onClick={() => setMode("text")}
            className={`flex items-center gap-1 rounded px-2 py-1 ${mode === "text" ? "bg-background shadow-sm" : "text-muted-foreground"}`}
          >
            <MessageSquare className="h-3 w-3" /> Testo libero
          </button>
          <button
            type="button"
            onClick={() => setMode("template")}
            className={`flex items-center gap-1 rounded px-2 py-1 ${mode === "template" ? "bg-background shadow-sm" : "text-muted-foreground"}`}
          >
            <FileText className="h-3 w-3" /> Template
          </button>
        </div>
      )}

      {!isOpen && !windowLoading && (
        <Alert className="py-2">
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription className="text-xs">
            Il cliente non scrive da oltre 24h: per regolamento WhatsApp puoi inviare
            <b> solo un template approvato</b>. Per riaprire la finestra, attendi una sua risposta.
          </AlertDescription>
        </Alert>
      )}

      {/* Corpo: testo libero oppure template */}
      {mode === "text" ? (
        <Textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={3}
          placeholder="Scrivi il messaggio WhatsApp…"
          maxLength={4096}
        />
      ) : (
        <div className="space-y-2">
          <div className="space-y-1">
            <Label className="text-xs">Template approvato</Label>
            <Select value={templateId ?? undefined} onValueChange={handlePickTemplate}>
              <SelectTrigger className="h-9 text-xs">
                <SelectValue placeholder={templates.length ? "Scegli un template…" : "Nessun template approvato"} />
              </SelectTrigger>
              <SelectContent>
                {templates.map((t) => (
                  <SelectItem key={t.id} value={t.id} className="text-xs">
                    {t.template_name} · {t.template_language}
                    {t.variables_count > 0 ? ` · ${t.variables_count} var` : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {templates.length === 0 && (
              <p className="text-[11px] text-muted-foreground">
                Nessun template approvato. Crea e fai approvare un template nel Centro WhatsApp → Template.
              </p>
            )}
          </div>

          {selectedTemplate && selectedTemplate.variables_count > 0 && (
            <div className="space-y-1.5">
              {vars.map((v, i) => {
                const mappedKey = selectedMapping?.[String(i + 1)];
                return (
                  <div key={i} className="space-y-0.5">
                    <Label className="text-[11px] text-muted-foreground">
                      {`Variabile {{${i + 1}}}`}
                      {mappedKey ? " · compilata dal contatto" : ""}
                    </Label>
                    <Input
                      value={v}
                      onChange={(e) => setVars((prev) => prev.map((x, j) => (j === i ? e.target.value : x)))}
                      placeholder={`Valore {{${i + 1}}}`}
                      className="h-9 text-base sm:h-8 sm:text-xs"
                    />
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      <div className="flex justify-end">
        <Button size="sm" onClick={handleSend} disabled={!canSend} className="gap-1.5">
          {isSending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          Invia WhatsApp
        </Button>
      </div>
    </div>
  );
}
