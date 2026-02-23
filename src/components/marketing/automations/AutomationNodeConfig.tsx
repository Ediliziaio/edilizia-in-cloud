import { useState, useCallback, useEffect } from "react";
import type { AutomationNode } from "@/types/automationBuilder";
import {
  NODE_TYPE_LABELS,
  TRIGGER_CATEGORIES,
  TRIGGER_DESCRIPTIONS,
  ACTION_DESCRIPTIONS,
  ACTION_CATEGORIES,
  type TriggerFilters,
  type TriggerCondition,
  type TriggerConditionGroup,
  isConditionGroup,
  NO_VALUE_OPERATORS,
  validateActionConfig,
  type ActionValidationError,
} from "@/types/automationBuilder";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Checkbox } from "@/components/ui/checkbox";
import { X, Filter, Zap } from "lucide-react";
import { TriggerConditionBuilder } from "./TriggerConditionBuilder";
import { TagSelector } from "@/components/marketing/TagSelector";
import { toast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/AuthContext";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import { format } from "date-fns";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { CalendarIcon } from "lucide-react";

interface Props {
  node: AutomationNode;
  onUpdate: (id: string, updates: Partial<AutomationNode>) => void;
  onClose: () => void;
  allNodes?: AutomationNode[];
}

// ── Validation for trigger filters ──
function validateFilters(filters: TriggerFilters): Set<string> {
  const errs = new Set<string>();
  const walk = (items: (TriggerCondition | TriggerConditionGroup)[]) => {
    for (const item of items) {
      if (isConditionGroup(item)) {
        if (item.conditions.length === 0) errs.add(item.id + "_empty");
        walk(item.conditions);
      } else {
        const c = item as TriggerCondition;
        if (!c.field) errs.add(c.id + "_field");
        if (!c.operator) errs.add(c.id + "_op");
        if (c.field && c.operator && !NO_VALUE_OPERATORS.includes(c.operator)) {
          if (c.value === "" || c.value === null || c.value === undefined) errs.add(c.id + "_val");
        }
      }
    }
  };
  walk(filters.conditions);
  return errs;
}

// ── Helper: find action label from categories ──
function findActionLabel(actionType: string): string {
  for (const cat of ACTION_CATEGORIES) {
    const item = cat.items.find(i => i.id === actionType);
    if (item) return item.label;
  }
  return actionType;
}

export function AutomationNodeConfig({ node, onUpdate, onClose, allNodes = [] }: Props) {
  const { effectiveCompany } = useAuth();
  const companyId = effectiveCompany?.id;
  const [validationErrors, setValidationErrors] = useState<Set<string>>(new Set());
  const [actionErrors, setActionErrors] = useState<ActionValidationError[]>([]);

  const updateConfig = (key: string, value: any) => {
    onUpdate(node.id, { config_json: { ...node.config_json, [key]: value } });
  };

  const isTrigger = node.node_type === "trigger";
  const isAction = node.node_type === "action";
  const actionType = node.config_json?.action_type || "";

  // ── Queries for dynamic selects ──
  const { data: pipelines = [] } = useQuery({
    queryKey: ["marketing_pipelines", companyId],
    queryFn: async () => {
      if (!companyId) return [];
      const { data } = await supabase.from("marketing_pipelines").select("id, name").eq("company_id", companyId).order("name");
      return data || [];
    },
    enabled: !!companyId && isAction && ["create_opportunity", "move_opportunity"].includes(actionType),
  });

  const selectedPipelineId = node.config_json?.pipeline_id || node.config_json?.target_pipeline_id || "";
  const { data: stages = [] } = useQuery({
    queryKey: ["marketing_pipeline_stages", selectedPipelineId],
    queryFn: async () => {
      if (!selectedPipelineId) return [];
      const { data } = await supabase.from("marketing_pipeline_stages").select("id, name").eq("pipeline_id", selectedPipelineId).order("position");
      return data || [];
    },
    enabled: !!selectedPipelineId,
  });

  const { data: companyUsers = [] } = useQuery({
    queryKey: ["company_users_for_actions", companyId],
    queryFn: async () => {
      if (!companyId) return [] as { user_id: string; role: string; name: string }[];
      const { data: profiles } = await supabase.from("profiles").select("id, first_name, last_name").eq("company_id", companyId);
      const { data: roles } = await supabase.from("user_roles").select("user_id, role").in("role", ["company_admin", "company_staff"]);
      if (!roles || !profiles) return [] as { user_id: string; role: string; name: string }[];
      const profileMap = new Map(profiles.map(p => [p.id, `${p.first_name} ${p.last_name}`]));
      const companyProfileIds = new Set(profiles.map(p => p.id));
      return roles.filter(r => companyProfileIds.has(r.user_id)).map(r => ({ user_id: r.user_id, role: r.role, name: profileMap.get(r.user_id) || r.user_id.slice(0, 8) }));
    },
    enabled: !!companyId && isAction && ["create_opportunity", "assign_user", "create_task", "send_notification"].includes(actionType),
  });

  const { data: emailTemplates = [] } = useQuery({
    queryKey: ["email_templates_for_actions", companyId],
    queryFn: async () => {
      if (!companyId) return [];
      const { data } = await supabase.from("email_templates").select("id, name, subject").eq("company_id", companyId).order("name");
      return data || [];
    },
    enabled: !!companyId && isAction && actionType === "send_email",
  });

  // ── Trigger config ──
  const triggerCategory = node.config_json?.trigger_category || "contact";
  const triggerEvent = node.config_json?.trigger_event || "";
  const triggerDescription = triggerEvent ? TRIGGER_DESCRIPTIONS[triggerEvent] || "" : "";
  const filters: TriggerFilters = node.config_json?.filters || { logic: "AND", conditions: [] };
  const categoryData = TRIGGER_CATEGORIES.find((c) => c.key === triggerCategory);
  const triggerItems = categoryData?.items || [];

  const handleSaveTrigger = useCallback(() => {
    const errs = validateFilters(filters);
    setValidationErrors(errs);
    if (errs.size > 0) {
      toast({ title: "Condizioni non valide", description: "Compila tutti i campi obbligatori nei filtri.", variant: "destructive" });
      return;
    }
    toast({ title: "Trigger salvato", description: "Le condizioni sono state salvate correttamente." });
    onClose();
  }, [filters, onClose]);

  const handleFiltersChange = (newFilters: TriggerFilters) => {
    setValidationErrors(new Set());
    updateConfig("filters", newFilters);
  };

  // ── Action save with validation ──
  const handleSaveAction = useCallback(() => {
    const errors = validateActionConfig(actionType, node.config_json);
    setActionErrors(errors);
    if (errors.length > 0) {
      toast({ title: "Configurazione incompleta", description: errors[0].message, variant: "destructive" });
      return;
    }
    toast({ title: "Azione salvata", description: "Configurazione salvata correttamente." });
    onClose();
  }, [actionType, node.config_json, onClose]);

  const hasFieldError = (field: string) => actionErrors.some(e => e.field === field);

  // ── TRIGGER config panel ──
  if (isTrigger) {
    return (
      <div className="w-[420px] border-l bg-background flex flex-col shrink-0 h-full">
        <div className="p-4 space-y-4 overflow-y-auto flex-1">
          <div className="flex items-center justify-between">
            <h3 className="font-semibold text-sm">Configura Trigger</h3>
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onClose}><X className="h-4 w-4" /></Button>
          </div>
          {triggerDescription && (
            <p className="text-xs text-muted-foreground bg-muted/50 p-2 rounded-md">{triggerDescription}</p>
          )}
          <div>
            <Label className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground">Categoria</Label>
            <Select value={triggerCategory} onValueChange={(v) => { updateConfig("trigger_category", v); updateConfig("trigger_event", ""); updateConfig("filters", { logic: "AND", conditions: [] }); }}>
              <SelectTrigger className="mt-1 h-9 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                {TRIGGER_CATEGORIES.map((cat) => (<SelectItem key={cat.key} value={cat.key} className="text-xs">{cat.label}</SelectItem>))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground">Selezionare un trigger del flusso di lavoro</Label>
            <Select value={triggerEvent} onValueChange={(v) => updateConfig("trigger_event", v)}>
              <SelectTrigger className="mt-1 h-9 text-xs"><SelectValue placeholder="Seleziona trigger..." /></SelectTrigger>
              <SelectContent>
                {triggerItems.map((t) => (<SelectItem key={t.id} value={t.id} className="text-xs">{t.label}</SelectItem>))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground">Nome del trigger flusso di lavoro</Label>
            <Input value={node.label || ""} onChange={(e) => onUpdate(node.id, { label: e.target.value })} placeholder="Etichetta..." className="mt-1 h-9 text-xs" />
          </div>
          <Separator />
          <div>
            <div className="flex items-center gap-1.5 mb-2">
              <Filter className="h-3.5 w-3.5 text-muted-foreground" />
              <Label className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground">Filtri</Label>
            </div>
            <TriggerConditionBuilder triggerCategory={triggerCategory} filters={filters} onChange={handleFiltersChange} errors={validationErrors} companyId={companyId} />
          </div>
        </div>
        <div className="border-t p-3 flex gap-2 justify-end shrink-0">
          <Button variant="outline" size="sm" className="text-xs" onClick={onClose}>Annulla</Button>
          <Button size="sm" className="text-xs" onClick={handleSaveTrigger}>Salva il trigger</Button>
        </div>
      </div>
    );
  }

  // ── ACTION config panel (GHL-style) ──
  if (isAction) {
    const actionDescription = ACTION_DESCRIPTIONS[actionType] || "";
    const actionLabel = findActionLabel(actionType);

    return (
      <div className="w-[420px] border-l bg-background flex flex-col shrink-0 h-full">
        <div className="p-4 space-y-4 overflow-y-auto flex-1">
          {/* Header */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Zap className="h-4 w-4 text-primary" />
              <h3 className="font-semibold text-sm">{actionLabel}</h3>
            </div>
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onClose}><X className="h-4 w-4" /></Button>
          </div>
          {actionDescription && (
            <p className="text-xs text-muted-foreground bg-muted/50 p-2 rounded-md">{actionDescription}</p>
          )}

          {/* Nome nodo */}
          <div>
            <Label className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground">Nome azione</Label>
            <Input value={node.label || ""} onChange={(e) => onUpdate(node.id, { label: e.target.value })} placeholder="Etichetta..." className="mt-1 h-9 text-xs" />
          </div>

          <Separator />

          {/* ── SEND EMAIL ── */}
          {actionType === "send_email" && (
            <div className="space-y-3">
              <div>
                <Label className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground">Template email</Label>
                <Select value={node.config_json?.template_id || "none"} onValueChange={(v) => updateConfig("template_id", v === "none" ? "" : v)}>
                  <SelectTrigger className={cn("mt-1 h-9 text-xs", hasFieldError("subject_override") && !node.config_json?.template_id && "border-destructive")}><SelectValue placeholder="Seleziona template..." /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none" className="text-xs">Nessun template</SelectItem>
                    {emailTemplates.map(t => (<SelectItem key={t.id} value={t.id} className="text-xs">{t.name}</SelectItem>))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground">Oggetto email</Label>
                <Input value={node.config_json?.subject_override || ""} onChange={(e) => updateConfig("subject_override", e.target.value)} placeholder="Es: Ciao {{contact.name}}..." className={cn("mt-1 h-9 text-xs", hasFieldError("subject_override") && "border-destructive")} />
              </div>
              <div>
                <Label className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground">Corpo personalizzato</Label>
                <Textarea value={node.config_json?.body_override || ""} onChange={(e) => updateConfig("body_override", e.target.value)} placeholder="Override del contenuto..." className="mt-1 text-xs" rows={3} />
              </div>
              <div>
                <Label className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground">Mittente (opzionale)</Label>
                <Input value={node.config_json?.sender_email || ""} onChange={(e) => updateConfig("sender_email", e.target.value)} placeholder="noreply@azienda.it" className="mt-1 h-9 text-xs" />
              </div>
              <div className="flex items-center gap-4">
                <label className="flex items-center gap-2 text-xs">
                  <Checkbox checked={node.config_json?.track_opens ?? true} onCheckedChange={(v) => updateConfig("track_opens", v)} />
                  Traccia apertura
                </label>
                <label className="flex items-center gap-2 text-xs">
                  <Checkbox checked={node.config_json?.track_clicks ?? true} onCheckedChange={(v) => updateConfig("track_clicks", v)} />
                  Traccia click
                </label>
              </div>
            </div>
          )}

          {/* ── SEND WHATSAPP ── */}
          {actionType === "send_whatsapp" && (
            <div className="space-y-3">
              <div>
                <Label className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground">Template WhatsApp</Label>
                <Input value={node.config_json?.whatsapp_template || ""} onChange={(e) => updateConfig("whatsapp_template", e.target.value)} placeholder="Nome template..." className="mt-1 h-9 text-xs" />
              </div>
              <div>
                <Label className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground">Testo messaggio</Label>
                <Textarea value={node.config_json?.whatsapp_text || ""} onChange={(e) => updateConfig("whatsapp_text", e.target.value)} placeholder="Ciao {{contact.name}}..." className={cn("mt-1 text-xs", hasFieldError("whatsapp_text") && "border-destructive")} rows={3} />
                <p className="text-[10px] text-muted-foreground mt-1">Variabili: {"{{contact.name}}"}, {"{{contact.email}}"}, {"{{contact.phone}}"}</p>
              </div>
              <div>
                <Label className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground">Tipo contenuto</Label>
                <Select value={node.config_json?.whatsapp_content_type || "text"} onValueChange={(v) => updateConfig("whatsapp_content_type", v)}>
                  <SelectTrigger className="mt-1 h-9 text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="text" className="text-xs">Testo</SelectItem>
                    <SelectItem value="image" className="text-xs">Immagine</SelectItem>
                    <SelectItem value="document" className="text-xs">Documento</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          )}

          {/* ── SEND SMS ── */}
          {actionType === "send_sms" && (
            <div className="space-y-3">
              <div>
                <Label className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground">Testo SMS</Label>
                <Textarea value={node.config_json?.sms_text || ""} onChange={(e) => updateConfig("sms_text", e.target.value)} placeholder="Testo del messaggio..." className={cn("mt-1 text-xs", hasFieldError("sms_text") && "border-destructive")} rows={3} />
                <p className={cn("text-[10px] mt-1", (node.config_json?.sms_text?.length || 0) > 160 ? "text-destructive" : "text-muted-foreground")}>
                  {node.config_json?.sms_text?.length || 0} / 160 caratteri
                </p>
              </div>
              <div>
                <Label className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground">Nota mittente</Label>
                <Input value={node.config_json?.sms_sender || ""} onChange={(e) => updateConfig("sms_sender", e.target.value)} placeholder="Nome mittente..." className="mt-1 h-9 text-xs" />
              </div>
            </div>
          )}

          {/* ── SEND NOTIFICATION ── */}
          {actionType === "send_notification" && (
            <div className="space-y-3">
              <div>
                <Label className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground">Titolo</Label>
                <Input value={node.config_json?.notification_title || ""} onChange={(e) => updateConfig("notification_title", e.target.value)} placeholder="Titolo notifica..." className={cn("mt-1 h-9 text-xs", hasFieldError("notification_title") && "border-destructive")} />
              </div>
              <div>
                <Label className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground">Messaggio</Label>
                <Textarea value={node.config_json?.notification_message || ""} onChange={(e) => updateConfig("notification_message", e.target.value)} placeholder="Messaggio..." className="mt-1 text-xs" rows={3} />
              </div>
              <div>
                <Label className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground">Destinatario</Label>
                <Select value={node.config_json?.notification_recipient || "assigned"} onValueChange={(v) => updateConfig("notification_recipient", v)}>
                  <SelectTrigger className="mt-1 h-9 text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="assigned" className="text-xs">Utente assegnato</SelectItem>
                    <SelectItem value="all_admins" className="text-xs">Tutti gli admin</SelectItem>
                    {companyUsers.map(u => (<SelectItem key={u.user_id} value={u.user_id} className="text-xs">{u.name} ({u.role})</SelectItem>))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          )}

          {/* ── SEND AI MESSAGE ── */}
          {actionType === "send_ai_message" && (
            <div className="space-y-3">
              <div>
                <Label className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground">Prompt AI</Label>
                <Textarea value={node.config_json?.ai_prompt || ""} onChange={(e) => updateConfig("ai_prompt", e.target.value)} placeholder="Scrivi un messaggio di follow-up professionale per..." className={cn("mt-1 text-xs", hasFieldError("ai_prompt") && "border-destructive")} rows={4} />
              </div>
              <div>
                <Label className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground">Canale invio</Label>
                <Select value={node.config_json?.ai_channel || "email"} onValueChange={(v) => updateConfig("ai_channel", v)}>
                  <SelectTrigger className="mt-1 h-9 text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="email" className="text-xs">Email</SelectItem>
                    <SelectItem value="whatsapp" className="text-xs">WhatsApp</SelectItem>
                    <SelectItem value="sms" className="text-xs">SMS</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground">Tono</Label>
                <Select value={node.config_json?.ai_tone || "professional"} onValueChange={(v) => updateConfig("ai_tone", v)}>
                  <SelectTrigger className="mt-1 h-9 text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="professional" className="text-xs">Professionale</SelectItem>
                    <SelectItem value="friendly" className="text-xs">Amichevole</SelectItem>
                    <SelectItem value="formal" className="text-xs">Formale</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground">Lingua</Label>
                <Select value={node.config_json?.ai_language || "it"} onValueChange={(v) => updateConfig("ai_language", v)}>
                  <SelectTrigger className="mt-1 h-9 text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="it" className="text-xs">Italiano</SelectItem>
                    <SelectItem value="en" className="text-xs">Inglese</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground">Lunghezza max (caratteri)</Label>
                <Input type="number" min={50} value={node.config_json?.ai_max_length || 500} onChange={(e) => updateConfig("ai_max_length", parseInt(e.target.value) || 500)} className="mt-1 h-9 text-xs" />
              </div>
            </div>
          )}

          {/* ── CREATE OPPORTUNITY ── */}
          {actionType === "create_opportunity" && (
            <div className="space-y-3">
              <div>
                <Label className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground">Nome opportunità</Label>
                <Input value={node.config_json?.opportunity_name || ""} onChange={(e) => updateConfig("opportunity_name", e.target.value)} placeholder="Es: {{contact.name}} - Nuovo Lead" className={cn("mt-1 h-9 text-xs", hasFieldError("opportunity_name") && "border-destructive")} />
              </div>
              <div>
                <Label className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground">Pipeline</Label>
                <Select value={node.config_json?.pipeline_id || ""} onValueChange={(v) => { updateConfig("pipeline_id", v); updateConfig("stage_id", ""); }}>
                  <SelectTrigger className={cn("mt-1 h-9 text-xs", hasFieldError("pipeline_id") && "border-destructive")}><SelectValue placeholder="Seleziona pipeline..." /></SelectTrigger>
                  <SelectContent>
                    {pipelines.map(p => (<SelectItem key={p.id} value={p.id} className="text-xs">{p.name}</SelectItem>))}
                  </SelectContent>
                </Select>
              </div>
              {node.config_json?.pipeline_id && (
                <div>
                  <Label className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground">Fase iniziale</Label>
                  <Select value={node.config_json?.stage_id || ""} onValueChange={(v) => updateConfig("stage_id", v)}>
                    <SelectTrigger className="mt-1 h-9 text-xs"><SelectValue placeholder="Seleziona fase..." /></SelectTrigger>
                    <SelectContent>
                      {stages.map(s => (<SelectItem key={s.id} value={s.id} className="text-xs">{s.name}</SelectItem>))}
                    </SelectContent>
                  </Select>
                </div>
              )}
              <div>
                <Label className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground">Valore (€)</Label>
                <Input type="number" min={0} value={node.config_json?.opportunity_value || ""} onChange={(e) => updateConfig("opportunity_value", parseFloat(e.target.value) || 0)} className="mt-1 h-9 text-xs" />
              </div>
              <div>
                <Label className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground">Assegna a</Label>
                <Select value={node.config_json?.assign_to || ""} onValueChange={(v) => updateConfig("assign_to", v)}>
                  <SelectTrigger className="mt-1 h-9 text-xs"><SelectValue placeholder="Seleziona utente..." /></SelectTrigger>
                  <SelectContent>
                    {companyUsers.map(u => (<SelectItem key={u.user_id} value={u.user_id} className="text-xs">{u.name} ({u.role})</SelectItem>))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground">Tag</Label>
                <TagSelector selectedTags={node.config_json?.tags || []} onTagsChange={(tags) => updateConfig("tags", tags)} />
              </div>
            </div>
          )}

          {/* ── MOVE OPPORTUNITY ── */}
          {actionType === "move_opportunity" && (
            <div className="space-y-3">
              <div>
                <Label className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground">Pipeline destinazione</Label>
                <Select value={node.config_json?.target_pipeline_id || ""} onValueChange={(v) => { updateConfig("target_pipeline_id", v); updateConfig("target_stage_id", ""); }}>
                  <SelectTrigger className={cn("mt-1 h-9 text-xs", hasFieldError("target_pipeline_id") && "border-destructive")}><SelectValue placeholder="Seleziona pipeline..." /></SelectTrigger>
                  <SelectContent>
                    {pipelines.map(p => (<SelectItem key={p.id} value={p.id} className="text-xs">{p.name}</SelectItem>))}
                  </SelectContent>
                </Select>
              </div>
              {node.config_json?.target_pipeline_id && (
                <div>
                  <Label className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground">Fase destinazione</Label>
                  <Select value={node.config_json?.target_stage_id || ""} onValueChange={(v) => updateConfig("target_stage_id", v)}>
                    <SelectTrigger className="mt-1 h-9 text-xs"><SelectValue placeholder="Seleziona fase..." /></SelectTrigger>
                    <SelectContent>
                      {stages.map(s => (<SelectItem key={s.id} value={s.id} className="text-xs">{s.name}</SelectItem>))}
                    </SelectContent>
                  </Select>
                </div>
              )}
              <div>
                <Label className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground">Stato</Label>
                <Select value={node.config_json?.opportunity_status || "open"} onValueChange={(v) => updateConfig("opportunity_status", v)}>
                  <SelectTrigger className="mt-1 h-9 text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="open" className="text-xs">Aperta</SelectItem>
                    <SelectItem value="won" className="text-xs">Vinta</SelectItem>
                    <SelectItem value="lost" className="text-xs">Persa</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          )}

          {/* ── UPDATE FIELD ── */}
          {actionType === "update_field" && (
            <div className="space-y-3">
              <div>
                <Label className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground">Entità</Label>
                <Select value={node.config_json?.entity_type || ""} onValueChange={(v) => { updateConfig("entity_type", v); updateConfig("field_key", ""); }}>
                  <SelectTrigger className={cn("mt-1 h-9 text-xs", hasFieldError("entity_type") && "border-destructive")}><SelectValue placeholder="Seleziona entità..." /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="contact" className="text-xs">Contatto</SelectItem>
                    <SelectItem value="opportunity" className="text-xs">Opportunità</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground">Campo</Label>
                <Input value={node.config_json?.field_key || ""} onChange={(e) => updateConfig("field_key", e.target.value)} placeholder="Es: email, phone, custom_field.nome..." className={cn("mt-1 h-9 text-xs", hasFieldError("field_key") && "border-destructive")} />
              </div>
              <div>
                <Label className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground">Valore</Label>
                <Input value={node.config_json?.field_value || ""} onChange={(e) => updateConfig("field_value", e.target.value)} placeholder="Nuovo valore..." className="mt-1 h-9 text-xs" />
              </div>
            </div>
          )}

          {/* ── ADD/REMOVE TAG ── */}
          {(actionType === "add_tag" || actionType === "remove_tag") && (
            <div className="space-y-3">
              <div>
                <Label className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground">Tag</Label>
                <div className={cn(hasFieldError("tags") && "ring-1 ring-destructive rounded-md")}>
                  <TagSelector selectedTags={node.config_json?.tags || []} onTagsChange={(tags) => updateConfig("tags", tags)} />
                </div>
              </div>
            </div>
          )}

          {/* ── ASSIGN USER ── */}
          {actionType === "assign_user" && (
            <div className="space-y-3">
              <div>
                <Label className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground">Metodo</Label>
                <Select value={node.config_json?.assign_method || "specific"} onValueChange={(v) => updateConfig("assign_method", v)}>
                  <SelectTrigger className="mt-1 h-9 text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="specific" className="text-xs">Utente specifico</SelectItem>
                    <SelectItem value="round_robin" className="text-xs">Round Robin</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {node.config_json?.assign_method !== "round_robin" && (
                <div>
                  <Label className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground">Utente</Label>
                  <Select value={node.config_json?.assign_user_id || ""} onValueChange={(v) => updateConfig("assign_user_id", v)}>
                    <SelectTrigger className={cn("mt-1 h-9 text-xs", hasFieldError("assign_user_id") && "border-destructive")}><SelectValue placeholder="Seleziona utente..." /></SelectTrigger>
                    <SelectContent>
                      {companyUsers.map(u => (<SelectItem key={u.user_id} value={u.user_id} className="text-xs">{u.name} ({u.role})</SelectItem>))}
                    </SelectContent>
                  </Select>
                </div>
              )}
            </div>
          )}

          {/* ── CREATE TASK ── */}
          {actionType === "create_task" && (
            <div className="space-y-3">
              <div>
                <Label className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground">Titolo</Label>
                <Input value={node.config_json?.task_title || ""} onChange={(e) => updateConfig("task_title", e.target.value)} placeholder="Titolo attività..." className={cn("mt-1 h-9 text-xs", hasFieldError("task_title") && "border-destructive")} />
              </div>
              <div>
                <Label className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground">Descrizione</Label>
                <Textarea value={node.config_json?.task_description || ""} onChange={(e) => updateConfig("task_description", e.target.value)} placeholder="Descrizione..." className="mt-1 text-xs" rows={2} />
              </div>
              <div>
                <Label className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground">Priorità</Label>
                <Select value={node.config_json?.task_priority || "normal"} onValueChange={(v) => updateConfig("task_priority", v)}>
                  <SelectTrigger className="mt-1 h-9 text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="low" className="text-xs">Bassa</SelectItem>
                    <SelectItem value="normal" className="text-xs">Normale</SelectItem>
                    <SelectItem value="high" className="text-xs">Alta</SelectItem>
                    <SelectItem value="urgent" className="text-xs">Urgente</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground">Assegna a</Label>
                <Select value={node.config_json?.task_assigned_to || ""} onValueChange={(v) => updateConfig("task_assigned_to", v)}>
                  <SelectTrigger className="mt-1 h-9 text-xs"><SelectValue placeholder="Seleziona utente..." /></SelectTrigger>
                  <SelectContent>
                    {companyUsers.map(u => (<SelectItem key={u.user_id} value={u.user_id} className="text-xs">{u.name} ({u.role})</SelectItem>))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground">Scadenza</Label>
                <Select value={node.config_json?.task_due || "immediate"} onValueChange={(v) => updateConfig("task_due", v)}>
                  <SelectTrigger className="mt-1 h-9 text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="immediate" className="text-xs">Immediata</SelectItem>
                    <SelectItem value="+1d" className="text-xs">+1 giorno</SelectItem>
                    <SelectItem value="+3d" className="text-xs">+3 giorni</SelectItem>
                    <SelectItem value="+7d" className="text-xs">+7 giorni</SelectItem>
                    <SelectItem value="specific" className="text-xs">Data specifica</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {node.config_json?.task_due === "specific" && (
                <div>
                  <Label className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground">Data specifica</Label>
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button variant="outline" className={cn("w-full mt-1 h-9 text-xs justify-start text-left font-normal", !node.config_json?.task_due_date && "text-muted-foreground")}>
                        <CalendarIcon className="mr-2 h-3.5 w-3.5" />
                        {node.config_json?.task_due_date ? format(new Date(node.config_json.task_due_date), "dd/MM/yyyy") : "Seleziona data..."}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0" align="start">
                      <Calendar mode="single" selected={node.config_json?.task_due_date ? new Date(node.config_json.task_due_date) : undefined} onSelect={(d) => updateConfig("task_due_date", d?.toISOString())} className="p-3 pointer-events-auto" />
                    </PopoverContent>
                  </Popover>
                </div>
              )}
            </div>
          )}

          {/* ── WEBHOOK OUT ── */}
          {actionType === "webhook_out" && (
            <div className="space-y-3">
              <div>
                <Label className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground">URL</Label>
                <Input value={node.config_json?.webhook_url || ""} onChange={(e) => updateConfig("webhook_url", e.target.value)} placeholder="https://..." className={cn("mt-1 h-9 text-xs", hasFieldError("webhook_url") && "border-destructive")} />
              </div>
              <div>
                <Label className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground">Metodo</Label>
                <Select value={node.config_json?.webhook_method || "POST"} onValueChange={(v) => updateConfig("webhook_method", v)}>
                  <SelectTrigger className="mt-1 h-9 text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="GET" className="text-xs">GET</SelectItem>
                    <SelectItem value="POST" className="text-xs">POST</SelectItem>
                    <SelectItem value="PUT" className="text-xs">PUT</SelectItem>
                    <SelectItem value="DELETE" className="text-xs">DELETE</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground">Headers (JSON)</Label>
                <Textarea value={node.config_json?.webhook_headers || ""} onChange={(e) => updateConfig("webhook_headers", e.target.value)} placeholder='{"Content-Type": "application/json"}' className="mt-1 text-xs font-mono" rows={3} />
              </div>
              <div>
                <Label className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground">Body template (JSON)</Label>
                <Textarea value={node.config_json?.webhook_body || ""} onChange={(e) => updateConfig("webhook_body", e.target.value)} placeholder='{"contact_id": "{{contact.id}}"}' className="mt-1 text-xs font-mono" rows={3} />
              </div>
            </div>
          )}

          {/* ── EXTERNAL API ── */}
          {actionType === "external_api" && (
            <div className="space-y-3">
              <div>
                <Label className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground">URL API</Label>
                <Input value={node.config_json?.api_url || ""} onChange={(e) => updateConfig("api_url", e.target.value)} placeholder="https://..." className={cn("mt-1 h-9 text-xs", hasFieldError("api_url") && "border-destructive")} />
              </div>
              <div>
                <Label className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground">Metodo</Label>
                <Select value={node.config_json?.api_method || "POST"} onValueChange={(v) => updateConfig("api_method", v)}>
                  <SelectTrigger className="mt-1 h-9 text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="GET" className="text-xs">GET</SelectItem>
                    <SelectItem value="POST" className="text-xs">POST</SelectItem>
                    <SelectItem value="PUT" className="text-xs">PUT</SelectItem>
                    <SelectItem value="DELETE" className="text-xs">DELETE</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground">Headers (JSON)</Label>
                <Textarea value={node.config_json?.api_headers || ""} onChange={(e) => updateConfig("api_headers", e.target.value)} placeholder='{"Authorization": "Bearer ..."}' className="mt-1 text-xs font-mono" rows={3} />
              </div>
              <div>
                <Label className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground">Body (JSON)</Label>
                <Textarea value={node.config_json?.api_body || ""} onChange={(e) => updateConfig("api_body", e.target.value)} placeholder="{}" className="mt-1 text-xs font-mono" rows={3} />
              </div>
            </div>
          )}

          {/* ── JUMP TO STEP ── */}
          {actionType === "jump_to_step" && (
            <div className="space-y-3">
              <div>
                <Label className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground">Nodo destinazione</Label>
                <Select value={node.config_json?.target_node_id || ""} onValueChange={(v) => updateConfig("target_node_id", v)}>
                  <SelectTrigger className={cn("mt-1 h-9 text-xs", hasFieldError("target_node_id") && "border-destructive")}><SelectValue placeholder="Seleziona nodo..." /></SelectTrigger>
                  <SelectContent>
                    {allNodes.filter(n => n.id !== node.id).map(n => (
                      <SelectItem key={n.id} value={n.id} className="text-xs">{n.label || `${NODE_TYPE_LABELS[n.node_type]} (${n.id.slice(0, 6)})`}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          )}

          {/* ── END AUTOMATION ── */}
          {actionType === "end_automation" && (
            <p className="text-xs text-muted-foreground">Questo nodo termina l'automazione per il contatto corrente. Non è necessaria alcuna configurazione aggiuntiva.</p>
          )}

          {/* ── SYNC GOOGLE / META ── */}
          {(actionType === "sync_google" || actionType === "sync_meta_lead") && (
            <div className="space-y-3">
              <div>
                <Label className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground">Account</Label>
                <Select value={node.config_json?.sync_account || ""} onValueChange={(v) => updateConfig("sync_account", v)}>
                  <SelectTrigger className="mt-1 h-9 text-xs"><SelectValue placeholder="Seleziona account..." /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="default" className="text-xs">Account predefinito</SelectItem>
                  </SelectContent>
                </Select>
                <p className="text-[10px] text-muted-foreground mt-1">Integrazione disponibile in futuro.</p>
              </div>
              <div>
                <Label className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground">Azione</Label>
                <Select value={node.config_json?.sync_action || "sync_contact"} onValueChange={(v) => updateConfig("sync_action", v)}>
                  <SelectTrigger className="mt-1 h-9 text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="sync_contact" className="text-xs">Sincronizza contatto</SelectItem>
                    <SelectItem value="sync_event" className="text-xs">Sincronizza evento</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="border-t p-3 flex gap-2 justify-end shrink-0">
          <Button variant="outline" size="sm" className="text-xs" onClick={onClose}>Annulla</Button>
          <Button size="sm" className="text-xs" onClick={handleSaveAction}>Salva azione</Button>
        </div>
      </div>
    );
  }

  // ── DEFAULT config panel (delay, condition, split, goal) ──
  return (
    <div className="w-[420px] border-l bg-background flex flex-col shrink-0 h-full">
      <div className="p-4 space-y-4 overflow-y-auto flex-1">
        <div className="flex items-center justify-between">
          <h3 className="font-semibold text-sm">Configura {NODE_TYPE_LABELS[node.node_type]}</h3>
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onClose}><X className="h-4 w-4" /></Button>
        </div>

        {/* Description */}
        {node.node_type === "delay" && (
          <p className="text-xs text-muted-foreground bg-muted/50 p-2 rounded-md">{ACTION_DESCRIPTIONS.delay}</p>
        )}
        {node.node_type === "split" && (
          <p className="text-xs text-muted-foreground bg-muted/50 p-2 rounded-md">{ACTION_DESCRIPTIONS.split_percentage}</p>
        )}
        {node.node_type === "goal" && (
          <p className="text-xs text-muted-foreground bg-muted/50 p-2 rounded-md">{ACTION_DESCRIPTIONS.goal}</p>
        )}
        {node.node_type === "condition" && (
          <p className="text-xs text-muted-foreground bg-muted/50 p-2 rounded-md">{ACTION_DESCRIPTIONS.if_else}</p>
        )}

        <div>
          <Label className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground">Nome nodo</Label>
          <Input value={node.label || ""} onChange={e => onUpdate(node.id, { label: e.target.value })} placeholder="Etichetta..." className="mt-1 h-9 text-xs" />
        </div>

        <Separator />

        {node.node_type === "delay" && (
          <div className="space-y-3">
            <div>
              <Label className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground">Valore</Label>
              <Input type="number" min={1} value={node.config_json?.delay_value || ""} onChange={e => updateConfig("delay_value", parseInt(e.target.value) || 1)} className="mt-1 h-9 text-xs" />
            </div>
            <div>
              <Label className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground">Unità</Label>
              <Select value={node.config_json?.delay_unit || "days"} onValueChange={v => updateConfig("delay_unit", v)}>
                <SelectTrigger className="mt-1 h-9 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="minutes" className="text-xs">Minuti</SelectItem>
                  <SelectItem value="hours" className="text-xs">Ore</SelectItem>
                  <SelectItem value="days" className="text-xs">Giorni</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        )}

        {node.node_type === "condition" && (
          <div className="space-y-3">
            <div className="flex items-center gap-1.5 mb-2">
              <Filter className="h-3.5 w-3.5 text-muted-foreground" />
              <Label className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground">Condizione If/Else</Label>
            </div>
            <TriggerConditionBuilder
              triggerCategory={allNodes.find(n => n.node_type === "trigger")?.config_json?.trigger_category || "contact"}
              filters={node.config_json?.condition_filters || { logic: "AND", conditions: [] }}
              onChange={(f) => updateConfig("condition_filters", f)}
              errors={validationErrors}
              companyId={companyId}
            />
          </div>
        )}

        {node.node_type === "split" && (
          <div className="space-y-3">
            <div>
              <Label className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground">Ramo A (%)</Label>
              <Input type="number" min={0} max={100} value={node.config_json?.split_a || 50} onChange={e => { const val = parseInt(e.target.value) || 0; updateConfig("split_a", val); updateConfig("split_b", 100 - val); }} className="mt-1 h-9 text-xs" />
            </div>
            <div>
              <Label className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground">Ramo B (%)</Label>
              <Input type="number" value={node.config_json?.split_b || 50} disabled className="mt-1 h-9 text-xs bg-muted" />
            </div>
          </div>
        )}

        {node.node_type === "goal" && (
          <div className="space-y-3">
            <div>
              <Label className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground">Condizione obiettivo</Label>
              <Textarea value={node.config_json?.goal_condition || ""} onChange={e => updateConfig("goal_condition", e.target.value)} placeholder="Descrivi la condizione per raggiungere l'obiettivo..." className="mt-1 text-xs" rows={3} />
            </div>
            <div>
              <Label className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground">Timeout (valore)</Label>
              <Input type="number" min={1} value={node.config_json?.goal_timeout_value || ""} onChange={e => updateConfig("goal_timeout_value", parseInt(e.target.value) || 0)} className="mt-1 h-9 text-xs" />
            </div>
            <div>
              <Label className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground">Timeout (unità)</Label>
              <Select value={node.config_json?.goal_timeout_unit || "days"} onValueChange={v => updateConfig("goal_timeout_unit", v)}>
                <SelectTrigger className="mt-1 h-9 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="hours" className="text-xs">Ore</SelectItem>
                  <SelectItem value="days" className="text-xs">Giorni</SelectItem>
                  <SelectItem value="weeks" className="text-xs">Settimane</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        )}
      </div>
      <div className="border-t p-3 flex gap-2 justify-end shrink-0">
        <Button variant="outline" size="sm" className="text-xs" onClick={onClose}>Annulla</Button>
        <Button size="sm" className="text-xs" onClick={() => {
          if (node.node_type === "condition") {
            const condFilters = node.config_json?.condition_filters || { logic: "AND", conditions: [] };
            const errs = validateFilters(condFilters);
            setValidationErrors(errs);
            if (errs.size > 0) {
              toast({ title: "Condizioni non valide", description: "Compila tutti i campi obbligatori.", variant: "destructive" });
              return;
            }
          }
          onClose();
        }}>Salva</Button>
      </div>
    </div>
  );
}