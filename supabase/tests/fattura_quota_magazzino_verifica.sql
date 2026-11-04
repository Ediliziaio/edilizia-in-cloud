-- Verifica dei controlli sulla quota «a magazzino» di un costo.
-- Si lancia su un database vero e NON lascia niente dietro: l'ultima istruzione
-- fa fallire la transazione di proposito e stampa gli esiti.
--
--   supabase db query --remote --yes -f supabase/tests/fattura_quota_magazzino_verifica.sql
--
-- Esiti attesi (verificati il 04/11/2026 su produzione):
--   1) magazzino 300 su 1000                 -> accettato
--   2) magazzino 1200 su 1000                -> rifiutato
--   3) commesse 800 + magazzino 300 su 1000  -> rifiutato
--   4) commesse 700 + magazzino 300 = 1000   -> accettato
--   5) magazzino negativo                    -> rifiutato

begin;

do $$
declare
  v_company uuid; v_cost uuid; v_order uuid; v_esiti text := ''; v_err text;
begin
  select o.company_id, o.id into v_company, v_order from public.orders o where o.deleted_at is null limit 1;
  insert into public.company_costs (company_id, name, cost_type, amount, recurrence, due_date)
  values (v_company, 'PROVA quota magazzino', 'variable', 1000, 'once', current_date)
  returning id into v_cost;

  -- 1) quota a magazzino da sola, entro l'importo: passa
  update public.company_costs set quota_magazzino = 300 where id = v_cost;
  v_esiti := v_esiti || E'1) magazzino 300 su 1000 -> accettato\n';

  -- 2) quota a magazzino oltre l'importo: rifiutata
  begin
    update public.company_costs set quota_magazzino = 1200 where id = v_cost;
    v_esiti := v_esiti || E'2) magazzino 1200 su 1000 -> ACCETTATO (SBAGLIATO)\n';
  exception when others then
    v_esiti := v_esiti || format(E'2) magazzino 1200 su 1000 -> rifiutato: %s\n', sqlerrm);
  end;

  -- 3) commesse 80% + magazzino 300 = 1100 su 1000: rifiutata
  begin
    update public.company_costs
       set allocations = jsonb_build_array(jsonb_build_object('order_id', v_order::text, 'pct', 80, 'importo', 800)),
           quota_magazzino = 300
     where id = v_cost;
    v_esiti := v_esiti || E'3) commesse 800 + magazzino 300 -> ACCETTATO (SBAGLIATO)\n';
  exception when others then
    v_esiti := v_esiti || format(E'3) commesse 800 + magazzino 300 -> rifiutato: %s\n', sqlerrm);
  end;

  -- 4) commesse 70% + magazzino 300 = 1000 esatto: passa
  update public.company_costs
     set allocations = jsonb_build_array(jsonb_build_object('order_id', v_order::text, 'pct', 70, 'importo', 700)),
         quota_magazzino = 300
   where id = v_cost;
  v_esiti := v_esiti || E'4) commesse 700 + magazzino 300 = 1000 -> accettato\n';

  -- 5) quota negativa: rifiutata
  begin
    update public.company_costs set quota_magazzino = -5 where id = v_cost;
    v_esiti := v_esiti || E'5) magazzino -5 -> ACCETTATO (SBAGLIATO)\n';
  exception when others then
    v_esiti := v_esiti || format(E'5) magazzino -5 -> rifiutato: %s\n', sqlerrm);
  end;

  raise exception E'\n%\n', v_esiti;
end $$;
