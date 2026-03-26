import { useMemo, useState, useEffect, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { getCatalogItem, type ConfigFieldSchema } from "@/lib/flow-node-catalog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { ScrollArea } from "@/components/ui/scroll-area";
import { X, Trash2, Filter, Save, CheckCircle, RotateCcw } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { VariablePicker } from "./config-panels/VariablePicker";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import type { Node } from "@xyflow/react";

import { DelayConfigPanel } from "./config-panels/DelayConfigPanel";
import { ConditionConfigPanel } from "./config-panels/ConditionConfigPanel";
import { TaskConfigPanel } from "./config-panels/TaskConfigPanel";
import { EmailConfigPanel } from "./config-panels/EmailConfigPanel";
import { TriggerConditionBuilder } from "@/components/marketing/automations/TriggerConditionBuilder";
import { TagSelector } from "@/components/marketing/TagSelector";
import type { TriggerFilters } from "@/types/automationBuilder";

interface FlowBuilderConfigPanelProps {
  selectedNode: Node | null;
  onUpdateData: (nodeId: string, data: Record<string, any>) => void;
  onDelete: (nodeId: string) => void;
  onClose: () => void;
  onSave?: () => void;
  companyId?: string;
  triggerItemId?: string;
}

// Item IDs that get specialized panels
const SPECIALIZED_PANELS = new Set([
  "attendi", "condition_se", "condition_multi",
  "crea_task", "aggiorna_task",
  "invia_email",
  "aggiungi_tag", "rimuovi_tag",
]);

// Triggers where the enrolled entity IS a contact (or has a directly linked contact)
const CONTACT_TRIGGER_CATEGORIES = new Set([
  "contact", "opportunity", "appointment", "order", "invoice", "quote", "ticket", "task",
]);

// Map flow-node-catalog itemId → TriggerConditionBuilder category
const TRIGGER_CATEGORY_MAP: Record<string, string> = {
  // CRM / Contatti
  contatto_creato: "contact",
  contatto_aggiornato: "contact",
  contatto_assegnato: "contact",
  tag_aggiunto: "contact",
  tag_rimosso: "contact",
  campo_custom_aggiornato: "contact",
  // Opportunità
  opportunita_creata: "opportunity",
  opportunita_stage_cambiato: "opportunity",
  opportunita_vinta: "opportunity",
  opportunita_persa: "opportunity",
  // Appuntamenti
  appuntamento_creato: "appointment",
  appuntamento_confermato: "appointment",
  appuntamento_completato: "appointment",
  appuntamento_no_show: "appointment",
  appuntamento_imminente: "appointment",
  // Comunicazione
  email_aperta: "communication",
  email_cliccata: "communication",
  whatsapp_ricevuto: "communication",
  campagna_facebook_lead: "social_media",
  // Ordini
  ordine_creato: "order",
  ordine_stato_cambiato: "order",
  ordine_in_ritardo: "order",
  // Fatturazione
  fattura_creata: "invoice",
  fattura_scaduta: "invoice",
  pagamento_ricevuto: "invoice",
  costo_registrato: "invoice",
  // Preventivi
  preventivo_creato: "quote",
  preventivo_accettato: "quote",
  preventivo_rifiutato: "quote",
  preventivo_in_scadenza: "quote",
  // Ticket
  ticket_creato: "ticket",
  ticket_stato_cambiato: "ticket",
  ticket_senza_risposta: "ticket",
  // Task
  task_creato: "task",
  task_completato: "task",
  task_scaduto: "task",
  // Cantiere
  cantiere_creato: "construction",
  cantiere_fase_completata: "construction",
  cantiere_in_ritardo: "construction",
  // Magazzino
  scorta_minima: "order",
  prodotto_esaurito: "order",
  carico_magazzino: "order",
  // HR
  dipendente_creato: "contact",
  contratto_in_scadenza: "contact",
  ferie_richiesta: "contact",
  // Schedulati
  cron_giornaliero: "system",
  cron_settimanale: "system",
  cron_mensile: "system",
  manuale: "system",
  // Sistema
  webhook_ricevuto: "system",
  scheduler_cron: "system",
  modulo_inviato: "system",
  // AI
  conversazione_ai_terminata: "contact",
  appuntamento_prenotato_da_ai: "appointment",
};

export function FlowBuilderConfigPanel({
  selectedNode,
  onUpdateData,
  onDelete,
  onClose,
  onSave,
  companyId,
  triggerItemId,
}: FlowBuilderConfigPanelProps) {
  const catalog = useMemo(
    () => (selectedNode ? getCatalogItem(selectedNode.data?.itemId as string) : null),
    [selectedNode?.id, selectedNode?.data?.itemId]
  );

  // Track unsaved changes
  const [isDirty, setIsDirty] = useState(false);
  const [showUnsavedDialog, setShowUnsavedDialog] = useState(false);

  if (!selectedNode) return null;

  const schema = catalog?.configSchema ?? [];
  const nodeData = selectedNode.data as Record<string, any>;
  const itemId = nodeData.itemId as string;
  const nodeType = nodeData.nodeType as string;

  const handleChange = (fieldId: string, value: any) => {
    setIsDirty(true);
    onUpdateData(selectedNode.id, { ...nodeData, [fieldId]: value });
  };

  const handleCloseAttempt = () => {
    if (isDirty) {
      setShowUnsavedDialog(true);
    } else {
      onClose();
    }
  };

  const handleSaveAndClose = () => {
    onSave?.();
    setIsDirty(false);
    setShowUnsavedDialog(false);
    onClose();
  };

  const handleDiscardAndClose = () => {
    setIsDirty(false);
    setShowUnsavedDialog(false);
    onClose();
  };

  const isSpecialized = SPECIALIZED_PANELS.has(itemId);

  // Determine trigger category for filter builder
  const triggerCategory = TRIGGER_CATEGORY_MAP[itemId] || null;
  const isTrigger = nodeType === "trigger" || catalog?.kind === "trigger";

  // Compute trigger entity type from the flow's trigger item
  const triggerEntityCategory = triggerItemId ? (TRIGGER_CATEGORY_MAP[triggerItemId] ?? null) : null;
  const triggerProvidesContact = !!(triggerEntityCategory && CONTACT_TRIGGER_CATEGORIES.has(triggerEntityCategory));

  // Filters state
  const filters: TriggerFilters = nodeData.trigger_filters || { logic: "AND", conditions: [] };
  const handleFiltersChange = (newFilters: TriggerFilters) => {
    onUpdateData(selectedNode.id, { ...nodeData, trigger_filters: newFilters });
  };

  return (
    <div className="flex h-full w-[380px] flex-col border-l bg-background">
      {/* Header */}
      <div className="flex items-center justify-between border-b px-5 py-3.5">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            {catalog?.kind ?? "Nodo"}
          </p>
          <p className="text-sm font-medium mt-0.5">{catalog?.label ?? nodeData.label}</p>
        </div>
        <Button variant="ghost" size="icon" onClick={handleCloseAttempt} className="h-7 w-7">
          <X className="h-4 w-4" />
        </Button>
      </div>

      <ScrollArea className="flex-1">
        <div className="space-y-5 p-5">
          {/* Label field always */}
          <div className="space-y-2">
            <Label className="text-xs font-medium">Etichetta nodo</Label>
            <Input
              value={(nodeData.label as string) || ""}
              onChange={(e) => handleChange("label", e.target.value)}
              placeholder={catalog?.label ?? "Etichetta"}
              className="h-9 text-sm"
            />
          </div>

          {/* Note text for note nodes */}
          {selectedNode.type === "note" && (
            <div className="space-y-2">
              <Label className="text-xs font-medium">Testo nota</Label>
              <Textarea
                value={(nodeData.note_text as string) || ""}
                onChange={(e) => handleChange("note_text", e.target.value)}
                placeholder="Scrivi una nota..."
                className="text-sm min-h-[80px]"
              />
            </div>
          )}

          {/* Specialized panels */}
          {itemId === "attendi" && (
            <DelayConfigPanel config={nodeData} onChange={handleChange} />
          )}
          {(itemId === "condition_se" || itemId === "condition_multi") && (
            <ConditionConfigPanel config={nodeData} onChange={handleChange} />
          )}
          {(itemId === "crea_task" || itemId === "aggiorna_task") && (
            <TaskConfigPanel config={nodeData} onChange={handleChange} />
          )}
          {itemId === "invia_email" && (
            <EmailConfigPanel config={nodeData} onChange={handleChange} />
          )}
          {(itemId === "aggiungi_tag" || itemId === "rimuovi_tag") && (
            <TagActionPanel
              config={nodeData}
              onChange={handleChange}
              triggerProvidesContact={triggerProvidesContact}
              actionType={itemId === "aggiungi_tag" ? "aggiungi" : "rimuovi"}
            />
          )}

          {/* Generic fields from configSchema (only if NOT specialized) */}
          {!isSpecialized && schema.map((field) => (
            <ConfigField
              key={field.id}
              field={field}
              value={nodeData[field.id]}
              onChange={(v) => handleChange(field.id, v)}
              triggerProvidesContact={triggerProvidesContact}
              companyId={companyId}
            />
          ))}

          {/* Dynamic Filters section for triggers */}
          {isTrigger && triggerCategory && (
            <div className="space-y-3 pt-2">
              <div className="flex items-center gap-2 border-t pt-4">
                <Filter className="h-3.5 w-3.5 text-primary" />
                <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Filtri
                </Label>
              </div>
              <p className="text-[11px] text-muted-foreground">
                Aggiungi condizioni per filtrare quando questo trigger si attiva.
              </p>
              <TriggerConditionBuilder
                triggerCategory={triggerCategory}
                filters={filters}
                onChange={handleFiltersChange}
                companyId={companyId}
              />
            </div>
          )}

          {/* Description */}
          {catalog?.description && (
            <div className="rounded-lg border bg-muted/50 p-3.5">
              <p className="text-[11px] leading-relaxed text-muted-foreground">{catalog.description}</p>
            </div>
          )}

          {/* Compact action buttons on one row */}
          <div className="flex gap-2 mt-2">
            <Button
              variant="default"
              size="sm"
              className="flex-1"
              onClick={handleSaveAndClose}
            >
              <Save className="mr-1 h-3.5 w-3.5" />
              Salva
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="flex-1 text-destructive hover:text-destructive"
              onClick={() => onDelete(selectedNode.id)}
            >
              <Trash2 className="mr-1 h-3.5 w-3.5" />
              Elimina
            </Button>
          </div>
        </div>
      </ScrollArea>

      {/* Unsaved changes confirmation dialog */}
      <AlertDialog open={showUnsavedDialog} onOpenChange={setShowUnsavedDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Modifiche non salvate</AlertDialogTitle>
            <AlertDialogDescription>
              Hai modifiche non salvate. Vuoi salvarle prima di chiudere?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setShowUnsavedDialog(false)}>Annulla</AlertDialogCancel>
            <Button variant="outline" size="sm" onClick={handleDiscardAndClose}>
              Chiudi senza salvare
            </Button>
            <AlertDialogAction onClick={handleSaveAndClose}>
              Salva e chiudi
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

// ── Specialized panel for Aggiungi / Rimuovi tag ──

const AUTO_CONTACT_VAR = "{{contact.id}}";

function TagActionPanel({
  config,
  onChange,
  triggerProvidesContact,
  actionType,
}: {
  config: Record<string, any>;
  onChange: (field: string, value: any) => void;
  triggerProvidesContact: boolean;
  actionType: "aggiungi" | "rimuovi";
}) {
  const [overrideContact, setOverrideContact] = useState(false);

  // Auto-fill contact_id when the trigger provides a contact
  useEffect(() => {
    if (triggerProvidesContact && !config.contact_id) {
      onChange("contact_id", AUTO_CONTACT_VAR);
    }
  }, [triggerProvidesContact]);

  const showAutoContact = triggerProvidesContact && !overrideContact;
  const tags: string[] = Array.isArray(config.tags)
    ? config.tags
    : config.tags
    ? String(config.tags).split(",").map((s: string) => s.trim()).filter(Boolean)
    : [];

  return (
    <div className="space-y-4">
      {/* Contact ID */}
      <div className="space-y-2">
        <Label className="text-xs font-medium">
          ID Contatto <span className="text-destructive">*</span>
        </Label>

        {showAutoContact ? (
          <div className="flex items-center gap-2 rounded-lg border border-green-200 dark:border-green-900 bg-green-500/10 px-3 py-2.5">
            <CheckCircle className="h-4 w-4 text-green-500 shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-xs font-medium text-green-700 dark:text-green-400">Contatto dal trigger</p>
              <p className="text-[10px] text-muted-foreground font-mono mt-0.5">{AUTO_CONTACT_VAR}</p>
            </div>
            <Button
              variant="ghost"
              size="sm"
              className="h-6 text-[11px] px-2 text-muted-foreground hover:text-foreground"
              onClick={() => setOverrideContact(true)}
            >
              Cambia
            </Button>
          </div>
        ) : (
          <div className="space-y-1">
            <Input
              value={config.contact_id ?? ""}
              onChange={(e) => onChange("contact_id", e.target.value)}
              placeholder={AUTO_CONTACT_VAR}
              className="h-9 text-sm font-mono"
            />
            {triggerProvidesContact && (
              <button
                type="button"
                className="flex items-center gap-1 text-[11px] text-primary hover:underline"
                onClick={() => { onChange("contact_id", AUTO_CONTACT_VAR); setOverrideContact(false); }}
              >
                <RotateCcw className="h-3 w-3" />
                Usa contatto dal trigger
              </button>
            )}
            {!triggerProvidesContact && (
              <p className="text-[10px] text-muted-foreground">
                Inserisci l'ID del contatto o una variabile come <span className="font-mono">{AUTO_CONTACT_VAR}</span>.
                Aggiungi un trigger al flusso per il riempimento automatico.
              </p>
            )}
          </div>
        )}
      </div>

      {/* Tags */}
      <div className="space-y-2">
        <Label className="text-xs font-medium">
          {actionType === "aggiungi" ? "Tag da aggiungere" : "Tag da rimuovere"}{" "}
          <span className="text-destructive">*</span>
        </Label>
        <TagSelector
          selectedTags={tags}
          onTagsChange={(t) => onChange("tags", t)}
        />
        <p className="text-[10px] text-muted-foreground">
          Seleziona tag esistenti o creane di nuovi direttamente qui.
        </p>
      </div>
    </div>
  );
}

// Fields that should auto-fill with the contact from the trigger
const AUTO_FILL_CONTACT_FIELDS = new Set(["contact_id", "entity_id", "cliente_id"]);

// ── Dynamic config field (for non-specialized types) ──

function ConfigField({
  field,
  value,
  onChange,
  triggerProvidesContact,
  companyId,
}: {
  field: ConfigFieldSchema;
  value: any;
  onChange: (v: any) => void;
  triggerProvidesContact?: boolean;
  companyId?: string;
}) {
  const [overrideAutoFill, setOverrideAutoFill] = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  // Auto-fill contact_id / entity_id / cliente_id from trigger
  const isAutoFillField = AUTO_FILL_CONTACT_FIELDS.has(field.id);
  useEffect(() => {
    if (isAutoFillField && triggerProvidesContact && !value) {
      onChange(AUTO_CONTACT_VAR);
    }
  }, [triggerProvidesContact, isAutoFillField]);

  const showAutoContact = isAutoFillField && triggerProvidesContact && !overrideAutoFill && value === AUTO_CONTACT_VAR;

  // Fetch company users for user_select fields
  const { data: companyUsers = [] } = useQuery({
    queryKey: ["config-users", companyId],
    queryFn: async () => {
      if (!companyId) return [];
      const { data } = await supabase
        .from("profiles")
        .select("id, first_name, last_name, email")
        .eq("company_id", companyId)
        .order("first_name");
      return data ?? [];
    },
    enabled: field.type === "user_select" && !!companyId,
    staleTime: 60_000,
  });

  // Helper: insert variable into text/textarea
  const insertVariable = (variable: string) => {
    const el = inputRef.current ?? textareaRef.current;
    if (el) {
      const start = el.selectionStart ?? (value?.length ?? 0);
      const end = el.selectionEnd ?? start;
      const current = String(value ?? "");
      onChange(current.slice(0, start) + variable + current.slice(end));
    } else {
      onChange((String(value ?? "")) + variable);
    }
  };

  // Auto-fill badge for contact ID fields
  if (showAutoContact) {
    return (
      <div className="space-y-2">
        <Label className="text-xs font-medium">
          {field.label}
          {field.required && <span className="ml-0.5 text-destructive">*</span>}
        </Label>
        <div className="flex items-center gap-2 rounded-lg border border-green-200 dark:border-green-900 bg-green-500/10 px-3 py-2.5">
          <CheckCircle className="h-4 w-4 text-green-500 shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-xs font-medium text-green-700 dark:text-green-400">Contatto dal trigger</p>
            <p className="text-[10px] text-muted-foreground font-mono mt-0.5">{AUTO_CONTACT_VAR}</p>
          </div>
          <Button
            variant="ghost"
            size="sm"
            className="h-6 text-[11px] px-2 text-muted-foreground hover:text-foreground"
            onClick={() => setOverrideAutoFill(true)}
          >
            Cambia
          </Button>
        </div>
        {field.helpText && <p className="text-[11px] text-muted-foreground">{field.helpText}</p>}
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <Label className="text-xs font-medium">
        {field.label}
        {field.required && <span className="ml-0.5 text-destructive">*</span>}
      </Label>

      {field.type === "text" && (
        <div className="flex gap-1">
          <Input
            ref={inputRef}
            value={value ?? field.defaultValue ?? ""}
            onChange={(e) => onChange(e.target.value)}
            placeholder={field.placeholder}
            className="h-9 text-sm flex-1"
          />
          {field.supportsVariables && <VariablePicker onInsert={insertVariable} />}
        </div>
      )}

      {field.type === "textarea" && (
        <div className="space-y-1">
          <Textarea
            ref={textareaRef}
            value={value ?? field.defaultValue ?? ""}
            onChange={(e) => onChange(e.target.value)}
            placeholder={field.placeholder}
            className="text-sm min-h-[60px]"
          />
          {field.supportsVariables && (
            <div className="flex justify-end">
              <VariablePicker onInsert={insertVariable} />
            </div>
          )}
        </div>
      )}

      {field.type === "number" && (
        <Input
          type="number"
          value={value ?? field.defaultValue ?? ""}
          onChange={(e) => onChange(Number(e.target.value))}
          min={field.min}
          max={field.max}
          placeholder={field.placeholder}
          className="h-9 text-sm"
        />
      )}

      {field.type === "select" && field.options && (() => {
        const emptyOpt = field.options.find((o) => o.value === "");
        const validOpts = field.options.filter((o) => o.value !== "");
        const NONE_SENTINEL = "__none__";
        const currentVal = value ?? field.defaultValue ?? "";
        const selectVal = currentVal === "" ? NONE_SENTINEL : currentVal;
        return (
          <Select
            value={selectVal}
            onValueChange={(v) => onChange(v === NONE_SENTINEL ? "" : v)}
          >
            <SelectTrigger className="h-9 text-sm">
              <SelectValue placeholder={emptyOpt?.label ?? "Seleziona..."} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={NONE_SENTINEL}>
                {emptyOpt?.label ?? "Nessuno"}
              </SelectItem>
              {validOpts.map((opt) => (
                <SelectItem key={opt.value} value={opt.value}>
                  {opt.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        );
      })()}

      {field.type === "user_select" && (
        companyUsers.length > 0 ? (
          <Select value={value ?? ""} onValueChange={onChange}>
            <SelectTrigger className="h-9 text-sm">
              <SelectValue placeholder="Seleziona utente..." />
            </SelectTrigger>
            <SelectContent>
              {companyUsers.map((u: any) => (
                <SelectItem key={u.id} value={u.id}>
                  {[u.first_name, u.last_name].filter(Boolean).join(" ") || u.email || u.id}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        ) : (
          <Input
            value={value ?? ""}
            onChange={(e) => onChange(e.target.value)}
            placeholder={field.placeholder ?? "ID utente o {{variabile}}"}
            className="h-9 text-sm"
          />
        )
      )}

      {field.type === "entity_select" && (
        <Input
          value={value ?? ""}
          onChange={(e) => onChange(e.target.value)}
          placeholder={field.placeholder ?? "ID entità o {{variabile}}"}
          className="h-9 text-sm"
        />
      )}

      {field.type === "boolean" && (
        <Switch checked={!!value} onCheckedChange={onChange} />
      )}

      {(field.type === "tags" || field.type === "tag_input") && (
        <TagSelector
          selectedTags={Array.isArray(value) ? value : (value ? String(value).split(",").map((s: string) => s.trim()).filter(Boolean) : [])}
          onTagsChange={onChange}
        />
      )}

      {field.type === "json_editor" && (
        <Textarea
          value={value ?? field.defaultValue ?? ""}
          onChange={(e) => onChange(e.target.value)}
          placeholder={field.placeholder ?? "{}"}
          className="text-sm min-h-[80px] font-mono"
        />
      )}

      {field.type === "date" && (
        <Input
          type="date"
          value={value ?? field.defaultValue ?? ""}
          onChange={(e) => onChange(e.target.value)}
          className="h-9 text-sm"
        />
      )}

      {field.type === "time" && (
        <Input
          type="time"
          value={value ?? field.defaultValue ?? ""}
          onChange={(e) => onChange(e.target.value)}
          className="h-9 text-sm"
        />
      )}

      {/* Override back to auto-fill if applicable */}
      {isAutoFillField && triggerProvidesContact && overrideAutoFill && (
        <button
          type="button"
          className="flex items-center gap-1 text-[11px] text-primary hover:underline"
          onClick={() => { onChange(AUTO_CONTACT_VAR); setOverrideAutoFill(false); }}
        >
          <RotateCcw className="h-3 w-3" />
          Usa contatto dal trigger
        </button>
      )}

      {field.helpText && (
        <p className="text-[11px] text-muted-foreground">{field.helpText}</p>
      )}
    </div>
  );
}
