-- 20290322131000_subappalti_sulla_generale.sql
--
-- Un subappalto si può registrare sulla commessa generale stessa (Cantiere → «Registra e
-- consulta su: Commessa generale»): Demo Azienda, O-0064, 200.000 €. Ma l'elenco dei
-- subappalti del contratto (generale_subappalti_elenco) guardava solo le figlie, e così la sua
-- quota subappaltata; e generale_subappalto_collega rifiutava di legarlo ai lotti
-- («Subappalto non trovato in questo contratto»). Lotto C, 14/11/2026.
--
-- 1. L'elenco comprende la generale: fra gli ordini (per prima) e fra i contratti.
-- 2. Il collegamento accetta un subappalto nato sulla generale e la generale fra gli ordini;
--    il trigger di coerenza tratta la generale come appartenente a se stessa.

do $migrazione$
declare
  elenco text := pg_get_functiondef('public.generale_subappalti_elenco(uuid)'::regprocedure);
  collega text := pg_get_functiondef('public.generale_subappalto_collega(uuid,uuid,uuid[])'::regprocedure);
  coerente text := pg_get_functiondef('public.generale_subappalto_ordini_coerente()'::regprocedure);
  gen_principale_vecchio constant text := 'select o.commessa_generale_id into v_gen_principale from public.orders o where o.id = v_principale;';
  gen_principale_nuovo constant text := 'select coalesce(o.commessa_generale_id, (select g.order_id from public.commesse_generali g where g.order_id = o.id)) into v_gen_principale from public.orders o where o.id = v_principale;';
  gen_ordine_vecchio constant text := 'select o.commessa_generale_id, o.company_id into v_gen_ordine, v_azienda_ordine from public.orders o where o.id = new.order_id;';
  gen_ordine_nuovo constant text := 'select coalesce(o.commessa_generale_id, (select g.order_id from public.commesse_generali g where g.order_id = o.id)), o.company_id into v_gen_ordine, v_azienda_ordine from public.orders o where o.id = new.order_id;';
  solo_figlie constant text := 'where o.commessa_generale_id = p_generale_id and o.deleted_at is null';
  anche_generale constant text := 'where (o.commessa_generale_id = p_generale_id or o.id = p_generale_id) and o.deleted_at is null';
  ordine_vecchio constant text := 'order by o.order_code nulls last, o.description), ''[]''::jsonb)
    into v_ordini';
  ordine_nuovo constant text := 'order by (o.id = p_generale_id) desc, o.order_code nulls last, o.description), ''[]''::jsonb)
    into v_ordini';
  principale_vecchio constant text := 'and o.commessa_generale_id = p_generale_id;';
  principale_nuovo constant text := 'and (o.commessa_generale_id = p_generale_id or o.id = p_generale_id);';
  legati_vecchio constant text := 'where o.id = x.id and o.commessa_generale_id = p_generale_id and o.deleted_at is null';
  legati_nuovo constant text := 'where o.id = x.id and (o.commessa_generale_id = p_generale_id or o.id = p_generale_id) and o.deleted_at is null';
begin
  if position(anche_generale in elenco) = 0 then
    if (length(elenco) - length(replace(elenco, solo_figlie, ''))) / length(solo_figlie) <> 2
       or position(ordine_vecchio in elenco) = 0 then
      raise exception 'generale_subappalti_elenco: non trovo i punti da cambiare';
    end if;
    execute replace(replace(elenco, solo_figlie, anche_generale), ordine_vecchio, ordine_nuovo);
  end if;
  if position(principale_nuovo in collega) = 0 then
    if position(principale_vecchio in collega) = 0 or position(legati_vecchio in collega) = 0 then
      raise exception 'generale_subappalto_collega: non trovo i punti da cambiare';
    end if;
    execute replace(replace(collega, principale_vecchio, principale_nuovo), legati_vecchio, legati_nuovo);
  end if;
  if position(gen_principale_nuovo in coerente) = 0 then
    if position(gen_principale_vecchio in coerente) = 0 or position(gen_ordine_vecchio in coerente) = 0 then
      raise exception 'generale_subappalto_ordini_coerente: non trovo i punti da cambiare';
    end if;
    execute replace(replace(coerente, gen_principale_vecchio, gen_principale_nuovo), gen_ordine_vecchio, gen_ordine_nuovo);
  end if;
end
$migrazione$;
