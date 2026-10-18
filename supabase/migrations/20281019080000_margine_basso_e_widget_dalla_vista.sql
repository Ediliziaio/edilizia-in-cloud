-- Margine: una definizione sola anche per l'avviso WhatsApp (19/10/2026).
-- get_cantieri_margine_basso contava solo la manodopera dei rapportini (di qualsiasi stato) e
-- confrontava con il contratto × avanzamento: ORD-2026-018, a −11% nella commessa, risultava
-- al 100% e l'avviso non partiva mai. Adesso legge margine e contratto da v_ordine_marginalita,
-- come la scheda della commessa, solo per le commesse attive e non cestinate.
set local lock_timeout = '3s';
set local statement_timeout = '60s';

create or replace function public.get_cantieri_margine_basso(p_company_id uuid, p_soglia_percent numeric default 10)
returns table(cantiere_id uuid, nome text, margine_percent numeric, valore numeric)
language plpgsql stable security definer set search_path = public
as $$
begin
  perform public.assert_company_access(p_company_id);
  return query
  select v.id, coalesce(o.description, o.order_code, 'Cantiere')::text, round(v.margine_perc, 1), v.preventivo_totale
    from public.v_ordine_marginalita v
    join public.orders o on o.id = v.id
   where v.company_id = p_company_id
     and o.deleted_at is null
     and o.status in ('in_produzione', 'in_corso', 'attivo', 'aperto', 'in_lavorazione')
     and coalesce(v.preventivo_totale, 0) > 0
     and v.consuntivo > 0
     and v.margine_perc < p_soglia_percent
   order by v.margine_perc;
end;
$$;

-- Widget della dashboard (get_metric): nessuna lettura delle commesse escludeva il cestino
-- (Demo 2: 41 commesse cestinate per 1.043.400 € nel fatturato), e «Margine totale» aveva una
-- formula sua (ricavo − costo pianificato − ditte con IVA, senza manodopera). Ogni lettura di
-- orders passa ora solo dalle commesse attive; il margine è quello di v_ordine_marginalita.
create or replace function pg_temp.correggi(p_firma text, p_cerca text, p_metti text, p_atteso text)
returns void language plpgsql as $$
declare v_def text; v_nuova text;
begin
  v_def := pg_get_functiondef(p_firma::regprocedure);
  if position(p_atteso in v_def) > 0 then return; end if;
  v_nuova := regexp_replace(v_def, p_cerca, p_metti, 'g');
  if position(p_atteso in v_nuova) = 0 then
    raise exception 'Correzione non applicata a %: il testo della funzione è diverso da quello atteso', p_firma;
  end if;
  execute v_nuova;
end $$;

select pg_temp.correggi('public.get_metric(text,jsonb,text,text)',
  $re$SELECT COALESCE\(SUM\(\s*o\.total_amount\s*- COALESCE\(\(SELECT SUM\(quantity \* COALESCE\(purchase_price, 0\)\) FROM order_items WHERE order_id = o\.id\), 0\)\s*- COALESCE\(\(SELECT SUM\(total_cost\) FROM order_external_teams WHERE order_id = o\.id\), 0\)\s*\), 0\) INTO v_value FROM orders o$re$,
  $to$SELECT round(COALESCE(SUM(vm.margine), 0), 2) INTO v_value
      FROM orders o JOIN public.v_ordine_marginalita vm ON vm.id = o.id$to$,
  'JOIN public.v_ordine_marginalita vm ON vm.id = o.id');

-- Nella funzione orders compare come «FROM/JOIN orders o» (10 volte) o «FROM orders WHERE» (11).
select pg_temp.correggi('public.get_metric(text,jsonb,text,text)',
  $re$\m(FROM|JOIN)\s+orders\s+o\M$re$,
  $to$\1 (select * from public.orders where deleted_at is null) o$to$,
  '(select * from public.orders where deleted_at is null) o');
select pg_temp.correggi('public.get_metric(text,jsonb,text,text)',
  $re$\mFROM\s+orders\s+WHERE\M$re$,
  $to$FROM (select * from public.orders where deleted_at is null) orders WHERE$to$,
  '(select * from public.orders where deleted_at is null) orders WHERE');
