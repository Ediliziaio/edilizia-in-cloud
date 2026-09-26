/**
 * I campi dei riquadri «racconto» nel passo Economia (Conto Termico, Casa Full
 * Electric): numeri e testi che si salvano quando si esce dal campo, le scelte a
 * pillola e la scheda tecnica a righe.
 */
import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Plus, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";

/** «4.800» sono migliaia, «8,5» e «8.5» decimali. */
const numeroDaTesto = (t: string): number | null => {
  const s = t.trim().replace(/[€\s]/g, "");
  const pulito = /^\d{1,3}(\.\d{3})+(,\d+)?$/.test(s) ? s.replace(/\./g, "").replace(",", ".") : s.replace(",", ".");
  if (!pulito) return null;
  const n = Number(pulito);
  return Number.isFinite(n) ? n : null;
};

/** Il numero come lo si scrive: «1.700», «16.000», «0,28». Si rilegge con numeroDaTesto. */
const testoDaNumero = (n: number): string => {
  const [intera, decimali] = String(Math.abs(n)).split(".");
  return `${n < 0 ? "-" : ""}${intera.replace(/\B(?=(\d{3})+(?!\d))/g, ".")}${decimali ? `,${decimali}` : ""}`;
};

/** Un numero che si salva quando si esce dal campo, non a ogni tasto. */
export function CampoNumero({ id, etichetta, valore, onCommit, suffisso, aiuto }: { id: string; etichetta: string; valore: number | null; onCommit: (v: number | null) => void; suffisso?: string; aiuto?: string }) {
  const [testo, setTesto] = useState(valore == null ? "" : testoDaNumero(valore));
  return (
    <div className="space-y-1">
      <Label htmlFor={id} className="text-xs">{etichetta}</Label>
      <div className="relative">
        <Input
          id={id}
          inputMode="decimal"
          value={testo}
          onChange={(e) => setTesto(e.target.value)}
          onBlur={() => onCommit(numeroDaTesto(testo))}
          className={cn("h-9", suffisso && "pr-12")}
        />
        {suffisso ? <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-xs text-muted-foreground">{suffisso}</span> : null}
      </div>
      {/* Telefono: niente testo d'aiuto sotto il campo. */}
      {aiuto ? <p className="text-[10px] leading-snug text-muted-foreground max-sm:hidden">{aiuto}</p> : null}
    </div>
  );
}

export function CampoTesto({ id, etichetta, valore, onCommit, segnaposto }: { id: string; etichetta: string; valore: string; onCommit: (v: string) => void; segnaposto?: string }) {
  const [testo, setTesto] = useState(valore);
  return (
    <div className="space-y-1">
      <Label htmlFor={id} className="text-xs">{etichetta}</Label>
      <Input id={id} value={testo} placeholder={segnaposto} onChange={(e) => setTesto(e.target.value)} onBlur={() => testo.trim() !== valore && onCommit(testo.trim())} className="h-9" />
    </div>
  );
}

export function Scelta<T extends string | number | null>({ valore, opzioni, onChange }: { valore: T; opzioni: { valore: T; etichetta: string }[]; onChange: (v: T) => void }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {opzioni.map((o) => (
        <button
          key={String(o.valore)}
          type="button"
          aria-pressed={valore === o.valore}
          onClick={() => onChange(o.valore)}
          // Sotto i 768px: 32px (senza tap-compact la regola globale del tocco la portava a 44).
          className={cn(
            "tap-compact rounded-full border px-3 py-1 text-xs font-medium transition-colors max-md:h-8",
            valore === o.valore ? "border-orange-300 bg-orange-50 text-orange-800" : "border-slate-200 bg-white text-slate-600 hover:border-orange-200",
          )}
        >
          {o.etichetta}
        </button>
      ))}
    </div>
  );
}

/** La scheda tecnica a righe «voce → valore», come esce nel PDF (fino a nove righe). */
export function SchedaTecnica({ etichetta, righe, onChange, segnaposto = ["Potenza termica", "8 kW"] }: {
  etichetta: string;
  righe: { etichetta: string; valore: string }[];
  onChange: (righe: { etichetta: string; valore: string }[]) => void;
  segnaposto?: [string, string];
}) {
  // Le righe hanno campi non controllati: dopo una cancellazione si ridisegnano
  // tutte, altrimenti la riga che sale mostrerebbe il testo di quella tolta.
  const [giro, setGiro] = useState(0);
  return (
    <div className="space-y-1.5">
      <Label className="text-xs">{etichetta}</Label>
      {righe.map((x, i) => (
        // Sul telefono voce e valore vanno su due righe: affiancati, la voce si tagliava.
        <div key={`${giro}-${i}`} className="flex flex-wrap gap-2 rounded-lg border p-2 sm:flex-nowrap sm:border-0 sm:p-0">
          <Input aria-label="Caratteristica" defaultValue={x.etichetta} placeholder={segnaposto[0]} className="h-8 basis-full text-xs sm:basis-auto sm:flex-1"
            onBlur={(e) => onChange(righe.map((y, j) => (j === i ? { ...y, etichetta: e.target.value.trim() } : y)))} />
          <Input aria-label="Valore" defaultValue={x.valore} placeholder={segnaposto[1]} className="h-8 min-w-0 flex-1 text-xs sm:w-40 sm:flex-none"
            onBlur={(e) => onChange(righe.map((y, j) => (j === i ? { ...y, valore: e.target.value.trim() } : y)))} />
          <Button type="button" variant="ghost" size="icon" className="h-8 w-8 shrink-0" aria-label="Togli la riga"
            onClick={() => { setGiro((g) => g + 1); onChange(righe.filter((_, j) => j !== i)); }}>
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </div>
      ))}
      {righe.length < 9 ? (
        <Button type="button" variant="outline" size="sm" className="h-8 text-xs"
          onClick={() => onChange([...righe, { etichetta: "Caratteristica", valore: "da scrivere" }])}>
          <Plus className="mr-1 h-3.5 w-3.5" /> Aggiungi una riga
        </Button>
      ) : null}
    </div>
  );
}
