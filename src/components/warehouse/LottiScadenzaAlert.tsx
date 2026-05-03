/**
 * LottiScadenzaAlert — Banner + lista lotti in scadenza imminente.
 *
 * Mostra alert se ci sono lotti scaduti o in scadenza entro N giorni
 * (default 30). Refresh automatico ogni 30 minuti.
 *
 * Bug pre-fix: expiry_date e' salvato in DB ma nessun alert lo notificava
 * → lotti scaduti rimanevano in giacenza senza mai essere visti.
 */

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { useLottiInScadenza, type SeveritaScadenza } from "@/hooks/warehouse/useWarehouseValorizzazione";
import { formatCurrency, formatDate } from "@/lib/formatters";
import { cn } from "@/lib/utils";
import { AlertTriangle, Calendar, Package, X } from "lucide-react";

const SEV_COLORS: Record<SeveritaScadenza, string> = {
  scaduto:    "bg-rose-100 text-rose-800 border-rose-300",
  urgente:    "bg-orange-50 text-orange-800 border-orange-200",
  attenzione: "bg-amber-50 text-amber-800 border-amber-200",
  ok:         "bg-muted/30 text-muted-foreground",
};

const SEV_LABELS: Record<SeveritaScadenza, string> = {
  scaduto:    "Scaduto",
  urgente:    "≤ 7g",
  attenzione: "≤ 30g",
  ok:         "OK",
};

interface Props {
  /** Se true mostra solo il banner compatto (per home magazzino) */
  compact?: boolean;
}

export function LottiScadenzaAlert({ compact = false }: Props) {
  const [days, setDays] = useState<number>(30);
  const [dismissed, setDismissed] = useState(false);
  const q = useLottiInScadenza(days);

  if (q.isLoading) {
    return compact ? null : <Skeleton className="h-32 w-full rounded-2xl" />;
  }
  if (q.isError || !q.data) return null;

  const { kpi, lotti } = q.data;
  const haCriticita = kpi.scaduti > 0 || kpi.urgenti > 0;

  // Compact mode: solo banner se ci sono criticità
  if (compact) {
    if (!haCriticita || dismissed) return null;
    return (
      <Card className="rounded-2xl border-amber-300 bg-amber-50">
        <CardContent className="flex items-start gap-3 p-3">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-700" />
          <div className="flex-1">
            <p className="text-sm font-semibold text-amber-900">
              {kpi.scaduti > 0 && (
                <span className="text-rose-800">{kpi.scaduti} lotti scaduti</span>
              )}
              {kpi.scaduti > 0 && kpi.urgenti > 0 && " · "}
              {kpi.urgenti > 0 && (
                <span>{kpi.urgenti} in scadenza nei prossimi 7 giorni</span>
              )}
            </p>
            <p className="text-xs text-amber-800">
              Valore a rischio: <strong>{formatCurrency(kpi.valore_a_rischio)}</strong>
            </p>
          </div>
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7 shrink-0 text-amber-700"
            onClick={() => setDismissed(true)}
            aria-label="Nascondi avviso"
          >
            <X className="h-4 w-4" />
          </Button>
        </CardContent>
      </Card>
    );
  }

  // Full mode: pannello completo
  return (
    <div className="space-y-4">
      {/* Header con KPI */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 text-lg font-semibold">
            <Calendar className="h-4 w-4 text-muted-foreground" />
            Scadenze lotti
          </h2>
          <p className="text-xs text-muted-foreground">
            Lotti con data di scadenza entro {days} giorni. Refresh ogni 30 min.
          </p>
        </div>
        <ToggleGroup
          type="single"
          value={String(days)}
          onValueChange={(v) => v && setDays(Number(v))}
        >
          <ToggleGroupItem value="7" variant="outline" size="sm">7 giorni</ToggleGroupItem>
          <ToggleGroupItem value="30" variant="outline" size="sm">30 giorni</ToggleGroupItem>
          <ToggleGroupItem value="90" variant="outline" size="sm">90 giorni</ToggleGroupItem>
        </ToggleGroup>
      </div>

      {/* KPI cards */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Card className={cn("rounded-2xl border-0", kpi.scaduti > 0 ? "bg-rose-50" : "bg-muted/30")}>
          <CardContent className="p-4">
            <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Scaduti</p>
            <p className={cn("mt-1 text-2xl font-bold tabular-nums", kpi.scaduti > 0 && "text-rose-700")}>
              {kpi.scaduti}
            </p>
          </CardContent>
        </Card>
        <Card className={cn("rounded-2xl border-0", kpi.urgenti > 0 ? "bg-orange-50" : "bg-muted/30")}>
          <CardContent className="p-4">
            <p className="text-[11px] uppercase tracking-wide text-muted-foreground">≤ 7 giorni</p>
            <p className={cn("mt-1 text-2xl font-bold tabular-nums", kpi.urgenti > 0 && "text-orange-700")}>
              {kpi.urgenti}
            </p>
          </CardContent>
        </Card>
        <Card className={cn("rounded-2xl border-0", kpi.attenzione > 0 ? "bg-amber-50" : "bg-muted/30")}>
          <CardContent className="p-4">
            <p className="text-[11px] uppercase tracking-wide text-muted-foreground">≤ 30 giorni</p>
            <p className={cn("mt-1 text-2xl font-bold tabular-nums", kpi.attenzione > 0 && "text-amber-700")}>
              {kpi.attenzione}
            </p>
          </CardContent>
        </Card>
        <Card className="rounded-2xl border-0 bg-blue-50">
          <CardContent className="p-4">
            <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Valore a rischio</p>
            <p className="mt-1 text-2xl font-bold tabular-nums">
              {formatCurrency(kpi.valore_a_rischio)}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Tabella lotti */}
      <Card className="rounded-2xl">
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Lotti in scadenza ({lotti.length})</CardTitle>
        </CardHeader>
        <CardContent>
          {lotti.length === 0 ? (
            <p className="rounded-xl border border-dashed p-6 text-center text-sm text-muted-foreground">
              ✅ Nessun lotto in scadenza nei prossimi {days} giorni.
            </p>
          ) : (
            <div className="overflow-x-auto rounded-xl border">
              <table className="w-full text-sm">
                <thead className="bg-muted/40">
                  <tr>
                    <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground">Articolo</th>
                    <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground">Lotto</th>
                    <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground">Fornitore</th>
                    <th className="px-3 py-2 text-right text-xs font-medium text-muted-foreground">Scadenza</th>
                    <th className="px-3 py-2 text-right text-xs font-medium text-muted-foreground">Giorni</th>
                    <th className="px-3 py-2 text-right text-xs font-medium text-muted-foreground">Qty</th>
                    <th className="px-3 py-2 text-right text-xs font-medium text-muted-foreground">Valore</th>
                    <th className="px-3 py-2 text-center text-xs font-medium text-muted-foreground">Stato</th>
                  </tr>
                </thead>
                <tbody>
                  {lotti.map((l) => (
                    <tr key={l.id} className="border-t">
                      <td className="px-3 py-2">
                        <div className="flex items-start gap-2">
                          <Package className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                          <div>
                            <p className="font-medium">{l.articolo}</p>
                            {l.internal_code && (
                              <p className="font-mono text-[10px] text-muted-foreground">
                                {l.internal_code}
                              </p>
                            )}
                          </div>
                        </div>
                      </td>
                      <td className="px-3 py-2 font-mono text-xs">{l.lot_number}</td>
                      <td className="px-3 py-2 text-xs text-muted-foreground">
                        {l.fornitore ?? "—"}
                      </td>
                      <td className="px-3 py-2 text-right text-xs">{formatDate(l.expiry_date)}</td>
                      <td
                        className={cn(
                          "px-3 py-2 text-right tabular-nums font-semibold",
                          l.giorni_residui < 0 && "text-rose-700",
                          l.giorni_residui >= 0 && l.giorni_residui <= 7 && "text-orange-700",
                          l.giorni_residui > 7 && l.giorni_residui <= 30 && "text-amber-700",
                        )}
                      >
                        {l.giorni_residui < 0 ? `${Math.abs(l.giorni_residui)}g fa` : `${l.giorni_residui}g`}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums">
                        {l.quantity.toLocaleString("it-IT")}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums">
                        {l.unit_cost != null ? formatCurrency(l.valore) : "—"}
                      </td>
                      <td className="px-3 py-2 text-center">
                        <Badge variant="outline" className={cn("text-[10px]", SEV_COLORS[l.severita])}>
                          {SEV_LABELS[l.severita]}
                        </Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
