import { useMemo, useState, useRef, useCallback } from "react";
import { getCatalogItem, type ConfigFieldSchema } from "@/lib/flow-node-catalog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { ScrollArea } from "@/components/ui/scroll-area";
import { X, Trash2, Filter, Save } from "lucide-react";
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
import type { TriggerFilters } from "@/types/automationBuilder";

interface FlowBuilderConfigPanelProps {
  selectedNode: Node | null;
  onUpdateData: (nodeId: string, data: Record<string, any>) => void;
  onDelete: (nodeId: string) => void;
  onClose: () => void;
  onSave?: () => void;
  companyId?: string;
}

// Item IDs that get specialized panels
const SPECIALIZED_PANELS = new Set([
  "attendi", "condition_se", "condition_multi",
  "crea_task", "aggiorna_task",
  "invia_email",
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
        <Button variant="ghost" size="icon" onClick={onClose} className="h-7 w-7">
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

          {/* Generic fields from configSchema (only if NOT specialized) */}
          {!isSpecialized && schema.map((field) => (
            <ConfigField
              key={field.id}
              field={field}
              value={nodeData[field.id]}
              onChange={(v) => handleChange(field.id, v)}
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

          {/* Save button */}
          <Button
            variant="default"
            size="sm"
            className="w-full mt-2"
            onClick={() => { onSave?.(); onClose(); }}
          >
            <Save className="mr-1.5 h-3.5 w-3.5" />
            Salva configurazione
          </Button>

          {/* Delete button */}
          <Button
            variant="destructive"
            size="sm"
            className="w-full"
            onClick={() => onDelete(selectedNode.id)}
          >
            <Trash2 className="mr-1.5 h-3.5 w-3.5" />
            Elimina nodo
          </Button>
        </div>
      </ScrollArea>
    </div>
  );
}

// ── Dynamic config field (for non-specialized types) ──

function ConfigField({
  field,
  value,
  onChange,
}: {
  field: ConfigFieldSchema;
  value: any;
  onChange: (v: any) => void;
}) {
  return (
    <div className="space-y-2">
      <Label className="text-xs font-medium">
        {field.label}
        {field.required && <span className="ml-0.5 text-destructive">*</span>}
      </Label>

      {field.type === "text" && (
        <Input
          value={value ?? field.defaultValue ?? ""}
          onChange={(e) => onChange(e.target.value)}
          placeholder={field.placeholder}
          className="h-9 text-sm"
        />
      )}

      {field.type === "textarea" && (
        <Textarea
          value={value ?? field.defaultValue ?? ""}
          onChange={(e) => onChange(e.target.value)}
          placeholder={field.placeholder}
          className="text-sm min-h-[60px]"
        />
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
        <Input
          value={value ?? ""}
          onChange={(e) => onChange(e.target.value)}
          placeholder={field.placeholder ?? "ID utente o {{variabile}}"}
          className="h-9 text-sm"
        />
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
        <Input
          value={Array.isArray(value) ? value.join(", ") : (value ?? "")}
          onChange={(e) => onChange(e.target.value.split(",").map((s: string) => s.trim()).filter(Boolean))}
          placeholder={field.placeholder ?? "tag1, tag2, ..."}
          className="h-9 text-sm"
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

      {field.helpText && (
        <p className="text-[11px] text-muted-foreground">{field.helpText}</p>
      )}
    </div>
  );
}
