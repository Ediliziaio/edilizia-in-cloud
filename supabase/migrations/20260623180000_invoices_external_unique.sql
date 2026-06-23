-- Backstop anti-duplicati per le fatture importate da provider esterni (FIC/Aruba/...).
-- billing-import deduplica a livello applicativo (SELECT-then-insert), ma due sync
-- concorrenti (cron 05:00/11:00 UTC + bottone "Sincronizza" manuale) possono passare
-- entrambi il check "non esiste" e inserire la stessa fattura due volte.
--
-- Indice UNIQUE PARZIALE su (company_id, external_provider, external_id): vincola solo
-- le fatture importate (external_id/external_provider NON null), NON tocca le fatture
-- native emesse dal gestionale (external_id null). Un secondo insert concorrente fallisce
-- con 23505 e billing-import lo conta come "failed" (l'errore è già controllato) → nessun
-- duplicato creato, e al sync successivo diventa un UPDATE.
--
-- Verificato 2026-06-23: nessun duplicato esistente a DB, la creazione non fallirà.
create unique index if not exists invoices_external_unique
  on public.invoices (company_id, external_provider, external_id)
  where external_id is not null and external_provider is not null;
