import { useEffect, useMemo, useRef, useState } from "react";
import { Briefcase, History, Mail, Receipt, Truck, User, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { useRecipientSuggestions, type RecipientSource } from "../hooks/useRecipientSuggestions";

/**
 * RecipientField — input destinatari con autocomplete da:
 *  - anagrafiche company (clienti/fornitori)
 *  - storico inbox (mittenti già ricevuti)
 *  - storico outbox (destinatari già scritti)
 *
 * UX: gli indirizzi confermati appaiono come chip cliccabili (X per rimuovere).
 * Il testo libero non confermato resta nell'input fino a Enter / "," / blur,
 * momento in cui validiamo come email e diventa chip. Suggerimenti compaiono
 * sotto l'input dopo 2 caratteri digitati (debounce 200ms nel hook).
 *
 * Tastiera: ↑↓ navighi i suggerimenti, Enter selezioni, Esc chiudi.
 */

interface RecipientFieldProps {
  /** Stringa con email separate da virgola (la stessa rappresentazione del composer). */
  value: string;
  /** Callback con la nuova stringa CSV. */
  onChange: (next: string) => void;
  /** Placeholder mostrato quando il campo è vuoto. */
  placeholder?: string;
  /** Company corrente — necessaria per limitare la ricerca al tenant. */
  companyId: string | null | undefined;
  /** Label aria per il field. */
  ariaLabel?: string;
  /** Auto focus al primo render (es. quando l'utente apre "Nuova email"). */
  autoFocus?: boolean;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function parseEmails(csv: string): string[] {
  return csv
    .split(/[,;]/)
    .map((s) => s.trim())
    .filter(Boolean);
}

function sourceIcon(source: RecipientSource) {
  switch (source) {
    case "contact_client":   return User;
    case "contact_supplier": return Truck;
    case "contact_billing":  return Receipt;
    case "contact":          return Briefcase;
    case "inbox_history":    return Mail;
    case "outbox_history":   return History;
    default:                 return Mail;
  }
}

function sourceTone(source: RecipientSource): string {
  switch (source) {
    case "contact_client":   return "text-blue-600 bg-blue-50 border-blue-100";
    case "contact_supplier": return "text-emerald-700 bg-emerald-50 border-emerald-100";
    case "contact_billing":  return "text-amber-700 bg-amber-50 border-amber-100";
    case "contact":          return "text-slate-700 bg-slate-50 border-slate-100";
    case "inbox_history":    return "text-violet-700 bg-violet-50 border-violet-100";
    case "outbox_history":   return "text-rose-700 bg-rose-50 border-rose-100";
    default:                 return "text-slate-600 bg-slate-50 border-slate-100";
  }
}

export function RecipientField({
  value,
  onChange,
  placeholder = "Aggiungi destinatari…",
  companyId,
  ariaLabel,
  autoFocus,
}: RecipientFieldProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const [inputText, setInputText] = useState("");
  const [open, setOpen] = useState(false);
  const [highlight, setHighlight] = useState(0);

  // Email già aggiunte (chip)
  const emails = useMemo(() => parseEmails(value), [value]);

  const { suggestions, isLoading } = useRecipientSuggestions({
    query: inputText,
    companyId,
    excludeEmails: emails,
    limit: 8,
    disabled: !open,
  });

  // Reset highlight quando cambiano i suggerimenti
  useEffect(() => {
    setHighlight(0);
  }, [suggestions.length]);

  // Auto focus
  useEffect(() => {
    if (autoFocus) inputRef.current?.focus();
  }, [autoFocus]);

  // Click esterno → chiudi dropdown
  useEffect(() => {
    if (!open) return;
    const onDocClick = (e: MouseEvent) => {
      if (!wrapperRef.current?.contains(e.target as Node)) {
        setOpen(false);
        commitInputText();
      }
    };
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, inputText, emails]);

  function addEmail(addr: string) {
    const clean = addr.trim().toLowerCase();
    if (!clean) return;
    if (!EMAIL_RE.test(clean)) return;
    if (emails.map((e) => e.toLowerCase()).includes(clean)) return;
    const next = [...emails, clean].join(", ");
    onChange(next);
    setInputText("");
    setOpen(false);
  }

  function removeEmail(addr: string) {
    const next = emails.filter((e) => e.toLowerCase() !== addr.toLowerCase()).join(", ");
    onChange(next);
    inputRef.current?.focus();
  }

  function commitInputText() {
    // Quando l'utente fa blur / preme Esc, se il testo è una email valida la aggiungiamo,
    // altrimenti la lasciamo nell'input (così non perde quello che ha scritto).
    if (EMAIL_RE.test(inputText.trim().toLowerCase())) {
      addEmail(inputText);
    }
  }

  function handleKey(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter") {
      e.preventDefault();
      if (open && suggestions[highlight]) {
        addEmail(suggestions[highlight].email);
      } else if (inputText) {
        addEmail(inputText);
      }
    } else if (e.key === "," || e.key === ";" || e.key === "Tab") {
      if (inputText.trim()) {
        e.preventDefault();
        addEmail(inputText);
      }
    } else if (e.key === "Backspace" && !inputText && emails.length > 0) {
      // Backspace su input vuoto → rimuove l'ultimo chip
      removeEmail(emails[emails.length - 1]);
    } else if (e.key === "ArrowDown") {
      if (suggestions.length > 0) {
        e.preventDefault();
        setOpen(true);
        setHighlight((h) => Math.min(h + 1, suggestions.length - 1));
      }
    } else if (e.key === "ArrowUp") {
      if (suggestions.length > 0) {
        e.preventDefault();
        setHighlight((h) => Math.max(h - 1, 0));
      }
    } else if (e.key === "Escape") {
      setOpen(false);
    }
  }

  return (
    <div ref={wrapperRef} className="relative">
      <div
        className={cn(
          "flex min-h-[36px] w-full flex-wrap items-center gap-1 rounded-md border border-input bg-background px-2 py-1.5 text-sm ring-offset-background",
          "focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2",
        )}
        onClick={() => inputRef.current?.focus()}
      >
        {emails.map((email) => (
          <span
            key={email}
            className="inline-flex max-w-full items-center gap-1 rounded-md bg-blue-50 px-2 py-0.5 text-xs font-medium text-blue-800"
          >
            <span className="truncate">{email}</span>
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); removeEmail(email); }}
              className="shrink-0 rounded-full p-0.5 text-blue-500 hover:bg-blue-100 hover:text-blue-700"
              aria-label={`Rimuovi ${email}`}
            >
              <X className="h-3 w-3" />
            </button>
          </span>
        ))}
        <input
          ref={inputRef}
          type="text"
          value={inputText}
          onChange={(e) => {
            setInputText(e.target.value);
            setOpen(true);
          }}
          onFocus={() => { if (inputText.length >= 2) setOpen(true); }}
          onKeyDown={handleKey}
          placeholder={emails.length === 0 ? placeholder : ""}
          aria-label={ariaLabel}
          aria-autocomplete="list"
          aria-expanded={open}
          className="min-w-[120px] flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
        />
      </div>

      {open && inputText.trim().length >= 2 && (
        <div className="absolute left-0 right-0 top-full z-50 mt-1 max-h-72 overflow-y-auto rounded-md border border-slate-200 bg-white shadow-lg">
          {isLoading && (
            <div className="px-3 py-2 text-xs text-slate-500">Cerco contatti…</div>
          )}
          {!isLoading && suggestions.length === 0 && (
            <div className="px-3 py-2 text-xs text-slate-500">
              Nessun contatto trovato. Premi Invio per usare <span className="font-medium text-slate-700">{inputText.trim()}</span>.
            </div>
          )}
          {suggestions.map((s, idx) => {
            const Icon = sourceIcon(s.source);
            const tone = sourceTone(s.source);
            const active = idx === highlight;
            return (
              <button
                key={`${s.email}-${s.source}`}
                type="button"
                onMouseEnter={() => setHighlight(idx)}
                onMouseDown={(e) => { e.preventDefault(); addEmail(s.email); }}
                className={cn(
                  "flex w-full items-center gap-2 px-3 py-2 text-left text-sm transition-colors",
                  active ? "bg-blue-50" : "hover:bg-slate-50",
                )}
              >
                <span className={cn("flex h-7 w-7 shrink-0 items-center justify-center rounded-full border", tone)}>
                  <Icon className="h-3.5 w-3.5" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium text-slate-900">
                    {s.display_name || s.email}
                  </p>
                  <p className="truncate text-[11px] text-slate-500">
                    {s.email}
                    {s.display_name && s.display_name.toLowerCase() !== s.email.toLowerCase() && (
                      <span> · {s.source_label}</span>
                    )}
                    {(!s.display_name || s.display_name.toLowerCase() === s.email.toLowerCase()) && (
                      <span> · {s.source_label}</span>
                    )}
                  </p>
                </div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
