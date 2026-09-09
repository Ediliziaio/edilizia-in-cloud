/**
 * «Dove finiscono gli appuntamenti di questo calendario»: prima l'account, poi
 * il calendario dentro quell'account.
 *
 * Vive dentro il calendario che stai configurando — non in un'altra pagina —
 * perché è lì che uno sa cosa sta collegando. Le due tendine sono in fila e
 * dicono nomi, non identificativi.
 */
import { useMemo, useState } from "react";
import { Loader2, Link2Off, CalendarDays, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  PROVIDER_LABEL,
  PROVIDER_SCRIVE_APPUNTAMENTI,
  useCalendariDiCasella,
  useCaselleCalendario,
  type ProviderCalendario,
} from "@/hooks/useCalendariEsterni";

export interface SceltaCalendarioEsterno {
  external_provider: ProviderCalendario | null;
  external_connection_id: string | null;
  external_calendar_id: string | null;
  external_calendar_name: string | null;
}

export const NESSUN_CALENDARIO_ESTERNO: SceltaCalendarioEsterno = {
  external_provider: null,
  external_connection_id: null,
  external_calendar_id: null,
  external_calendar_name: null,
};

export function CalendarioEsternoPicker({
  value,
  onChange,
  disabled,
}: {
  value: SceltaCalendarioEsterno;
  onChange: (next: SceltaCalendarioEsterno) => void;
  disabled?: boolean;
}) {
  const { data: caselle = [], isLoading: caricoCaselle } = useCaselleCalendario();
  // Nessun effect: finché l'utente non tocca la tendina vale la casella salvata
  // sul calendario, così aprendo un calendario già collegato si vede subito.
  const [sceltaUtente, setSceltaUtente] = useState<string | null>(null);
  const connectionId = sceltaUtente ?? value.external_connection_id;
  const setConnectionId = setSceltaUtente;

  const casella = useMemo(
    () => caselle.find((c) => c.connectionId === connectionId) ?? null,
    [caselle, connectionId],
  );
  const { data: calendari = [], isLoading: caricoCalendari, error } = useCalendariDiCasella(casella);

  if (!caricoCaselle && caselle.length === 0) {
    return (
      <p className="text-xs text-muted-foreground">
        Nessun account calendario collegato. Collegane uno da <strong>Il mio profilo → Calendari</strong> (Google, Outlook o Apple),
        poi torna qui a scegliere in quale calendario finiscono gli appuntamenti.
      </p>
    );
  }

  return (
    <div className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label className="text-xs text-muted-foreground">Account</Label>
          <Select
            value={connectionId ?? ""}
            disabled={disabled || caricoCaselle}
            onValueChange={(v) => {
              setConnectionId(v);
              // Cambiando casella il calendario di prima non vale più.
              onChange({ ...NESSUN_CALENDARIO_ESTERNO });
            }}
          >
            <SelectTrigger>
              <SelectValue placeholder={caricoCaselle ? "Carico gli account…" : "Scegli l'account"} />
            </SelectTrigger>
            <SelectContent>
              {caselle.map((c) => (
                <SelectItem key={c.connectionId} value={c.connectionId}>
                  <span className="flex items-center gap-2">
                    <span className="rounded bg-muted px-1 text-[10px] font-medium uppercase">{PROVIDER_LABEL[c.provider]}</span>
                    {c.email}
                    {c.status !== "connected" && <span className="text-[10px] text-amber-700">· da ricollegare</span>}
                    {!PROVIDER_SCRIVE_APPUNTAMENTI[c.provider] && <span className="text-[10px] text-muted-foreground">· solo lettura</span>}
                  </span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1.5">
          <Label className="text-xs text-muted-foreground">Calendario</Label>
          <Select
            value={value.external_calendar_id ?? ""}
            disabled={disabled || !casella || caricoCalendari}
            onValueChange={(v) => {
              const scelto = calendari.find((c) => c.id === v);
              onChange({
                external_provider: casella!.provider,
                external_connection_id: casella!.connectionId,
                external_calendar_id: v,
                external_calendar_name: scelto?.nome ?? null,
              });
            }}
          >
            <SelectTrigger>
              {caricoCalendari ? (
                <span className="flex items-center gap-2 text-muted-foreground">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" /> Leggo i calendari…
                </span>
              ) : (
                <SelectValue placeholder={casella ? "Scegli il calendario" : "Prima l'account"} />
              )}
            </SelectTrigger>
            <SelectContent>
              {calendari.map((c) => (
                <SelectItem key={c.id} value={c.id}>
                  <span className="flex items-center gap-2">
                    <span
                      className="inline-block h-2.5 w-2.5 shrink-0 rounded-full"
                      style={{ backgroundColor: c.colore ?? "#94a3b8" }}
                    />
                    {c.nome}
                    {c.principale ? " (principale)" : ""}
                  </span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {value.external_calendar_id && (
        <div className="flex items-center justify-between gap-2 rounded-md border bg-muted/30 px-3 py-2">
          <span className="flex min-w-0 items-center gap-2 text-xs">
            <CalendarDays className="h-3.5 w-3.5 shrink-0 text-primary" />
            <span className="truncate">
              {casella && !PROVIDER_SCRIVE_APPUNTAMENTI[casella.provider] ? (
                <>Gli impegni di <strong>{value.external_calendar_name || "questo calendario"}</strong> bloccano gli orari; gli appuntamenti non vengono ancora scritti su {PROVIDER_LABEL[casella.provider]}.</>
              ) : (
                <>Gli appuntamenti finiscono in <strong>{value.external_calendar_name || "questo calendario"}</strong>{casella && <> di {casella.email}</>}</>
              )}
            </span>
          </span>
          {!disabled && (
            <Button
              type="button"
              size="sm"
              variant="ghost"
              className="shrink-0 text-muted-foreground"
              onClick={() => onChange({ ...NESSUN_CALENDARIO_ESTERNO })}
            >
              <Link2Off className="mr-1 h-3.5 w-3.5" /> Scollega
            </Button>
          )}
        </div>
      )}

      {error && (
        <p className="flex items-start gap-1.5 text-xs text-destructive">
          <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" />
          {(error as Error).message}
        </p>
      )}
    </div>
  );
}
