-- Fatture ricevute, ordini al fornitore e note di credito (19/10/2026).
--
--  1. Una fattura già contabilizzata e poi collegata a un ordine porta con sé il suo costo: quando
--     l'ordine risulta ricevuto non nasce un secondo costo (prima il debito raddoppiava).
--  2. Nota di credito contabilizzata prima della fattura: la fattura conferma il costo dell'ordine al
--     netto delle note già applicate (prima la nota spariva).
--  3. Nota di credito più grande del costo che rettifica: si ferma con un messaggio invece di azzerare
--     in silenzio. Una nota già contabilizzata non si applica due volte.
set local lock_timeout = '3s';
set local statement_timeout = '60s';

create or replace function pg_temp.sostituisci(p_firma text, p_vecchio text, p_nuovo text)
returns void language plpgsql as $$
declare v_def text;
begin
  v_def := pg_get_functiondef(p_firma::regprocedure);
  if position(p_nuovo in v_def) > 0 then return; end if;
  if position(p_vecchio in v_def) = 0 then
    raise exception 'Testo non trovato in %: %', p_firma, left(p_vecchio, 80);
  end if;
  execute replace(v_def, p_vecchio, p_nuovo);
end $$;

-- 1 ────────────────────────────────────────────────────────────────────────────────────────
create or replace function public.fattura_ricevuta_porta_costo_su_ordine()
returns trigger language plpgsql security definer set search_path to 'public'
as $function$
begin
  if new.company_cost_id is not null and new.purchase_order_id is not null
     and new.purchase_order_id is distinct from old.purchase_order_id then
    update public.company_costs c
       set purchase_order_id = new.purchase_order_id,
           order_id = coalesce(c.order_id, (select po.order_id from public.purchase_orders po
                                             where po.id = new.purchase_order_id and po.company_id = new.company_id)),
           updated_at = now()
     where c.id = new.company_cost_id and c.company_id = new.company_id and c.purchase_order_id is null;
  end if;
  return new;
end
$function$;
revoke all on function public.fattura_ricevuta_porta_costo_su_ordine() from public, anon, authenticated;
drop trigger if exists fattura_ricevuta_porta_costo_su_ordine on public.fatture_ricevute;
create trigger fattura_ricevuta_porta_costo_su_ordine after update of purchase_order_id on public.fatture_ricevute
  for each row execute function public.fattura_ricevuta_porta_costo_su_ordine();

-- Le fatture già collegate così (una sola oggi): il loro costo va sull'ordine.
update public.company_costs c
   set purchase_order_id = f.purchase_order_id, updated_at = now()
  from public.fatture_ricevute f
 where f.company_cost_id = c.id and f.purchase_order_id is not null
   and c.purchase_order_id is null and c.company_id = f.company_id;

-- 2 e 3 ────────────────────────────────────────────────────────────────────────────────────
select pg_temp.sostituisci('public.contabilizza_fattura_ricevuta(uuid)',
  $v$  v_nota_credito := coalesce(f.tipo_documento, '') in ('TD04', 'passive_credit_note');$v$,
  $n$  v_nota_credito := coalesce(f.tipo_documento, '') in ('TD04', 'passive_credit_note');
  -- una nota già applicata a un costo non si applica una seconda volta
  if v_nota_credito and f.company_cost_id is not null then
    return jsonb_build_object('esito', 'gia_contabilizzata', 'company_cost_id', f.company_cost_id);
  end if;$n$);
select pg_temp.sostituisci('public.contabilizza_fattura_ricevuta(uuid)',
  $v$    if v_costo_esist_id is null then
      raise exception 'Una nota di credito riduce un costo: collegala prima all''ordine al fornitore della fattura che rettifica.';
    end if;$v$,
  $n$    if v_costo_esist_id is null then
      raise exception 'Una nota di credito riduce un costo: collegala prima all''ordine al fornitore della fattura che rettifica.';
    end if;
    if v_imponibile > (select coalesce(amount, 0) from public.company_costs where id = v_costo_esist_id) + 0.01 then
      raise exception 'La nota di credito (% € imponibile) supera il costo dell''ordine che rettifica (% €): controlla gli importi o l''ordine collegato.',
        replace(to_char(v_imponibile, 'FM999999990.00'), '.', ','),
        replace(to_char((select coalesce(amount, 0) from public.company_costs where id = v_costo_esist_id), 'FM999999990.00'), '.', ',');
    end if;$n$);
select pg_temp.sostituisci('public.contabilizza_fattura_ricevuta(uuid)',
  $v$    update public.company_costs
       set amount      = v_imponibile,
           vat_rate    = coalesce(v_vat, vat_rate),$v$,
  $n$    -- l'importo della fattura, meno le note di credito già applicate a questo costo
    update public.company_costs
       set amount      = greatest(0, v_imponibile - coalesce((
                           select sum(abs(coalesce(fr.imponibile_totale, fr.totale_documento - fr.iva_totale, 0)))
                             from public.fatture_ricevute fr
                            where fr.company_cost_id = v_costo_esist_id and fr.id <> f.id
                              and coalesce(fr.tipo_documento, '') in ('TD04', 'passive_credit_note')), 0)),
           vat_rate    = coalesce(v_vat, vat_rate),$n$);
