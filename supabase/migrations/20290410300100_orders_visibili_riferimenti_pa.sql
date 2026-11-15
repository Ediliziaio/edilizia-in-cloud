-- Il browser legge le commesse da orders_visibili (lib/orders/protectedOrderRequests.ts), che ha le
-- colonne scritte una per una: orders.riferimenti_pa_attivi (20290410300000) va aggiunta anche lì,
-- altrimenti la sezione «Dati appalto e fatturazione PA» non saprebbe di essere accesa.
-- Si aggiunge in coda (create or replace view accetta solo colonne nuove in fondo) e si
-- ripetono le opzioni della vista (security_barrier), che create or replace altrimenti azzera.
do $vista$
declare
  definizione text; nuova text; opzioni text; segno text := E'\n   FROM (orders orders';
begin
  definizione := pg_get_viewdef('public.orders_visibili'::regclass, false);
  if position('riferimenti_pa_attivi' in definizione) > 0 then
    return;
  end if;
  if position(segno in definizione) = 0 then
    raise exception 'orders_visibili: forma inattesa, aggiungere riferimenti_pa_attivi a mano';
  end if;
  nuova := replace(definizione, segno, E',\n    orders.riferimenti_pa_attivi' || segno);
  select coalesce(array_to_string(reloptions, ', '), '') into opzioni from pg_class where oid = 'public.orders_visibili'::regclass;
  execute format('create or replace view public.orders_visibili %s as %s',
    case when opzioni <> '' then 'with (' || opzioni || ')' else '' end, nuova);
end $vista$;
