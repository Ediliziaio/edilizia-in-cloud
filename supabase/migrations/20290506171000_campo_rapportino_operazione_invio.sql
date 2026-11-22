-- Una risposta persa non deve rispedire un rapporto che l'ufficio ha già
-- ricevuto, anche quando nel frattempo lo ha rimandato indietro.
set local lock_timeout = '3s';
alter table public.campo_rapportini add column if not exists invio_operazione_id uuid;
grant select (invio_operazione_id) on public.campo_rapportini to authenticated;

-- L'app scrive attraverso la vista protetta. Aggiungi il campo in coda
-- mantenendo la proiezione dei costi, i permessi e il trigger esistenti.
do $proiezione$
declare
  definizione text;
  definizione_aggiornata text;
begin
  if not exists (
    select 1 from pg_attribute
    where attrelid = 'public.campo_rapportini_visibili'::regclass
      and attname = 'invio_operazione_id' and not attisdropped
  ) then
    definizione := pg_get_viewdef('public.campo_rapportini_visibili'::regclass, true);
    definizione_aggiornata := regexp_replace(
      definizione,
      E'\n([[:blank:]]*FROM (public\\.)?campo_rapportini cr)',
      E',\n    cr.invio_operazione_id\n\\1'
    );
    if definizione_aggiornata = definizione then
      raise exception 'Proiezione campo_rapportini_visibili non riconosciuta';
    end if;
    execute 'create or replace view public.campo_rapportini_visibili with (security_barrier=true) as '
      || definizione_aggiornata;
  end if;
end
$proiezione$;

notify pgrst, 'reload schema';
