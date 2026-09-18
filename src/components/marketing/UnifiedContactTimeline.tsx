import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { format, isToday, isYesterday } from "date-fns";
import { it } from "date-fns/locale";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Activity, Mail, MessageSquare, Phone, CalendarDays, StickyNote,
  Target, UserPlus, Settings, ArrowRight, RefreshCw, UserCheck,
  FileText, AlertCircle, Check, CheckCheck, Clock, AlertTriangle, Trash2, ArchiveRestore,
} from "lucide-react";
import { getMarketingAppointmentStatusMeta } from "@/lib/marketingAppointmentStatus";
import { autoreNota, dataOraNota } from "@/lib/marketing/autoreNota";

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
  /** Solo per category="message": destra (io) o sinistra (cliente). */
  direction?: "outbound" | "inbound";
  /** Solo per messaggi: canale + stato per i meta sotto la bolla. */
  channelLabel?: string;
  status?: string;
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

const getAppointmentStatusColor = (status: string | null | undefined) => {
  const variant = getMarketingAppointmentStatusMeta(status).variant;
  if (variant === "destructive") return "bg-red-100 text-red-600";
  if (variant === "default") return "bg-emerald-100 text-emerald-600";
  if (variant === "outline") return "bg-slate-100 text-slate-600";
  return "bg-blue-100 text-blue-600";
};

function getActivityIcon(type: string) {
  switch (type) {
    case "created":
    case "contact_created": return <UserPlus className="h-3 w-3" />;
    case "updated": return <Settings className="h-3 w-3" />;
    case "note_added": return <StickyNote className="h-3 w-3" />;
    case "opportunity_created": return <Target className="h-3 w-3" />;
    case "stage_changed": return <ArrowRight className="h-3 w-3" />;
    case "status_changed": return <RefreshCw className="h-3 w-3" />;
    case "opportunity_deleted": return <Trash2 className="h-3 w-3" />;
    case "opportunity_restored": return <ArchiveRestore className="h-3 w-3" />;
    case "opportunity_assigned":
    case "contact_assigned": return <UserCheck className="h-3 w-3" />;
    case "document_uploaded": return <FileText className="h-3 w-3" />;
    default: return <Activity className="h-3 w-3" />;
  }
}

function getDateLabel(dateStr: string) {
  const d = new Date(dateStr);
  if (isToday(d)) return "Oggi";
  if (isYesterday(d)) return "Ieri";
  return format(d, "d MMMM yyyy", { locale: it });
}

function digits(phone: string | null | undefined): string {
  return (phone ?? "").replace(/\D/g, "");
}

function stripHtml(html: string | null | undefined): string {
  return (html ?? "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

/** Testo bolla email: oggetto (in grassetto logico) + estratto corpo. */
function emailBody(subject: string | null | undefined, text: string | null | undefined, html: string | null | undefined): string {
  const body = (text && text.trim()) ? text.trim() : stripHtml(html);
  const subj = (subject ?? "").trim();
  const snippet = body.slice(0, 600);
  return subj ? `✉️ ${subj}${snippet ? "\n" + snippet : ""}` : (snippet || "(email)");
}

// Indicatore di stato (stile WhatsApp) per i messaggi inviati.
function StatusTick({ status }: { status?: string }) {
  if (!status) return null;
  if (status === "failed") return <AlertTriangle className="h-3 w-3 text-red-300" />;
  if (status === "sent") return <Check className="h-3 w-3 opacity-80" />;
  if (status === "delivered" || status === "read") return <CheckCheck className="h-3 w-3 opacity-90" />;
  return <Clock className="h-3 w-3 opacity-70" />;
}

// ── Component ──
export function UnifiedContactTimeline({
  contactId,
  companyId,
  contactPhone,
  contactEmail,
}: {
  contactId: string;
  companyId: string;
  contactPhone?: string | null;
  contactEmail?: string | null;
}) {
  const [filter, setFilter] = useState<FilterCategory>("all");
  const bottomRef = useRef<HTMLDivElement>(null);

  const queryOpts = { enabled: !!contactId, refetchInterval: 30000, refetchIntervalInBackground: false };

  const { data: activities = [], isLoading: loadingAct, isError: errAct } = useQuery({
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
    ...queryOpts,
  });

  const { data: messages = [], isLoading: loadingMsg, isError: errMsg } = useQuery({
    queryKey: ["unified_messages", contactId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("contact_messages")
        .select("*")
        .eq("contact_id", contactId)
        .order("created_at", { ascending: false })
        .limit(200);
      if (error) throw error;
      return data;
    },
    ...queryOpts,
  });

  // Risposte WhatsApp in ARRIVO dal cliente (tabella whatsapp_messages).
  const phoneDigits = digits(contactPhone);
  const { data: waInbound = [], isError: errWa } = useQuery({
    queryKey: ["unified_wa_inbound", companyId, phoneDigits],
    queryFn: async () => {
      const last9 = phoneDigits.slice(-9);
      const { data, error } = await supabase
        .from("whatsapp_messages")
        .select("id, content_text, direction, from_phone, created_at, message_type, media_url")
        .eq("company_id", companyId)
        .eq("direction", "inbound")
        .ilike("from_phone", `%${last9}%`)
        .order("created_at", { ascending: false })
        .limit(100);
      if (error) throw error;
      return data;
    },
    enabled: !!companyId && phoneDigits.length >= 8,
    refetchInterval: 30000,
    refetchIntervalInBackground: false,
  });

  // WhatsApp LOCALE (canale non ufficiale della piattaforma): in e out.
  // La RLS su openwa_messages e' super-admin-only: per una scheda contatto
  // aziendale la query fallisce o torna vuota → si degrada a [] in silenzio,
  // il canale semplicemente non esiste li'.
  const { data: waLocale = [] } = useQuery({
    queryKey: ["unified_wa_locale", contactId],
    queryFn: async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any)
        .from("openwa_messages")
        .select("id, body, direction, status, media_url, created_at")
        .eq("contact_id", contactId)
        .order("created_at", { ascending: false })
        .limit(200);
      if (error) return [];
      return (data ?? []) as Array<{ id: string; body: string | null; direction: string; status: string; media_url: string | null; created_at: string }>;
    },
    ...queryOpts,
  });

  // Email IN ARRIVO (risposte del contatto) → email_inbox, agganciata per
  // indirizzo mittente OPPURE via matched_contact_id (reply GHL-style: l'edge
  // email-inbound-reply valorizza matched_contact_id dalla route, così la
  // risposta compare qui anche se il contatto scrive da un alias diverso o
  // non ha un'email in anagrafica).
  const emailLower = (contactEmail ?? "").trim().toLowerCase();
  const { data: emailInbox = [], isError: errEmailIn } = useQuery({
    queryKey: ["unified_email_inbox", companyId, contactId, emailLower],
    queryFn: async () => {
      const orParts = [`matched_contact_id.eq.${contactId}`];
      // ilike solo se c'è un'email valida (senza virgole che romperebbero l'or).
      if (emailLower.includes("@") && !emailLower.includes(",")) {
        orParts.push(`from_email.ilike.${emailLower}`);
      }
      const { data, error } = await supabase
        .from("email_inbox")
        .select("id, subject, raw_text, raw_html, from_email, received_at")
        .eq("company_id", companyId)
        .or(orParts.join(","))
        .neq("is_personale", true)
        .order("received_at", { ascending: false })
        .limit(100);
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!companyId && !!contactId,
    refetchInterval: 30000,
    refetchIntervalInBackground: false,
  });

  // Email INVIATE (modulo email + transazionali) → email_outbox, per indirizzo destinatario.
  const { data: emailOutbox = [], isError: errEmailOut } = useQuery({
    queryKey: ["unified_email_outbox", companyId, emailLower],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("email_outbox")
        .select("id, subject, body_text, body_html, to_emails, status, sent_at, created_at")
        .eq("company_id", companyId)
        .contains("to_emails", [emailLower])
        .neq("status", "draft")
        .order("created_at", { ascending: false })
        .limit(100);
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!companyId && emailLower.includes("@"),
    refetchInterval: 30000,
    refetchIntervalInBackground: false,
  });

  const { data: emailLogs = [], isError: errEmail } = useQuery({
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
    ...queryOpts,
  });

  const { data: callLogs = [], isError: errCall } = useQuery({
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
    ...queryOpts,
  });

  const { data: appointments = [], isError: errApt } = useQuery({
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
    refetchInterval: 30000,
    refetchIntervalInBackground: false,
  });

  const { data: notes = [], isError: errNote } = useQuery({
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
    ...queryOpts,
  });

  const isLoading = loadingAct || loadingMsg;
  const errors = [
    errAct && "attività",
    errMsg && "messaggi",
    errWa && "WhatsApp",
    (errEmailIn || errEmailOut) && "email ricevute/inviate",
    errEmail && "email",
    errCall && "chiamate",
    errApt && "appuntamenti",
    errNote && "note",
  ].filter(Boolean) as string[];

  // Normalize all events (cronologico ASCENDENTE: vecchi sopra, nuovi sotto).
  const allEvents = useMemo(() => {
    const events: TimelineEvent[] = [];

    for (const act of activities) {
      // Le attività "message_sent" duplicano la bolla del messaggio → nascoste.
      if (act.activity_type === "message_sent") continue;
      events.push({
        id: `act-${act.id}`,
        type: act.activity_type,
        category: "activity",
        icon: getActivityIcon(act.activity_type),
        color: "bg-muted text-muted-foreground",
        title: act.description || act.activity_type,
        timestamp: act.created_at,
        metadata: {
          user: (act.profiles as any)?.first_name
            ? `${(act.profiles as any).first_name} ${(act.profiles as any).last_name || ""}`.trim()
            : undefined,
        },
      });
    }

    // Outbound (inviati da noi) → contact_messages
    for (const msg of messages) {
      const channelLabel = msg.channel === "whatsapp" ? "WhatsApp" : msg.channel === "email" ? "Email" : "SMS";
      events.push({
        id: `msg-${msg.id}`,
        type: `message_${msg.channel}`,
        category: "message",
        direction: "outbound",
        channelLabel,
        status: msg.status,
        icon: <MessageSquare className="h-3 w-3" />,
        color: "",
        title: channelLabel,
        description: msg.content || undefined,
        timestamp: msg.created_at,
      });
    }

    // Inbound (risposte del cliente) → whatsapp_messages
    for (const wa of waInbound) {
      events.push({
        id: `wa-${wa.id}`,
        type: "message_whatsapp",
        category: "message",
        direction: "inbound",
        channelLabel: "WhatsApp",
        icon: <MessageSquare className="h-3 w-3" />,
        color: "",
        title: "WhatsApp",
        description: wa.content_text || (wa.media_url ? "📎 Allegato" : "(messaggio)"),
        timestamp: wa.created_at,
      });
    }

    // WhatsApp Locale: bolle in entrambe le direzioni
    for (const wl of waLocale) {
      events.push({
        id: `wl-${wl.id}`,
        type: "message_whatsapp_locale",
        category: "message",
        direction: wl.direction === "inbound" ? "inbound" : "outbound",
        channelLabel: "WA Locale",
        status: wl.direction === "outbound" ? wl.status : undefined,
        icon: <MessageSquare className="h-3 w-3" />,
        color: "",
        title: "WA Locale",
        description: wl.body || (wl.media_url ? "📎 Allegato" : "(messaggio)"),
        timestamp: wl.created_at,
      });
    }

    // Email IN ARRIVO (risposte del contatto) → bolla a sinistra
    for (const em of emailInbox) {
      events.push({
        id: `ein-${em.id}`,
        type: "message_email",
        category: "message",
        direction: "inbound",
        channelLabel: "Email",
        icon: <Mail className="h-3 w-3" />,
        color: "",
        title: "Email",
        description: emailBody(em.subject, em.raw_text, em.raw_html),
        timestamp: em.received_at,
      });
    }

    // Email INVIATE (modulo + transazionali) → bolla a destra
    for (const em of emailOutbox) {
      events.push({
        id: `eout-${em.id}`,
        type: "message_email",
        category: "message",
        direction: "outbound",
        channelLabel: "Email",
        status: em.status,
        icon: <Mail className="h-3 w-3" />,
        color: "",
        title: "Email",
        description: emailBody(em.subject, em.body_text, em.body_html),
        timestamp: em.sent_at || em.created_at,
      });
    }

    for (const log of emailLogs) {
      const campaignName = (log.email_campaigns as any)?.name || "Campagna";
      events.push({
        id: `email-${log.id}`,
        type: "email_campaign",
        category: "email_campaign",
        icon: <Mail className="h-3 w-3" />,
        color: "bg-violet-100 text-violet-600",
        title: `Campagna: ${campaignName}`,
        timestamp: log.event_timestamp,
        metadata: { status: log.status },
      });
    }

    for (const call of callLogs) {
      events.push({
        id: `call-${call.id}`,
        type: "call",
        category: "call",
        icon: <Phone className="h-3 w-3" />,
        color: "bg-sky-100 text-sky-600",
        title: `Chiamata ${
          call.outcome === "answered" ? "risposta"
            : call.outcome === "no_answer" ? "senza risposta"
            : call.outcome === "busy" ? "occupato"
            : call.outcome === "wrong_number" ? "numero errato"
            : call.outcome === "callback" ? "da richiamare"
            : call.outcome
        }`,
        description: call.notes || undefined,
        timestamp: call.started_at,
      });
    }

    for (const apt of appointments) {
      const statusMeta = getMarketingAppointmentStatusMeta(apt.status);
      events.push({
        id: `apt-${apt.id}`,
        type: "appointment",
        category: "appointment",
        icon: <CalendarDays className="h-3 w-3" />,
        color: getAppointmentStatusColor(apt.status),
        title: apt.title,
        description: `${format(new Date(apt.appointment_date), "d MMM yyyy", { locale: it })}${apt.appointment_time ? " · " + apt.appointment_time.substring(0, 5) : ""} · ${statusMeta.label}`,
        timestamp: apt.created_at,
      });
    }

    for (const note of notes) {
      events.push({
        id: `note-${note.id}`,
        type: "note",
        category: "note",
        icon: <StickyNote className="h-3 w-3" />,
        color: "bg-amber-100 text-amber-600",
        // Chi l'ha scritta sta nel titolo: nella riga compatta della cronologia
        // la descrizione si tronca, il nome no.
        title: `Nota di ${autoreNota((note as { profiles?: { first_name?: string | null; last_name?: string | null } | null }).profiles)} · ${dataOraNota(note.created_at)}`,
        description: note.content || undefined,
        timestamp: note.created_at,
      });
    }

    // ASCENDENTE: i più vecchi sopra, i più recenti in fondo (stile chat).
    events.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
    return events;
  }, [activities, messages, waInbound, emailInbox, emailOutbox, emailLogs, callLogs, appointments, notes, waLocale]);

  const filtered = filter === "all" ? allEvents : allEvents.filter((e) => e.category === filter);

  const grouped = useMemo(() => {
    const groups: { label: string; items: TimelineEvent[] }[] = [];
    for (const event of filtered) {
      const label = getDateLabel(event.timestamp);
      const lastGroup = groups[groups.length - 1];
      if (lastGroup && lastGroup.label === label) lastGroup.items.push(event);
      else groups.push({ label, items: [event] });
    }
    return groups;
  }, [filtered]);

  // Auto-scroll in fondo quando arrivano nuovi messaggi.
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: "end" });
  }, [grouped.length, filtered.length]);

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

      {errors.length > 0 && (
        <div className="flex items-center gap-2 px-4 py-1.5 bg-destructive/10 text-destructive text-[11px] border-b shrink-0">
          <AlertCircle className="h-3.5 w-3.5 shrink-0" />
          <span>Errore nel caricamento di: {errors.join(", ")}</span>
        </div>
      )}

      {/* Chat content */}
      <div className="flex-1 overflow-auto p-4 max-w-2xl mx-auto w-full">
        {isLoading ? (
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className={cn("flex", i % 2 ? "justify-start" : "justify-end")}>
                <Skeleton className="h-10 w-48 rounded-2xl" />
              </div>
            ))}
          </div>
        ) : grouped.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 gap-2 text-muted-foreground">
            <MessageSquare className="h-8 w-8 opacity-40" />
            <p className="text-xs font-medium">Nessun messaggio</p>
            <p className="text-[11px] text-center max-w-[240px]">
              Scrivi un messaggio qui sotto. Le risposte del cliente compariranno a sinistra.
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {grouped.map((group) => (
              <div key={group.label} className="space-y-2">
                {/* Separatore data */}
                <div className="flex justify-center">
                  <span className="text-[10px] font-medium text-muted-foreground bg-muted/60 rounded-full px-2 py-0.5">
                    {group.label}
                  </span>
                </div>

                {group.items.map((event) => {
                  // ── Messaggio → bolla chat ──
                  if (event.category === "message") {
                    const out = event.direction === "outbound";
                    return (
                      <div key={event.id} className={cn("flex", out ? "justify-end" : "justify-start")}>
                        <div
                          className={cn(
                            "max-w-[80%] rounded-2xl px-3 py-2 text-sm whitespace-pre-wrap break-words shadow-sm",
                            out
                              ? "bg-emerald-600 text-white rounded-br-sm"
                              : "bg-muted text-foreground rounded-bl-sm",
                          )}
                        >
                          <p>{event.description || "(vuoto)"}</p>
                          <div
                            className={cn(
                              "mt-0.5 flex items-center justify-end gap-1 text-[10px]",
                              out ? "text-emerald-100" : "text-muted-foreground",
                            )}
                          >
                            <span>{event.channelLabel}</span>
                            <span>·</span>
                            <span>{format(new Date(event.timestamp), "HH:mm")}</span>
                            {out && <StatusTick status={event.status} />}
                          </div>
                        </div>
                      </div>
                    );
                  }

                  // ── Evento di sistema (nota / appuntamento / chiamata / attività) → riga piccola centrata ──
                  return (
                    <div key={event.id} className="flex justify-center">
                      <div className="flex items-center gap-1.5 max-w-[90%] rounded-full bg-muted/40 px-2.5 py-1 text-[10px] text-muted-foreground">
                        <span className={cn("h-4 w-4 rounded-full flex items-center justify-center shrink-0", event.color)}>
                          {event.icon}
                        </span>
                        <span className="font-medium truncate">{event.title}</span>
                        {event.description && <span className="truncate hidden sm:inline">· {event.description}</span>}
                        <span className="shrink-0">· {format(new Date(event.timestamp), "HH:mm")}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            ))}
            <div ref={bottomRef} />
          </div>
        )}
      </div>
    </div>
  );
}
