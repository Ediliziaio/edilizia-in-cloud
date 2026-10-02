-- Lead Meta che rientrano dopo una chiusura (01/10/2026).
-- Impostazione per azienda, nelle impostazioni dell'integrazione Meta:
--   rientro_lead_modo   'off' (default) | 'segnala' | 'blocca'
--   rientro_lead_giorni finestra in giorni dall'ultima chiusura (perso/abbandonato)
-- Solo due colonne con default: istantaneo, nessuna riga riscritta. Chi può
-- modificarle è chi già gestisce l'integrazione (policy «Admins can manage own
-- company integrations»).
alter table public.integrations
  add column if not exists rientro_lead_modo text not null default 'off',
  add column if not exists rientro_lead_giorni integer not null default 90;

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'integrations_rientro_lead_modo_check') then
    alter table public.integrations add constraint integrations_rientro_lead_modo_check
      check (rientro_lead_modo in ('off', 'segnala', 'blocca'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'integrations_rientro_lead_giorni_check') then
    alter table public.integrations add constraint integrations_rientro_lead_giorni_check
      check (rientro_lead_giorni between 1 and 3650);
  end if;
end $$;

comment on column public.integrations.rientro_lead_modo is
  'Lead Meta che ricompila dopo una chiusura: off = come sempre, segnala = entra con etichetta e nota, blocca = nessuna nuova opportunità né automazioni.';
