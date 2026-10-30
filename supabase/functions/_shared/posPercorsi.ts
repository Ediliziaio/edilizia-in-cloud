/**
 * Percorso di storage che arriva da dati modificabili o da altre fonti: supabase-js lo attacca all'URL senza
 * codificarlo, quindi un segmento %2e%2e farebbe uscire la richiesta dallo storage (verso /rest/v1/ o /auth/v1/
 * con la chiave di servizio). Niente %, ?, # né caratteri di controllo o di inversione del testo, e nessun
 * segmento vuoto, «.» o «..».
 */
export function percorsoStorageSicuro(path: unknown): path is string {
  return typeof path === "string" && path.length > 0 && path.length <= 1024
    && !/[\\%?#\u0000-\u001f\u007f\u2028\u2029\u202a-\u202e\u2066-\u2069]/.test(path)
    && path.split("/").every(s => s !== "" && s !== "." && s !== "..");
}
