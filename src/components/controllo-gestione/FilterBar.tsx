import { useMemo } from "react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useScenari } from "@/hooks/controlloGestione/useScenari";

export type CGPeriodo = "annuale" | "ytd" | "mese";

export interface CGFilters {
  anno: number;
  periodo: CGPeriodo;
  mese: number;
  scenarioId: string | null;
}

interface FilterBarProps {
  value: CGFilters;
  onChange: (next: CGFilters) => void;
  /** Mostra il selettore scenario (solo nella tab piano) */
  showScenario?: boolean;
  /**
   * Mostra Periodo + Mese. Solo le tab che restringono davvero il calcolo per
   * periodo (oggi il CE riclassificato) li consumano: sulle altre erano controlli
   * "morti" (l'utente cambiava mese e non succedeva nulla). Come showScenario,
   * li mostriamo solo dove hanno effetto.
   */
  showPeriodo?: boolean;
}

const MESI = [
  "Gennaio", "Febbraio", "Marzo", "Aprile", "Maggio", "Giugno",
  "Luglio", "Agosto", "Settembre", "Ottobre", "Novembre", "Dicembre",
];

export function FilterBar({ value, onChange, showScenario = false, showPeriodo = true }: FilterBarProps) {
  const { data: scenari = [], isLoading: scenariLoading } = useScenari();

  const anniDisponibili = useMemo(() => {
    const oggi = new Date().getFullYear();
    return [oggi - 2, oggi - 1, oggi, oggi + 1];
  }, []);

  const update = (patch: Partial<CGFilters>) => onChange({ ...value, ...patch });

  // La barra si vede solo da tablet (sul telefono l'anno sta nella testata):
  // una riga di selettori accanto al titolo, senza etichette sopra — il valore
  // dice già cos'è («2026», «Anno completo», «Marzo») — e senza fascia grigia.
  return (
    <div className="flex flex-wrap items-center gap-2">
      <div>
        <Select
          value={String(value.anno)}
          onValueChange={(v) => update({ anno: Number(v) })}
        >
          <SelectTrigger className="h-9 w-[96px]" aria-label="Anno">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {anniDisponibili.map((a) => (
              <SelectItem key={a} value={String(a)}>{a}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {showPeriodo && (
        <div>
          <Select
            value={value.periodo}
            onValueChange={(v) => update({ periodo: v as CGPeriodo })}
          >
            <SelectTrigger className="h-9 w-[170px]" aria-label="Periodo">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="annuale">Anno completo</SelectItem>
              <SelectItem value="ytd">Year to date (gen → mese)</SelectItem>
              <SelectItem value="mese">Singolo mese</SelectItem>
            </SelectContent>
          </Select>
        </div>
      )}

      {showPeriodo && (
        <div>
          <Select
            value={String(value.mese)}
            onValueChange={(v) => update({ mese: Number(v) })}
            disabled={value.periodo === "annuale"}
          >
            <SelectTrigger className="h-9 w-[130px]" aria-label="Mese">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {MESI.map((nome, idx) => (
                <SelectItem key={idx + 1} value={String(idx + 1)}>{nome}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      {showScenario && (
        <div className="flex items-center gap-2">
          {/* «Predefinito» da solo non dice di cosa: qui l'etichetta resta, in riga. */}
          <span className="text-xs text-muted-foreground">Scenario</span>
          <Select
            value={value.scenarioId ?? "_default"}
            onValueChange={(v) => update({ scenarioId: v === "_default" ? null : v })}
            disabled={scenariLoading}
          >
            <SelectTrigger className="h-9 w-[220px]" aria-label="Scenario piano">
              <SelectValue placeholder={scenariLoading ? "Caricamento…" : "Predefinito"} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="_default">Predefinito</SelectItem>
              {scenari.map((s) => (
                <SelectItem key={s.id} value={s.id}>
                  {s.scenario} {s.is_default ? "(predefinito)" : ""} · {s.orizzonte_anni} anni
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}
    </div>
  );
}
