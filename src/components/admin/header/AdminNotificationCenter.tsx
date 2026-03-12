import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Bell, Check, CheckCheck, Clock, MessageSquare, Building, CreditCard, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";
import { formatDistanceToNow } from "date-fns";
import { it } from "date-fns/locale";
import { cn } from "@/lib/utils";
import { useNavigate } from "react-router-dom";

interface AdminNotification {
  id: string;
  action: string;
  details: Record<string, any> | null;
  created_at: string;
  target_type: string | null;
  target_id: string | null;
}

function getNotificationMeta(n: AdminNotification) {
  const d = n.details || {};
  switch (n.action) {
    case "new_company":
      return { icon: Building, color: "text-blue-600 bg-blue-500/10", label: "Nuova azienda", desc: d.company_name || "Registrata", link: d.company_id ? `/admin/aziende/${d.company_id}` : undefined };
    case "new_ticket":
    case "ticket_created":
      return { icon: MessageSquare, color: "text-yellow-600 bg-yellow-500/10", label: "Nuovo ticket", desc: d.subject || "Supporto", link: "/admin/ticket" };
    case "payment_failed":
    case "invoice.payment_failed":
      return { icon: CreditCard, color: "text-red-600 bg-red-500/10", label: "Pagamento fallito", desc: d.company_name || "", link: d.company_id ? `/admin/aziende/${d.company_id}` : undefined };
    case "trial_expiring":
      return { icon: Clock, color: "text-amber-600 bg-amber-500/10", label: "Trial in scadenza", desc: d.company_name || "", link: d.company_id ? `/admin/aziende/${d.company_id}` : undefined };
    case "suspend_company":
      return { icon: AlertTriangle, color: "text-red-600 bg-red-500/10", label: "Azienda sospesa", desc: d.company_name || "", link: d.company_id ? `/admin/aziende/${d.company_id}` : undefined };
    default:
      return { icon: Bell, color: "text-muted-foreground bg-muted", label: n.action.replace(/_/g, " "), desc: d.company_name || "", link: undefined };
  }
}

export function AdminNotificationCenter() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [readIds, setReadIds] = useState<Set<string>>(new Set());

  const { data: notifications = [] } = useQuery({
    queryKey: ["admin-notifications", user?.id],
    queryFn: async () => {
      const { data } = await supabase
        .from("admin_audit_log")
        .select("id, action, details, created_at, target_type, target_id")
        .in("action", [
          "new_company", "new_ticket", "ticket_created", "payment_failed",
          "invoice.payment_failed", "trial_expiring", "suspend_company",
          "reactivate_company", "status_change",
        ])
        .order("created_at", { ascending: false })
        .limit(20);
      return (data || []) as AdminNotification[];
    },
    enabled: !!user?.id,
    refetchInterval: 60_000,
    staleTime: 30_000,
  });

  const unreadCount = useMemo(
    () => notifications.filter((n) => !readIds.has(n.id)).length,
    [notifications, readIds]
  );

  const markAllRead = () => {
    setReadIds(new Set(notifications.map((n) => n.id)));
  };

  const handleClick = (n: AdminNotification) => {
    setReadIds((prev) => new Set([...prev, n.id]));
    const meta = getNotificationMeta(n);
    if (meta.link) {
      navigate(meta.link);
      setOpen(false);
    }
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" className="relative h-8 w-8">
          <Bell className="h-4 w-4" />
          {unreadCount > 0 && (
            <span className="absolute -top-0.5 -right-0.5 h-4 min-w-[16px] rounded-full bg-destructive text-destructive-foreground text-[10px] font-bold flex items-center justify-center px-1">
              {unreadCount > 9 ? "9+" : unreadCount}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-[380px] p-0" sideOffset={8}>
        <div className="flex items-center justify-between px-4 py-3 border-b">
          <h3 className="text-sm font-semibold">Notifiche</h3>
          {unreadCount > 0 && (
            <Button variant="ghost" size="sm" className="h-7 text-xs gap-1" onClick={markAllRead}>
              <CheckCheck className="h-3 w-3" /> Segna lette
            </Button>
          )}
        </div>
        <ScrollArea className="max-h-[400px]">
          {notifications.length === 0 ? (
            <div className="py-8 text-center text-sm text-muted-foreground">
              Nessuna notifica recente
            </div>
          ) : (
            <div className="divide-y">
              {notifications.map((n) => {
                const meta = getNotificationMeta(n);
                const Icon = meta.icon;
                const isRead = readIds.has(n.id);
                return (
                  <button
                    key={n.id}
                    onClick={() => handleClick(n)}
                    className={cn(
                      "w-full flex items-start gap-3 px-4 py-3 hover:bg-muted/50 transition-colors text-left",
                      !isRead && "bg-primary/5"
                    )}
                  >
                    <div className={cn("mt-0.5 h-8 w-8 rounded-lg flex items-center justify-center shrink-0", meta.color)}>
                      <Icon className="h-4 w-4" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium">{meta.label}</span>
                        {!isRead && <div className="h-1.5 w-1.5 rounded-full bg-primary shrink-0" />}
                      </div>
                      {meta.desc && <p className="text-xs text-muted-foreground truncate">{meta.desc}</p>}
                      <p className="text-[10px] text-muted-foreground/70 mt-0.5">
                        {formatDistanceToNow(new Date(n.created_at), { addSuffix: true, locale: it })}
                      </p>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </ScrollArea>
      </PopoverContent>
    </Popover>
  );
}
