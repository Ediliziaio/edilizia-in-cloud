/**
 * Mattoni dell'editor del POS: campi con etichetta e sezioni col riferimento
 * all'Allegato XV e il numero di voci che mancano.
 */
import { createContext, useContext, useLayoutEffect, useRef, type ReactNode } from "react";
import { AlertTriangle, CheckCircle2, ChevronDown } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

interface CampoProps {
  id: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  readOnly?: boolean;
  type?: "text" | "date" | "email" | "tel" | "number";
  hint?: string;
  className?: string;
}

export function Campo({ id, label, value, onChange, placeholder, readOnly, type = "text", hint, className }: CampoProps) {
  return (
    <div className={cn("space-y-1", className)}>
      <Label htmlFor={id} className="text-xs font-medium text-slate-700">{label}</Label>
      <Input
        id={id}
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        readOnly={readOnly}
        disabled={readOnly}
        className="h-9"
      />
      {hint && <p className="text-[11px] text-muted-foreground">{hint}</p>}
    </div>
  );
}

/** Un campo di testo su più righe cresce con quello che ci si scrive (fino a un tetto), senza barre di scorrimento per poche righe. */
const ALTEZZA_MASSIMA_AREA = 288;

export function Area({ id, label, value, onChange, placeholder, readOnly, hint, className, rows = 3 }: CampoProps & { rows?: number }) {
  const rif = useRef<HTMLTextAreaElement>(null);
  useLayoutEffect(() => {
    const el = rif.current;
    if (!el) return;
    el.style.height = "auto";
    if (el.scrollHeight > 0) el.style.height = `${Math.min(el.scrollHeight + 2, ALTEZZA_MASSIMA_AREA)}px`;
  }, [value, rows]);
  return (
    <div className={cn("space-y-1", className)}>
      <Label htmlFor={id} className="text-xs font-medium text-slate-700">{label}</Label>
      <Textarea
        ref={rif}
        id={id}
        rows={rows}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        readOnly={readOnly}
        disabled={readOnly}
      />
      {hint && <p className="text-[11px] text-muted-foreground">{hint}</p>}
    </div>
  );
}

interface SezioneProps {
  id: string;
  numero: number;
  titolo: string;
  riferimento: string;
  mancanti: number;
  descrizione?: ReactNode;
  azioni?: ReactNode;
  children: ReactNode;
}

/**
 * Quali sezioni sono aperte. Senza questo contesto (le sezioni usate da sole, i test) restano sempre aperte; con il contesto
 * il titolo diventa un pulsante che apre e chiude la sezione: in un POS lungo si vede subito cosa resta da fare.
 */
export interface AperturaSezioniPos { aperta: (id: string) => boolean; alterna: (id: string) => void }
export const AperturaSezioniContext = createContext<AperturaSezioniPos | null>(null);

export function Sezione({ id, numero, titolo, riferimento, mancanti, descrizione, azioni, children }: SezioneProps) {
  const apertura = useContext(AperturaSezioniContext);
  const aperta = apertura ? apertura.aperta(id) : true;
  const intestazione = (
    <>
      <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-slate-900 text-xs font-bold text-white">{numero}</span>
      <span className="min-w-0">{titolo}</span>
      {apertura && <ChevronDown className={cn("h-4 w-4 shrink-0 text-muted-foreground transition-transform", !aperta && "-rotate-90")} aria-hidden="true" />}
    </>
  );
  return (
    <section id={`pos-${id}`} className="scroll-mt-24 rounded-xl border bg-card" aria-labelledby={`pos-${id}-titolo`}>
      {/* Mobile: titolo e stato su una riga; il riferimento normativo e la
          descrizione restano al computer. */}
      <header className={cn("flex flex-wrap items-start justify-between gap-2 px-4 py-3 max-sm:flex-nowrap max-sm:items-center max-sm:px-3 max-sm:py-2.5", aperta && "border-b")}>
        <div className="min-w-0">
          <h2 id={`pos-${id}-titolo`} className="text-sm font-semibold sm:text-base max-sm:text-[13px] max-sm:leading-tight">
            {apertura
              ? <button type="button" onClick={() => apertura.alterna(id)} aria-expanded={aperta} aria-controls={`pos-${id}-corpo`}
                  className="flex min-h-8 items-center gap-2 rounded-md text-left font-semibold">{intestazione}</button>
              : <span className="flex items-center gap-2">{intestazione}</span>}
          </h2>
          <p className="mt-0.5 pl-8 text-[11px] text-muted-foreground max-sm:hidden">Allegato XV, {riferimento}</p>
          {descrizione && <div className="mt-1 pl-8 text-xs text-muted-foreground max-sm:hidden">{descrizione}</div>}
        </div>
        <div className="flex items-center gap-2 max-sm:shrink-0">
          {mancanti > 0 ? (
            <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-medium text-amber-800 ring-1 ring-amber-200">
              <AlertTriangle className="h-3 w-3" aria-hidden="true" />
              <span className="max-sm:hidden">{mancanti === 1 ? "1 voce da completare" : `${mancanti} voci da completare`}</span>
              <span className="sm:hidden">{mancanti}</span>
            </span>
          ) : (
            <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-medium text-emerald-700 ring-1 ring-emerald-200" aria-label="Completa">
              <CheckCircle2 className="h-3 w-3" aria-hidden="true" />
              <span className="max-sm:hidden">Completa</span>
            </span>
          )}
          {azioni}
        </div>
      </header>
      <div id={`pos-${id}-corpo`} hidden={!aperta} className="space-y-4 p-4 max-sm:space-y-3 max-sm:p-3">{children}</div>
    </section>
  );
}

/** Una riga di un elenco (dirigente, addetto, lavoratore…) con il pulsante per toglierla. */
export function Riga({ children, onRemove, readOnly, etichettaRimuovi }: { children: ReactNode; onRemove: () => void; readOnly?: boolean; etichettaRimuovi: string }) {
  return (
    <div className="relative rounded-lg border bg-slate-50/60 p-3">
      {!readOnly && (
        <button
          type="button"
          onClick={onRemove}
          className="absolute right-2 top-2 rounded-md px-2 py-1 text-xs text-muted-foreground hover:bg-red-50 hover:text-red-700"
          aria-label={etichettaRimuovi}
        >
          Togli
        </button>
      )}
      {children}
    </div>
  );
}
