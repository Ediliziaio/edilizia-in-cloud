/**
 * NotificationsBellPopover — bell topbar con popover a tendina.
 *
 * UX:
 *   - Trigger Bell con badge unread integrato
 *   - Header con contatori "Tutte (N)" / "Non lette (M)" come filter tabs
 *   - Bottoni: "Segna tutte lette" + refresh implicito (realtime)
 *   - Lista raggruppata per periodo (Oggi / Ieri / Questa settimana / Precedenti)
 *   - Entità con 2+ aggiornamenti collassabili (dedup rumore)
 *   - Per-riga: dot unread, mark-as-read on click, dismiss X on hover,
 *     navigate(action_url) chiude il popover
 *   - Auto-mark-all-read 1.5s dopo apertura del popover (non subito: dà
 *     tempo all'utente di vedere "non lette" prima)
 *   - Empty state informativo per filtro
 */

import { useEffect, useMemo, useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { formatDistanceToNow, isToday, isYesterday, isThisWeek } from "date-fns";
import { it } from "date-fns/locale";
import {
  Bell,
  BellOff,
  MessageSquare,
  Package,
  CheckSquare,
  Banknote,
  X,
  CheckCheck,
  Check,
  ChevronDown,
  ChevronRight,
  Percent,
  Settings,
  Sparkles,
  CalendarClock,
  AlertTriangle,
  Truck,
  Wrench,
} from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useNotifications, type Notification } from "@/hooks/useNotifications";
import { cn } from "@/lib/utils";

type FilterMode = "all" | "unread";

const typeConfig: Record<string, { icon: typeof Bell; bg: string; fg: string }> = {
  ticket_new: { icon: MessageSquare, bg: "bg-blue-50 ring-blue-200", fg: "text-blue-600" },
  ticket_reply: { icon: MessageSquare, bg: "bg-blue-50 ring-blue-200", fg: "text-blue-600" },
  // Messaggio arrivato in Conversazioni (WhatsApp, email, SMS, Messenger…).
  conversazione_messaggio: { icon: MessageSquare, bg: "bg-emerald-50 ring-emerald-200", fg: "text-emerald-600" },
  order_status_changed: { icon: Package, bg: "bg-orange-50 ring-orange-200", fg: "text-orange-600" },
  task_assigned: { icon: CheckSquare, bg: "bg-purple-50 ring-purple-200", fg: "text-purple-600" },
  task_due: { icon: CheckSquare, bg: "bg-purple-50 ring-purple-200", fg: "text-purple-600" },
  installment_due: { icon: Banknote, bg: "bg-emerald-50 ring-emerald-200", fg: "text-emerald-600" },
  quote_approval_requested: { icon: Percent, bg: "bg-orange-50 ring-orange-200", fg: "text-orange-600" },
  quote_approval_approved: { icon: Percent, bg: "bg-emerald-50 ring-emerald-200", fg: "text-emerald-600" },
  quote_approval_rejected: { icon: Percent, bg: "bg-rose-50 ring-rose-200", fg: "text-rose-600" },
  quote_approval_counter_proposed: { icon: Percent, bg: "bg-blue-50 ring-blue-200", fg: "text-blue-600" },
  hr_scadenza: { icon: CalendarClock, bg: "bg-amber-50 ring-amber-200", fg: "text-amber-600" },
  mezzo_scadenza: { icon: Truck, bg: "bg-amber-50 ring-amber-200", fg: "text-amber-600" },
  mezzo_segnalazione: { icon: Wrench, bg: "bg-red-50 ring-red-200", fg: "text-red-600" },
  // Avvisi di vita azienda (cash flow, trial, inattività): erano un banner
  // fisso in cima a ogni pagina, ora vivono qui dentro.
  lifecycle: { icon: AlertTriangle, bg: "bg-amber-50 ring-amber-200", fg: "text-amber-600" },
  generic: { icon: Bell, bg: "bg-slate-50 ring-slate-200", fg: "text-slate-600" },
};

const entityTypeLabels: Record<string, string> = {
  order: "Ordine",
  ticket: "Ticket",
  task: "Attività",
  contact: "Contatto",
  contatto: "Contatto",
  cliente: "Cliente",
  opportunity: "Opportunità",
  project: "Progetto",
  invoice: "Fattura",
  installment: "Rata",
  quote: "Preventivo",
  mezzo: "Mezzo",
  integration: "Integrazione",
};

type TimePeriod = "oggi" | "ieri" | "questa_settimana" | "precedenti";

const periodLabels: Record<TimePeriod, string> = {
  oggi: "Oggi",
  ieri: "Ieri",
  questa_settimana: "Questa settimana",
  precedenti: "Precedenti",
};

const periodOrder: TimePeriod[] = ["oggi", "ieri", "questa_settimana", "precedenti"];

interface EntityGroup {
  key: string;
  entityType: string;
  entityId: string;
  label: string;
  notifications: Notification[];
}

interface TimePeriodGroup {
  period: TimePeriod;
  label: string;
  count: number;
  unread: number;
  singles: Notification[];
  entityGroups: EntityGroup[];
}

function getTimePeriod(dateStr: string): TimePeriod {
  const date = new Date(dateStr);
  if (isToday(date)) return "oggi";
  if (isYesterday(date)) return "ieri";
  if (isThisWeek(date, { weekStartsOn: 1 })) return "questa_settimana";
  return "precedenti";
}

function buildEntityGroupLabel(entityType: string, entityId: string, count: number): string {
  const label = entityTypeLabels[entityType] || entityType;
  return `${count} aggiornamenti su ${label} #${entityId.slice(0, 8)}`;
}

function NotificationIcon({ type, unread }: { type: string; unread: boolean }) {
  const config = typeConfig[type] || typeConfig.generic;
  const Icon = config.icon;
  return (
    <div
      className={cn(
        "relative flex h-9 w-9 shrink-0 items-center justify-center rounded-full ring-1 transition-colors",
        config.bg,
        unread && "ring-2",
      )}
    >
      <Icon className={cn("h-4 w-4", config.fg)} />
      {unread && (
        <span className="absolute -top-0.5 -right-0.5 h-2.5 w-2.5 rounded-full bg-primary ring-2 ring-background" />
      )}
    </div>
  );
}

function useGroupedNotifications(
  notifications: Notification[],
  filter: FilterMode,
): TimePeriodGroup[] {
  return useMemo(() => {
    const filtered = filter === "unread" ? notifications.filter((n) => !n.is_read) : notifications;

    const buckets: Record<TimePeriod, Notification[]> = {
      oggi: [],
      ieri: [],
      questa_settimana: [],
      precedenti: [],
    };

    for (const n of filtered) {
      buckets[getTimePeriod(n.created_at)].push(n);
    }

    const result: TimePeriodGroup[] = [];

    for (const period of periodOrder) {
      const items = buckets[period];
      if (items.length === 0) continue;

      const entityMap = new Map<string, Notification[]>();
      const singles: Notification[] = [];

      for (const n of items) {
        if (n.entity_type && n.entity_id) {
          const key = `${n.entity_type}::${n.entity_id}`;
          if (!entityMap.has(key)) entityMap.set(key, []);
          entityMap.get(key)!.push(n);
        } else {
          singles.push(n);
        }
      }

      const entityGroups: EntityGroup[] = [];
      for (const [key, groupItems] of entityMap) {
        if (groupItems.length < 2) {
          singles.push(groupItems[0]);
        } else {
          const [entityType, entityId] = key.split("::");
          entityGroups.push({
            key,
            entityType,
            entityId,
            label: buildEntityGroupLabel(entityType, entityId, groupItems.length),
            notifications: groupItems,
          });
        }
      }

      singles.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

      result.push({
        period,
        label: periodLabels[period],
        count: items.length,
        unread: items.filter((n) => !n.is_read).length,
        singles,
        entityGroups,
      });
    }

    return result;
  }, [notifications, filter]);
}

function NotificationRow({
  n,
  onClickNotification,
  onDismiss,
  onMarkRead,
}: {
  n: Notification;
  onClickNotification: (n: Notification) => void;
  onDismiss: (id: string) => void;
  onMarkRead: (id: string) => void;
}) {
  const unread = !n.is_read;
  // Gli avvisi azienda non si "leggono", si chiudono: la X resta sempre
  // visibile (non solo all'hover) perché è l'unico modo di spegnerli.
  const avviso = n.type === "lifecycle";
  return (
    <div
      className={cn(
        "relative group px-3 py-2.5 flex gap-2.5 transition-colors border-l-2",
        unread ? "bg-primary/5 border-primary" : "border-transparent",
        n.action_url && "cursor-pointer hover:bg-accent/50",
      )}
      onClick={() => onClickNotification(n)}
    >
      <NotificationIcon type={n.type} unread={unread} />
      <div className="flex-1 min-w-0 pr-12">
        <p className={cn("text-sm leading-tight", unread ? "font-semibold" : "font-medium")}>
          {n.title}
        </p>
        {n.body && (
          <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{n.body}</p>
        )}
        <p className="text-[11px] text-muted-foreground/70 mt-1">
          {formatDistanceToNow(new Date(n.created_at), { addSuffix: true, locale: it })}
        </p>
      </div>
      <div
        className={cn(
          "absolute top-1.5 right-1.5 flex items-center gap-0.5 transition-opacity",
          avviso ? "opacity-100" : "opacity-0 group-hover:opacity-100",
        )}
      >
        {unread && !avviso && (
          <button
            className="rounded-sm p-1 hover:bg-muted"
            onClick={(e) => {
              e.stopPropagation();
              onMarkRead(n.id);
            }}
            title="Segna come letta"
            aria-label="Segna come letta"
          >
            <Check className="h-3.5 w-3.5 text-emerald-600" />
          </button>
        )}
        <button
          className="rounded-sm p-1 hover:bg-muted"
          onClick={(e) => {
            e.stopPropagation();
            onDismiss(n.id);
          }}
          title={avviso ? "Chiudi avviso" : "Elimina"}
          aria-label={avviso ? "Chiudi avviso" : "Elimina notifica"}
        >
          <X className="h-3.5 w-3.5 text-muted-foreground" />
        </button>
      </div>
    </div>
  );
}

function EntityGroupRow({
  group,
  onClickNotification,
  onDismiss,
  onMarkRead,
}: {
  group: EntityGroup;
  onClickNotification: (n: Notification) => void;
  onDismiss: (id: string) => void;
  onMarkRead: (id: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const unreadCount = group.notifications.filter((n) => !n.is_read).length;
  const hasUnread = unreadCount > 0;

  return (
    <div>
      <button
        className={cn(
          "w-full px-3 py-2.5 flex items-center gap-2.5 transition-colors text-left border-l-2",
          hasUnread ? "bg-primary/5 border-primary" : "border-transparent",
          "cursor-pointer hover:bg-accent/50",
        )}
        onClick={() => setExpanded((prev) => !prev)}
      >
        <NotificationIcon type={group.notifications[0].type} unread={hasUnread} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5">
            <p className={cn("text-sm leading-tight", hasUnread ? "font-semibold" : "font-medium")}>
              {group.label}
            </p>
            {hasUnread && (
              <span className="text-[10px] font-bold text-primary bg-primary/10 rounded-full px-1.5 py-0.5">
                {unreadCount} nuove
              </span>
            )}
          </div>
          <p className="text-[11px] text-muted-foreground/70 mt-1">
            Ultimo aggiornamento{" "}
            {formatDistanceToNow(new Date(group.notifications[0].created_at), {
              addSuffix: true,
              locale: it,
            })}
          </p>
        </div>
        {expanded ? (
          <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" />
        ) : (
          <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
        )}
      </button>
      {expanded && (
        <div className="ml-5 border-l border-muted">
          {group.notifications.map((n) => (
            <NotificationRow
              key={n.id}
              n={n}
              onClickNotification={onClickNotification}
              onDismiss={onDismiss}
              onMarkRead={onMarkRead}
            />
          ))}
        </div>
      )}
    </div>
  );
}

export function NotificationsBellPopover() {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [filter, setFilter] = useState<FilterMode>("all");
  const {
    notifications,
    unreadCount,
    unreadMessagesCount,
    markAsRead,
    markAllAsRead,
    dismiss,
  } = useNotifications();

  const groupedNotifications = useGroupedNotifications(notifications, filter);

  // Auto-switch al filtro "non lette" all'apertura quando ci sono unread
  useEffect(() => {
    if (open && unreadCount > 0 && filter === "all") {
      // Lasciamo "all" come default: l'utente vede subito tutto in contesto.
      // Se preferisci aprire su unread, decommenta:
      // setFilter("unread");
    }
  }, [open, unreadCount, filter]);

  // Auto mark-all-read 1.5s dopo apertura (un po' più lento del Sheet
  // originale: l'utente ha più tempo di notare le "non lette" nel popover compatto)
  // Solo i MESSAGGI si auto-segnano letti: gli avvisi azienda restano
  // accesi finché non li chiudi (guardarli non li risolve).
  useEffect(() => {
    if (!open || unreadMessagesCount === 0) return;
    const timer = setTimeout(() => markAllAsRead(), 1500);
    return () => clearTimeout(timer);
  }, [open, unreadMessagesCount, markAllAsRead]);

  const handleClick = (n: Notification) => {
    if (!n.is_read) markAsRead(n.id);
    if (n.action_url) {
      navigate(n.action_url);
      setOpen(false);
    }
  };

  const visibleCount = groupedNotifications.reduce((sum, g) => sum + g.count, 0);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="relative h-9 w-9 shrink-0"
          title="Notifiche"
          aria-label={unreadCount > 0 ? `Notifiche (${unreadCount} non lette)` : "Notifiche"}
        >
          <Bell
            className={cn(
              "h-4 w-4",
              unreadCount > 0 && "text-primary",
            )}
            aria-hidden="true"
          />
          {unreadCount > 0 && (
            <span
              className="absolute -top-0.5 -right-0.5 inline-flex items-center justify-center h-4 min-w-4 px-1 rounded-full bg-rose-500 text-white text-[10px] font-bold ring-2 ring-background"
              aria-hidden="true"
            >
              {unreadCount > 99 ? "99+" : unreadCount}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        sideOffset={8}
        className="w-[400px] sm:w-[440px] p-0 max-h-[85vh] flex flex-col overflow-hidden"
      >
        {/* Header */}
        <div className="px-3 pt-3 pb-2 border-b bg-gradient-to-b from-background to-muted/20">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-1.5">
              <Bell className="h-4 w-4 text-primary" />
              <span className="text-sm font-semibold">Notifiche</span>
            </div>
            <Button
              variant="ghost"
              size="sm"
              disabled={unreadMessagesCount === 0}
              onClick={() => markAllAsRead()}
              className="h-7 text-xs gap-1"
            >
              <CheckCheck className="h-3.5 w-3.5" />
              Tutte lette
            </Button>
          </div>

          {/* Filter pills */}
          <div className="flex items-center gap-1">
            <FilterPill
              active={filter === "all"}
              onClick={() => setFilter("all")}
              label="Tutte"
              count={notifications.length}
            />
            <FilterPill
              active={filter === "unread"}
              onClick={() => setFilter("unread")}
              label="Non lette"
              count={unreadCount}
              accent={unreadCount > 0}
            />
          </div>
        </div>

        {/* Content */}
        <ScrollArea className="flex-1 max-h-[60vh]">
          {visibleCount === 0 ? (
            <EmptyState filter={filter} totalCount={notifications.length} />
          ) : (
            <div>
              {groupedNotifications.map((group) => (
                <div key={group.period}>
                  <div className="sticky top-0 z-10 bg-background/95 backdrop-blur-sm px-3 py-1.5 flex items-center justify-between border-b">
                    <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
                      {group.label}
                    </span>
                    <div className="flex items-center gap-1">
                      {group.unread > 0 && (
                        <span className="text-[10px] font-bold text-primary bg-primary/10 rounded-full px-1.5">
                          {group.unread} nuove
                        </span>
                      )}
                      <Badge variant="secondary" className="h-4 min-w-[18px] px-1 text-[10px]">
                        {group.count}
                      </Badge>
                    </div>
                  </div>

                  <div>
                    {group.entityGroups.map((eg) => (
                      <EntityGroupRow
                        key={eg.key}
                        group={eg}
                        onClickNotification={handleClick}
                        onDismiss={dismiss}
                        onMarkRead={markAsRead}
                      />
                    ))}

                    {group.singles.map((n) => (
                      <NotificationRow
                        key={n.id}
                        n={n}
                        onClickNotification={handleClick}
                        onDismiss={dismiss}
                        onMarkRead={markAsRead}
                      />
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </ScrollArea>

        {/* Footer */}
        <div className="border-t bg-muted/30 px-3 py-2 flex items-center justify-between">
          <Link
            to="/azienda/impostazioni/notifiche"
            onClick={() => setOpen(false)}
            className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1"
          >
            <Settings className="h-3 w-3" />
            Preferenze
          </Link>
          <span className="text-[11px] text-muted-foreground/70">
            {notifications.length === 0
              ? "Nessuna notifica"
              : `${notifications.length} totali · ${unreadCount} non lette`}
          </span>
        </div>
      </PopoverContent>
    </Popover>
  );
}

// ───────────────────────────────────────────────────────────────────────────

function FilterPill({
  active,
  onClick,
  label,
  count,
  accent = false,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  count: number;
  accent?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "h-7 px-2.5 rounded-full text-xs font-medium transition-colors flex items-center gap-1.5",
        active
          ? "bg-primary text-primary-foreground"
          : "bg-muted text-muted-foreground hover:bg-muted/80",
      )}
    >
      {label}
      <span
        className={cn(
          "h-4 min-w-4 px-1 rounded-full text-[10px] font-bold flex items-center justify-center",
          active
            ? "bg-primary-foreground/20 text-primary-foreground"
            : accent && count > 0
            ? "bg-rose-500 text-white"
            : "bg-background text-muted-foreground",
        )}
      >
        {count > 99 ? "99+" : count}
      </span>
    </button>
  );
}

function EmptyState({ filter, totalCount }: { filter: FilterMode; totalCount: number }) {
  if (filter === "unread" && totalCount > 0) {
    return (
      <div className="flex flex-col items-center justify-center py-10 px-4 text-center">
        <div className="h-12 w-12 rounded-full bg-emerald-50 ring-1 ring-emerald-200 flex items-center justify-center mb-3">
          <CheckCheck className="h-6 w-6 text-emerald-600" />
        </div>
        <p className="text-sm font-medium">Tutto in pari</p>
        <p className="text-xs text-muted-foreground mt-1 max-w-[260px]">
          Nessuna notifica non letta. Hai gestito tutto.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center justify-center py-12 px-4 text-center">
      <div className="h-14 w-14 rounded-full bg-muted/50 flex items-center justify-center mb-3">
        <BellOff className="h-7 w-7 text-muted-foreground/60" />
      </div>
      <p className="text-sm font-medium">Nessuna notifica</p>
      <p className="text-xs text-muted-foreground mt-1 max-w-[280px] flex items-center gap-1">
        <Sparkles className="h-3 w-3 text-violet-500" />
        Silvio ti avviserà appena succede qualcosa
      </p>
    </div>
  );
}
