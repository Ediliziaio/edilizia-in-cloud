import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { formatDistanceToNow } from "date-fns";
import { it } from "date-fns/locale";
import {
  Bell,
  MessageSquare,
  Package,
  CheckSquare,
  Banknote,
  X,
  CheckCheck,
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

function NotificationIcon({ type }: { type: string }) {
  const config = typeConfig[type] || typeConfig.generic;
  const Icon = config.icon;
  return <Icon className={cn("h-5 w-5 shrink-0", config.className)} />;
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
            <div className="divide-y">
              {notifications.map((n) => (
                <div
                  key={n.id}
                  className={cn(
                    "relative group px-4 py-3 flex gap-3 transition-colors",
                    !n.is_read && "bg-primary/5",
                    n.action_url && "cursor-pointer hover:bg-accent/50"
                  )}
                  onClick={() => handleClick(n)}
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
                      dismiss(n.id);
                    }}
                  >
                    <X className="h-3.5 w-3.5 text-muted-foreground" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </ScrollArea>
      </SheetContent>
    </Sheet>
  );
}
