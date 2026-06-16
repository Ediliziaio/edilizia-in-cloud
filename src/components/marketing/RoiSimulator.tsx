/**
 * RoiSimulator — il CORE del Simulatore ROI di vendita.
 *
 * Componente riusabile: montato sia nella pagina standalone (RoiSimulatorPage)
 * sia in un Dialog/Sheet lanciato dal deal (OpportunityDetailDialog).
 *
 * - Input controllati con useState; ricalcolo live via useMemo (niente
 *   setState-in-effect). Modello di calcolo in `@/lib/roiSimulator`.
 * - Risultato visivo premium (accent primary/success): card "Ti costa oggi" vs
 *   "Con EdiliziaInCloud", hero "Guadagni €X/anno", barre prima/dopo, payback,
 *   breakdown software/tempo/errori. Numeri it-IT EUR, mai NaN.
 * - Espone `value`/`onChange` (controlled opzionale), `onSave` e gli agganci
 *   per l'export PDF/email (round 2, placeholder disabilitati).
 */
import { useMemo, useState } from "react";
import {
  computeRoi,
  DEFAULT_INPUTS,
  type RoiInputs,
  type RoiResults,
} from "@/lib/roiSimulator";
import { formatCurrency } from "@/lib/formatters";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Cell,
  ResponsiveContainer,
  LabelList,
} from "recharts";
import {
  TrendingUp,
  TrendingDown,
  Wallet,
  Clock,
  AlertTriangle,
  Settings2,
  ChevronDown,
  Loader2,
  Save,
  FileDown,
  Mail,
  Sparkles,
  Timer,
} from "lucide-react";

const SAVINGS_GREEN = "hsl(var(--success))";
const COST_RED = "hsl(0 72% 51%)";

interface NumberFieldProps {
  label: string;
  value: number;
  onChange: (v: number) => void;
  icon?: React.ReactNode;
  suffix?: string;
  step?: number;
  hint?: string;
}

function NumberField({ label, value, onChange, icon, suffix, step = 1, hint }: NumberFieldProps) {
  return (
    <div className="space-y-1">
      <Label className="text-xs text-muted-foreground flex items-center gap-1.5">
        {icon}
        {label}
      </Label>
      <div className="relative">
        <Input
          type="number"
          inputMode="decimal"
          min={0}
          step={step}
          value={Number.isFinite(value) ? value : 0}
          onChange={(e) => {
            const next = parseFloat(e.target.value);
            onChange(Number.isFinite(next) && next >= 0 ? next : 0);
          }}
          className="h-9 pr-12"
        />
        {suffix && (
          <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">
            {suffix}
          </span>
        )}
      </div>
      {hint && <p className="text-[11px] text-muted-foreground/80">{hint}</p>}
    </div>
  );
}

interface RoiSimulatorProps {
  /** Scenario controllato (opzionale). Se assente, il componente è autonomo. */
  value?: RoiInputs;
  onChange?: (inputs: RoiInputs) => void;
  /** Valore iniziale quando il componente è non-controllato. */
  initialInputs?: RoiInputs;
  /** Nome cliente mostrato e salvato (pre-compilato dal deal). */
  clientName?: string;
  onClientNameChange?: (name: string) => void;
  /** Callback "Salva simulazione". Riceve inputs+results calcolati. */
  onSave?: (payload: { inputs: RoiInputs; results: RoiResults; clientName: string }) => void;
  saving?: boolean;
  /** Mostra il campo "Nome cliente" in testa (default true). */
  showClientName?: boolean;
  /**
   * Agganci export round 2 (PDF/email). Lasciati come placeholder disabilitati
   * finché il round 2 non li implementa. Se passati, i bottoni si attivano.
   */
  onExportPdf?: (payload: { inputs: RoiInputs; results: RoiResults; clientName: string }) => void;
  onSendEmail?: (payload: { inputs: RoiInputs; results: RoiResults; clientName: string }) => void;
}

export function RoiSimulator({
  value,
  onChange,
  initialInputs,
  clientName: clientNameProp,
  onClientNameChange,
  onSave,
  saving = false,
  showClientName = true,
  onExportPdf,
  onSendEmail,
}: RoiSimulatorProps) {
  // Stato non-controllato (fallback) se il parent non passa value/onChange.
  const [internalInputs, setInternalInputs] = useState<RoiInputs>(
    () => initialInputs ?? structuredClone(DEFAULT_INPUTS),
  );
  const [internalName, setInternalName] = useState(clientNameProp ?? "");
  const [advancedOpen, setAdvancedOpen] = useState(false);

  const inputs = value ?? internalInputs;
  const clientName = clientNameProp ?? internalName;

  const setInputs = (updater: (prev: RoiInputs) => RoiInputs) => {
    const next = updater(inputs);
    if (onChange) onChange(next);
    else setInternalInputs(next);
  };
  const setClientName = (name: string) => {
    if (onClientNameChange) onClientNameChange(name);
    else setInternalName(name);
  };

  // Ricalcolo LIVE — pura funzione, niente effetti.
  const results = useMemo(() => computeRoi(inputs), [inputs]);

  const guadagna = results.risparmioAnnuo > 0;

  const chartData = useMemo(
    () => [
      { label: "Oggi", value: Math.round(results.costoAttualeAnnuo), fill: COST_RED },
      { label: "Con EiC", value: Math.round(results.costoConEicAnnuo), fill: SAVINGS_GREEN },
    ],
    [results.costoAttualeAnnuo, results.costoConEicAnnuo],
  );

  const breakdown = [
    {
      key: "software",
      label: "Software / gestionali",
      icon: <Wallet className="h-4 w-4" />,
      oggi: results.softwareAnnuo,
      eic: 0,
    },
    {
      key: "tempo",
      label: "Tempo perso",
      icon: <Clock className="h-4 w-4" />,
      oggi: results.costoTempoAnnuo,
      eic: results.costoTempoConEic,
    },
    {
      key: "errori",
      label: "Errori e ritardi",
      icon: <AlertTriangle className="h-4 w-4" />,
      oggi: results.costoErroriAnnuo,
      eic: results.costoErroriConEic,
    },
  ];

  return (
    <TooltipProvider delayDuration={200}>
      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)]">
        {/* ───────────────── Colonna INPUT ───────────────── */}
        <Card className="border-muted">
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Settings2 className="h-4 w-4 text-primary" />
              La situazione attuale
            </CardTitle>
            <p className="text-xs text-muted-foreground">
              Compila i dati del cliente: il calcolo si aggiorna in tempo reale.
            </p>
          </CardHeader>
          <CardContent className="space-y-4">
            {showClientName && (
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">Nome cliente</Label>
                <Input
                  value={clientName}
                  onChange={(e) => setClientName(e.target.value)}
                  placeholder="Es. Edil Rossi S.r.l."
                  className="h-9"
                />
              </div>
            )}

            <NumberField
              label="Software / gestionali oggi"
              icon={<Wallet className="h-3.5 w-3.5" />}
              value={inputs.softwareMensile}
              onChange={(v) => setInputs((p) => ({ ...p, softwareMensile: v }))}
              suffix="€/mese"
              step={10}
            />

            {/* Ore perse / settimana — spacchettate per voce */}
            <div className="space-y-2 rounded-lg border bg-muted/20 p-3">
              <div className="flex items-center justify-between">
                <Label className="text-xs font-medium flex items-center gap-1.5">
                  <Clock className="h-3.5 w-3.5" />
                  Ore perse / settimana
                </Label>
                <Badge variant="secondary" className="text-[11px] tabular-nums">
                  {results.oreSettimanaTotali.toLocaleString("it-IT")} h tot.
                </Badge>
              </div>
              <div className="grid grid-cols-2 gap-2">
                {(
                  [
                    ["fatturazione", "Fatturazione & DDT"],
                    ["preventivi", "Preventivi"],
                    ["cantieri", "Gestione cantieri"],
                    ["ricercaDocumenti", "Ricerca documenti"],
                    ["doppieImmissioni", "Doppie immissioni"],
                  ] as const
                ).map(([key, label]) => (
                  <div key={key} className="space-y-1">
                    <Label className="text-[11px] text-muted-foreground">{label}</Label>
                    <div className="relative">
                      <Input
                        type="number"
                        inputMode="decimal"
                        min={0}
                        step={0.5}
                        value={inputs.hours[key]}
                        onChange={(e) => {
                          const next = parseFloat(e.target.value);
                          const safe = Number.isFinite(next) && next >= 0 ? next : 0;
                          setInputs((p) => ({ ...p, hours: { ...p.hours, [key]: safe } }));
                        }}
                        className="h-8 pr-7 text-sm"
                      />
                      <span className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-[11px] text-muted-foreground">
                        h
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <NumberField
                label="Costo orario medio"
                value={inputs.costoOrario}
                onChange={(v) => setInputs((p) => ({ ...p, costoOrario: v }))}
                suffix="€/h"
                step={1}
              />
              <NumberField
                label="Errori e ritardi"
                icon={<AlertTriangle className="h-3.5 w-3.5" />}
                value={inputs.erroriAnnui}
                onChange={(v) => setInputs((p) => ({ ...p, erroriAnnui: v }))}
                suffix="€/anno"
                step={100}
              />
            </div>

            <Separator />

            <NumberField
              label="Abbonamento EdiliziaInCloud"
              icon={<Sparkles className="h-3.5 w-3.5 text-primary" />}
              value={inputs.abbonamentoMensile}
              onChange={(v) => setInputs((p) => ({ ...p, abbonamentoMensile: v }))}
              suffix="€/mese"
              step={10}
              hint="Pre-compilato col piano reale; modificabile in trattativa."
            />

            {/* ── Assunzioni avanzate (regolabili) ── */}
            <Collapsible open={advancedOpen} onOpenChange={setAdvancedOpen}>
              <CollapsibleTrigger asChild>
                <button
                  type="button"
                  className="flex w-full items-center justify-between rounded-md px-1 py-1.5 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors"
                >
                  <span className="flex items-center gap-1.5">
                    <Settings2 className="h-3.5 w-3.5" />
                    Assunzioni avanzate
                  </span>
                  <ChevronDown
                    className={`h-4 w-4 transition-transform ${advancedOpen ? "rotate-180" : ""}`}
                  />
                </button>
              </CollapsibleTrigger>
              <CollapsibleContent className="space-y-4 pt-3">
                <SliderRow
                  label="Tempo recuperato con EdiliziaInCloud"
                  value={inputs.assumptions.risparmioTempo}
                  onChange={(v) =>
                    setInputs((p) => ({ ...p, assumptions: { ...p.assumptions, risparmioTempo: v } }))
                  }
                />
                <SliderRow
                  label="Errori / ritardi evitati"
                  value={inputs.assumptions.risparmioErrori}
                  onChange={(v) =>
                    setInputs((p) => ({ ...p, assumptions: { ...p.assumptions, risparmioErrori: v } }))
                  }
                />
                <div className="space-y-1">
                  <Label className="text-[11px] text-muted-foreground">
                    Settimane lavorative / anno
                  </Label>
                  <Input
                    type="number"
                    min={1}
                    max={52}
                    step={1}
                    value={inputs.assumptions.settimaneAnno}
                    onChange={(e) => {
                      const next = parseInt(e.target.value, 10);
                      const safe = Number.isFinite(next) && next > 0 ? Math.min(next, 52) : 1;
                      setInputs((p) => ({ ...p, assumptions: { ...p.assumptions, settimaneAnno: safe } }));
                    }}
                    className="h-8 w-24 text-sm"
                  />
                </div>
              </CollapsibleContent>
            </Collapsible>
          </CardContent>
        </Card>

        {/* ───────────────── Colonna RISULTATO ───────────────── */}
        <div className="space-y-4">
          {/* HERO */}
          <Card
            className={`overflow-hidden border-0 shadow-sm ${
              guadagna
                ? "bg-gradient-to-br from-success/15 via-success/5 to-transparent"
                : "bg-gradient-to-br from-muted/40 to-transparent"
            }`}
          >
            <CardContent className="p-5">
              <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                {guadagna ? (
                  <TrendingUp className="h-4 w-4 text-success" />
                ) : (
                  <TrendingDown className="h-4 w-4" />
                )}
                {guadagna ? "Con EdiliziaInCloud guadagni" : "Stima risparmio"}
              </div>
              <div
                className={`mt-1 text-4xl font-extrabold tabular-nums ${
                  guadagna ? "text-success" : "text-foreground"
                }`}
              >
                {formatCurrency(Math.max(0, results.risparmioAnnuo))}
                <span className="text-lg font-semibold text-muted-foreground"> / anno</span>
              </div>
              <p className="mt-1 text-sm text-muted-foreground">
                {guadagna ? (
                  <>
                    Pari a <strong>{formatCurrency(results.risparmioMensile)}/mese</strong> che torna
                    nelle tue tasche. EdiliziaInCloud non è un costo: si ripaga da solo.
                  </>
                ) : (
                  "Aumenta le ore perse o i costi attuali per vedere il guadagno reale."
                )}
              </p>

              {guadagna && results.paybackGiorni > 0 && (
                <div className="mt-3 inline-flex items-center gap-2 rounded-full bg-success/10 px-3 py-1.5 text-sm font-medium text-success">
                  <Timer className="h-4 w-4" />
                  Si ripaga in {results.paybackGiorni.toLocaleString("it-IT")}{" "}
                  {results.paybackGiorni === 1 ? "giorno" : "giorni"}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Oggi vs Con EiC — card + barre */}
          <div className="grid grid-cols-2 gap-3">
            <Card className="border-destructive/20 bg-destructive/[0.03]">
              <CardContent className="p-4">
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Ti costa oggi
                </p>
                <p className="mt-1 text-2xl font-bold tabular-nums text-foreground">
                  {formatCurrency(results.costoAttualeAnnuo)}
                </p>
                <p className="text-[11px] text-muted-foreground">all'anno, senza cambiare nulla</p>
              </CardContent>
            </Card>
            <Card className="border-success/30 bg-success/[0.04]">
              <CardContent className="p-4">
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Con EdiliziaInCloud
                </p>
                <p className="mt-1 text-2xl font-bold tabular-nums text-success">
                  {formatCurrency(results.costoConEicAnnuo)}
                </p>
                <p className="text-[11px] text-muted-foreground">
                  abbonamento + tempo ed errori ridotti
                </p>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardContent className="p-4">
              <p className="mb-2 text-xs font-medium text-muted-foreground">Confronto costo annuo</p>
              <div className="h-[140px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={chartData} margin={{ top: 20, right: 8, left: 8, bottom: 0 }}>
                    <XAxis
                      dataKey="label"
                      axisLine={false}
                      tickLine={false}
                      tick={{ fontSize: 12, fill: "hsl(var(--muted-foreground))" }}
                    />
                    <YAxis hide />
                    <Bar dataKey="value" radius={[6, 6, 0, 0]} maxBarSize={90}>
                      {chartData.map((d) => (
                        <Cell key={d.label} fill={d.fill} />
                      ))}
                      <LabelList
                        dataKey="value"
                        position="top"
                        formatter={(v: number) => formatCurrency(v)}
                        style={{ fontSize: 12, fontWeight: 600, fill: "hsl(var(--foreground))" }}
                      />
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>

          {/* Breakdown */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Dove recuperi i soldi</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2.5">
              {breakdown.map((row) => {
                const delta = row.oggi - row.eic;
                return (
                  <div key={row.key} className="flex items-center gap-3">
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground">
                      {row.icon}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium leading-tight">{row.label}</p>
                      <p className="text-[11px] text-muted-foreground tabular-nums">
                        {formatCurrency(row.oggi)} → {formatCurrency(row.eic)}
                      </p>
                    </div>
                    <Badge
                      variant="outline"
                      className={`shrink-0 tabular-nums ${
                        delta > 0 ? "border-success/40 text-success" : "text-muted-foreground"
                      }`}
                    >
                      {delta > 0 ? "−" : ""}
                      {formatCurrency(Math.abs(delta))}
                    </Badge>
                  </div>
                );
              })}
            </CardContent>
          </Card>

          {/* Azioni: Salva + Export (PDF/email = round 2) */}
          <div className="flex flex-wrap items-center gap-2">
            {onSave && (
              <Button
                onClick={() => onSave({ inputs, results, clientName })}
                disabled={saving}
                className="gap-2"
              >
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                Salva simulazione
              </Button>
            )}

            {/* ── Agganci ROUND 2 (PDF + email). Disabilitati finché non implementati. ── */}
            <Tooltip>
              <TooltipTrigger asChild>
                <span>
                  <Button
                    variant="outline"
                    className="gap-2"
                    disabled={!onExportPdf}
                    onClick={() => onExportPdf?.({ inputs, results, clientName })}
                  >
                    <FileDown className="h-4 w-4" />
                    Esporta PDF
                  </Button>
                </span>
              </TooltipTrigger>
              {!onExportPdf && <TooltipContent>In arrivo: report PDF per il cliente</TooltipContent>}
            </Tooltip>

            <Tooltip>
              <TooltipTrigger asChild>
                <span>
                  <Button
                    variant="outline"
                    className="gap-2"
                    disabled={!onSendEmail}
                    onClick={() => onSendEmail?.({ inputs, results, clientName })}
                  >
                    <Mail className="h-4 w-4" />
                    Invia via email
                  </Button>
                </span>
              </TooltipTrigger>
              {!onSendEmail && <TooltipContent>In arrivo: invio email al cliente</TooltipContent>}
            </Tooltip>
          </div>
        </div>
      </div>
    </TooltipProvider>
  );
}

interface SliderRowProps {
  label: string;
  value: number;
  onChange: (v: number) => void;
}

function SliderRow({ label, value, onChange }: SliderRowProps) {
  const pctValue = Math.round((Number.isFinite(value) ? value : 0) * 100);
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <Label className="text-[11px] text-muted-foreground">{label}</Label>
        <span className="text-xs font-medium tabular-nums">{pctValue}%</span>
      </div>
      <Slider
        value={[pctValue]}
        min={0}
        max={100}
        step={5}
        onValueChange={(vals) => onChange((vals[0] ?? 0) / 100)}
      />
    </div>
  );
}

export default RoiSimulator;
