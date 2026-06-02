// Autocompletamento comune/CAP basato sul dataset ISTAT (public/data/comuni-istat.json).
// Cerca per nome comune o per CAP; alla selezione restituisce comune, CAP,
// sigla/provincia e regione così il form può riempire tutti i campi indirizzo.

import { useEffect, useRef, useState } from "react";
import { Input } from "@/components/ui/input";
import { MapPin, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { useComuni, type Comune } from "@/lib/comuni/useComuni";

interface ComuneAutocompleteProps {
  /** Testo nel campo. */
  value: string;
  /** Aggiornamento del testo digitato. */
  onValueChange: (v: string) => void;
  /** Selezione di un comune dall'elenco (riempi qui tutti i campi indirizzo). */
  onSelect: (c: Comune) => void;
  /**
   * Cosa rappresenta questo campo: "comune" mostra il nome, "cap" mostra il CAP.
   * In entrambi i casi la ricerca funziona sia per nome che per CAP.
   */
  mode?: "comune" | "cap";
  placeholder?: string;
  id?: string;
  className?: string;
  disabled?: boolean;
}

export function ComuneAutocomplete({
  value,
  onValueChange,
  onSelect,
  mode = "comune",
  placeholder,
  id,
  className,
  disabled,
}: ComuneAutocompleteProps) {
  const { ensure, search, loading, ready } = useComuni();
  const [open, setOpen] = useState(false);
  const [results, setResults] = useState<Comune[]>([]);
  const [highlight, setHighlight] = useState(0);
  const wrapRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Chiudi il dropdown al click esterno
  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  const runSearch = (q: string) => {
    const r = search(q);
    setResults(r);
    setHighlight(0);
    setOpen(r.length > 0);
  };

  // Quando il dataset diventa pronto (dopo il focus), rilancia la ricerca corrente
  useEffect(() => {
    if (ready && document.activeElement === inputRef.current && value.trim()) {
      runSearch(value);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready]);

  const handleChange = (v: string) => {
    onValueChange(v);
    if (ready) runSearch(v);
    else ensure();
  };

  const pick = (c: Comune) => {
    onSelect(c);
    onValueChange(mode === "cap" ? c.cap : c.comune);
    setResults([]);
    setOpen(false);
  };

  const ph = placeholder ?? (mode === "cap" ? "Cerca CAP o comune…" : "Cerca comune o CAP…");

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!open || results.length === 0) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlight((h) => Math.min(h + 1, results.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlight((h) => Math.max(h - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const c = results[highlight];
      if (c) pick(c);
    } else if (e.key === "Escape") {
      setOpen(false);
    }
  };

  return (
    <div ref={wrapRef} className={cn("relative", className)}>
      <div className="relative">
        <Input
          id={id}
          ref={inputRef}
          value={value}
          disabled={disabled}
          autoComplete="off"
          placeholder={ph}
          onFocus={() => {
            ensure();
            if (ready && value.trim()) runSearch(value);
          }}
          onChange={(e) => handleChange(e.target.value)}
          onKeyDown={onKeyDown}
        />
        {loading && (
          <Loader2 className="pointer-events-none absolute right-2.5 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-muted-foreground" />
        )}
      </div>
      {open && results.length > 0 && (
        <div className="absolute z-50 mt-1 max-h-64 w-full overflow-auto rounded-md border bg-popover py-1 shadow-md">
          {results.map((c, i) => (
            <button
              key={`${c.comune}-${c.cap}-${c.provinciaSigla}-${i}`}
              type="button"
              className={cn(
                "flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm",
                i === highlight ? "bg-accent" : "hover:bg-accent/60",
              )}
              onMouseEnter={() => setHighlight(i)}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => pick(c)}
            >
              <MapPin className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
              <span className="truncate font-medium">{c.comune}</span>
              <span className="ml-auto shrink-0 text-xs text-muted-foreground">
                {c.cap} · {c.provinciaSigla} · {c.regione}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
