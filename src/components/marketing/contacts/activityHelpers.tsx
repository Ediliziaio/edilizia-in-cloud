import {
  UserPlus, Settings, StickyNote, Mail, MessageSquare, Target,
  ArrowRight, RefreshCw, UserCheck, FileText, Activity,
} from "lucide-react";
import { isToday, isYesterday, format } from "date-fns";
import { it } from "date-fns/locale";

export function getActivityIcon(type: string) {
  switch (type) {
    case "created":
    case "contact_created": return <UserPlus className="h-3.5 w-3.5" />;
    case "updated": return <Settings className="h-3.5 w-3.5" />;
    case "note_added": return <StickyNote className="h-3.5 w-3.5" />;
    case "email_sent": return <Mail className="h-3.5 w-3.5" />;
    case "message_sent": return <MessageSquare className="h-3.5 w-3.5" />;
    case "opportunity_linked":
    case "opportunity_created": return <Target className="h-3.5 w-3.5" />;
    case "stage_changed": return <ArrowRight className="h-3.5 w-3.5" />;
    case "status_changed": return <RefreshCw className="h-3.5 w-3.5" />;
    case "opportunity_assigned":
    case "contact_assigned": return <UserCheck className="h-3.5 w-3.5" />;
    case "document_uploaded": return <FileText className="h-3.5 w-3.5" />;
    default: return <Activity className="h-3.5 w-3.5" />;
  }
}

export function getActivityColor(type: string) {
  switch (type) {
    case "created":
    case "contact_created": return "bg-emerald-100 text-emerald-600";
    case "updated": return "bg-blue-100 text-blue-600";
    case "note_added": return "bg-amber-100 text-amber-600";
    case "email_sent": return "bg-violet-100 text-violet-600";
    case "message_sent": return "bg-emerald-100 text-emerald-600";
    case "opportunity_created": return "bg-purple-100 text-purple-600";
    case "stage_changed": return "bg-sky-100 text-sky-600";
    case "status_changed": return "bg-orange-100 text-orange-600";
    case "opportunity_assigned":
    case "contact_assigned": return "bg-indigo-100 text-indigo-600";
    case "document_uploaded": return "bg-cyan-100 text-cyan-600";
    default: return "bg-muted text-muted-foreground";
  }
}

export function getDateLabel(dateStr: string) {
  const d = new Date(dateStr);
  if (isToday(d)) return "Oggi";
  if (isYesterday(d)) return "Ieri";
  return format(d, "d MMMM yyyy", { locale: it });
}

export type RightTab = "activities" | "notes" | "appointments" | "opportunities" | "quotes" | "invoices" | "documents" | "ai_conversations" | "sms_log" | "settings";

import {
  FileText as FileTextIcon, Activity as ActivityIcon, StickyNote as StickyNoteIcon,
  CalendarDays, Target as TargetIcon, FileSignature, Bot, Smartphone, Settings as SettingsIcon,
} from "lucide-react";

export const RIGHT_TABS: { key: RightTab; icon: any; label: string }[] = [
  { key: "documents", icon: FileTextIcon, label: "Documenti" },
  { key: "activities", icon: ActivityIcon, label: "Attività" },
  { key: "notes", icon: StickyNoteIcon, label: "Note" },
  { key: "appointments", icon: CalendarDays, label: "Calendario" },
  { key: "opportunities", icon: TargetIcon, label: "Opportunità" },
  { key: "quotes", icon: FileSignature, label: "Preventivi" },
  { key: "invoices", icon: FileTextIcon, label: "Fatture" },
  { key: "ai_conversations", icon: Bot, label: "Conversazioni AI" },
  { key: "sms_log", icon: Smartphone, label: "Log SMS" },
  { key: "settings", icon: SettingsIcon, label: "Impostazioni" },
];
