import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import type { BozzaComputo } from "@/lib/computo/editorNativo";

const formati = [
  ["cliente", "Preventivo cliente", "Impaginato per il cliente: capitoli, voci e totale."],
  ["tecnico", "Computo dettagliato con prezzi e misure", "Come PriMus: righe di misura, riporti e riepilogo."],
  ["senza-prezzi", "Computo senza prezzi", "Le quantità per chiedere offerte, senza importi."],
  ["riepilogo", "Riepilogo per capitoli", "Una pagina: i capitoli con il loro importo."],
  ["elenco-prezzi", "Elenco prezzi unitari", "Ogni voce col prezzo in cifre e in lettere, senza quantità."],
] as const;

/** Il formato scelto a colpo d'occhio, nel passo Documento: quattro schede invece di una tendina. */
export function ComputoFormatoSchede({ value, onChange, disabled }: {
  value: BozzaComputo["formatoPdf"]; onChange: (value: BozzaComputo["formatoPdf"]) => void; disabled?: boolean;
}) {
  return <div role="radiogroup" aria-label="Documento PDF" className="grid gap-2 sm:grid-cols-2">
    {formati.map(([v, titolo, testo]) => {
      const scelto = (value ?? "cliente") === v;
      return <button key={v} type="button" role="radio" aria-checked={scelto} disabled={disabled} onClick={() => onChange(v)}
        className={`rounded-lg border p-3 text-left transition-colors disabled:cursor-not-allowed disabled:opacity-60 ${scelto ? "border-orange-400 bg-orange-50 ring-1 ring-orange-300" : "border-slate-200 bg-white hover:border-orange-200"}`}>
        <span className="block text-sm font-medium text-slate-900">{titolo}</span>
        <span className="mt-0.5 block text-xs text-muted-foreground">{testo}</span>
      </button>;
    })}
  </div>;
}

export function ComputoFormatoSelect({ value, onChange, disabled, id, label }: {
  value: BozzaComputo["formatoPdf"]; onChange: (value: BozzaComputo["formatoPdf"]) => void;
  disabled?: boolean; id?: string; label: string;
}) {
  return <Select value={value ?? "cliente"} onValueChange={value => onChange(value as BozzaComputo["formatoPdf"])} disabled={disabled}>
    <SelectTrigger id={id} aria-label={label} className="min-w-0 bg-white text-left"><SelectValue /></SelectTrigger>
    <SelectContent className="max-w-[calc(100vw-2rem)]">
      {formati.map(([value, title]) => <SelectItem key={value} value={value} className="py-2.5 data-[state=checked]:bg-blue-50 data-[state=checked]:text-blue-950"><span className="whitespace-normal">{title}</span></SelectItem>)}
    </SelectContent>
  </Select>;
}

export function ComputoOpzione({ label, checked, disabled, onChange }: {
  label: string; checked: boolean; disabled?: boolean; onChange: (value: boolean) => void;
}) {
  return <label className={`flex min-h-11 cursor-pointer items-center justify-between gap-4 border-b py-2 text-sm last:border-0 ${disabled ? "cursor-not-allowed text-muted-foreground" : "text-foreground"}`}>
    <span className="min-w-0">{label}</span>
    <Switch aria-label={label} checked={checked} disabled={disabled} onCheckedChange={onChange} />
  </label>;
}
