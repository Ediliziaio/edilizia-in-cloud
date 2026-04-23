// MP-FINAL — Stats bar WhatsApp per dashboard hub.

import { Card, CardContent } from "@/components/ui/card";
import { MessageSquare, Send, AlertTriangle, Euro, Wrench } from "lucide-react";
import { useWAMetrics } from "@/hooks/whatsapp/useWAMetrics";

export function WhatsAppStatsBar() {
  const { data: m, isLoading } = useWAMetrics();

  if (isLoading) {
    return (
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        {Array.from({ length: 5 }).map((_, i) => (
          <Card key={i} className="h-24 animate-pulse bg-muted" />
        ))}
      </div>
    );
  }

  if (!m) return null;

  const stats = [
    {
      icon: MessageSquare,
      label: "Numeri attivi",
      value: m.active_numbers,
      color: "text-emerald-600",
    },
    {
      icon: Send,
      label: "Messaggi 24h",
      value: m.messages_last_24h,
      color: "text-blue-600",
    },
    {
      icon: Wrench,
      label: "Tool call 24h",
      value: m.tool_calls_last_24h,
      color: "text-violet-600",
    },
    {
      icon: AlertTriangle,
      label: "Errori 24h",
      value: m.errors_last_24h,
      color: m.errors_last_24h > 0 ? "text-red-600" : "text-muted-foreground",
    },
    {
      icon: Euro,
      label: "Budget oggi",
      value: `€ ${m.total_spend_today.toFixed(4)}`,
      color: "text-foreground",
    },
  ];

  return (
    <div className="grid grid-cols-2 sm:grid-cols-5 gap-3" role="region" aria-label="Statistiche WhatsApp">
      {stats.map((s) => (
        <Card key={s.label}>
          <CardContent className="p-4">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-xs text-muted-foreground">{s.label}</p>
                <p className={`text-2xl font-bold mt-1 ${s.color}`}>{s.value}</p>
              </div>
              <s.icon className={`h-5 w-5 ${s.color}`} />
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
