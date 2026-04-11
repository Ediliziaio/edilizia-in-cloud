import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { formatDistanceToNow, isToday, isYesterday, isThisWeek } from "date-fns";
import { it } from "date-fns/locale";
import {
  Bell,
  MessageSquare,
  Package,
  CheckSquare,
  Banknote,
  X,
  CheckCheck,
  ChevronDown,
  ChevronRight,
} from "lucide-react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useNotifications, type Notification } from "@/hooks/useNotifications";
import { cn } from "@/lib/utils";

interface NotificationsPanelProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const typeConfig: Record<string, { icon: typeof Bell; className: string }> = {
  ticket_new: { icon: MessageSquare, className: "text-blue-500" },
  ticket_reply: { icon: MessageSquare, className: "text-blue-500" },
  order_status_changed: { icon: Package, className: "text-orange-500" },
  task_assigned: { icon: CheckSquare, className: "text-purple-500" },
  task_due: { icon: CheckSquare, className: "text-purple-500" },
  installment_due: { icon: Banknote, className: "text-green-500" },
  generic: { icon: Bell, className: "text-muted-foreground" },
};

const entityTypeLabels: Record<string, string> = {
  order: "Ordine",
  ticket: "Ticket",
  task: "Attivit\u00e0",
  contact: "Contatto",
  opportunity: "Opportunit\u00e0",
  project: "Progetto",
  invoice: "Fattura",
  installment: "Rata",
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
  /** Ungrouped notifications (no entity or single-item entity groups) */
  singles: Notification[];
  /** Entity groups with 2+ notifications */
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

function NotificationIcon({ type }: { type: string }) {
  const config = typeConfig[type] || typeConfig.generic;
  const Icon = config.icon;
  return <Icon className={cn("h-5 w-5 shrink-0", config.className)} />;
}

function useGroupedNotifications(notifications: Notification[]): TimePeriodGroup[] {
  return useMemo(() => {
    // 1. Bucket by time period
    const buckets: Record<TimePeriod, Notification[]> = {
      oggi: [],
      ieri: [],
      questa_settimana: [],
      precedenti: [],
    };

    for (const n of notifications) {
      const period = getTimePeriod(n.created_at);
      buckets[period].push(n);
    }

    // 2. For each bucket, sub-group by entity
    const result: TimePeriodGroup[] = [];

    for (const period of periodOrder) {
      const items = buckets[period];
      if (items.length === 0) continue;

      // Group by entity_type + entity_id
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
          // Single item for this entity — treat as ungrouped
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

      // Sort singles by created_at desc (already sorted from API, but ensure after merging)
      singles.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

      result.push({
        period,
        label: periodLabels[period],
        count: items.length,
        singles,
        entityGroups,
      });
    }

    return result;
  }, [notifications]);
}

function NotificationRow({
  n,
  onClickNotification,
  onDismiss,
}: {
  n: Notification;
  onClickNotification: (n: Notification) => void;
  onDismiss: (id: string) => void;
}) {
  return (
    <div
      className={cn(
        "relative group px-4 py-3 flex gap-3 transition-colors",
        !n.is_read && "bg-primary/5",
        n.action_url && "cursor-pointer hover:bg-accent/50"
      )}
      onClick={() => onClickNotification(n)}
    >
      <div className="pt-0.5">
        <NotificationIcon type={n.type} />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium leading-tight">{n.title}</p>
        {n.body && (
          <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">
            {n.body}
          </p>
        )}
        <p className="text-[11px] text-muted-foreground/70 mt-1">
          {formatDistanceToNow(new Date(n.created_at), {
            addSuffix: true,
            locale: it,
          })}
        </p>
      </div>
      <button
        className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity
                   rounded-sm p-0.5 hover:bg-muted"
        onClick={(e) => {
          e.stopPropagation();
          onDismiss(n.id);
        }}
      >
        <X className="h-3.5 w-3.5 text-muted-foreground" />
      </button>
    </div>
  );
}

function EntityGroupRow({
  group,
  onClickNotification,
  onDismiss,
}: {
  group: EntityGroup;
  onClickNotification: (n: Notification) => void;
  onDismiss: (id: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const hasUnread = group.notifications.some((n) => !n.is_read);

  return (
    <div>
      <button
        className={cn(
          "w-full px-4 py-3 flex items-center gap-3 transition-colors text-left",
          hasUnread && "bg-primary/5",
          "cursor-pointer hover:bg-accent/50"
        )}
        onClick={() => setExpanded((prev) => !prev)}
      >
        <div className="pt-0.5">
          <NotificationIcon type={group.notifications[0].type} />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium leading-tight">{group.label}</p>
          <p className="text-[11px] text-muted-foreground/70 mt-1">
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
        <div className="border-l-2 border-muted ml-6">
          {group.notifications.map((n) => (
            <NotificationRow
              key={n.id}
              n={n}
              onClickNotification={onClickNotification}
              onDismiss={onDismiss}
            />
          ))}
        </div>
      )}
    </div>
  );
}

export function NotificationsPanel({ open, onOpenChange }: NotificationsPanelProps) {
  const navigate = useNavigate();
  const {
    notifications,
    unreadCount,
    markAsRead,
    markAllAsRead,
    dismiss,
  } = useNotifications();

  const groupedNotifications = useGroupedNotifications(notifications);

  // Auto mark-all-read after 500ms when panel opens
  useEffect(() => {
    if (!open || unreadCount === 0) return;
    const timer = setTimeout(() => markAllAsRead(), 500);
    return () => clearTimeout(timer);
  }, [open, unreadCount, markAllAsRead]);

  const handleClick = (n: Notification) => {
    if (!n.is_read) markAsRead(n.id);
    if (n.action_url) {
      navigate(n.action_url);
      onOpenChange(false);
    }
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-[380px] sm:max-w-[380px] p-0 flex flex-col">
        <SheetHeader className="px-4 pt-4 pb-3 border-b">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <SheetTitle>Notifiche</SheetTitle>
              {unreadCount > 0 && (
                <Badge variant="destructive" className="h-5 min-w-[20px] px-1.5 text-[10px]">
                  {unreadCount > 99 ? "99+" : unreadCount}
                </Badge>
              )}
            </div>
            <Button
              variant="ghost"
              size="sm"
              disabled={unreadCount === 0}
              onClick={() => markAllAsRead()}
              className="text-xs"
            >
              <CheckCheck className="h-3.5 w-3.5 mr-1" />
              Segna tutte lette
            </Button>
          </div>
        </SheetHeader>

        <ScrollArea className="flex-1">
          {notifications.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
              <Bell className="h-10 w-10 mb-3 opacity-40" />
              <p className="text-sm">Nessuna notifica</p>
            </div>
          ) : (
            <div>
              {groupedNotifications.map((group) => (
                <div key={group.period}>
                  {/* Period section header */}
                  <div className="sticky top-0 z-10 bg-muted/80 backdrop-blur-sm px-4 py-2 flex items-center justify-between border-b">
                    <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                      {group.label}
                    </span>
                    <Badge variant="secondary" className="h-5 min-w-[20px] px-1.5 text-[10px]">
                      {group.count}
                    </Badge>
                  </div>

                  {/* Entity groups (collapsed) */}
                  <div className="divide-y">
                    {group.entityGroups.map((eg) => (
                      <EntityGroupRow
                        key={eg.key}
                        group={eg}
                        onClickNotification={handleClick}
                        onDismiss={dismiss}
                      />
                    ))}

                    {/* Single / ungrouped notifications */}
                    {group.singles.map((n) => (
                      <NotificationRow
                        key={n.id}
                        n={n}
                        onClickNotification={handleClick}
                        onDismiss={dismiss}
                      />
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </ScrollArea>
      </SheetContent>
    </Sheet>
  );
}
