-- «Assegna questa fattura alla commessa di Rossi» da WhatsApp (19/10/2026).
--
-- Fattura emessa (invoices): la commessa va su invoices.order_id, come fa
-- «Abbina alle commesse» nell'app (origine «manuale»). I trigger esistenti
-- ricalcolano le date delle rate.
-- Fattura ricevuta (fatture_ricevute): diventa costo della commessa. Se non è
-- ancora contabilizzata la contabilizza come il tasto dell'app
-- (contabilizza_fattura_ricevuta), poi mette la commessa sul costo
-- (company_costs.order_id, e la ripartizione al 100% se c'è): il margine della
-- commessa si ricalcola da solo. Un costo ripartito su più commesse si cambia
-- solo dall'app.
--
-- La chiama solo il bot (service role), dopo il Sì di un amministratore
-- dell'azienda: si controllano azienda, persona, fattura e commessa.

set local lock_timeout = '3s';

create or replace function public.fattura_assegna_commessa(
  p_company_id uuid,
  p_user_id uuid,
  p_tipo text,
  p_fattura_id uuid,
  p_order_id uuid
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ordine   record;
  v_fattura  record;
  v_costo    record;
  v_cost_id  uuid;
  v_prima    uuid;
begin
  if not exists (select 1 from public.profiles where id = p_user_id and company_id = p_company_id) then
    raise exception using errcode = 'P0001', message = 'Non risulti di questa azienda.';
  end if;
  if not exists (select 1 from public.user_roles where user_id = p_user_id and role in ('company_admin', 'super_admin')) then
    raise exception using errcode = 'P0001', message = 'Le fatture le assegna l''amministratore dell''azienda.';
  end if;

  select id, order_code, coalesce(nullif(client_name, ''), description, order_code) as nome
    into v_ordine
    from public.orders
   where id = p_order_id and company_id = p_company_id and deleted_at is null;
  if not found then
    raise exception using errcode = 'P0001', message = 'Questa commessa non risulta nella tua azienda.';
  end if;

  if p_tipo = 'emessa' then
    select id, invoice_number, order_id into v_fattura
      from public.invoices
     where id = p_fattura_id and company_id = p_company_id and deleted_at is null and status <> 'cancelled'
     for update;
    if not found then
      raise exception using errcode = 'P0001', message = 'Questa fattura non risulta nella tua azienda.';
    end if;
    v_prima := v_fattura.order_id;
    update public.invoices
       set order_id = p_order_id, order_match_origine = 'manuale', updated_at = now()
     where id = p_fattura_id and company_id = p_company_id;

  elsif p_tipo = 'ricevuta' then
    select id, numero_fattura, company_cost_id into v_fattura
      from public.fatture_ricevute
     where id = p_fattura_id and company_id = p_company_id
     for update;
    if not found then
      raise exception using errcode = 'P0001', message = 'Questa fattura non risulta nella tua azienda.';
    end if;
    v_cost_id := v_fattura.company_cost_id;
    if v_cost_id is null then
      begin
        v_cost_id := (public.contabilizza_fattura_ricevuta(p_fattura_id) ->> 'company_cost_id')::uuid;
      exception when others then
        -- Il motivo vero (es. «non ha importi») arriva a chi ha scritto.
        raise exception using errcode = 'P0001', message = sqlerrm;
      end;
    end if;
    select id, order_id, allocations into v_costo
      from public.company_costs
     where id = v_cost_id and company_id = p_company_id
     for update;
    if not found then
      raise exception using errcode = 'P0001', message = 'Il costo di questa fattura non si trova: aprila dall''app.';
    end if;
    -- Il costo sta su una commessa con order_id oppure con una ripartizione
    -- (allocations); una ripartizione al 100% su una commessa si sposta, una su
    -- più commesse no.
    if jsonb_typeof(v_costo.allocations) = 'array' and (jsonb_array_length(v_costo.allocations) > 1
       or (jsonb_array_length(v_costo.allocations) = 1 and (v_costo.allocations -> 0 ->> 'pct')::numeric is distinct from 100)) then
      raise exception using errcode = 'P0001', message = 'Questa fattura è ripartita su più commesse: cambiala dall''app.';
    end if;
    v_prima := coalesce(v_costo.order_id,
      case when jsonb_typeof(v_costo.allocations) = 'array' then (v_costo.allocations -> 0 ->> 'order_id')::uuid end);
    update public.company_costs
       set order_id = p_order_id,
           allocations = case when jsonb_typeof(allocations) = 'array' and jsonb_array_length(allocations) = 1
                              then jsonb_build_array(jsonb_build_object('order_id', p_order_id, 'pct', 100))
                              else allocations end,
           updated_at = now()
     where id = v_cost_id and company_id = p_company_id;

  else
    raise exception using errcode = 'P0001', message = 'Dimmi se è una fattura emessa o ricevuta.';
  end if;

  return jsonb_build_object(
    'tipo', p_tipo,
    'fattura_id', p_fattura_id,
    'order_id', p_order_id,
    'commessa', coalesce(v_ordine.order_code || ' · ', '') || coalesce(v_ordine.nome, ''),
    'era_su', v_prima,
    'company_cost_id', v_cost_id
  );
end $$;

revoke all on function public.fattura_assegna_commessa(uuid, uuid, text, uuid, uuid) from public, anon, authenticated;
grant execute on function public.fattura_assegna_commessa(uuid, uuid, text, uuid, uuid) to service_role;
