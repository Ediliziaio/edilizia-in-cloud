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
  Workflow, ListChecks, Smartphone,
} from "lucide-react";
import { getMarketingAppointmentStatusMeta } from "@/lib/marketingAppointmentStatus";
import { autoreNota, dataOraNota } from "@/lib/marketing/autoreNota";
import { useConversazioneDettagli } from "@/hooks/useConversazioni";
import {
  chiaveDettaglio, percorsoMessaggio, rigaPercorsoWhatsApp,
} from "@/lib/conversazioni/presentazione";

// ── Types ──
interface TimelineEvent {
  id: string;
  type: string;
  category: "activity" | "message" | "email_campaign" | "call" | "appointment" | "note" | "sequence" | "task";
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

type FilterCategory = "all" | "whatsapp" | "email" | "sms" | "call" | "appointment" | "note" | "sequence" | "task" | "activity";

/** Ogni filtro dice quali eventi raccoglie: WhatsApp ed email sono separati. */
const FILTER_OPTIONS: { key: FilterCategory; label: string; icon: React.ReactNode; match: (e: TimelineEvent) => boolean }[] = [
  { key: "all", label: "Tutti", icon: <Activity className="h-3 w-3" />, match: () => true },
  { key: "whatsapp", label: "WhatsApp", icon: <MessageSquare className="h-3 w-3" />, match: (e) => e.category === "message" && (e.type === "message_whatsapp" || e.type === "message_whatsapp_locale") },
  { key: "email", label: "Email", icon: <Mail className="h-3 w-3" />, match: (e) => e.category === "email_campaign" || (e.category === "message" && e.type === "message_email") },
  { key: "sms", label: "SMS", icon: <Smartphone className="h-3 w-3" />, match: (e) => e.category === "message" && e.type === "message_sms" },
  { key: "call", label: "Chiamate", icon: <Phone className="h-3 w-3" />, match: (e) => e.category === "call" },
  { key: "appointment", label: "Appuntamenti", icon: <CalendarDays className="h-3 w-3" />, match: (e) => e.category === "appointment" },
  { key: "note", label: "Note", icon: <StickyNote className="h-3 w-3" />, match: (e) => e.category === "note" },
  { key: "sequence", label: "Sequenze", icon: <Workflow className="h-3 w-3" />, match: (e) => e.category === "sequence" },
  { key: "task", label: "Task", icon: <ListChecks className="h-3 w-3" />, match: (e) => e.category === "task" },
  { key: "activity", label: "Attività", icon: <Activity className="h-3 w-3" />, match: (e) => e.category === "activity" },
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

  // WhatsApp (numeri collegati a Meta) nei due sensi, tabella whatsapp_messages.
  // Dal 24/09/2026 ogni messaggio ha il suo contatto (contact_id); per quelli
  // rimasti senza vale il numero, come prima. Prima qui c'erano solo le
  // risposte del cliente: ciò che si inviava da Conversazioni non compariva.
  const phoneDigits = digits(contactPhone);
  const { data: waMessaggi = [], isError: errWa } = useQuery({
    queryKey: ["unified_wa", companyId, contactId, phoneDigits],
    queryFn: async () => {
      const last9 = phoneDigits.slice(-9);
      const filtri = [`contact_id.eq.${contactId}`];
      if (last9.length >= 8) {
        filtri.push(
          `and(contact_id.is.null,direction.eq.inbound,from_phone.ilike.%${last9}%)`,
          `and(contact_id.is.null,direction.eq.outbound,to_phone.ilike.%${last9}%)`,
        );
      }
      const { data, error } = await supabase
        .from("whatsapp_messages")
        .select("id, content_text, direction, created_at, message_type, media_url, delivery_status, delivery_error")
        .eq("company_id", companyId)
        .or(filtri.join(","))
        .order("created_at", { ascending: false })
        .limit(200);
      if (error) throw error;
      return data;
    },
    enabled: !!companyId && !!contactId,
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

  // Da quale numero/casella è partito ogni messaggio.
  const { data: dettagli } = useConversazioneDettagli("contatto", contactId);

  // Sequenze di outreach: avvio, fine e passo in cui si trova.
  const { data: sequenze = [] } = useQuery({
    queryKey: ["unified_sequences", companyId, contactId],
    enabled: !!companyId && !!contactId,
    refetchInterval: 60000,
    refetchIntervalInBackground: false,
    queryFn: async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: iscr, error } = await (supabase as any)
        .from("outreach_enrollments")
        .select("id, sequence_id, status, current_step, stop_reason, enrolled_at, updated_at")
        .eq("company_id", companyId).eq("contact_id", contactId)
        .order("enrolled_at", { ascending: false }).limit(50);
      if (error || !iscr?.length) return [];
      const ids = [...new Set(iscr.map((r: any) => r.sequence_id).filter(Boolean))];
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: seq } = await (supabase as any).from("outreach_sequences").select("id, name").eq("company_id", companyId).in("id", ids);
      const nomi = new Map<string, string>((seq ?? []).map((x: any) => [x.id, x.name]));
      return iscr.map((r: any) => ({ ...r, nome: nomi.get(r.sequence_id) ?? "Sequenza" })) as Array<{
        id: string; nome: string; status: string | null; current_step: number | null; stop_reason: string | null; enrolled_at: string; updated_at: string | null;
      }>;
    },
  });

  // Automazioni (flussi) a cui il contatto è iscritto.
  const { data: automazioni = [] } = useQuery({
    queryKey: ["unified_automations", companyId, contactId],
    enabled: !!companyId && !!contactId,
    refetchInterval: 60000,
    refetchIntervalInBackground: false,
    queryFn: async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: iscr, error } = await (supabase as any)
        .from("automation_enrollments")
        .select("id, flow_id, status, created_at, updated_at")
        .eq("company_id", companyId).eq("entity_type", "contact").eq("entity_id", contactId)
        .order("created_at", { ascending: false }).limit(50);
      if (error || !iscr?.length) return [];
      const ids = [...new Set(iscr.map((r: any) => r.flow_id).filter(Boolean))];
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: flussi } = await (supabase as any).from("automation_flows").select("id, name").eq("company_id", companyId).in("id", ids);
      const nomi = new Map<string, string>((flussi ?? []).map((x: any) => [x.id, x.name]));
      return iscr.map((r: any) => ({ ...r, nome: nomi.get(r.flow_id) ?? "Automazione" })) as Array<{
        id: string; nome: string; status: string | null; created_at: string; updated_at: string | null;
      }>;
    },
  });

  // Chiamate da fare generate dalle sequenze.
  const { data: chiamateDaFare = [] } = useQuery({
    queryKey: ["unified_call_tasks", companyId, contactId],
    enabled: !!companyId && !!contactId,
    refetchInterval: 60000,
    refetchIntervalInBackground: false,
    queryFn: async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any)
        .from("outreach_call_tasks")
        .select("id, status, note, due_at, created_at, done_at")
        .eq("company_id", companyId).eq("contact_id", contactId)
        .order("created_at", { ascending: false }).limit(50);
      if (error) return [];
      return (data ?? []) as Array<{ id: string; status: string | null; note: string | null; due_at: string | null; created_at: string; done_at: string | null }>;
    },
  });

  // Task del contatto.
  const { data: tasks = [] } = useQuery({
    queryKey: ["unified_tasks", companyId, contactId],
    enabled: !!companyId && !!contactId,
    refetchInterval: 60000,
    refetchIntervalInBackground: false,
    queryFn: async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any)
        .from("tasks")
        .select("id, title, notes, status, created_at")
        .eq("company_id", companyId).eq("contact_id", contactId)
        .order("created_at", { ascending: false }).limit(50);
      if (error) return [];
      return (data ?? []) as Array<{ id: string; title: string | null; notes: string | null; status: string | null; created_at: string }>;
    },
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
      // Le attività "message_sent" duplicano la bolla del messaggio, e
      // "note_added" la nota stessa (che qui c'è per intero) → nascoste.
      if (act.activity_type === "message_sent" || act.activity_type === "note_added") continue;
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

    // WhatsApp nei due sensi → whatsapp_messages, con l'esito di Meta
    for (const wa of waMessaggi) {
      const inviato = wa.direction === "outbound";
      const testo = wa.content_text || (wa.media_url ? "📎 Allegato" : "(messaggio)");
      const nonConsegnato = inviato && wa.delivery_status === "failed";
      events.push({
        id: `wa-${wa.id}`,
        type: "message_whatsapp",
        category: "message",
        direction: inviato ? "outbound" : "inbound",
        channelLabel: inviato && wa.message_type === "template" ? "WhatsApp · modello" : "WhatsApp",
        status: inviato ? wa.delivery_status ?? undefined : undefined,
        icon: <MessageSquare className="h-3 w-3" />,
        color: "",
        title: "WhatsApp",
        metadata: { ref: chiaveDettaglio("whatsapp_messages", wa.id) },
        description: nonConsegnato
          ? `${testo}\n✗ Non consegnato${wa.delivery_error ? `: ${wa.delivery_error}` : ""}`
          : testo,
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
        metadata: { ref: chiaveDettaglio("email_inbox", em.id), oggetto: em.subject, da: em.from_email },
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
        metadata: { ref: chiaveDettaglio("email_outbox", em.id), oggetto: em.subject, a: (em.to_emails ?? [])[0] },
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

    const statoSeq: Record<string, string> = {
      active: "in corso", completed: "completata", stopped: "fermata", paused: "in pausa",
      replied: "ha risposto", failed: "non riuscita", cancelled: "annullata", exited: "uscito",
    };
    for (const sq of sequenze) {
      events.push({
        id: `seq-${sq.id}`, type: "sequence", category: "sequence",
        icon: <Workflow className="h-3 w-3" />, color: "bg-fuchsia-100 text-fuchsia-600",
        title: `Sequenza «${sq.nome}» avviata`, timestamp: sq.enrolled_at,
      });
      const fine = sq.status && sq.status !== "active";
      if (fine && sq.updated_at) {
        events.push({
          id: `seq-fine-${sq.id}`, type: "sequence", category: "sequence",
          icon: <Workflow className="h-3 w-3" />, color: "bg-fuchsia-100 text-fuchsia-600",
          title: `Sequenza «${sq.nome}» ${statoSeq[sq.status!] ?? sq.status}`,
          description: [sq.current_step != null ? `al passo ${sq.current_step}` : null, sq.stop_reason].filter(Boolean).join(" · ") || undefined,
          timestamp: sq.updated_at,
        });
      }
    }
    for (const au of automazioni) {
      events.push({
        id: `aut-${au.id}`, type: "sequence", category: "sequence",
        icon: <Workflow className="h-3 w-3" />, color: "bg-indigo-100 text-indigo-600",
        title: `Automazione «${au.nome}» avviata`, timestamp: au.created_at,
      });
      if (au.status && au.status !== "active" && au.updated_at) {
        events.push({
          id: `aut-fine-${au.id}`, type: "sequence", category: "sequence",
          icon: <Workflow className="h-3 w-3" />, color: "bg-indigo-100 text-indigo-600",
          title: `Automazione «${au.nome}» ${statoSeq[au.status] ?? au.status}`, timestamp: au.updated_at,
        });
      }
    }
    for (const ct of chiamateDaFare) {
      events.push({
        id: `ctk-${ct.id}`, type: "task", category: "task",
        icon: <Phone className="h-3 w-3" />, color: "bg-sky-100 text-sky-600",
        title: "Chiamata da fare (dalla sequenza)",
        description: [ct.note, ct.due_at ? `entro il ${format(new Date(ct.due_at), "d MMM HH:mm", { locale: it })}` : null].filter(Boolean).join(" · ") || undefined,
        timestamp: ct.created_at,
      });
      if (ct.done_at) {
        events.push({
          id: `ctk-ok-${ct.id}`, type: "task", category: "task",
          icon: <Check className="h-3 w-3" />, color: "bg-emerald-100 text-emerald-600",
          title: "Chiamata della sequenza completata", timestamp: ct.done_at,
        });
      }
    }
    for (const tk of tasks) {
      events.push({
        id: `tsk-${tk.id}`, type: "task", category: "task",
        icon: <ListChecks className="h-3 w-3" />, color: "bg-teal-100 text-teal-600",
        title: `Task: ${tk.title ?? "senza titolo"}${tk.status ? ` · ${tk.status}` : ""}`,
        description: tk.notes || undefined,
        timestamp: tk.created_at,
      });
    }

    // ASCENDENTE: i più vecchi sopra, i più recenti in fondo (stile chat).
    events.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
    return events;
  }, [activities, messages, waMessaggi, emailInbox, emailOutbox, emailLogs, callLogs, appointments, notes, waLocale, sequenze, automazioni, chiamateDaFare, tasks]);

  const filtroAttivo = FILTER_OPTIONS.find((o) => o.key === filter) ?? FILTER_OPTIONS[0];
  const filtered = filter === "all" ? allEvents : allEvents.filter(filtroAttivo.match);

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

  // Si parte dall'ultimo messaggio, come in chat; quando ne arriva uno nuovo si
  // segue solo se si era già in fondo. Scroll sul contenitore e non
  // scrollIntoView, che faceva scorrere anche la pagina intorno (25/09/2026).
  const scrollRef = useRef<HTMLDivElement>(null);
  const inFondoRef = useRef(true);
  useEffect(() => {
    const el = scrollRef.current;
    if (el && inFondoRef.current) el.scrollTop = el.scrollHeight;
  }, [grouped.length, filtered.length, isLoading]);
  const [noteAperte, setNoteAperte] = useState<Set<string>>(new Set());

  return (
    <div className="flex flex-col h-full">
      {/* Filter bar */}
      <div className="flex items-center gap-1 px-4 py-2 border-b overflow-x-auto shrink-0 max-sm:px-3 max-sm:py-1.5 max-sm:scrollbar-none">
        {FILTER_OPTIONS.filter((opt) => opt.key === "all" || opt.key === filter || allEvents.some(opt.match)).map((opt) => (
          <Button
            key={opt.key}
            variant={filter === opt.key ? "default" : "ghost"}
            size="sm"
            // tap-compact: su telefono la regola dei 44px li gonfiava in blocchi.
            // Telefono: 11px (a 10px, con i numeri a 9, non si leggevano).
            className="tap-compact h-6 text-[10px] gap-1 shrink-0 max-sm:h-7 max-sm:text-[11px]"
            onClick={() => setFilter(opt.key)}
          >
            {opt.icon}
            {opt.label}
            {opt.key !== "all" && (
              <span className="text-[9px] opacity-70 max-sm:text-[11px]">
                ({allEvents.filter(opt.match).length})
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
      {/* Mobile: fondo chiaro da chat, lo spazio sopra lo scrittore è la conversazione. */}
      <div
        ref={scrollRef}
        onScroll={(e) => {
          const el = e.currentTarget;
          inFondoRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
        }}
        className="flex-1 min-h-0 overflow-y-auto overscroll-contain px-3 py-3 max-sm:bg-slate-50"
      >
        <div className="max-w-2xl mx-auto w-full">
        {isLoading ? (
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className={cn("flex", i % 2 ? "justify-start" : "justify-end")}>
                <Skeleton className="h-10 w-48 rounded-2xl" />
              </div>
            ))}
          </div>
        ) : grouped.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 gap-2 text-muted-foreground max-sm:py-8">
            <MessageSquare className="h-8 w-8 opacity-40" />
            <p className="text-xs font-medium">Nessun messaggio</p>
            {/* Mobile no: la spiegazione sotto il vuoto. */}
            <p className="text-[11px] text-center max-w-[240px] max-sm:hidden">
              Scrivi un messaggio qui sotto. Le risposte del cliente compariranno a sinistra.
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {grouped.map((group) => (
              <div key={group.label} className="space-y-2">
                {/* Separatore data */}
                <div className="flex justify-center">
                  <span className="text-[10px] font-medium text-muted-foreground bg-muted/60 rounded-full px-2 py-0.5 max-sm:text-[11px]">
                    {group.label}
                  </span>
                </div>

                {group.items.map((event) => {
                  // ── Messaggio → email = scheda con intestazione; WhatsApp/SMS = bolla ──
                  if (event.category === "message") {
                    const out = event.direction === "outbound";
                    const perc = percorsoMessaggio(
                      (() => { const d = event.metadata?.ref ? dettagli?.get(event.metadata.ref as string) : null; return d ?? null; })(),
                    );
                    if (event.type === "message_email") {
                      const testo = (event.description ?? "").replace(/^✉️ [^\n]*\n?/, "");
                      const oggetto = (event.metadata?.oggetto as string | undefined) ?? "";
                      const da = perc?.da || (event.metadata?.da as string | undefined) || "";
                      const a = perc?.a || (event.metadata?.a as string | undefined) || "";
                      return (
                        <div key={event.id} className={cn("flex", out ? "justify-end" : "justify-start")}>
                          <div className={cn(
                            "w-full max-w-[88%] rounded-lg border bg-white text-foreground shadow-sm",
                            out ? "border-blue-200 border-r-4 border-r-blue-500" : "border-slate-200 border-l-4 border-l-blue-500",
                          )}>
                            <div className="flex items-center gap-1.5 border-b bg-blue-50/70 px-3 py-1.5 text-[11px]">
                              <Mail className="h-3.5 w-3.5 text-blue-600" />
                              <span className="font-semibold text-blue-700">{out ? "Email inviata" : "Email ricevuta"}</span>
                              <span className="ml-auto text-muted-foreground">{format(new Date(event.timestamp), "HH:mm")}</span>
                              {out && <StatusTick status={event.status} />}
                            </div>
                            <div className="space-y-0.5 px-3 pt-2 text-[11px] text-muted-foreground">
                              {da && <p><span className="font-medium text-foreground/70">Da:</span> {da}</p>}
                              {a && <p><span className="font-medium text-foreground/70">A:</span> {a}</p>}
                              {perc?.via && <p><span className="font-medium text-foreground/70">Tramite:</span> {perc.via}</p>}
                            </div>
                            <div className="px-3 pb-2.5 pt-1.5">
                              {oggetto && <p className="text-[13px] font-semibold leading-snug">{oggetto}</p>}
                              <p className="mt-1 whitespace-pre-wrap break-words text-[13px] leading-snug">{testo || "(vuota)"}</p>
                            </div>
                          </div>
                        </div>
                      );
                    }
                    const riga = rigaPercorsoWhatsApp(perc);
                    return (
                      <div key={event.id} className={cn("flex", out ? "justify-end" : "justify-start")}>
                        <div
                          className={cn(
                            "max-w-[78%] rounded-2xl px-3 py-1.5 text-[13px] leading-snug whitespace-pre-wrap break-words shadow-sm",
                            out
                              ? "bg-emerald-600 text-white rounded-br-sm"
                              : "bg-muted text-foreground rounded-bl-sm border-l-4 border-l-emerald-500",
                          )}
                        >
                          {riga && (
                            <p className={cn("mb-0.5 text-[10px]", out ? "text-emerald-100" : "text-muted-foreground")}>{riga}</p>
                          )}
                          <p>{event.description || "(vuoto)"}</p>
                          <div
                            className={cn(
                              "mt-0.5 flex items-center justify-end gap-1 text-[10px] max-sm:text-[11px]",
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

                  // ── Nota → riquadro leggibile per intero (il riepilogo AI della
                  //    chat è una nota: nella riga compatta non si leggeva) ──
                  if (event.category === "note") {
                    const testo = event.description ?? "";
                    const lunga = testo.split("\n").length > 6 || testo.length > 420;
                    const aperta = noteAperte.has(event.id);
                    return (
                      <div key={event.id} className="flex justify-center">
                        <div className="w-full max-w-[92%] rounded-lg border border-amber-200 bg-amber-50/70 px-3 py-2 text-amber-950">
                          <div className="flex items-center gap-1.5 text-[10px] font-medium text-amber-700">
                            <StickyNote className="h-3 w-3 shrink-0" />
                            <span className="truncate">{event.title}</span>
                          </div>
                          <p className={cn("mt-1 text-[12px] leading-snug whitespace-pre-wrap break-words", lunga && !aperta && "line-clamp-6")}>
                            {testo || "(vuota)"}
                          </p>
                          {lunga && (
                            <button
                              type="button"
                              className="mt-0.5 text-[11px] font-medium text-amber-700 hover:underline"
                              onClick={() => setNoteAperte((prev) => {
                                const next = new Set(prev);
                                if (next.has(event.id)) next.delete(event.id); else next.add(event.id);
                                return next;
                              })}
                            >
                              {aperta ? "Mostra meno" : "Mostra tutto"}
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  }

                  // ── Evento di sistema (appuntamento / chiamata / attività) → riga piccola centrata ──
                  return (
                    <div key={event.id} className="flex justify-center">
                      <div className="flex items-center gap-1.5 max-w-[90%] rounded-full bg-muted/40 px-2.5 py-1 text-[10px] text-muted-foreground max-sm:text-[11px]">
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
          </div>
        )}
        </div>
      </div>
    </div>
  );
}
