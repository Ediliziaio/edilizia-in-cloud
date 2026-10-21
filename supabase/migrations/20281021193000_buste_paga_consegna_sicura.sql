-- Buste paga: la consegna non si rompe ricaricando, e il database decide cosa va al dipendente.
--
-- 1. Gli importi letti restano sul documento (`dati`) e passano nel cedolino solo
--    quando serve: subito se si pubblica o se il cedolino è ancora una bozza; se
--    la busta del mese è già consegnata e la correzione si salva senza pubblicare,
--    il dipendente continua a vedere la vecchia finché non si preme «Pubblica».
--    Un importo che il lettore non ha trovato non azzera quello che c'era.
-- 2. Al dipendente possono andare solo busta paga, CU e foglio presenze: il
--    riepilogo (con gli stipendi di tutti), F24, Cassa Edile restano all'ufficio,
--    qualunque cosa mandi il browser.
-- 3. Un documento nuovo sostituisce il vecchio solo quando lo può sostituire anche
--    per il dipendente: una correzione non pubblicata non nasconde la busta consegnata.
-- 4. Cambiare a mano lo stato del cedolino (Bozza / Emesso / Pagato) allinea la
--    consegna del PDF: emesso = il dipendente lo può aprire, bozza = no.

alter table public.hr_paghe_documenti add column if not exists dati jsonb;

-- ── Sostituzione del documento precedente ──────────────────────────────────
create or replace function public.paghe_sostituisci_precedente(p_doc uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v record;
begin
  select * into v from public.hr_paghe_documenti where id = p_doc;
  if v.hr_profilo_id is null and v.tipo <> 'riepilogo' then return; end if;
  update public.hr_paghe_documenti o set sostituito_da = p_doc
   where o.company_id = v.company_id and o.id <> p_doc
     and o.hr_profilo_id is not distinct from v.hr_profilo_id and o.tipo = v.tipo
     and o.anno is not distinct from v.anno and o.mese is not distinct from v.mese
     and o.sostituito_da is null
     and o.caricamento_id is distinct from v.caricamento_id
     -- Una busta consegnata la sostituisce solo una busta consegnata.
     and (o.pubblicato_at is null or v.pubblicato_at is not null or not v.per_dipendente);
end;
$$;

-- ── Dal documento al cedolino ──────────────────────────────────────────────
create or replace function public.paghe_scrivi_cedolino(p_doc uuid, p_pubblica boolean)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v record;
  v_esistente uuid;
  v_stato text;
  v_ced uuid;
  v_oggi date := (now() at time zone 'Europe/Rome')::date;
begin
  select * into v from public.hr_paghe_documenti where id = p_doc;
  if v.tipo <> 'cedolino' or not v.per_dipendente or v.employee_id is null or v.anno is null or v.mese is null then
    return null;
  end if;
  select id, stato into v_esistente, v_stato from public.hr_cedolini
   where employee_id = v.employee_id and anno = v.anno and mese = v.mese;
  if not p_pubblica and v_esistente is not null and v_stato <> 'bozza' then
    return null; -- si scrive alla pubblicazione
  end if;

  insert into public.hr_cedolini (
    company_id, employee_id, anno, mese, lordo, netto, contributi_dipendente, ritenute_irpef,
    stato, generation_method, documento_id, data_emissione)
  values (
    v.company_id, v.employee_id, v.anno, v.mese,
    coalesce((v.dati->>'lordo')::numeric, 0), coalesce((v.dati->>'netto')::numeric, 0),
    coalesce((v.dati->>'contributi_dipendente')::numeric, 0), coalesce((v.dati->>'ritenute_irpef')::numeric, 0),
    case when p_pubblica then 'emesso' else 'bozza' end, 'imported', p_doc,
    case when p_pubblica then v_oggi end)
  on conflict (employee_id, anno, mese) do update set
    lordo = coalesce((v.dati->>'lordo')::numeric, hr_cedolini.lordo),
    netto = coalesce((v.dati->>'netto')::numeric, hr_cedolini.netto),
    contributi_dipendente = coalesce((v.dati->>'contributi_dipendente')::numeric, hr_cedolini.contributi_dipendente),
    ritenute_irpef = coalesce((v.dati->>'ritenute_irpef')::numeric, hr_cedolini.ritenute_irpef),
    stato = case when hr_cedolini.stato = 'pagato' then 'pagato' when p_pubblica then 'emesso' else 'bozza' end,
    generation_method = 'imported',
    documento_id = p_doc,
    data_emissione = case when p_pubblica then coalesce(hr_cedolini.data_emissione, v_oggi) else hr_cedolini.data_emissione end
  returning id into v_ced;

  update public.hr_paghe_documenti set cedolino_id = v_ced where id = p_doc;
  return v_ced;
end;
$$;

-- ── Salvataggio di un caricamento ──────────────────────────────────────────
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
  v_per boolean;
  v_doc uuid;
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
    if split_part(d->>'file_path', '/', 1) <> v_company::text then
      raise exception 'File fuori dalla cartella dell''azienda' using errcode = 'P0001';
    end if;
    if coalesce(d->>'tipo', '') not in ('cedolino','presenze','riepilogo','cu','f24','cassa_edile','altro') then
      raise exception 'Tipo di documento non riconosciuto' using errcode = 'P0001';
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

    v_per := coalesce((d->>'per_dipendente')::boolean, false)
             and v_profilo.id is not null
             and d->>'tipo' in ('cedolino', 'cu', 'presenze');

    insert into public.hr_paghe_documenti (
      company_id, caricamento_id, tipo, per_dipendente, hr_profilo_id, employee_id,
      anno, mese, titolo, file_path, pagine, nome_letto, codice_fiscale_letto, dati, pubblicato_at)
    values (
      v_company, v_caricamento, d->>'tipo', v_per,
      v_profilo.id, v_profilo.employee_id,
      nullif(d->>'anno', '')::int, nullif(d->>'mese', '')::int,
      coalesce(nullif(d->>'titolo', ''), 'Documento paghe'),
      d->>'file_path', coalesce((d->>'pagine')::int, 1),
      d->>'nome_letto', upper(nullif(d->>'codice_fiscale_letto', '')),
      case when d->>'tipo' = 'cedolino' then d->'cedolino' end,
      case when v_pubblica and v_per then now() end)
    returning id into v_doc;

    perform public.paghe_sostituisci_precedente(v_doc);

    -- Il codice fiscale letto sulla busta completa il profilo che non l'aveva:
    -- dal mese dopo l'aggancio è sicuro.
    if v_profilo.id is not null and v_profilo.codice_fiscale is null
       and upper(coalesce(d->>'codice_fiscale_letto', '')) ~ '^[A-Z]{6}[0-9LMNPQRSTUV]{2}[A-Z][0-9LMNPQRSTUV]{2}[A-Z][0-9LMNPQRSTUV]{3}[A-Z]$' then
      update public.hr_profili set codice_fiscale = upper(d->>'codice_fiscale_letto') where id = v_profilo.id and codice_fiscale is null;
      v_cf_imparati := v_cf_imparati + 1;
    end if;

    if d->>'tipo' = 'cedolino' and v_per then
      if v_profilo.employee_id is null then
        v_senza_anagrafica := v_senza_anagrafica || trim(coalesce(v_profilo.nome, '') || ' ' || coalesce(v_profilo.cognome, ''));
      else
        perform public.paghe_scrivi_cedolino(v_doc, v_pubblica);
        v_cedolini := v_cedolini + 1;
      end if;
    end if;

    if not v_per then
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

-- ── Pubblica dopo ──────────────────────────────────────────────────────────
create or replace function public.paghe_pubblica(p_caricamento uuid)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_company uuid;
  v_doc uuid;
  v_n int := 0;
begin
  select company_id into v_company from public.hr_paghe_caricamenti where id = p_caricamento;
  if v_company is null or not (public.e_amministratore_di(v_company) or public.has_role(auth.uid(), 'super_admin'::public.app_role)) then
    raise exception 'Solo il titolare può pubblicare le buste paga' using errcode = 'P0001';
  end if;
  for v_doc in
    update public.hr_paghe_documenti set pubblicato_at = now()
     where caricamento_id = p_caricamento and per_dipendente and pubblicato_at is null
    returning id
  loop
    perform public.paghe_sostituisci_precedente(v_doc);
    perform public.paghe_scrivi_cedolino(v_doc, true);
    v_n := v_n + 1;
  end loop;
  perform public.paghe_avvisa_dipendenti(p_caricamento);
  return v_n;
end;
$$;

-- ── Stato del cedolino cambiato a mano → consegna del PDF allineata ────────
create or replace function public.paghe_allinea_consegna()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.documento_id is not null and new.stato is distinct from old.stato then
    update public.hr_paghe_documenti
       set pubblicato_at = case when new.stato = 'bozza' then null else coalesce(pubblicato_at, now()) end
     where id = new.documento_id and per_dipendente;
  end if;
  return new;
end;
$$;
drop trigger if exists trg_paghe_allinea_consegna on public.hr_cedolini;
create trigger trg_paghe_allinea_consegna after update of stato on public.hr_cedolini
  for each row execute function public.paghe_allinea_consegna();

revoke all on function public.paghe_sostituisci_precedente(uuid) from public, anon, authenticated;
revoke all on function public.paghe_scrivi_cedolino(uuid, boolean) from public, anon, authenticated;
revoke all on function public.paghe_allinea_consegna() from public, anon, authenticated;
revoke all on function public.paghe_salva_caricamento(jsonb) from public, anon;
revoke all on function public.paghe_pubblica(uuid) from public, anon;
grant execute on function public.paghe_salva_caricamento(jsonb) to authenticated;
grant execute on function public.paghe_pubblica(uuid) to authenticated;
