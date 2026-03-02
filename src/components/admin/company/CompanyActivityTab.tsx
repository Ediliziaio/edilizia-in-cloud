import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Activity, ClipboardList, CreditCard, MessageSquare, Bell, Loader2, ChevronDown } from "lucide-react";
import { format } from "date-fns";
import { it } from "date-fns/locale";

interface CompanyActivityTabProps {
  companyId: string;
}

type EventType = "all" | "audit" | "subscription" | "order" | "ticket" | "notification";

interface TimelineEvent {
  id: string;
  type: EventType;
  action: string;
  details: string;
  date: string;
  icon: typeof Activity;
  color: string;
}

const PAGE_SIZE = 20;

export function CompanyActivityTab({ companyId }: CompanyActivityTabProps) {
  const [filter, setFilter] = useState<EventType>("all");
  const [limit, setLimit] = useState(PAGE_SIZE);

  const { data: events = [], isLoading } = useQuery({
    queryKey: ["company-activity-feed", companyId],
    queryFn: async () => {
      const [auditRes, subLogsRes, ordersRes, ticketsRes, notifRes] = await Promise.all([
        supabase.from("admin_audit_log").select("id, action, details, created_at, target_type").eq("target_id", companyId).order("created_at", { ascending: false }).limit(50),
        supabase.from("subscription_logs").select("id, event_type, notes, created_at, old_status, new_status").eq("company_id", companyId).order("created_at", { ascending: false }).limit(50),
        supabase.from("orders").select("id, description, order_code, created_at, total_amount").eq("company_id", companyId).order("created_at", { ascending: false }).limit(50),
        supabase.from("tickets").select("id, subject, status, created_at").eq("company_id", companyId).order("created_at", { ascending: false }).limit(50),
        supabase.from("lifecycle_notifications").select("id, notification_type, message, created_at").eq("company_id", companyId).order("created_at", { ascending: false }).limit(50),
      ]);

      const timeline: TimelineEvent[] = [];

      (auditRes.data || []).forEach((e) => {
        const det = e.details as Record<string, any> | null;
        timeline.push({
          id: `audit-${e.id}`, type: "audit", action: e.action,
          details: det?.company_name ? `${e.action} — ${det.company_name}` : e.action,
          date: e.created_at, icon: Activity, color: "text-blue-600",
        });
      });

      (subLogsRes.data || []).forEach((e) => {
        timeline.push({
          id: `sub-${e.id}`, type: "subscription", action: e.event_type,
          details: e.notes || `${e.old_status} → ${e.new_status}`,
          date: e.created_at, icon: CreditCard, color: "text-violet-600",
        });
      });

      (ordersRes.data || []).forEach((e) => {
        timeline.push({
          id: `order-${e.id}`, type: "order", action: "Ordine creato",
          details: `${e.order_code || ""} ${e.description || ""}`.trim(),
          date: e.created_at, icon: ClipboardList, color: "text-green-600",
        });
      });

      (ticketsRes.data || []).forEach((e) => {
        timeline.push({
          id: `ticket-${e.id}`, type: "ticket", action: "Ticket",
          details: e.subject, date: e.created_at, icon: MessageSquare, color: "text-amber-600",
        });
      });

      (notifRes.data || []).forEach((e) => {
        timeline.push({
          id: `notif-${e.id}`, type: "notification", action: e.notification_type,
          details: e.message || e.notification_type,
          date: e.created_at, icon: Bell, color: "text-red-600",
        });
      });

      return timeline.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    },
    enabled: !!companyId,
    staleTime: 2 * 60 * 1000,
  });

  const filtered = filter === "all" ? events : events.filter((e) => e.type === filter);
  const visible = filtered.slice(0, limit);

  const typeLabels: Record<EventType, string> = {
    all: "Tutti", audit: "Audit", subscription: "Abbonamento",
    order: "Ordini", ticket: "Ticket", notification: "Notifiche",
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base flex items-center gap-2">
            <Activity className="h-4 w-4 text-primary" />
            Attività Recente
          </CardTitle>
          <Select value={filter} onValueChange={(v) => { setFilter(v as EventType); setLimit(PAGE_SIZE); }}>
            <SelectTrigger className="w-[150px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              {Object.entries(typeLabels).map(([k, v]) => (
                <SelectItem key={k} value={k}>{v}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="flex justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : visible.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-8">Nessuna attività registrata</p>
        ) : (
          <div className="space-y-1">
            {visible.map((event) => {
              const Icon = event.icon;
              return (
                <div key={event.id} className="flex items-start gap-3 py-2.5 border-b last:border-0">
                  <div className={`mt-0.5 ${event.color}`}>
                    <Icon className="h-4 w-4" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium truncate">{event.action}</span>
                      <Badge variant="outline" className="text-[10px] shrink-0">{typeLabels[event.type]}</Badge>
                    </div>
                    <p className="text-xs text-muted-foreground truncate">{event.details}</p>
                  </div>
                  <span className="text-xs text-muted-foreground whitespace-nowrap">
                    {format(new Date(event.date), "dd/MM/yy HH:mm", { locale: it })}
                  </span>
                </div>
              );
            })}
            {visible.length < filtered.length && (
              <div className="pt-3 text-center">
                <Button variant="ghost" size="sm" onClick={() => setLimit((l) => l + PAGE_SIZE)}>
                  <ChevronDown className="h-4 w-4 mr-1" />
                  Mostra altri ({filtered.length - visible.length} rimanenti)
                </Button>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
