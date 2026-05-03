import { useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  useCEriclassificato,
  useBEP,
  useCEMensileDettaglio,
  useCEMultiAnno,
  type VoceCE,
} from "@/hooks/controlloGestione/useCEriclassificato";
import { CETable } from "@/components/controllo-gestione/ui/CETable";
import { BEPChart } from "@/components/controllo-gestione/ui/BEPChart";
import { KPIBox } from "@/components/controllo-gestione/ui/KPIBox";
import { CESkeleton } from "@/components/controllo-gestione/skeletons/CESkeleton";
import { EmptyState } from "@/components/controllo-gestione/ui/EmptyState";
import { ErrorBlock } from "@/components/controllo-gestione/ui/ErrorBlock";
import { formatCurrency, formatCurrencyCompact, formatDate } from "@/lib/formatters";
import { InsightsPanel } from "@/components/controllo-gestione/ui/InsightsPanel";
import { useControlloGestioneInsights } from "@/hooks/controlloGestione/useControlloGestioneInsights";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { ArrowDown, ArrowRight, ArrowUp } from "lucide-react";
import { DettaglioVoceMeseSheet } from "@/components/controllo-gestione/ui/DettaglioVoceMeseSheet";
import { isDrillDownEnabled } from "@/hooks/controlloGestione/useDettaglioVoceMese";
import { ExportButton } from "@/components/controllo-gestione/ui/ExportButton";
import { exportXlsx } from "@/lib/controlloGestione/exportXlsx";

interface TabCERiclassificatoProps {
  anno: number;
  meseDa: number;
  meseA: number;
}

type Vista = "consuntivo" | "mensile" | "confronto";

const MESI_LABELS = [
  "Gen", "Feb", "Mar", "Apr", "Mag", "Giu",
  "Lug", "Ago", "Set", "Ott", "Nov", "Dic",
];

// Codici di voci di costo: per queste un delta positivo è "negativo" (rosso).
const CODICI_COSTO = new Set([
  "03", "04", "05", "06", "07", "08", "09", "10", "11", "14", "15",
]);

function findVoce(voci: { codice: string; valore: number }[], codice: string) {
  return voci.find((v) => v.codice === codice)?.valore ?? 0;
}

function formatPctDelta(delta: number): string {
  const sign = delta >= 0 ? "+" : "";
  return `${sign}${new Intl.NumberFormat("it-IT", {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  }).format(delta)}%`;
}

function calcDeltaPct(curr: number, prev: number): number | null {
  if (prev === 0) return null;
  return ((curr - prev) / Math.abs(prev)) * 100;
}

export function TabCERiclassificato({ anno, meseDa, meseA }: TabCERiclassificatoProps) {
  const [vista, setVista] = useState<Vista>("consuntivo");
  const ce = useCEriclassificato(anno, meseDa, meseA);
  const bep = useBEP(anno);
  const { insights } = useControlloGestioneInsights(anno);

  const allZero = useMemo(() => {
    if (!ce.data) return false;
    return ce.data.voci.every((v) => v.valore === 0);
  }, [ce.data]);

  const ViewSwitcher = (
    <ToggleGroup
      type="single"
      value={vista}
      onValueChange={(v) => v && setVista(v as Vista)}
      className="justify-start"
    >
      <ToggleGroupItem value="consuntivo" variant="outline" size="sm">
        Consuntivo
      </ToggleGroupItem>
      <ToggleGroupItem value="mensile" variant="outline" size="sm">
        Mensile
      </ToggleGroupItem>
      <ToggleGroupItem value="confronto" variant="outline" size="sm">
        Confronto
      </ToggleGroupItem>
    </ToggleGroup>
  );

  if (vista === "consuntivo") {
    if (ce.isLoading) {
      return (
        <div className="space-y-4">
          {ViewSwitcher}
          <CESkeleton />
        </div>
      );
    }
    if (ce.isError) {
      return (
        <div className="space-y-4">
          {ViewSwitcher}
          <ErrorBlock onRetry={() => ce.refetch()} />
        </div>
      );
    }
    if (!ce.data) return <div className="space-y-4">{ViewSwitcher}</div>;

    if (allZero) {
      return (
        <div className="space-y-4">
          {ViewSwitcher}
          <EmptyState
            title="Nessun dato di conto economico"
            description={`Per il periodo selezionato (${anno}) non ci sono movimenti registrati. Inserisci le scritture in Prima Nota per popolare il CE riclassificato.`}
            ctaLabel="Vai a Prima Nota"
            onCta={() => { window.location.href = "/azienda/prima-nota"; }}
          />
        </div>
      );
    }

    const pil = findVoce(ce.data.voci, "A");
    const ricavi = findVoce(ce.data.voci, "01");
    const ebitda = findVoce(ce.data.voci, "E");
    const ebit = findVoce(ce.data.voci, "F");
    const utile = findVoce(ce.data.voci, "L");
    const ebitdaPctPil = pil !== 0 ? (ebitda / pil) * 100 : 0;

    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          {ViewSwitcher}
          <ExportButton
            onExport={async () => {
              await exportXlsx({
                filename: `ce_riclassificato_${anno}.xlsx`,
                brand: { title: "Conto Economico Riclassificato", subtitle: `Esercizio ${anno}` },
                sheets: [{
                  name: `CE ${anno}`,
                  columns: [
                    { header: "Cod", key: "codice", width: 6 },
                    { header: "Voce", key: "label", width: 35 },
                    { header: "Importo", key: "valore", width: 16, type: "number" },
                    { header: "% PIL", key: "pct_pil_disp", width: 10 },
                  ],
                  rows: ce.data.voci.map((v) => ({
                    ...v,
                    pct_pil_disp: v.pct_pil != null ? `${Number(v.pct_pil).toFixed(1)}%` : "",
                  })),
                  rowStyle: (row) => {
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    const t = (row as any).tipo as string;
                    if (t === "subtot_grasso") return "total";
                    if (t === "subtot") return "subtot";
                    return "normal";
                  },
                }],
              });
            }}
          />
        </div>
        <InsightsPanel insights={insights} title="Cosa devi guardare per primo" />
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          <Card className="rounded-2xl lg:col-span-2">
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Conto Economico Riclassificato</CardTitle>
            </CardHeader>
            <CardContent>
              <CETable voci={ce.data.voci} />
            </CardContent>
          </Card>

          <div className="space-y-3 lg:col-span-1">
            <KPIBox
              label="Ricavi delle vendite"
              value={formatCurrency(ricavi)}
              sub={ricavi !== pil ? `PIL ${formatCurrency(pil)}` : undefined}
              tone="blue"
            />
            <KPIBox
              label="MOL / EBITDA"
              value={formatCurrency(ebitda)}
              sub={`${ebitdaPctPil.toFixed(1)}% del PIL`}
              tone={ebitda >= 0 ? "green" : "red"}
            />
            <KPIBox
              label="EBIT (operativo)"
              value={formatCurrency(ebit)}
              sub={pil !== 0 ? `${((ebit / pil) * 100).toFixed(1)}% del PIL` : undefined}
              tone={ebit >= 0 ? "green" : "red"}
            />
            <KPIBox
              label="Utile di bilancio"
              value={formatCurrency(utile)}
              sub={pil !== 0 ? `${((utile / pil) * 100).toFixed(1)}% del PIL` : undefined}
              tone={utile >= 0 ? "green" : "red"}
            />
            <KPIBox
              label="Break Even Point"
              value={
                bep.isLoading
                  ? "…"
                  : bep.data?.bep_data
                    ? formatDate(bep.data.bep_data)
                    : "Non raggiunto"
              }
              sub={
                bep.data?.gia_raggiunto
                  ? "BEP già raggiunto"
                  : bep.data?.giorni_residui != null
                    ? `${bep.data.giorni_residui} giorni residui`
                    : undefined
              }
              tone={bep.data?.gia_raggiunto ? "green" : "neutral"}
            />
          </div>

          <Card className="rounded-2xl lg:col-span-3">
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Andamento Ricavi vs Costi vs BEP</CardTitle>
            </CardHeader>
            <CardContent>
              <BEPChart anno={anno} />
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  if (vista === "mensile") {
    return (
      <div className="space-y-4">
        {ViewSwitcher}
        <CEMensileView anno={anno} />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {ViewSwitcher}
      <CEConfrontoView anno={anno} />
    </div>
  );
}

// ── Vista Mensile ──────────────────────────────────────────────────────────
function CEMensileView({ anno }: { anno: number }) {
  const q = useCEMensileDettaglio(anno);
  const [drill, setDrill] = useState<{
    mese: number;
    codice: string;
    label: string;
  } | null>(null);

  if (q.isLoading) {
    return (
      <div className="space-y-2">
        {Array.from({ length: 16 }).map((_, i) => (
          <Skeleton key={i} className="h-9 w-full" />
        ))}
      </div>
    );
  }
  if (q.isError) return <ErrorBlock onRetry={() => q.refetch()} />;
  if (!q.data) return null;

  // Costruisci la matrice: prendi le voci del primo mese disponibile come schema.
  const schema: VoceCE[] =
    q.data.mesi.find((m) => m.voci.length > 0)?.voci ?? [];

  if (schema.length === 0) {
    return (
      <EmptyState
        title="Nessun dato mensile"
        description={`Per il ${anno} non ci sono movimenti distribuiti per mese.`}
      />
    );
  }

  // Indicizzazione: per ogni codice voce, mappa mese → valore.
  const valoriPerCodiceMese = new Map<string, Map<number, number>>();
  for (const m of q.data.mesi) {
    for (const v of m.voci) {
      if (!valoriPerCodiceMese.has(v.codice)) {
        valoriPerCodiceMese.set(v.codice, new Map());
      }
      valoriPerCodiceMese.get(v.codice)!.set(m.mese, v.valore);
    }
  }

  return (
    <>
      <Card className="rounded-2xl">
        <CardHeader className="pb-3">
          <CardTitle className="text-base">CE Mensile · {anno}</CardTitle>
          <p className="text-xs text-muted-foreground">
            Clicca un valore per vedere le sub-righe (fatture, costi, cedolini, cespiti) che lo
            compongono.
          </p>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto rounded-xl border">
            <table className="w-full border-collapse text-sm">
              <thead className="bg-muted/40">
                <tr>
                  <th className="sticky left-0 z-10 w-12 bg-muted/40 px-2 py-2 text-left text-xs font-medium text-muted-foreground">
                    Cod
                  </th>
                  <th className="sticky left-12 z-10 min-w-[200px] bg-muted/40 px-3 py-2 text-left text-xs font-medium text-muted-foreground">
                    Voce
                  </th>
                  {MESI_LABELS.map((m) => (
                    <th
                      key={m}
                      className="w-[80px] px-2 py-2 text-right text-xs font-medium text-muted-foreground"
                    >
                      {m}
                    </th>
                  ))}
                  <th className="w-[100px] bg-primary/5 px-2 py-2 text-right text-xs font-semibold text-foreground">
                    Totale
                  </th>
                </tr>
              </thead>
              <tbody>
                {schema.map((v) => {
                  const isGrasso = v.tipo === "subtot_grasso";
                  const isSub = v.tipo === "subtot";
                  const valori = valoriPerCodiceMese.get(v.codice);
                  const valoriMese = MESI_LABELS.map((_, i) => valori?.get(i + 1) ?? 0);
                  const totale = valoriMese.reduce((acc, n) => acc + n, 0);
                  const drillEnabled = isDrillDownEnabled(v.codice);

                  return (
                    <tr
                      key={v.codice}
                      className={cn(
                        "border-t",
                        isGrasso && "bg-primary/5 font-bold",
                        isSub && "bg-muted/50 font-semibold",
                      )}
                    >
                      <td
                        className={cn(
                          "sticky left-0 z-10 px-2 py-2 font-mono text-xs text-muted-foreground",
                          isGrasso && "bg-primary/5",
                          isSub && "bg-muted/50",
                          !isGrasso && !isSub && "bg-background",
                        )}
                      >
                        {v.codice}
                      </td>
                      <td
                        className={cn(
                          "sticky left-12 z-10 px-3 py-2 text-left",
                          isGrasso && "bg-primary/5",
                          isSub && "bg-muted/50",
                          !isGrasso && !isSub && "bg-background",
                        )}
                      >
                        {v.label}
                      </td>
                      {valoriMese.map((val, i) => {
                        const mese = i + 1;
                        const isClickable = drillEnabled && val !== 0;
                        return (
                          <td
                            key={i}
                            className={cn(
                              "px-2 py-2 text-right tabular-nums text-xs",
                              val < 0 && "text-destructive",
                              isClickable &&
                                "cursor-pointer hover:bg-primary/10 hover:underline",
                            )}
                            onClick={
                              isClickable
                                ? () =>
                                    setDrill({
                                      mese,
                                      codice: v.codice,
                                      label: v.label,
                                    })
                                : undefined
                            }
                            title={
                              isClickable
                                ? `Apri dettaglio ${v.label} · ${MESI_LABELS[i]}`
                                : undefined
                            }
                          >
                            {val !== 0 ? formatCurrencyCompact(val) : "—"}
                          </td>
                        );
                      })}
                      <td
                        className={cn(
                          "bg-primary/5 px-2 py-2 text-right tabular-nums text-xs font-semibold",
                          totale < 0 && "text-destructive",
                        )}
                      >
                        {totale !== 0 ? formatCurrencyCompact(totale) : "—"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      <DettaglioVoceMeseSheet
        open={drill !== null}
        onOpenChange={(v) => {
          if (!v) setDrill(null);
        }}
        anno={anno}
        mese={drill?.mese ?? null}
        codice={drill?.codice ?? null}
        labelFallback={drill?.label}
      />
    </>
  );
}

// ── Vista Confronto ────────────────────────────────────────────────────────
function CEConfrontoView({ anno }: { anno: number }) {
  const anni = useMemo(() => [anno - 2, anno - 1, anno], [anno]);
  const q = useCEMultiAnno(anni);
  const [drill, setDrill] = useState<{
    anno: number;
    codice: string;
    label: string;
  } | null>(null);

  if (q.isLoading) {
    return (
      <div className="space-y-2">
        {Array.from({ length: 16 }).map((_, i) => (
          <Skeleton key={i} className="h-9 w-full" />
        ))}
      </div>
    );
  }
  if (q.isError) return <ErrorBlock onRetry={() => q.refetch()} />;
  if (!q.data) return null;

  // Schema dalle voci dell'anno corrente (l'ultimo).
  const annoCorrenteRow = q.data.find((r) => r.anno === anno);
  const schema: VoceCE[] = annoCorrenteRow?.voci ?? q.data[0]?.voci ?? [];

  if (schema.length === 0) {
    return (
      <EmptyState
        title="Nessun dato di confronto"
        description={`Non ho voci di CE per gli anni ${anni.join(", ")}.`}
      />
    );
  }

  const mappa = new Map<number, Map<string, number>>();
  for (const r of q.data) {
    const m = new Map<string, number>();
    for (const v of r.voci) m.set(v.codice, v.valore);
    mappa.set(r.anno, m);
  }

  return (
    <Card className="rounded-2xl">
      <CardHeader className="pb-3">
        <CardTitle className="text-base">
          Confronto multi-anno · {anni[0]} → {anni[2]}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto rounded-xl border">
          <table className="w-full border-collapse text-sm">
            <thead className="bg-muted/40">
              <tr>
                <th className="w-12 px-2 py-2 text-left text-xs font-medium text-muted-foreground">
                  Cod
                </th>
                <th className="min-w-[200px] px-3 py-2 text-left text-xs font-medium text-muted-foreground">
                  Voce
                </th>
                {anni.map((a) => (
                  <th
                    key={a}
                    className="px-3 py-2 text-right text-xs font-medium text-muted-foreground"
                  >
                    {a}
                  </th>
                ))}
                <th className="px-3 py-2 text-right text-xs font-medium text-muted-foreground">
                  Δ% YoY
                </th>
                <th className="w-12 px-2 py-2 text-center text-xs font-medium text-muted-foreground">
                  Trend
                </th>
              </tr>
            </thead>
            <tbody>
              {schema.map((v) => {
                const isGrasso = v.tipo === "subtot_grasso";
                const isSub = v.tipo === "subtot";
                const valori = anni.map((a) => mappa.get(a)?.get(v.codice) ?? 0);
                const corr = valori[2];
                const prec = valori[1];
                const delta = calcDeltaPct(corr, prec);
                const isCosto = CODICI_COSTO.has(v.codice);

                let deltaColor = "text-muted-foreground";
                let trendIcon = <ArrowRight className="mx-auto h-3.5 w-3.5 text-muted-foreground" />;
                if (delta !== null && Math.abs(delta) >= 0.1) {
                  const positivo = delta > 0;
                  // Per voci di costo: positivo = brutto = rosso.
                  const buono = isCosto ? !positivo : positivo;
                  deltaColor = buono ? "text-emerald-600" : "text-rose-600";
                  trendIcon = positivo ? (
                    <ArrowUp className={cn("mx-auto h-3.5 w-3.5", buono ? "text-emerald-600" : "text-rose-600")} />
                  ) : (
                    <ArrowDown className={cn("mx-auto h-3.5 w-3.5", buono ? "text-emerald-600" : "text-rose-600")} />
                  );
                }

                return (
                  <tr
                    key={v.codice}
                    className={cn(
                      "border-t",
                      isGrasso && "bg-primary/5 font-bold",
                      isSub && "bg-muted/50 font-semibold",
                    )}
                  >
                    <td className="px-2 py-2 font-mono text-xs text-muted-foreground">
                      {v.codice}
                    </td>
                    <td className="px-3 py-2">{v.label}</td>
                    {valori.map((val, i) => {
                      const annoCol = anni[i];
                      const drillEnabled = isDrillDownEnabled(v.codice);
                      const isClickable = drillEnabled && val !== 0;
                      return (
                        <td
                          key={i}
                          className={cn(
                            "px-3 py-2 text-right tabular-nums",
                            val < 0 && "text-destructive",
                            isClickable && "cursor-pointer hover:bg-primary/10 hover:underline",
                          )}
                          onClick={
                            isClickable
                              ? () => setDrill({ anno: annoCol, codice: v.codice, label: v.label })
                              : undefined
                          }
                          title={
                            isClickable
                              ? `Apri dettaglio ${v.label} · ${annoCol} (anno intero)`
                              : undefined
                          }
                        >
                          {val !== 0 ? formatCurrency(val) : "—"}
                        </td>
                      );
                    })}
                    <td className={cn("px-3 py-2 text-right tabular-nums text-xs font-medium", deltaColor)}>
                      {delta !== null ? formatPctDelta(delta) : "—"}
                    </td>
                    <td className="px-2 py-2 text-center">{trendIcon}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </CardContent>

      <DettaglioVoceMeseSheet
        open={drill !== null}
        onOpenChange={(v) => { if (!v) setDrill(null); }}
        anno={drill?.anno ?? new Date().getFullYear()}
        mese={null}
        codice={drill?.codice ?? null}
        labelFallback={drill?.label}
      />
    </Card>
  );
}
