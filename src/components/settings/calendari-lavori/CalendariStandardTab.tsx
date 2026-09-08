/**
 * I calendari standard del calendario lavori. Per ora uno solo, Posa: il
 * calendario Google aziendale dove finiscono tutte le pose. Le altre righe
 * (Merce, Interventi) arrivano quando avranno il loro invio.
 */
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { CALENDARIO_STANDARD } from "@/types/squadre";
import { useCalendarLinks, useSalvaCalendarLink } from "@/hooks/useCalendariLavori";
import { GoogleCalendarPicker } from "./GoogleCalendarPicker";

export function CalendariStandardTab({ canManage }: { canManage: boolean }) {
  const { data: links = [], isLoading } = useCalendarLinks();
  const salva = useSalvaCalendarLink();

  if (isLoading) return <Skeleton className="h-24 w-full" />;

  return (
    <div className="space-y-3">
      {CALENDARIO_STANDARD.map((std) => {
        const link = links.find((l) => l.kind === std.kind);
        const collegato = !!link?.google_calendar_id;
        return (
          <Card key={std.kind}>
            <CardContent className="flex flex-col gap-3 p-4 md:flex-row md:items-center md:justify-between">
              <div className="min-w-0">
                <p className="flex items-center gap-2 font-medium">
                  {std.label}
                  {collegato ? (
                    <Badge className={link?.enabled ? "bg-emerald-100 text-emerald-800" : "bg-amber-100 text-amber-800"}>
                      {link?.enabled ? "Attivo" : "Collegato, spento"}
                    </Badge>
                  ) : (
                    <Badge className="bg-muted text-muted-foreground">Nessun calendario</Badge>
                  )}
                </p>
                <p className="text-sm text-muted-foreground">{std.descrizione}</p>
                {link?.last_error && <p className="mt-1 text-xs text-red-700">{link.last_error}</p>}
              </div>
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                <GoogleCalendarPicker
                  disabled={!canManage}
                  value={{
                    google_connection_id: link?.google_connection_id ?? null,
                    google_calendar_id: link?.google_calendar_id ?? null,
                  }}
                  onChange={(next) => salva.mutate({ kind: std.kind, ...next })}
                />
                {collegato && (
                  <Switch
                    checked={!!link?.enabled}
                    disabled={!canManage}
                    aria-label="Invio attivo"
                    onCheckedChange={(on) =>
                      salva.mutate({
                        kind: std.kind,
                        google_connection_id: link?.google_connection_id ?? null,
                        google_calendar_id: link?.google_calendar_id ?? null,
                        enabled: on,
                      })
                    }
                  />
                )}
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
