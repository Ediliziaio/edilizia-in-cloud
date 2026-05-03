import { useMemo } from "react";
import { Label } from "@/components/ui/label";
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
}

const MESI = [
  "Gennaio", "Febbraio", "Marzo", "Aprile", "Maggio", "Giugno",
  "Luglio", "Agosto", "Settembre", "Ottobre", "Novembre", "Dicembre",
];

export function FilterBar({ value, onChange, showScenario = false }: FilterBarProps) {
  const { data: scenari = [], isLoading: scenariLoading } = useScenari();

  const anniDisponibili = useMemo(() => {
    const oggi = new Date().getFullYear();
    return [oggi - 2, oggi - 1, oggi, oggi + 1];
  }, []);

  const update = (patch: Partial<CGFilters>) => onChange({ ...value, ...patch });

  return (
    <div className="grid grid-cols-1 gap-3 px-3 sm:px-4 py-3 border-b bg-muted/30 sm:grid-cols-2 lg:grid-cols-4">
      <div className="space-y-1">
        <Label className="text-xs text-muted-foreground">Anno</Label>
        <Select
          value={String(value.anno)}
          onValueChange={(v) => update({ anno: Number(v) })}
        >
          <SelectTrigger className="h-9">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {anniDisponibili.map((a) => (
              <SelectItem key={a} value={String(a)}>{a}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-1">
        <Label className="text-xs text-muted-foreground">Periodo</Label>
        <Select
          value={value.periodo}
          onValueChange={(v) => update({ periodo: v as CGPeriodo })}
        >
          <SelectTrigger className="h-9">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="annuale">Anno completo</SelectItem>
            <SelectItem value="ytd">Year to date (gen → mese)</SelectItem>
            <SelectItem value="mese">Singolo mese</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-1">
        <Label className="text-xs text-muted-foreground">Mese</Label>
        <Select
          value={String(value.mese)}
          onValueChange={(v) => update({ mese: Number(v) })}
          disabled={value.periodo === "annuale"}
        >
          <SelectTrigger className="h-9">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {MESI.map((nome, idx) => (
              <SelectItem key={idx + 1} value={String(idx + 1)}>{nome}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {showScenario && (
        <div className="space-y-1">
          <Label className="text-xs text-muted-foreground">Scenario piano</Label>
          <Select
            value={value.scenarioId ?? "_default"}
            onValueChange={(v) => update({ scenarioId: v === "_default" ? null : v })}
            disabled={scenariLoading}
          >
            <SelectTrigger className="h-9">
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
