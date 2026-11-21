alter table public.expense_reports
  add column reviewed_by uuid,
  add column reviewed_at timestamptz,
  add column review_reason text,
  add column reimbursed_by uuid,
  add column reimbursed_at timestamptz,
  add column reimbursement_transaction_id uuid references public.bank_transactions(id);

create unique index expense_reports_rimborso_univoco
  on public.expense_reports(reimbursement_transaction_id) where reimbursement_transaction_id is not null;

create function private.controlla_revisione_nota_spese()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_utente uuid := auth.uid();
  v_admin boolean;
  v_motivo text;
  v_movimento uuid;
begin
  if tg_op = 'DELETE' then
    -- Il CASCADE dell’azienda deve poter completare la cancellazione autorizzata.
    if pg_trigger_depth() = 1 and old.status <> 'draft' then
      raise exception 'Si possono eliminare soltanto le bozze' using errcode = '22023';
    end if;
    return old;
  end if;

  if tg_op = 'INSERT' then
    if new.status <> 'draft' or new.reviewed_by is not null or new.reviewed_at is not null
      or new.review_reason is not null or new.approved_by is not null or new.approved_at is not null
      or new.reimbursed_by is not null or new.reimbursed_at is not null or new.reimbursement_transaction_id is not null then
      raise exception 'Una nuova nota spese deve partire da una bozza' using errcode = '22023';
    end if;
    return new;
  end if;

  new.updated_at := clock_timestamp();
  if (new.id, new.company_id) is distinct from (old.id, old.company_id)
    or (new.employee_id is distinct from old.employee_id and not (pg_trigger_depth() > 1 and new.employee_id is null)) then
    raise exception 'L’identità della nota spese è fissa' using errcode = '22023';
  end if;
  v_admin := v_utente is not null and old.company_id = public.get_my_company_id()
    and public.e_amministratore_di(old.company_id);
  v_motivo := nullif(btrim(new.review_reason), '');
  v_movimento := new.reimbursement_transaction_id;

  -- I dati del revisore e dell’avvenuto rimborso vengono scritti dal database.
  new.reviewed_by := old.reviewed_by;
  new.reviewed_at := old.reviewed_at;
  new.review_reason := old.review_reason;
  if not (pg_trigger_depth() > 1 and new.approved_by is null) then
    new.approved_by := old.approved_by;
  end if;
  new.approved_at := old.approved_at;
  new.reimbursed_by := old.reimbursed_by;
  new.reimbursed_at := old.reimbursed_at;
  new.reimbursement_transaction_id := old.reimbursement_transaction_id;

  if old.status <> 'draft' and
    (new.title, new.description, new.total_amount, new.period_from, new.period_to, new.currency, new.notes)
      is distinct from (old.title, old.description, old.total_amount, old.period_from, old.period_to, old.currency, old.notes) then
    raise exception 'Riapri la nota spese prima di modificarla' using errcode = '22023';
  end if;

  if new.status = old.status then
    return new;
  end if;

  if old.status = 'draft' and new.status = 'submitted' then
    if coalesce(old.total_amount, 0) <= 0 or new.total_amount is distinct from old.total_amount
       or old.total_amount is distinct from (select coalesce(sum(i.amount), 0)
         from public.expense_report_items i where i.report_id = old.id and i.company_id = old.company_id) then
      raise exception 'Aggiungi almeno una voce positiva prima di inviare' using errcode = '22023';
    end if;
    return new;
  end if;

  if old.status = 'rejected' and new.status = 'draft' then
    return new;
  end if;

  if not coalesce(v_admin, false) then
    raise exception 'Serve un amministratore dell’azienda per questa operazione' using errcode = '42501';
  end if;

  if old.status = 'submitted' and new.status in ('approved', 'rejected') then
    if new.status = 'rejected' and v_motivo is null then
      raise exception 'Indica il motivo del rifiuto' using errcode = '22023';
    end if;
    if length(v_motivo) > 2000 then
      raise exception 'La motivazione deve contenere al massimo 2.000 caratteri' using errcode = '22023';
    end if;
    new.review_reason := v_motivo;
    new.reviewed_by := v_utente;
    new.reviewed_at := new.updated_at;
    if new.status = 'approved' then
      new.approved_by := v_utente;
      new.approved_at := new.updated_at;
    else
      new.approved_by := null;
      new.approved_at := null;
    end if;
    return new;
  end if;

  if old.status = 'approved' and new.status = 'reimbursed' then
    if v_movimento is null or not exists (
      select 1 from public.bank_transactions b
      where b.id = v_movimento and b.company_id = old.company_id and b.status = 'booked'
        and coalesce(b.currency, 'EUR') = coalesce(old.currency, 'EUR') and b.amount = -old.total_amount
        and b.booking_date is not null
    ) then
      raise exception 'Scegli un movimento bancario contabilizzato con importo e valuta della nota spese' using errcode = '22023';
    end if;
    new.reimbursement_transaction_id := v_movimento;
    new.reimbursed_by := v_utente;
    new.reimbursed_at := new.updated_at;
    return new;
  end if;
  raise exception 'La nota spese è cambiata. Riaprila per vedere lo stato aggiornato' using errcode = '22023';
end;
$$;

create trigger a_controlla_revisione_nota_spese
before insert or update or delete on public.expense_reports
for each row execute function private.controlla_revisione_nota_spese();

create function private.controlla_voci_nota_spese()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_id uuid := case when tg_op = 'DELETE' then old.report_id else new.report_id end;
  v_azienda uuid := case when tg_op = 'DELETE' then old.company_id else new.company_id end;
  v_stato text;
begin
  if tg_op = 'UPDATE' and (new.report_id, new.company_id) is distinct from (old.report_id, old.company_id) then
    raise exception 'La voce appartiene alla sua nota spese' using errcode = '22023';
  end if;
  select r.status into v_stato from public.expense_reports r
    where r.id = v_id and r.company_id = v_azienda for update;
  if tg_op = 'DELETE' and not found then return old; end if;
  if v_stato is distinct from 'draft' then
    raise exception 'Si possono modificare le voci soltanto in bozza' using errcode = '22023';
  end if;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;

create trigger a_controlla_voci_nota_spese
before insert or update or delete on public.expense_report_items
for each row execute function private.controlla_voci_nota_spese();
