import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Bell, CheckCheck, Clock, MessageSquare, Building, CreditCard, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PannelloNotifiche } from "@/components/notifications/PannelloNotifiche";
import { formatDistanceToNow } from "date-fns";
import { it } from "date-fns/locale";
import { cn } from "@/lib/utils";
import { useNavigate } from "react-router-dom";

interface AdminNotification {
  id: string;
  action: string;
  details: Record<string, unknown> | null;
  created_at: string;
  target_type: string | null;
  target_id: string | null;
}

function getNotificationMeta(n: AdminNotification) {
  const d = n.details || {};
  const nomeAzienda = typeof d.company_name === "string" ? d.company_name : "";
  const soggetto = typeof d.subject === "string" ? d.subject : "";
  switch (n.action) {
    case "new_company":
      return { icon: Building, color: "text-blue-600 bg-blue-500/10", label: "Nuova azienda", desc: nomeAzienda || "Registrata", link: d.company_id ? `/admin/aziende/${d.company_id}` : undefined };
    case "new_ticket":
    case "ticket_created":
      return { icon: MessageSquare, color: "text-yellow-600 bg-yellow-500/10", label: "Nuovo ticket", desc: soggetto || "Supporto", link: "/admin/cs?tab=assistenza" };
    case "payment_failed":
    case "invoice.payment_failed":
      return { icon: CreditCard, color: "text-red-600 bg-red-500/10", label: "Pagamento fallito", desc: nomeAzienda, link: d.company_id ? `/admin/aziende/${d.company_id}` : undefined };
    case "trial_expiring":
      return { icon: Clock, color: "text-amber-600 bg-amber-500/10", label: "Trial in scadenza", desc: nomeAzienda, link: d.company_id ? `/admin/aziende/${d.company_id}` : undefined };
    case "suspend_company":
      return { icon: AlertTriangle, color: "text-red-600 bg-red-500/10", label: "Azienda sospesa", desc: nomeAzienda, link: d.company_id ? `/admin/aziende/${d.company_id}` : undefined };
    default:
      return { icon: Bell, color: "text-muted-foreground bg-muted", label: n.action.replace(/_/g, " "), desc: nomeAzienda, link: undefined };
  }
}

export function AdminNotificationCenter() {
  const { user } = useAuth();
  return user?.id ? <NotificheAdmin key={user.id} userId={user.id} /> : null;
}

function NotificheAdmin({ userId }: { userId: string }) {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const chiave = `notifiche-admin-lette:${userId}`;
  const [readIds, setReadIds] = useState<Set<string>>(() => {
    try {
      const ids: unknown = JSON.parse(localStorage.getItem(chiave) ?? "[]");
      return new Set(Array.isArray(ids) ? ids.filter((id): id is string => typeof id === "string") : []);
    } catch { return new Set<string>(); }
  });

  const { data: notifications = [], isLoading, isError, refetch } = useQuery({
    queryKey: ["admin-notifications", userId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("admin_audit_log")
        .select("id, action, details, created_at, target_type, target_id")
        .in("action", [
          "new_company", "new_ticket", "ticket_created", "payment_failed",
          "invoice.payment_failed", "trial_expiring", "suspend_company",
          "reactivate_company", "status_change",
        ])
        .order("created_at", { ascending: false })
        .limit(20);
      if (error) throw error;
      return (data || []) as AdminNotification[];
    },
    refetchInterval: 60_000,
    refetchIntervalInBackground: false,
    staleTime: 30_000,
  });

  const unreadCount = useMemo(
    () => notifications.filter((n) => !readIds.has(n.id)).length,
    [notifications, readIds]
  );

  function segnaLette(ids: string[]) {
    const lette = new Set([...readIds, ...ids].slice(-80));
    setReadIds(lette);
    try { localStorage.setItem(chiave, JSON.stringify([...lette])); } catch { /* stato mantenuto nella sessione */ }
  }

  const handleClick = (n: AdminNotification) => {
    segnaLette([n.id]);
    const meta = getNotificationMeta(n);
    if (meta.link) {
      navigate(meta.link);
      setOpen(false);
    }
  };

  const trigger = <Button type="button" variant="ghost" size="icon" className="relative size-11 md:size-9"
    aria-label={unreadCount ? `Notifiche, ${unreadCount} da leggere` : "Notifiche"}>
          <Bell className="size-4" aria-hidden="true" />
          {unreadCount > 0 && (
            <span className="absolute -top-0.5 -right-0.5 h-4 min-w-[16px] rounded-full bg-destructive text-destructive-foreground text-xs font-bold flex items-center justify-center px-1">
              {unreadCount > 9 ? "9+" : unreadCount}
            </span>
          )}
        </Button>;

  return (
    <PannelloNotifiche aperto={open} onOpenChange={setOpen} trigger={trigger}>
        <div className="flex shrink-0 items-center justify-between border-b px-3 py-2 max-md:pr-14">
          <h2 className="text-base font-semibold">Notifiche</h2>
          {unreadCount > 0 && (
            <Button variant="ghost" size="sm" className="min-h-11 gap-1 text-xs" onClick={() => segnaLette(notifications.map(n => n.id))}>
              <CheckCheck className="h-3 w-3" /> Segna lette
            </Button>
          )}
        </div>
        <div className="min-h-0 flex-auto overflow-y-auto overscroll-contain">
          {isLoading ? <p role="status" className="p-4 text-sm text-muted-foreground">Carico le notifiche…</p>
            : isError && notifications.length === 0 ? <p role="alert" className="p-3 text-sm">
              Non riesco a caricare le notifiche. <Button variant="ghost" onClick={() => void refetch()}>Riprova</Button>
            </p>
            : notifications.length === 0 ? (
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
                    type="button"
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
                      <p className="text-xs text-muted-foreground/70 mt-0.5">
                        {formatDistanceToNow(new Date(n.created_at), { addSuffix: true, locale: it })}
                      </p>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>
    </PannelloNotifiche>
  );
}
