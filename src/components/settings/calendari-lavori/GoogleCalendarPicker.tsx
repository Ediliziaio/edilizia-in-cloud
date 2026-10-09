/**
 * Due menu in fila: quale account Google dell'azienda, e quale dei suoi
 * calendari. È lo stesso gesto per una squadra e per un calendario standard.
 *
 * L'elenco dei calendari passa dalla funzione edge (serve il token
 * dell'account): finché non c'è una connessione scelta non chiede niente.
 */
import { useState } from "react";
import { Link, useInRouterContext } from "react-router-dom";
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
  senzaAccount = "messaggio",
}: {
  value: SceltaCalendario;
  onChange: (next: SceltaCalendario) => void;
  disabled?: boolean;
  /**
   * Senza nessun account Google collegato: dice dove collegarlo («messaggio», con il link alla scheda «Google Calendar»);
   * non dice niente perché lo dice già la pagina («nascondi»); o rimanda alla sezione «Account Google» che sta qui sopra,
   * quando si è già nella scheda giusta («qui-sopra»).
   */
  senzaAccount?: "messaggio" | "nascondi" | "qui-sopra";
}) {
  const inRouter = useInRouterContext();
  const [connectionId, setConnectionId] = useState<string | null>(value.google_connection_id);
  const { data: connessioni = [], isLoading: caricoConnessioni, isError: erroreConnessioni, refetch: riprovaConnessioni } = useConnessioniGoogleAzienda();
  const { data: calendari = [], isLoading: caricoCalendari, error, refetch: riprovaCalendari } = useCalendariDiConnessione(connectionId);

  const attive = connessioni.filter((c) => c.status === "connected");
  if (erroreConnessioni) return <div role="alert" className="text-xs">
    <p>Account Google non disponibili.</p>
    <Button variant="outline" size="sm" onClick={() => void riprovaConnessioni()}>Riprova</Button>
  </div>;

  if (!caricoConnessioni && attive.length === 0) {
    if (senzaAccount === "nascondi") return null;
    if (senzaAccount === "qui-sopra") {
      return <p className="text-xs text-muted-foreground">Nessun account Google collegato: collegalo nella sezione «Account Google», qui sopra.</p>;
    }
    return (
      <p className="text-xs text-muted-foreground">
        Nessun account Google collegato.{" "}
        {inRouter ? (
          <Link to="?tab=google" className="font-medium text-primary underline">
            Collegalo da «Google Calendar»
          </Link>
        ) : (
          <>Collegalo da «Google Calendar».</>
        )}
      </p>
    );
  }

  return (
    <div className="flex min-w-0 flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
      <Select
        value={connectionId ?? ""}
        disabled={disabled || caricoConnessioni}
        onValueChange={(v) => {
          setConnectionId(v);
          // Scegliere un account prepara la scelta: non scollega il calendario salvato.
        }}
      >
        <SelectTrigger className="min-w-0 sm:w-56" aria-label="Account Google">
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
        value={connectionId === value.google_connection_id ? value.google_calendar_id ?? "" : ""}
        disabled={disabled || !connectionId || caricoCalendari || !!error}
        onValueChange={(v) => onChange({ google_connection_id: connectionId, google_calendar_id: v })}
      >
        <SelectTrigger className="min-w-0 sm:w-64" aria-label="Calendario Google">
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

      {error && <div role="alert" className="text-xs text-destructive"><p>Impossibile leggere i calendari di questo account.</p><Button variant="outline" size="sm" onClick={() => void riprovaCalendari()}>Riprova</Button></div>}
    </div>
  );
}
