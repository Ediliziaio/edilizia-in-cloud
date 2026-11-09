import { useMemo, useState, type ReactElement } from "react";
import { X } from "lucide-react";
import { Input } from "@/components/ui/input";

/** Ricerca nell'elenco, senza menu a comparsa: dentro un popup quelli danno problemi di scorrimento. */
export function ScegliInElenco({ valore, opzioni, recenti = [], etichetta, onScegli }: {
  valore: string;
  opzioni: ReadonlyArray<{ id: string; name: string }>;
  recenti?: readonly string[];
  etichetta: string;
  onScegli: (id: string) => void;
}): ReactElement {
  const [testo, setTesto] = useState("");
  const [aperto, setAperto] = useState(false);
  const scelto = opzioni.find((o) => o.id === valore);
  const risultati = useMemo(() => {
    const parole = testo.toLowerCase().split(/\s+/).filter(Boolean);
    const trovati = opzioni.filter((o) => parole.every((p) => o.name.toLowerCase().includes(p)));
    const peso = (id: string): number => { const i = recenti.indexOf(id); return i < 0 ? recenti.length : i; };
    return [...trovati].sort((a, b) => peso(a.id) - peso(b.id)).slice(0, 8);
  }, [opzioni, recenti, testo]);
  if (scelto) {
    return (
      <div className="flex h-9 min-w-0 items-center justify-between gap-2 rounded-md border bg-muted/30 pl-3 pr-1">
        <span className="truncate text-sm">{scelto.name}</span>
        <button type="button" aria-label="Cambia scelta" className="tap-compact rounded p-1 text-muted-foreground hover:text-foreground" onClick={() => { onScegli(""); setTesto(""); }}><X className="h-3.5 w-3.5" /></button>
      </div>
    );
  }
  return (
    <div className="min-w-0">
      <Input className="h-9" placeholder={etichetta} aria-label={etichetta} value={testo}
        onChange={(e) => setTesto(e.target.value)} onFocus={() => setAperto(true)} onBlur={() => setAperto(false)} />
      {aperto && (
        <ul className="mt-1 max-h-48 overflow-y-auto rounded-md border bg-popover text-sm">
          {risultati.map((o) => (
            <li key={o.id}>
              <button type="button" className="tap-compact block w-full truncate px-3 py-1.5 text-left hover:bg-muted"
                onMouseDown={(e) => e.preventDefault()} onClick={() => { onScegli(o.id); setAperto(false); }}>{o.name}</button>
            </li>
          ))}
          {risultati.length === 0 && <li className="px-3 py-2 text-muted-foreground">Nessun risultato</li>}
        </ul>
      )}
    </div>
  );
}
