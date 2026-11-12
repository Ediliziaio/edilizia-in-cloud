/**
 * Un campo di testo con le proposte sotto (12/11/2026): si cerca fra i mezzi o il
 * personale dell'azienda, ma si può sempre scrivere a mano. Una targa che non è fra
 * i mezzi registrati (il furgone in prestito) non deve bloccare la bolla.
 */
import { useId, useMemo, useState } from "react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

export interface Proposta {
  valore: string;
  etichetta: string;
  dettaglio?: string | null;
}

const pulito = (t: string) => t.toLowerCase().replace(/[\s.-]/g, "");

/** Le proposte che contengono quello che si è scritto, nel valore o nell'etichetta. */
export function filtraProposte(proposte: ReadonlyArray<Proposta>, testo: string, massimo = 8): Proposta[] {
  const q = pulito(testo);
  const trovate = q
    ? proposte.filter((p) => pulito(p.valore).includes(q) || pulito(p.etichetta).includes(q) || pulito(p.dettaglio ?? "").includes(q))
    : [...proposte];
  return trovate.slice(0, massimo);
}

export function CampoConProposte({
  valore,
  onChange,
  proposte,
  ariaLabel,
  placeholder,
  className,
  maiuscolo = false,
}: {
  valore: string;
  onChange: (v: string) => void;
  proposte: ReadonlyArray<Proposta>;
  ariaLabel: string;
  placeholder?: string;
  className?: string;
  maiuscolo?: boolean;
}) {
  const id = useId();
  const [aperto, setAperto] = useState(false);
  const visibili = useMemo(() => filtraProposte(proposte, valore), [proposte, valore]);
  const mostra = aperto && visibili.length > 0 && !visibili.some((p) => p.valore === valore && visibili.length === 1);
  return (
    <div className="relative">
      <Input
        role="combobox"
        aria-label={ariaLabel}
        aria-expanded={mostra}
        aria-controls={`${id}-lista`}
        aria-autocomplete="list"
        autoComplete="off"
        value={valore}
        placeholder={placeholder}
        className={cn("h-9 text-sm", maiuscolo && "font-mono uppercase", className)}
        onFocus={() => setAperto(true)}
        onBlur={() => window.setTimeout(() => setAperto(false), 120)}
        onChange={(e) => {
          onChange(maiuscolo ? e.target.value.toUpperCase() : e.target.value);
          setAperto(true);
        }}
      />
      {mostra && (
        <ul
          id={`${id}-lista`}
          role="listbox"
          aria-label={`Proposte per ${ariaLabel}`}
          className="absolute left-0 right-0 top-full z-50 mt-1 max-h-56 overflow-y-auto rounded-md border bg-popover p-1 shadow-md"
        >
          {visibili.map((p) => (
            <li
              key={`${p.valore}:${p.etichetta}`}
              role="option"
              aria-selected={p.valore === valore}
              className="cursor-pointer rounded px-2 py-1.5 text-sm hover:bg-accent"
              onMouseDown={(e) => {
                e.preventDefault();
                onChange(p.valore);
                setAperto(false);
              }}
            >
              <span className="font-medium">{p.etichetta}</span>
              {p.dettaglio && <span className="ml-2 text-xs text-muted-foreground">{p.dettaglio}</span>}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
