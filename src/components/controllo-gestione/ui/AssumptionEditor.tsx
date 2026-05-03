import { useEffect, useRef, useState } from "react";
import { Slider } from "@/components/ui/slider";
import { Label } from "@/components/ui/label";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useWhatIfMutation, type PianoResult } from "@/hooks/controlloGestione/usePianoIndustriale";
import { formatCurrency } from "@/lib/formatters";
import { toast } from "sonner";

interface AssumptionEditorProps {
  scenarioId: string | null;
  onResult: (result: PianoResult) => void;
  /** Disabilita gli sliders (es. quando non c'è uno scenario di base configurato). */
  disabled?: boolean;
}

interface Assunzioni {
  crescita: number;       // %
  margine: number;        // %
  investimento: number;   // €
  orizzonte: number;      // anni
}

const DEFAULTS: Assunzioni = {
  crescita: 8,
  margine: 12,
  investimento: 100_000,
  orizzonte: 5,
};

export function AssumptionEditor({ scenarioId, onResult, disabled = false }: AssumptionEditorProps) {
  const [val, setVal] = useState<Assunzioni>(DEFAULTS);
  const mutation = useWhatIfMutation();
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    // Skip what-if quando lo scenario base manca: la RPC fallirebbe.
    if (disabled) return;
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      mutation.mutate(
        {
          override_crescita_pct: val.crescita,
          override_margine_pct: val.margine,
          override_investimento: val.investimento,
          orizzonte: val.orizzonte,
          assumption_id: scenarioId ?? undefined,
        },
        {
          onSuccess: (data) => onResult(data),
          onError: (err) => toast.error((err as Error).message ?? "Errore simulazione"),
        },
      );
    }, 300);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [val.crescita, val.margine, val.investimento, val.orizzonte, scenarioId]);

  return (
    <Card className={`rounded-2xl ${disabled ? "opacity-50 pointer-events-none select-none" : ""}`}>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">Assunzioni piano</CardTitle>
        {disabled && (
          <p className="text-xs text-muted-foreground">
            Disponibile dopo aver creato uno scenario di base.
          </p>
        )}
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label className="text-sm">Crescita ricavi</Label>
            <span className="text-sm font-semibold tabular-nums">{val.crescita}%</span>
          </div>
          <Slider
            min={0} max={30} step={1}
            value={[val.crescita]}
            onValueChange={([v]) => setVal((s) => ({ ...s, crescita: v }))}
            disabled={disabled}
          />
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label className="text-sm">Margine target</Label>
            <span className="text-sm font-semibold tabular-nums">{val.margine}%</span>
          </div>
          <Slider
            min={5} max={30} step={1}
            value={[val.margine]}
            onValueChange={([v]) => setVal((s) => ({ ...s, margine: v }))}
            disabled={disabled}
          />
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label className="text-sm">Investimento annuo</Label>
            <span className="text-sm font-semibold tabular-nums">
              {formatCurrency(val.investimento)}
            </span>
          </div>
          <Slider
            min={0} max={1_000_000} step={25_000}
            value={[val.investimento]}
            onValueChange={([v]) => setVal((s) => ({ ...s, investimento: v }))}
            disabled={disabled}
          />
        </div>

        <div className="space-y-2">
          <Label className="text-sm">Orizzonte</Label>
          <ToggleGroup
            type="single"
            value={String(val.orizzonte)}
            onValueChange={(v) => v && setVal((s) => ({ ...s, orizzonte: Number(v) }))}
            className="justify-start"
            disabled={disabled}
          >
            <ToggleGroupItem value="3" variant="outline" size="sm">3 anni</ToggleGroupItem>
            <ToggleGroupItem value="5" variant="outline" size="sm">5 anni</ToggleGroupItem>
            <ToggleGroupItem value="7" variant="outline" size="sm">7 anni</ToggleGroupItem>
          </ToggleGroup>
        </div>

        {!disabled && mutation.isPending && (
          <p className="text-xs text-muted-foreground">Ricalcolo in corso…</p>
        )}
      </CardContent>
    </Card>
  );
}
