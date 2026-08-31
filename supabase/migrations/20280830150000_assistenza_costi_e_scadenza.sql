-- GIÀ APPLICATA sul live il 2026-08-30 via Management API e registrata in
-- supabase_migrations.schema_migrations.
--
-- Costo dell'intervento e ponte verso lo scadenzario.
-- Si salvano i numeri di partenza (ore, costo orario, trasferta, materiale) e
-- non i totali: totale e margine si ricalcolano sempre, mentre il costo orario
-- del tecnico cambia nel tempo e va congelato a quello del giorno
-- dell'intervento, altrimenti un aumento di paga riscriverebbe la marginalità
-- di tutto lo storico.
alter table tickets
  add column if not exists ore_effettive numeric,
  add column if not exists costo_orario_applicato numeric,
  add column if not exists costo_trasferta numeric,
  add column if not exists costo_materiale numeric,
  add column if not exists scadenza_id uuid references scadenze(id) on delete set null;

alter table tickets drop constraint if exists tickets_costi_non_negativi;
alter table tickets add constraint tickets_costi_non_negativi check (
  coalesce(ore_effettive,0) >= 0 and coalesce(costo_orario_applicato,0) >= 0
  and coalesce(costo_trasferta,0) >= 0 and coalesce(costo_materiale,0) >= 0
);

alter table scadenze add column if not exists ticket_id uuid references tickets(id) on delete set null;
create index if not exists idx_scadenze_ticket on scadenze(ticket_id) where ticket_id is not null;
