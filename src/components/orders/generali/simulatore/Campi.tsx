// src/components/orders/generali/simulatore/Campi.tsx
// I campi del simulatore: numeri scritti all'italiana («250.000», «3,5»), che aggiornano
// i risultati mentre si scrive. 14px come in tutta l'app.
import { useEffect, useRef, useState, type ReactNode } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { leggiImporto } from "@/lib/controlloGestione/formatCG";
import { cn } from "@/lib/utils";

const NUMERO = new Intl.NumberFormat("it-IT", { maximumFractionDigits: 2 });
const scritto = (n: number | null) => (n === null ? "" : NUMERO.format(n));

export function CampoNumero({ id, etichetta, valore, onCambia, unita, aiuto, vuotoPermesso = false, negativo = false, intero = false, className, disabilitato }: {
  id: string;
  etichetta: ReactNode;
  valore: number | null;
  onCambia: (v: number | null) => void;
  /** «€», «%», «m²», «mesi». */
  unita?: string;
  aiuto?: string;
  /** Vuoto = null (es. «costo come quello generale»); altrimenti vuoto = 0. */
  vuotoPermesso?: boolean;
  negativo?: boolean;
  intero?: boolean;
  className?: string;
  disabilitato?: boolean;
}) {
  const [testo, setTesto] = useState(scritto(valore));
  const [errore, setErrore] = useState(false);
  const aperto = useRef(false);
  // Il valore cambia da fuori (un'altra ipotesi aperta, un ripristino): il campo lo segue se non lo stai scrivendo.
  useEffect(() => {
    if (!aperto.current) setTesto(scritto(valore));
  }, [valore]);

  const leggi = (t: string): number | null | undefined => {
    if (t.trim() === "") return vuotoPermesso ? null : 0;
    const n = leggiImporto(t);
    if (n === null || (!negativo && n < 0)) return undefined;
    return intero ? Math.round(n) : n;
  };

  return (
    <div className={cn("space-y-1", className)}>
      <Label htmlFor={id} className="text-sm font-normal text-muted-foreground">{etichetta}</Label>
      <div className="relative">
        <Input
          id={id}
          inputMode="decimal"
          value={testo}
          disabled={disabilitato}
          aria-invalid={errore || undefined}
          aria-describedby={aiuto ? `${id}-aiuto` : undefined}
          className={cn("h-9 text-sm tabular-nums", unita && "pr-12", errore && "border-destructive")}
          onFocus={() => { aperto.current = true; }}
          onChange={(e) => {
            setTesto(e.target.value);
            const n = leggi(e.target.value);
            setErrore(n === undefined);
            if (n !== undefined) onCambia(n);
          }}
          onBlur={() => {
            aperto.current = false;
            const n = leggi(testo);
            setErrore(false);
            setTesto(scritto(n === undefined ? valore : n));
          }}
        />
        {unita && <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-sm text-muted-foreground">{unita}</span>}
      </div>
      {aiuto && <p id={`${id}-aiuto`} className="text-xs text-muted-foreground">{aiuto}</p>}
    </div>
  );
}

export function Gruppo({ titolo, testo, children, azione }: { titolo: string; testo?: string; children: ReactNode; azione?: ReactNode }) {
  return (
    <section aria-label={titolo} className="rounded-lg border bg-card px-4 py-3">
      <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
        <div>
          <h3 className="text-sm font-semibold">{titolo}</h3>
          {testo && <p className="text-xs text-muted-foreground">{testo}</p>}
        </div>
        {azione}
      </div>
      {children}
    </section>
  );
}
