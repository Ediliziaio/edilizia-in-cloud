import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import type { BozzaComputo } from "@/lib/computo/editorNativo";

const formati = [
  ["cliente", "Preventivo cliente"],
  ["tecnico", "Computo dettagliato con prezzi e misure"],
  ["senza-prezzi", "Computo senza prezzi"],
  ["riepilogo", "Riepilogo per capitoli"],
] as const;

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
  return <label className={`flex min-h-12 cursor-pointer items-center justify-between gap-4 border-b py-3 text-sm last:border-0 ${disabled ? "cursor-not-allowed text-muted-foreground" : "text-foreground"}`}>
    <span className="min-w-0">{label}</span>
    <Switch aria-label={label} checked={checked} disabled={disabled} onCheckedChange={onChange} />
  </label>;
}
