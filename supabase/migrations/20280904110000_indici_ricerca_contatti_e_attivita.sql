-- Ondata 1.3 — gli indici che mancavano alla ricerca
--
-- Misurato prima, come utente autenticato, sulla ricerca contatti reale
-- (ILIKE su nome, cognome, email, telefono, ordinata per data):
--
--   Index Scan using idx_marketing_contacts_created_at
--     Rows Removed by Filter: 90381
--     Execution Time: 10228 ms  (media su ripetizioni: 1.280 ms, picco 3.636)
--
-- Scorreva tutte le 90.381 righe per restituirne al massimo 171: `ILIKE
-- '%testo%'` non può usare un btree, e dei 32 indici già presenti su
-- marketing_contacts nessuno era trigram.
--
-- pg_trgm era già installato. Un indice GIN per colonna, perché la ricerca
-- dell'interfaccia mette le quattro condizioni in OR: così il pianificatore le
-- combina con un BitmapOr invece di scorrere la tabella.

CREATE INDEX IF NOT EXISTS idx_mc_trgm_first_name
  ON public.marketing_contacts USING gin (first_name gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_mc_trgm_last_name
  ON public.marketing_contacts USING gin (last_name gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_mc_trgm_email
  ON public.marketing_contacts USING gin (email gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_mc_trgm_phone
  ON public.marketing_contacts USING gin (phone gin_trgm_ops);

-- Spesso si cerca il nome completo: senza questo, "mario rossi" non trova nulla
-- perché nome e cognome stanno in colonne diverse.
CREATE INDEX IF NOT EXISTS idx_mc_trgm_nome_completo
  ON public.marketing_contacts USING gin (
    (coalesce(first_name,'') || ' ' || coalesce(last_name,'')) gin_trgm_ops);

-- company_activity_log aveva company_id e created_at in due indici separati:
-- per "le ultime 50 attività di questa azienda" il database doveva prenderne
-- uno e filtrare o riordinare a mano. L'audit misurava 1.120 ms per 50 righe.
CREATE INDEX IF NOT EXISTS idx_activity_log_company_created
  ON public.company_activity_log (company_id, created_at DESC);

ANALYZE public.marketing_contacts;
ANALYZE public.company_activity_log;
