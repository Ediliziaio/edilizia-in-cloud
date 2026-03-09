import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { format, isToday, isYesterday } from "date-fns";
import { it } from "date-fns/locale";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Activity, Mail, MessageSquare, Phone, CalendarDays, StickyNote,
  Target, UserPlus, Settings, ArrowRight, RefreshCw, UserCheck,
  FileText, Smartphone, Bot, Filter,
} from "lucide-react";

// ── Types ──
interface TimelineEvent {
  id: string;
  type: string;
  category: "activity" | "message" | "email_campaign" | "call" | "appointment" | "note";
  icon: React.ReactNode;
  color: string;
  title: string;
  description?: string;
  timestamp: string;
  metadata?: Record<string, any>;
}

type FilterCategory = "all" | "activity" | "message" | "email_campaign" | "call" | "appointment" | "note";

const FILTER_OPTIONS: { key: FilterCategory; label: string; icon: React.ReactNode }[] = [
  { key: "all", label: "Tutti", icon: <Activity className="h-3 w-3" /> },
  { key: "message", label: "Messaggi", icon: <MessageSquare className="h-3 w-3" /> },
  { key: "email_campaign", label: "Email", icon: <Mail className="h-3 w-3" /> },
  { key: "call", label: "Chiamate", icon: <Phone className="h-3 w-3" /> },
  { key: "appointment", label: "Appuntamenti", icon: <CalendarDays className="h-3 w-3" /> },
  { key: "note", label: "Note", icon: <StickyNote className="h-3 w-3" /> },
  { key: "activity", label: "Attività", icon: <Activity className="h-3 w-3" /> },
];

// ── Icon/color helpers ──
function getActivityIcon(type: string) {
  switch (type) {
    case "created":
    case "contact_created": return <UserPlus className="h-3.5 w-3.5" />;
    case "updated": return <Settings className="h-3.5 w-3.5" />;
    case "note_added": return <StickyNote className="h-3.5 w-3.5" />;
    case "email_sent": return <Mail className="h-3.5 w-3.5" />;
    case "message_sent": return <MessageSquare className="h-3.5 w-3.5" />;
    case "opportunity_created": return <Target className="h-3.5 w-3.5" />;
    case "stage_changed": return <ArrowRight className="h-3.5 w-3.5" />;
    case "status_changed": return <RefreshCw className="h-3.5 w-3.5" />;
    case "opportunity_assigned":
    case "contact_assigned": return <UserCheck className="h-3.5 w-3.5" />;
    case "document_uploaded": return <FileText className="h-3.5 w-3.5" />;
    default: return <Activity className="h-3.5 w-3.5" />;
  }
}

function getActivityColor(type: string) {
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

function getDateLabel(dateStr: string) {
  const d = new Date(dateStr);
  if (isToday(d)) return "Oggi";
  if (isYesterday(d)) return "Ieri";
  return format(d, "d MMMM yyyy", { locale: it });
}

// ── Component ──
export function UnifiedContactTimeline({ contactId, companyId }: { contactId: string; companyId: string }) {
  const [filter, setFilter] = useState<FilterCategory>("all");

  // Fetch all data sources in parallel
  const { data: activities = [] } = useQuery({
    queryKey: ["unified_activities", contactId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("marketing_contact_activities")
        .select("*, profiles:created_by(first_name, last_name)")
        .eq("contact_id", contactId)
        .order("created_at", { ascending: false })
        .limit(200);
      if (error) throw error;
      return data;
    },
    enabled: !!contactId,
  });

  const { data: messages = [] } = useQuery({
    queryKey: ["unified_messages", contactId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("contact_messages")
        .select("*")
        .eq("contact_id", contactId)
        .order("created_at", { ascending: false })
        .limit(100);
      if (error) throw error;
      return data;
    },
    enabled: !!contactId,
  });

  const { data: emailLogs = [] } = useQuery({
    queryKey: ["unified_email_logs", contactId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("email_logs")
        .select("*, email_campaigns(name, subject)")
        .eq("contact_id", contactId)
        .order("event_timestamp", { ascending: false })
        .limit(100);
      if (error) throw error;
      return data;
    },
    enabled: !!contactId,
  });

  const { data: callLogs = [] } = useQuery({
    queryKey: ["unified_call_logs", contactId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("call_logs")
        .select("*, profiles:user_id(first_name, last_name)")
        .eq("contact_id", contactId)
        .order("started_at", { ascending: false })
        .limit(50);
      if (error) throw error;
      return data;
    },
    enabled: !!contactId,
  });

  const { data: appointments = [] } = useQuery({
    queryKey: ["unified_appointments", contactId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("appointments")
        .select("*, marketing_calendars:calendar_id(name)")
        .eq("contact_id", contactId)
        .eq("company_id", companyId)
        .order("appointment_date", { ascending: false })
        .limit(50);
      if (error) throw error;
      return data;
    },
    enabled: !!contactId && !!companyId,
  });

  const { data: notes = [] } = useQuery({
    queryKey: ["unified_notes", contactId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("marketing_contact_notes")
        .select("*, profiles:created_by(first_name, last_name)")
        .eq("contact_id", contactId)
        .order("created_at", { ascending: false })
        .limit(100);
      if (error) throw error;
      return data;
    },
    enabled: !!contactId,
  });

  // Normalize all events
  const allEvents = useMemo(() => {
    const events: TimelineEvent[] = [];

    // Activities
    for (const act of activities) {
      events.push({
        id: `act-${act.id}`,
        type: act.activity_type,
        category: "activity",
        icon: getActivityIcon(act.activity_type),
        color: getActivityColor(act.activity_type),
        title: act.description || act.activity_type,
        timestamp: act.created_at,
        metadata: {
          ...(act.metadata as Record<string, any> || {}),
          user: (act.profiles as any)?.first_name
            ? `${(act.profiles as any).first_name} ${(act.profiles as any).last_name || ""}`.trim()
            : undefined,
        },
      });
    }

    // Messages (WhatsApp, Email, SMS)
    for (const msg of messages) {
      const channelIcon = msg.channel === "whatsapp"
        ? <MessageSquare className="h-3.5 w-3.5" />
        : msg.channel === "email"
        ? <Mail className="h-3.5 w-3.5" />
        : <Smartphone className="h-3.5 w-3.5" />;
      const channelColor = msg.channel === "whatsapp"
        ? "bg-emerald-100 text-emerald-600"
        : msg.channel === "email"
        ? "bg-violet-100 text-violet-600"
        : "bg-sky-100 text-sky-600";
      const channelLabel = msg.channel === "whatsapp" ? "WhatsApp" : msg.channel === "email" ? "Email" : "SMS";
      const direction = (msg as any).direction;

      events.push({
        id: `msg-${msg.id}`,
        type: `message_${msg.channel}`,
        category: "message",
        icon: channelIcon,
        color: channelColor,
        title: `${channelLabel} ${direction === "inbound" ? "ricevuto" : "inviato"}`,
        description: msg.content?.substring(0, 120) || undefined,
        timestamp: msg.created_at,
        metadata: { status: msg.status, channel: channelLabel },
      });
    }

    // Email campaign logs
    for (const log of emailLogs) {
      const campaignName = (log.email_campaigns as any)?.name || "Campagna";
      const subject = (log.email_campaigns as any)?.subject || "";
      events.push({
        id: `email-${log.id}`,
        type: "email_campaign",
        category: "email_campaign",
        icon: <Mail className="h-3.5 w-3.5" />,
        color: log.status === "delivered" ? "bg-violet-100 text-violet-600" : "bg-red-100 text-red-600",
        title: `Campagna: ${campaignName}`,
        description: subject ? `Oggetto: ${subject}` : undefined,
        timestamp: log.event_timestamp || log.created_at,
        metadata: { status: log.status, provider: log.provider, ab_variant: (log as any).ab_variant },
      });
    }

    // Call logs
    for (const call of callLogs) {
      const userName = (call.profiles as any)?.first_name
        ? `${(call.profiles as any).first_name} ${(call.profiles as any).last_name || ""}`.trim()
        : undefined;
      events.push({
        id: `call-${call.id}`,
        type: "call",
        category: "call",
        icon: <Phone className="h-3.5 w-3.5" />,
        color: call.outcome === "answered" ? "bg-emerald-100 text-emerald-600" : "bg-amber-100 text-amber-600",
        title: `Chiamata ${call.outcome === "answered" ? "risposta" : call.outcome === "no_answer" ? "senza risposta" : call.outcome}`,
        description: call.notes || undefined,
        timestamp: call.started_at,
        metadata: { durata: `${call.duration_sec}s`, operatore: userName },
      });
    }

    // Appointments
    for (const apt of appointments) {
      events.push({
        id: `apt-${apt.id}`,
        type: "appointment",
        category: "appointment",
        icon: <CalendarDays className="h-3.5 w-3.5" />,
        color: apt.status === "completato" ? "bg-emerald-100 text-emerald-600" : apt.status === "annullato" ? "bg-red-100 text-red-600" : "bg-blue-100 text-blue-600",
        title: apt.title,
        description: apt.formatted_address || undefined,
        timestamp: apt.created_at,
        metadata: {
          data: format(new Date(apt.appointment_date), "d MMM yyyy", { locale: it }),
          ora: apt.appointment_time?.substring(0, 5),
          stato: apt.status,
          calendario: (apt.marketing_calendars as any)?.name,
        },
      });
    }

    // Notes
    for (const note of notes) {
      const userName = (note.profiles as any)?.first_name
        ? `${(note.profiles as any).first_name} ${(note.profiles as any).last_name || ""}`.trim()
        : undefined;
      events.push({
        id: `note-${note.id}`,
        type: "note",
        category: "note",
        icon: <StickyNote className="h-3.5 w-3.5" />,
        color: "bg-amber-100 text-amber-600",
        title: "Nota",
        description: note.content?.substring(0, 200) || undefined,
        timestamp: note.created_at,
        metadata: { autore: userName },
      });
    }

    // Sort by timestamp descending
    events.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
    return events;
  }, [activities, messages, emailLogs, callLogs, appointments, notes]);

  // Apply filter
  const filtered = filter === "all" ? allEvents : allEvents.filter((e) => e.category === filter);

  // Group by date
  const grouped = useMemo(() => {
    const groups: { label: string; items: TimelineEvent[] }[] = [];
    for (const event of filtered) {
      const label = getDateLabel(event.timestamp);
      const lastGroup = groups[groups.length - 1];
      if (lastGroup && lastGroup.label === label) {
        lastGroup.items.push(event);
      } else {
        groups.push({ label, items: [event] });
      }
    }
    return groups;
  }, [filtered]);

  return (
    <div className="flex flex-col h-full">
      {/* Filter bar */}
      <div className="flex items-center gap-1 px-4 py-2 border-b overflow-x-auto shrink-0">
        {FILTER_OPTIONS.map((opt) => (
          <Button
            key={opt.key}
            variant={filter === opt.key ? "default" : "ghost"}
            size="sm"
            className="h-6 text-[10px] gap-1 shrink-0"
            onClick={() => setFilter(opt.key)}
          >
            {opt.icon}
            {opt.label}
            {opt.key !== "all" && (
              <span className="text-[9px] opacity-70">
                ({allEvents.filter((e) => e.category === opt.key).length})
              </span>
            )}
          </Button>
        ))}
      </div>

      {/* Timeline content */}
      <div className="flex-1 overflow-auto p-4 max-w-2xl mx-auto w-full">
        {grouped.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 gap-2 text-muted-foreground">
            <Activity className="h-8 w-8 opacity-40" />
            <p className="text-xs font-medium">Nessuna attività registrata</p>
            <p className="text-[11px] text-center max-w-[240px]">
              Aggiungi una nota o modifica i dati del contatto per vedere la cronologia qui.
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {grouped.map((group) => (
              <div key={group.label}>
                {/* Date separator */}
                <div className="flex items-center gap-3 mb-3">
                  <div className="flex-1 h-px bg-border" />
                  <span className="text-[11px] font-medium text-muted-foreground">{group.label}</span>
                  <div className="flex-1 h-px bg-border" />
                </div>
                {/* Events */}
                <div className="space-y-2">
                  {group.items.map((event) => (
                    <div key={event.id} className="flex items-start gap-2.5 py-1.5">
                      <div className={cn("h-6 w-6 rounded-full flex items-center justify-center shrink-0 mt-0.5", event.color)}>
                        {event.icon}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-medium">{event.title}</p>
                        {event.description && (
                          <p className="text-[10px] text-muted-foreground mt-0.5 line-clamp-2">{event.description}</p>
                        )}
                        <p className="text-[10px] text-muted-foreground mt-0.5">
                          {format(new Date(event.timestamp), "HH:mm", { locale: it })}
                          {event.metadata?.user && <> · <span className="font-medium">{event.metadata.user}</span></>}
                          {event.metadata?.autore && <> · <span className="font-medium">{event.metadata.autore}</span></>}
                          {event.metadata?.operatore && <> · <span className="font-medium">{event.metadata.operatore}</span></>}
                          {event.metadata?.status && (
                            <> · <Badge variant="secondary" className="text-[8px] h-3.5 px-1 ml-1">{event.metadata.status}</Badge></>
                          )}
                        </p>
                      </div>
                      {event.metadata && Object.keys(event.metadata).filter(k => !["user", "autore", "operatore", "status"].includes(k)).length > 0 && (
                        <Popover>
                          <PopoverTrigger asChild>
                            <button className="text-[10px] text-primary hover:underline shrink-0">Dettagli</button>
                          </PopoverTrigger>
                          <PopoverContent className="w-56 p-2.5 text-xs space-y-1" side="left">
                            {Object.entries(event.metadata)
                              .filter(([k]) => !["user", "autore", "operatore"].includes(k))
                              .map(([key, val]) => val != null && (
                                <div key={key} className="flex justify-between gap-2">
                                  <span className="text-muted-foreground capitalize">{key.replace(/_/g, " ")}</span>
                                  <span className="font-medium text-right truncate max-w-[120px]">{String(val)}</span>
                                </div>
                              ))}
                          </PopoverContent>
                        </Popover>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
