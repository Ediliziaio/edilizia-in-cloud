import {
  UserPlus, UserCheck, Handshake, Briefcase, BarChart3, Trophy, XCircle,
  Calendar, CalendarCheck, Target, Clock, Package, RotateCcw, AlertTriangle,
  Receipt, CreditCard, FileText, Ticket, Warehouse, Truck, Users, Building2,
  ListTodo, ClipboardCheck, Mail, MessageSquare, Phone, Mic, Bell, Send,
  Tag, DollarSign, CheckSquare, Edit, UserMinus, Webhook, ArrowRight,
  StopCircle, RefreshCw, Zap, Star, StickyNote, GitBranch, Flag, Shuffle,
  Hourglass, BellRing, FileWarning, TrendingUp, type LucideIcon,
} from "lucide-react";

/** Map trigger catalog IDs → Lucide icons */
const TRIGGER_ICON_MAP: Record<string, LucideIcon> = {
  contatto_creato: UserPlus,
  contatto_aggiornato: Edit,
  contatto_assegnato: Handshake,
  opportunita_creata: Briefcase,
  opportunita_stage_cambiato: BarChart3,
  opportunita_vinta: Trophy,
  opportunita_persa: XCircle,
  appuntamento_creato: Calendar,
  appuntamento_confermato: CalendarCheck,
  appuntamento_completato: Target,
  appuntamento_no_show: XCircle,
  appuntamento_imminente: Clock,
  ordine_creato: Package,
  ordine_stato_cambiato: RotateCcw,
  ordine_in_ritardo: AlertTriangle,
  fattura_creata: Receipt,
  fattura_scaduta: Clock,
  pagamento_ricevuto: CreditCard,
  preventivo_creato: FileText,
  preventivo_accettato: FileText,
  preventivo_rifiutato: FileText,
  ticket_creato: Ticket,
  ticket_risolto: CheckSquare,
  magazzino_sotto_scorta: Warehouse,
  consegna_completata: Truck,
  nuovo_dipendente: Users,
  cantiere_fase_cambiata: Building2,
  task_completato: ClipboardCheck,
  task_scaduto: AlertTriangle,
  cron: Clock,
  webhook_in: Webhook,
  compleanno_cliente: Star,
  modulo_compilato: ListTodo,
  preventivo_in_scadenza: Hourglass,
  documento_hr_in_scadenza: FileWarning,
  spesa_registrata: DollarSign,
  email_aperta: Mail,
  email_cliccata: Mail,
  risposta_sms: MessageSquare,
  chiamata_completata: Phone,
};

/** Map action catalog IDs → Lucide icons */
const ACTION_ICON_MAP: Record<string, LucideIcon> = {
  invia_email: Mail,
  invia_sms: MessageSquare,
  invia_whatsapp: MessageSquare,
  invia_notifica_push: Bell,
  notifica_interna: BellRing,
  aggiorna_punteggio: TrendingUp,
  chiama_ai: Phone,
  lascia_voicemail: Mic,
  aggiungi_tag: Tag,
  rimuovi_tag: Tag,
  aggiorna_campo_contatto: Edit,
  assegna_responsabile: UserCheck,
  crea_opportunita: DollarSign,
  aggiorna_opportunita: DollarSign,
  sposta_stage: BarChart3,
  crea_appuntamento: Calendar,
  crea_task: CheckSquare,
  completa_task: ClipboardCheck,
  crea_ordine: Package,
  aggiorna_stato_ordine: RotateCcw,
  crea_fattura: Receipt,
  invia_fattura_sdi: Send,
  crea_preventivo: FileText,
  aggiorna_stato_cantiere: Building2,
  aggiorna_magazzino: Warehouse,
  chiama_webhook: Webhook,
  vai_a_step: ArrowRight,
  ferma_flusso: StopCircle,
  rimuovi_da_dnd: RefreshCw,
  aggiungi_a_lista: Tag,
  rimuovi_da_flusso: UserMinus,
  attendi: Clock,
  condition_se: GitBranch,
  condition_multi: GitBranch,
  goal: Target,
  split_ab: Shuffle,
  vai_a: ArrowRight,
  drip_sequenza: Clock,
  note: StickyNote,
};

export function getTriggerIcon(itemId: string): LucideIcon {
  return TRIGGER_ICON_MAP[itemId] ?? Zap;
}

export function getActionIcon(itemId: string): LucideIcon {
  return ACTION_ICON_MAP[itemId] ?? Send;
}

export function getNodeIcon(itemId: string, kind: string): LucideIcon {
  if (kind === "trigger") return getTriggerIcon(itemId);
  if (kind === "condition") return GitBranch;
  if (kind === "delay") return Clock;
  if (kind === "end") return Flag;
  if (kind === "split") return Shuffle;
  if (kind === "note") return StickyNote;
  return getActionIcon(itemId);
}
