// src/components/orders/generali/contratto/campi.tsx
// I pezzi che il modulo «Contratto e SAL» usa ovunque: campi con etichetta ed errore (14px anche
// da telefono, come gli Input dell'app), numeri scritti all'italiana e numeri che si aprono sulle
// righe da cui vengono (piano §3.1, punto 2). Le funzioni di formato stanno in formato.ts.
import { useId, useState, type ReactNode } from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { daTesto, numeroIt } from "./formato";

export function Campo({ etichetta, aiuto, errore, children, className }: {
  etichetta: string; aiuto?: string; errore?: string; children: (id: string) => ReactNode; className?: string;
}) {
  const id = useId();
  return (
    <div className={cn("space-y-1.5", className)}>
      <Label htmlFor={id}>{etichetta}</Label>
      {children(id)}
      {(errore || aiuto) && <p className={cn("text-xs", errore ? "text-destructive" : "text-muted-foreground")}>{errore ?? aiuto}</p>}
    </div>
  );
}

/** Un campo numerico all'italiana (1.234,56). Mostra il valore salvato finché non lo si cambia. */
export function CampoNumero({ etichetta, valore, onChange, aiuto, errore, suffisso, decimali = 2, segno = false, placeholder }: {
  etichetta: string; valore: number | null; onChange: (v: number | null) => void; aiuto?: string; errore?: string;
  suffisso?: string; decimali?: number; segno?: boolean; placeholder?: string;
}) {
  const [testo, setTesto] = useState(numeroIt(valore, decimali));
  const letto = daTesto(testo);
  const sbagliato = letto !== null && (Number.isNaN(letto) || (!segno && letto < 0));
  return (
    <Campo etichetta={etichetta} aiuto={aiuto} errore={errore ?? (sbagliato ? "Scrivi un numero, ad esempio 1.250,50." : undefined)}>
      {(id) => (
        <div className="relative">
          <Input
            id={id}
            inputMode="decimal"
            value={testo}
            placeholder={placeholder}
            aria-invalid={sbagliato || !!errore || undefined}
            className={suffisso ? "pr-9" : undefined}
            onChange={(e) => {
              setTesto(e.target.value);
              // Un numero che non si legge arriva come NaN: chi usa il campo non salva finché non è a posto.
              const n = daTesto(e.target.value);
              onChange(n !== null && !segno && n < 0 ? Number.NaN : n);
            }}
          />
          {suffisso && <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-sm text-muted-foreground">{suffisso}</span>}
        </div>
      )}
    </Campo>
  );
}

export interface RigaOrigine { etichetta: string; valore: string; nota?: string; tono?: "meno" | "totale" }

/**
 * Un numero che si apre: toccandolo compaiono le righe che lo compongono.
 * Senza righe resta un numero e basta (niente pulsanti che non portano a niente).
 */
export function NumeroCheSiApre({ etichetta, valore, nota, righe, titolo, descrizione, tono }: {
  etichetta: string; valore: string; nota?: string; righe?: RigaOrigine[]; titolo?: string; descrizione?: string; tono?: "rosso" | "verde";
}) {
  const [aperto, setAperto] = useState(false);
  const contenuto = (
    <>
      <p className="text-xs text-muted-foreground">{etichetta}</p>
      <p className={cn("mt-0.5 text-lg font-semibold tabular-nums", tono === "rosso" && "text-destructive", tono === "verde" && "text-emerald-700 dark:text-emerald-400")}>{valore}</p>
      {nota && <p className="text-[11px] text-muted-foreground">{nota}</p>}
    </>
  );
  if (!righe || righe.length === 0) return <div className="rounded-lg border bg-card px-3 py-2.5">{contenuto}</div>;
  return (
    <>
      <button
        type="button"
        onClick={() => setAperto(true)}
        className="rounded-lg border bg-card px-3 py-2.5 text-left transition-colors hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        aria-label={`${etichetta}: ${valore}. Mostra da dove viene`}
      >
        {contenuto}
      </button>
      <Dialog open={aperto} onOpenChange={setAperto}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{titolo ?? etichetta}</DialogTitle>
            {descrizione && <DialogDescription>{descrizione}</DialogDescription>}
          </DialogHeader>
          <dl className="divide-y text-sm">
            {righe.map((r, i) => (
              <div key={`${r.etichetta}-${i}`} className={cn("flex items-baseline justify-between gap-3 py-1.5", r.tono === "totale" && "font-semibold")}>
                <dt className="min-w-0">
                  <span className={cn(r.tono === "meno" && "text-muted-foreground")}>{r.etichetta}</span>
                  {r.nota && <span className="block text-xs text-muted-foreground">{r.nota}</span>}
                </dt>
                <dd className="shrink-0 tabular-nums">{r.valore}</dd>
              </div>
            ))}
          </dl>
        </DialogContent>
      </Dialog>
    </>
  );
}

/** Il prossimo passo al posto di uno zero (piano §3.1, punto 4). */
export function ProssimoPasso({ testo, azione }: { testo: string; azione?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-dashed bg-muted/30 px-4 py-4">
      <p className="text-sm text-muted-foreground">{testo}</p>
      {azione}
    </div>
  );
}
