-- Ordini e offerte senza prezzi, per chi non ha il permesso di vedere i costi (08/11/2026).
--
-- In Postgres una colonna non si nasconde utente per utente: chi non ha il permesso legge queste
-- viste, con le stesse colonne e i prezzi vuoti. La scelta la fa `lib/acquisti/letturaSenzaPrezzi`.
-- Da sole non cambiano niente: il blocco sulle tabelle sta in una migrazione successiva.
-- Le viste girano coi diritti del proprietario: il filtro per azienda e area sta dentro, e
-- `security_barrier` impedisce di aggirarlo con le condizioni della query.
--
-- Nessuna riga viene scritta. Rieseguirla non fa niente.
set local lock_timeout = '3s';
set local statement_timeout = '60s';

create or replace function public.acquisti_aziende_senza_prezzi(p_solo_rdo boolean)
returns uuid[]
language sql
stable
security definer
set search_path to 'public'
as $function$
  select case
    when public.utente_bloccato() or public.e_solo_campo() or public.utente_e_cliente_esterno() then '{}'::uuid[]
    else array(
      select c from unnest(
        public.aziende_area(array['can_view_orders','can_edit_orders','can_view_warehouse','can_manage_suppliers','can_manage_purchasing',
                                  'can_validate_bom','can_view_costs','can_view_subappaltatori'])::uuid[]
        || case when p_solo_rdo then '{}'::uuid[] else
             public.aziende_area(array['can_edit_warehouse','can_view_billing','can_view_financial_reports','can_view_scadenzario','can_view_tickets',
                                       'can_edit_tickets','can_view_cruscotto','can_view_settings_suppliers','can_view_forecast','can_view_tesoreria'])::uuid[]
             || case when public.utente_call_center() then '{}'::uuid[]
                     else public.aziende_area(array['can_view_dashboard','can_view_calendar'])::uuid[] end
           end) c
      where c = public.get_my_company_id())
  end;
$function$;
revoke all on function public.acquisti_aziende_senza_prezzi(boolean) from public, anon;
grant execute on function public.acquisti_aziende_senza_prezzi(boolean) to authenticated;

do $migrazione$
declare
  t record;
  v_lista text;
begin
  for t in select * from (values
    ('purchase_orders', array['subtotal','vat_total','total'], false),
    ('purchase_order_items', array['unit_price','discount_percent','line_total','vat_amount'], false),
    ('supplier_rfq_quotes', array['prezzo_unitario','sconto_percentuale'], true),
    ('supplier_rfq_suppliers', array['totale_offerto','costo_trasporto'], true)
  ) as v(tabella, prezzi, solo_rdo) loop
    select string_agg(case when a.attname = any(t.prezzi)
                           then format('null::%s as %I', format_type(a.atttypid, a.atttypmod), a.attname)
                           else format('%I', a.attname) end, ', ' order by a.attnum)
      into v_lista
      from pg_attribute a
     where a.attrelid = format('public.%I', t.tabella)::regclass and a.attnum > 0 and not a.attisdropped;

    execute format(
      'create or replace view public.%I with (security_barrier = true) as select %s from public.%I x where x.company_id = any ((select public.acquisti_aziende_senza_prezzi(%L::boolean))::uuid[])',
      t.tabella || '_senza_prezzi', v_lista, t.tabella, t.solo_rdo);
    execute format('revoke all on public.%I from public, anon', t.tabella || '_senza_prezzi');
    execute format('grant select on public.%I to authenticated', t.tabella || '_senza_prezzi');
  end loop;
end
$migrazione$;
