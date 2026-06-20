/**
 * SimIncidenzaCosti — card "Incidenza & composizione costi" dell'editor.
 *
 * Due letture analitiche, entrambe a barra orizzontale 100% impilata (CSS puro,
 * niente libreria grafici), coerenti con la terminologia del motore:
 *
 *   1. "Dove va il ricavo" — ripartizione del RICAVO IMPONIBILE (netto) nelle
 *      sue componenti: Costo diretto (sky), Spese generali (amber), Provvigioni
 *      (violet), Margine (emerald se ≥0 / rose se <0). Larghezze ∝ ai `_pct`
 *      (quota in % sul ricavo netto), con etichette % e legenda (pallino + nome
 *      + % + €).
 *   2. "Composizione del costo" — il costo diretto diviso in Manodopera (indigo)
 *      vs Materiali (sky), con % ed €, più la riga in risalto "Incidenza
 *      manodopera sul prezzo".
 *
 * I numeri vengono da `calcolaIncidenze(voci, risultato)`; le quote € dal
 * risultato. Empty-state pulito senza voci. Stile card di progetto:
 * `bg-card border rounded-xl shadow-sm`, header con icona colorata in chip,
 * `tabular-nums`, label muted, dark-mode via token tema, responsive.
 */
import type { ReactNode } from "react";
import { PieChart, Layers, HardHat, Package } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { formatCurrency } from "@/lib/formatters";
import { cn } from "@/lib/utils";
import { calcolaIncidenze } from "@/lib/simulatore/calcoli";
import type { VoceSim, SimulazioneRisultato } from "@/lib/simulatore/tipi";

interface SimIncidenzaCostiProps {
  voci: VoceSim[];
  risultato: SimulazioneRisultato;
}

/** Una fetta della barra impilata: nome, %, valore €, e classi colore. */
interface Slice {
  key: string;
  label: string;
  pct: number;
  valore: number;
  /** Classe sfondo della fetta nella barra. */
  bar: string;
  /** Classe colore del pallino di legenda. */
  dot: string;
}

/** "12,3%" — percentuale arrotondata a 1 decimale, locale IT. */
function fmtPct(pct: number): string {
  return `${(Math.round(pct * 10) / 10).toLocaleString("it-IT")}%`;
}

/**
 * Barra orizzontale 100% impilata (CSS puro). Le larghezze sono normalizzate
 * sulla somma delle quote presenti (così la barra riempie sempre il 100% anche
 * se i pct, per arrotondamento, non sommano esattamente a 100). Le fette con
 * quota ≤ 0 sono omesse dalla barra (ma restano in legenda).
 */
function StackedBar({ slices }: { slices: Slice[] }) {
  const positive = slices.filter((s) => s.pct > 0);
  const total = positive.reduce((acc, s) => acc + s.pct, 0);

  return (
    <div className="flex h-7 w-full overflow-hidden rounded-lg border bg-muted/40">
      {total > 0 ? (
        positive.map((s) => {
          const w = (s.pct / total) * 100;
          return (
            <div
              key={s.key}
              className={cn("flex items-center justify-center", s.bar)}
              style={{ width: `${w}%` }}
              title={`${s.label}: ${fmtPct(s.pct)} · ${formatCurrency(s.valore)}`}
            >
              {/* Etichetta % solo se la fetta è abbastanza larga da leggerla. */}
              {w >= 12 ? (
                <span className="px-1 text-[11px] font-semibold tabular-nums text-white/95 drop-shadow-sm">
                  {fmtPct(s.pct)}
                </span>
              ) : null}
            </div>
          );
        })
      ) : (
        <div className="flex w-full items-center justify-center text-[11px] text-muted-foreground">
          Nessun ricavo da ripartire
        </div>
      )}
    </div>
  );
}

/** Legenda compatta: pallino colorato + nome + % + € per ogni fetta. */
function Legend({ slices }: { slices: Slice[] }) {
  return (
    <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 sm:grid-cols-4">
      {slices.map((s) => (
        <div key={s.key} className="flex items-center gap-2 text-xs">
          <span className={cn("h-2.5 w-2.5 shrink-0 rounded-full", s.dot)} />
          <span className="min-w-0 flex-1 truncate text-muted-foreground">{s.label}</span>
          <span className="shrink-0 font-semibold tabular-nums">{fmtPct(s.pct)}</span>
        </div>
      ))}
    </div>
  );
}

/** Riga € sotto la legenda (valori assoluti, allineati a destra). */
function ValoriRow({ slices }: { slices: Slice[] }) {
  return (
    <div className="grid grid-cols-2 gap-x-4 gap-y-1 sm:grid-cols-4">
      {slices.map((s) => (
        <div key={s.key} className="flex items-baseline justify-between gap-2 text-[11px]">
          <span className="truncate text-muted-foreground">{s.label}</span>
          <span className="shrink-0 tabular-nums">{formatCurrency(s.valore)}</span>
        </div>
      ))}
    </div>
  );
}

/** Header di sezione: chip icona colorato + titolo + (opzionale) sottotitolo. */
function SectionHeader({
  icon, chip, title, subtitle,
}: {
  icon: ReactNode;
  chip: string;
  title: string;
  subtitle?: string;
}) {
  return (
    <div className="flex items-center gap-2">
      <span className={cn("flex h-7 w-7 items-center justify-center rounded-lg", chip)}>
        {icon}
      </span>
      <div className="min-w-0">
        <h3 className="text-sm font-semibold leading-tight">{title}</h3>
        {subtitle ? (
          <p className="text-[11px] text-muted-foreground">{subtitle}</p>
        ) : null}
      </div>
    </div>
  );
}

export function SimIncidenzaCosti({ voci, risultato }: SimIncidenzaCostiProps) {
  const inc = calcolaIncidenze(voci, risultato);

  // Empty-state: nessuna voce → niente da analizzare.
  if (voci.length === 0) {
    return (
      <Card className="rounded-xl">
        <CardContent className="space-y-3 p-4">
          <SectionHeader
            icon={<PieChart className="h-4 w-4" />}
            chip="bg-violet-100 text-violet-600 dark:bg-violet-950/60 dark:text-violet-400"
            title="Incidenza &amp; composizione costi"
          />
          <EmptyState
            icon={PieChart}
            size="sm"
            title="Nessun dato da analizzare"
            description="Aggiungi voci alla simulazione per vedere dove va il ricavo e la composizione del costo (manodopera vs materiali)."
          />
        </CardContent>
      </Card>
    );
  }

  const margineNeg = risultato.margine_valore < 0;

  // ── "Dove va il ricavo": ripartizione del ricavo netto ──────────────────────
  const ricavoSlices: Slice[] = [
    {
      key: "costo_diretto",
      label: "Costo diretto",
      pct: inc.costo_diretto_pct,
      valore: risultato.costo_diretto,
      bar: "bg-sky-500 dark:bg-sky-600",
      dot: "bg-sky-500",
    },
    {
      key: "spese_generali",
      label: "Spese generali",
      pct: inc.spese_generali_pct,
      valore: risultato.spese_generali,
      bar: "bg-amber-500 dark:bg-amber-600",
      dot: "bg-amber-500",
    },
    {
      key: "provvigioni",
      label: "Provvigioni",
      pct: inc.provvigioni_pct,
      valore: risultato.provvigioni_totale,
      bar: "bg-violet-500 dark:bg-violet-600",
      dot: "bg-violet-500",
    },
    {
      key: "margine",
      label: "Margine",
      pct: inc.margine_pct,
      valore: risultato.margine_valore,
      bar: margineNeg ? "bg-rose-500 dark:bg-rose-600" : "bg-emerald-500 dark:bg-emerald-600",
      dot: margineNeg ? "bg-rose-500" : "bg-emerald-500",
    },
  ];

  // ── "Composizione del costo": manodopera vs materiali sul costo diretto ─────
  const costoSlices: Slice[] = [
    {
      key: "manodopera",
      label: "Manodopera",
      pct: inc.manodopera_pct_costo,
      valore: inc.manodopera_costo,
      bar: "bg-indigo-500 dark:bg-indigo-600",
      dot: "bg-indigo-500",
    },
    {
      key: "materiali",
      label: "Materiali",
      pct: inc.materiali_pct_costo,
      valore: inc.materiali_costo,
      bar: "bg-sky-500 dark:bg-sky-600",
      dot: "bg-sky-500",
    },
  ];

  return (
    <Card className="rounded-xl">
      <CardContent className="space-y-6 p-4">
        {/* ── Dove va il ricavo ──────────────────────────────────────────────── */}
        <section className="space-y-3">
          <SectionHeader
            icon={<PieChart className="h-4 w-4" />}
            chip="bg-violet-100 text-violet-600 dark:bg-violet-950/60 dark:text-violet-400"
            title="Dove va il ricavo"
            subtitle={`Ripartizione del ricavo imponibile · ${formatCurrency(risultato.ricavo_netto)}`}
          />
          <StackedBar slices={ricavoSlices} />
          <Legend slices={ricavoSlices} />
          <ValoriRow slices={ricavoSlices} />
        </section>

        {/* ── Composizione del costo ─────────────────────────────────────────── */}
        <section className="space-y-3 border-t pt-5">
          <SectionHeader
            icon={<Layers className="h-4 w-4" />}
            chip="bg-indigo-100 text-indigo-600 dark:bg-indigo-950/60 dark:text-indigo-400"
            title="Composizione del costo"
            subtitle={`Costo diretto · ${formatCurrency(risultato.costo_diretto)}`}
          />
          <StackedBar slices={costoSlices} />
          <Legend slices={costoSlices} />
          <ValoriRow slices={costoSlices} />

          {/* Riga in risalto: incidenza manodopera sul prezzo. */}
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-indigo-200 bg-indigo-50/60 px-3 py-2 text-sm dark:border-indigo-900 dark:bg-indigo-950/30">
            <span className="flex items-center gap-1.5 font-medium text-indigo-700 dark:text-indigo-300">
              <HardHat className="h-4 w-4" />
              Incidenza manodopera sul prezzo
            </span>
            <span className="flex items-center gap-2 tabular-nums">
              <span className="font-bold text-indigo-700 dark:text-indigo-300">
                {fmtPct(inc.incidenza_manodopera_ricavo)}
              </span>
              <span className="flex items-center gap-1 text-[11px] text-muted-foreground">
                <Package className="h-3.5 w-3.5" />
                materiali {fmtPct(inc.materiali_pct_costo)}
              </span>
            </span>
          </div>
        </section>
      </CardContent>
    </Card>
  );
}
