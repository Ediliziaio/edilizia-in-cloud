-- Identità del comando rapido e delle sole rate che ha modificato.
create table if not exists private.saldi_rapidi_fatture_ricevute (
  id uuid primary key,
  company_id uuid not null references public.companies(id) on delete cascade,
  fattura_id uuid not null references public.fatture_ricevute(id) on delete cascade,
  costo_id uuid,
  movimento_id uuid,
  importo_movimento numeric,
  data_saldo date not null,
  segnato_at timestamptz not null,
  segnato_da uuid,
  rate jsonb not null default '[]'::jsonb,
  scadenze_precedenti jsonb not null default '[]'::jsonb,
  annullato_at timestamptz,
  annullato_da uuid
);
alter table private.saldi_rapidi_fatture_ricevute
  add column if not exists importo_movimento numeric,
  add column if not exists scadenze_precedenti jsonb not null default '[]'::jsonb;
create unique index if not exists saldi_rapidi_fatture_ricevute_attivo
  on private.saldi_rapidi_fatture_ricevute(fattura_id) where annullato_at is null;
alter table private.saldi_rapidi_fatture_ricevute enable row level security;
revoke all on private.saldi_rapidi_fatture_ricevute from public, anon, authenticated;

create or replace function private.blocca_saldo_rapido_ricevuta(p_id uuid)
returns public.fatture_ricevute
language plpgsql security definer set search_path = '' as $$
declare
  f public.fatture_ricevute;
  azienda uuid;
  costo uuid;
  servizio boolean := auth.uid() is null and coalesce(auth.jwt()->>'role', '') = 'service_role';
begin
  select company_id, company_cost_id into azienda, costo from public.fatture_ricevute where id = p_id;
  if azienda is null or (not servizio and (
    auth.uid() is null or public.utente_bloccato() or public.utente_e_cliente_esterno()
    or public.utente_sola_lettura(azienda)
    or not coalesce((azienda = public.get_my_company_id() and public.puo_vedere_documenti_fornitore())
      or public.e_super_admin_dentro(azienda) or public.user_can_write_accountant_company(azienda), false)
  )) then
    raise exception 'Fattura non disponibile per il pagamento.' using errcode = '42501';
  end if;

  -- Stesso ordine dei lock della prima nota e delle riconciliazioni.
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(azienda::text, 2810));
  if costo is not null then
    perform 1 from public.company_costs where id = costo and company_id = azienda for update;
    if not found then raise exception 'Costo collegato non disponibile.' using errcode = '42501'; end if;
  end if;
  select * into f from public.fatture_ricevute where id = p_id and company_id = azienda for update;
  if not found or f.company_cost_id is distinct from costo then
    raise exception 'Il collegamento della fattura è cambiato. Ricarica la scheda.' using errcode = 'PT409';
  end if;
  return f;
end $$;
revoke all on function private.blocca_saldo_rapido_ricevuta(uuid) from public, anon, authenticated;

-- Il ricalcolo del costo usa la data dell’ultimo movimento anche per le quote precedenti.
create or replace function private.conserva_date_scadenze_saldo_rapido(p_azienda uuid, p_costo uuid, p_precedenti jsonb)
returns void language sql set search_path = '' as $$
  update public.scadenze s set paid_date = p.paid_date
  from jsonb_to_recordset(p_precedenti) as p(id uuid, paid_amount numeric, paid_date date)
  where s.id = p.id and s.company_id = p_azienda and s.cost_id = p_costo and s.direction = 'uscita'
    and s.status <> 'annullata' and s.paid_amount = p.paid_amount
    and s.paid_date is distinct from p.paid_date;
$$;
revoke all on function private.conserva_date_scadenze_saldo_rapido(uuid, uuid, jsonb) from public, anon, authenticated;

create or replace function public.registra_saldo_fattura_ricevuta(p_id uuid, p_richiesta uuid, p_data date default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  f public.fatture_ricevute := private.blocca_saldo_rapido_ricevuta(p_id);
  prova private.saldi_rapidi_fatture_ricevute;
  giorno date := coalesce(p_data, (now() at time zone 'Europe/Rome')::date);
  esito jsonb;
  movimento uuid;
  importo_movimento numeric;
  rate_toccate jsonb := '[]'::jsonb;
  scadenze_precedenti jsonb := '[]'::jsonb;
  istante timestamptz := clock_timestamp();
  segnale text := current_setting('rate_fornitori.da_rata', true);
begin
  if p_richiesta is null or giorno > (now() at time zone 'Europe/Rome')::date or giorno < date '2000-01-01' then
    raise exception 'Data o identificativo del pagamento non validi.' using errcode = '22023';
  end if;
  if public.e_nota_credito_ricevuta(f.tipo_documento) or public.e_autofattura_ricevuta(f.tipo_documento)
     or f.stato in ('annullata', 'scartata', 'rifiutata') then
    raise exception 'Questo documento non si può segnare pagato.' using errcode = '22023';
  end if;
  select * into prova from private.saldi_rapidi_fatture_ricevute where id = p_richiesta;
  if found then
    if (prova.company_id, prova.fattura_id) is distinct from (f.company_id, f.id)
       or (p_data is not null and prova.data_saldo is distinct from p_data) then
      raise exception 'Richiesta di pagamento non valida.' using errcode = '22023';
    end if;
    return jsonb_build_object('annullamento', case when prova.annullato_at is null and f.pagamento_segnato_at = prova.segnato_at then prova.id end,
      'data', f.pagata_il, 'gia_registrato', true);
  end if;
  if f.pagata_il is not null then
    return jsonb_build_object('annullamento', null, 'data', f.pagata_il, 'gia_registrato', true);
  end if;
  if exists (select 1 from private.saldi_rapidi_fatture_ricevute s where s.fattura_id = f.id and s.annullato_at is null) then
    raise exception 'La fattura ha un saldo da verificare. Apri il pagamento di origine.' using errcode = 'PT409';
  end if;

  if f.company_cost_id is not null then
    perform public.spesa_pagamento_autorizza(f.company_id);
    if exists (select 1 from public.fatture_ricevute altra where altra.company_id = f.company_id
      and altra.company_cost_id = f.company_cost_id and altra.id <> f.id
      and altra.stato not in ('annullata', 'scartata', 'rifiutata')
      and not public.e_nota_credito_ricevuta(altra.tipo_documento)
      and not public.e_autofattura_ricevuta(altra.tipo_documento)) then
      raise exception 'Questa fattura condivide il costo con altri documenti. Usa il pagamento del costo o della rata.' using errcode = 'PT409';
    end if;

    select coalesce(jsonb_agg(to_jsonb(s)), '[]'::jsonb) into scadenze_precedenti from (
      select id, paid_amount, paid_date from public.scadenze
      where company_id = f.company_id and cost_id = f.company_cost_id and direction = 'uscita'
        and status <> 'annullata' and paid_amount > 0
      order by due_date, id for update
    ) s;

    -- Le scadenze seguono la prima nota. Le rate della fattura vengono aggiornate
    -- qui sotto, per conservarne la versione precisa e lasciare intatti gli acconti.
    perform set_config('rate_fornitori.da_rata', 'on', true);
    esito := public.registra_pagamento_costo(f.company_cost_id, p_richiesta, null, least(giorno, current_date),
      'bonifico', 'Segnata pagata dalla fattura ricevuta');
    perform set_config('rate_fornitori.da_rata', coalesce(segnale, ''), true);
    movimento := (esito->>'prima_nota_id')::uuid;
    if coalesce((esito->>'gia_registrato')::boolean, false) then
      return jsonb_build_object('annullamento', null, 'data', f.pagata_il, 'gia_registrato', true);
    end if;
    if movimento is null or (esito->>'residuo')::numeric is distinct from 0::numeric then
      raise exception 'Il saldo non è stato confermato.' using errcode = 'PT409';
    end if;

    select amount into importo_movimento from public.prima_nota_entries
     where id = movimento and company_id = f.company_id and payment_request_id = p_richiesta;
    if not found then
      raise exception 'Il movimento del saldo non è stato confermato.' using errcode = 'PT409';
    end if;
    perform private.conserva_date_scadenze_saldo_rapido(f.company_id, f.company_cost_id, scadenze_precedenti);

    with prima as materialized (
      select r.id, r.stato, r.pagata_il from public.rate_fornitori r
      where r.company_id = f.company_id and r.company_cost_id = f.company_cost_id
        and (r.fattura_ricevuta_id = f.id or r.fattura_ricevuta_id is null)
        and r.stato not in ('pagata', 'stornata')
      order by r.id for update
    ), dopo as (
      update public.rate_fornitori r set stato = 'pagata', pagata_il = giorno from prima p
      where r.id = p.id returning r.id, r.updated_at, p.stato, p.pagata_il
    )
    select coalesce(jsonb_agg(to_jsonb(d)), '[]'::jsonb) into rate_toccate from dopo d;
  end if;

  update public.fatture_ricevute set pagata_il = giorno, pagamento_segnato_da = auth.uid(), pagamento_segnato_at = istante
  where id = f.id and company_id = f.company_id;
  insert into private.saldi_rapidi_fatture_ricevute(id, company_id, fattura_id, costo_id, movimento_id, importo_movimento,
    data_saldo, segnato_at, segnato_da, rate, scadenze_precedenti)
  values (p_richiesta, f.company_id, f.id, f.company_cost_id, movimento, importo_movimento, giorno, istante,
    auth.uid(), rate_toccate, scadenze_precedenti);
  return jsonb_build_object('annullamento', p_richiesta, 'data', giorno, 'gia_registrato', false);
end $$;

create or replace function public.annulla_saldo_fattura_ricevuta(p_id uuid, p_richiesta uuid default null)
returns boolean language plpgsql security definer set search_path = '' as $$
declare
  f public.fatture_ricevute := private.blocca_saldo_rapido_ricevuta(p_id);
  prova private.saldi_rapidi_fatture_ricevute;
  movimento public.prima_nota_entries;
  confermate integer;
  segnale text := current_setting('rate_fornitori.da_rata', true);
begin
  select * into prova from private.saldi_rapidi_fatture_ricevute s
  where s.company_id = f.company_id and s.fattura_id = f.id
    and ((p_richiesta is not null and s.id = p_richiesta) or (p_richiesta is null and s.annullato_at is null));
  if not found then
    -- Una fattura storica priva di costo può avere soltanto la spunta manuale.
    if p_richiesta is null and f.company_cost_id is null and f.pagata_il is not null then
      update public.fatture_ricevute set pagata_il = null, pagamento_segnato_at = null, pagamento_segnato_da = null
      where id = f.id and company_id = f.company_id;
      return true;
    end if;
    raise exception 'Saldo rapido non identificabile. Correggi il pagamento dai movimenti di origine.' using errcode = 'PT409';
  end if;
  if prova.annullato_at is not null then return false; end if;
  if f.pagamento_segnato_at is distinct from prova.segnato_at or f.pagata_il is distinct from prova.data_saldo
    or f.company_cost_id is distinct from prova.costo_id then
    raise exception 'Il saldo della fattura è già cambiato. Ricarica prima di annullare.' using errcode = 'PT409';
  end if;

  if prova.movimento_id is not null then
    perform public.spesa_pagamento_autorizza(f.company_id);
    select * into movimento from public.prima_nota_entries p
    where p.id = prova.movimento_id and p.company_id = f.company_id and p.cost_id = prova.costo_id
      and p.payment_request_id = prova.id and p.direction = 'uscita' and p.auto_source = 'company_cost_payment'
    for update;
    if not found or movimento.amount is distinct from prova.importo_movimento or movimento.bank_transaction_id is not null or movimento.sal_sub_id is not null
      or movimento.scadenza_id is not null
      or exists (select 1 from public.prima_nota_entries where reversal_of = movimento.id)
      or exists (select 1 from public.bank_reconciliations where prima_nota_id = movimento.id and unmatched_at is null)
      or exists (select 1 from public.sal_sub_pagamenti where prima_nota_id = movimento.id)
      or exists (select 1 from public.unita_movimenti where prima_nota_id = movimento.id or storno_prima_nota_id = movimento.id) then
      raise exception 'Il saldo è già stato corretto o collegato. Gestisci il movimento di origine.' using errcode = 'PT409';
    end if;

    update public.rate_fornitori r set stato = p.stato, pagata_il = p.pagata_il
    from jsonb_to_recordset(prova.rate) as p(id uuid, stato text, pagata_il date, updated_at timestamptz)
    where r.id = p.id and r.company_id = f.company_id and r.company_cost_id = prova.costo_id
      and r.stato = 'pagata' and r.pagata_il = prova.data_saldo and r.updated_at = p.updated_at;
    get diagnostics confermate = row_count;
    if confermate <> jsonb_array_length(prova.rate) then
      raise exception 'Una rata del saldo è stata modificata. Ricarica la fattura e verifica le rate.' using errcode = 'PT409';
    end if;

    insert into public.prima_nota_entries(company_id, direction, category, description, amount, entry_date,
      cost_id, order_id, supplier_id, bank_account_id, account_label, payment_method, is_auto, auto_source, created_by, reversal_of)
    values (f.company_id, 'entrata', 'storno', 'Storno saldo fattura ricevuta', movimento.amount, current_date,
      movimento.cost_id, movimento.order_id, movimento.supplier_id, movimento.bank_account_id, movimento.account_label,
      movimento.payment_method, true, 'storno_pagamento', auth.uid(), movimento.id);
    perform set_config('rate_fornitori.da_rata', 'on', true);
    perform public.spesa_pagamento_sincronizza(prova.costo_id);
    perform set_config('rate_fornitori.da_rata', coalesce(segnale, ''), true);
    perform private.conserva_date_scadenze_saldo_rapido(f.company_id, prova.costo_id, prova.scadenze_precedenti);
  end if;
  update public.fatture_ricevute set pagata_il = null, pagamento_segnato_at = null, pagamento_segnato_da = null
  where id = f.id and company_id = f.company_id;
  update private.saldi_rapidi_fatture_ricevute set annullato_at = clock_timestamp(), annullato_da = auth.uid()
  where id = prova.id;
  return true;
end $$;

-- Le versioni precedenti del client passano dalla stessa protezione.
create or replace function public.segna_fattura_ricevuta_pagata(p_id uuid, p_pagata boolean, p_data date default null)
returns date language plpgsql security invoker set search_path = '' as $$
begin
  if p_pagata then
    return (public.registra_saldo_fattura_ricevuta(p_id, gen_random_uuid(), p_data)->>'data')::date;
  end if;
  perform public.annulla_saldo_fattura_ricevuta(p_id);
  return null;
end $$;

revoke all on function public.registra_saldo_fattura_ricevuta(uuid, uuid, date),
  public.annulla_saldo_fattura_ricevuta(uuid, uuid),
  public.segna_fattura_ricevuta_pagata(uuid, boolean, date) from public, anon;
grant execute on function public.registra_saldo_fattura_ricevuta(uuid, uuid, date),
  public.annulla_saldo_fattura_ricevuta(uuid, uuid),
  public.segna_fattura_ricevuta_pagata(uuid, boolean, date) to authenticated, service_role;
notify pgrst, 'reload schema';
