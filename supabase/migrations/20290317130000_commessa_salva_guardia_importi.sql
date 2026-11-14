-- commessa_salva: chi non ha «Venduto e importi» non può più azzerare importi e rate.
--
-- Prima: commessa_salva è SECURITY DEFINER e gira come postgres, quindi il
-- guardiano private.office_direct_write_guard (che scatta solo per
-- current_user = 'authenticated') non la vede. Un utente con «Ordini e
-- Commesse» ma senza «Importi di vendita» apre EditOrder: la pagina legge da
-- orders_visibili, dove total_amount, vat_rate, payment_type sono NULL e le
-- rate non si vedono (order_installments_visibili richiede il diritto
-- «payments»). Al salvataggio EditOrder manda total_amount 0, vat_rate 22 e
-- un piano rate ricostruito «Saldo 0» senza id: la funzione scrive tutto,
-- order_rate_sostituisci cancella le rate vere e ne mette una a zero.
-- Provato il 14/11/2026 in un DO annullato con un utente staff vero:
-- total 350.000 -> 0, saldo 427.000 -> 0, rata «Saldo» 427.000 -> 0.
--
-- Dopo: se l'utente non ha il diritto che protegge la colonna
-- (private.office_projection_fields, tabella orders) e il valore mandato è
-- diverso da quello salvato, la funzione si ferma con un messaggio chiaro
-- (42501). Senza «Importi di vendita» non si manda un piano rate.
--
-- Devono continuare a funzionare (provato prima/dopo): il salvataggio dei
-- soli campi operativi dello stesso utente, l'amministratore dell'azienda,
-- il super admin, il service role.
--
-- Va pubblicata DOPO la correzione di EditOrder (non mandare le chiavi
-- economiche né p_rate quando !canViewOrderAmounts): prima di quella, per i 3
-- utenti in questa situazione il salvataggio di EditOrder si ferma con il
-- messaggio, invece di azzerare la commessa.

set local lock_timeout = '3s';

create or replace function private.commessa_guardia_importi(
  p_company uuid, p_commessa uuid, p_campi jsonb, p_rate jsonb)
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_diritti jsonb;
  v_prima jsonb;
  v_campo record;
  v_ha boolean;
begin
  if coalesce(auth.role(), '') = 'service_role' or auth.uid() is null then
    return;
  end if;
  v_diritti := coalesce(private.office_company_rights(p_company), '{}'::jsonb);

  if p_rate is not null and not coalesce((v_diritti->>'amounts')::boolean, false) then
    raise exception 'Il piano dei pagamenti lo cambia solo chi ha il permesso «Venduto e importi». Chiedi al titolare dell''azienda di darti l''accesso.'
      using errcode = '42501';
  end if;

  if p_campi is null or p_campi = '{}'::jsonb then
    return;
  end if;
  select to_jsonb(o) into v_prima from public.orders o where o.id = p_commessa;

  for v_campo in
    select f.column_name, f.right_name
      from private.office_projection_fields f
     where f.table_name = 'orders'
  loop
    continue when not (p_campi ? v_campo.column_name);
    v_ha := coalesce((v_diritti->>v_campo.right_name)::boolean, false)
            and (v_campo.right_name <> 'payments' or coalesce((v_diritti->>'amounts')::boolean, false));
    continue when v_ha;
    continue when (p_campi->v_campo.column_name) is not distinct from (v_prima->v_campo.column_name);
    raise exception 'Il dato «%» lo cambia solo chi ha il permesso «%». Chiedi al titolare dell''azienda di darti l''accesso.',
      case v_campo.column_name when 'total_amount' then 'importo totale' when 'vat_rate' then 'IVA'
        when 'payment_type' then 'tipo di pagamento' when 'tetto_importo' then 'tetto'
        when 'financing_cost' then 'costo della finanziaria' when 'financing_cost_mode' then 'pagamento della finanziaria'
        else replace(v_campo.column_name, '_', ' ') end,
      case v_campo.right_name when 'amounts' then 'Venduto e importi'
                              when 'payments' then 'Venduto e importi'
                              when 'costs' then 'Costi'
                              else v_campo.right_name end
      using errcode = '42501';
  end loop;
end
$$;

revoke all on function private.commessa_guardia_importi(uuid, uuid, jsonb, jsonb) from public, anon, authenticated;

-- La guardia entra in commessa_salva subito dopo il controllo del permesso.
-- Patch sul testo vivo della funzione (22 kB), idempotente: se la riga c'è
-- già non si tocca niente; se l'ancora manca, si ferma.
do $patch$
declare
  v_def text := pg_get_functiondef('public.commessa_salva(uuid,jsonb,jsonb,jsonb,jsonb,jsonb,integer)'::regprocedure);
  v_ancora constant text := 'perform public.assert_permesso(''can_edit_orders'', ''salvare una commessa'');';
  v_riga constant text := 'perform private.commessa_guardia_importi(v_company, p_commessa, p_campi, p_rate);';
begin
  if position(v_riga in v_def) > 0 then
    return;
  end if;
  if position(v_ancora in v_def) = 0 then
    raise exception 'commessa_salva: ancora non trovata, guardia non inserita';
  end if;
  execute replace(v_def, v_ancora, v_ancora || E'\n  ' || v_riga);
end
$patch$;
