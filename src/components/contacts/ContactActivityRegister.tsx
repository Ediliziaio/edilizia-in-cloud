/**
 * ContactActivityRegister — registro attività COMPLETO di un contatto.
 *
 * Timeline cronologica unica che aggrega, in sola lettura, tutto ciò che è
 * successo con il contatto:
 *   - Ingresso in CRM           (marketing_contacts.created_at + fonte)
 *   - Attività generiche        (marketing_contact_activities)
 *   - Note                      (marketing_contact_notes)
 *   - Chiamate umane + AI       (human_call_logs · ai_agent_conversations)
 *   - SMS                       (sms_messages)
 *   - WhatsApp                  (whatsapp_messages)
 *   - Email inviate             (email_outbox)
 *   - Email ricevute            (email_inbox)
 *   - Appuntamenti              (appointments)
 *
 * Funzioni UX: filtri per tipo con contatori, raggruppamento per giorno
 * (Oggi/Ieri/data), tempo relativo, autore dell'azione, testo espandibile,
 * evidenza appuntamenti futuri, pulsante aggiorna. Nessuna nuova tabella.
 */
import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  UserPlus, StickyNote, Phone, Bot, Smartphone, MessageSquare,
  Mail, MailOpen, CalendarDays, Activity, ArrowUpRight, ArrowDownLeft,
  Loader2, RefreshCw, Clock,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface Member { id: string; name: string }
interface Props {
  companyId?: string | null;
  contactId?: string | null;
  phone?: string | null;
  email?: string | null;
  /** created_at del contatto: usato per l'evento "entrato in CRM". */
  contactCreatedAt?: string | null;
  /** fonte del contatto (lead source) per arricchire l'evento di ingresso. */
  contactSource?: string | null;
  /** membri azienda (id→nome) per risolvere l'autore delle azioni. */
  members?: Member[];
  className?: string;
}

type EventKind =
  | "entry" | "note" | "call_human" | "call_ai" | "sms" | "whatsapp"
  | "email_out" | "email_in" | "appointment" | "activity";

interface RegItem {
  id: string;
  kind: EventKind;
  direction?: "outbound" | "inbound";
  title: string;
  text?: string | null;
  at: string; // ISO
  meta?: string | null;   // riga secondaria (stato, durata…)
  byId?: string | null;   // created_by → risolto a nome via members
  by?: string | null;     // nome già pronto (es. operatore chiamata)
  future?: boolean;       // appuntamento futuro
}

const KIND_META: Record<EventKind, { Icon: typeof Mail; color: string; bg: string }> = {
  entry:      { Icon: UserPlus,       color: "text-emerald-600", bg: "bg-emerald-50" },
  note:       { Icon: StickyNote,     color: "text-amber-600",   bg: "bg-amber-50" },
  call_human: { Icon: Phone,          color: "text-blue-600",    bg: "bg-blue-50" },
  call_ai:    { Icon: Bot,            color: "text-primary",     bg: "bg-primary/10" },
  sms:        { Icon: Smartphone,     color: "text-sky-600",     bg: "bg-sky-50" },
  whatsapp:   { Icon: MessageSquare,  color: "text-emerald-600", bg: "bg-emerald-50" },
  email_out:  { Icon: Mail,           color: "text-violet-600",  bg: "bg-violet-50" },
  email_in:   { Icon: MailOpen,       color: "text-violet-600",  bg: "bg-violet-50" },
  appointment:{ Icon: CalendarDays,   color: "text-indigo-600",  bg: "bg-indigo-50" },
  activity:   { Icon: Activity,       color: "text-slate-600",   bg: "bg-slate-100" },
};

const ACTIVITY_LABELS: Record<string, string> = {
  created: "Contatto creato",
  stage_change: "Cambio fase",
  status_change: "Cambio stato",
  tag_added: "Etichetta aggiunta",
  tag_removed: "Etichetta rimossa",
  opportunity_created: "Opportunità creata",
  converted: "Convertito in cliente",
  imported: "Importato",
  assigned: "Assegnato",
  form_submitted: "Form compilato",
};

// Gruppi di filtro: solo quelli con almeno un evento vengono mostrati.
const FILTERS: { key: string; label: string; kinds: EventKind[] | null }[] = [
  { key: "all",    label: "Tutto",        kinds: null },
  { key: "comm",   label: "Messaggi",     kinds: ["sms", "whatsapp"] },
  { key: "calls",  label: "Chiamate",     kinds: ["call_human", "call_ai"] },
  { key: "email",  label: "Email",        kinds: ["email_in", "email_out"] },
  { key: "notes",  label: "Note",         kinds: ["note"] },
  { key: "appt",   label: "Appuntamenti", kinds: ["appointment"] },
  { key: "system", label: "Sistema",      kinds: ["entry", "activity"] },
];

const rtf = new Intl.RelativeTimeFormat("it", { numeric: "auto" });
function fmtRelative(iso: string, nowMs: number) {
  const diff = new Date(iso).getTime() - nowMs;
  const abs = Math.abs(diff);
  const MIN = 60000, HOUR = 3600000, DAY = 86400000;
  if (abs < MIN) return "ora";
  if (abs < HOUR) return rtf.format(Math.round(diff / MIN), "minute");
  if (abs < DAY) return rtf.format(Math.round(diff / HOUR), "hour");
  if (abs < 30 * DAY) return rtf.format(Math.round(diff / DAY), "day");
  if (abs < 365 * DAY) return rtf.format(Math.round(diff / (30 * DAY)), "month");
  return rtf.format(Math.round(diff / (365 * DAY)), "year");
}
function fmtTime(iso: string) {
  return new Date(iso).toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" });
}
function dayKey(iso: string) {
  const d = new Date(iso);
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}
function dayLabel(iso: string, nowMs: number) {
  const d = new Date(iso);
  const now = new Date(nowMs);
  const startOf = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const diffDays = Math.round((startOf(d) - startOf(now)) / 86400000);
  if (diffDays === 0) return "Oggi";
  if (diffDays === -1) return "Ieri";
  if (diffDays === 1) return "Domani";
  return d.toLocaleDateString("it-IT", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
}

function fmtDur(s?: number | null) {
  if (!s) return null;
  const m = Math.floor(s / 60);
  return `${m}:${String(s % 60).padStart(2, "0")}`;
}

export function ContactActivityRegister({
  companyId, contactId, phone, email, contactCreatedAt, contactSource, members, className,
}: Props) {
  const queryClient = useQueryClient();
  const digits = (phone ?? "").replace(/\D/g, "");
  const tail = digits.length >= 8 ? digits.slice(-9) : "";
  const mail = (email ?? "").trim().toLowerCase();
  const enabled = !!companyId && (!!contactId || !!tail || !!mail);

  const [nowMs] = useState(() => Date.now());
  const [filter, setFilter] = useState("all");
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set());
  const [refreshing, setRefreshing] = useState(false);

  const memberMap = useMemo(() => {
    const m = new Map<string, string>();
    (members ?? []).forEach((x) => { if (x?.id) m.set(x.id, x.name); });
    return m;
  }, [members]);

  // Attività generiche (registro contatto)
  const { data: activityRows = [], isLoading: lAct } = useQuery({
    queryKey: ["reg-activities", companyId, contactId],
    enabled: !!companyId && !!contactId,
    staleTime: 30_000,
    queryFn: async (): Promise<RegItem[]> => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any).from("marketing_contact_activities")
        .select("id, activity_type, description, created_by, created_at")
        .eq("company_id", companyId).eq("contact_id", contactId)
        .order("created_at", { ascending: false }).limit(50);
      if (error) return [];
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return (data ?? []).map((r: any) => {
        const label = ACTIVITY_LABELS[r.activity_type]
          || (r.activity_type ? r.activity_type.charAt(0).toUpperCase() + r.activity_type.slice(1).replace(/_/g, " ") : "Attività");
        return { id: `act_${r.id}`, kind: "activity" as const, title: label, text: r.description, byId: r.created_by, at: r.created_at };
      });
    },
  });

  // Note
  const { data: noteRows = [], isLoading: lNote } = useQuery({
    queryKey: ["reg-notes", companyId, contactId],
    enabled: !!companyId && !!contactId,
    staleTime: 30_000,
    queryFn: async (): Promise<RegItem[]> => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any).from("marketing_contact_notes")
        .select("id, content, created_by, created_at")
        .eq("company_id", companyId).eq("contact_id", contactId)
        .order("created_at", { ascending: false }).limit(30);
      if (error) return [];
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return (data ?? []).map((r: any) => ({ id: `note_${r.id}`, kind: "note" as const, title: "Nota", text: r.content, byId: r.created_by, at: r.created_at }));
    },
  });

  // Chiamate (umane + AI)
  const { data: callRows = [], isLoading: lCall } = useQuery({
    queryKey: ["reg-calls", companyId, contactId, tail],
    enabled: !!companyId && (!!contactId || !!tail),
    staleTime: 30_000,
    queryFn: async (): Promise<RegItem[]> => {
      const out: RegItem[] = [];
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let hq: any = supabase.from("human_call_logs")
        .select("id, direction, to_number, from_number, status, duration_seconds, started_at, user_name")
        .eq("company_id", companyId).order("started_at", { ascending: false }).limit(30);
      if (contactId && tail) hq = hq.or(`contact_id.eq.${contactId},to_number.ilike.%${tail}%`);
      else if (contactId) hq = hq.eq("contact_id", contactId);
      else hq = hq.ilike("to_number", `%${tail}%`);
      const { data: human } = await hq;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (human ?? []).forEach((r: any) => {
        const outbound = (r.direction || "outbound") !== "inbound";
        const dur = fmtDur(r.duration_seconds);
        out.push({
          id: `hc_${r.id}`, kind: "call_human", direction: outbound ? "outbound" : "inbound",
          title: outbound ? "Chiamata in uscita" : "Chiamata in entrata",
          by: r.user_name || null,
          meta: [dur && `durata ${dur}`, r.status].filter(Boolean).join(" · ") || null,
          at: r.started_at,
        });
      });
      if (contactId) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { data: ai } = await (supabase as any).from("ai_agent_conversations")
          .select("id, call_direction, status, duration_seconds, started_at, summary")
          .eq("company_id", companyId).eq("contact_id", contactId)
          .order("started_at", { ascending: false }).limit(30);
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (ai ?? []).forEach((r: any) => {
          const dur = fmtDur(r.duration_seconds);
          out.push({
            id: `ac_${r.id}`, kind: "call_ai", direction: (r.call_direction || "outbound") === "inbound" ? "inbound" : "outbound",
            title: "Chiamata AI", text: r.summary, by: "Agente AI",
            meta: [dur && `durata ${dur}`, r.status].filter(Boolean).join(" · ") || null,
            at: r.started_at,
          });
        });
      }
      return out.filter((c) => c.at);
    },
  });

  // SMS
  const { data: smsRows = [], isLoading: lSms } = useQuery({
    queryKey: ["reg-sms", companyId, tail, contactId],
    enabled: !!companyId && (!!tail || !!contactId),
    staleTime: 30_000,
    queryFn: async (): Promise<RegItem[]> => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let q: any = supabase.from("sms_messages")
        .select("id, direction, status, to_number, body, sent_at, created_at, trigger_ref")
        .eq("company_id", companyId).order("created_at", { ascending: false }).limit(30);
      q = tail ? q.ilike("to_number", `%${tail}%`) : q.eq("trigger_ref", contactId);
      const { data, error } = await q;
      if (error) return [];
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return (data ?? []).map((r: any) => ({
        id: `sms_${r.id}`, kind: "sms" as const,
        direction: r.direction === "inbound" ? "inbound" : "outbound",
        title: "SMS", text: r.body, meta: r.status, at: r.sent_at ?? r.created_at,
      }));
    },
  });

  // WhatsApp
  const { data: waRows = [], isLoading: lWa } = useQuery({
    queryKey: ["reg-wa", companyId, tail],
    enabled: !!companyId && !!tail,
    staleTime: 30_000,
    queryFn: async (): Promise<RegItem[]> => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any).from("whatsapp_messages")
        .select("id, direction, to_phone, from_phone, content_text, created_at")
        .eq("company_id", companyId).or(`to_phone.ilike.%${tail}%,from_phone.ilike.%${tail}%`)
        .order("created_at", { ascending: false }).limit(30);
      if (error) return [];
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return (data ?? []).map((r: any) => ({
        id: `wa_${r.id}`, kind: "whatsapp" as const,
        direction: r.direction === "inbound" ? "inbound" : "outbound",
        title: "WhatsApp", text: r.content_text, at: r.created_at,
      }));
    },
  });

  // Email inviate
  const { data: emailOutRows = [], isLoading: lEout } = useQuery({
    queryKey: ["reg-email-out", companyId, mail],
    enabled: !!companyId && !!mail,
    staleTime: 30_000,
    queryFn: async (): Promise<RegItem[]> => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any).from("email_outbox")
        .select("id, subject, body_text, status, sent_at, created_at")
        .eq("company_id", companyId).contains("to_emails", [mail])
        .order("created_at", { ascending: false }).limit(30);
      if (error) return [];
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return (data ?? []).map((r: any) => ({
        id: `eo_${r.id}`, kind: "email_out" as const, direction: "outbound" as const,
        title: r.subject || "Email", text: r.body_text, meta: r.status, at: r.sent_at ?? r.created_at,
      }));
    },
  });

  // Email ricevute
  const { data: emailInRows = [], isLoading: lEin } = useQuery({
    queryKey: ["reg-email-in", companyId, contactId, mail],
    enabled: !!companyId && (!!contactId || !!mail),
    staleTime: 30_000,
    queryFn: async (): Promise<RegItem[]> => {
      const orParts: string[] = [];
      if (contactId) orParts.push(`matched_contact_id.eq.${contactId}`);
      if (mail) orParts.push(`from_email.ilike.%${mail}%`);
      if (orParts.length === 0) return [];
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any).from("email_inbox")
        .select("id, from_email, from_name, subject, raw_text, ai_summary, received_at, created_at")
        .eq("company_id", companyId).or(orParts.join(","))
        .order("received_at", { ascending: false }).limit(30);
      if (error) return [];
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return (data ?? []).map((r: any) => ({
        id: `ei_${r.id}`, kind: "email_in" as const, direction: "inbound" as const,
        title: r.subject || "Email ricevuta",
        text: r.ai_summary || r.raw_text,
        by: r.from_name || r.from_email || null,
        at: r.received_at ?? r.created_at,
      }));
    },
  });

  // Appuntamenti
  const { data: apptRows = [], isLoading: lAppt } = useQuery({
    queryKey: ["reg-appts", companyId, contactId],
    enabled: !!companyId && !!contactId,
    staleTime: 30_000,
    queryFn: async (): Promise<RegItem[]> => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any).from("appointments")
        .select("id, title, appointment_date, appointment_time, status, is_completed, assigned_to, created_at")
        .eq("company_id", companyId).eq("contact_id", contactId)
        .order("appointment_date", { ascending: false }).limit(30);
      if (error) return [];
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return (data ?? []).map((r: any) => {
        const when = r.appointment_date
          ? new Date(`${r.appointment_date}T${r.appointment_time || "00:00"}`).toISOString()
          : r.created_at;
        const future = new Date(when).getTime() > nowMs;
        const stato = r.is_completed ? "completato" : (future ? "in programma" : (r.status || "da svolgere"));
        return {
          id: `ap_${r.id}`, kind: "appointment" as const,
          title: r.title || "Appuntamento", meta: stato, byId: r.assigned_to, at: when, future,
        };
      });
    },
  });

  const allItems = useMemo(() => {
    const entry: RegItem[] = contactCreatedAt
      ? [{
          id: "entry",
          kind: "entry",
          title: "Contatto entrato in CRM",
          text: contactSource ? `Fonte: ${contactSource}` : null,
          at: contactCreatedAt,
        }]
      : [];
    return [
      ...entry, ...activityRows, ...noteRows, ...callRows, ...smsRows,
      ...waRows, ...emailOutRows, ...emailInRows, ...apptRows,
    ]
      .filter((i) => i.at)
      .sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime());
  }, [contactCreatedAt, contactSource, activityRows, noteRows, callRows, smsRows, waRows, emailOutRows, emailInRows, apptRows]);

  // Contatori per filtro (solo quelli con eventi vengono mostrati)
  const counts = useMemo(() => {
    const c: Record<string, number> = {};
    FILTERS.forEach((f) => {
      c[f.key] = f.kinds === null ? allItems.length : allItems.filter((i) => f.kinds!.includes(i.kind)).length;
    });
    return c;
  }, [allItems]);

  const activeFilter = FILTERS.find((f) => f.key === filter) ?? FILTERS[0];
  const items = useMemo(
    () => (activeFilter.kinds === null ? allItems : allItems.filter((i) => activeFilter.kinds!.includes(i.kind))),
    [allItems, activeFilter],
  );

  // Raggruppa per giorno preservando l'ordine (già desc)
  const groups = useMemo(() => {
    const map = new Map<string, { label: string; items: RegItem[] }>();
    items.forEach((i) => {
      const k = dayKey(i.at);
      if (!map.has(k)) map.set(k, { label: dayLabel(i.at, nowMs), items: [] });
      map.get(k)!.items.push(i);
    });
    return Array.from(map.values());
  }, [items, nowMs]);

  const loading = lAct || lNote || lCall || lSms || lWa || lEout || lEin || lAppt;

  const handleRefresh = async () => {
    setRefreshing(true);
    await queryClient.invalidateQueries({
      predicate: (q) => typeof q.queryKey?.[0] === "string" && (q.queryKey[0] as string).startsWith("reg-"),
    });
    setTimeout(() => setRefreshing(false), 600);
  };

  const toggleExpand = (id: string) =>
    setExpanded((prev) => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });

  if (!enabled) {
    return (
      <div className={cn("text-center py-10 text-sm text-muted-foreground", className)}>
        Nessun contatto collegato: il registro attività non è disponibile.
      </div>
    );
  }

  const visibleFilters = FILTERS.filter((f) => f.key === "all" || counts[f.key] > 0);

  return (
    <div className={cn("space-y-3", className)}>
      {/* Header */}
      <div className="flex items-center gap-2">
        <Activity className="h-4 w-4 text-primary" />
        <h3 className="text-sm font-semibold">Registro attività</h3>
        {allItems.length > 0 && (
          <span className="text-xs font-normal text-muted-foreground">({allItems.length})</span>
        )}
        <button
          type="button"
          onClick={handleRefresh}
          className="ml-auto inline-flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:bg-muted transition-colors"
          aria-label="Aggiorna registro"
          title="Aggiorna"
        >
          <RefreshCw className={cn("h-3.5 w-3.5", (refreshing || loading) && "animate-spin")} />
        </button>
      </div>

      {/* Filtri */}
      {allItems.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {visibleFilters.map((f) => (
            <button
              key={f.key}
              type="button"
              onClick={() => setFilter(f.key)}
              className={cn(
                "inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[11px] transition-colors",
                filter === f.key ? "bg-primary text-primary-foreground border-primary" : "bg-background text-muted-foreground hover:bg-muted",
              )}
            >
              {f.label}
              <span className={cn("tabular-nums", filter === f.key ? "opacity-90" : "opacity-60")}>{counts[f.key]}</span>
            </button>
          ))}
        </div>
      )}

      {/* Timeline */}
      {loading && allItems.length === 0 ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground py-8 justify-center">
          <Loader2 className="h-4 w-4 animate-spin" /> Carico il registro…
        </div>
      ) : items.length === 0 ? (
        <p className="text-sm text-muted-foreground text-center py-10">
          {allItems.length === 0
            ? "Nessuna attività registrata per questo contatto."
            : "Nessun evento per questo filtro."}
        </p>
      ) : (
        <div className="space-y-4">
          {groups.map((g) => (
            <div key={g.label} className="space-y-2">
              <div className="sticky top-0 z-10 -mx-1 bg-background/90 px-1 py-1 backdrop-blur">
                <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{g.label}</span>
              </div>
              <ol className="relative space-y-2.5 before:absolute before:left-[15px] before:top-1 before:bottom-1 before:w-px before:bg-border">
                {g.items.map((i) => {
                  const meta = KIND_META[i.kind];
                  const Icon = meta.Icon;
                  const dir = i.direction;
                  const author = i.by || (i.byId ? memberMap.get(i.byId) : null);
                  const longText = !!i.text && i.text.length > 160;
                  const isOpen = expanded.has(i.id);
                  return (
                    <li key={i.id} className="relative flex gap-3">
                      <div className={cn("z-10 mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full ring-4 ring-background", meta.bg)}>
                        <Icon className={cn("h-4 w-4", meta.color)} />
                      </div>
                      <div className={cn("min-w-0 flex-1 rounded-lg border bg-card p-2.5", i.future && "border-indigo-200 bg-indigo-50/40")}>
                        <div className="flex items-start gap-2">
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <span className="text-sm font-medium truncate">{i.title}</span>
                              {dir && (
                                <span className={cn("inline-flex items-center gap-0.5 text-[10px]", dir === "outbound" ? "text-blue-600" : "text-emerald-600")}>
                                  {dir === "outbound" ? <ArrowUpRight className="h-3 w-3" /> : <ArrowDownLeft className="h-3 w-3" />}
                                  {dir === "outbound" ? "inviato" : "ricevuto"}
                                </span>
                              )}
                              {i.future && (
                                <span className="inline-flex items-center gap-0.5 rounded-full bg-indigo-100 px-1.5 py-0.5 text-[9px] font-medium text-indigo-700">
                                  <Clock className="h-2.5 w-2.5" /> futuro
                                </span>
                              )}
                            </div>
                            {(i.meta || author) && (
                              <p className="text-[11px] text-muted-foreground mt-0.5">
                                {[i.meta, author && `di ${author}`].filter(Boolean).join(" · ")}
                              </p>
                            )}
                            {i.text && (
                              <>
                                <p className={cn("text-xs text-muted-foreground mt-1 whitespace-pre-wrap break-words", !isOpen && "line-clamp-3")}>
                                  {i.text}
                                </p>
                                {longText && (
                                  <button
                                    type="button"
                                    onClick={() => toggleExpand(i.id)}
                                    className="mt-0.5 text-[11px] font-medium text-primary hover:underline"
                                  >
                                    {isOpen ? "Mostra meno" : "Mostra tutto"}
                                  </button>
                                )}
                              </>
                            )}
                          </div>
                          <span className="shrink-0 text-right text-[10px] text-muted-foreground whitespace-nowrap" title={new Date(i.at).toLocaleString("it-IT")}>
                            <span className="block">{fmtTime(i.at)}</span>
                            <span className="block opacity-70">{fmtRelative(i.at, nowMs)}</span>
                          </span>
                        </div>
                      </div>
                    </li>
                  );
                })}
              </ol>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default ContactActivityRegister;
