set local lock_timeout = '3s';

-- Una scrittura manuale dalla rata rappresenta un incasso intero, separato
-- dai flussi bancari, dai SAL e dalle fatture.
create or replace function private.prima_nota_e_incasso_rata(p public.prima_nota_entries)
returns boolean language sql immutable set search_path = '' as $$
  select p.installment_id is not null and not coalesce(p.is_auto, false)
    and p.bank_transaction_id is null and p.documento_fiscale_id is null and p.movimento_id is null
    and p.sal_sub_id is null and p.cost_id is null and p.unita_movimento_id is null
    and p.invoice_id is null and p.reversal_of is null
$$;
revoke all on function private.prima_nota_e_incasso_rata(public.prima_nota_entries) from public, anon, authenticated;

create or replace function private.prima_nota_verifica_incasso_rata()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_nota public.prima_nota_entries;
  v_rata public.order_installments;
  v_importo_fisso boolean;
begin
  if tg_op = 'INSERT' then
    v_nota := new;
  else
    v_nota := old;
  end if;
  if not private.prima_nota_e_incasso_rata(v_nota) then
    if tg_op = 'DELETE' then return old; end if;
    if tg_op = 'UPDATE' and old.installment_id is distinct from new.installment_id
       and private.prima_nota_e_incasso_rata(new) then
      raise exception 'Registra l’incasso dalla rata della commessa.' using errcode = '23514';
    end if;
    return new;
  end if;

  select r.* into v_rata from public.order_installments r
    join public.orders o on o.id = r.order_id and o.company_id = v_nota.company_id
   where r.id = v_nota.installment_id and r.order_id = v_nota.order_id
   for no key update of r;

  if tg_op = 'DELETE' then
    if v_rata.documento_fiscale_id is not null or v_rata.invoice_id is not null then
      raise exception 'La rata è collegata a una fattura. Verifica l’incasso dalla fattura.' using errcode = '23514';
    end if;
    return old;
  end if;

  if v_rata.id is null or new.direction <> 'entrata' or new.entry_date is null
     or (new.installment_id, new.order_id, new.company_id)
          is distinct from (v_nota.installment_id, v_nota.order_id, v_nota.company_id)
     or not private.prima_nota_e_incasso_rata(new) then
    raise exception 'L’incasso deve rimanere collegato alla sua rata e commessa.' using errcode = '23514';
  end if;

  if v_rata.documento_fiscale_id is not null or v_rata.invoice_id is not null then
    raise exception 'La rata è collegata a una fattura. Gestisci l’incasso dalla fattura.' using errcode = '23514';
  end if;
  if v_rata.is_paid is not true then
    raise exception 'La rata non risulta incassata. Riapri la commessa e verifica il pagamento.' using errcode = 'PT409';
  end if;
  if tg_op = 'INSERT' and v_rata.paid_date is not null and new.entry_date is distinct from v_rata.paid_date then
    raise exception 'La data della rata è cambiata. Ricarica la commessa prima di registrare.' using errcode = 'PT409';
  end if;

  v_importo_fisso := v_rata.type = 'deposit' or (v_rata.type = 'balance' and exists (
    select 1 from public.order_installments altra where altra.order_id = v_rata.order_id
      and altra.type = 'balance' and (altra.position, altra.id) > (v_rata.position, v_rata.id)
  ));
  if tg_op = 'INSERT' and v_importo_fisso and round(new.amount, 2) is distinct from round(v_rata.amount, 2) then
    raise exception 'L’importo è cambiato. Ricarica la rata prima di registrare l’incasso.' using errcode = 'PT409';
  end if;
  if tg_op = 'UPDATE' and new.amount is distinct from old.amount and (
    not v_importo_fisso or round(new.amount, 2) is distinct from round(v_rata.amount, 2)
  ) then
    raise exception 'L’incasso deve corrispondere alla rata intera. Per cambiare l’importo, elimina l’incasso, correggi il piano e registralo di nuovo.'
      using errcode = '23514';
  end if;
  if tg_op = 'UPDATE' and not v_importo_fisso and v_rata.paid_date is distinct from new.entry_date and exists (
    select 1 from public.ordini_variazione v
    cross join lateral (select coalesce(v.offline_signed_on, v.firmato_il::date, v.approval_recorded_at::date,
      v.richiesto_il::date, v.created_at::date) as giorno) d
    where v.order_id = v_rata.order_id and v.company_id = v_nota.company_id and v.status = 'approvato'
      and v.impatto_economico <> 0 and d.giorno is not null
      and coalesce(d.giorno <= v_rata.paid_date, true) is distinct from (d.giorno <= new.entry_date)
  ) then
    raise exception 'La nuova data cambia il saldo dovuto per via delle varianti. Elimina e registra di nuovo l’incasso.'
      using errcode = '23514';
  end if;
  return new;
end;
$$;
revoke all on function private.prima_nota_verifica_incasso_rata() from public, anon, authenticated;

create or replace function private.prima_nota_allinea_incasso_rata()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'DELETE' then
    if private.prima_nota_e_incasso_rata(old) then
      update public.order_installments r set is_paid = false, paid_date = null
        where r.id = old.installment_id and r.order_id = old.order_id and r.is_paid
          and r.documento_fiscale_id is null and r.invoice_id is null
          and exists (select 1 from public.orders o where o.id = r.order_id and o.company_id = old.company_id);
    end if;
  elsif private.prima_nota_e_incasso_rata(new) then
    update public.order_installments r set paid_date = new.entry_date
      where r.id = new.installment_id and r.order_id = new.order_id
        and r.paid_date is distinct from new.entry_date;
  end if;
  return null;
end;
$$;
revoke all on function private.prima_nota_allinea_incasso_rata() from public, anon, authenticated;

create or replace function private.rata_con_incasso_prima_nota()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_data date;
begin
  if tg_op = 'UPDATE' and (old.is_paid, old.paid_date, old.amount, old.order_id, old.type, old.invoice_id, old.documento_fiscale_id)
      is not distinct from (new.is_paid, new.paid_date, new.amount, new.order_id, new.type, new.invoice_id, new.documento_fiscale_id) then
    return new;
  end if;
  select p.entry_date into v_data from public.prima_nota_entries p
   where p.installment_id = old.id and private.prima_nota_e_incasso_rata(p);
  if tg_op = 'DELETE' then
    if found and exists (select 1 from public.orders where id = old.order_id) then
      raise exception 'La rata ha un incasso in Prima Nota. Elimina prima quell’incasso.' using errcode = '23514';
    end if;
    return old;
  end if;
  if found and (new.is_paid is not true or new.paid_date is distinct from v_data
     or (old.amount, old.order_id, old.type, old.invoice_id, old.documento_fiscale_id)
        is distinct from (new.amount, new.order_id, new.type, new.invoice_id, new.documento_fiscale_id)) then
    raise exception 'La rata ha un incasso in Prima Nota. Correggi o elimina l’incasso da lì.' using errcode = '23514';
  end if;
  return new;
end;
$$;
revoke all on function private.rata_con_incasso_prima_nota() from public, anon, authenticated;

create or replace trigger prima_nota_verifica_incasso_rata
  before insert or update of installment_id, entry_date, amount, direction, order_id, company_id, invoice_id,
    is_auto, bank_transaction_id, documento_fiscale_id, movimento_id, sal_sub_id, cost_id, unita_movimento_id, reversal_of
  or delete on public.prima_nota_entries
  for each row execute function private.prima_nota_verifica_incasso_rata();
create or replace trigger prima_nota_allinea_incasso_rata
  after insert or update of entry_date or delete on public.prima_nota_entries
  for each row execute function private.prima_nota_allinea_incasso_rata();
create or replace trigger rata_con_incasso_prima_nota
  before update or delete on public.order_installments
  for each row execute function private.rata_con_incasso_prima_nota();

-- Rispetta le regole della funzione corrente per gli incassi di fatture.
do $$
declare
  v_def text := pg_get_functiondef('public.prima_nota_modifica(uuid,jsonb)'::regprocedure);
  v_punto text := '  v_motivo := public.prima_nota_modificabile(p);';
begin
  if position('p_dati ? ''versione''' in v_def) > 0 then return; end if;
  if position(v_punto in v_def) = 0 then raise exception 'Definizione prima_nota_modifica inattesa.'; end if;
  execute replace(v_def, v_punto, $parte$
  IF p_dati ? 'versione' AND p.updated_at IS DISTINCT FROM (p_dati->>'versione')::timestamptz THEN
    RAISE EXCEPTION 'La registrazione è cambiata. Ricarica la Prima Nota e riprova.' USING ERRCODE = 'PT409';
  END IF;
$parte$ || v_punto);
end $$;
