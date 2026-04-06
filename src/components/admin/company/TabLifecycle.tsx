import { useState, useMemo } from "react";
import { Activity, AlertCircle, Download, Filter } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useLifecycleEvents } from "@/hooks/useLifecycleEvents";
import { LifecycleEventItem } from "./LifecycleEventItem";

interface TabLifecycleProps {
  companyId: string;
}

const EVENT_TYPE_LABELS: Record<string, string> = {
  tutti: "Tutti gli eventi",
  activated: "Attivazione",
  upgraded: "Upgrade piano",
  downgraded: "Downgrade piano",
  plan_changed: "Cambio piano",
  payment_received: "Pagamento",
  cancelled: "Cancellazione",
  suspended: "Sospensione",
  reactivated: "Riattivazione",
  trial_started: "Avvio trial",
  trial_extended: "Estensione trial",
  trial_expired: "Trial scaduto",
  renewed: "Rinnovo",
};

function exportCsv(events: ReturnType<typeof useLifecycleEvents>["events"]) {
  const headers = ["Data", "Tipo evento", "Stato precedente", "Stato nuovo", "Piano", "Note"];
  const rows = events.map((e) => [
    new Date(e.created_at).toLocaleString("it-IT"),
    e.event_type,
    e.old_status ?? "",
    e.new_status ?? "",
    e.plan_id ?? "",
    e.notes ?? "",
  ]);
  const csv = [headers, ...rows].map((r) => r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(";")).join("\n");
  const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `lifecycle_events_${new Date().toISOString().split("T")[0]}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

export function TabLifecycle({ companyId }: TabLifecycleProps) {
  const { events, isLoading, isError } = useLifecycleEvents(companyId);
  const [typeFilter, setTypeFilter] = useState("tutti");

  const filteredEvents = useMemo(
    () => (typeFilter === "tutti" ? events : events.filter((e) => e.event_type === typeFilter)),
    [events, typeFilter]
  );

  const availableTypes = useMemo(() => {
    const types = [...new Set(events.map((e) => e.event_type))];
    return types.sort();
  }, [events]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-medium">Cronologia Lifecycle</h3>
          <p className="text-xs text-muted-foreground">
            Tutti gli eventi di abbonamento registrati per questa azienda
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => exportCsv(filteredEvents)}
          disabled={filteredEvents.length === 0}
        >
          <Download className="h-4 w-4 mr-2" />
          Esporta CSV
        </Button>
      </div>

      <div className="flex items-center gap-2">
        <Filter className="h-4 w-4 text-muted-foreground" />
        <Select value={typeFilter} onValueChange={setTypeFilter}>
          <SelectTrigger className="w-48 h-8 text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="tutti" className="text-xs">
              Tutti gli eventi
            </SelectItem>
            {availableTypes.map((t) => (
              <SelectItem key={t} value={t} className="text-xs">
                {EVENT_TYPE_LABELS[t] ?? t}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <span className="text-xs text-muted-foreground">
          {filteredEvents.length} event{filteredEvents.length !== 1 ? "i" : "o"}
        </span>
      </div>

      <Card>
        <CardContent className="p-4">
          {isLoading ? (
            <div className="space-y-4">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="flex gap-3">
                  <Skeleton className="h-7 w-7 rounded-full flex-shrink-0" />
                  <div className="flex-1 space-y-1.5">
                    <Skeleton className="h-4 w-32" />
                    <Skeleton className="h-3 w-48" />
                  </div>
                </div>
              ))}
            </div>
          ) : isError ? (
            <div className="flex items-center gap-2 text-destructive py-4">
              <AlertCircle className="h-4 w-4" />
              <span className="text-sm">Impossibile caricare gli eventi lifecycle</span>
            </div>
          ) : filteredEvents.length === 0 ? (
            <div className="py-8 text-center">
              <Activity className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
              <p className="text-sm text-muted-foreground">
                {typeFilter === "tutti"
                  ? "Nessun evento registrato per questa azienda"
                  : `Nessun evento di tipo "${EVENT_TYPE_LABELS[typeFilter] ?? typeFilter}"`}
              </p>
            </div>
          ) : (
            <div>
              {filteredEvents.map((event, idx) => (
                <LifecycleEventItem
                  key={event.id}
                  event={event}
                  isLast={idx === filteredEvents.length - 1}
                />
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
