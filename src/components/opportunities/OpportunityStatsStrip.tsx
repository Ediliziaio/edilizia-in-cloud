import { useMemo } from "react";
import { AlertTriangle, CircleDot, Percent, Trophy, XCircle, Ban, Euro, TrendingUp, BellRing } from "lucide-react";
import { formatCurrency } from "@/lib/formatters";
import { cn } from "@/lib/utils";
import type { OpportunityStage } from "@/types/opportunities";

/** I due filtri azionabili della strip: si attivano/spengono col click. */
export type FiltroStrip = "stallo" | "azioni_scadute" | null;

interface Props {
  opportunities: any[];
  /** Fasi della pipeline attiva: servono per la soglia di stallo PER FASE. */
  stages?: OpportunityStage[];
  filtroAttivo?: FiltroStrip;
  onFiltro?: (filtro: FiltroStrip) => void;
}

const STATS_CONFIG = [
  { key: "open", label: "Aperte", icon: CircleDot, colorClass: "border-l-blue-500 text-blue-600 dark:text-blue-400" },
  { key: "won", label: "Vinte", icon: Trophy, colorClass: "border-l-green-500 text-green-600 dark:text-green-400" },
  { key: "lost", label: "Perse", icon: XCircle, colorClass: "border-l-red-500 text-red-600 dark:text-red-400" },
  { key: "abandoned", label: "Abbandonate", icon: Ban, colorClass: "border-l-muted-foreground/50 text-muted-foreground" },
  { key: "pipeline_value", label: "Pipeline", icon: Euro, colorClass: "border-l-blue-500 text-blue-600 dark:text-blue-400" },
  { key: "weighted_value", label: "Ponderato", icon: Percent, colorClass: "border-l-violet-500 text-violet-600 dark:text-violet-400" },
  { key: "won_value", label: "Fatturato Vinto", icon: TrendingUp, colorClass: "border-l-green-500 text-green-600 dark:text-green-400" },
  { key: "azioni_scadute", label: "Da fare", icon: BellRing, colorClass: "border-l-red-500 text-red-600 dark:text-red-400" },
  { key: "stale", label: "In stallo", icon: AlertTriangle, colorClass: "border-l-amber-500 text-amber-600 dark:text-amber-400" },
] as const;

export const SOGLIA_STALLO_DEFAULT_GG = 14;

/** Un'opportunità aperta è in stallo se ferma nella fase oltre la soglia DELLA FASE (default 14gg). */
export function opportunitaInStallo(o: any, soglie: Map<string, number>): boolean {
  if (o.status !== "open") return false;
  const soglia = soglie.get(o.stage_id) ?? SOGLIA_STALLO_DEFAULT_GG;
  const ultimoTocco = new Date(o.stage_changed_at || o.updated_at || o.created_at || 0).getTime();
  return !!ultimoTocco && ultimoTocco < Date.now() - soglia * 24 * 60 * 60 * 1000;
}

/** Prossima azione compilata e scaduta (fino a ieri compreso), su opportunità aperta. */
export function azioneScaduta(o: any): boolean {
  if (o.status !== "open" || !o.next_action_date) return false;
  const oggi = new Date(); oggi.setHours(0, 0, 0, 0);
  return new Date(o.next_action_date).getTime() < oggi.getTime();
}

export function costruisciSoglieStallo(stages?: OpportunityStage[]): Map<string, number> {
  const m = new Map<string, number>();
  for (const s of stages ?? []) {
    m.set(s.id, Number(s.stalled_threshold_days ?? SOGLIA_STALLO_DEFAULT_GG) || SOGLIA_STALLO_DEFAULT_GG);
  }
  return m;
}

export function OpportunityStatsStrip({ opportunities, stages, filtroAttivo, onFiltro }: Props) {
  const soglie = useMemo(() => costruisciSoglieStallo(stages), [stages]);

  const stats = useMemo(() => {
    let open = 0, won = 0, lost = 0, abandoned = 0, pipelineValue = 0, weightedValue = 0, wonValue = 0, stale = 0, unscored = 0, azioniScadute = 0;
    for (const o of opportunities) {
      const v = Number(o.value || 0);
      const probability = Math.max(0, Math.min(100, Number(o.probability ?? 50))) / 100;
      switch (o.status) {
        case "open":
          open++;
          pipelineValue += v;
          weightedValue += v * probability;
          if (o.probability == null) unscored++; // prob. non impostata → il ponderato assume 50%
          if (opportunitaInStallo(o, soglie)) stale++;
          if (azioneScaduta(o)) azioniScadute++;
          break;
        case "won": won++; wonValue += v; break;
        case "lost": lost++; break;
        case "abandoned": abandoned++; break;
      }
    }
    const closed = won + lost;
    const winRate = closed > 0 ? Math.round((won / closed) * 100) : null;
    return { open, won, lost, abandoned, pipeline_value: pipelineValue, weighted_value: weightedValue, won_value: wonValue, stale, unscored, winRate, azioni_scadute: azioniScadute };
  }, [opportunities, soglie]);

  const fmt = (v: number, isCurrency: boolean) =>
    isCurrency ? formatCurrency(v) : String(v);

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-9 gap-2">
      {STATS_CONFIG.map(({ key, label, icon: Icon, colorClass }) => {
        const isCurrency = key === "pipeline_value" || key === "weighted_value" || key === "won_value";
        const value = stats[key];
        // Trasparenza forecast: il "Ponderato" assume 50% per le opportunità senza
        // probabilità impostata → lo segnaliamo per non mostrare un dato finto-preciso.
        const weightedHint =
          key === "weighted_value" && stats.unscored > 0
            ? `${stats.unscored} opportunità senza probabilità: stimate al 50% nel ponderato`
            : undefined;
        // Win-rate sotto "Vinte": vinte/(vinte+perse) — prima il tasso di
        // conversione esisteva solo nella Reportistica separata.
        const winRateHint =
          key === "won" && stats.winRate != null ? `${stats.winRate}% win-rate` : undefined;
        // "Da fare" e "In stallo" sono FILTRI, non solo numeri: un click
        // restringe la pipeline alle opportunità da lavorare adesso.
        const filtro: FiltroStrip = key === "stale" ? "stallo" : key === "azioni_scadute" ? "azioni_scadute" : null;
        const cliccabile = !!filtro && !!onFiltro;
        const attivo = !!filtro && filtroAttivo === filtro;

        const contenuto = (
          <>
            <Icon className={`h-3.5 w-3.5 shrink-0 ${colorClass.split(" ").slice(1).join(" ")}`} />
            <div className="min-w-0 text-left">
              <p className="text-sm font-bold leading-tight text-foreground truncate">
                {fmt(value, isCurrency)}
              </p>
              <p className="text-[10px] text-muted-foreground leading-tight truncate">{label}</p>
              {weightedHint && (
                <p className="text-[9px] leading-tight text-amber-600 dark:text-amber-400 truncate">
                  {stats.unscored} senza stima
                </p>
              )}
              {winRateHint && (
                <p className="text-[9px] leading-tight text-green-600 dark:text-green-400 truncate">
                  {winRateHint}
                </p>
              )}
            </div>
          </>
        );

        const classi = cn(
          "flex items-center gap-2 rounded-md border-l-2 bg-muted/30 px-2.5 py-1.5",
          colorClass.split(" ")[0],
          cliccabile && "cursor-pointer transition-colors hover:bg-muted/60",
          attivo && "ring-1 ring-primary bg-primary/5",
        );

        return cliccabile ? (
          <button
            key={key}
            type="button"
            title={attivo ? "Togli il filtro" : `Mostra solo: ${label}`}
            aria-pressed={attivo}
            className={classi}
            onClick={() => onFiltro!(attivo ? null : filtro)}
          >
            {contenuto}
          </button>
        ) : (
          <div key={key} title={weightedHint} className={classi}>
            {contenuto}
          </div>
        );
      })}
    </div>
  );
}
