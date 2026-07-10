/**
 * Tab Indici Avanzati: DSO/DPO/DSI/CCC + Altman Z-score + DSCR.
 *
 * Tutti gli indici sono pensati per il dialogo con la banca o
 * l'investitore — sono i numeri che chiede un fido o un mutuo.
 */

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { ErrorBlock } from "@/components/controllo-gestione/ui/ErrorBlock";
import { useIndiciAvanzati } from "@/hooks/controlloGestione/useIndiciAvanzati";
import { useImposte } from "@/hooks/controlloGestione/useImposte";
import { formatCurrency } from "@/lib/formatters";
import { cn } from "@/lib/utils";
import { Calendar, Shield, Banknote, Clock, TrendingUp, AlertTriangle, Receipt } from "lucide-react";

interface Props {
  anno: number;
}

export function TabIndiciAvanzati({ anno }: Props) {
  const q = useIndiciAvanzati(anno);
  const imp = useImposte(anno);

  if (q.isLoading) return <Skeleton className="h-96 w-full rounded-2xl" />;
  if (q.isError)   return <ErrorBlock onRetry={() => q.refetch()} />;
  if (!q.data) return null;

  const { rotazione, altman, dscr } = q.data;

  // Componenti DSCR ricostruite dalla formula della RPC (DSCR = flusso / rate):
  // così la tabellina quadra SEMPRE col valore mostrato. Il backend stima le
  // imposte al 30% flat sull'utile ante imposte (convenzione bancaria prudente),
  // diversa dall'IRES+IRAP puntuale della card sopra.
  const dscrFlusso = dscr.valore !== null ? dscr.valore * dscr.rate_anno : null;
  const dscrImposte = dscrFlusso !== null ? dscr.ebitda - dscrFlusso : null;

  return (
    <div className="space-y-4">
      {/* Sezione Imposte IRES + IRAP */}
      {imp.data && (
        <Card className="rounded-2xl">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <Receipt className="h-4 w-4" /> Imposte stimate IRES + IRAP
            </CardTitle>
            <p className="text-xs text-muted-foreground">
              IRES {imp.data.aliquote.ires_pct}% su utile a.i. · IRAP {imp.data.aliquote.irap_pct}% su EBIT + costo personale
            </p>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              <Card className="rounded-2xl border-0 bg-blue-50">
                <CardContent className="p-4">
                  <p className="text-[11px] uppercase tracking-wide text-muted-foreground">IRES</p>
                  <p className="mt-1 text-2xl font-bold tabular-nums">{formatCurrency(imp.data.ires.imposta)}</p>
                  <p className="mt-1 text-[11px] text-muted-foreground">
                    Base: {formatCurrency(imp.data.ires.base_imponibile)} × {imp.data.ires.aliquota}%
                  </p>
                </CardContent>
              </Card>
              <Card className="rounded-2xl border-0 bg-violet-50">
                <CardContent className="p-4">
                  <p className="text-[11px] uppercase tracking-wide text-muted-foreground">IRAP</p>
                  <p className="mt-1 text-2xl font-bold tabular-nums">{formatCurrency(imp.data.irap.imposta)}</p>
                  <p className="mt-1 text-[11px] text-muted-foreground">
                    Base: {formatCurrency(imp.data.irap.base_imponibile)} × {imp.data.irap.aliquota}%
                  </p>
                </CardContent>
              </Card>
              <Card className="rounded-2xl border-0 bg-rose-50">
                <CardContent className="p-4">
                  <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Imposte totali</p>
                  <p className="mt-1 text-2xl font-bold tabular-nums text-rose-700">
                    {formatCurrency(imp.data.totali.imposte_totali)}
                  </p>
                  <p className="mt-1 text-[11px] text-muted-foreground">
                    Tax rate eff. {imp.data.totali.tax_rate_eff_pct?.toFixed(1) ?? "—"}%
                  </p>
                </CardContent>
              </Card>
              <Card className="rounded-2xl border-0 bg-emerald-50">
                <CardContent className="p-4">
                  <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Utile post imposte</p>
                  <p className="mt-1 text-2xl font-bold tabular-nums text-emerald-700">
                    {formatCurrency(imp.data.totali.utile_post)}
                  </p>
                  <p className="mt-1 text-[11px] text-muted-foreground">
                    da {formatCurrency(imp.data.totali.utile_ante)} a.i.
                  </p>
                </CardContent>
              </Card>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Sezione 1 — Indici di rotazione */}
      <Card className="rounded-2xl">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <Clock className="h-4 w-4" /> Indici di rotazione (Working Capital)
          </CardTitle>
          <p className="text-xs text-muted-foreground">
            Tempi medi di incasso/pagamento e tenuta scorte. Più basso CCC = meno capitale immobilizzato.
          </p>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <RotazioneBox
              label="DSO"
              tooltip="Days Sales Outstanding"
              giorni={rotazione.dso_giorni}
              numeratore={rotazione.crediti_clienti}
              denominatore={rotazione.ricavi}
              numLabel="Crediti clienti"
              denLabel="Ricavi annuali"
              tone="blue"
              hint="< 60g ottimo · > 90g critico"
              icon={<Calendar className="h-4 w-4" />}
            />
            <RotazioneBox
              label="DPO"
              tooltip="Days Payable Outstanding"
              giorni={rotazione.dpo_giorni}
              numeratore={rotazione.debiti_fornitori}
              denominatore={rotazione.acquisti}
              numLabel="Debiti fornitori"
              denLabel="Acquisti annuali"
              tone="amber"
              hint="60-90g ok · < 30g paghi troppo presto"
              icon={<Banknote className="h-4 w-4" />}
            />
            <RotazioneBox
              label="DSI"
              tooltip="Days Sales of Inventory"
              giorni={rotazione.dsi_giorni}
              numeratore={rotazione.rimanenze}
              denominatore={rotazione.costo_venduto}
              numLabel="Rimanenze"
              denLabel="Costo del venduto"
              tone="violet"
              hint="< 60g ottimo · > 120g rischio obsolescenza"
              icon={<TrendingUp className="h-4 w-4" />}
            />
            <Card
              className={cn(
                "rounded-2xl border-0",
                rotazione.ccc_giorni < 60 ? "bg-emerald-50" : rotazione.ccc_giorni < 120 ? "bg-amber-50" : "bg-rose-50",
              )}
            >
              <CardContent className="p-4">
                <p className="text-[11px] uppercase tracking-wide text-muted-foreground">
                  Cash Conversion Cycle
                </p>
                <p className="mt-1 text-3xl font-bold tabular-nums">
                  {rotazione.ccc_giorni.toFixed(0)}g
                </p>
                <p className="mt-1 text-[11px] text-muted-foreground">
                  CCC = DSO + DSI − DPO
                </p>
                <p className="mt-2 text-xs">
                  {rotazione.ccc_giorni < 60 ? "✓ Eccellente" : rotazione.ccc_giorni < 120 ? "⚠ Da migliorare" : "✗ Critico"}
                </p>
              </CardContent>
            </Card>
          </div>
        </CardContent>
      </Card>

      {/* Sezione 2 — Z-score Altman */}
      <Card className="rounded-2xl">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <Shield className="h-4 w-4" /> Z-score di Altman (rischio default)
          </CardTitle>
          <p className="text-xs text-muted-foreground">
            Modello PMI non quotate (Altman 1983 revised). Z' = 0.717·X1 + 0.847·X2 + 3.107·X3 + 0.420·X4 + 0.998·X5
          </p>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
            <div
              className={cn(
                "rounded-2xl p-6",
                altman.classe === "safe" && "bg-emerald-50",
                altman.classe === "grey" && "bg-amber-50",
                altman.classe === "distress" && "bg-rose-50",
                !altman.classe && "bg-muted/40",
              )}
            >
              <p className="text-xs text-muted-foreground">Z-score</p>
              <p
                className={cn(
                  "mt-1 text-4xl font-bold tabular-nums",
                  altman.classe === "safe"     && "text-emerald-700",
                  altman.classe === "grey"     && "text-amber-700",
                  altman.classe === "distress" && "text-rose-700",
                )}
              >
                {altman.z_score !== null ? altman.z_score.toFixed(2) : "—"}
              </p>
              <p className="mt-2 text-sm font-medium">
                {altman.descrizione}
              </p>
            </div>

            <div className="rounded-2xl border p-4 text-sm lg:col-span-2">
              <p className="font-semibold">Soglie del modello</p>
              <ul className="mt-2 space-y-1.5">
                <li className="flex items-center justify-between">
                  <span className="flex items-center gap-2">
                    <span className="inline-block h-2 w-2 rounded-full bg-emerald-500" />
                    Area di sicurezza
                  </span>
                  <span className="font-mono text-xs text-muted-foreground">Z ≥ 2.90</span>
                </li>
                <li className="flex items-center justify-between">
                  <span className="flex items-center gap-2">
                    <span className="inline-block h-2 w-2 rounded-full bg-amber-500" />
                    Area grigia (incertezza)
                  </span>
                  <span className="font-mono text-xs text-muted-foreground">1.23 ≤ Z &lt; 2.90</span>
                </li>
                <li className="flex items-center justify-between">
                  <span className="flex items-center gap-2">
                    <span className="inline-block h-2 w-2 rounded-full bg-rose-500" />
                    Area di distress
                  </span>
                  <span className="font-mono text-xs text-muted-foreground">Z &lt; 1.23</span>
                </li>
              </ul>
              <p className="mt-3 text-xs text-muted-foreground">
                Le 5 variabili: capitale circolante / attivo, utili non distribuiti / attivo,
                EBIT / attivo, PN / debiti totali, ricavi / attivo.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Sezione 3 — DSCR */}
      <Card className="rounded-2xl">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <Banknote className="h-4 w-4" /> DSCR — Debt Service Coverage Ratio
          </CardTitle>
          <p className="text-xs text-muted-foreground">
            Indica quante volte il flusso operativo copre il servizio del debito (rate mutui).
            Soglia bancaria minima: 1.20.
          </p>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
            <div
              className={cn(
                "rounded-2xl p-6",
                dscr.classe === "eccellente"    && "bg-emerald-50",
                dscr.classe === "buono"         && "bg-blue-50",
                dscr.classe === "critico"       && "bg-amber-50",
                dscr.classe === "insufficiente" && "bg-rose-50",
                dscr.classe === "na"            && "bg-muted/40",
              )}
            >
              <p className="text-xs text-muted-foreground">DSCR</p>
              <p
                className={cn(
                  "mt-1 text-4xl font-bold tabular-nums",
                  dscr.classe === "eccellente"    && "text-emerald-700",
                  dscr.classe === "buono"         && "text-blue-700",
                  dscr.classe === "critico"       && "text-amber-700",
                  dscr.classe === "insufficiente" && "text-rose-700",
                )}
              >
                {dscr.valore !== null ? `${dscr.valore.toFixed(2)}x` : "—"}
              </p>
              <p className="mt-2 text-sm font-medium capitalize">
                {dscr.classe === "na" ? "Nessun mutuo attivo" : dscr.classe}
              </p>
            </div>

            <div className="rounded-2xl border p-4 text-sm lg:col-span-2">
              <p className="font-semibold">Componenti del calcolo</p>
              <div className="overflow-x-auto">
                <table className="mt-3 w-full text-xs">
                <tbody>
                  <tr className="border-b">
                    <td className="py-1.5">EBITDA</td>
                    <td className="py-1.5 text-right tabular-nums">{formatCurrency(dscr.ebitda)}</td>
                  </tr>
                  <tr className="border-b">
                    <td className="py-1.5">− Imposte stimate (30% utile a.i.)</td>
                    <td className="py-1.5 text-right tabular-nums">
                      {dscrImposte !== null ? formatCurrency(dscrImposte) : "—"}
                    </td>
                  </tr>
                  <tr className="border-b font-medium">
                    <td className="py-1.5">= Flusso disponibile</td>
                    <td className="py-1.5 text-right tabular-nums">
                      {dscrFlusso !== null ? formatCurrency(dscrFlusso) : "—"}
                    </td>
                  </tr>
                  <tr className="border-b">
                    <td className="py-1.5">Rate mutui annuali (capitale + interessi)</td>
                    <td className="py-1.5 text-right tabular-nums">{formatCurrency(dscr.rate_anno)}</td>
                  </tr>
                  <tr>
                    <td className="py-1.5">di cui interessi</td>
                    <td className="py-1.5 text-right tabular-nums text-muted-foreground">
                      {formatCurrency(dscr.interessi_anno)}
                    </td>
                  </tr>
                </tbody>
                </table>
              </div>
              <p className="mt-3 flex items-start gap-1.5 text-xs text-muted-foreground">
                <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" />
                Soglie banca: <strong className="ml-1">≥ 1.50 eccellente · ≥ 1.20 buono · &lt; 1.00 insufficiente</strong>
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function RotazioneBox({
  label, tooltip, giorni, numeratore, denominatore,
  numLabel, denLabel, tone, hint, icon,
}: {
  label: string;
  tooltip: string;
  giorni: number | null;
  numeratore: number;
  denominatore: number;
  numLabel: string;
  denLabel: string;
  tone: "blue" | "amber" | "violet";
  hint: string;
  icon: React.ReactNode;
}) {
  const palette = {
    blue: "bg-blue-50",
    amber: "bg-amber-50",
    violet: "bg-violet-50",
  } as const;
  return (
    <Card className={cn("rounded-2xl border-0", palette[tone])}>
      <CardContent className="p-4">
        <div className="flex items-center justify-between">
          <p className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</p>
          {icon}
        </div>
        <p className="mt-1 text-3xl font-bold tabular-nums">
          {giorni !== null ? `${giorni.toFixed(0)}g` : "—"}
        </p>
        <p className="mt-0.5 text-[10px] text-muted-foreground">{tooltip}</p>
        <p className="mt-2 text-[11px] text-muted-foreground">
          {numLabel}: <span className="font-medium tabular-nums">{formatCurrency(numeratore)}</span><br />
          {denLabel}: <span className="font-medium tabular-nums">{formatCurrency(denominatore)}</span>
        </p>
        <p className="mt-1 text-[10px] italic text-muted-foreground">{hint}</p>
      </CardContent>
    </Card>
  );
}
