export interface AutomationFlow {
  id: string;
  company_id: string;
  name: string;
  description: string | null;
  status: "draft" | "published" | "archived";
  version: number;
  created_by: string;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface AutomationNode {
  id: string;
  flow_id: string;
  company_id: string;
  node_type: "trigger" | "action" | "condition" | "delay" | "goal" | "split";
  position_x: number;
  position_y: number;
  config_json: Record<string, any>;
  label: string | null;
  created_at: string;
  updated_at: string;
}

export interface AutomationConnection {
  id: string;
  flow_id: string;
  company_id: string;
  from_node_id: string;
  to_node_id: string;
  label: string | null;
  created_at: string;
}

export type TriggerCategory = "contact" | "opportunity" | "appointment" | "communication" | "system";
export type ActionCategory = "communication" | "crm" | "logic" | "integration";

export interface PickerItem {
  id: string;
  label: string;
  icon: string;
  category: string;
  description?: string;
}

export const TRIGGER_CATEGORIES: { key: TriggerCategory; label: string; icon: string; items: PickerItem[] }[] = [
  {
    key: "contact",
    label: "Contatto",
    icon: "User",
    items: [
      { id: "contact_created", label: "Contatto creato", icon: "UserPlus", category: "contact" },
      { id: "contact_updated", label: "Contatto modificato", icon: "UserCog", category: "contact" },
      { id: "tag_added", label: "Tag aggiunto", icon: "TagIcon", category: "contact" },
      { id: "tag_removed", label: "Tag rimosso", icon: "TagIcon", category: "contact" },
      { id: "custom_field_updated", label: "Campo personalizzato aggiornato", icon: "FileText", category: "contact" },
      { id: "custom_date", label: "Data personalizzata", icon: "CalendarClock", category: "contact" },
      { id: "birthday_reminder", label: "Promemoria compleanno", icon: "Cake", category: "contact" },
    ],
  },
  {
    key: "opportunity",
    label: "Opportunità",
    icon: "Target",
    items: [
      { id: "opportunity_created", label: "Opportunità creata", icon: "PlusCircle", category: "opportunity" },
      { id: "pipeline_stage_change", label: "Cambio fase", icon: "ArrowRightLeft", category: "opportunity" },
      { id: "opportunity_won", label: "Opportunità vinta", icon: "Trophy", category: "opportunity" },
      { id: "opportunity_lost", label: "Opportunità persa", icon: "XCircle", category: "opportunity" },
      { id: "opportunity_stale", label: "Opportunità stagnante", icon: "Clock", category: "opportunity" },
    ],
  },
  {
    key: "appointment",
    label: "Appuntamenti",
    icon: "CalendarDays",
    items: [
      { id: "appointment_booked", label: "Appuntamento prenotato", icon: "CalendarPlus", category: "appointment" },
      { id: "appointment_status_changed", label: "Stato modificato", icon: "CalendarCog", category: "appointment" },
      { id: "appointment_canceled", label: "Appuntamento cancellato", icon: "CalendarX", category: "appointment" },
    ],
  },
  {
    key: "communication",
    label: "Comunicazioni",
    icon: "MessageSquare",
    items: [
      { id: "email_opened", label: "Email aperta", icon: "MailOpen", category: "communication" },
      { id: "email_clicked", label: "Email cliccata", icon: "MousePointerClick", category: "communication" },
      { id: "whatsapp_received", label: "WhatsApp ricevuto", icon: "MessageCircle", category: "communication" },
      { id: "customer_replied", label: "Risposta cliente", icon: "Reply", category: "communication" },
      { id: "call_registered", label: "Chiamata registrata", icon: "Phone", category: "communication" },
    ],
  },
  {
    key: "system",
    label: "Sistema",
    icon: "Settings",
    items: [
      { id: "webhook_incoming", label: "Webhook in entrata", icon: "Webhook", category: "system" },
      { id: "scheduler", label: "Scheduler", icon: "Timer", category: "system" },
      { id: "form_submitted", label: "Modulo inviato", icon: "FileInput", category: "system" },
      { id: "survey_submitted", label: "Sondaggio inviato", icon: "ClipboardCheck", category: "system" },
    ],
  },
];

export const ACTION_CATEGORIES: { key: ActionCategory; label: string; icon: string; items: PickerItem[] }[] = [
  {
    key: "communication",
    label: "Comunicazione",
    icon: "Mail",
    items: [
      { id: "send_email", label: "Invia Email", icon: "Mail", category: "communication" },
      { id: "send_whatsapp", label: "Invia WhatsApp", icon: "MessageCircle", category: "communication" },
      { id: "send_sms", label: "Invia SMS", icon: "Smartphone", category: "communication" },
      { id: "send_notification", label: "Invia Notifica", icon: "Bell", category: "communication" },
      { id: "send_ai_message", label: "Invia Messaggio AI", icon: "Bot", category: "communication", description: "Genera e invia un messaggio con AI" },
    ],
  },
  {
    key: "crm",
    label: "CRM",
    icon: "Users",
    items: [
      { id: "create_opportunity", label: "Crea opportunità", icon: "PlusCircle", category: "crm" },
      { id: "move_opportunity", label: "Sposta opportunità", icon: "ArrowRightLeft", category: "crm" },
      { id: "update_field", label: "Aggiorna campo", icon: "FileEdit", category: "crm" },
      { id: "add_tag", label: "Aggiungi tag", icon: "TagIcon", category: "crm" },
      { id: "remove_tag", label: "Rimuovi tag", icon: "TagIcon", category: "crm" },
      { id: "assign_user", label: "Assegna utente", icon: "UserCheck", category: "crm" },
      { id: "create_task", label: "Crea attività", icon: "ListTodo", category: "crm" },
    ],
  },
  {
    key: "logic",
    label: "Logica",
    icon: "GitBranch",
    items: [
      { id: "delay", label: "Attendi (Delay)", icon: "Clock", category: "logic", description: "Attendi X giorni/ore prima di proseguire" },
      { id: "if_else", label: "If / Else", icon: "GitBranch", category: "logic", description: "Condizione con 2 rami" },
      { id: "split_percentage", label: "Split percentuale", icon: "Percent", category: "logic", description: "Dividi il flusso in base a percentuali" },
      { id: "goal", label: "Obiettivo (Goal)", icon: "Target", category: "logic", description: "Punto di arrivo dell'automazione" },
      { id: "jump_to_step", label: "Salta a step", icon: "CornerDownRight", category: "logic", description: "Salta ad un altro nodo del flusso" },
      { id: "end_automation", label: "Termina automazione", icon: "StopCircle", category: "logic" },
    ],
  },
  {
    key: "integration",
    label: "Integrazione",
    icon: "Plug",
    items: [
      { id: "webhook_out", label: "Webhook uscita", icon: "ExternalLink", category: "integration" },
      { id: "external_api", label: "API esterna", icon: "Globe", category: "integration", description: "Chiama un'API esterna" },
      { id: "sync_google", label: "Sync Google", icon: "RefreshCw", category: "integration", description: "Sincronizza con Google" },
      { id: "sync_meta_lead", label: "Sync Meta Lead", icon: "RefreshCw", category: "integration", description: "Sincronizza con Meta Lead Ads" },
    ],
  },
];

export const NODE_TYPE_COLORS: Record<string, string> = {
  trigger: "border-orange-400 bg-orange-50 dark:bg-orange-950/30",
  action: "border-blue-400 bg-blue-50 dark:bg-blue-950/30",
  condition: "border-purple-400 bg-purple-50 dark:bg-purple-950/30",
  delay: "border-amber-400 bg-amber-50 dark:bg-amber-950/30",
  goal: "border-green-400 bg-green-50 dark:bg-green-950/30",
  split: "border-teal-400 bg-teal-50 dark:bg-teal-950/30",
};

export const NODE_TYPE_LABELS: Record<string, string> = {
  trigger: "Trigger",
  action: "Azione",
  condition: "Condizione",
  delay: "Attesa",
  goal: "Obiettivo",
  split: "Split",
};
