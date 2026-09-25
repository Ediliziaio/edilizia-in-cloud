import { useId, type ReactNode } from "react";
import { ChevronDown, Palette } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
export { coverStyleOnly } from "@/lib/preventivi/templateCoverStyle";

export interface CoverTextValue {
  eyebrow?: string | null;
  title?: string | null;
  subtitle?: string | null;
  dynamicSubtitle?: string | null;
}

/** Content and bindings are sector-specific; interaction, names and spacing are not. */
export function TemplateCoverTextFields({ value, onChange, placeholders, dynamicSubtitle = false, hideEyebrow = false }: {
  value: CoverTextValue;
  onChange: (field: keyof CoverTextValue, value: string | null) => void;
  placeholders?: (value: string, onChange: (value: string) => void) => ReactNode;
  dynamicSubtitle?: boolean;
  hideEyebrow?: boolean;
}) {
  const id = useId();
  const fields = [
    { key: "eyebrow", label: "Occhiello copertina", hint: "Una breve indicazione del tipo di intervento, sopra il titolo." },
    { key: "title", label: "Titolo copertina", hint: "Il messaggio principale. Puoi andare a capo per dividerlo in due righe." },
    { key: "subtitle", label: "Sottotitolo copertina", hint: "Una sintesi della proposta. Facoltativo." },
    ...(dynamicSubtitle ? [{ key: "dynamicSubtitle", label: "Sottotitolo dinamico", hint: "Se compilato, sostituisce il sottotitolo sopra usando i dati del preventivo." }] : []),
  ] as const;
  return <section data-cover-text-fields aria-label="Testi copertina" className="min-w-0 space-y-4 rounded-xl border bg-card p-4">
    <div><h3 className="text-sm font-semibold">Testi copertina</h3><p className="mt-1 text-xs text-muted-foreground">Modifica i testi e controlla il risultato nell’anteprima del documento.</p></div>
    {fields.filter(field => !hideEyebrow || field.key !== "eyebrow").map(field => {
      const key = field.key as keyof CoverTextValue;
      const change = (text: string) => onChange(key, text || null);
      return <div key={key} className="min-w-0 space-y-1.5">
        <label htmlFor={`${id}-${key}`} className="block text-sm font-medium">{field.label}</label>
        {key === "eyebrow"
          ? <Input id={`${id}-${key}`} aria-describedby={`${id}-${key}-hint`} value={value[key] ?? ""} onChange={e => change(e.target.value)} />
          : <Textarea id={`${id}-${key}`} aria-describedby={`${id}-${key}-hint`} rows={3} value={value[key] ?? ""} onChange={e => change(e.target.value)} />}
        <p id={`${id}-${key}-hint`} className="text-xs text-muted-foreground">{field.hint}</p>
        {placeholders?.(value[key] ?? "", change)}
      </div>;
    })}
  </section>;
}

export interface CoverStyleChoice {
  id: string;
  nome: string;
  descrizione: string;
  tag: string;
  swatchBg: string;
  swatchText: string;
}

/** No approximate PDF here: these swatches describe styles, never the final document. */
export function TemplateCoverStylePicker({ presets, activeId, onApply }: {
  presets: readonly CoverStyleChoice[];
  activeId?: string | null;
  onApply: (id: string) => void;
}) {
  const active = presets.find(p => p.id === activeId);
  return <details data-cover-style-picker className="group rounded-xl border bg-card">
    <summary className="flex cursor-pointer list-none items-center gap-3 p-4 text-sm [&::-webkit-details-marker]:hidden">
      <Palette className="h-4 w-4 shrink-0 text-orange-600" aria-hidden="true" />
      <span className="min-w-0 flex-1"><span className="block font-semibold">Stile copertina</span><span className="block text-xs text-muted-foreground">{active?.nome ?? "Personalizzato"} · {presets.length} stili disponibili</span></span>
      <ChevronDown className="h-4 w-4 shrink-0 transition-transform group-open:rotate-180" aria-hidden="true" />
    </summary>
    <div className="space-y-3 border-t p-4">
      <p className="text-xs text-muted-foreground">Cambia colori, caratteri e disposizione. I testi e la foto scelta restano invariati. Per una copertina senza foto, usa Rimuovi nel riquadro immagine. Controlla il risultato nell’anteprima del documento.</p>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        {presets.map(p => <button key={p.id} type="button" aria-label={`Applica stile ${p.nome}`} aria-pressed={activeId === p.id} title={p.descrizione} onClick={() => onApply(p.id)} className={cn("flex min-w-0 items-center gap-3 rounded-lg border p-3 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-500", activeId === p.id ? "border-orange-500 bg-orange-50/50" : "hover:border-orange-300")}>
          <span aria-hidden="true" className="flex h-12 w-10 shrink-0 items-center justify-center rounded border text-lg font-semibold" style={{ backgroundColor: p.swatchBg, color: p.swatchText }}>Aa</span>
          <span className="min-w-0"><span className="block text-sm font-medium">{p.nome}</span><span className="block text-xs text-muted-foreground">{p.tag}</span></span>
        </button>)}
      </div>
    </div>
  </details>;
}
