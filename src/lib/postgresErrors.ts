/**
 * Postgres error → messaggio user-friendly italiano.
 *
 * 2026-05-27: prima i toast.error mostravano direttamente
 * `error.message` da Supabase → utenti edili vedevano stringhe tipo
 * `"duplicate key value violates unique constraint orders_order_code_key"`
 * e non capivano cosa fare. Ora con questo helper mostriamo messaggi
 * azionabili in italiano.
 *
 * Codici postgres standard:
 *   23505 = unique_violation (duplicate key)
 *   23503 = foreign_key_violation
 *   23502 = not_null_violation
 *   23514 = check_violation
 *   42501 = insufficient_privilege (RLS!)
 *   42P01 = undefined_table
 *   42703 = undefined_column
 *   22P02 = invalid_text_representation (uuid/int malformato)
 *   22001 = string_data_right_truncation (varchar troppo lungo)
 *   40P01 = deadlock_detected
 *   57014 = query_canceled (timeout)
 *   53300 = too_many_connections
 *
 * Pattern Supabase: `error.code` o `error.message` contiene il codice + dettagli.
 */

export interface FriendlyErrorMessage {
  title: string;
  description: string;
}

export interface PostgresErrorLike {
  code?: string;
  message?: string;
  details?: string | null;
  hint?: string | null;
}

/**
 * Mappa errore postgres / Supabase in messaggio user-friendly.
 *
 * Uso:
 *   onError: (e) => {
 *     const { title, description } = friendlyPostgresError(e);
 *     toast.error(title, { description });
 *   }
 */
export function friendlyPostgresError(
  error: unknown,
  context?: {
    /** Es. "creazione commessa", "salvataggio anagrafica" — usato per fallback message. */
    operation?: string;
  },
): FriendlyErrorMessage {
  const operation = context?.operation ?? "operazione";
  const fallbackTitle = `Errore durante ${operation}`;

  if (!error) {
    return { title: fallbackTitle, description: "Errore sconosciuto. Riprova." };
  }

  const err = error as PostgresErrorLike;
  const code = err.code ?? "";
  const msg = err.message ?? "";
  const details = err.details ?? "";
  const lowerMsg = msg.toLowerCase();

  // 23505 — duplicate key
  if (code === "23505" || lowerMsg.includes("duplicate key") || lowerMsg.includes("unique constraint")) {
    // Estraggo nome constraint per messaggi più precisi
    const constraintMatch = msg.match(/constraint\s+"?([^"\s]+)"?/i);
    const constraint = constraintMatch?.[1] ?? "";

    if (constraint.includes("order_code") || constraint.includes("orders_code")) {
      return {
        title: "Codice commessa già esistente",
        description: "Hai già una commessa con questo codice. Cambia il codice o lascia vuoto per generarlo automaticamente.",
      };
    }
    if (constraint.includes("partita_iva") || constraint.includes("p_iva")) {
      return {
        title: "Partita IVA già registrata",
        description: "Esiste già un'anagrafica con questa partita IVA.",
      };
    }
    if (constraint.includes("codice_fiscale") || constraint.includes("cf_")) {
      return {
        title: "Codice fiscale già registrato",
        description: "Esiste già un'anagrafica con questo codice fiscale.",
      };
    }
    if (constraint.includes("email") || constraint.includes("_email_")) {
      return {
        title: "Email già in uso",
        description: "Questo indirizzo email è già associato a un altro record.",
      };
    }
    if (constraint.includes("booking_slug") || constraint.includes("slug")) {
      return {
        title: "Link pubblico già usato",
        description: "Lo slug del link è già in uso. Cambialo con uno diverso.",
      };
    }
    return {
      title: "Dato duplicato",
      description: "Un valore univoco è già presente nel sistema. Verifica e riprova.",
    };
  }

  // 42501 — RLS insufficient privilege
  if (code === "42501" || lowerMsg.includes("row-level security") || lowerMsg.includes("permission denied")) {
    return {
      title: "Permessi insufficienti",
      description: "Non hai i permessi necessari per questa operazione. Contatta l'amministratore dell'azienda.",
    };
  }

  // 23503 — foreign key violation
  if (code === "23503" || lowerMsg.includes("foreign key")) {
    return {
      title: "Riferimento non valido",
      description: "Uno dei dati selezionati (cliente, fornitore, articolo…) non esiste più o è stato eliminato. Ricarica e riprova.",
    };
  }

  // 23502 — NOT NULL violation
  if (code === "23502" || lowerMsg.includes("null value")) {
    const colMatch = msg.match(/column\s+"?([^"\s]+)"?/i);
    return {
      title: "Campo obbligatorio mancante",
      description: colMatch ? `Il campo "${colMatch[1]}" è obbligatorio.` : "Manca un campo obbligatorio. Verifica i dati inseriti.",
    };
  }

  // 23514 — check constraint
  if (code === "23514" || lowerMsg.includes("check constraint")) {
    return {
      title: "Valore non valido",
      description: details || "Uno dei valori inseriti non rispetta le regole. Verifica e riprova.",
    };
  }

  // 22P02 — invalid uuid/int format
  if (code === "22P02" || lowerMsg.includes("invalid input syntax")) {
    return {
      title: "Formato dato non valido",
      description: "Uno dei campi ha un formato sbagliato (es. numero o data malformata).",
    };
  }

  // 22001 — string too long
  if (code === "22001" || lowerMsg.includes("value too long")) {
    return {
      title: "Testo troppo lungo",
      description: "Uno dei campi supera la lunghezza massima consentita.",
    };
  }

  // 40P01 — deadlock
  if (code === "40P01" || lowerMsg.includes("deadlock")) {
    return {
      title: "Conflitto temporaneo",
      description: "Il sistema sta processando troppe richieste contemporaneamente. Riprova tra qualche secondo.",
    };
  }

  // 57014 — timeout
  if (code === "57014" || lowerMsg.includes("canceling statement") || lowerMsg.includes("timeout")) {
    return {
      title: "Operazione troppo lenta",
      description: "Il database ha impiegato troppo tempo. Riprova oppure contatta l'assistenza se persiste.",
    };
  }

  // 53300 — too many connections
  if (code === "53300" || lowerMsg.includes("too many connections")) {
    return {
      title: "Sistema sovraccarico",
      description: "Riprova tra qualche secondo.",
    };
  }

  // Network / fetch fallito
  if (lowerMsg.includes("network") || lowerMsg.includes("fetch failed") || lowerMsg.includes("failed to fetch")) {
    return {
      title: "Connessione persa",
      description: "Verifica la connessione internet e riprova.",
    };
  }

  // Token scaduto / unauthorized
  if (code === "PGRST301" || lowerMsg.includes("jwt") || lowerMsg.includes("unauthorized") || lowerMsg.includes("token")) {
    return {
      title: "Sessione scaduta",
      description: "Effettua di nuovo l'accesso.",
    };
  }

  // Fallback: messaggio originale sanitizzato (no stack trace, no SQL)
  const cleaned = msg
    .replace(/\b(constraint|relation|column|table)\s+"[^"]+"/gi, "$1")
    .substring(0, 200);
  return {
    title: fallbackTitle,
    description: cleaned || "Errore sconosciuto. Riprova o contatta l'assistenza.",
  };
}
