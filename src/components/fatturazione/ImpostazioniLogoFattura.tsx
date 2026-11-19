import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { leggiLogoDocumentoFiscale, type LogoDocumentoFiscale } from "../../../supabase/functions/_shared/logoDocumentoFiscale";

export function ImpostazioniLogoFattura({ valore, onChange }: { valore: unknown; onChange: (c: LogoDocumentoFiscale) => void }) {
  const c = leggiLogoDocumentoFiscale(valore);
  return <div className="space-y-4">
    <div role="group" aria-label="Posizione del logo" className="space-y-2">
      <p className="text-sm font-medium">Posizione del logo</p>
      <div className="flex flex-wrap gap-2">{(["sinistra", "centro", "destra"] as const).map(p => <Button key={p} type="button" size="sm" variant={c.posizione === p ? "default" : "outline"} aria-pressed={c.posizione === p} onClick={() => onChange({ ...c, posizione: p })}>{p === "sinistra" ? "In alto a sinistra" : p === "centro" ? "In alto al centro" : "In alto a destra"}</Button>)}</div>
    </div>
    <div className="space-y-2"><Label htmlFor="fattura-logo-dimensione">Dimensione del logo · {c.dimensione}%</Label>
      <Input id="fattura-logo-dimensione" type="range" min={50} max={200} step={5} value={c.dimensione} aria-valuetext={`${c.dimensione}%`} onChange={e => onChange({ ...c, dimensione: Number(e.target.value) })} className="h-9 p-0" />
    </div>
    <div className="space-y-2"><Label htmlFor="fattura-logo-spazio">Distanza dall'alto · {c.spazioSopra} mm</Label>
      <Input id="fattura-logo-spazio" type="range" min={0} max={30} step={1} value={c.spazioSopra} aria-valuetext={`${c.spazioSopra} millimetri`} onChange={e => onChange({ ...c, spazioSopra: Number(e.target.value) })} className="h-9 p-0" />
    </div>
    <p className="text-xs text-muted-foreground">Il logo mantiene le proporzioni. La posizione al centro o a destra usa una riga sopra i dati, per evitare sovrapposizioni.</p>
    <Button type="button" size="sm" variant="ghost" onClick={() => onChange(leggiLogoDocumentoFiscale(null))}>Ripristina il logo di serie</Button>
  </div>;
}
