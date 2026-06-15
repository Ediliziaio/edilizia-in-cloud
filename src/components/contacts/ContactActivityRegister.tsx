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
 * Nessuna nuova tabella: solo SELECT. Il match avviene per contact_id quando
 * disponibile, con fallback su telefono/email (ultime cifre / indirizzo) per le
 * tabelle che non hanno la FK al contatto.
 */
import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  UserPlus, StickyNote, Phone, Bot, Smartphone, MessageSquare,
  Mail, MailOpen, CalendarDays, Activity, ArrowUpRight, ArrowDownLeft, Loader2,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface Props {
  companyId?: string | null;
  contactId?: string | null;
  phone?: string | null;
  email?: string | null;
  /** created_at del contatto: usato per l'evento "entrato in CRM". */
  contactCreatedAt?: string | null;
  /** fonte del contatto (lead source) per arricchire l'evento di ingresso. */
  contactSource?: string | null;
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
  meta?: string | null; // riga secondaria (stato, durata, operatore…)
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

// Etichette leggibili per i tipi di marketing_contact_activities più comuni;
// fallback al valore grezzo (capitalizzato) se non mappato.
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

function fmtDur(s?: number | null) {
  if (!s) return null;
  const m = Math.floor(s / 60);
  return `${m}:${String(s % 60).padStart(2, "0")}`;
}

function fmtWhen(iso: string) {
  const d = new Date(iso);
  return d.toLocaleString("it-IT", { day: "2-digit", month: "short", year: "2-digit", hour: "2-digit", minute: "2-digit" });
}

export function ContactActivityRegister({
  companyId, contactId, phone, email, contactCreatedAt, contactSource, className,
}: Props) {
  const digits = (phone ?? "").replace(/\D/g, "");
  const tail = digits.length >= 8 ? digits.slice(-9) : "";
  const mail = (email ?? "").trim().toLowerCase();
  const enabled = !!companyId && (!!contactId || !!tail || !!mail);

  // Attività generiche (registro contatto)
  const { data: activityRows = [], isLoading: lAct } = useQuery({
    queryKey: ["reg-activities", companyId, contactId],
    enabled: !!companyId && !!contactId,
    staleTime: 30_000,
    queryFn: async (): Promise<RegItem[]> => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any).from("marketing_contact_activities")
        .select("id, activity_type, description, created_at")
        .eq("company_id", companyId).eq("contact_id", contactId)
        .order("created_at", { ascending: false }).limit(50);
      if (error) return [];
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return (data ?? []).map((r: any) => {
        const label = ACTIVITY_LABELS[r.activity_type]
          || (r.activity_type ? r.activity_type.charAt(0).toUpperCase() + r.activity_type.slice(1).replace(/_/g, " ") : "Attività");
        return { id: `act_${r.id}`, kind: "activity" as const, title: label, text: r.description, at: r.created_at };
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
        .select("id, content, created_at")
        .eq("company_id", companyId).eq("contact_id", contactId)
        .order("created_at", { ascending: false }).limit(30);
      if (error) return [];
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return (data ?? []).map((r: any) => ({ id: `note_${r.id}`, kind: "note" as const, title: "Nota", text: r.content, at: r.created_at }));
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
          meta: [r.user_name, dur && `durata ${dur}`, r.status].filter(Boolean).join(" · ") || null,
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
            title: "Chiamata AI", text: r.summary,
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
        meta: r.from_name || r.from_email || null,
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
        .select("id, title, appointment_date, appointment_time, status, is_completed, created_at")
        .eq("company_id", companyId).eq("contact_id", contactId)
        .order("appointment_date", { ascending: false }).limit(30);
      if (error) return [];
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return (data ?? []).map((r: any) => {
        const when = r.appointment_date
          ? new Date(`${r.appointment_date}T${r.appointment_time || "00:00"}`).toISOString()
          : r.created_at;
        const stato = r.is_completed ? "completato" : (r.status || "in programma");
        return {
          id: `ap_${r.id}`, kind: "appointment" as const,
          title: r.title || "Appuntamento", meta: stato, at: when,
        };
      });
    },
  });

  const items = useMemo(() => {
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

  const loading = lAct || lNote || lCall || lSms || lWa || lEout || lEin || lAppt;

  if (!enabled) {
    return (
      <div className={cn("text-center py-10 text-sm text-muted-foreground", className)}>
        Nessun contatto collegato: il registro attività non è disponibile.
      </div>
    );
  }

  return (
    <div className={cn("space-y-3", className)}>
      <div className="flex items-center gap-2">
        <Activity className="h-4 w-4 text-primary" />
        <h3 className="text-sm font-semibold">Registro attività</h3>
        {items.length > 0 && (
          <span className="text-xs font-normal text-muted-foreground">({items.length})</span>
        )}
        {loading && <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground ml-1" />}
      </div>

      {loading && items.length === 0 ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground py-8 justify-center">
          <Loader2 className="h-4 w-4 animate-spin" /> Carico il registro…
        </div>
      ) : items.length === 0 ? (
        <p className="text-sm text-muted-foreground text-center py-10">
          Nessuna attività registrata per questo contatto.
        </p>
      ) : (
        <ol className="relative space-y-3 before:absolute before:left-[15px] before:top-1 before:bottom-1 before:w-px before:bg-border">
          {items.map((i) => {
            const meta = KIND_META[i.kind];
            const Icon = meta.Icon;
            const dir = i.direction;
            return (
              <li key={i.id} className="relative flex gap-3 pl-0">
                <div className={cn("z-10 mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full ring-4 ring-background", meta.bg)}>
                  <Icon className={cn("h-4 w-4", meta.color)} />
                </div>
                <div className="min-w-0 flex-1 rounded-lg border bg-card p-2.5">
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
                      </div>
                      {i.meta && <p className="text-[11px] text-muted-foreground mt-0.5">{i.meta}</p>}
                      {i.text && <p className="text-xs text-muted-foreground mt-1 line-clamp-3 whitespace-pre-wrap break-words">{i.text}</p>}
                    </div>
                    <span className="shrink-0 text-[10px] text-muted-foreground whitespace-nowrap">{fmtWhen(i.at)}</span>
                  </div>
                </div>
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
}

export default ContactActivityRegister;
