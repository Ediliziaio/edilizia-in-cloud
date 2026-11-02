-- Le due viste dei documenti aziendali giravano coi diritti del proprietario e
-- saltavano le regole per azienda: un utente avrebbe letto i documenti di tutti.
-- Trovato con la tabella ancora vuota: nessun dato è uscito.
SET LOCAL lock_timeout = '3s';
ALTER VIEW public.azienda_documenti_stato SET (security_invoker = on);
ALTER VIEW public.azienda_scadenze_tutte SET (security_invoker = on);
