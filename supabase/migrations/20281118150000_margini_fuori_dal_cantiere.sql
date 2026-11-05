-- L'operaio e il subappaltatore leggevano ricavi, costi e margine delle loro commesse dalla vista
-- v_ordine_marginalita. L'app di cantiere non la usa (verificato sugli import di campoRoutes e
-- tecnicoRoutes): la vista resta uguale per tutti gli altri, e per chi lavora solo in cantiere è vuota.
-- CREATE OR REPLACE VIEW azzera le opzioni della vista: security_invoker va ridetta, altrimenti la
-- vista leggerebbe i dati di tutte le aziende. Il controllo in fondo annulla tutto se manca.
do $mig$
declare
  v_def text := pg_get_viewdef('public.v_ordine_marginalita'::regclass, true);
  v_opzioni text;
begin
  if v_def not like '%e_solo_campo()%' then
    v_def := rtrim(rtrim(v_def), ';');
    execute 'create or replace view public.v_ordine_marginalita with (security_invoker = true) as '
      || v_def || ' where not public.e_solo_campo()';
  end if;
  select coalesce(array_to_string(reloptions, ','), '') into v_opzioni
    from pg_class where oid = 'public.v_ordine_marginalita'::regclass;
  if v_opzioni !~* 'security_invoker=(true|on)' then
    raise exception 'v_ordine_marginalita senza security_invoker: annullo';
  end if;
end $mig$;
