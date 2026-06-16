/**
 * RoiSimulator — il CORE del Simulatore ROI di vendita.
 *
 * Componente riusabile: montato sia nella pagina standalone (RoiSimulatorPage)
 * sia in un Dialog/Sheet lanciato dal deal (OpportunityDetailDialog).
 *
 * Evoluzione "controllo di gestione": la UI non vende più "ore perse" ma una
 * proposta di valore ancorata alle funzioni reali di EdiliziaInCloud, dove la
 * leva dominante è il **margine recuperato** (% del fatturato). Input raggruppati
 * in sezioni (azienda, tempo, costi, investimento, crescita opzionale, assunzioni
 * avanzate); risultato premium con hero "guadagni €X/anno", 3 stat (ROI, payback,
 * costo dell'inazione), barre prima/dopo e il breakdown "Da dove arriva il valore"
 * che enumera le leve `results.leve[]`.
 *
 * - Input controllati con useState; ricalcolo live via useMemo (niente
 *   setState-in-effect). Modello di calcolo in `@/lib/roiSimulator`.
 * - Espone `value`/`onChange` (controlled opzionale), `onSave` e gli agganci
 *   per l'export PDF/email. Numeri it-IT EUR, mai NaN.
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
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { ResellerPlan } from "@/hooks/useResellerPlans";
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
  Building2,
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
  Gauge,
  Wallet,
  ShieldCheck,
  Rocket,
  BarChart3,
} from "lucide-react";

const SAVINGS_GREEN = "hsl(var(--success))";
const COST_AMBER = "hsl(38 92% 50%)";

/** Icona per ciascuna leva del breakdown. */
const LEVA_ICONS: Record<RoiResults["leve"][number]["key"], React.ReactNode> = {
  margine: <Gauge className="h-4 w-4" />,
  tempo: <Clock className="h-4 w-4" />,
  rischio: <ShieldCheck className="h-4 w-4" />,
  software: <Wallet className="h-4 w-4" />,
  crescita: <Rocket className="h-4 w-4" />,
};

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
          className="h-9 pr-16"
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

interface IntegerFieldProps {
  label: string;
  value: number;
  onChange: (v: number) => void;
  icon?: React.ReactNode;
  suffix?: string;
  hint?: string;
}

/**
 * Campo per interi "grandi" (fatturato, errori, valore preventivo, abbonamenti)
 * con separatore delle migliaia it-IT mentre si digita ("100.000"), per una
 * percezione visiva migliore in trattativa. Input testuale (inputMode numeric):
 * mostra il valore formattato, salva solo le cifre. Placeholder quando = 0.
 */
function IntegerField({ label, value, onChange, icon, suffix, hint }: IntegerFieldProps) {
  return (
    <div className="space-y-1">
      <Label className="text-xs text-muted-foreground flex items-center gap-1.5">
        {icon}
        {label}
      </Label>
      <div className="relative">
        <Input
          type="text"
          inputMode="numeric"
          value={value > 0 ? new Intl.NumberFormat("it-IT").format(value) : ""}
          placeholder="0"
          onChange={(e) => onChange(Number(e.target.value.replace(/\D/g, "")) || 0)}
          className="h-9 pr-16 tabular-nums"
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

/** Titoletto di sezione del pannello input. */
function SectionTitle({ icon, children }: { icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
      {icon}
      {children}
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
  /** Referente (persona di contatto), opzionale — solo display/export, non salvato. */
  referente?: string;
  onReferenteChange?: (v: string) => void;
  /** Callback "Salva simulazione". Riceve inputs+results calcolati. */
  onSave?: (payload: { inputs: RoiInputs; results: RoiResults; clientName: string }) => void;
  saving?: boolean;
  /** Mostra il campo "Nome cliente" in testa (default true). */
  showClientName?: boolean;
  /** Agganci export PDF/email. Se passati, i bottoni si attivano. */
  onExportPdf?: (payload: { inputs: RoiInputs; results: RoiResults; clientName: string; referente: string }) => void;
  onSendEmail?: (payload: { inputs: RoiInputs; results: RoiResults; clientName: string; referente: string }) => void;
  /** Piani disponibili per il selettore canone (da useResellerPlans). */
  plans?: ResellerPlan[];
}

export function RoiSimulator({
  value,
  onChange,
  initialInputs,
  clientName: clientNameProp,
  onClientNameChange,
  referente = "",
  onReferenteChange,
  onSave,
  saving = false,
  showClientName = true,
  onExportPdf,
  onSendEmail,
  plans = [],
}: RoiSimulatorProps) {
  // Stato non-controllato (fallback) se il parent non passa value/onChange.
  // default-merge: tollera scenari salvati legacy/parziali (campi nuovi mancanti).
  const [internalInputs, setInternalInputs] = useState<RoiInputs>(
    () => ({ ...structuredClone(DEFAULT_INPUTS), ...(initialInputs ?? {}) }),
  );
  const [internalName, setInternalName] = useState(clientNameProp ?? "");
  const [advancedOpen, setAdvancedOpen] = useState(false);

  // Merge difensivo anche sul value controllato: una sim salvata prima di questo
  // round non ha i campi nuovi (fatturato, %margine, crescita…) → riempiamo i buchi.
  const inputs: RoiInputs = useMemo(
    () => ({ ...DEFAULT_INPUTS, ...(value ?? internalInputs) }),
    [value, internalInputs],
  );
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

  const guadagna = results.guadagnoNettoAnnuo > 0;

  const chartData = useMemo(
    () => [
      { label: "Restare com'è", value: Math.round(results.costoInazioneAnnuo), fill: COST_AMBER },
      { label: "Con EdiliziaInCloud", value: Math.round(results.canoneAnno), fill: SAVINGS_GREEN },
    ],
    [results.costoInazioneAnnuo, results.canoneAnno],
  );

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
          <CardContent className="space-y-5">
            {showClientName && (
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">Nome cliente</Label>
                  <Input
                    value={clientName}
                    onChange={(e) => setClientName(e.target.value)}
                    placeholder="Es. Edil Rossi S.r.l."
                    className="h-9"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">Referente (opzionale)</Label>
                  <Input
                    value={referente}
                    onChange={(e) => onReferenteChange?.(e.target.value)}
                    placeholder="Es. Mario Rossi"
                    className="h-9"
                  />
                </div>
              </div>
            )}

            {/* 1 ── La tua azienda ── */}
            <div className="space-y-3">
              <SectionTitle icon={<Building2 className="h-3.5 w-3.5" />}>La tua azienda</SectionTitle>
              <IntegerField
                label="Fatturato annuo"
                value={inputs.fatturatoAnnuo}
                onChange={(v) => setInputs((p) => ({ ...p, fatturatoAnnuo: v }))}
                suffix="€/anno"
                hint="Base del margine recuperato col controllo di gestione."
              />
              <div className="grid grid-cols-2 gap-3">
                <NumberField
                  label="Margine medio attuale"
                  value={inputs.marginePct}
                  onChange={(v) => setInputs((p) => ({ ...p, marginePct: v }))}
                  suffix="%"
                  step={1}
                />
                <IntegerField
                  label="Strumenti e abbonamenti oggi"
                  value={inputs.softwareMensile}
                  onChange={(v) => setInputs((p) => ({ ...p, softwareMensile: v }))}
                  suffix="€/mese"
                  hint="Gestionale, marketing, email/SMS/WhatsApp, CRM, timbrature, call center…"
                />
              </div>
            </div>

            <Separator />

            {/* 2 ── Tempo perso ogni settimana ── */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <SectionTitle icon={<Clock className="h-3.5 w-3.5" />}>
                  Tempo perso ogni settimana
                </SectionTitle>
                <Badge variant="secondary" className="text-[11px] tabular-nums">
                  {results.oreSettimana.toLocaleString("it-IT")} h totali
                </Badge>
              </div>
              <div className="grid grid-cols-2 gap-2 rounded-lg border bg-muted/20 p-3">
                {(
                  [
                    ["oreFatturazione", "Fatturazione & DDT"],
                    ["orePreventivi", "Preventivi"],
                    ["oreCantieri", "Gestione cantieri"],
                    ["oreRicercaDocumenti", "Ricerca documenti"],
                    ["oreDoppieImmissioni", "Doppie immissioni"],
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
                        value={inputs[key]}
                        onChange={(e) => {
                          const next = parseFloat(e.target.value);
                          const safe = Number.isFinite(next) && next >= 0 ? next : 0;
                          setInputs((p) => ({ ...p, [key]: safe }));
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

            <Separator />

            {/* 3 ── Costi e rischi ── */}
            <div className="space-y-3">
              <SectionTitle icon={<AlertTriangle className="h-3.5 w-3.5" />}>
                Costi e rischi
              </SectionTitle>
              <div className="grid grid-cols-2 gap-3">
                <NumberField
                  label="Costo orario medio"
                  value={inputs.costoOrario}
                  onChange={(v) => setInputs((p) => ({ ...p, costoOrario: v }))}
                  suffix="€/h"
                  step={1}
                />
                <IntegerField
                  label="Errori, sanzioni, ritardi"
                  value={inputs.erroriAnnui}
                  onChange={(v) => setInputs((p) => ({ ...p, erroriAnnui: v }))}
                  suffix="€/anno"
                />
              </div>
            </div>

            <Separator />

            {/* 4 ── Investimento ── */}
            <div className="space-y-3">
              <SectionTitle icon={<Sparkles className="h-3.5 w-3.5 text-primary" />}>
                Investimento
              </SectionTitle>
              {plans.length > 0 && (
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">Piano EdiliziaInCloud</Label>
                  <Select
                    value={plans.find((pl) => pl.price_monthly === inputs.abbonamentoMensile)?.id ?? "custom"}
                    onValueChange={(id) => {
                      const plan = plans.find((pl) => pl.id === id);
                      if (plan) setInputs((p) => ({ ...p, abbonamentoMensile: plan.price_monthly }));
                    }}
                  >
                    <SelectTrigger className="h-9">
                      <SelectValue placeholder="Scegli un piano" />
                    </SelectTrigger>
                    <SelectContent>
                      {plans.map((plan) => (
                        <SelectItem key={plan.id} value={plan.id}>
                          {plan.name} · {formatCurrency(plan.price_monthly)}/mese
                        </SelectItem>
                      ))}
                      <SelectItem value="custom">Importo personalizzato</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              )}
              <NumberField
                label="Canone EdiliziaInCloud"
                value={inputs.abbonamentoMensile}
                onChange={(v) => setInputs((p) => ({ ...p, abbonamentoMensile: v }))}
                suffix="€/mese"
                step={10}
                hint={
                  plans.length > 0
                    ? "Scegli un piano sopra oppure inserisci un importo personalizzato."
                    : "Pre-compilato col piano reale; modificabile in trattativa."
                }
              />
            </div>

            <Separator />

            {/* 5 ── Crescita (opzionale, dietro switch) ── */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <SectionTitle icon={<Rocket className="h-3.5 w-3.5" />}>
                  Crescita (opzionale)
                </SectionTitle>
                <Switch
                  checked={inputs.abilitaCrescita}
                  onCheckedChange={(v) => setInputs((p) => ({ ...p, abilitaCrescita: v }))}
                  aria-label="Abilita la leva crescita"
                />
              </div>
              {inputs.abilitaCrescita && (
                <div className="grid grid-cols-2 gap-3 rounded-lg border bg-muted/20 p-3">
                  <NumberField
                    label="Preventivi al mese"
                    value={inputs.preventiviMese}
                    onChange={(v) => setInputs((p) => ({ ...p, preventiviMese: v }))}
                    suffix="n."
                    step={1}
                  />
                  <IntegerField
                    label="Valore medio preventivo"
                    value={inputs.valoreMedioPreventivo}
                    onChange={(v) => setInputs((p) => ({ ...p, valoreMedioPreventivo: v }))}
                    suffix="€"
                  />
                  <NumberField
                    label="Tasso di chiusura"
                    value={inputs.tassoChiusuraPct}
                    onChange={(v) => setInputs((p) => ({ ...p, tassoChiusuraPct: v }))}
                    suffix="%"
                    step={5}
                  />
                  <NumberField
                    label="Più preventivi con EiC"
                    value={inputs.upliftPreventiviPct}
                    onChange={(v) => setInputs((p) => ({ ...p, upliftPreventiviPct: v }))}
                    suffix="%"
                    step={5}
                  />
                </div>
              )}
            </div>

            {/* 6 ── Assunzioni avanzate (collassabile) ── */}
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
                <div className="space-y-1">
                  <Label className="text-[11px] text-muted-foreground">
                    Settimane lavorative / anno
                  </Label>
                  <Input
                    type="number"
                    min={1}
                    max={52}
                    step={1}
                    value={inputs.settimaneAnno}
                    onChange={(e) => {
                      const next = parseInt(e.target.value, 10);
                      const safe = Number.isFinite(next) && next > 0 ? Math.min(next, 52) : 1;
                      setInputs((p) => ({ ...p, settimaneAnno: safe }));
                    }}
                    className="h-8 w-24 text-sm"
                  />
                </div>
                <PctSlider
                  label="Tempo recuperato con EdiliziaInCloud"
                  value={inputs.pctTempoRecuperato}
                  onChange={(v) => setInputs((p) => ({ ...p, pctTempoRecuperato: v }))}
                />
                <PctSlider
                  label="Errori / sanzioni / ritardi evitati"
                  value={inputs.pctRischioEvitato}
                  onChange={(v) => setInputs((p) => ({ ...p, pctRischioEvitato: v }))}
                />
                <PctSlider
                  label="Margine recuperato sul fatturato"
                  value={inputs.pctMargineRecuperato}
                  onChange={(v) => setInputs((p) => ({ ...p, pctMargineRecuperato: v }))}
                  max={10}
                  step={0.5}
                  decimals={1}
                  hint="Tipicamente 1–3% del fatturato grazie al controllo in tempo reale."
                />
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
                <TrendingUp className={`h-4 w-4 ${guadagna ? "text-success" : ""}`} />
                Con EdiliziaInCloud guadagni
              </div>
              <div
                className={`mt-1 text-4xl font-extrabold tabular-nums ${
                  guadagna ? "text-success" : "text-foreground"
                }`}
              >
                {formatCurrency(Math.max(0, results.guadagnoNettoAnnuo))}
                <span className="text-lg font-semibold text-muted-foreground"> / anno</span>
              </div>
              <p className="mt-1 text-sm text-muted-foreground">
                {guadagna ? (
                  <>
                    Sono <strong>{formatCurrency(results.guadagnoNettoMensile)} al mese</strong> che
                    oggi escono dalla tua cassa senza che te ne accorgi. EdiliziaInCloud non è un
                    costo: te li restituisce.
                  </>
                ) : (
                  "Aumenta fatturato, ore perse o costi attuali per vedere il guadagno reale."
                )}
              </p>
            </CardContent>
          </Card>

          {/* 3 STAT: ROI · Payback · Costo dell'inazione */}
          <div className="grid grid-cols-3 gap-3">
            <Card className="border-success/30 bg-success/[0.04]">
              <CardContent className="p-3.5">
                <div className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                  <Gauge className="h-3.5 w-3.5" />
                  ROI
                </div>
                <p className="mt-1 text-2xl font-bold tabular-nums text-success">
                  {results.roiMultiplo > 0 ? `${results.roiMultiplo.toFixed(1)}×` : "—"}
                </p>
                <p className="text-[11px] text-muted-foreground">su ogni euro investito</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-3.5">
                <div className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                  <Timer className="h-3.5 w-3.5" />
                  Payback
                </div>
                <p className="mt-1 text-2xl font-bold tabular-nums text-foreground">
                  {results.paybackGiorni > 0 ? results.paybackGiorni.toLocaleString("it-IT") : "—"}
                  {results.paybackGiorni > 0 && (
                    <span className="text-sm font-semibold text-muted-foreground"> gg</span>
                  )}
                </p>
                <p className="text-[11px] text-muted-foreground">si ripaga in</p>
              </CardContent>
            </Card>
            <Card className="border-amber-500/30 bg-amber-500/[0.04]">
              <CardContent className="p-3.5">
                <div className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                  <AlertTriangle className="h-3.5 w-3.5" />
                  Inazione
                </div>
                <p className="mt-1 text-2xl font-bold tabular-nums text-foreground">
                  {formatCurrency(results.costoInazioneAnnuo)}
                </p>
                <p className="text-[11px] text-muted-foreground">
                  {guadagna ? (
                    <>
                      ogni giorno che rimandi butti{" "}
                      <strong className="text-amber-600">
                        {formatCurrency(results.guadagnoNettoGiornaliero)}
                      </strong>
                    </>
                  ) : (
                    "restare com'è ti costa /anno"
                  )}
                </p>
              </CardContent>
            </Card>
          </div>

          {/* Barre prima/dopo */}
          <Card>
            <CardContent className="p-4">
              <p className="mb-2 text-xs font-medium text-muted-foreground">
                Restare com'è oggi vs investire in EdiliziaInCloud
              </p>
              <div className="h-[150px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={chartData} margin={{ top: 22, right: 8, left: 8, bottom: 0 }}>
                    <XAxis
                      dataKey="label"
                      axisLine={false}
                      tickLine={false}
                      tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
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

          {/* Breakdown "Da dove arriva il valore" — enumera results.leve */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-1.5">
                <BarChart3 className="h-4 w-4 text-primary" />
                Da dove arriva il valore
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {results.leve.map((leva) => {
                const principale = leva.key === "margine";
                return (
                  <div
                    key={leva.key}
                    className={`flex items-center gap-3 rounded-lg px-2.5 py-2 ${
                      principale ? "border border-success/30 bg-success/[0.05]" : ""
                    }`}
                  >
                    <div
                      className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-md ${
                        principale ? "bg-success/15 text-success" : "bg-muted text-muted-foreground"
                      }`}
                    >
                      {LEVA_ICONS[leva.key]}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5 text-sm font-medium leading-tight">
                        {leva.label}
                        {principale && (
                          <Badge
                            variant="outline"
                            className="border-success/40 px-1.5 py-0 text-[10px] text-success"
                          >
                            principale
                          </Badge>
                        )}
                      </div>
                      <p className="truncate text-[11px] text-muted-foreground">{leva.funzione}</p>
                    </div>
                    <span
                      className={`shrink-0 text-sm font-semibold tabular-nums ${
                        principale ? "text-success" : "text-foreground"
                      }`}
                    >
                      {formatCurrency(leva.valore)}
                    </span>
                  </div>
                );
              })}
              <Separator className="my-1" />
              <div className="flex items-center justify-between px-2.5 text-sm">
                <span className="font-medium text-muted-foreground">Valore totale generato</span>
                <span className="font-bold tabular-nums">
                  {formatCurrency(results.valoreGeneratoAnnuo + results.softwareEliminato)}
                </span>
              </div>
              {guadagna && (
                <p className="px-2.5 pt-1 text-xs leading-snug text-muted-foreground">
                  Non stai comprando un software: stai smettendo di perdere{" "}
                  <strong className="text-foreground">
                    {formatCurrency(results.guadagnoNettoAnnuo)}
                  </strong>{" "}
                  ogni anno.
                </p>
              )}
            </CardContent>
          </Card>

          {/* Azioni: Salva + Export PDF + Invia email */}
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

            <Tooltip>
              <TooltipTrigger asChild>
                <span>
                  <Button
                    variant="outline"
                    className="gap-2"
                    disabled={!onExportPdf}
                    onClick={() => onExportPdf?.({ inputs, results, clientName, referente })}
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
                    onClick={() => onSendEmail?.({ inputs, results, clientName, referente })}
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

interface PctSliderProps {
  label: string;
  value: number;
  onChange: (v: number) => void;
  /** Massimo della percentuale (default 100). */
  max?: number;
  /** Passo dello slider (default 5). */
  step?: number;
  /** Decimali mostrati a fianco (default 0). */
  decimals?: number;
  hint?: string;
}

/** Slider per una percentuale espressa in 0..max (non 0..1). */
function PctSlider({ label, value, onChange, max = 100, step = 5, decimals = 0, hint }: PctSliderProps) {
  const safe = Number.isFinite(value) ? Math.min(Math.max(value, 0), max) : 0;
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <Label className="text-[11px] text-muted-foreground">{label}</Label>
        <span className="text-xs font-medium tabular-nums">{safe.toFixed(decimals)}%</span>
      </div>
      <Slider
        value={[safe]}
        min={0}
        max={max}
        step={step}
        onValueChange={(vals) => onChange(vals[0] ?? 0)}
      />
      {hint && <p className="text-[11px] text-muted-foreground/80">{hint}</p>}
    </div>
  );
}

export default RoiSimulator;
