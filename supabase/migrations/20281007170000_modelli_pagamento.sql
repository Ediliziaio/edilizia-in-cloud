-- Modelli di pagamento per azienda (07/10/2026).
--
-- «Come si paga» oggi si scrive a mano, commessa per commessa: per questo 63 commesse
-- su 82 con rate ne hanno solo due e 516 commesse su 598 non ne hanno nessuna.
-- Ora ogni azienda ha i SUOI modelli di piano rate (percentuale e momento in cui la
-- rata si incassa: la firma, l'inizio lavori, un SAL, la posa, la fine lavori…),
-- ne sceglie uno di partenza, e una commessa che nasce senza rate lo riceve da
-- commessa_avvia. Tutto facoltativo: senza modello di partenza non cambia niente.
--
-- Cosa c'è.
--   · payment_plan_templates → payment_plan_template_rows: il modello è un elenco di
--     rate. Le tabelle sono CHIUSE in scrittura (solo le RPC qui sotto, che salvano
--     tutto o niente) e si leggono con la RLS, come i modelli di fasi.
--   · company_pagamenti_settings: una riga per azienda (modelli di partenza già
--     consegnati? quale è il modello di partenza?).
--   · salva_modello_pagamento, elimina_modello_pagamento, inizializza_modelli_pagamento,
--     pagamenti_impostazioni_salva: permesso can_edit_settings_orders nell'azienda passata.
--   · rate_da_modello: dal modello e dal totale IVA inclusa ai valori delle rate (un solo
--     conto: ogni rata arrotondata al centesimo, l'ultima assorbe il resto). Interna.
--   · commessa_avvia: oltre alle fasi (20281007160000), dà alla commessa senza rate il
--     modello di pagamento di partenza dell'azienda, se c'è e se la commessa ha un importo.
--
-- Additiva: tabelle e funzioni nuove, nessun dato esistente cambia. Dipende da
-- 20281007160000 (commessa_avvia) e quindi da 20281007140000. Gli eventi ammessi sono
-- quelli di rateEventi.ts meno «stato commessa», che dipende da uno stato scelto sulla
-- singola rata.

set local lock_timeout = '3s';

create table if not exists public.payment_plan_templates (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  name text not null check (length(btrim(name)) between 1 and 80),
  hint text check (hint is null or length(hint) <= 200),
  position integer not null default 0,
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists payment_plan_templates_nome_uk on public.payment_plan_templates (company_id, lower(btrim(name)));
create index if not exists payment_plan_templates_azienda_idx on public.payment_plan_templates (company_id, position);

create table if not exists public.payment_plan_template_rows (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  template_id uuid not null references public.payment_plan_templates(id) on delete cascade,
  position integer not null default 0,
  label text not null check (length(btrim(label)) between 1 and 80),
  type text not null default 'deposit' check (type in ('deposit', 'balance')),
  percent numeric(5, 2) not null check (percent > 0 and percent <= 100),
  trigger_evento text not null default 'data_fissa'
    check (trigger_evento in ('data_fissa', 'firma_contratto', 'accettazione_preventivo', 'merce_magazzino',
                              'consegna_cantiere', 'inizio_lavori', 'data_posa', 'sal_numero', 'fine_lavori',
                              'fattura_acconto', 'fattura_saldo')),
  trigger_numero integer check (trigger_numero between 1 and 99),
  giorni_preavviso integer not null default 7 check (giorni_preavviso between 0 and 90),
  constraint payment_plan_template_rows_sal_numero check (trigger_evento <> 'sal_numero' or trigger_numero is not null)
);
create index if not exists payment_plan_template_rows_modello_idx on public.payment_plan_template_rows (template_id, position);
create index if not exists payment_plan_template_rows_azienda_idx on public.payment_plan_template_rows (company_id);

create table if not exists public.company_pagamenti_settings (
  company_id uuid primary key references public.companies(id) on delete cascade,
  modelli_inizializzati boolean not null default false,
  modello_predefinito uuid references public.payment_plan_templates(id) on delete set null,
  updated_at timestamptz not null default now()
);

alter table public.payment_plan_templates enable row level security;
alter table public.payment_plan_template_rows enable row level security;
alter table public.company_pagamenti_settings enable row level security;

revoke all on public.payment_plan_templates, public.payment_plan_template_rows,
              public.company_pagamenti_settings from anon, authenticated;
grant select on public.payment_plan_templates, public.payment_plan_template_rows,
                public.company_pagamenti_settings to authenticated;

drop policy if exists modelli_pagamento_lettura on public.payment_plan_templates;
create policy modelli_pagamento_lettura on public.payment_plan_templates for select to authenticated
  using (public.has_permission_for_company((select auth.uid()), 'can_view_orders', company_id)
      or public.has_permission_for_company((select auth.uid()), 'can_view_settings_orders', company_id));
drop policy if exists modelli_pagamento_righe_lettura on public.payment_plan_template_rows;
create policy modelli_pagamento_righe_lettura on public.payment_plan_template_rows for select to authenticated
  using (public.has_permission_for_company((select auth.uid()), 'can_view_orders', company_id)
      or public.has_permission_for_company((select auth.uid()), 'can_view_settings_orders', company_id));
drop policy if exists pagamenti_impostazioni_lettura on public.company_pagamenti_settings;
create policy pagamenti_impostazioni_lettura on public.company_pagamenti_settings for select to authenticated
  using (public.has_permission_for_company((select auth.uid()), 'can_view_orders', company_id)
      or public.has_permission_for_company((select auth.uid()), 'can_view_settings_orders', company_id));

-- Un utente bloccato non legge niente (stessa regola di tutte le tabelle delle aziende).
drop policy if exists blocco_utente_bloccato on public.payment_plan_templates;
create policy blocco_utente_bloccato on public.payment_plan_templates as restrictive for all to authenticated
  using (not (select public.utente_bloccato())) with check (not (select public.utente_bloccato()));
drop policy if exists blocco_utente_bloccato on public.payment_plan_template_rows;
create policy blocco_utente_bloccato on public.payment_plan_template_rows as restrictive for all to authenticated
  using (not (select public.utente_bloccato())) with check (not (select public.utente_bloccato()));
drop policy if exists blocco_utente_bloccato on public.company_pagamenti_settings;
create policy blocco_utente_bloccato on public.company_pagamenti_settings as restrictive for all to authenticated
  using (not (select public.utente_bloccato())) with check (not (select public.utente_bloccato()));

-- Salva un modello (nuovo, o con id: lo riscrive). Tutto o niente: le rate si
-- controllano TUTTE prima di scrivere. Regole: da 1 a 12 rate; ogni rata ha un nome e
-- una percentuale tra 0 (esclusa) e 100; le percentuali sommano 100; le rate prima
-- dell'ultima sono acconti, l'ultima è il saldo; una rata «al SAL» dice quale SAL
-- (numero da 1 a 99, mai due volte lo stesso).
create or replace function public.salva_modello_pagamento(p_company_id uuid, p_modello jsonb)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid := nullif(p_modello->>'id', '')::uuid;
  v_nome text := btrim(coalesce(p_modello->>'nome', ''));
  v_desc text := nullif(btrim(coalesce(p_modello->>'descrizione', '')), '');
  v_ammessi constant text[] := array['data_fissa', 'firma_contratto', 'accettazione_preventivo', 'merce_magazzino',
                                     'consegna_cantiere', 'inizio_lavori', 'data_posa', 'sal_numero', 'fine_lavori',
                                     'fattura_acconto', 'fattura_saldo'];
  v_riga jsonb;
  v_n integer;
  v_pos integer := 0;
  v_tipo text;
  v_evento text;
  v_numero integer;
  v_percent numeric;
  v_preavviso integer;
  v_somma numeric := 0;
  v_sal integer[] := '{}';
begin
  if auth.uid() is null
     or not public.has_permission_for_company(auth.uid(), 'can_edit_settings_orders', p_company_id) then
    raise exception 'Non hai il permesso di modificare i modelli di pagamento.' using errcode = '42501';
  end if;
  if v_nome = '' or length(v_nome) > 80 then
    raise exception 'Dai un nome al modello (massimo 80 caratteri).' using errcode = '22023';
  end if;
  if jsonb_typeof(p_modello->'righe') is distinct from 'array' or jsonb_array_length(p_modello->'righe') = 0 then
    raise exception 'Un modello ha almeno una rata.' using errcode = '22023';
  end if;
  v_n := jsonb_array_length(p_modello->'righe');
  if v_n > 12 then
    raise exception 'Troppe rate: al massimo 12.' using errcode = '22023';
  end if;

  for v_riga in select value from jsonb_array_elements(p_modello->'righe') loop
    v_pos := v_pos + 1;
    if btrim(coalesce(v_riga->>'nome', '')) = '' or length(btrim(v_riga->>'nome')) > 80 then
      raise exception 'Ogni rata ha un nome (massimo 80 caratteri): controlla la rata %.', v_pos using errcode = '22023';
    end if;
    begin
      v_percent := (v_riga->>'percent')::numeric;
    exception when others then
      v_percent := null;
    end;
    if v_percent is null or v_percent <= 0 or v_percent > 100 then
      raise exception 'La percentuale di ogni rata va da 0 a 100: controlla la rata %.', v_pos using errcode = '22023';
    end if;
    v_somma := v_somma + round(v_percent, 2);
    v_tipo := coalesce(nullif(v_riga->>'tipo', ''), 'deposit');
    if v_pos < v_n and v_tipo <> 'deposit' then
      raise exception 'Solo l''ultima rata è il saldo: la rata % è un acconto.', v_pos using errcode = '22023';
    end if;
    if v_pos = v_n and v_tipo <> 'balance' then
      raise exception 'L''ultima rata è il saldo.' using errcode = '22023';
    end if;
    v_evento := coalesce(nullif(v_riga->>'evento', ''), 'data_fissa');
    if v_evento <> all (v_ammessi) then
      raise exception 'Momento di incasso non valido nella rata %.', v_pos using errcode = '22023';
    end if;
    if v_evento = 'sal_numero' then
      begin
        v_numero := (v_riga->>'numero')::integer;
      exception when others then
        v_numero := null;
      end;
      if v_numero is null or v_numero < 1 or v_numero > 99 then
        raise exception 'Una rata «al SAL» dice quale SAL (da 1 a 99): controlla la rata %.', v_pos using errcode = '22023';
      end if;
      if v_numero = any (v_sal) then
        raise exception 'Il SAL numero % compare due volte.', v_numero using errcode = '22023';
      end if;
      v_sal := v_sal || v_numero;
    end if;
    begin
      v_preavviso := coalesce((v_riga->>'preavviso')::integer, 7);
    exception when others then
      v_preavviso := null;
    end;
    if v_preavviso is null or v_preavviso < 0 or v_preavviso > 90 then
      raise exception 'Il preavviso va da 0 a 90 giorni: controlla la rata %.', v_pos using errcode = '22023';
    end if;
  end loop;
  if abs(v_somma - 100) > 0.01 then
    raise exception 'Le percentuali devono sommare 100: ora fanno %.', v_somma using errcode = '22023';
  end if;

  if v_id is null then
    insert into public.payment_plan_templates (company_id, name, hint, position)
    values (p_company_id, v_nome, v_desc,
            coalesce((select max(position) + 1 from public.payment_plan_templates where company_id = p_company_id), 0))
    returning id into v_id;
  else
    update public.payment_plan_templates
       set name = v_nome, hint = v_desc, updated_at = now()
     where id = v_id and company_id = p_company_id;
    if not found then
      raise exception 'Modello non trovato.' using errcode = 'P0002';
    end if;
    delete from public.payment_plan_template_rows where template_id = v_id;
  end if;

  v_pos := 0;
  for v_riga in select value from jsonb_array_elements(p_modello->'righe') loop
    v_evento := coalesce(nullif(v_riga->>'evento', ''), 'data_fissa');
    insert into public.payment_plan_template_rows
      (company_id, template_id, position, label, type, percent, trigger_evento, trigger_numero, giorni_preavviso)
    values (p_company_id, v_id, v_pos, btrim(v_riga->>'nome'),
            coalesce(nullif(v_riga->>'tipo', ''), 'deposit'),
            round((v_riga->>'percent')::numeric, 2),
            v_evento,
            case when v_evento = 'sal_numero' then (v_riga->>'numero')::integer end,
            coalesce((v_riga->>'preavviso')::integer, 7));
    v_pos := v_pos + 1;
  end loop;
  return v_id;
end;
$$;

create or replace function public.elimina_modello_pagamento(p_company_id uuid, p_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null
     or not public.has_permission_for_company(auth.uid(), 'can_edit_settings_orders', p_company_id) then
    raise exception 'Non hai il permesso di modificare i modelli di pagamento.' using errcode = '42501';
  end if;
  delete from public.payment_plan_templates where id = p_id and company_id = p_company_id;
end;
$$;

-- Consegna all'azienda i modelli di partenza (scritti nel codice), una volta sola;
-- con p_solo_mancanti rimette quelli che mancano, per nome.
create or replace function public.inizializza_modelli_pagamento(p_company_id uuid, p_modelli jsonb, p_solo_mancanti boolean default false)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_gia boolean;
  v_modello jsonb;
  v_nome text;
  v_aggiunti integer := 0;
begin
  if auth.uid() is null
     or not public.has_permission_for_company(auth.uid(), 'can_edit_settings_orders', p_company_id) then
    raise exception 'Non hai il permesso di modificare i modelli di pagamento.' using errcode = '42501';
  end if;
  if jsonb_typeof(p_modelli) is distinct from 'array' or jsonb_array_length(p_modelli) > 40 then
    raise exception 'Elenco di modelli non valido.' using errcode = '22023';
  end if;
  insert into public.company_pagamenti_settings (company_id) values (p_company_id) on conflict (company_id) do nothing;
  select modelli_inizializzati into v_gia from public.company_pagamenti_settings where company_id = p_company_id for update;
  if v_gia and not p_solo_mancanti then
    return 0;
  end if;
  for v_modello in select value from jsonb_array_elements(p_modelli) loop
    v_nome := btrim(coalesce(v_modello->>'nome', ''));
    continue when v_nome = '';
    continue when exists (select 1 from public.payment_plan_templates t
                           where t.company_id = p_company_id and lower(btrim(t.name)) = lower(v_nome));
    begin
      perform public.salva_modello_pagamento(p_company_id, v_modello - 'id');
      v_aggiunti := v_aggiunti + 1;
    exception when unique_violation then null;
    end;
  end loop;
  update public.company_pagamenti_settings set modelli_inizializzati = true, updated_at = now() where company_id = p_company_id;
  return v_aggiunti;
end;
$$;

-- Le scelte dell'azienda sul pagamento. Per ora una: il modello di partenza (o nessuno).
create or replace function public.pagamenti_impostazioni_salva(p_company_id uuid, p_valori jsonb)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_modello uuid;
begin
  if auth.uid() is null
     or not public.has_permission_for_company(auth.uid(), 'can_edit_settings_orders', p_company_id) then
    raise exception 'Non hai il permesso di cambiare queste impostazioni.' using errcode = '42501';
  end if;
  insert into public.company_pagamenti_settings (company_id) values (p_company_id) on conflict (company_id) do nothing;
  if p_valori ? 'modello_predefinito' then
    v_modello := nullif(p_valori->>'modello_predefinito', '')::uuid;
    if v_modello is not null
       and not exists (select 1 from public.payment_plan_templates t where t.id = v_modello and t.company_id = p_company_id) then
      raise exception 'Modello non trovato.' using errcode = 'P0002';
    end if;
    update public.company_pagamenti_settings
       set modello_predefinito = v_modello, updated_at = now()
     where company_id = p_company_id;
  end if;
end;
$$;

-- Dal modello e dal totale IVA inclusa alle rate, nel formato di order_rate_sostituisci.
-- Ogni rata è la sua percentuale arrotondata al centesimo; l'ultima prende il resto, così
-- la somma torna sempre al totale. Funzione interna: la chiamano solo le altre.
create or replace function public.rate_da_modello(p_modello_id uuid, p_totale_lordo numeric)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  r record;
  v_totale numeric := round(coalesce(p_totale_lordo, 0), 2);
  v_resto numeric := round(coalesce(p_totale_lordo, 0), 2);
  v_n integer;
  v_pos integer := 0;
  v_importo numeric;
  v_out jsonb := '[]'::jsonb;
begin
  select count(*) into v_n from public.payment_plan_template_rows where template_id = p_modello_id;
  for r in select * from public.payment_plan_template_rows where template_id = p_modello_id order by position, id loop
    v_pos := v_pos + 1;
    if v_pos = v_n then
      v_importo := greatest(0, v_resto);
    else
      v_importo := round(v_totale * r.percent / 100, 2);
      v_resto := v_resto - v_importo;
    end if;
    v_out := v_out || jsonb_build_object(
      'position', v_pos - 1,
      'label', r.label,
      'type', r.type,
      'amount', v_importo,
      'is_paid', false,
      'trigger_evento', r.trigger_evento,
      'trigger_numero', r.trigger_numero,
      'giorni_preavviso', r.giorni_preavviso);
  end loop;
  return v_out;
end;
$$;

-- Come parte una commessa nuova: fasi (20281007160000) e, ora, anche le rate.
create or replace function public.commessa_avvia(p_order_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_azienda uuid := public.get_order_company_id(p_order_id);
  v_modello uuid;
  v_fasi jsonb;
  v_n_fasi integer := 0;
  v_piano uuid;
  v_lordo numeric;
  v_rate jsonb;
  v_n_rate integer := 0;
begin
  if auth.uid() is null or v_azienda is null
     or not public.has_permission_for_company(auth.uid(), 'can_edit_orders', v_azienda) then
    raise exception 'Non hai il permesso di avviare questa commessa.' using errcode = '42501';
  end if;

  select s.modello_fasi_predefinito into v_modello
    from public.company_fasi_settings s where s.company_id = v_azienda;
  if v_modello is not null and not exists (select 1 from public.order_work_phases f where f.order_id = p_order_id) then
    select coalesce(jsonb_agg(
             jsonb_build_object(
               'nome', f.name,
               'sottofasi', coalesce((select jsonb_agg(jsonb_build_object('nome', s.name, 'peso', s.peso) order by s.position)
                                        from public.work_phase_template_subphases s where s.template_phase_id = f.id), '[]'::jsonb))
             order by f.position), '[]'::jsonb)
      into v_fasi
      from public.work_phase_template_phases f
     where f.template_id = v_modello;
    if jsonb_array_length(v_fasi) > 0 then
      v_n_fasi := public.aggiungi_fasi_commessa(p_order_id, v_fasi);
    end if;
  end if;

  select s.modello_predefinito into v_piano
    from public.company_pagamenti_settings s where s.company_id = v_azienda;
  if v_piano is not null and not exists (select 1 from public.order_installments i where i.order_id = p_order_id) then
    select round(o.total_amount * (1 + coalesce(o.vat_rate, 22) / 100.0), 2) into v_lordo
      from public.orders o where o.id = p_order_id;
    if coalesce(v_lordo, 0) > 0 then
      v_rate := public.rate_da_modello(v_piano, v_lordo);
      if jsonb_array_length(v_rate) > 0 then
        v_n_rate := public.order_rate_sostituisci(p_order_id, v_rate);
      end if;
    end if;
  end if;

  return jsonb_build_object('fasi', v_n_fasi, 'rate', v_n_rate);
end;
$$;

revoke all on function public.salva_modello_pagamento(uuid, jsonb) from public, anon;
grant execute on function public.salva_modello_pagamento(uuid, jsonb) to authenticated;
revoke all on function public.elimina_modello_pagamento(uuid, uuid) from public, anon;
grant execute on function public.elimina_modello_pagamento(uuid, uuid) to authenticated;
revoke all on function public.inizializza_modelli_pagamento(uuid, jsonb, boolean) from public, anon;
grant execute on function public.inizializza_modelli_pagamento(uuid, jsonb, boolean) to authenticated;
revoke all on function public.pagamenti_impostazioni_salva(uuid, jsonb) from public, anon;
grant execute on function public.pagamenti_impostazioni_salva(uuid, jsonb) to authenticated;
revoke all on function public.rate_da_modello(uuid, numeric) from public, anon, authenticated;
revoke all on function public.commessa_avvia(uuid) from public, anon;
grant execute on function public.commessa_avvia(uuid) to authenticated;
