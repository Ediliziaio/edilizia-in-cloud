import { useId } from "react";
import { AlignLeft, AlignCenter, AlignRight } from "lucide-react";
import { normalizzaAllineamentoLogo, type AllineamentoLogo } from "../../../supabase/functions/_shared/dimensioniLogo";

const SCELTE = [
  { valore: "left", nome: "Sinistra", Icona: AlignLeft },
  { valore: "center", nome: "Centro", Icona: AlignCenter },
  { valore: "right", nome: "Destra", Icona: AlignRight },
] as const;

export function LogoAlignmentControl({ value, onChange, disabled = false }: {
  value?: string | null;
  onChange: (value: AllineamentoLogo) => void;
  disabled?: boolean;
}) {
  const id = useId();
  const scelto = normalizzaAllineamentoLogo(value);
  return <fieldset disabled={disabled} className="min-w-0 space-y-2 disabled:opacity-50">
    <legend id={`${id}-titolo`} className="text-sm font-medium">Allineamento del logo</legend>
    <div role="radiogroup" aria-labelledby={`${id}-titolo`} aria-describedby={`${id}-aiuto`} className="grid grid-cols-3 gap-2">
      {SCELTE.map(({ valore, nome, Icona }) => <label key={valore}
        className={`flex min-h-11 cursor-pointer items-center justify-center gap-2 rounded-md border px-2 py-2 text-sm focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2 ${scelto === valore ? "border-primary bg-primary/5 text-primary" : "border-input bg-background hover:bg-muted"}`}>
        <input type="radio" name={id} value={valore} checked={scelto === valore} disabled={disabled} onChange={() => { if (!disabled) onChange(valore); }} className="sr-only" />
        <Icona className="h-4 w-4 shrink-0" aria-hidden="true" /><span>{nome}</span>
      </label>)}
    </div>
    <p id={`${id}-aiuto`} className="text-xs text-muted-foreground">La testata si adatta alla posizione e alle dimensioni del logo.</p>
  </fieldset>;
}
