/**
 * Editor degli scaglioni di provvigione: righe «da – a – %», la tabella
 * standard con un clic e un'anteprima su un venduto d'esempio, così si vede
 * subito se la tabella è quella giusta.
 */
import { useState } from "react";
import { Plus, Trash2, Wand2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  SCAGLIONI_STANDARD, aliquotaEffettiva, provvigioneAScaglioni, righeDaScaglioni, scaglioniDaRighe, type RigaScaglione,
} from "./provvigioni";
import { eur } from "./formato";

export function ScaglioniEditor({ righe, onChange }: { righe: RigaScaglione[]; onChange: (r: RigaScaglione[]) => void }) {
  const [esempio, setEsempio] = useState("75000");
  const validi = scaglioniDaRighe(righe);
  const base = Number(esempio) || 0;
  const incomplete = righe.length - validi.length;
  const set = (i: number, patch: Partial<RigaScaglione>) => onChange(righe.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  const aggiungi = () => {
    const ultimo = righe[righe.length - 1];
    onChange([...righe, { da: ultimo?.a || "0", a: "", pct: "" }]);
  };

  return (
    <div className="grid gap-2 rounded-lg border border-dashed p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Scaglioni sul venduto imponibile del mese</div>
        <Button type="button" variant="outline" size="sm" className="h-7 gap-1.5 text-xs" onClick={() => onChange(righeDaScaglioni(SCAGLIONI_STANDARD))}>
          <Wand2 className="h-3.5 w-3.5" /> Tabella standard
        </Button>
      </div>
      <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)_4.5rem_auto] items-center gap-2 text-[10px] font-medium uppercase text-muted-foreground">
        <span>Oltre</span><span>Fino a</span><span>%</span><span />
      </div>
      {righe.map((r, i) => (
        <div key={i} className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)_4.5rem_auto] items-center gap-2">
          <Input type="number" min={0} value={r.da} onChange={(e) => set(i, { da: e.target.value })} className="h-8" aria-label="Oltre" />
          <Input type="number" min={0} value={r.a} onChange={(e) => set(i, { a: e.target.value })} className="h-8" placeholder="senza limite" aria-label="Fino a" />
          <div className="relative">
            <Input type="number" min={0} step="0.05" value={r.pct} onChange={(e) => set(i, { pct: e.target.value })} className="h-8 pr-5" aria-label="Percentuale" />
            <span className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">%</span>
          </div>
          <Button type="button" variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-destructive" onClick={() => onChange(righe.filter((_, j) => j !== i))} aria-label="Togli scaglione">
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      ))}
      <Button type="button" variant="outline" size="sm" className="w-fit gap-1.5" onClick={aggiungi}><Plus className="h-3.5 w-3.5" /> Aggiungi scaglione</Button>
      <div className="flex flex-wrap items-center gap-2 border-t pt-2 text-xs text-muted-foreground">
        <span>Prova: con un venduto di</span>
        <Input type="number" value={esempio} onChange={(e) => setEsempio(e.target.value)} className="h-7 w-28" aria-label="Venduto d'esempio" />
        <span>
          la provvigione è <strong className="text-foreground">{eur(provvigioneAScaglioni(base, validi))}</strong>
          {base > 0 && validi.length > 0 && <> ({aliquotaEffettiva(base, validi).toLocaleString("it-IT")}% effettivo)</>}
        </span>
        {incomplete > 0 && <span className="text-amber-700 dark:text-amber-400">· {incomplete} {incomplete === 1 ? "riga incompleta non conta" : "righe incomplete non contano"}</span>}
      </div>
      <p className="text-[11px] text-muted-foreground">Ogni percentuale vale solo sulla fetta di venduto del suo scaglione: 75.000 € con la tabella standard = 3% di 50.000 + 2,5% di 25.000 = 2.125 €.</p>
    </div>
  );
}
