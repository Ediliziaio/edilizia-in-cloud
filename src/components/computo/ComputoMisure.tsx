import { Copy, Plus, Ruler, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { misuraVuota, quantitaMisura, type VoceEditor } from "@/lib/computo/editorNativo";

export default function ComputoMisure({ misure, onChange }: {
  misure: VoceEditor["misure"]; onChange: (misure: VoceEditor["misure"]) => void;
}) {
  const aggiungi = () => onChange([...misure, misuraVuota()]);
  return <section aria-label="Misure della lavorazione" className="border-t pt-4">
    <div className="flex flex-wrap items-center justify-between gap-2">
      <h4 className="flex items-center gap-2 text-sm font-semibold"><Ruler className="h-4 w-4 text-muted-foreground" />Righe di misura{misure.length ? ` (${misure.length})` : ""}</h4>
      <Button size="sm" variant="outline" disabled={misure.length >= 500} onClick={aggiungi}><Plus className="mr-1 h-4 w-4" />Misura</Button>
    </div>
    <div className="divide-y">{misure.map((m, i) => <div key={m.id} className="space-y-3 py-4">
      <div className="flex items-center justify-between gap-2 text-sm">
        <span className="font-medium">Misura {i + 1}</span>
        <div className="flex items-center gap-1">
          <output className="mr-2 text-right text-sm font-semibold tabular-nums" aria-label={`Quantità misura ${i + 1}`}>{quantitaMisura(m)?.toLocaleString("it-IT", { maximumFractionDigits: 6 }) ?? "Da completare"}</output>
          <Button size="icon" variant="ghost" title="Duplica misura" aria-label={`Duplica misura ${i + 1}`} disabled={misure.length >= 500} onClick={() => onChange([...misure.slice(0, i + 1), { ...m, id: crypto.randomUUID() }, ...misure.slice(i + 1)])}><Copy className="h-4 w-4" /></Button>
          <Button size="icon" variant="ghost" title="Elimina misura" aria-label={`Elimina misura ${i + 1}`} onClick={() => onChange(misure.filter(r => r.id !== m.id))}><Trash2 className="h-4 w-4" /></Button>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {([["descrizione", "Ambiente o riferimento"], ["parti", "Parti uguali"], ["lunghezza", "Lunghezza"], ["larghezza", "Larghezza"], ["altezza", "Altezza / peso"], ["formula", "Formula"]] as const).map(([key, label]) =>
          <label key={key} className={`min-w-0 space-y-1.5 ${key === "descrizione" || key === "formula" ? "col-span-2" : ""}`}>
            <span className="block text-xs text-muted-foreground">{label}</span>
            <Input maxLength={key === "descrizione" ? 1000 : key === "formula" ? 500 : 40} inputMode={key !== "descrizione" && key !== "formula" ? "decimal" : "text"}
              aria-label={`${key} misura ${i + 1}`} value={m[key]} disabled={!!m.formula.trim() && key !== "formula" && key !== "descrizione"}
              onChange={e => onChange(misure.map(r => r.id === m.id ? { ...r, [key]: e.target.value } : r))} />
          </label>)}
      </div>
    </div>)}</div>
  </section>;
}
