/**
 * Due menu in fila: quale account Google dell'azienda, e quale dei suoi
 * calendari. È lo stesso gesto per una squadra e per un calendario standard.
 *
 * L'elenco dei calendari passa dalla funzione edge (serve il token
 * dell'account): finché non c'è una connessione scelta non chiede niente.
 */
import { useState } from "react";
import { Loader2, Link2Off } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useCalendariDiConnessione, useConnessioniGoogleAzienda } from "@/hooks/useCalendariLavori";

export interface SceltaCalendario {
  google_connection_id: string | null;
  google_calendar_id: string | null;
}

export function GoogleCalendarPicker({
  value,
  onChange,
  disabled,
}: {
  value: SceltaCalendario;
  onChange: (next: SceltaCalendario) => void;
  disabled?: boolean;
}) {
  const [connectionId, setConnectionId] = useState<string | null>(value.google_connection_id);
  const { data: connessioni = [], isLoading: caricoConnessioni } = useConnessioniGoogleAzienda();
  const { data: calendari = [], isLoading: caricoCalendari, error } = useCalendariDiConnessione(connectionId);

  const attive = connessioni.filter((c) => c.status === "connected");

  if (!caricoConnessioni && attive.length === 0) {
    return (
      <p className="text-xs text-muted-foreground">
        Nessun account Google collegato: fallo nel tab <strong>Collegamenti</strong>.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
      <Select
        value={connectionId ?? ""}
        disabled={disabled || caricoConnessioni}
        onValueChange={(v) => {
          setConnectionId(v);
          onChange({ google_connection_id: v, google_calendar_id: null });
        }}
      >
        <SelectTrigger className="sm:w-56">
          <SelectValue placeholder="Account Google" />
        </SelectTrigger>
        <SelectContent>
          {attive.map((c) => (
            <SelectItem key={c.id} value={c.id}>
              {c.google_account_email ?? "Account senza email"}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select
        value={value.google_calendar_id ?? ""}
        disabled={disabled || !connectionId || caricoCalendari}
        onValueChange={(v) => onChange({ google_connection_id: connectionId, google_calendar_id: v })}
      >
        <SelectTrigger className="sm:w-64">
          {caricoCalendari ? (
            <span className="flex items-center gap-2 text-muted-foreground">
              <Loader2 className="h-3.5 w-3.5 animate-spin" /> Leggo i calendari…
            </span>
          ) : (
            <SelectValue placeholder={connectionId ? "Calendario" : "Prima l'account"} />
          )}
        </SelectTrigger>
        <SelectContent>
          {calendari.map((cal) => (
            <SelectItem key={cal.id} value={cal.id}>
              <span className="flex items-center gap-2">
                <span
                  className="inline-block h-2.5 w-2.5 rounded-full"
                  style={{ backgroundColor: cal.backgroundColor ?? "#94a3b8" }}
                />
                {cal.summary}
                {cal.primary ? " (principale)" : ""}
              </span>
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {value.google_calendar_id && !disabled && (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="text-muted-foreground"
          onClick={() => onChange({ google_connection_id: null, google_calendar_id: null })}
        >
          <Link2Off className="mr-1 h-3.5 w-3.5" /> Scollega
        </Button>
      )}

      {error && <p className="text-xs text-destructive">{(error as Error).message}</p>}
    </div>
  );
}
