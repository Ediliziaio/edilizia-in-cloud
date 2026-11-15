-- Il catalogo standard del cash flow c'è sempre, per ogni azienda (15/11/2026)
--
-- Richiesta: «a livello di cash flow metti sempre uno standard, che è quello
-- dell'Excel; poi ognuno lo può modificare a livello di configurazione».
--
-- Fino a ieri la copia dell'azienda nasceva alla prima apertura delle
-- categorie (`cassa_catalogo_prepara` chiamata dal browser): finché nessuno
-- apriva la pagina, l'azienda non aveva categorie, e il cash flow e le
-- proposte dalla fattura non avevano voci su cui appoggiarsi. Il 15/11 una
-- sola azienda su 50 l'aveva.
--
-- Adesso:
--  - `private.cassa_catalogo_copia(azienda)` fa la copia, senza controllo dei
--    permessi (la chiamano solo il database e `cassa_catalogo_prepara`, che il
--    controllo lo fa). Idempotente: ciò che c'è non si tocca, quindi le
--    modifiche fatte in Configurazione restano.
--  - ogni azienda esistente riceve la copia qui sotto;
--  - ogni azienda nuova la riceve alla creazione (trigger su `companies`). Se
--    la copia fallisse, l'azienda nasce lo stesso: la copia la rifà la prima
--    apertura, come prima.
--
-- Righe scritte: circa 384 per azienda, in una tabella che nessun altro usa.

set local lock_timeout = '3s';
set local statement_timeout = '60s';

create or replace function private.cassa_catalogo_copia(p_company uuid)
returns jsonb language plpgsql security definer set search_path to '' as $$
declare prima integer; dopo integer;
begin
  -- Due copie in parallelo non devono litigare sulle stesse righe.
  perform pg_advisory_xact_lock(hashtext('cassa_catalogo_prepara'), hashtext(p_company::text));
  select count(*) into prima from public.cassa_voci where company_id = p_company;

  insert into public.cassa_voci (company_id, codice, livello, nome, flusso, sezione, attiva, ordine, origine)
  select p_company, 'A.' || lower(regexp_replace(b.area, '[^A-Za-z]+', '_', 'g')), 'area', b.area, 'entrambi',
         min(b.sezione), bool_or(b.attiva_di_partenza), min(b.ordine), 'catalogo'
    from public.cassa_catalogo_base b group by b.area
  on conflict (company_id, codice) do nothing;

  insert into public.cassa_voci (company_id, codice, parent_id, livello, nome, flusso, sezione, voce_cassa_in, voce_cassa_out,
                                 attiva, ordine, origine, codice_base)
  select p_company, left(b.codice, 2), a.id, 'categoria', min(b.categoria),
         case when count(distinct b.flusso) = 1 then min(b.flusso) else 'entrambi' end,
         min(b.sezione),
         mode() within group (order by b.voce_cassa_in) filter (where b.voce_cassa_in is not null),
         mode() within group (order by b.voce_cassa_out) filter (where b.voce_cassa_out is not null),
         bool_or(b.attiva_di_partenza), min(b.ordine), 'catalogo', left(b.codice, 2)
    from public.cassa_catalogo_base b
    join public.cassa_voci a on a.company_id = p_company and a.codice = 'A.' || lower(regexp_replace(b.area, '[^A-Za-z]+', '_', 'g'))
   group by left(b.codice, 2), a.id
  on conflict (company_id, codice) do nothing;

  insert into public.cassa_voci (company_id, codice, parent_id, livello, nome, descrizione, esempio, flusso, sezione,
                                 voce_cassa_in, voce_cassa_out, attiva, ordine, origine, codice_base)
  select p_company, b.codice, c.id, 'voce', b.voce, b.descrizione, b.esempio, b.flusso, b.sezione,
         b.voce_cassa_in, b.voce_cassa_out, b.attiva_di_partenza, b.ordine, 'catalogo', b.codice
    from public.cassa_catalogo_base b
    join public.cassa_voci c on c.company_id = p_company and c.codice = left(b.codice, 2)
  on conflict (company_id, codice) do nothing;

  select count(*) into dopo from public.cassa_voci where company_id = p_company;
  return jsonb_build_object('create', dopo - prima, 'totale', dopo);
end $$;
revoke all on function private.cassa_catalogo_copia(uuid) from public, anon, authenticated;

-- Dal browser: stesso comportamento di prima, col controllo dei permessi.
create or replace function public.cassa_catalogo_prepara(p_company uuid)
returns jsonb language plpgsql security definer set search_path to '' as $$
begin
  perform private.cassa_accesso(p_company, false);
  return private.cassa_catalogo_copia(p_company);
end $$;
revoke all on function public.cassa_catalogo_prepara(uuid) from public, anon;
grant execute on function public.cassa_catalogo_prepara(uuid) to authenticated;

-- Ogni azienda nuova nasce con lo standard.
create or replace function private.cassa_catalogo_alla_nascita()
returns trigger language plpgsql security definer set search_path to '' as $$
begin
  begin
    perform private.cassa_catalogo_copia(new.id);
  exception when others then
    raise warning 'Catalogo di cassa non copiato per l''azienda %: %', new.id, sqlerrm;
  end;
  return new;
end $$;
revoke all on function private.cassa_catalogo_alla_nascita() from public, anon, authenticated;
do $t$ begin
  if not exists (select 1 from pg_trigger where tgrelid = 'public.companies'::regclass and tgname = 'cassa_catalogo_alla_nascita') then
    create trigger cassa_catalogo_alla_nascita after insert on public.companies
      for each row execute function private.cassa_catalogo_alla_nascita();
  end if;
end $t$;

-- E ogni azienda che c'è già.
do $b$
declare c uuid;
begin
  for c in select id from public.companies order by id loop
    perform private.cassa_catalogo_copia(c);
  end loop;
end $b$;
