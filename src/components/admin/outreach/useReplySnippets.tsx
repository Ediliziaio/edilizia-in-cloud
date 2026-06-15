import { useCallback, useEffect, useState } from "react";

/**
 * useReplySnippets — risposte rapide ("snippet") per il box risposta della Posta cold.
 *
 * SCELTA v1 — localStorage (non tabella server). Motivazione:
 *   • Gli snippet sono preferenze redazionali del singolo operatore super-admin,
 *     non dati di dominio condivisi né soggetti a RLS/multi-tenant: l'outreach
 *     vive tutto sulla platform company e l'utente è uno solo.
 *   • Zero round-trip e zero migrazione da applicare → la feature è attiva subito,
 *     coerente col vincolo "solo locale, nessuna migrazione applicata".
 *   • L'inserimento 1-click (il valore vero della feature) è identico con
 *     entrambe le persistenze; se in futuro servirà condivisione/sync tra
 *     dispositivi, la stessa API (snippets/add/update/remove) si può ricablare su
 *     una tabella `outreach_reply_snippets` senza toccare la UI.
 *
 * I default curati in italiano sono SEMPRE presenti (non editabili/cancellabili):
 * gli snippet personalizzati dell'utente si sommano e sono persistiti.
 */

const STORAGE_KEY = "outreach:reply-snippets:v1";

export interface ReplySnippet {
  id: string;
  /** Etichetta breve nel menu. */
  label: string;
  /** Testo inserito nel box risposta. */
  text: string;
  /** true per i default di sistema (non modificabili/eliminabili). */
  builtin?: boolean;
}

/** Set curato in italiano, sempre disponibile. */
export const QUICK_REPLY_DEFAULTS: ReplySnippet[] = [
  { id: "def-callback", label: "Ti richiamo io", text: "Grazie per la risposta! Ti richiamo io a breve per parlarne con calma.", builtin: true },
  { id: "def-notinterested", label: "Non interessato → rimuovo", text: "Capito, nessun problema: ti rimuovo subito dai nostri contatti. Buon lavoro!", builtin: true },
  { id: "def-details", label: "Mando i dettagli", text: "Perfetto, ti mando subito i dettagli via email così puoi dare un'occhiata con comodo.", builtin: true },
  { id: "def-call10", label: "10 min questa settimana?", text: "Ti va se ci sentiamo 10 minuti questa settimana? Dimmi pure un paio di slot che preferisci e mi organizzo.", builtin: true },
  { id: "def-thanks", label: "Grazie + resto a disposizione", text: "Grazie del riscontro! Resto a disposizione per qualsiasi domanda, quando vuoi.", builtin: true },
];

function loadCustom(): ReplySnippet[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((s): s is ReplySnippet => s && typeof s.id === "string" && typeof s.label === "string" && typeof s.text === "string")
      .map((s) => ({ id: s.id, label: s.label, text: s.text })); // mai builtin dalle custom
  } catch {
    return [];
  }
}

export function useReplySnippets() {
  const [custom, setCustom] = useState<ReplySnippet[]>(() => loadCustom());

  // Persisti a ogni cambiamento (effetto su stato, non su render).
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(custom));
    } catch { /* quota/private mode: best-effort */ }
  }, [custom]);

  const add = useCallback((label: string, text: string) => {
    const l = label.trim();
    const t = text.trim();
    if (!l || !t) return;
    setCustom((prev) => [
      ...prev,
      { id: `u-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, label: l, text: t },
    ]);
  }, []);

  const update = useCallback((id: string, label: string, text: string) => {
    setCustom((prev) => prev.map((s) => (s.id === id ? { ...s, label: label.trim() || s.label, text: text.trim() || s.text } : s)));
  }, []);

  const remove = useCallback((id: string) => {
    setCustom((prev) => prev.filter((s) => s.id !== id));
  }, []);

  return {
    /** Default + personalizzati (i default sempre in cima). */
    snippets: [...QUICK_REPLY_DEFAULTS, ...custom],
    custom,
    add,
    update,
    remove,
  };
}
