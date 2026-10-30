// src/components/orders/generali/piano/Celle.tsx
// Le celle del piano economico che si modificano sul posto, come in un foglio di calcolo:
// sembrano testo finché non le tocchi; Invio o uscire dalla cella salva, Esc annulla.
import { useState, type KeyboardEvent } from "react";
import { toast } from "sonner";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { leggiMese, leggiNumeroItaliano } from "@/lib/orders/generali/pianoExcel";
import { cn } from "@/lib/utils";
import { euro, nomeMese, testoMese, testoNumero } from "@/components/orders/generali/piano/formato";

/** 14px anche qui (campi a 14px in tutta l'app). */
export const CLASSE_CELLA =
  "h-8 w-full min-w-0 rounded-md border border-transparent bg-transparent px-1.5 text-sm hover:border-input focus:border-input focus:bg-background focus:outline-none focus:ring-1 focus:ring-ring";

function tasti(e: KeyboardEvent<HTMLInputElement>, annulla: () => void) {
  if (e.key === "Enter") (e.currentTarget as HTMLInputElement).blur();
  if (e.key === "Escape") {
    annulla();
    // Il valore torna com'era prima di uscire: niente salvataggio.
    setTimeout(() => (e.target as HTMLInputElement).blur(), 0);
  }
}

export function CellaTesto({ valore, onSalva, etichetta, placeholder, className }: {
  valore: string;
  onSalva: (v: string) => void;
  etichetta: string;
  placeholder?: string;
  className?: string;
}) {
  // Finché non la tocchi la cella mostra il valore salvato; mentre la scrivi, quello che scrivi.
  const [aperta, setAperta] = useState(false);
  const [t, setT] = useState(valore);
  return (
    <input
      value={aperta ? t : valore}
      maxLength={300}
      aria-label={etichetta}
      placeholder={placeholder}
      className={cn(CLASSE_CELLA, className)}
      onFocus={() => {
        setAperta(true);
        setT(valore);
      }}
      onChange={(e) => setT(e.target.value)}
      onKeyDown={(e) => tasti(e, () => setT(valore))}
      onBlur={() => {
        setAperta(false);
        if (t.trim() !== valore) onSalva(t.trim());
      }}
    />
  );
}

/**
 * Un importo in euro. Vuoto = `null` solo se `vuotoPermesso` (l'a finire torna calcolato);
 * `suggerito` è il numero mostrato in grigio quando la cella è vuota.
 */
export function CellaImporto({ valore, onSalva, etichetta, vuotoPermesso = false, suggerito, className }: {
  valore: number | null;
  onSalva: (v: number | null) => void;
  etichetta: string;
  vuotoPermesso?: boolean;
  suggerito?: number;
  className?: string;
}) {
  const [aperta, setAperta] = useState(false);
  const [t, setT] = useState(testoNumero(valore));
  const salva = () => {
    setAperta(false);
    const pulito = t.trim();
    if (pulito === "") {
      if (vuotoPermesso) {
        if (valore !== null) onSalva(null);
      } else {
        setT(testoNumero(valore));
      }
      return;
    }
    const n = leggiNumeroItaliano(pulito);
    if (n === null || n < 0) {
      toast.error(`«${pulito}» non è un importo valido: scrivi un numero positivo, ad esempio 125.000,00.`);
      setT(testoNumero(valore));
      return;
    }
    const arrotondato = Math.round(n * 100) / 100;
    if (arrotondato !== valore) onSalva(arrotondato);
  };
  return (
    <input
      inputMode="decimal"
      aria-label={etichetta}
      value={aperta ? t : valore === null ? "" : euro(valore)}
      placeholder={suggerito !== undefined ? euro(suggerito) : undefined}
      className={cn(CLASSE_CELLA, "text-right tabular-nums placeholder:text-muted-foreground/70", className)}
      onFocus={(e) => {
        setAperta(true);
        setT(testoNumero(valore));
        requestAnimationFrame(() => e.target.select());
      }}
      onChange={(e) => setT(e.target.value)}
      onKeyDown={(e) => tasti(e, () => setT(testoNumero(valore)))}
      onBlur={salva}
    />
  );
}

/** Il mese in cui entra o esce il denaro: «03/2027», «mar 2027», «2027-03»… */
export function CellaMese({ valore, onSalva, etichetta, partenza }: {
  valore: string | null;
  onSalva: (v: string | null) => void;
  etichetta: string;
  partenza: string;
}) {
  const [aperta, setAperta] = useState(false);
  const [t, setT] = useState(testoMese(valore));
  const salva = () => {
    setAperta(false);
    const pulito = t.trim();
    if (pulito === "") {
      if (valore !== null) onSalva(null);
      return;
    }
    const m = leggiMese(pulito, partenza);
    if (!m) {
      toast.error(`«${pulito}» non è un mese: scrivi ad esempio 03/2027.`);
      setT(testoMese(valore));
      return;
    }
    if (m !== valore) onSalva(m);
  };
  return (
    <input
      aria-label={etichetta}
      value={aperta ? t : valore ? nomeMese(valore) : ""}
      placeholder={aperta ? "mm/aaaa" : "manca"}
      className={cn(CLASSE_CELLA, !valore && !aperta && "placeholder:text-amber-700 dark:placeholder:text-amber-400")}
      onFocus={(e) => {
        setAperta(true);
        setT(testoMese(valore));
        requestAnimationFrame(() => e.target.select());
      }}
      onChange={(e) => setT(e.target.value)}
      onKeyDown={(e) => tasti(e, () => setT(testoMese(valore)))}
      onBlur={salva}
    />
  );
}

export function CellaDurata({ valore, onSalva, etichetta }: { valore: number; onSalva: (v: number) => void; etichetta: string }) {
  const [aperta, setAperta] = useState(false);
  const [t, setT] = useState(String(valore));
  return (
    <input
      inputMode="numeric"
      aria-label={etichetta}
      value={aperta ? t : String(valore)}
      className={cn(CLASSE_CELLA, "text-right tabular-nums")}
      onFocus={() => {
        setAperta(true);
        setT(String(valore));
      }}
      onChange={(e) => setT(e.target.value)}
      onKeyDown={(e) => tasti(e, () => setT(String(valore)))}
      onBlur={() => {
        setAperta(false);
        const n = Number(t.trim());
        if (!Number.isInteger(n) || n < 1 || n > 120) {
          toast.error("La durata è un numero di mesi, da 1 a 120.");
          setT(String(valore));
          return;
        }
        if (n !== valore) onSalva(n);
      }}
    />
  );
}

export function CellaScelta<T extends string>({ valore, scelte, onSalva, etichetta, className }: {
  valore: T;
  scelte: { valore: T; nome: string }[];
  onSalva: (v: T) => void;
  etichetta: string;
  className?: string;
}) {
  return (
    <Select value={valore} onValueChange={(v) => v !== valore && onSalva(v as T)}>
      <SelectTrigger aria-label={etichetta} className={cn("h-8 border-transparent bg-transparent px-1.5 text-sm shadow-none hover:border-input", className)}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {scelte.map((s) => <SelectItem key={s.valore} value={s.valore}>{s.nome}</SelectItem>)}
      </SelectContent>
    </Select>
  );
}
