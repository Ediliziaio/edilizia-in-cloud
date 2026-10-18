-- Margine della commessa: il costo delle ditte esterne senza IVA.
-- order_external_teams.total_cost si inserisce IVA inclusa (lo dice la finestra di assegnazione e lo
-- scorpora già Economia → Manodopera, laborEconomics.externalLaborNet), mentre i ricavi del margine
-- sono senza IVA. v_ordine_marginalita sommava il lordo: al 18/10/2026 su 113 commesse il margine
-- contava come costo 565.042 € di IVA. Qui il costo della ditta diventa
-- total_cost / (1 + aliquota/100), aliquota 22 se non indicata, come nel resto dell'app.
-- La vista si ricrea dalla sua definizione attuale cambiando solo quel pezzo: se il pezzo non c'è
-- (definizione già cambiata) la migrazione si ferma invece di indovinare.
set local lock_timeout = '3s';
set local statement_timeout = '60s';

do $$
declare
  v_def text := pg_get_viewdef('public.v_ordine_marginalita'::regclass, true);
  v_nuova text;
begin
  if v_def ilike '%total_cost / (1::numeric + COALESCE(order_external_teams.vat_rate%' then
    return; -- già applicata
  end if;
  v_nuova := regexp_replace(
    v_def,
    'SELECT order_external_teams\.order_id,\s+order_external_teams\.total_cost\s+FROM order_external_teams',
    'SELECT order_external_teams.order_id, order_external_teams.total_cost / (1::numeric + COALESCE(order_external_teams.vat_rate, 22::numeric) / 100::numeric) AS total_cost FROM order_external_teams');
  if v_nuova = v_def then
    raise exception 'v_ordine_marginalita: il costo delle ditte non è dove ci si aspetta, controllare la definizione';
  end if;
  execute 'create or replace view public.v_ordine_marginalita with (security_invoker = true) as ' || v_nuova;
end $$;
