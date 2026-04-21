/**
 * listinoErrors — traduzione user-friendly degli errori Supabase/PostgREST
 * specifici del dominio listino (macrocategorie, categorie, articoli).
 *
 * Obiettivo: mostrare messaggi in italiano sensati al posto di errori
 * tecnici come "duplicate key value violates unique constraint" o
 * "Could not find the X column in the schema cache".
 *
 * Utilizzo tipico nei catch delle mutation:
 *   toast.error("Errore salvataggio", {
 *     description: translateListinoError(err),
 *   });
 *
 * Se l'errore non è riconosciuto, torna al messaggio originale (o un
 * fallback generico).
 */

export interface TranslatedError {
  message: string;
  /** True se è un errore transitorio e il caller può suggerire un retry. */
  isTransient: boolean;
}

/**
 * Traduce errori noti di Supabase/PostgREST in messaggi UX italiani.
 * Non fa throw: sempre restituisce un oggetto strutturato.
 */
export function translateListinoError(err: unknown): TranslatedError {
  const raw =
    err instanceof Error
      ? err.message
      : typeof err === "string"
        ? err
        : "Errore sconosciuto";

  // PostgREST schema cache miss: si verifica subito dopo una migration
  // finché il polling di PostgREST non ri-sincronizza lo schema. Dopo il
  // NOTIFY pgrst 'reload schema' dovrebbe sparire in < 1s.
  if (/Could not find the .* column .* in the schema cache/i.test(raw)) {
    return {
      message:
        "Lo schema del database è appena stato aggiornato. Attendi qualche secondo e riprova.",
      isTransient: true,
    };
  }

  // Duplicate key (UNIQUE constraint violation)
  if (
    /duplicate key value violates unique constraint/i.test(raw) ||
    raw.includes("23505")
  ) {
    if (/listino_macrocategorie/i.test(raw) || /macrocat/i.test(raw)) {
      return {
        message: "Esiste già una macrocategoria con questo nome.",
        isTransient: false,
      };
    }
    if (/listino_categorie/i.test(raw)) {
      return {
        message: "Esiste già una categoria con questo nome.",
        isTransient: false,
      };
    }
    return {
      message: "Nome già in uso. Sceglierne uno diverso.",
      isTransient: false,
    };
  }

  // Foreign key violation (es. eliminazione bloccata da articoli collegati)
  if (
    /violates foreign key constraint/i.test(raw) ||
    raw.includes("23503")
  ) {
    return {
      message:
        "Impossibile eliminare: ci sono elementi collegati. Scollegarli o eliminarli prima.",
      isTransient: false,
    };
  }

  // Not null violation
  if (
    /null value in column .* violates not-null constraint/i.test(raw) ||
    raw.includes("23502")
  ) {
    return {
      message: "Compilare tutti i campi obbligatori.",
      isTransient: false,
    };
  }

  // Permission denied (RLS)
  if (
    /permission denied/i.test(raw) ||
    /row violates row-level security/i.test(raw) ||
    raw.includes("42501")
  ) {
    return {
      message: "Permessi insufficienti per questa operazione.",
      isTransient: false,
    };
  }

  // Rete / timeout
  if (/network|timeout|fetch/i.test(raw)) {
    return {
      message: "Problema di rete. Controlla la connessione e riprova.",
      isTransient: true,
    };
  }

  // Fallback: messaggio originale troncato se troppo lungo
  return {
    message: raw.length > 160 ? `${raw.slice(0, 157)}…` : raw,
    isTransient: false,
  };
}
