-- L'indice unico su mkt_spesa_inserzione era scritto con coalesce(inserzione_id, ''):
-- corretto come vincolo, inutilizzabile come chiave di upsert. PostgREST risolve
-- "on_conflict" solo contro un indice fatto di colonne vere, e con
-- l'espressione ogni upsert del sync sarebbe finito in 42P10.
--
-- Da Postgres 15 si ottiene lo stesso risultato con NULLS NOT DISTINCT: al
-- livello campagna inserzione_id e' NULL, e senza questa clausola due NULL
-- sarebbero considerati diversi (quindi righe doppie a ogni sincronizzazione).

DROP INDEX IF EXISTS public.idx_mkt_spesa_inserzione_chiave;

CREATE UNIQUE INDEX IF NOT EXISTS idx_mkt_spesa_inserzione_chiave
  ON public.mkt_spesa_inserzione
     (company_id, giorno, canale, account_esterno_id, livello, campagna_id, inserzione_id)
  NULLS NOT DISTINCT;
