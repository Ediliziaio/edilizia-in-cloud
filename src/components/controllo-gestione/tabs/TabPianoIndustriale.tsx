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
import { Sparkles, Loader2, AlertTriangle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import {
  formatEuro,
  formatEuroBreve,
  formatNumero,
  levaPiano,
  margineEbitdaPiano,
  roePiano,
  roiPiano,
  rosPiano,
  variazioneLeggibile,
  type IndicePiano,
} from "@/lib/controlloGestione/indiciBanca";
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

function ratingTone(classe?: string): { bg: string; text: string } {
  switch (classe) {
    case "AAA": case "AA": case "A":
      return { bg: "bg-emerald-50", text: "text-emerald-700" };
    case "BBB": case "BB":
      return { bg: "bg-amber-50", text: "text-amber-700" };
    case "B": case "CCC":
      return { bg: "bg-rose-50", text: "text-rose-700" };
    default:
      return { bg: "bg-muted/30", text: "text-muted-foreground" };
  }
}

export function TabPianoIndustriale({ scenarioId }: TabPianoIndustrialeProps) {
  const scenariQuery = useScenari();
  const [whatIf, setWhatIf] = useState<PianoResult | null>(null);
  const [scenarioAttivo, setScenarioAttivo] = useState<PianoScenario>("base");
  const [bootstrapping, setBootstrapping] = useState(false);
  // Anno di partenza: null = quello dello scenario (di solito l'anno scorso,
  // l'ultimo chiuso); l'anno in corso viene stimato a fine anno.
  const [annoPartenza, setAnnoPartenza] = useState<number | null>(null);
  const annoCorrente = new Date().getFullYear();
  const qc = useQueryClient();

  // Risoluzione scenario → riga di assunzioni da passare alla RPC.
  // Il toggle Prudente/Base/Aggressivo è la sorgente primaria (per nome);
  // il selettore Scenario della FilterBar viene onorato quando punta a uno
  // scenario CUSTOM (nome fuori dai 3 base), che il toggle non può mostrare.
  const scenari = scenariQuery.data ?? [];
  const rowFromFilter = scenarioId ? scenari.find((s) => s.id === scenarioId) ?? null : null;
  const isCustomFilter =
    !!rowFromFilter && !(SCENARI_BASE as string[]).includes(rowFromFilter.scenario);
  const assumptionFromToggle =
    scenari.find((s) => s.scenario === scenarioAttivo)?.id ?? null;
  const activeAssumptionId = isCustomFilter ? scenarioId : assumptionFromToggle;

  const baseQuery = usePianoIndustriale(activeAssumptionId, annoPartenza);

  // Cambiare scenario azzera il what-if: le assunzioni personalizzate
  // appartengono allo scenario su cui sono state costruite.
  const handleChangeScenario = (s: PianoScenario) => {
    setScenarioAttivo(s);
    setWhatIf(null);
  };
  const handleChangeAnno = (a: number | null) => {
    setAnnoPartenza(a);
    setWhatIf(null);
  };

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
      // Prefisso ["cg","piano"]: invalida la proiezione di TUTTI gli scenari.
      await qc.invalidateQueries({ queryKey: ["cg", "piano"] });
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
        scenarioCustomNome={isCustomFilter ? rowFromFilter?.scenario ?? null : null}
        scenariDisponibili={scenariDisponibili}
        onChangeScenario={handleChangeScenario}
        annoPartenza={annoPartenza}
        annoCorrente={annoCorrente}
        onChangeAnno={handleChangeAnno}
        isWhatIf={!!whatIf}
      />
      <CETablePrev periodi={piano.periodi} stimata={!!piano.meta.base_stimata_fine_anno} />
      <SPTablePrev periodi={piano.periodi} stimata={!!piano.meta.base_stimata_fine_anno} />
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
                    scenarioId={activeAssumptionId}
                    onResult={setWhatIf}
                    onReset={() => setWhatIf(null)}
                    disabled={bootstrapping}
                    annoPartenza={annoPartenza}
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
  scenarioCustomNome,
  scenariDisponibili,
  onChangeScenario,
  annoPartenza,
  annoCorrente,
  onChangeAnno,
  isWhatIf,
}: {
  piano: PianoResult;
  scenarioAttivo: PianoScenario;
  scenarioCustomNome: string | null;
  scenariDisponibili: PianoScenario[];
  onChangeScenario: (s: PianoScenario) => void;
  annoPartenza: number | null;
  annoCorrente: number;
  onChangeAnno: (a: number | null) => void;
  isWhatIf: boolean;
}) {
  const periodi = piano.periodi;
  const annoBase = periodi[0];
  const annoFinale = periodi[periodi.length - 1];

  const proiezioni = periodi.filter((p) => p.tipo === "proiezione");
  const ebitdaCumulato = proiezioni.reduce((acc, p) => acc + p.ebitda, 0);
  const ricaviProiezione = proiezioni.reduce((acc, p) => acc + p.ricavi, 0);
  const ebitdaMediaPct = ricaviProiezione > 0 ? (ebitdaCumulato / ricaviProiezione) * 100 : null;
  const investimentiTotali = proiezioni.reduce((acc, p) => acc + (p.investimento_anno ?? 0), 0);

  const ratingClasse = annoFinale.rating_classe ?? "—";
  const ratingScore = annoFinale.rating_score ?? null;
  const tone = ratingTone(annoFinale.rating_classe);
  const stimata = !!piano.meta.base_stimata_fine_anno;
  const spNonQuadra = piano.meta.sp_base_quadrato === false;

  const nomeScenario = isWhatIf
    ? "Simulazione personalizzata"
    : `Scenario ${scenarioCustomNome ?? scenarioLabel(scenarioAttivo).toLowerCase()}`;
  const valoreAnno = annoPartenza === annoCorrente ? "corrente" : "scenario";

  return (
    <Card className="rounded-2xl">
      <CardHeader className="pb-3">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <CardTitle className="text-base">
              {nomeScenario} · {piano.meta.orizzonte} anni
            </CardTitle>
            <p className="text-xs text-muted-foreground">
              Si parte dal {piano.meta.anno_base}
              {stimata ? " stimato a fine anno (dati fin qui riportati a 12 mesi)" : " (anno chiuso)"} e si arriva al{" "}
              {annoFinale.anno}. Le proiezioni applicano le ipotesi dello scenario ai numeri dell'anno di partenza.
            </p>
          </div>
          <div className="flex flex-col gap-2">
            <ToggleGroup
              type="single"
              value={scenarioAttivo}
              onValueChange={(v) => v && onChangeScenario(v as PianoScenario)}
              className="justify-start"
              aria-label="Scenario"
            >
              {scenariDisponibili.map((s) => (
                <ToggleGroupItem key={s} value={s} variant="outline" size="sm">
                  {scenarioLabel(s)}
                </ToggleGroupItem>
              ))}
            </ToggleGroup>
            <ToggleGroup
              type="single"
              value={valoreAnno}
              onValueChange={(v) => v && onChangeAnno(v === "corrente" ? annoCorrente : null)}
              className="flex-wrap justify-start"
              aria-label="Anno di partenza"
            >
              <ToggleGroupItem value="scenario" variant="outline" size="sm">
                Parti dall'ultimo anno chiuso
              </ToggleGroupItem>
              <ToggleGroupItem value="corrente" variant="outline" size="sm">
                Parti dal {annoCorrente} stimato
              </ToggleGroupItem>
            </ToggleGroup>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {spNonQuadra && (
          <div role="alert" className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            <span>
              Lo Stato patrimoniale del {piano.meta.anno_base} non quadra
              {piano.meta.sp_base_differenza !== undefined ? ` (differenza di ${formatEuro(piano.meta.sp_base_differenza)})` : ""}:
              mezzi propri, debiti e rating del piano sono provvisori.
            </span>
          </div>
        )}
        {annoBase && annoBase.ebitda < 0 && (
          <p className="rounded-xl bg-muted/40 p-3 text-xs text-muted-foreground">
            Nel {annoBase.anno} il margine operativo lordo è negativo ({formatEuroBreve(annoBase.ebitda)}): le proiezioni
            partono da una perdita. Se l'anno in corso va meglio, prova «Parti dal {annoCorrente} stimato».
          </p>
        )}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <KpiSint
            label={`Ricavi ${annoFinale.anno}`}
            value={formatEuroBreve(annoFinale.ricavi)}
            sub={annoBase ? `${variazioneLeggibile(annoFinale.ricavi, annoBase.ricavi) ?? "—"} rispetto al ${annoBase.anno}` : undefined}
            tone={annoFinale.ricavi >= (annoBase?.ricavi ?? 0) ? "green" : "neutral"}
          />
          <KpiSint
            label="Margine operativo lordo nel piano"
            value={formatEuroBreve(ebitdaCumulato)}
            sub={ebitdaMediaPct !== null ? `Somma degli anni di piano · in media ${formatNumero(ebitdaMediaPct, 1)}% dei ricavi` : undefined}
            tone={ebitdaCumulato >= 0 ? "green" : "red"}
          />
          <KpiSint
            label="Investimenti nel piano"
            value={formatEuroBreve(investimentiTotali)}
            sub={`${proiezioni.length} anni`}
            tone="blue"
          />
          <KpiSint
            label={`Mezzi propri ${annoFinale.anno}`}
            value={formatEuroBreve(annoFinale.mezzi_propri)}
            sub={annoBase ? `${variazioneLeggibile(annoFinale.mezzi_propri, annoBase.mezzi_propri) ?? "—"} rispetto al ${annoBase.anno}` : undefined}
            tone={annoFinale.mezzi_propri < 0 ? "red" : annoFinale.mezzi_propri >= (annoBase?.mezzi_propri ?? 0) ? "green" : "neutral"}
          />
          <div className={cn("rounded-xl border px-4 py-3", tone.bg)}>
            <div className="text-xs text-muted-foreground">Rating {annoFinale.anno}</div>
            <div className={cn("mt-0.5 text-lg font-bold", tone.text)}>{ratingClasse}</div>
            <div className="text-xs text-muted-foreground">
              {ratingScore !== null ? `${Math.round(ratingScore)} punti su 100` : "—"} · stesse regole del Rating bancario
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
    tone === "green" ? "bg-emerald-50" : tone === "red" ? "bg-rose-50" : tone === "blue" ? "bg-blue-50" : "bg-muted/30";
  const text =
    tone === "green" ? "text-emerald-700" : tone === "red" ? "text-rose-700" : tone === "blue" ? "text-blue-700" : "text-foreground";
  return (
    <div className={cn("rounded-xl border px-4 py-3", bg)}>
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className={cn("mt-0.5 text-lg font-bold tabular-nums", text)}>{value}</div>
      {sub && <div className="text-xs text-muted-foreground">{sub}</div>}
    </div>
  );
}

// ── Tabelle previsionali ───────────────────────────────────────────────────

interface RigaPrev {
  label: string;
  livello: "voce" | "subtot" | "subtot_grasso";
  pick: (p: PianoPeriodo) => number;
  /** Variazione da un anno all'altro sotto il numero. */
  variazione?: boolean;
}

const CE_RIGHE: RigaPrev[] = [
  { label: "Ricavi", livello: "voce", pick: (p) => p.ricavi, variazione: true },
  { label: "Costi variabili", livello: "voce", pick: (p) => p.costi_var },
  { label: "Costi fissi", livello: "voce", pick: (p) => p.costi_fissi },
  { label: "Margine operativo lordo (EBITDA)", livello: "subtot", pick: (p) => p.ebitda, variazione: true },
  { label: "Ammortamenti", livello: "voce", pick: (p) => p.ammortamenti },
  { label: "Risultato operativo (EBIT)", livello: "subtot", pick: (p) => p.ebitda - p.ammortamenti },
  { label: "Oneri finanziari", livello: "voce", pick: (p) => p.oneri_finanziari },
  { label: "Utile dopo le imposte", livello: "subtot_grasso", pick: (p) => p.utile, variazione: true },
];

const SP_RIGHE: RigaPrev[] = [
  { label: "Beni dell'azienda (al netto degli ammortamenti)", livello: "voce", pick: (p) => p.cespiti },
  { label: "Mezzi propri", livello: "subtot", pick: (p) => p.mezzi_propri, variazione: true },
  { label: "Debiti a medio-lungo termine", livello: "voce", pick: (p) => p.debito_mlt },
];

function AnnoHeader({ periodo, stimata }: { periodo: PianoPeriodo; stimata: boolean }) {
  const etichetta = periodo.tipo === "consuntivo" ? (stimata ? "Stima fine anno" : "Consuntivo") : "Proiezione";
  return (
    <th className="min-w-[110px] px-3 py-2 text-right text-xs font-medium text-muted-foreground">
      <div className="flex flex-col items-end gap-1">
        <span className="text-sm font-semibold text-foreground">{periodo.anno}</span>
        <Badge
          variant="outline"
          className={cn(
            "whitespace-nowrap text-[10px]",
            periodo.tipo === "consuntivo"
              ? "border-muted-foreground/30 text-muted-foreground"
              : "border-orange-300 bg-orange-50 text-orange-700",
          )}
        >
          {etichetta}
        </Badge>
      </div>
    </th>
  );
}

function TabellaPrev({ titolo, righe, periodi, stimata, nota }: {
  titolo: string; righe: RigaPrev[]; periodi: PianoPeriodo[]; stimata: boolean; nota?: string;
}) {
  return (
    <Card className="rounded-2xl">
      <CardHeader className="pb-3">
        <CardTitle className="text-base">{titolo}</CardTitle>
        {nota && <p className="text-xs text-muted-foreground">{nota}</p>}
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto rounded-xl border">
          <table className="w-full border-collapse text-sm">
            <thead className="bg-muted/40">
              <tr>
                <th className="sticky left-0 z-10 min-w-[170px] bg-muted px-3 py-2 text-left text-xs font-medium text-muted-foreground">
                  Voce
                </th>
                {periodi.map((p) => <AnnoHeader key={p.t} periodo={p} stimata={stimata} />)}
              </tr>
            </thead>
            <tbody>
              {righe.map((riga) => (
                <tr
                  key={riga.label}
                  className={cn(
                    "border-t",
                    riga.livello === "subtot" && "bg-muted/50 font-semibold",
                    riga.livello === "subtot_grasso" && "bg-primary/5 font-bold",
                  )}
                >
                  <td className="sticky left-0 z-10 bg-card px-3 py-2">{riga.label}</td>
                  {periodi.map((p, i) => {
                    const val = riga.pick(p);
                    const varz = riga.variazione && i > 0 ? variazioneLeggibile(val, riga.pick(periodi[i - 1])) : null;
                    return (
                      <td key={p.t} className="px-3 py-2 text-right tabular-nums" title={formatEuro(val)}>
                        <div className={cn(val < 0 && "text-destructive")}>{formatEuroBreve(val)}</div>
                        {varz && <div className="text-[10px] font-normal text-muted-foreground">{varz}</div>}
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

function CETablePrev({ periodi, stimata }: { periodi: PianoPeriodo[]; stimata: boolean }) {
  return (
    <TabellaPrev
      titolo="Conto economico previsionale"
      righe={CE_RIGHE}
      periodi={periodi}
      stimata={stimata}
      nota="Sotto ogni numero la variazione sull'anno prima: in percentuale tra valori positivi, in euro quando c'è una perdita."
    />
  );
}

function SPTablePrev({ periodi, stimata }: { periodi: PianoPeriodo[]; stimata: boolean }) {
  return (
    <TabellaPrev
      titolo="Stato patrimoniale previsionale"
      righe={SP_RIGHE}
      periodi={periodi}
      stimata={stimata}
      nota="I debiti scendono con le rate dei mutui in corso e salgono con i nuovi finanziamenti dello scenario."
    />
  );
}

// ── Indici previsionali ────────────────────────────────────────────────────

interface IndicePrevDef {
  label: string;
  spiegazione: string;
  calc: (p: PianoPeriodo) => IndicePiano;
  formato: (v: number) => string;
}

const pct = (v: number) => `${formatNumero(v, 1)}%`;

const INDICI: IndicePrevDef[] = [
  {
    label: "ROE",
    spiegazione: "Utile / mezzi propri: quanto rendono i soldi messi dai soci.",
    calc: roePiano,
    formato: pct,
  },
  {
    label: "ROI",
    spiegazione: "Risultato operativo / (mezzi propri + debiti a lungo): quanto rende il capitale investito.",
    calc: roiPiano,
    formato: pct,
  },
  {
    label: "ROS",
    spiegazione: "Risultato operativo / ricavi: quanto resta di ogni 100 € fatturati prima di interessi e imposte.",
    calc: rosPiano,
    formato: pct,
  },
  {
    label: "Margine operativo lordo",
    spiegazione: "EBITDA / ricavi.",
    calc: margineEbitdaPiano,
    formato: pct,
  },
  {
    label: "Leva finanziaria",
    spiegazione: "Debiti a lungo / mezzi propri: sopra 2 la banca ti vede molto indebitato.",
    calc: levaPiano,
    formato: (v) => formatNumero(v, 2),
  },
];

function IndiciPrev({ periodi }: { periodi: PianoPeriodo[] }) {
  const calcolati = useMemo(
    () => INDICI.map((ind) => ({ ...ind, valori: periodi.map((p) => ind.calc(p)) })),
    [periodi],
  );
  const motivi = Array.from(
    new Set(calcolati.flatMap((ind) => ind.valori.filter((v) => v.motivo).map((v) => `${ind.label}: ${v.motivo}`))),
  );

  return (
    <Card className="rounded-2xl">
      <CardHeader className="pb-3">
        <CardTitle className="text-base">Indici previsionali</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto rounded-xl border">
          <table className="w-full border-collapse text-sm">
            <thead className="bg-muted/40">
              <tr>
                <th className="sticky left-0 z-10 min-w-[170px] bg-muted px-3 py-2 text-left text-xs font-medium text-muted-foreground">
                  Indice
                </th>
                {periodi.map((p) => (
                  <th key={p.t} className="min-w-[90px] px-3 py-2 text-right text-xs font-medium text-muted-foreground">
                    {p.anno}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {calcolati.map((ind) => (
                <tr key={ind.label} className="border-t">
                  <td className="sticky left-0 z-10 bg-card px-3 py-2">
                    <p className="font-medium">{ind.label}</p>
                    <p className="text-[11px] text-muted-foreground">{ind.spiegazione}</p>
                  </td>
                  {ind.valori.map((v, i) => (
                    <td
                      key={i}
                      className={cn("px-3 py-2 text-right tabular-nums", v.valore !== null && v.valore < 0 && "text-destructive")}
                      title={v.motivo ?? undefined}
                    >
                      {v.valore === null ? <span className="text-muted-foreground">n.c.</span> : ind.formato(v.valore)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {motivi.length > 0 && (
          <p className="mt-2 text-xs text-muted-foreground">
            n.c. = non calcolabile. {motivi.join(" · ")}.
          </p>
        )}
      </CardContent>
    </Card>
  );
}
