import { useId, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { normalizzaScalaLogo, SCALA_LOGO_MIN, SCALA_LOGO_MAX } from "../../../supabase/functions/_shared/dimensioniLogo";

export function LogoSizeControl({ value, onChange, disabled = false }: {
  value: number | null | undefined;
  onChange: (value: number) => void;
  disabled?: boolean;
}) {
  const id = useId();
  const scala = normalizzaScalaLogo(value);
  const [numero, setNumero] = useState<string | null>(null);
  const cambia = (valore: number) => { setNumero(null); onChange(normalizzaScalaLogo(valore)); };
  return (
    <div className="min-w-0 space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Label htmlFor={`${id}-barra`}>Dimensione del logo</Label>
        <div className="flex items-center gap-1">
          <Input id={`${id}-numero`} type="number" inputMode="numeric" min={SCALA_LOGO_MIN} max={SCALA_LOGO_MAX} step={1}
            aria-label="Dimensione del logo in percentuale" aria-describedby={`${id}-aiuto`}
            className="h-11 w-20 text-right tabular-nums" disabled={disabled} value={numero ?? scala}
            onChange={e => {
              setNumero(e.target.value);
              const n = e.target.valueAsNumber;
              if (Number.isFinite(n) && n >= SCALA_LOGO_MIN && n <= SCALA_LOGO_MAX) onChange(Math.round(n));
            }}
            onBlur={() => { if (numero !== null) cambia(numero.trim() ? Number(numero) : scala); }} />
          <span className="text-sm text-muted-foreground">%</span>
          <Button type="button" variant="ghost" size="sm" className="min-h-11" disabled={disabled || scala === 100}
            onClick={() => cambia(100)}>Standard</Button>
        </div>
      </div>
      <input id={`${id}-barra`} type="range" min={SCALA_LOGO_MIN} max={SCALA_LOGO_MAX} step={1} value={scala}
        disabled={disabled} aria-describedby={`${id}-aiuto`} aria-valuetext={`${scala}%`}
        onChange={e => cambia(e.target.valueAsNumber)} className="h-11 w-full cursor-pointer accent-primary disabled:cursor-not-allowed disabled:opacity-50" />
      <div className="flex justify-between text-xs text-muted-foreground" aria-hidden="true"><span>Più piccolo · 25%</span><span>Più grande · 250%</span></div>
      <p id={`${id}-aiuto`} className="text-xs text-muted-foreground">Trascina la barra o scrivi la percentuale. Il logo mantiene le proporzioni e resta nei margini del documento.</p>
    </div>
  );
}
