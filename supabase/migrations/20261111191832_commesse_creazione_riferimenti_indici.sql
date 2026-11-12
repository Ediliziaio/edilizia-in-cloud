-- Recovered from the production migration journal, already applied there.
-- The registered version predates the native general-project schema in Git.
-- Fresh databases defer the original SQL until 20290313155500; production does not rerun it.
create schema if not exists private;
create table if not exists private.recovered_dependency_patches(id text primary key);
alter table private.recovered_dependency_patches enable row level security;
revoke all on private.recovered_dependency_patches from public,anon,authenticated,service_role;

DO $defer_commesse_4$ BEGIN
IF to_regclass('public.unita_movimenti') IS NOT NULL AND to_regclass('public.generale_piano_voci') IS NOT NULL THEN
-- Indici di supporto dei riferimenti interni, senza esposizione al client.
create index if not exists order_creation_requests_order_idx on private.order_creation_requests(order_id);
create index if not exists order_creation_requests_actor_idx on private.order_creation_requests(actor_id);

ELSE INSERT INTO private.recovered_dependency_patches(id) VALUES ('20261111191832_commesse_creazione_riferimenti_indici.sql') ON CONFLICT DO NOTHING;
END IF; END $defer_commesse_4$;
