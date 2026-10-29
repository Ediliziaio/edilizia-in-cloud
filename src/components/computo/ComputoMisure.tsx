import { useEffect, useRef, type KeyboardEvent } from "react";
import { Copy, Plus, Ruler, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { arrotondaDecimale, misuraVuota, quantitaMisura, type VoceEditor } from "@/lib/computo/editorNativo";

const CAMPI = [
  ["descrizione", "Ambiente o riferimento", "Riferimento"],
  ["parti", "Parti uguali", "Par.ug."],
  ["lunghezza", "Lunghezza", "Lung."],
  ["larghezza", "Larghezza", "Larg."],
  ["altezza", "Altezza / peso", "H/peso"],
  ["formula", "Formula", "Formula"],
] as const;
type Campo = (typeof CAMPI)[number][0];

/**
 * Le righe di misura come in PriMus: una riga per misura, l'intestazione una
 * volta sola, Invio per andare alla riga sotto.
 *
 * Fino al 29/10/2026 ogni misura era una scheda di sei campi su due righe,
 * alta circa 220 pixel: le 39 misure della voce del cappotto del computo di
 * Genzano occupavano 8.671 pixel, oltre dieci schermate da scorrere per una
 * voce sola. Chi fa computi lavora a tastiera, riga dopo riga.
 *
 * Sul telefono resta la scheda con le etichette: una riga di nove colonne in
 * 375 pixel non si legge. Il DOM è uno solo; cambia solo la griglia.
 */
const GRIGLIA = "sm:grid-cols-[1.5rem_minmax(0,2.2fr)_repeat(4,minmax(3.25rem,0.7fr))_minmax(0,1.2fr)_minmax(8.5rem,auto)]";

export default function ComputoMisure({ misure, unita, onChange }: {
  misure: VoceEditor["misure"]; unita?: string; onChange: (misure: VoceEditor["misure"]) => void;
}) {
  const contenitore = useRef<HTMLDivElement>(null);
  const daFocalizzare = useRef<{ riga: number; campo: Campo } | null>(null);
  useEffect(() => {
    const f = daFocalizzare.current; if (!f) return;
    daFocalizzare.current = null;
    contenitore.current?.querySelector<HTMLInputElement>(`[data-riga="${f.riga}"][data-campo="${f.campo}"]`)?.focus();
  }, [misure.length]);

  const aggiungi = () => {
    daFocalizzare.current = { riga: misure.length, campo: "descrizione" };
    onChange([...misure, misuraVuota()]);
  };
  const invio = (e: KeyboardEvent<HTMLInputElement>, i: number, campo: Campo) => {
    if (e.key !== "Enter" || e.nativeEvent.isComposing) return;
    e.preventDefault();
    if (i < misure.length - 1) {
      contenitore.current?.querySelector<HTMLInputElement>(`[data-riga="${i + 1}"][data-campo="${campo}"]`)?.focus();
    } else if (misure.length < 500) aggiungi();
  };

  const quantita = misure.map(quantitaMisura);
  const complete = quantita.every(n => n !== null);
  const somma = complete ? arrotondaDecimale(quantita.reduce<number>((s, n) => s + n!, 0)) : null;
  // «always»: in italiano il browser non raggruppa le cifre sotto 10.000 (3104,39); PriMus sì.
  const numero = (n: number) => n.toLocaleString("it-IT", { minimumFractionDigits: 2, maximumFractionDigits: 2, useGrouping: "always" });

  return <section aria-label="Misure della lavorazione" className="border-t pt-4">
    <div className="flex flex-wrap items-center justify-between gap-2">
      <h4 className="flex items-center gap-2 text-sm font-semibold"><Ruler className="h-4 w-4 text-muted-foreground" />Righe di misura{misure.length ? ` (${misure.length})` : ""}</h4>
      <Button size="sm" variant="outline" disabled={misure.length >= 500} onClick={aggiungi}><Plus className="mr-1 h-4 w-4" />Misura</Button>
    </div>
    {!!misure.length && <div ref={contenitore} className="mt-3">
      <div aria-hidden="true" className={`hidden gap-1.5 border-b pb-1.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground sm:grid ${GRIGLIA}`}>
        <span>#</span>{CAMPI.map(([key, , breve]) => <span key={key} className={key === "descrizione" || key === "formula" ? "" : "text-right"}>{breve}</span>)}
        <span className="text-right">Quantità</span>
      </div>
      <div className="divide-y sm:divide-y-0">{misure.map((m, i) => {
        const conFormula = !!m.formula.trim();
        return <div key={m.id} role="group" aria-label={`Misura ${i + 1}`} className={`grid grid-cols-2 gap-x-3 gap-y-2 py-3 sm:items-center sm:gap-x-1.5 sm:gap-y-0 sm:py-1 ${GRIGLIA}`}>
          <span aria-hidden="true" className="hidden text-xs tabular-nums text-muted-foreground sm:block">{i + 1}</span>
          {CAMPI.map(([key, label]) => {
            const numerico = key !== "descrizione" && key !== "formula";
            return <label key={key} className={`min-w-0 space-y-1 sm:space-y-0 ${key === "descrizione" || key === "formula" ? "col-span-2 sm:col-span-1" : ""}`}>
              <span className="block text-xs text-muted-foreground sm:sr-only">{label}</span>
              <Input data-riga={i} data-campo={key} maxLength={key === "descrizione" ? 1000 : key === "formula" ? 500 : 40}
                inputMode={numerico ? "decimal" : "text"} aria-label={`${key} misura ${i + 1}`} value={m[key]}
                disabled={conFormula && numerico}
                placeholder={key === "formula" && i === 0 ? "es. (3+2)*2,4" : undefined}
                className={`h-9 sm:h-8 sm:px-2 sm:text-sm ${numerico ? "text-right tabular-nums" : ""} ${key === "formula" ? "font-mono sm:text-xs" : ""}`}
                onKeyDown={e => invio(e, i, key)}
                onChange={e => onChange(misure.map(r => r.id === m.id ? { ...r, [key]: e.target.value } : r))} />
            </label>;
          })}
          <div className="order-first col-span-2 flex items-center justify-between gap-1 sm:order-none sm:col-span-1 sm:justify-end">
            <span className="text-sm font-medium sm:hidden">Misura {i + 1}</span>
            <div className="flex items-center gap-0.5">
              <Button size="icon" variant="ghost" className="h-8 w-8" title="Duplica misura" aria-label={`Duplica misura ${i + 1}`} disabled={misure.length >= 500}
                onClick={() => onChange([...misure.slice(0, i + 1), { ...m, id: crypto.randomUUID() }, ...misure.slice(i + 1)])}><Copy className="h-3.5 w-3.5" /></Button>
              <Button size="icon" variant="ghost" className="h-8 w-8" title="Elimina misura" aria-label={`Elimina misura ${i + 1}`}
                onClick={() => onChange(misure.filter(r => r.id !== m.id))}><Trash2 className="h-3.5 w-3.5" /></Button>
              <output className={`min-w-[4.5rem] text-right text-sm font-semibold tabular-nums ${quantita[i] === null ? "text-amber-700" : quantita[i]! < 0 ? "text-red-700" : ""}`} aria-label={`Quantità misura ${i + 1}`}>
                {quantita[i] === null ? "Da completare" : numero(quantita[i]!)}
              </output>
            </div>
          </div>
        </div>;
      })}</div>
      <div className="mt-2 flex flex-wrap items-center justify-between gap-2 border-t pt-2">
        <div className="flex items-center gap-3">
          <Button size="sm" variant="ghost" disabled={misure.length >= 500} onClick={aggiungi}><Plus className="mr-1 h-4 w-4" />Aggiungi riga</Button>
          <span className="hidden text-xs text-muted-foreground sm:inline">Invio porta alla riga sotto; dall'ultima ne apre una nuova.</span>
        </div>
        <span className="text-sm tabular-nums">{complete
          ? <>Sommano <strong>{numero(somma!)}{unita ? ` ${unita}` : ""}</strong></>
          : <span className="text-amber-700">Righe da completare</span>}</span>
      </div>
    </div>}
  </section>;
}
