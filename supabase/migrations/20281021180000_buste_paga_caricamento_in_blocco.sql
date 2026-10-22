-- Buste paga caricate in blocco dal PDF del consulente (Libro Unico).
--
-- Il consulente manda ogni mese un PDF con tutto: buste paga, foglio presenze,
-- riepilogo generale (e a parte F24, Cassa Edile, CU...). Il gestionale lo divide
-- per persona nel browser, e qui si archivia:
--   · hr_paghe_caricamenti — un caricamento (i file di un mese);
--   · hr_paghe_documenti   — ogni documento ricavato, con chi lo deve ricevere.
-- Al dipendente arriva SOLO quello che è suo e pubblicato (per_dipendente +
-- pubblicato_at). Riepilogo, F24, Cassa Edile restano all'azienda.
-- La consegna si prova: visto_at = la prima volta che il dipendente l'apre.
--
-- I file stanno nel bucket privato `buste-paga`, non in `hr-documenti`: lì la
-- policy di lettura apre tutto lo staff dell'azienda, e una busta paga la vedono
-- solo il titolare e la persona a cui è intestata.

-- ── Tabelle ────────────────────────────────────────────────────────────────
create table if not exists public.hr_paghe_caricamenti (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  nomi_file text[] not null default '{}',
  anno int,
  mese int check (mese between 1 and 12),
  pagine int not null default 0,
  documenti int not null default 0,
  programma text,
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now()
);
create index if not exists idx_hr_paghe_caricamenti_company on public.hr_paghe_caricamenti (company_id, created_at desc);

create table if not exists public.hr_paghe_documenti (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  caricamento_id uuid references public.hr_paghe_caricamenti(id) on delete cascade,
  tipo text not null check (tipo in ('cedolino','presenze','riepilogo','cu','f24','cassa_edile','altro')),
  per_dipendente boolean not null default false,
  hr_profilo_id uuid references public.hr_profili(id) on delete set null,
  employee_id uuid references public.employees(id) on delete set null,
  cedolino_id uuid references public.hr_cedolini(id) on delete set null,
  anno int,
  mese int check (mese between 1 and 12),
  titolo text not null,
  file_path text not null,
  pagine int not null default 1,
  nome_letto text,
  codice_fiscale_letto text,
  sostituito_da uuid references public.hr_paghe_documenti(id) on delete set null,
  pubblicato_at timestamptz,
  visto_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists idx_hr_paghe_documenti_company on public.hr_paghe_documenti (company_id, anno, mese);
create index if not exists idx_hr_paghe_documenti_profilo on public.hr_paghe_documenti (hr_profilo_id);
create index if not exists idx_hr_paghe_documenti_caricamento on public.hr_paghe_documenti (caricamento_id);

alter table public.hr_cedolini add column if not exists documento_id uuid references public.hr_paghe_documenti(id) on delete set null;

-- ── RLS ────────────────────────────────────────────────────────────────────
alter table public.hr_paghe_caricamenti enable row level security;
alter table public.hr_paghe_documenti enable row level security;

drop policy if exists paghe_caricamenti_admin on public.hr_paghe_caricamenti;
create policy paghe_caricamenti_admin on public.hr_paghe_caricamenti for all to authenticated
  using ((select public.e_amministratore_di(company_id)) or (select public.has_role(auth.uid(), 'super_admin'::public.app_role)))
  with check ((select public.e_amministratore_di(company_id)) or (select public.has_role(auth.uid(), 'super_admin'::public.app_role)));

drop policy if exists paghe_documenti_admin on public.hr_paghe_documenti;
create policy paghe_documenti_admin on public.hr_paghe_documenti for all to authenticated
  using ((select public.e_amministratore_di(company_id)) or (select public.has_role(auth.uid(), 'super_admin'::public.app_role)))
  with check ((select public.e_amministratore_di(company_id)) or (select public.has_role(auth.uid(), 'super_admin'::public.app_role)));

drop policy if exists paghe_documenti_propri on public.hr_paghe_documenti;
create policy paghe_documenti_propri on public.hr_paghe_documenti for select to authenticated
  using (per_dipendente and pubblicato_at is not null and exists (
    select 1 from public.hr_profili p where p.id = hr_paghe_documenti.hr_profilo_id and p.user_id = auth.uid()));

revoke all on public.hr_paghe_caricamenti, public.hr_paghe_documenti from anon;

-- ── Bucket privato ─────────────────────────────────────────────────────────
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('buste-paga', 'buste-paga', false, 20971520, array['application/pdf'])
on conflict (id) do nothing;

-- Percorso: <company_id>/<anno-mese>/<uuid>.pdf
drop policy if exists buste_paga_admin on storage.objects;
create policy buste_paga_admin on storage.objects for all to authenticated
  using (bucket_id = 'buste-paga' and (
    public.e_amministratore_di(((storage.foldername(name))[1])::uuid)
    or public.has_role(auth.uid(), 'super_admin'::public.app_role)))
  with check (bucket_id = 'buste-paga' and (
    public.e_amministratore_di(((storage.foldername(name))[1])::uuid)
    or public.has_role(auth.uid(), 'super_admin'::public.app_role)));

drop policy if exists buste_paga_proprie on storage.objects;
create policy buste_paga_proprie on storage.objects for select to authenticated
  using (bucket_id = 'buste-paga' and exists (
    select 1 from public.hr_paghe_documenti d
      join public.hr_profili p on p.id = d.hr_profilo_id
     where d.file_path = storage.objects.name
       and d.per_dipendente and d.pubblicato_at is not null
       and p.user_id = auth.uid()));

-- ── Salvataggio di un caricamento (tutto o niente) ─────────────────────────
-- p_dati: { company_id, nomi_file[], anno, mese, pagine, programma, pubblica,
--           documenti: [{ tipo, per_dipendente, hr_profilo_id, anno, mese, titolo,
--                         file_path, pagine, nome_letto, codice_fiscale_letto,
--                         cedolino: { lordo, netto, contributi_dipendente,
--                                     ritenute_irpef, ore_ordinarie, ore_straordinario } }] }
create or replace function public.paghe_salva_caricamento(p_dati jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_company uuid := (p_dati->>'company_id')::uuid;
  v_pubblica boolean := coalesce((p_dati->>'pubblica')::boolean, false);
  v_caricamento uuid;
  d jsonb;
  v_profilo record;
  v_doc uuid;
  v_ced uuid;
  v_vecchio uuid;
  v_cedolini int := 0;
  v_azienda int := 0;
  v_cf_imparati int := 0;
  v_senza_anagrafica text[] := '{}';
begin
  if v_company is null or not (public.e_amministratore_di(v_company) or public.has_role(auth.uid(), 'super_admin'::public.app_role)) then
    raise exception 'Solo il titolare può caricare le buste paga' using errcode = 'P0001';
  end if;

  insert into public.hr_paghe_caricamenti (company_id, nomi_file, anno, mese, pagine, documenti, programma)
  values (
    v_company,
    coalesce(array(select jsonb_array_elements_text(p_dati->'nomi_file')), '{}'),
    nullif(p_dati->>'anno', '')::int, nullif(p_dati->>'mese', '')::int,
    coalesce((p_dati->>'pagine')::int, 0),
    jsonb_array_length(coalesce(p_dati->'documenti', '[]'::jsonb)),
    p_dati->>'programma')
  returning id into v_caricamento;

  for d in select * from jsonb_array_elements(coalesce(p_dati->'documenti', '[]'::jsonb)) loop
    -- Ogni file deve stare nella cartella dell'azienda.
    if split_part(d->>'file_path', '/', 1) <> v_company::text then
      raise exception 'File fuori dalla cartella dell''azienda' using errcode = 'P0001';
    end if;

    -- Un record vuoto ma «assegnato»: con `:= null` leggere v_profilo.id fallisce.
    select null::uuid as id, null::uuid as employee_id, null::uuid as user_id,
           null::text as codice_fiscale, null::text as nome, null::text as cognome
      into v_profilo;
    if nullif(d->>'hr_profilo_id', '') is not null then
      select id, employee_id, user_id, codice_fiscale, nome, cognome into v_profilo
        from public.hr_profili where id = (d->>'hr_profilo_id')::uuid and company_id = v_company;
      if v_profilo.id is null then
        raise exception 'Dipendente non trovato in questa azienda' using errcode = 'P0001';
      end if;
    end if;

    -- Il documento dello stesso tipo e mese per la stessa persona (o il riepilogo
    -- dell'azienda) caricato in passato viene sostituito, non affiancato.
    v_vecchio := null;
    if v_profilo.id is not null or d->>'tipo' = 'riepilogo' then
      select id into v_vecchio from public.hr_paghe_documenti
       where company_id = v_company and hr_profilo_id is not distinct from v_profilo.id and tipo = d->>'tipo'
         and anno is not distinct from nullif(d->>'anno', '')::int
         and mese is not distinct from nullif(d->>'mese', '')::int
         and sostituito_da is null
         and caricamento_id is distinct from v_caricamento
       order by created_at desc limit 1;
    end if;

    insert into public.hr_paghe_documenti (
      company_id, caricamento_id, tipo, per_dipendente, hr_profilo_id, employee_id,
      anno, mese, titolo, file_path, pagine, nome_letto, codice_fiscale_letto, pubblicato_at)
    values (
      v_company, v_caricamento, d->>'tipo',
      coalesce((d->>'per_dipendente')::boolean, false) and v_profilo.id is not null,
      v_profilo.id, v_profilo.employee_id,
      nullif(d->>'anno', '')::int, nullif(d->>'mese', '')::int,
      coalesce(nullif(d->>'titolo', ''), 'Documento paghe'),
      d->>'file_path', coalesce((d->>'pagine')::int, 1),
      d->>'nome_letto', upper(nullif(d->>'codice_fiscale_letto', '')),
      case when v_pubblica and coalesce((d->>'per_dipendente')::boolean, false) and v_profilo.id is not null then now() end)
    returning id into v_doc;

    if v_vecchio is not null then
      update public.hr_paghe_documenti set sostituito_da = v_doc where id = v_vecchio;
    end if;

    -- Il codice fiscale letto sulla busta completa il profilo che non l'aveva:
    -- dal mese dopo l'aggancio è sicuro.
    if v_profilo.id is not null and v_profilo.codice_fiscale is null
       and upper(coalesce(d->>'codice_fiscale_letto', '')) ~ '^[A-Z]{6}[0-9LMNPQRSTUV]{2}[A-Z][0-9LMNPQRSTUV]{2}[A-Z][0-9LMNPQRSTUV]{3}[A-Z]$' then
      update public.hr_profili set codice_fiscale = upper(d->>'codice_fiscale_letto') where id = v_profilo.id and codice_fiscale is null;
      v_cf_imparati := v_cf_imparati + 1;
    end if;

    if d->>'tipo' = 'cedolino' and v_profilo.id is not null and nullif(d->>'anno', '') is not null and nullif(d->>'mese', '') is not null then
      if v_profilo.employee_id is null then
        v_senza_anagrafica := v_senza_anagrafica || trim(coalesce(v_profilo.nome, '') || ' ' || coalesce(v_profilo.cognome, ''));
      else
        insert into public.hr_cedolini (
          company_id, employee_id, anno, mese, lordo, netto, contributi_dipendente, ritenute_irpef,
          ore_ordinarie, ore_straordinario, stato, generation_method, documento_id, data_emissione)
        values (
          v_company, v_profilo.employee_id, (d->>'anno')::int, (d->>'mese')::int,
          coalesce((d->'cedolino'->>'lordo')::numeric, 0), coalesce((d->'cedolino'->>'netto')::numeric, 0),
          coalesce((d->'cedolino'->>'contributi_dipendente')::numeric, 0), coalesce((d->'cedolino'->>'ritenute_irpef')::numeric, 0),
          (d->'cedolino'->>'ore_ordinarie')::numeric, (d->'cedolino'->>'ore_straordinario')::numeric,
          case when v_pubblica then 'emesso' else 'bozza' end, 'imported', v_doc,
          case when v_pubblica then (now() at time zone 'Europe/Rome')::date end)
        on conflict (employee_id, anno, mese) do update set
          lordo = excluded.lordo, netto = excluded.netto,
          contributi_dipendente = excluded.contributi_dipendente, ritenute_irpef = excluded.ritenute_irpef,
          ore_ordinarie = excluded.ore_ordinarie, ore_straordinario = excluded.ore_straordinario,
          -- Un cedolino già pagato resta pagato; gli altri seguono la pubblicazione.
          stato = case when hr_cedolini.stato = 'pagato' then 'pagato' else excluded.stato end,
          generation_method = 'imported', documento_id = excluded.documento_id,
          data_emissione = coalesce(excluded.data_emissione, hr_cedolini.data_emissione)
        returning id into v_ced;
        update public.hr_paghe_documenti set cedolino_id = v_ced where id = v_doc;
        v_cedolini := v_cedolini + 1;
      end if;
    end if;

    if not coalesce((d->>'per_dipendente')::boolean, false) then
      v_azienda := v_azienda + 1;
    end if;
  end loop;

  if v_pubblica then
    perform public.paghe_avvisa_dipendenti(v_caricamento);
  end if;

  return jsonb_build_object(
    'caricamento_id', v_caricamento,
    'cedolini', v_cedolini,
    'documenti_azienda', v_azienda,
    'codici_fiscali_imparati', v_cf_imparati,
    'senza_anagrafica', to_jsonb(v_senza_anagrafica));
end;
$$;

-- Avviso nella campanella a chi ha ricevuto qualcosa (una riga per persona).
create or replace function public.paghe_avvisa_dipendenti(p_caricamento uuid)
returns int
language sql
security definer
set search_path = public
as $$
  with destinatari as (
    select distinct on (p.user_id) d.company_id, p.user_id, d.anno, d.mese
      from public.hr_paghe_documenti d
      join public.hr_profili p on p.id = d.hr_profilo_id
     where d.caricamento_id = p_caricamento and d.per_dipendente
       and d.pubblicato_at is not null and p.user_id is not null
     order by p.user_id, d.tipo = 'cedolino' desc
  ), ins as (
    insert into public.notifications (company_id, user_id, type, title, body, entity_type, entity_id, action_url)
    select company_id, user_id, 'busta_paga',
           'È arrivata la tua busta paga',
           coalesce('Il cedolino di ' || ('{gennaio,febbraio,marzo,aprile,maggio,giugno,luglio,agosto,settembre,ottobre,novembre,dicembre}'::text[])[mese]
                    || ' ' || anno || ' è pronto da vedere e scaricare.',
                    'Hai un nuovo documento paghe da vedere.'),
           'hr_paghe_caricamento', p_caricamento, '/azienda/attivita?tab=cedolini'
      from destinatari
    returning 1
  )
  select count(*)::int from ins;
$$;

-- Pubblica dopo: per un caricamento salvato senza pubblicare.
create or replace function public.paghe_pubblica(p_caricamento uuid)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_company uuid;
  v_n int;
begin
  select company_id into v_company from public.hr_paghe_caricamenti where id = p_caricamento;
  if v_company is null or not (public.e_amministratore_di(v_company) or public.has_role(auth.uid(), 'super_admin'::public.app_role)) then
    raise exception 'Solo il titolare può pubblicare le buste paga' using errcode = 'P0001';
  end if;
  update public.hr_paghe_documenti set pubblicato_at = now()
   where caricamento_id = p_caricamento and per_dipendente and pubblicato_at is null;
  get diagnostics v_n = row_count;
  update public.hr_cedolini c set stato = 'emesso', data_emissione = coalesce(c.data_emissione, (now() at time zone 'Europe/Rome')::date)
    from public.hr_paghe_documenti d
   where d.caricamento_id = p_caricamento and d.cedolino_id = c.id and c.stato = 'bozza';
  perform public.paghe_avvisa_dipendenti(p_caricamento);
  return v_n;
end;
$$;

-- Apertura di un documento: restituisce il percorso del file (poi il browser
-- chiede il link firmato, che le policy del bucket permettono) e, se lo apre
-- l'intestatario, segna la prima apertura: è la prova di consegna.
create or replace function public.paghe_apri_documento(p_documento uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_doc record;
  v_proprio boolean;
begin
  select d.*, p.user_id as intestatario into v_doc
    from public.hr_paghe_documenti d
    left join public.hr_profili p on p.id = d.hr_profilo_id
   where d.id = p_documento;
  if v_doc.id is null then
    raise exception 'Documento non trovato' using errcode = 'P0001';
  end if;
  v_proprio := v_doc.intestatario = auth.uid() and v_doc.per_dipendente and v_doc.pubblicato_at is not null;
  if not v_proprio and not (public.e_amministratore_di(v_doc.company_id) or public.has_role(auth.uid(), 'super_admin'::public.app_role)) then
    raise exception 'Non puoi aprire questo documento' using errcode = 'P0001';
  end if;
  if v_proprio and v_doc.visto_at is null then
    update public.hr_paghe_documenti set visto_at = now() where id = p_documento;
  end if;
  return v_doc.file_path;
end;
$$;

revoke all on function public.paghe_salva_caricamento(jsonb) from public, anon;
revoke all on function public.paghe_avvisa_dipendenti(uuid) from public, anon, authenticated;
revoke all on function public.paghe_pubblica(uuid) from public, anon;
revoke all on function public.paghe_apri_documento(uuid) from public, anon;
grant execute on function public.paghe_salva_caricamento(jsonb) to authenticated;
grant execute on function public.paghe_pubblica(uuid) to authenticated;
grant execute on function public.paghe_apri_documento(uuid) to authenticated;
