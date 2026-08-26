import { useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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
import {
  AlertTriangle,
  ArrowDown,
  ArrowRight,
  ArrowUp,
  CheckCircle2,
  FileSearch,
  Lightbulb,
  ShieldCheck,
} from "lucide-react";
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
type QualityTone = "ok" | "warning" | "danger";
type CeActionTone = "success" | "warning" | "danger" | "info";

interface QualityCheck {
  id: string;
  label: string;
  description: string;
  tone: QualityTone;
}

interface CeAction {
  id: string;
  title: string;
  body: string;
  tone: CeActionTone;
  href?: string;
  cta?: string;
}

const MESI_LABELS = [
  "Gen", "Feb", "Mar", "Apr", "Mag", "Giu",
  "Lug", "Ago", "Set", "Ott", "Nov", "Dic",
];

// Codici di voci di costo: per queste un delta positivo è "negativo" (rosso).
const CODICI_COSTO = new Set([
  "03", "04", "05", "06", "07", "08", "09", "10", "11", "14", "15",
]);

const VISTE: Vista[] = ["consuntivo", "mensile", "confronto"];

function parseVista(value: string | null): Vista {
  return VISTE.includes(value as Vista) ? (value as Vista) : "consuntivo";
}

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

function formatPercent(value: number): string {
  return new Intl.NumberFormat("it-IT", {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  }).format(value);
}

export function TabCERiclassificato({ anno, meseDa, meseA }: TabCERiclassificatoProps) {
  const [searchParams, setSearchParams] = useSearchParams();
  const vista = parseVista(searchParams.get("ceView"));
  const [consuntivoDrill, setConsuntivoDrill] = useState<{
    mese: number | null;
    codice: string;
    label: string;
  } | null>(null);
  const ce = useCEriclassificato(anno, meseDa, meseA);
  const bep = useBEP(anno);
  const { insights } = useControlloGestioneInsights(anno);

  const handleVistaChange = (value: string) => {
    if (!value || !VISTE.includes(value as Vista)) return;
    const next = new URLSearchParams(searchParams);
    if (value === "consuntivo") {
      next.delete("ceView");
    } else {
      next.set("ceView", value);
    }
    setSearchParams(next);
  };

  const allZero = useMemo(() => {
    if (!ce.data) return false;
    return ce.data.voci.every((v) => v.valore === 0);
  }, [ce.data]);

  const periodoLabel = meseDa === 1 && meseA === 12
    ? "Anno completo"
    : meseDa === meseA
      ? MESI_LABELS[meseDa - 1]
      : `${MESI_LABELS[meseDa - 1]}-${MESI_LABELS[meseA - 1]}`;

  const ViewSwitcher = (
    <ToggleGroup
      type="single"
      value={vista}
      onValueChange={handleVistaChange}
      className="justify-start overflow-x-auto"
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
    // Leva operativa: DOL = margine di contribuzione ÷ EBIT, sulla stessa
    // scala (voce D) così numeratore e denominatore hanno lo stesso perimetro.
    // Ha senso solo con EBIT positivo.
    const margineOperativo = findVoce(ce.data.voci, "D");
    const dol = ebit > 0 && margineOperativo > 0 ? margineOperativo / ebit : null;
    const ebitdaPctPil = pil !== 0 ? (ebitda / pil) * 100 : 0;
    const ebitPctPil = pil !== 0 ? (ebit / pil) * 100 : 0;
    const costoMaterie = findVoce(ce.data.voci, "B");
    const costoPersonale = findVoce(ce.data.voci, "06");
    const qualityChecks = buildQualityChecks({
      hasCedolini: ce.data.meta.has_cedolini,
      periodoLabel,
      ebitdaPctPil,
      costoMaterie,
      costoPersonale,
    });
    const ceActions = buildCeActions({
      ebitdaPctPil,
      ebitPctPil,
      costoMaterie,
      costoPersonale,
      bepRaggiunto: bep.data?.gia_raggiunto,
      periodoLabel,
    });
    const canDrillConsuntivo = meseDa === meseA;

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
                  name: "Sintesi CFO",
                  columns: [
                    { header: "Voce", key: "label", width: 28 },
                    { header: "Valore", key: "value", width: 26 },
                    { header: "Nota", key: "note", width: 60 },
                  ],
                  rows: [
                    { label: "Periodo", value: periodoLabel, note: "Periodo selezionato in pagina" },
                    { label: "Ricavi", value: formatCurrency(ricavi), note: "Ricavi delle vendite" },
                    { label: "EBITDA", value: formatCurrency(ebitda), note: `${formatPercent(ebitdaPctPil)}% del PIL` },
                    { label: "EBIT", value: formatCurrency(ebit), note: `${formatPercent(ebitPctPil)}% del PIL` },
                    { label: "Utile", value: formatCurrency(utile), note: pil !== 0 ? `${formatPercent((utile / pil) * 100)}% del PIL` : "" },
                    ...ceActions.map((action) => ({
                      label: action.title,
                      value: action.tone,
                      note: action.body,
                    })),
                  ],
                }, {
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
        <CEExecutiveSummary
          periodoLabel={periodoLabel}
          ricavi={ricavi}
          ebitda={ebitda}
          utile={utile}
          ebitdaPctPil={ebitdaPctPil}
          qualityChecks={qualityChecks}
          actions={ceActions}
        />
        <InsightsPanel insights={insights} title="Cosa devi guardare per primo" />
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          <Card className="rounded-2xl lg:col-span-2">
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Conto Economico Riclassificato</CardTitle>
              {!canDrillConsuntivo && (
                <p className="text-xs text-muted-foreground">
                  Per vedere le fonti di ogni voce usa la vista Mensile o filtra un singolo mese.
                </p>
              )}
            </CardHeader>
            <CardContent>
              <CETable
                voci={ce.data.voci}
                isVoceClickable={(voce) =>
                  canDrillConsuntivo && isDrillDownEnabled(voce.codice) && voce.valore !== 0
                }
                onVoceClick={(voce) => {
                  setConsuntivoDrill({
                    mese: meseDa,
                    codice: voce.codice,
                    label: voce.label,
                  });
                }}
              />
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
              label="Leva operativa (DOL)"
              value={dol !== null ? `×${dol.toLocaleString("it-IT", { maximumFractionDigits: 1 })}` : "—"}
              sub={
                dol !== null
                  ? `ricavi −10% → EBIT −${Math.round(dol * 10)}%: più struttura hai, più l'utile oscilla`
                  : "con EBIT a zero o negativo non si calcola: prima si torna sopra lo zero"
              }
              tone="blue"
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
        <DettaglioVoceMeseSheet
          open={consuntivoDrill !== null}
          onOpenChange={(open) => {
            if (!open) setConsuntivoDrill(null);
          }}
          anno={anno}
          mese={consuntivoDrill?.mese ?? null}
          codice={consuntivoDrill?.codice ?? null}
          labelFallback={consuntivoDrill?.label}
        />
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
      <CEConfrontoView anno={anno} periodoLabel={periodoLabel} />
    </div>
  );
}

function CEExecutiveSummary({
  periodoLabel,
  ricavi,
  ebitda,
  utile,
  ebitdaPctPil,
  qualityChecks,
  actions,
}: {
  periodoLabel: string;
  ricavi: number;
  ebitda: number;
  utile: number;
  ebitdaPctPil: number;
  qualityChecks: QualityCheck[];
  actions: CeAction[];
}) {
  const worstTone = qualityChecks.some((check) => check.tone === "danger")
    ? "danger"
    : qualityChecks.some((check) => check.tone === "warning")
      ? "warning"
      : "ok";

  return (
    <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1.2fr)_minmax(320px,0.8fr)]">
      <Card className="rounded-2xl border-slate-200">
        <CardHeader className="pb-3">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <CardTitle className="flex items-center gap-2 text-base">
                <Lightbulb className="h-4 w-4 text-amber-600" />
                Sintesi CFO CE
              </CardTitle>
              <p className="mt-1 text-xs text-muted-foreground">
                Lettura direzionale del conto economico per {periodoLabel.toLowerCase()}.
              </p>
            </div>
            <Badge variant="outline" className="w-fit">
              {formatPercent(ebitdaPctPil)}% EBITDA/PIL
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <MiniMetric label="Ricavi" value={formatCurrency(ricavi)} tone="blue" />
            <MiniMetric label="EBITDA" value={formatCurrency(ebitda)} tone={ebitda >= 0 ? "green" : "red"} />
            <MiniMetric label="Utile" value={formatCurrency(utile)} tone={utile >= 0 ? "green" : "red"} />
          </div>
          <div className="grid grid-cols-1 gap-2 lg:grid-cols-3">
            {actions.map((action) => (
              <div
                key={action.id}
                className={cn(
                  "rounded-xl border p-3 text-sm",
                  action.tone === "danger" && "border-rose-200 bg-rose-50 text-rose-950",
                  action.tone === "warning" && "border-amber-200 bg-amber-50 text-amber-950",
                  action.tone === "success" && "border-emerald-200 bg-emerald-50 text-emerald-950",
                  action.tone === "info" && "border-blue-200 bg-blue-50 text-blue-950",
                )}
              >
                <div className="flex items-start gap-2">
                  {action.tone === "success" ? (
                    <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
                  ) : action.tone === "info" ? (
                    <FileSearch className="mt-0.5 h-4 w-4 shrink-0" />
                  ) : (
                    <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                  )}
                  <div>
                    <p className="font-semibold leading-tight">{action.title}</p>
                    <p className="mt-1 text-xs opacity-85">{action.body}</p>
                    {action.href && action.cta && (
                      <Button asChild variant="outline" size="sm" className="mt-2 h-8 bg-background/70">
                        <Link to={action.href}>
                          {action.cta}
                          <ArrowRight className="h-3.5 w-3.5" />
                        </Link>
                      </Button>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <Card className="rounded-2xl border-slate-200">
        <CardHeader className="pb-3">
          <div className="flex items-start justify-between gap-3">
            <div>
              <CardTitle className="flex items-center gap-2 text-base">
                <ShieldCheck className="h-4 w-4 text-emerald-600" />
                Qualità dati CE
              </CardTitle>
              <p className="mt-1 text-xs text-muted-foreground">
                Controlli rapidi prima di usare i numeri per banca o direzione.
              </p>
            </div>
            <QualityBadge tone={worstTone} />
          </div>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            {qualityChecks.map((check) => (
              <div key={check.id} className="flex items-start gap-2 rounded-lg border bg-background p-2.5">
                {check.tone === "ok" ? (
                  <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
                ) : (
                  <AlertTriangle className={cn(
                    "mt-0.5 h-4 w-4 shrink-0",
                    check.tone === "danger" ? "text-rose-600" : "text-amber-600",
                  )} />
                )}
                <div>
                  <p className="text-sm font-medium">{check.label}</p>
                  <p className="text-xs text-muted-foreground">{check.description}</p>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function MiniMetric({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone: "blue" | "green" | "red";
}) {
  return (
    <div className="rounded-xl border bg-background p-3">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className={cn(
        "mt-1 text-lg font-bold tabular-nums",
        tone === "blue" && "text-primary",
        tone === "green" && "text-emerald-600",
        tone === "red" && "text-destructive",
      )}>
        {value}
      </p>
    </div>
  );
}

function QualityBadge({ tone }: { tone: QualityTone }) {
  if (tone === "ok") {
    return <Badge className="bg-emerald-100 text-emerald-900 hover:bg-emerald-100">OK</Badge>;
  }
  if (tone === "danger") {
    return <Badge variant="destructive">Critico</Badge>;
  }
  return <Badge className="bg-amber-100 text-amber-900 hover:bg-amber-100">Da verificare</Badge>;
}

function buildQualityChecks({
  hasCedolini,
  periodoLabel,
  ebitdaPctPil,
  costoMaterie,
  costoPersonale,
}: {
  hasCedolini: boolean;
  periodoLabel: string;
  ebitdaPctPil: number;
  costoMaterie: number;
  costoPersonale: number;
}): QualityCheck[] {
  return [
    {
      id: "periodo",
      label: `Periodo: ${periodoLabel}`,
      description: periodoLabel === "Anno completo"
        ? "Confronti e BEP leggibili su anno intero."
        : "Il valore è filtrato: attenzione quando lo confronti con anni completi.",
      tone: periodoLabel === "Anno completo" ? "ok" : "warning",
    },
    {
      id: "cedolini",
      label: hasCedolini ? "Cedolini inclusi" : "Cedolini non rilevati",
      description: hasCedolini
        ? "Il costo personale entra nel CE dai dati paghe disponibili."
        : "Il costo personale potrebbe essere incompleto o stimato da altre fonti.",
      tone: hasCedolini ? "ok" : "warning",
    },
    {
      id: "margine",
      label: ebitdaPctPil > 45 ? "Margine molto alto" : "Margine operativo leggibile",
      description: ebitdaPctPil > 45
        ? "EBITDA/PIL sopra soglia: controlla che costi, paghe e ammortamenti siano completi."
        : "La marginalità non mostra anomalie evidenti rispetto alle soglie interne.",
      tone: ebitdaPctPil > 60 ? "danger" : ebitdaPctPil > 45 ? "warning" : "ok",
    },
    {
      id: "costi",
      label: costoMaterie === 0 || costoPersonale === 0 ? "Costi potenzialmente incompleti" : "Costi principali presenti",
      description: costoMaterie === 0 || costoPersonale === 0
        ? "Una voce primaria è a zero: verifica classificazioni e import contabili."
        : "Materie e personale sono valorizzati nel CE.",
      tone: costoMaterie === 0 || costoPersonale === 0 ? "warning" : "ok",
    },
  ];
}

function buildCeActions({
  ebitdaPctPil,
  ebitPctPil,
  costoMaterie,
  costoPersonale,
  bepRaggiunto,
  periodoLabel,
}: {
  ebitdaPctPil: number;
  ebitPctPil: number;
  costoMaterie: number;
  costoPersonale: number;
  bepRaggiunto?: boolean;
  periodoLabel: string;
}): CeAction[] {
  const actions: CeAction[] = [];

  if (periodoLabel !== "Anno completo") {
    actions.push({
      id: "periodo-parziale",
      tone: "warning",
      title: "Confronto parziale",
      body: "Stai guardando un periodo filtrato: usa forecast o stesso periodo prima di decidere.",
      href: "/azienda/controllo-gestione/budget",
      cta: "Apri budget",
    });
  }

  if (ebitdaPctPil > 45) {
    actions.push({
      id: "ebitda-alto",
      tone: ebitdaPctPil > 60 ? "danger" : "warning",
      title: "Verifica EBITDA",
      body: `EBITDA/PIL al ${formatPercent(ebitdaPctPil)}%: ottimo se reale, rischioso se mancano costi.`,
      href: "/azienda/controllo-gestione/health",
      cta: "Controlla dati",
    });
  }

  if (costoMaterie === 0 || costoPersonale === 0) {
    actions.push({
      id: "costi-zero",
      tone: "warning",
      title: "Controlla costi",
      body: "Almeno una voce primaria è a zero: può falsare margine e BEP.",
      href: "/azienda/controllo-gestione/configurazione",
      cta: "Configura voci",
    });
  }

  if (ebitPctPil < 5) {
    actions.push({
      id: "ebit-basso",
      tone: "danger",
      title: "EBIT sotto soglia",
      body: `EBIT/PIL al ${formatPercent(ebitPctPil)}%: sotto il 5% manca cuscinetto per imprevisti.`,
    });
  }

  if (bepRaggiunto) {
    actions.push({
      id: "bep-ok",
      tone: "success",
      title: "BEP raggiunto",
      body: "Hai coperto i costi fissi: da qui guarda liquidità, accantonamenti e margini commessa.",
      href: "/azienda/controllo-gestione/cash-flow",
      cta: "Vedi cassa",
    });
  }

  if (actions.length === 0) {
    actions.push({
      id: "monitoraggio",
      tone: "info",
      title: "Monitoraggio mensile",
      body: "Nessun blocco forte: aggiorna budget, note e classificazioni prima della chiusura mese.",
    });
  }

  return actions.slice(0, 3);
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
function CEConfrontoView({ anno, periodoLabel }: { anno: number; periodoLabel: string }) {
  const anni = useMemo(() => [anno - 2, anno - 1, anno], [anno]);
  const q = useCEMultiAnno(anni);

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
        <p className="text-xs text-muted-foreground">
          Lettura trend su dati disponibili. Se l'anno corrente non è chiuso, confronta anche
          budget/forecast prima di decidere.
        </p>
        {periodoLabel !== "Anno completo" && (
          <div className="mt-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
            Periodo selezionato: {periodoLabel}. Il confronto multi-anno resta su base annua:
            usa questa vista per trend, non per chiusura contabile.
          </div>
        )}
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
                    {valori.map((val, i) => (
                      <td
                        key={i}
                        className={cn(
                          "px-3 py-2 text-right tabular-nums",
                          val < 0 && "text-destructive",
                        )}
                      >
                        {val !== 0 ? formatCurrency(val) : "—"}
                      </td>
                    ))}
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
    </Card>
  );
}
