import { useId, useState, type ReactNode } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";

const definition = {
  eyebrowSize: ["Testi", "Dimensione occhiello"],
  titleSize: ["Testi", "Dimensione titolo"],
  subtitleSize: ["Testi", "Dimensione sottotitolo"],
  textAlign: ["Testi", "Allineamento testo"],
  textVertical: ["Testi", "Posizione testo"],
  textColor: ["Colori e sfondo", "Colore testo"],
  eyebrowColor: ["Colori e sfondo", "Colore occhiello"],
  titleColor: ["Colori e sfondo", "Colore titolo"],
  subtitleColor: ["Colori e sfondo", "Colore sottotitolo"],
  backgroundColor: ["Colori e sfondo", "Colore di sfondo"],
  overlayOpacity: ["Colori e sfondo", "Intensità velo scuro"],
  overlayStyle: ["Colori e sfondo", "Stile velo scuro"],
  logoPosition: ["Logo e dettagli", "Posizione logo"],
  logoSize: ["Logo e dettagli", "Dimensione logo"],
  showDecoration: ["Logo e dettagli", "Mostra decorazione"],
  decorationStyle: ["Logo e dettagli", "Stile decorazione"],
  showClientCard: ["Logo e dettagli", "Mostra scheda cliente"],
} as const;
export const COVER_DESIGN_CHOICES = {
  textAlign: [["left", "Sinistra"], ["center", "Centro"]],
  textVertical: [["top", "In alto"], ["center", "Al centro"], ["bottom", "In basso"]],
  logoPosition: [["top_left", "In alto a sinistra"], ["top_center", "In alto al centro"], ["top_right", "In alto a destra"], ["hidden", "Nascosto"]],
  overlayStyle: [["flat", "Uniforme"], ["gradient", "Sfumato dal basso"], ["gradient_diag", "Sfumato diagonale"], ["vignette", "Vignetta"]],
  decorationStyle: [["square", "Geometrica"], ["circle", "Cerchi"], ["line", "Linea"], ["pattern", "Punti"], ["none", "Nessuna"]],
} as const;
type FieldBase = { id: keyof typeof definition; disabled?: boolean; hint?: string };
export type CoverDesignField = FieldBase & (
  | { kind: "range"; value: number; min: number; max: number; step?: number; unit: string; onChange: (value: number) => void }
  | { kind: "color"; value: string | null; fallback: string; onChange: (value: string) => void; onReset?: () => void }
  | { kind: "choice"; value: string; choices: readonly (readonly [string, string])[]; onChange: (value: string) => void }
  | { kind: "toggle"; value: boolean; onChange: (value: boolean) => void }
);

function DesignNumberInput({ field, id, disabled }: { field: Extract<CoverDesignField, { kind: "range" }>; id: string; disabled?: boolean }) {
  // Keep intermediate typing (e.g. "3" while entering "36") without clamping it to 20.
  const [draft, setDraft] = useState<string | null>(null);
  const commit = () => {
    if (draft != null && draft.trim() !== "" && Number.isFinite(Number(draft))) {
      const next = Math.max(field.min, Math.min(field.max, Number(draft)));
      if (next !== field.value) field.onChange(next);
    }
    setDraft(null);
  };
  return <Input id={id} aria-label={`${definition[field.id][1]} (${field.unit})`} type="number" min={field.min} max={field.max} step={field.id === "overlayOpacity" ? 1 : field.step ?? 1} value={draft ?? field.value} disabled={disabled} className="w-20 shrink-0" onChange={e => setDraft(e.target.value)} onBlur={commit} onKeyDown={e => {
    if (e.key === "Enter") { e.preventDefault(); commit(); }
    if (e.key === "Escape") { e.preventDefault(); setDraft(null); }
  }} />;
}

/** Sector adapters own units, aliases and defaults. Rendering never writes data. */
export function TemplateCoverDesignControls({ fields, hasImage, children }: {
  fields: CoverDesignField[]; hasImage: boolean; children?: ReactNode;
}) {
  const uid = useId();
  return <section data-cover-design-controls aria-label="Aspetto della copertina" className="min-w-0 space-y-5 rounded-xl border bg-card p-4">
    <div><h3 className="text-sm font-semibold">Aspetto della copertina</h3><p className="mt-1 text-xs text-muted-foreground">Gli stessi comandi in ogni modulo. Le modifiche si vedono nell’anteprima del documento.</p></div>
    {["Testi", "Colori e sfondo", "Logo e dettagli"].map(group => <fieldset key={group} className="min-w-0 space-y-3 border-t pt-3">
      <legend className="pr-2 text-xs font-semibold text-muted-foreground">{group}</legend>
      <div className="grid min-w-0 grid-cols-1 gap-4 sm:grid-cols-2">
        {Object.keys(definition).map(key => fields.find(field => field.id === key)).filter((field): field is CoverDesignField => !!field && definition[field.id][0] === group).map(field => {
          const label = definition[field.id][1], id = `${uid}-${field.id}`;
          const photoOnly = field.id === "overlayStyle" || field.id === "overlayOpacity";
          const logoHidden = fields.find(f => f.id === "logoPosition")?.value === "hidden";
          const decorationHidden = fields.find(f => f.id === "showDecoration")?.value === false;
          const disabled = field.disabled || (photoOnly && !hasImage) || (field.id === "logoSize" && logoHidden) || (field.id === "decorationStyle" && decorationHidden);
          return <div key={field.id} className="min-w-0 space-y-1.5" data-cover-design-field={field.id}>
            {field.kind !== "toggle" && <label htmlFor={id} className="block text-xs font-medium">{label}{field.kind === "range" && <span className="text-muted-foreground"> ({field.unit})</span>}</label>}
            {field.kind === "range" && <div className="flex min-w-0 items-center gap-3">
              <input aria-label={`${label}: cursore`} aria-describedby={field.hint ? `${id}-hint` : undefined} type="range" min={field.min} max={field.max} step={field.id === "overlayOpacity" ? 1 : field.step ?? 1} value={field.value} disabled={disabled} className="min-w-0 flex-1 accent-orange-500 disabled:opacity-40" onChange={e => field.onChange(Number(e.target.value))} />
              <DesignNumberInput field={field} id={id} disabled={disabled} />
            </div>}
            {field.kind === "choice" && <select id={id} value={field.value} disabled={disabled} onChange={e => field.onChange(e.target.value)} className="h-10 w-full min-w-0 rounded-md border border-input bg-background px-2 text-sm disabled:opacity-50">
              {!field.choices.some(([value]) => value === field.value) && <option value={field.value}>Valore personalizzato: {field.value}</option>}
              {field.choices.map(([value, title]) => <option key={value} value={value}>{title}</option>)}
            </select>}
            {field.kind === "color" && <><div className="flex min-w-0 gap-2">
              <input type="color" aria-label={`Selettore ${label.toLowerCase()}`} disabled={disabled} value={/^#[\da-f]{6}$/i.test(field.value ?? "") ? field.value! : field.fallback} onChange={e => field.onChange(e.target.value)} className="h-10 w-12 shrink-0 rounded border bg-background p-1" />
              <Input id={id} value={field.value ?? ""} placeholder={field.fallback} disabled={disabled} onChange={e => field.onChange(e.target.value)} className="min-w-0 font-mono" />
            </div>{field.onReset && <Button type="button" size="sm" variant="ghost" disabled={disabled || field.value == null} onClick={field.onReset}>Ripristina {label.toLowerCase()}</Button>}</>}
            {field.kind === "toggle" && <label htmlFor={id} className="flex min-h-10 items-center justify-between gap-3 text-sm"><span>{label}</span><Switch id={id} aria-label={label} checked={field.value} disabled={disabled} onCheckedChange={field.onChange} /></label>}
            {field.hint && <p id={`${id}-hint`} className="text-xs text-muted-foreground">{field.hint}</p>}
          </div>;
        })}
      </div>
      {group === "Colori e sfondo" && <p className="text-xs text-muted-foreground">{hasImage ? "Il velo scuro aiuta a leggere il testo sulla foto. Il contrasto reale va verificato nell’anteprima: dipende anche dall’immagine." : "Il colore di sfondo è visibile senza foto. Aggiungi un’immagine per regolare il velo scuro."}</p>}
    </fieldset>)}
    {children && <div className="space-y-3 border-t pt-3">{children}</div>}
  </section>;
}
