import { useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import {
  usePianoIndustriale,
  type PianoPeriodo,
  type PianoResult,
  type PianoScenario,
} from "@/hooks/controlloGestione/usePianoIndustriale";
import { useScenari } from "@/hooks/controlloGestione/useScenari";
import { AssumptionEditor } from "@/components/controllo-gestione/ui/AssumptionEditor";
import { PianoChart } from "@/components/controllo-gestione/ui/PianoChart";
import { ChartSkeleton } from "@/components/controllo-gestione/skeletons/ChartSkeleton";
import { ErrorBlock } from "@/components/controllo-gestione/ui/ErrorBlock";
import { EmptyState } from "@/components/controllo-gestione/ui/EmptyState";
import { Skeleton } from "@/components/ui/skeleton";
import { Sparkles, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import { queryKeys } from "@/lib/queryKeys";
import { formatCurrency, formatCurrencyCompact } from "@/lib/formatters";
import { cn } from "@/lib/utils";

interface TabPianoIndustrialeProps {
  scenarioId: string | null;
}

function isNoScenarioError(err: unknown): boolean {
  if (!err) return false;
  const msg =
    err instanceof Error
      ? err.message
      : String((err as { message?: string })?.message ?? err);
  return /scenario/i.test(msg) && /(non trov|esegui bootstrap|base)/i.test(msg);
}

const SCENARI_BASE: PianoScenario[] = ["prudente", "base", "aggressivo"];

function scenarioLabel(s: PianoScenario | string): string {
  switch (s) {
    case "prudente":
      return "Prudente";
    case "base":
      return "Base";
    case "aggressivo":
      return "Aggressivo";
    default:
      return s;
  }
}

function formatPctDelta(delta: number | null): string {
  if (delta === null || !Number.isFinite(delta)) return "—";
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

function formatPctValue(v: number): string {
  if (!Number.isFinite(v)) return "—";
  return `${new Intl.NumberFormat("it-IT", {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  }).format(v)}%`;
}

function ratingTone(score?: number): { bg: string; text: string } {
  if (score === undefined || score === null) {
    return { bg: "bg-muted", text: "text-muted-foreground" };
  }
  if (score >= 75) return { bg: "bg-emerald-100", text: "text-emerald-700" };
  if (score >= 50) return { bg: "bg-amber-100", text: "text-amber-700" };
  return { bg: "bg-rose-100", text: "text-rose-700" };
}

export function TabPianoIndustriale({ scenarioId }: TabPianoIndustrialeProps) {
  const baseQuery = usePianoIndustriale("base", 5);
  const scenariQuery = useScenari();
  const [whatIf, setWhatIf] = useState<PianoResult | null>(null);
  const [scenarioAttivo, setScenarioAttivo] = useState<PianoScenario>("base");
  const [bootstrapping, setBootstrapping] = useState(false);
  const qc = useQueryClient();

  const piano = whatIf ?? baseQuery.data ?? null;
  const noScenario = baseQuery.isError && isNoScenarioError(baseQuery.error);

  const handleBootstrap = async () => {
    setBootstrapping(true);
    try {
      const { data, error } = await supabase.functions.invoke<{
        already_bootstrapped: boolean;
        scenari_creati: number;
      }>("cg-bootstrap-scenari", { body: { orizzonte: 5 } });
      if (error) throw error;
      if (data?.already_bootstrapped) {
        toast.info("Scenari già presenti — ricarico");
      } else {
        toast.success(`Creati ${data?.scenari_creati ?? 3} scenari di base`);
      }
      await qc.invalidateQueries({ queryKey: queryKeys.controlloGestione.piano("base", 5) });
      await baseQuery.refetch();
    } catch (e) {
      toast.error(`Errore creazione scenari: ${(e as Error).message ?? "sconosciuto"}`);
    } finally {
      setBootstrapping(false);
    }
  };

  // Loading globale
  if (baseQuery.isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-32 w-full rounded-2xl" />
        <Skeleton className="h-72 w-full rounded-2xl" />
        <Skeleton className="h-48 w-full rounded-2xl" />
        <ChartSkeleton />
      </div>
    );
  }

  if (noScenario) {
    return (
      <Card className="rounded-2xl">
        <CardContent className="pt-6">
          <EmptyState
            title="Nessuno scenario configurato"
            description="Per generare le proiezioni servono almeno 3 scenari di base (prudente, base, aggressivo). Possiamo crearli automaticamente partendo dai tuoi dati storici."
            ctaLabel={bootstrapping ? "Creazione in corso…" : "Crea scenari di base"}
            onCta={bootstrapping ? undefined : handleBootstrap}
            icon={
              bootstrapping ? (
                <Loader2 className="h-6 w-6 animate-spin" />
              ) : (
                <Sparkles className="h-6 w-6 text-orange-500" />
              )
            }
          />
        </CardContent>
      </Card>
    );
  }

  if (baseQuery.isError && !whatIf) {
    return <ErrorBlock onRetry={() => baseQuery.refetch()} />;
  }

  if (!piano || piano.periodi.length === 0) {
    return (
      <EmptyState
        title="Nessuna proiezione disponibile"
        description="Configura uno scenario di piano industriale per generare la proiezione."
      />
    );
  }

  // Lista scenari per ToggleGroup (preferisci quelli da DB se disponibili).
  const scenariDisponibili: PianoScenario[] = (() => {
    const fromDb = (scenariQuery.data ?? [])
      .map((s) => s.scenario)
      .filter((s): s is PianoScenario =>
        (SCENARI_BASE as string[]).includes(s),
      );
    return fromDb.length > 0 ? Array.from(new Set(fromDb)) : SCENARI_BASE;
  })();

  return (
    <div className="space-y-4">
      <PianoHeader
        piano={piano}
        scenarioAttivo={scenarioAttivo}
        scenariDisponibili={scenariDisponibili}
        onChangeScenario={setScenarioAttivo}
      />
      <CETablePrev periodi={piano.periodi} />
      <SPTablePrev periodi={piano.periodi} />
      <IndiciPrev periodi={piano.periodi} />
      <Card className="rounded-2xl">
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Andamento grafico</CardTitle>
        </CardHeader>
        <CardContent>
          <PianoChart periodi={piano.periodi} />
        </CardContent>
      </Card>

      <Card className="rounded-2xl">
        <CardContent className="pt-4">
          <Accordion type="single" collapsible>
            <AccordionItem value="assumptions" className="border-0">
              <AccordionTrigger className="text-base font-semibold hover:no-underline">
                Personalizza assunzioni
              </AccordionTrigger>
              <AccordionContent>
                <div className="pt-2">
                  <AssumptionEditor
                    scenarioId={scenarioId}
                    onResult={setWhatIf}
                    disabled={bootstrapping}
                  />
                </div>
              </AccordionContent>
            </AccordionItem>
          </Accordion>
        </CardContent>
      </Card>
    </div>
  );
}

// ── Header + KPI riepilogo ─────────────────────────────────────────────────

function PianoHeader({
  piano,
  scenarioAttivo,
  scenariDisponibili,
  onChangeScenario,
}: {
  piano: PianoResult;
  scenarioAttivo: PianoScenario;
  scenariDisponibili: PianoScenario[];
  onChangeScenario: (s: PianoScenario) => void;
}) {
  const periodi = piano.periodi;
  const annoBase = periodi[0];
  const annoFinale = periodi[periodi.length - 1];

  const proiezioni = periodi.filter((p) => p.tipo === "proiezione");
  const ebitdaCumulato = proiezioni.reduce((acc, p) => acc + p.ebitda, 0);
  const ricaviProiezione = proiezioni.reduce((acc, p) => acc + p.ricavi, 0);
  const ebitdaMediaPct =
    ricaviProiezione > 0 ? (ebitdaCumulato / ricaviProiezione) * 100 : 0;

  const investimentiTotali = proiezioni.reduce(
    (acc, p) => acc + (p.investimento_anno ?? 0),
    0,
  );

  const ricaviDelta = annoBase
    ? calcDeltaPct(annoFinale.ricavi, annoBase.ricavi)
    : null;
  const mpDelta = annoBase
    ? calcDeltaPct(annoFinale.mezzi_propri, annoBase.mezzi_propri)
    : null;

  const ratingScore = annoFinale.rating_score ?? null;
  const ratingClasse = annoFinale.rating_classe ?? "—";
  const tone = ratingTone(ratingScore ?? undefined);

  return (
    <Card className="rounded-2xl">
      <CardHeader className="pb-3">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <CardTitle className="text-base">
              Scenario {scenarioLabel(scenarioAttivo)} · {piano.meta.orizzonte} anni
            </CardTitle>
            <p className="text-xs text-muted-foreground">
              Anno base {piano.meta.anno_base} · Orizzonte fino al{" "}
              {annoFinale.anno}
            </p>
          </div>
          <ToggleGroup
            type="single"
            value={scenarioAttivo}
            onValueChange={(v) => v && onChangeScenario(v as PianoScenario)}
            className="justify-start"
          >
            {scenariDisponibili.map((s) => (
              <ToggleGroupItem key={s} value={s} variant="outline" size="sm">
                {scenarioLabel(s)}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
        </div>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <KpiSint
            label="Ricavi finali"
            value={formatCurrency(annoFinale.ricavi)}
            sub={ricaviDelta !== null ? `${formatPctDelta(ricaviDelta)} vs anno 0` : undefined}
            tone={ricaviDelta !== null && ricaviDelta >= 0 ? "green" : "neutral"}
          />
          <KpiSint
            label="EBITDA cumulato"
            value={formatCurrency(ebitdaCumulato)}
            sub={`Media ${formatPctValue(ebitdaMediaPct)} sui ricavi`}
            tone={ebitdaCumulato >= 0 ? "green" : "red"}
          />
          <KpiSint
            label="Investimenti totali"
            value={formatCurrency(investimentiTotali)}
            sub={`${proiezioni.length} anni di piano`}
            tone="blue"
          />
          <KpiSint
            label="Mezzi propri finali"
            value={formatCurrency(annoFinale.mezzi_propri)}
            sub={mpDelta !== null ? `${formatPctDelta(mpDelta)} vs anno 0` : undefined}
            tone={mpDelta !== null && mpDelta >= 0 ? "green" : "neutral"}
          />
          <div className={cn("rounded-xl border px-4 py-3", tone.bg)}>
            <div className="text-xs text-muted-foreground">Rating finale</div>
            <div className={cn("mt-0.5 text-lg font-bold", tone.text)}>
              {ratingClasse}
            </div>
            <div className="text-xs text-muted-foreground">
              Score {ratingScore !== null ? Math.round(ratingScore) : "—"} / 100
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function KpiSint({
  label,
  value,
  sub,
  tone,
}: {
  label: string;
  value: string;
  sub?: string;
  tone: "green" | "red" | "blue" | "neutral";
}) {
  const bg =
    tone === "green"
      ? "bg-emerald-50"
      : tone === "red"
        ? "bg-rose-50"
        : tone === "blue"
          ? "bg-blue-50"
          : "bg-muted/30";
  const text =
    tone === "green"
      ? "text-emerald-700"
      : tone === "red"
        ? "text-rose-700"
        : tone === "blue"
          ? "text-blue-700"
          : "text-foreground";
  return (
    <div className={cn("rounded-xl border px-4 py-3", bg)}>
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className={cn("mt-0.5 text-lg font-bold tabular-nums", text)}>
        {value}
      </div>
      {sub && <div className="text-xs text-muted-foreground">{sub}</div>}
    </div>
  );
}

// ── Tabella CE Previsionale ────────────────────────────────────────────────

interface CERigaPrev {
  label: string;
  livello: "voce" | "subtot" | "subtot_grasso";
  pick: (p: PianoPeriodo) => number;
}

const CE_RIGHE: CERigaPrev[] = [
  { label: "Ricavi", livello: "voce", pick: (p) => p.ricavi },
  { label: "Costi variabili", livello: "voce", pick: (p) => p.costi_var },
  { label: "Costi fissi", livello: "voce", pick: (p) => p.costi_fissi },
  { label: "EBITDA", livello: "subtot", pick: (p) => p.ebitda },
  { label: "Ammortamenti", livello: "voce", pick: (p) => p.ammortamenti },
  {
    label: "EBIT",
    livello: "subtot",
    pick: (p) => p.ebitda - p.ammortamenti,
  },
  { label: "Oneri finanziari", livello: "voce", pick: (p) => p.oneri_finanziari },
  { label: "Utile", livello: "subtot_grasso", pick: (p) => p.utile },
];

function CETablePrev({ periodi }: { periodi: PianoPeriodo[] }) {
  return (
    <Card className="rounded-2xl">
      <CardHeader className="pb-3">
        <CardTitle className="text-base">Conto Economico Previsionale</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto rounded-xl border">
          <table className="w-full border-collapse text-sm">
            <thead className="bg-muted/40">
              <tr>
                <th className="min-w-[180px] px-3 py-2 text-left text-xs font-medium text-muted-foreground">
                  Voce
                </th>
                {periodi.map((p) => (
                  <AnnoHeader key={p.t} periodo={p} />
                ))}
              </tr>
            </thead>
            <tbody>
              {CE_RIGHE.map((riga) => (
                <CERigaPrevRow key={riga.label} riga={riga} periodi={periodi} />
              ))}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}

function AnnoHeader({ periodo }: { periodo: PianoPeriodo }) {
  return (
    <th className="min-w-[120px] px-3 py-2 text-right text-xs font-medium text-muted-foreground">
      <div className="flex flex-col items-end gap-1">
        <span className="text-sm font-semibold text-foreground">
          {periodo.anno}
        </span>
        <Badge
          variant="outline"
          className={cn(
            "text-[10px]",
            periodo.tipo === "consuntivo"
              ? "border-muted-foreground/30 text-muted-foreground"
              : "border-orange-300 bg-orange-50 text-orange-700",
          )}
        >
          {periodo.tipo === "consuntivo" ? "Consuntivo" : "Proiezione"}
        </Badge>
      </div>
    </th>
  );
}

function CERigaPrevRow({
  riga,
  periodi,
}: {
  riga: CERigaPrev;
  periodi: PianoPeriodo[];
}) {
  const isSub = riga.livello === "subtot";
  const isGrasso = riga.livello === "subtot_grasso";

  return (
    <tr
      className={cn(
        "border-t",
        isSub && "bg-muted/50 font-semibold",
        isGrasso && "bg-primary/5 font-bold",
      )}
    >
      <td className="px-3 py-2">{riga.label}</td>
      {periodi.map((p, i) => {
        const val = riga.pick(p);
        const prev = i > 0 ? riga.pick(periodi[i - 1]) : null;
        const delta = prev !== null ? calcDeltaPct(val, prev) : null;
        return (
          <td key={p.t} className="px-3 py-2 text-right tabular-nums">
            <div className={cn(val < 0 && "text-destructive")}>
              {formatCurrencyCompact(val)}
            </div>
            {delta !== null && (
              <div className="text-[10px] text-muted-foreground">
                {formatPctDelta(delta)}
              </div>
            )}
          </td>
        );
      })}
    </tr>
  );
}

// ── Tabella SP Previsionale ────────────────────────────────────────────────

interface SPRigaPrev {
  label: string;
  livello: "voce" | "subtot";
  pick: (p: PianoPeriodo) => number;
  showDelta?: boolean;
}

const SP_RIGHE: SPRigaPrev[] = [
  { label: "Cespiti totali", livello: "voce", pick: (p) => p.cespiti },
  { label: "Mezzi propri", livello: "subtot", pick: (p) => p.mezzi_propri, showDelta: true },
  { label: "Debito MLT", livello: "voce", pick: (p) => p.debito_mlt },
];

function SPTablePrev({ periodi }: { periodi: PianoPeriodo[] }) {
  return (
    <Card className="rounded-2xl">
      <CardHeader className="pb-3">
        <CardTitle className="text-base">Stato Patrimoniale Previsionale</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto rounded-xl border">
          <table className="w-full border-collapse text-sm">
            <thead className="bg-muted/40">
              <tr>
                <th className="min-w-[180px] px-3 py-2 text-left text-xs font-medium text-muted-foreground">
                  Voce
                </th>
                {periodi.map((p) => (
                  <AnnoHeader key={p.t} periodo={p} />
                ))}
              </tr>
            </thead>
            <tbody>
              {SP_RIGHE.map((riga) => (
                <tr
                  key={riga.label}
                  className={cn(
                    "border-t",
                    riga.livello === "subtot" && "bg-muted/50 font-semibold",
                  )}
                >
                  <td className="px-3 py-2">{riga.label}</td>
                  {periodi.map((p, i) => {
                    const val = riga.pick(p);
                    const prev = i > 0 ? riga.pick(periodi[i - 1]) : null;
                    const delta =
                      riga.showDelta && prev !== null
                        ? calcDeltaPct(val, prev)
                        : null;
                    return (
                      <td key={p.t} className="px-3 py-2 text-right tabular-nums">
                        <div className={cn(val < 0 && "text-destructive")}>
                          {formatCurrencyCompact(val)}
                        </div>
                        {delta !== null && (
                          <div className="text-[10px] text-muted-foreground">
                            {formatPctDelta(delta)}
                          </div>
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}

// ── Indici previsionali ────────────────────────────────────────────────────

interface IndicePrev {
  label: string;
  /** Calcolo dell'indice come % a partire dal periodo. */
  calc: (p: PianoPeriodo) => number;
}

const INDICI: IndicePrev[] = [
  {
    label: "ROE %",
    calc: (p) => (p.mezzi_propri !== 0 ? (p.utile / p.mezzi_propri) * 100 : 0),
  },
  {
    label: "ROS %",
    calc: (p) => (p.ricavi !== 0 ? (p.utile / p.ricavi) * 100 : 0),
  },
  {
    label: "Margine EBITDA %",
    calc: (p) => (p.ricavi !== 0 ? (p.ebitda / p.ricavi) * 100 : 0),
  },
  {
    label: "Indipendenza %",
    calc: (p) => {
      const den = p.mezzi_propri + p.debito_mlt;
      return den !== 0 ? (p.mezzi_propri / den) * 100 : 0;
    },
  },
];

function IndiciPrev({ periodi }: { periodi: PianoPeriodo[] }) {
  const indiciCalcolati = useMemo(
    () =>
      INDICI.map((ind) => ({
        label: ind.label,
        valori: periodi.map((p) => ind.calc(p)),
      })),
    [periodi],
  );

  return (
    <Card className="rounded-2xl">
      <CardHeader className="pb-3">
        <CardTitle className="text-base">Indici di Bilancio Previsionali</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto rounded-xl border">
          <table className="w-full border-collapse text-sm">
            <thead className="bg-muted/40">
              <tr>
                <th className="min-w-[180px] px-3 py-2 text-left text-xs font-medium text-muted-foreground">
                  Indice
                </th>
                {periodi.map((p) => (
                  <th
                    key={p.t}
                    className="min-w-[100px] px-3 py-2 text-right text-xs font-medium text-muted-foreground"
                  >
                    {p.anno}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {indiciCalcolati.map((ind) => (
                <tr key={ind.label} className="border-t">
                  <td className="px-3 py-2 font-medium">{ind.label}</td>
                  {ind.valori.map((v, i) => (
                    <td
                      key={i}
                      className={cn(
                        "px-3 py-2 text-right tabular-nums",
                        v < 0 && "text-destructive",
                      )}
                    >
                      {formatPctValue(v)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}
