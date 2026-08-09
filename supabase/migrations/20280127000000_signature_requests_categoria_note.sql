-- GIÀ APPLICATA sul live il 2026-08-09 via Management API (execute_sql).
-- NON eseguire con `supabase db push` (vedi backlog migration: repo ≠ live).
--
-- La griglia "tipo documento" dell'app campo (verbale consegna, collaudo,
-- presa misure, ...) era solo grafica: la richiesta firma FEA salvava sempre
-- tipo_documento='order' e la scelta dell'operaio si perdeva. `categoria`
-- conserva la scelta, `note` il campo note del form campo.

alter table signature_requests
  add column if not exists categoria text,
  add column if not exists note text;
