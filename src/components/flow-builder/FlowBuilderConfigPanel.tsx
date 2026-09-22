import { useMemo, useState, useEffect, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { seedConfigDefaults, getCatalogItem, campiObbligatoriMancanti, type ConfigFieldSchema } from "@/lib/flow-node-catalog";
import {
  NOTIFICATION_TEMPLATES,
  templatePerTrigger,
  variabiliNonRisolvibili,
} from "@/lib/notification-templates";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { ScrollArea } from "@/components/ui/scroll-area";
import { AlertTriangle, X, Trash2, Filter, Save, CheckCircle, RotateCcw, ChevronsUpDown } from "lucide-react";
import { EvidenzaObbligatoria, campoVuoto as campoVuotoTag } from "./config-panels/EvidenzaObbligatoria";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { useCompanyStaffUsers } from "@/hooks/useCompanyStaffUsers";
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
import { EmailBodyEditor } from "./config-panels/EmailBodyEditor";
import { EmailPreviewActions } from "./config-panels/EmailPreviewActions";
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
  compleanno_contatto: "contact",
  data_personalizzata: "contact",
  form_compilato: "contact",
  // Opportunità
  opportunita_creata: "opportunity",
  opportunita_stage_cambiato: "opportunity",
  opportunita_vinta: "opportunity",
  opportunita_persa: "opportunity",
  opportunita_stale: "opportunity",
  // Appuntamenti
  appuntamento_creato: "appointment",
  appuntamento_confermato: "appointment",
  appuntamento_completato: "appointment",
  appuntamento_no_show: "appointment",
  appuntamento_annullato: "appointment",
  appuntamento_imminente: "appointment",
  // Comunicazione
  email_aperta: "communication",
  email_cliccata: "communication",
  whatsapp_ricevuto: "communication",
  email_ricevuta: "communication",
  // Il lead Facebook iscrive un CONTATTO (meta-process-leads → entity_type
  // 'contact'): categoria "contact" così i filtri offrono i campi contatto e
  // le azioni sanno che il contatto arriva dal trigger (badge verde, niente
  // campo "ID Contatto" da compilare a mano).
  campagna_facebook_lead: "contact",
  // Ordini
  ordine_creato: "order",
  ordine_stato_cambiato: "order",
  commessa_data_installazione: "order",
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

  // Snapshot dei dati del nodo all'apertura (ri-catturato al cambio nodo):
  // handleChange applica SUBITO ogni modifica al mirror, quindi "Chiudi senza
  // salvare" deve poter ripristinare i valori pre-modifica — senza snapshot
  // scartava il dialog ma teneva le modifiche.
  const initialDataRef = useRef<Record<string, any> | null>(null);
  const snapshotNodeIdRef = useRef<string | null>(null);
  useEffect(() => {
    if (!selectedNode) {
      initialDataRef.current = null;
      snapshotNodeIdRef.current = null;
      return;
    }
    if (selectedNode.id !== snapshotNodeIdRef.current) {
      snapshotNodeIdRef.current = selectedNode.id;
      initialDataRef.current = { ...(selectedNode.data as Record<string, any>) };
      setIsDirty(false);
      setShowUnsavedDialog(false);
      // Nodi nati PRIMA della semina dei default (o da template): ciò che il
      // pannello mostra come default va scritto nel nodo, altrimenti la
      // pubblicazione lo dichiara "obbligatorio non compilato" e il motore
      // non lo riceve (il caso Priorità del crea_task).
      const dati = selectedNode.data as Record<string, any>;
      const defaults = seedConfigDefaults(String(dati?.itemId ?? ""));
      const mancanti: Record<string, any> = {};
      for (const [k, v] of Object.entries(defaults)) {
        if (dati?.[k] == null || dati[k] === "") mancanti[k] = v;
      }
      if (Object.keys(mancanti).length > 0) {
        onUpdateData(selectedNode.id, { ...dati, ...mancanti });
      }
    }
  }, [selectedNode, onUpdateData]);

  if (!selectedNode) return null;

  const schema = catalog?.configSchema ?? [];
  const nodeData = selectedNode.data as Record<string, any>;
  // Validazione LIVE per-campo: stessa regola della checklist di pubblicazione,
  // ma mostrata QUI mentre compili — scoprire i buchi solo al "Pubblica"
  // significa riaprire ogni nodo a caccia del campo dimenticato.
  const itemId = nodeData.itemId as string;
  const campiMancanti = campiObbligatoriMancanti(itemId, nodeData);
  const nodeType = nodeData.nodeType as string;

  const handleChange = (fieldId: string, value: any) => {
    setIsDirty(true);
    onUpdateData(selectedNode.id, { ...nodeData, [fieldId]: value });
  };

  // Patch multi-campo in un colpo solo (es. cambio pipeline → azzera la fase):
  // due handleChange consecutivi si perderebbero il primo aggiornamento.
  const handlePatch = (patch: Record<string, any>) => {
    setIsDirty(true);
    onUpdateData(selectedNode.id, { ...nodeData, ...patch });
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
    // Ripristina i valori pre-modifica nel mirror/canvas: le modifiche sono
    // già state applicate in tempo reale da handleChange/handleFiltersChange.
    if (isDirty && initialDataRef.current) {
      onUpdateData(selectedNode.id, initialDataRef.current);
    }
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
    // Anche i filtri sono modifiche applicate subito: senza isDirty il
    // pannello si chiudeva senza chiedere e senza possibilità di ripristino.
    setIsDirty(true);
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
            <EmailConfigPanel
              config={nodeData}
              onChange={handleChange}
              onPatch={handlePatch}
              triggerItemId={triggerItemId}
              companyId={companyId}
            />
          )}
          {(itemId === "aggiungi_tag" || itemId === "rimuovi_tag") && (
            <TagActionPanel
              config={nodeData}
              onChange={handleChange}
              triggerProvidesContact={triggerProvidesContact}
              actionType={itemId === "aggiungi_tag" ? "aggiungi" : "rimuovi"}
            />
          )}

          {/* Template pronti per i nodi che spediscono un messaggio.
              Un riquadro vuoto è il motivo per cui un nodo "Notifica interna"
              è finito in produzione senza testo: qui si parte da un modello. */}
          {!isSpecialized && schema.some((f) => f.id === "messaggio") && (
            <TemplateMessaggioPicker
              config={nodeData}
              onPatch={handlePatch}
              triggerItemId={triggerItemId}
              haOggetto={schema.some((f) => f.id === "oggetto")}
            />
          )}

          {/* Generic fields from configSchema (only if NOT specialized) */}
          {!isSpecialized && schema.map((field) => {
            const mancante = campiMancanti.some((f) => f.id === field.id);
            return (
              <div key={field.id} className={mancante ? "rounded-lg bg-destructive/5 ring-1 ring-destructive/40 p-2 -mx-2" : undefined}>
                <ConfigField
                  field={field}
                  value={nodeData[field.id]}
                  onChange={(v) => handleChange(field.id, v)}
                  onPatch={handlePatch}
                  nodeConfig={nodeData}
                  triggerProvidesContact={triggerProvidesContact}
                  companyId={companyId}
                  triggerItemId={triggerItemId}
                />
                {mancante && <p className="mt-1 text-[11px] font-medium text-destructive">Campo obbligatorio: da compilare prima di pubblicare.</p>}
              </div>
            );
          })}

          {/* Anteprima + invio di prova per il nodo email super-admin */}
          {itemId === "invia_email_admin_azienda" && (
            <EmailPreviewActions
              oggetto={nodeData.oggetto}
              corpo={nodeData.corpo}
              mittenteNome={nodeData.mittente_nome}
            />
          )}

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

          {campiMancanti.length > 0 && (
            <div className="flex items-start gap-1.5 rounded-lg border border-destructive/40 bg-destructive/5 px-2.5 py-2 text-[11px] text-destructive">
              <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" />
              <span>Da completare: {campiMancanti.map((f) => f.label).join(", ")}.</span>
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

// ── Template pronti per i messaggi di notifica ──
//
// Due lavori in uno: dare un punto di partenza scritto bene (un riquadro vuoto
// resta vuoto, e a runtime il nodo fallisce) e avvisare quando il testo contiene
// una variabile che il motore non sa risolvere — quella non dà errore, lascia
// un buco nel messaggio e nessuno se ne accorge.
function TemplateMessaggioPicker({
  config,
  onPatch,
  triggerItemId,
  haOggetto,
}: {
  config: Record<string, any>;
  onPatch: (patch: Record<string, any>) => void;
  triggerItemId?: string;
  haOggetto: boolean;
}) {
  const templates = useMemo(() => templatePerTrigger(triggerItemId), [triggerItemId]);
  const suggeriti = useMemo(
    () => new Set(templates.filter((t) => t.triggerSuggeriti?.includes(triggerItemId ?? "")).map((t) => t.id)),
    [templates, triggerItemId],
  );
  const buchi = useMemo(
    () => variabiliNonRisolvibili(`${config.messaggio ?? ""} ${config.oggetto ?? ""}`),
    [config.messaggio, config.oggetto],
  );

  const applica = (id: string) => {
    const t = NOTIFICATION_TEMPLATES.find((x) => x.id === id);
    if (!t) return;
    onPatch(haOggetto ? { oggetto: t.oggetto, messaggio: t.messaggio } : { messaggio: t.messaggio });
  };

  return (
    <div className="space-y-2 rounded-lg border border-dashed bg-muted/40 p-3">
      <Label className="text-xs font-medium">Parti da un modello</Label>
      <Select value="" onValueChange={applica}>
        <SelectTrigger className="h-9">
          <SelectValue placeholder="Scegli un modello…" />
        </SelectTrigger>
        <SelectContent>
          {templates.map((t) => (
            <SelectItem key={t.id} value={t.id}>
              <span className="flex flex-col items-start">
                <span className="flex items-center gap-1.5">
                  {t.label}
                  {suggeriti.has(t.id) && (
                    <span className="rounded bg-primary/10 px-1 text-[10px] font-medium text-primary">
                      consigliato
                    </span>
                  )}
                </span>
                <span className="text-[11px] text-muted-foreground">{t.descrizione}</span>
              </span>
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <p className="text-[11px] text-muted-foreground">
        Sovrascrive {haOggetto ? "oggetto e messaggio" : "il messaggio"}. Poi personalizzalo come vuoi.
      </p>
      {buchi.length > 0 && (
        <p className="text-[11px] font-medium text-amber-600">
          Attenzione: {buchi.map((b) => `{{contatto.${b}}}`).join(", ")}{" "}
          {buchi.length === 1 ? "non esiste" : "non esistono"} e {buchi.length === 1 ? "verrà sostituita" : "verranno sostituite"} con
          uno spazio vuoto nel messaggio inviato.
        </p>
      )}
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
  const tags: string[] = Array.isArray(config.tags)
    ? config.tags
    : config.tags
    ? String(config.tags).split(",").map((s: string) => s.trim()).filter(Boolean)
    : [];

  return (
    <div className="space-y-4">
      {/* Il motore applica SEMPRE i tag al contatto iscritto al flusso
          (entityId dell'enrollment): un campo "ID Contatto" qui era solo
          rumore che confondeva — l'executor lo ignorava comunque. */}
      <div className="flex items-center gap-2 rounded-lg border border-green-200 dark:border-green-900 bg-green-500/10 px-3 py-2.5">
        <CheckCircle className="h-4 w-4 text-green-500 shrink-0" />
        <p className="text-xs text-green-700 dark:text-green-400">
          {triggerProvidesContact
            ? "Agisce sul contatto che attiva il flusso."
            : "Agisce sul contatto iscritto al flusso dal trigger."}
        </p>
      </div>

      {/* Tags */}
      <div className="space-y-2">
        <EvidenzaObbligatoria mostra={campoVuotoTag(tags)}>
        <Label className="text-xs font-medium">
          {actionType === "aggiungi" ? "Tag da aggiungere" : "Tag da rimuovere"}{" "}
          <span className="text-destructive">*</span>
        </Label>
        <TagSelector
          selectedTags={tags}
          onTagsChange={(t) => onChange("tags", t)}
        />
        </EvidenzaObbligatoria>
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
  onPatch,
  nodeConfig,
  triggerProvidesContact,
  companyId,
  triggerItemId,
}: {
  field: ConfigFieldSchema;
  value: any;
  onChange: (v: any) => void;
  onPatch?: (patch: Record<string, any>) => void;
  nodeConfig?: Record<string, any>;
  triggerProvidesContact?: boolean;
  companyId?: string;
  triggerItemId?: string;
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

  const { data: companyUsers = [] } = useCompanyStaffUsers(
    field.type === "user_select" || field.type === "user_multi_select" ? companyId : undefined,
  );

  // Automazioni pubblicate per il picker "flow_select" (azioni cross-flusso).
  const { data: flussiPubblicati = [] } = useQuery({
    queryKey: ["flow-select-published", companyId],
    enabled: field.type === "flow_select" && !!companyId,
    staleTime: 60 * 1000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("automation_flows")
        .select("id, name, status")
        .eq("company_id", companyId!)
        .eq("status", "published")
        .order("name");
      if (error) throw error;
      return (data ?? []) as { id: string; name: string }[];
    },
  });

  // ── Dati reali per i picker stile GHL ──
  // Pagine Meta collegate (servono anche al multi-select moduli per filtrare
  // i moduli della pagina scelta: meta_lead_forms.page_asset_id → meta_assets.id).
  const wantsMetaData = field.type === "meta_page_select" || field.type === "meta_form_multi_select";
  const { data: metaPages = [] } = useQuery({
    queryKey: ["flow-meta-pages", companyId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("meta_assets")
        .select("id, asset_id, asset_name")
        .eq("company_id", companyId!)
        .eq("asset_type", "page")
        .eq("selected", true)
        .order("asset_name");
      if (error) throw error;
      return data || [];
    },
    enabled: !!companyId && wantsMetaData,
    staleTime: 5 * 60 * 1000,
  });
  const { data: metaForms = [] } = useQuery({
    queryKey: ["flow-meta-forms", companyId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("meta_lead_forms")
        .select("id, form_id, form_name, status, page_asset_id")
        .eq("company_id", companyId!)
        .order("form_name");
      if (error) throw error;
      return data || [];
    },
    enabled: !!companyId && field.type === "meta_form_multi_select",
    staleTime: 5 * 60 * 1000,
  });

  // Numeri WhatsApp Locale della piattaforma (azione "Invia WhatsApp Locale").
  const { data: numeriWhatsappLocale = [] } = useQuery({
    queryKey: ["flow-openwa-numbers"],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("openwa_numbers")
        .select("id, display_name, numero, stato")
        .is("deleted_at", null)
        .order("display_name");
      if (error) throw error;
      return (data ?? []) as { id: string; display_name: string | null; numero: string | null; stato: string }[];
    },
    enabled: field.type === "whatsapp_locale_number_select",
    staleTime: 60 * 1000,
  });

  // Pipeline e fasi CRM reali (azione "Crea opportunità")
  const { data: crmPipelines = [] } = useQuery({
    queryKey: ["flow-pipelines", companyId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("marketing_pipelines")
        .select("id, name")
        .eq("company_id", companyId!)
        .order("name");
      if (error) throw error;
      return data || [];
    },
    enabled: !!companyId && field.type === "pipeline_select",
    staleTime: 5 * 60 * 1000,
  });
  const stagesPipelineId = field.type === "pipeline_stage_select" ? nodeConfig?.pipeline_id : undefined;
  const { data: crmStages = [] } = useQuery({
    queryKey: ["flow-pipeline-stages", stagesPipelineId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("marketing_pipeline_stages")
        .select("id, name")
        .eq("pipeline_id", stagesPipelineId!)
        .order("position");
      if (error) throw error;
      return data || [];
    },
    enabled: !!stagesPipelineId,
    staleTime: 5 * 60 * 1000,
  });

  // Calendari di prenotazione (trigger degli appuntamenti): con più marchi
  // nella stessa azienda, ogni calendario è un marchio diverso.
  const { data: calendariPrenotazione = [] } = useQuery({
    queryKey: ["flow-calendars", companyId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("marketing_calendars")
        .select("id, name")
        .eq("company_id", companyId!)
        .order("name");
      if (error) throw error;
      return data || [];
    },
    enabled: !!companyId && field.type === "calendar_select",
    staleTime: 5 * 60 * 1000,
  });

  // Fasi commessa dell'azienda (trigger "Stato ordine cambiato"). Chiave
  // propria: altre schermate leggono order_statuses con select diversi.
  const { data: fasiCommessa = [] } = useQuery({
    queryKey: ["flow-order-statuses", companyId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("order_statuses")
        .select("id, name")
        .eq("company_id", companyId!)
        .order("position");
      if (error) throw error;
      return (data || []) as Array<{ id: string; name: string }>;
    },
    enabled: !!companyId && field.type === "order_status_select",
    staleTime: 5 * 60 * 1000,
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
          {field.supportsVariables && <VariablePicker onInsert={insertVariable} triggerItemId={triggerItemId} companyId={companyId} />}
        </div>
      )}

      {field.type === "richhtml" && (
        <EmailBodyEditor
          value={value ?? field.defaultValue ?? ""}
          onChange={(html) => onChange(html)}
          triggerItemId={triggerItemId}
        />
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
              <VariablePicker onInsert={insertVariable} triggerItemId={triggerItemId} companyId={companyId} />
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

      {field.type === "flow_select" && (
        <Select value={value ?? ""} onValueChange={onChange}>
          <SelectTrigger className="h-9 text-sm">
            <SelectValue placeholder="Scegli l'automazione..." />
          </SelectTrigger>
          <SelectContent>
            {field.allowAll && <SelectItem value="__tutte__">Tutte le automazioni attive</SelectItem>}
            {flussiPubblicati.map((fl) => (
              <SelectItem key={fl.id} value={fl.id}>{fl.name}</SelectItem>
            ))}
            {flussiPubblicati.length === 0 && (
              <SelectItem value="__nessuna__" disabled>Nessuna automazione pubblicata</SelectItem>
            )}
          </SelectContent>
        </Select>
      )}

      {field.type === "user_select" && (
        companyUsers.length > 0 ? (
          <Select value={value ?? ""} onValueChange={onChange}>
            <SelectTrigger className="h-9 text-sm">
              <SelectValue placeholder="Seleziona utente..." />
            </SelectTrigger>
            <SelectContent>
              {companyUsers.map((u: any) => (
                <SelectItem key={u.id} value={u.id}>
                  {[u.first_name, u.last_name].filter(Boolean).join(" ") || u.id}
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

      {field.type === "user_multi_select" && (
        companyUsers.length > 0 ? (
          <div className="flex flex-wrap gap-1.5">
            {companyUsers.map((u: any) => {
              const ids: string[] = Array.isArray(value) ? value : [];
              const checked = ids.includes(u.id);
              const name = [u.first_name, u.last_name].filter(Boolean).join(" ") || u.id;
              return (
                <Button
                  key={u.id}
                  type="button"
                  variant={checked ? "default" : "outline"}
                  size="sm"
                  className="h-7 text-xs"
                  onClick={() => onChange(checked ? ids.filter((x) => x !== u.id) : [...ids, u.id])}
                >
                  {checked && <CheckCircle className="mr-1 h-3 w-3" />}
                  {name}
                </Button>
              );
            })}
          </div>
        ) : (
          <Input
            value={Array.isArray(value) ? value.join(",") : (value ?? "")}
            onChange={(e) => onChange(e.target.value.split(",").map((s) => s.trim()).filter(Boolean))}
            placeholder="ID utenti separati da virgola"
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

      {field.type === "meta_page_select" && (
        metaPages.length > 0 ? (
          <Select
            value={value || "__all__"}
            onValueChange={(v) => onChange(v === "__all__" ? null : v)}
          >
            <SelectTrigger className="h-9 text-sm">
              <SelectValue placeholder="Tutte le pagine" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__all__">Tutte le pagine collegate</SelectItem>
              {metaPages.map((p: any) => (
                <SelectItem key={p.asset_id} value={p.asset_id}>{p.asset_name || p.asset_id}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        ) : (
          <p className="rounded-lg border border-dashed px-3 py-2.5 text-xs text-muted-foreground">
            Nessuna pagina Facebook collegata. Collega Meta da Impostazioni → Integrazioni.
          </p>
        )
      )}

      {field.type === "meta_form_multi_select" && (() => {
        // Se è stata scelta una pagina, mostra solo i suoi moduli
        const pageUuid = nodeConfig?.page_id
          ? metaPages.find((p: any) => p.asset_id === nodeConfig.page_id)?.id
          : null;
        const visibleForms = pageUuid
          ? metaForms.filter((f: any) => f.page_asset_id === pageUuid)
          : metaForms;
        if (visibleForms.length === 0) {
          return (
            <p className="rounded-lg border border-dashed px-3 py-2.5 text-xs text-muted-foreground">
              {metaForms.length === 0
                ? "Nessun modulo lead trovato. Verifica il collegamento Meta in Impostazioni → Integrazioni."
                : "Nessun modulo per la pagina selezionata."}
            </p>
          );
        }
        const ids: string[] = Array.isArray(value) ? value : [];
        const toggleForm = (formId: string) =>
          onChange(ids.includes(formId) ? ids.filter((x) => x !== formId) : [...ids, formId]);
        // Dropdown ricercabile (non chips inline): con decine/centinaia di
        // moduli le chips sarebbero ingestibili.
        return (
          <div className="space-y-1.5">
            <Popover>
              <PopoverTrigger asChild>
                <Button type="button" variant="outline" className="h-9 w-full justify-between text-sm font-normal">
                  {ids.length > 0 ? `${ids.length} modul${ids.length === 1 ? "o" : "i"} selezionat${ids.length === 1 ? "o" : "i"}` : "Tutti i moduli"}
                  <ChevronsUpDown className="h-3.5 w-3.5 shrink-0 opacity-50" />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-[300px] p-0" align="start">
                <Command>
                  <CommandInput placeholder="Cerca modulo…" />
                  <CommandList className="max-h-[240px]">
                    <CommandEmpty>Nessun modulo trovato.</CommandEmpty>
                    <CommandGroup>
                      {visibleForms.map((f: any) => (
                        <CommandItem
                          key={f.form_id}
                          value={`${f.form_name || ""} ${f.form_id}`}
                          onSelect={() => toggleForm(f.form_id)}
                        >
                          <CheckCircle className={`mr-2 h-3.5 w-3.5 shrink-0 ${ids.includes(f.form_id) ? "text-primary" : "opacity-0"}`} />
                          <span className="truncate text-sm">{f.form_name || f.form_id}</span>
                        </CommandItem>
                      ))}
                    </CommandGroup>
                  </CommandList>
                </Command>
              </PopoverContent>
            </Popover>
            {ids.length > 0 && (
              <div className="flex flex-wrap gap-1">
                {ids.map((fid) => {
                  const f = metaForms.find((x: any) => x.form_id === fid);
                  return (
                    <span key={fid} className="inline-flex max-w-full items-center gap-1 rounded-full border bg-muted/50 px-2 py-0.5 text-[11px]">
                      <span className="truncate">{f?.form_name || fid}</span>
                      <button type="button" onClick={() => toggleForm(fid)} aria-label="Rimuovi modulo" className="shrink-0 text-muted-foreground hover:text-foreground">
                        <X className="h-3 w-3" />
                      </button>
                    </span>
                  );
                })}
              </div>
            )}
          </div>
        );
      })()}

      {field.type === "whatsapp_locale_number_select" && (
        <Select
          value={value || "__auto__"}
          onValueChange={(v) => onChange(v === "__auto__" ? null : v)}
        >
          <SelectTrigger className="h-9 text-sm">
            <SelectValue placeholder="Scelta automatica" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__auto__">Scelta automatica tra i numeri liberi</SelectItem>
            {numeriWhatsappLocale
              .filter((n) => n.numero || n.id === value)
              .map((n) => (
                <SelectItem key={n.id} value={n.id}>
                  {[n.display_name, n.numero].filter(Boolean).join(" · ")}
                  {n.stato !== "connected" ? " (scollegato)" : ""}
                </SelectItem>
              ))}
          </SelectContent>
        </Select>
      )}

      {field.type === "calendar_select" && (
        calendariPrenotazione.length > 0 ? (
          <Select
            value={value || "__tutti__"}
            onValueChange={(v) => onChange(v === "__tutti__" ? null : v)}
          >
            <SelectTrigger className="h-9 text-sm">
              <SelectValue placeholder="Tutti i calendari" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__tutti__">Tutti i calendari</SelectItem>
              {calendariPrenotazione.map((c: { id: string; name: string }) => (
                <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        ) : (
          <p className="rounded-lg border border-dashed px-3 py-2.5 text-xs text-muted-foreground">
            Nessun calendario trovato. Creane uno in Impostazioni → Calendari.
          </p>
        )
      )}

      {field.type === "pipeline_select" && (
        crmPipelines.length > 0 ? (
          <Select
            value={value || ""}
            onValueChange={(v) => {
              // Cambiare pipeline invalida le fasi scelte prima — anche quelle
              // del trigger "cambio fase" (stage_a/stage_da), che altrimenti
              // restavano puntate a una fase di un'altra pipeline.
              if (onPatch) onPatch({ [field.id]: v, stage_id: null, stage_a: null, stage_da: null });
              else onChange(v);
            }}
          >
            <SelectTrigger className="h-9 text-sm">
              <SelectValue placeholder="Seleziona pipeline..." />
            </SelectTrigger>
            <SelectContent>
              {crmPipelines.map((p: any) => (
                <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        ) : (
          <p className="rounded-lg border border-dashed px-3 py-2.5 text-xs text-muted-foreground">
            Nessuna pipeline trovata. Creane una in CRM → Opportunità.
          </p>
        )
      )}

      {field.type === "pipeline_stage_select" && (
        !nodeConfig?.pipeline_id ? (
          <p className="rounded-lg border border-dashed px-3 py-2.5 text-xs text-muted-foreground">
            Seleziona prima la pipeline.
          </p>
        ) : (
          <Select value={value || ""} onValueChange={onChange}>
            <SelectTrigger className="h-9 text-sm">
              <SelectValue placeholder="Seleziona fase..." />
            </SelectTrigger>
            <SelectContent>
              {crmStages.map((s: any) => (
                <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        )
      )}

      {field.type === "order_status_select" && (
        fasiCommessa.length === 0 ? (
          <p className="rounded-lg border border-dashed px-3 py-2.5 text-xs text-muted-foreground">
            Nessuna fase commessa. Creale in Impostazioni › Fasi commessa.
          </p>
        ) : (
          <Select value={value || ""} onValueChange={onChange}>
            <SelectTrigger className="h-9 text-sm">
              <SelectValue placeholder="Seleziona fase..." />
            </SelectTrigger>
            <SelectContent>
              {fasiCommessa.map((f) => (
                <SelectItem key={f.id} value={f.id}>{f.name}</SelectItem>
              ))}
              {/* Automazioni vecchie salvavano un nome ("confermato"): resta
                  visibile finché non si sceglie una fase vera. */}
              {value && !fasiCommessa.some((f) => f.id === value) && (
                <SelectItem value={String(value)}>{String(value)} (vecchia impostazione)</SelectItem>
              )}
            </SelectContent>
          </Select>
        )
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
