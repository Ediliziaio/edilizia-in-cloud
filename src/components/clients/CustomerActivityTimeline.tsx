/**
 * CustomerActivityTimeline — timeline unificata pagina cliente.
 *
 * 2026-05-27 (richiesta utente "diario al centro come pagina contatti"):
 * aggrega le attività che già fetchiamo per il cliente (orders, tickets,
 * appuntamenti, email conversations, fatture) in un unico stream ordinato
 * per data, con filtro tabs.
 *
 * Pattern preso da UnifiedContactTimeline (marketing) ma adattato alle
 * entità business del cliente — NON c'è una tabella
 * `customer_activities` dedicata, quindi aggrego client-side.
 */
import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { format, isToday, isYesterday } from "date-fns";
import { it } from "date-fns/locale";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Activity, Mail, CalendarDays, StickyNote, ClipboardList,
  Ticket as TicketIcon, FileText, ExternalLink,
} from "lucide-react";
import type {
  OrderRow, TicketRow, AppuntamentoRow, FatturaRow,
} from "@/components/clients/CustomerBusinessTabs";

// ── Types ──
type FilterCategory = "all" | "email" | "appointment" | "note" | "activity";

interface TimelineEvent {
  id: string;
  category: FilterCategory;
  icon: React.ReactNode;
  iconBg: string;
  title: string;
  description?: string;
  timestamp: string;
  href?: string;
}

interface EmailConversationLite {
  id: string | null;
  thread_id: string | null;
  from_name: string | null;
  from_email: string | null;
  subject: string | null;
  received_at: string | null;
  preview: string | null;
}

interface DiaryMessageLite {
  id: string;
  content: string;
  author_name?: string | null;
  created_at: string;
}

interface CustomerActivityTimelineProps {
  customerId: string;
  orders: OrderRow[];
  tickets: TicketRow[];
  appuntamenti: AppuntamentoRow[];
  fatture: FatturaRow[];
  emailConversations?: EmailConversationLite[];
  diaryMessages?: DiaryMessageLite[];
  customerCreatedAt?: string;
}

const FILTER_OPTIONS: { key: FilterCategory; label: string; icon: React.ReactNode }[] = [
  { key: "all",         label: "Tutti",        icon: <Activity className="h-3 w-3" /> },
  { key: "email",       label: "Email",        icon: <Mail className="h-3 w-3" /> },
  { key: "appointment", label: "Appuntamenti", icon: <CalendarDays className="h-3 w-3" /> },
  { key: "note",        label: "Note",         icon: <StickyNote className="h-3 w-3" /> },
  { key: "activity",    label: "Attività",     icon: <ClipboardList className="h-3 w-3" /> },
];

function getDateLabel(dateStr: string): string {
  const d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) return "";
  if (isToday(d)) return "Oggi";
  if (isYesterday(d)) return "Ieri";
  return format(d, "d MMMM yyyy", { locale: it });
}

function getTimeLabel(dateStr: string): string {
  try {
    return format(new Date(dateStr), "HH:mm", { locale: it });
  } catch {
    return "";
  }
}

export function CustomerActivityTimeline({
  customerId,
  orders,
  tickets,
  appuntamenti,
  fatture,
  emailConversations = [],
  diaryMessages = [],
  customerCreatedAt,
}: CustomerActivityTimelineProps) {
  const navigate = useNavigate();
  const [filter, setFilter] = useState<FilterCategory>("all");

  // Aggrega tutti gli eventi in un unico stream
  const events: TimelineEvent[] = useMemo(() => {
    const list: TimelineEvent[] = [];

    // Origin: cliente creato
    if (customerCreatedAt) {
      list.push({
        id: `customer-created-${customerId}`,
        category: "activity",
        icon: <Activity className="h-3.5 w-3.5" />,
        iconBg: "bg-emerald-100 text-emerald-600",
        title: "Cliente registrato",
        description: "Anagrafica creata nel sistema",
        timestamp: customerCreatedAt,
      });
    }

    // Orders
    orders.forEach((o) => {
      list.push({
        id: `order-${o.id}`,
        category: "activity",
        icon: <ClipboardList className="h-3.5 w-3.5" />,
        iconBg: "bg-blue-100 text-blue-600",
        title: `Ordine ${o.order_code ?? "—"}`,
        description: o.description || `${o.order_statuses?.name ?? "Nuovo"}${o.total_amount ? ` · € ${Number(o.total_amount).toLocaleString("it-IT")}` : ""}`,
        timestamp: o.created_at,
        href: `/azienda/ordini/${o.id}`,
      });
    });

    // Tickets
    tickets.forEach((t) => {
      list.push({
        id: `ticket-${t.id}`,
        category: "activity",
        icon: <TicketIcon className="h-3.5 w-3.5" />,
        iconBg: "bg-amber-100 text-amber-600",
        title: `Ticket: ${t.title || "Senza titolo"}`,
        description: `${t.status ?? ""}${t.priority ? ` · Priorità ${t.priority}` : ""}`,
        timestamp: t.created_at,
        href: `/azienda/assistenza/${t.id}`,
      });
    });

    // Appuntamenti
    appuntamenti.forEach((a) => {
      if (!a.start_at) return;
      list.push({
        id: `appt-${a.id}`,
        category: "appointment",
        icon: <CalendarDays className="h-3.5 w-3.5" />,
        iconBg: "bg-violet-100 text-violet-600",
        title: a.title || "Appuntamento",
        description: a.status ? `Stato: ${a.status}` : undefined,
        timestamp: a.start_at,
        href: "/azienda/calendario",
      });
    });

    // Fatture
    fatture.forEach((f) => {
      if (!f.data_emissione) return;
      list.push({
        id: `fatt-${f.id}`,
        category: "activity",
        icon: <FileText className="h-3.5 w-3.5" />,
        iconBg: "bg-emerald-100 text-emerald-600",
        title: `${f.tipo || "Fattura"} ${f.numero || ""}`.trim(),
        description: f.totale_documento != null ? `€ ${Number(f.totale_documento).toLocaleString("it-IT", { minimumFractionDigits: 2 })}${f.stato ? ` · ${f.stato}` : ""}` : (f.stato ?? undefined),
        timestamp: f.data_emissione,
        href: `/azienda/documenti/${f.id}`,
      });
    });

    // Email
    emailConversations.forEach((e) => {
      if (!e.received_at) return;
      const senderName = e.from_name || e.from_email || "Sconosciuto";
      const threadHref = e.thread_id
        ? `/azienda/email?thread_id=${encodeURIComponent(e.thread_id)}`
        : "/azienda/email";
      list.push({
        id: `email-${e.id ?? e.thread_id ?? e.received_at}`,
        category: "email",
        icon: <Mail className="h-3.5 w-3.5" />,
        iconBg: "bg-violet-100 text-violet-600",
        title: e.subject || "(senza oggetto)",
        description: `Da: ${senderName}${e.preview ? ` — ${e.preview.substring(0, 80)}` : ""}`,
        timestamp: e.received_at,
        href: threadHref,
      });
    });

    // Diary messages (note interne)
    diaryMessages.forEach((m) => {
      list.push({
        id: `diary-${m.id}`,
        category: "note",
        icon: <StickyNote className="h-3.5 w-3.5" />,
        iconBg: "bg-amber-100 text-amber-600",
        title: m.author_name || "Nota",
        description: m.content,
        timestamp: m.created_at,
      });
    });

    // Sort by timestamp desc
    list.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
    return list;
  }, [customerId, customerCreatedAt, orders, tickets, appuntamenti, fatture, emailConversations, diaryMessages]);

  // Filtra in base a tab attivo
  const filteredEvents = useMemo(() => {
    if (filter === "all") return events;
    return events.filter((e) => e.category === filter);
  }, [events, filter]);

  // Conteggi per i tab
  const counts = useMemo(() => {
    const acc: Record<FilterCategory, number> = {
      all: events.length,
      email: 0,
      appointment: 0,
      note: 0,
      activity: 0,
    };
    events.forEach((e) => {
      acc[e.category] = (acc[e.category] ?? 0) + 1;
    });
    return acc;
  }, [events]);

  // Raggruppa per data (label "Oggi", "Ieri", "15 maggio 2026"...)
  const groupedEvents = useMemo(() => {
    const groups = new Map<string, TimelineEvent[]>();
    filteredEvents.forEach((e) => {
      const label = getDateLabel(e.timestamp);
      if (!groups.has(label)) groups.set(label, []);
      groups.get(label)!.push(e);
    });
    return Array.from(groups.entries());
  }, [filteredEvents]);

  return (
    <div className="flex flex-col h-full">
      {/* Tabs filtro */}
      <div className="flex items-center gap-1 px-3 py-2 border-b bg-card overflow-x-auto shrink-0">
        {FILTER_OPTIONS.map((opt) => (
          <Button
            key={opt.key}
            variant={filter === opt.key ? "default" : "ghost"}
            size="sm"
            className={cn(
              "h-7 px-2.5 text-xs gap-1.5 shrink-0",
              filter === opt.key && opt.key === "all" && "bg-blue-600 text-white hover:bg-blue-700",
            )}
            onClick={() => setFilter(opt.key)}
          >
            {opt.icon}
            {opt.label}
            <span className={cn(
              "ml-0.5 text-[10px] tabular-nums",
              filter === opt.key ? "opacity-90" : "opacity-60"
            )}>
              ({counts[opt.key] ?? 0})
            </span>
          </Button>
        ))}
      </div>

      {/* Timeline scrollabile */}
      <div className="flex-1 overflow-y-auto px-3 py-3">
        {filteredEvents.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <Activity className="h-10 w-10 text-muted-foreground/30 mb-3" />
            <p className="text-sm font-medium text-muted-foreground">Nessuna attività da mostrare</p>
            <p className="text-xs text-muted-foreground mt-1">
              {filter === "all"
                ? "Le interazioni con questo cliente appariranno qui."
                : `Nessuna attività di tipo "${FILTER_OPTIONS.find((o) => o.key === filter)?.label}".`}
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {groupedEvents.map(([dateLabel, evs]) => (
              <div key={dateLabel}>
                {/* Separator data centrato (stile marketing) */}
                <div className="text-center text-xs text-muted-foreground font-medium py-2">
                  {dateLabel}
                </div>
                <div className="space-y-2">
                  {evs.map((ev) => (
                    <button
                      key={ev.id}
                      type="button"
                      disabled={!ev.href}
                      onClick={() => ev.href && navigate(ev.href)}
                      className={cn(
                        "w-full flex items-start gap-2.5 p-2.5 rounded-lg text-left transition-colors group",
                        ev.href ? "hover:bg-muted/50 cursor-pointer" : "cursor-default",
                      )}
                    >
                      <div className={cn("h-7 w-7 rounded-full flex items-center justify-center shrink-0", ev.iconBg)}>
                        {ev.icon}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-baseline justify-between gap-2">
                          <p className="text-sm font-medium truncate">{ev.title}</p>
                          <span className="text-[10px] text-muted-foreground shrink-0">
                            {getTimeLabel(ev.timestamp)}
                          </span>
                        </div>
                        {ev.description && (
                          <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{ev.description}</p>
                        )}
                      </div>
                      {ev.href && (
                        <ExternalLink className="h-3.5 w-3.5 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity shrink-0 mt-1" />
                      )}
                    </button>
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
