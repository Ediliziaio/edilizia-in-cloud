/**
 * Il campo indirizzo con i suggerimenti, lo stesso in tutta l'app (30/10/2026).
 *
 * Si scrive sempre liberamente: da tre caratteri in su, dopo 300 ms, arrivano i suggerimenti (ricercaIndirizzi →
 * maps-proxy, HERE). Scegliendone uno il campo prende subito il testo del suggerimento; poi, arrivati i dettagli:
 *   - con `onScegli` chi usa il campo riceve via, CAP, città, provincia e coordinate e decide cosa scrivere (i moduli
 *     con via, città, CAP e provincia separati mettono qui la via e riempiono gli altri campi);
 *   - senza `onScegli` il campo diventa la riga all'italiana «Via Roma 1, 20121 Milano (MI)».
 * Se il servizio non risponde lo dice e il testo scritto resta: niente blocca chi scrive a mano.
 *
 * Una risposta arrivata tardi non sostituisce quella nuova; un cambio del valore fatto da fuori (un altro cliente,
 * una correzione a mano in un altro campo), la disattivazione durante il salvataggio e la chiusura del modulo
 * annullano la ricerca o i dettagli ancora in arrivo.
 */
import { useCallback, useEffect, useId, useRef, useState, type KeyboardEvent } from "react";
import { Loader2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import {
  cercaIndirizzi,
  dettaglioIndirizzo,
  MINIMO_CARATTERI,
  type IndirizzoTrovato,
  type SuggerimentoIndirizzo,
} from "@/lib/indirizzi/ricercaIndirizzi";

const ATTESA_MS = 300;
const NON_DISPONIBILE = "Ricerca non disponibile. Puoi scrivere l’indirizzo manualmente.";
const NESSUNO = "Nessun indirizzo trovato: puoi scriverlo a mano.";
const SENZA_DETTAGLI = "Indirizzo selezionato. Coordinate non disponibili.";

export interface CampoIndirizzoProps {
  value: string;
  /** Ogni carattere scritto, e il testo del suggerimento appena scelto. */
  onChange: (testo: string) => void;
  /** I pezzi dell'indirizzo scelto, arrivati i dettagli. Senza, il campo prende la riga all'italiana. */
  onScegli?: (indirizzo: IndirizzoTrovato) => void;
  /** Scelto un suggerimento ma i dettagli non sono arrivati: nel campo resta il suo testo. */
  onScegliSenzaDettagli?: (suggerimento: SuggerimentoIndirizzo) => void;
  id?: string;
  name?: string;
  placeholder?: string;
  disabled?: boolean;
  required?: boolean;
  autoFocus?: boolean;
  maxLength?: number;
  /** Classi del campo di testo (altezza, carattere…). */
  className?: string;
  /** Classi del contenitore. */
  wrapperClassName?: string;
  onBlur?: () => void;
  "aria-label"?: string;
  "aria-invalid"?: boolean;
  /** Lo passa FormControl (react-hook-form) per collegare il messaggio d'errore al campo. */
  "aria-describedby"?: string;
}

export function CampoIndirizzo({
  value,
  onChange,
  onScegli,
  onScegliSenzaDettagli,
  id,
  name,
  placeholder,
  disabled = false,
  required,
  autoFocus,
  maxLength,
  className,
  wrapperClassName,
  onBlur,
  "aria-label": ariaLabel,
  "aria-invalid": ariaInvalid,
  "aria-describedby": ariaDescribedBy,
}: CampoIndirizzoProps) {
  const idAutomatico = useId();
  const inputId = id ?? idAutomatico;
  const listaId = `${inputId}-suggerimenti`;
  const [suggerimenti, setSuggerimenti] = useState<SuggerimentoIndirizzo[]>([]);
  const [aperto, setAperto] = useState(false);
  const [caricamento, setCaricamento] = useState(false);
  const [stato, setStato] = useState("");
  const [attivo, setAttivo] = useState(-1);
  const richiesta = useRef(0);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const contenitore = useRef<HTMLDivElement>(null);
  const ultimoEmesso = useRef(value);
  // Le risposte arrivano dopo: si chiamano le funzioni dell'ultimo disegno, non quelle del clic.
  const funzioni = useRef({ onChange, onScegli, onScegliSenzaDettagli });
  useEffect(() => {
    funzioni.current = { onChange, onScegli, onScegliSenzaDettagli };
  });

  const taglia = useCallback((testo: string) => (maxLength && maxLength > 0 ? testo.slice(0, maxLength) : testo), [maxLength]);
  const emetti = useCallback((testo: string) => {
    ultimoEmesso.current = testo;
    funzioni.current.onChange(testo);
  }, []);

  const annulla = useCallback(() => {
    richiesta.current++;
    if (timer.current) clearTimeout(timer.current);
    setSuggerimenti([]);
    setAperto(false);
    setCaricamento(false);
    setAttivo(-1);
  }, []);

  // Il valore cambiato da fuori (non da chi scrive qui) annulla ricerca e dettagli in arrivo.
  useEffect(() => {
    if (value === ultimoEmesso.current) return;
    ultimoEmesso.current = value;
    annulla();
  }, [value, annulla]);

  // Campo disattivato: via lista e rotella (sistemate mentre si disegna, non in un effetto) e niente risposte in arrivo.
  const [disattivatoPrima, setDisattivatoPrima] = useState(disabled);
  if (disabled !== disattivatoPrima) {
    setDisattivatoPrima(disabled);
    if (disabled) {
      setSuggerimenti([]);
      setAperto(false);
      setCaricamento(false);
      setAttivo(-1);
    }
  }
  useEffect(() => {
    if (!disabled) return;
    richiesta.current++;
    if (timer.current) clearTimeout(timer.current);
  }, [disabled]);

  useEffect(() => () => {
    richiesta.current++;
    if (timer.current) clearTimeout(timer.current);
  }, []);

  useEffect(() => {
    if (!aperto) return;
    const chiudi = (e: MouseEvent) => {
      if (contenitore.current && !contenitore.current.contains(e.target as Node)) {
        setAperto(false);
        setAttivo(-1);
      }
    };
    document.addEventListener("mousedown", chiudi);
    return () => document.removeEventListener("mousedown", chiudi);
  }, [aperto]);

  const cerca = async (testo: string, numero: number) => {
    if (numero !== richiesta.current) return;
    setCaricamento(true);
    try {
      const trovati = await cercaIndirizzi(testo);
      if (numero !== richiesta.current) return;
      setSuggerimenti(trovati);
      setAperto(trovati.length > 0);
      setStato(trovati.length > 0 ? "" : NESSUNO);
    } catch {
      if (numero === richiesta.current) setStato(NON_DISPONIBILE);
    } finally {
      if (numero === richiesta.current) setCaricamento(false);
    }
  };

  const scrivi = (testo: string) => {
    emetti(testo);
    const numero = ++richiesta.current;
    if (timer.current) clearTimeout(timer.current);
    setSuggerimenti([]);
    setAperto(false);
    setAttivo(-1);
    setStato("");
    setCaricamento(false);
    if (testo.trim().length >= MINIMO_CARATTERI) {
      timer.current = setTimeout(() => void cerca(testo, numero), ATTESA_MS);
    }
  };

  const scegli = async (s: SuggerimentoIndirizzo) => {
    const numero = ++richiesta.current;
    if (timer.current) clearTimeout(timer.current);
    setAperto(false);
    setSuggerimenti([]);
    setAttivo(-1);
    setStato("");
    emetti(taglia(s.testo));
    setCaricamento(true);
    const trovato = await dettaglioIndirizzo(s);
    if (numero !== richiesta.current) return;
    setCaricamento(false);
    if (!trovato) {
      setStato(SENZA_DETTAGLI);
      funzioni.current.onScegliSenzaDettagli?.(s);
      return;
    }
    if (funzioni.current.onScegli) funzioni.current.onScegli(trovato);
    else emetti(taglia(trovato.testo));
  };

  const tasto = (e: KeyboardEvent<HTMLInputElement>) => {
    const n = suggerimenti.length;
    if ((e.key === "ArrowDown" || e.key === "ArrowUp") && n > 0) {
      e.preventDefault();
      setAperto(true);
      setAttivo((p) => (e.key === "ArrowDown" ? (p + 1) % n : p <= 0 ? n - 1 : p - 1));
    } else if (e.key === "Enter" && aperto && n > 0) {
      // Invio sceglie il suggerimento: non deve inviare il modulo.
      e.preventDefault();
      void scegli(suggerimenti[attivo < 0 ? 0 : attivo]);
    } else if (e.key === "Escape" && aperto) {
      // Chiude i suggerimenti, non la finestra che contiene il campo.
      e.preventDefault();
      e.stopPropagation();
      setAperto(false);
      setAttivo(-1);
    }
  };

  const mostraLista = aperto && suggerimenti.length > 0;

  return (
    <div ref={contenitore} className={cn("min-w-0", wrapperClassName)}>
      <div className="relative">
        <Input
          id={inputId}
          name={name}
          role="combobox"
          aria-autocomplete="list"
          aria-expanded={mostraLista}
          aria-controls={listaId}
          aria-activedescendant={mostraLista && attivo >= 0 ? `${inputId}-opzione-${attivo}` : undefined}
          aria-label={ariaLabel}
          aria-invalid={ariaInvalid}
          aria-describedby={ariaDescribedBy}
          autoComplete="off"
          value={value}
          placeholder={placeholder}
          disabled={disabled}
          required={required}
          autoFocus={autoFocus}
          maxLength={maxLength}
          onChange={(e) => scrivi(e.target.value)}
          onKeyDown={tasto}
          onFocus={() => { if (suggerimenti.length > 0) setAperto(true); }}
          onBlur={onBlur}
          className={cn(caricamento && "pr-9", className)}
        />
        {caricamento && (
          <Loader2 aria-hidden="true" className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-muted-foreground" />
        )}
        {mostraLista && (
          <div
            id={listaId}
            role="listbox"
            aria-label="Indirizzi suggeriti"
            className="absolute left-0 right-0 z-50 mt-1 max-h-60 overflow-auto rounded-md border bg-popover text-popover-foreground shadow-md"
          >
            {suggerimenti.map((s, i) => (
              <button
                key={s.id}
                id={`${inputId}-opzione-${i}`}
                type="button"
                role="option"
                tabIndex={-1}
                aria-selected={attivo === i}
                className={cn(
                  "block min-h-11 w-full break-words px-3 py-2 text-left text-sm transition-colors hover:bg-accent",
                  attivo === i && "bg-accent",
                )}
                // Il campo resta attivo: chi ascolta l'uscita dal campo non scatta prima della scelta.
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => void scegli(s)}
              >
                {s.testo}
              </button>
            ))}
          </div>
        )}
      </div>
      {stato && <p role="status" className="mt-1 text-xs text-muted-foreground">{stato}</p>}
    </div>
  );
}

export default CampoIndirizzo;
