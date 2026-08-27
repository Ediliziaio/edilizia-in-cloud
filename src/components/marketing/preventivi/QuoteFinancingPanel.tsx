/**
 * QuoteFinancingPanel — Selettore + calcolo finanziamento per un preventivo.
 *
 * Workflow:
 *   1. Toggle "Includi proposta di finanziamento"
 *   2. Selezione finanziaria (eic_finanziarie attive)
 *   3. Selezione prodotto finanziario (eic_tabelle_finanziamento attive di quella finanziaria)
 *   4. Importo da finanziare (default = totale preventivo)
 *   5. Numero rate (da durate_disponibili della tabella)
 *   6. Calcolo rata via lib/finanziamenti/calcolaFinanziamento
 *   7. Mostra rata mensile + totale dovuto + TAN/TAEG
 *
 * Output via callback `onChange`: l'oggetto FinancingProposal viene salvato
 * insieme al preventivo (campi quotes.financing_*).
 *
 * Tutti i dati di calcolo vengono ricavati dalla tabella reale del finanziatore
 * (eic_tabelle_finanziamento_righe). Niente formula francese ipotetica:
 * il calcolo riflette ESATTAMENTE quello che la finanziaria offrira'.
 */

import { useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { useTabelle, useRighe } from "@/lib/finanziamenti/queries";
import { calcolaFinanziamento } from "@/lib/finanziamenti/calcolaFinanziamento";
import type { RisultatoCalcolo } from "@/lib/finanziamenti/types";
import { CreditCard, AlertTriangle, CheckCircle2, Calculator, Banknote, Calendar, Percent } from "lucide-react";
import { cn } from "@/lib/utils";

export interface FinancingProposal {
  /** id eic_tabelle_finanziamento */
  table_id: string;
  amount: number;
  num_installments: number;
  /** Rata mensile effettiva per il cliente, inclusa spesa incasso rata. */
  monthly_rate: number;
  total_due: number;
  calculation: RisultatoCalcolo;
}

interface Props {
  /** Totale preventivo (default per importo finanziato) */
  quoteTotal: number;
  /** Proposta corrente (per pre-popolare in edit) */
  value: FinancingProposal | null;
  /** Chiamato quando l'utente sceglie/calcola/disattiva una proposta */
  onChange: (proposal: FinancingProposal | null) => void;
}

const fmtEur = (n: number) =>
  n.toLocaleString("it-IT", { style: "currency", currency: "EUR", useGrouping: "always" });

export function QuoteFinancingPanel({ quoteTotal, value, onChange }: Props) {
  const [enabled, setEnabled] = useState(!!value);
  const [tableId, setTableId] = useState<string | null>(value?.table_id ?? null);
  const [amount, setAmount] = useState<number>(value?.amount ?? quoteTotal);
  const [numInstallments, setNumInstallments] = useState<number | null>(
    value?.num_installments ?? null,
  );

  const tabelle = useTabelle();
  const tabella = useMemo(
    () => tabelle.data?.find((t) => t.id === tableId) ?? null,
    [tabelle.data, tableId],
  );
  const righe = useRighe(tableId ?? undefined);

  // Quando cambia il totale del preventivo, aggiorna l'importo finanziato
  // (ma solo se l'utente non l'ha customizzato — semplificazione: lo fa solo
  // alla prima inizializzazione)
  useEffect(() => {
    if (!value && enabled) setAmount(quoteTotal);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [quoteTotal, enabled]);

  // Calcolo rata
  const result: RisultatoCalcolo | null = useMemo(() => {
    if (!enabled || !tableId || !numInstallments || amount <= 0) return null;
    if (!righe.data) return null;
    return calcolaFinanziamento({
      importo: amount,
      numero_rate: numInstallments,
      righe: righe.data,
    });
  }, [enabled, tableId, numInstallments, amount, righe.data]);

  // Notifica il parent quando la proposta cambia
  useEffect(() => {
    if (!enabled) {
      onChange(null);
      return;
    }
    if (result && result.modalita !== "errore" && tableId) {
      const monthlyRate = result.rata_completa ?? result.importo_rata ?? 0;
      onChange({
        table_id: tableId,
        amount,
        num_installments: numInstallments!,
        monthly_rate: monthlyRate,
        total_due: result.importo_totale_dovuto ?? 0,
        calculation: result,
      });
    } else {
      onChange(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, result, tableId, amount, numInstallments]);

  return (
    <Card className="rounded-2xl">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center justify-between text-base">
          <span className="flex items-center gap-2">
            <CreditCard className="h-4 w-4 text-muted-foreground" />
            Proposta di Finanziamento
          </span>
          <div className="flex items-center gap-2">
            <Switch checked={enabled} onCheckedChange={setEnabled} />
            <Label className="text-sm">{enabled ? "Inclusa nel preventivo" : "Non inclusa"}</Label>
          </div>
        </CardTitle>
        {!enabled && (
          <p className="text-xs text-muted-foreground">
            Attiva per mostrare al cliente una proposta di rata mensile basata sulle tabelle
            finanziarie configurate. Aiuta a chiudere preventivi sopra €5.000.
          </p>
        )}
      </CardHeader>

      {enabled && (
        <CardContent className="space-y-3">
          {/* Tabelle non configurate */}
          {tabelle.data && tabelle.data.length === 0 && (
            <Alert className="border-amber-300 bg-amber-50">
              <AlertTriangle className="h-4 w-4 text-amber-700" />
              <AlertDescription className="text-amber-900">
                <strong>Nessuna tabella finanziamento configurata.</strong>{" "}
                <a
                  href="/azienda/impostazioni/finanziamenti"
                  className="underline underline-offset-2"
                >
                  Vai a Impostazioni → Finanziamenti
                </a>{" "}
                per aggiungerne una.
              </AlertDescription>
            </Alert>
          )}

          {tabelle.isLoading && <Skeleton className="h-10 w-full" />}

          {/* Selettore tabella finanziamento */}
          {tabelle.data && tabelle.data.length > 0 && (
            <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
              <div>
                <Label className="text-xs">Prodotto finanziario *</Label>
                <Select
                  value={tableId ?? ""}
                  onValueChange={(v) => {
                    setTableId(v || null);
                    setNumInstallments(null);
                  }}
                >
                  <SelectTrigger className="h-9">
                    <SelectValue placeholder="Seleziona tabella…" />
                  </SelectTrigger>
                  <SelectContent>
                    {tabelle.data.filter((t) => t.attiva).map((t) => (
                      <SelectItem key={t.id} value={t.id}>
                        {t.nome_prodotto}
                        {t.tan_base && ` · TAN ${t.tan_base.toFixed(2)}%`}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {tabella && tabella.importo_min !== null && tabella.importo_max !== null && (
                  <p className="mt-1 text-[10px] text-muted-foreground">
                    Range: {fmtEur(tabella.importo_min)} – {fmtEur(tabella.importo_max)}
                  </p>
                )}
              </div>

              <div>
                <Label className="text-xs">Numero rate *</Label>
                <Select
                  value={numInstallments ? String(numInstallments) : ""}
                  onValueChange={(v) => setNumInstallments(Number(v))}
                  disabled={!tabella}
                >
                  <SelectTrigger className="h-9">
                    <SelectValue placeholder="Seleziona durata…" />
                  </SelectTrigger>
                  <SelectContent>
                    {tabella?.durate_disponibili?.map((d) => (
                      <SelectItem key={d} value={String(d)}>
                        {d} rate ({Math.round(d / 12 * 10) / 10} anni)
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="md:col-span-2">
                <Label className="text-xs">Importo da finanziare (€)</Label>
                <Input
                  type="number"
                  min={0}
                  step={100}
                  value={amount}
                  onChange={(e) => setAmount(Number(e.target.value) || 0)}
                  className="h-9"
                />
                <p className="mt-1 text-[10px] text-muted-foreground">
                  Default: totale preventivo {fmtEur(quoteTotal)}.
                  Modificalo se finanzia solo parte (es. acconto contanti + rate sul saldo).
                </p>
              </div>
            </div>
          )}

          {/* Risultato calcolo */}
          {result && result.modalita === "errore" && (
            <Alert variant="destructive">
              <AlertTriangle className="h-4 w-4" />
              <AlertDescription>
                <strong>{result.messaggio}</strong>
                {result.durate_disponibili && result.durate_disponibili.length > 0 && (
                  <p className="mt-1 text-xs">
                    Durate disponibili: {result.durate_disponibili.join(", ")} rate
                  </p>
                )}
                {result.importo_min !== undefined && result.importo_max !== undefined && (
                  <p className="mt-1 text-xs">
                    Range importi: {fmtEur(result.importo_min)} – {fmtEur(result.importo_max)}
                  </p>
                )}
              </AlertDescription>
            </Alert>
          )}

          {result && result.modalita !== "errore" && (
            <div
              className={cn(
                "rounded-2xl border p-4",
                result.modalita === "esatto"
                  ? "border-emerald-200 bg-emerald-50/50"
                  : "border-blue-200 bg-blue-50/50",
              )}
            >
              <div className="mb-3 flex items-center justify-between">
                <p className="flex items-center gap-2 text-sm font-semibold">
                  <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                  Rata calcolata
                </p>
                <Badge
                  variant="outline"
                  className={cn(
                    "text-[10px]",
                    result.modalita === "esatto"
                      ? "border-emerald-400 text-emerald-700"
                      : "border-blue-400 text-blue-700",
                  )}
                >
                  {result.modalita === "esatto" ? "Da tabella" : "Interpolato"}
                </Badge>
              </div>

              <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
                <Stat
                  icon={<Banknote className="h-3.5 w-3.5" />}
                  label="Rata mensile cliente"
                  value={fmtEur(result.rata_completa ?? result.importo_rata ?? 0)}
                  highlight
                />
                <Stat
                  icon={<Calendar className="h-3.5 w-3.5" />}
                  label="Durata"
                  value={`${result.numero_rate} rate`}
                />
                <Stat
                  icon={<Calculator className="h-3.5 w-3.5" />}
                  label="Totale dovuto"
                  value={fmtEur(result.importo_totale_dovuto ?? 0)}
                />
                <Stat
                  icon={<Percent className="h-3.5 w-3.5" />}
                  label="TAN / TAEG"
                  value={`${result.tan?.toFixed(2) ?? "—"}% / ${result.taeg?.toFixed(2) ?? "—"}%`}
                />
              </div>

              {((result.spese_istruttoria ?? 0) > 0 ||
                (result.spese_incasso_rata ?? 0) > 0) && (
                <p className="mt-2 text-[11px] text-muted-foreground">
                  {(result.spese_istruttoria ?? 0) > 0 &&
                    `Spese istruttoria: ${fmtEur(result.spese_istruttoria ?? 0)}`}
                  {(result.spese_istruttoria ?? 0) > 0 &&
                    (result.spese_incasso_rata ?? 0) > 0 &&
                    " · "}
                  {(result.spese_incasso_rata ?? 0) > 0 &&
                    `Spese incasso/rata: ${fmtEur(result.spese_incasso_rata ?? 0)}`}
                </p>
              )}
            </div>
          )}
        </CardContent>
      )}
    </Card>
  );
}

function Stat({
  icon, label, value, highlight,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  highlight?: boolean;
}) {
  return (
    <div>
      <p className="flex items-center gap-1 text-[10px] uppercase tracking-wide text-muted-foreground">
        {icon}
        {label}
      </p>
      <p
        className={cn(
          "mt-0.5 tabular-nums",
          highlight ? "text-2xl font-extrabold text-primary" : "text-base font-semibold",
        )}
      >
        {value}
      </p>
    </div>
  );
}
