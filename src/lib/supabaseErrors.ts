/**
 * Translates Supabase/PostgreSQL error codes into user-friendly Italian messages.
 */

const PG_ERROR_MAP: Record<string, string> = {
  "42501": "Non hai i permessi per eseguire questa operazione.",
  "23503": "Impossibile completare: il dato è collegato ad altri record.",
  "23505": "Esiste già un record con gli stessi dati. Verifica e riprova.",
  "23502": "Uno o più campi obbligatori non sono stati compilati.",
  "22P02": "Formato dati non valido. Controlla i campi inseriti.",
  "PGRST116": "Nessun record trovato.",
  "PGRST301": "La sessione è scaduta. Effettua nuovamente il login.",
};

export function formatSupabaseError(error: unknown): string {
  if (!error || typeof error !== "object") return "Errore sconosciuto.";

  const err = error as { code?: string; message?: string; details?: string };

  if (err.code && PG_ERROR_MAP[err.code]) {
    return PG_ERROR_MAP[err.code];
  }

  if (err.message?.includes("JWT expired") || err.message?.includes("token is expired")) {
    return "La sessione è scaduta. Effettua nuovamente il login.";
  }

  if (err.message?.includes("Failed to fetch") || err.message?.includes("NetworkError")) {
    return "Errore di connessione. Verifica la tua rete e riprova.";
  }

  return err.message || "Si è verificato un errore imprevisto.";
}
