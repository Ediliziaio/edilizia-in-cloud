import type { QualitaRender as Qualita } from "../../../shared/render-quality/quality.ts";

export function QualitaRender({ value, onChange, disabled = false }: {
  value?: Qualita;
  onChange: (value: Qualita) => void;
  disabled?: boolean;
}) {
  return <fieldset className="space-y-2" disabled={disabled}>
    <legend className="text-sm font-semibold">Qualità del render</legend>
    <div className="grid grid-cols-2 gap-2">
      {([['standard', 'Standard', 'Per le prime proposte'], ['alta', 'Alta', 'Più dettaglio nei materiali; richiede più tempo']] as const).map(([id, title, description]) =>
        <button key={id} type="button" aria-pressed={(value ?? 'standard') === id} onClick={() => onChange(id)} className={`rounded-lg border p-3 text-left text-sm disabled:opacity-50 ${((value ?? 'standard') === id) ? 'border-primary bg-primary/5 ring-1 ring-primary' : 'border-border'}`}>
          <span className="block font-semibold">{title}</span><span className="block text-xs text-muted-foreground">{description}</span>
        </button>)}
    </div>
  </fieldset>;
}
