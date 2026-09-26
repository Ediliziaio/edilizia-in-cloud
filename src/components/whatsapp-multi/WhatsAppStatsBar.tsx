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

  // Spesa in euro con due decimali: «€ 0.0000» (quattro decimali, punto
  // all'inglese) sembrava un codice. Sotto il centesimo si dice «< 0,01 €».
  const spesa = m.total_spend_today > 0 && m.total_spend_today < 0.01
    ? "< 0,01 €"
    : m.total_spend_today.toLocaleString("it-IT", { style: "currency", currency: "EUR" });

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
      // «Tool call» è gergo: sono le azioni che l'AI ha fatto (cercare, creare…).
      label: "Azioni AI 24h",
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
      label: "Spesa oggi",
      value: spesa,
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
                <p className={`text-2xl font-bold mt-1 tabular-nums ${s.color}`}>{s.value}</p>
              </div>
              {/* Sotto 1280 cinque card in riga lasciano ~100px: l'icona finiva
                  addosso all'etichetta. Il colore del numero basta. */}
              <s.icon className={`hidden h-5 w-5 shrink-0 xl:block ${s.color}`} />
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
