-- Buste paga: avvisi solo a chi riceve qualcosa di nuovo, e l'intestatario
-- riconosciuto anche dalla scheda dipendente.
--
-- 1. «Pubblica» avvisa solo i documenti pubblicati in quel momento: prima,
--    ripubblicando un caricamento (o dopo aver rimesso in bozza un cedolino),
--    ripartiva l'avviso a tutti quelli già avvisati. Il testo dice cosa è
--    arrivato: busta paga, CU o foglio presenze.
-- 2. Il dipendente è l'intestatario se è collegato al profilo HR **o** alla scheda
--    dipendente (employees.user_id): chi vede il cedolino grazie alla scheda ora
--    riesce anche ad aprirne il PDF e riceve l'avviso.
-- 3. Si sostituiscono solo documenti con un periodo certo (busta, presenze,
--    riepilogo: anno e mese; CU: anno). Due documenti Cassa Edile o «da
--    controllare» della stessa persona non si cancellano più a vicenda.

-- ── 2. Chi è l'intestatario ────────────────────────────────────────────────
create or replace function public.paghe_e_intestatario(p_profilo uuid, p_employee uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from public.hr_profili p where p.id = p_profilo and p.user_id = auth.uid())
      or exists (select 1 from public.employees e where e.id = p_employee and e.user_id = auth.uid());
$$;
revoke all on function public.paghe_e_intestatario(uuid, uuid) from public, anon;
grant execute on function public.paghe_e_intestatario(uuid, uuid) to authenticated;

drop policy if exists paghe_documenti_propri on public.hr_paghe_documenti;
create policy paghe_documenti_propri on public.hr_paghe_documenti for select to authenticated
  using (per_dipendente and pubblicato_at is not null and public.paghe_e_intestatario(hr_profilo_id, employee_id));

drop policy if exists buste_paga_proprie on storage.objects;
create policy buste_paga_proprie on storage.objects for select to authenticated
  using (case when bucket_id = 'buste-paga' then exists (
    select 1 from public.hr_paghe_documenti d
     where d.file_path = storage.objects.name
       and d.per_dipendente and d.pubblicato_at is not null
       and public.paghe_e_intestatario(d.hr_profilo_id, d.employee_id))
    else false end);

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
  select * into v_doc from public.hr_paghe_documenti where id = p_documento;
  if v_doc.id is null then
    raise exception 'Documento non trovato' using errcode = 'P0001';
  end if;
  v_proprio := v_doc.per_dipendente and v_doc.pubblicato_at is not null
               and public.paghe_e_intestatario(v_doc.hr_profilo_id, v_doc.employee_id);
  if not v_proprio and not (public.e_amministratore_di(v_doc.company_id) or public.has_role(auth.uid(), 'super_admin'::public.app_role)) then
    raise exception 'Non puoi aprire questo documento' using errcode = 'P0001';
  end if;
  if v_proprio and v_doc.visto_at is null then
    update public.hr_paghe_documenti set visto_at = now() where id = p_documento;
  end if;
  return v_doc.file_path;
end;
$$;
revoke all on function public.paghe_apri_documento(uuid) from public, anon;
grant execute on function public.paghe_apri_documento(uuid) to authenticated;

-- ── 1. Avvisi: solo il nuovo, con il testo giusto ──────────────────────────
drop function if exists public.paghe_avvisa_dipendenti(uuid);
create or replace function public.paghe_avvisa_dipendenti(p_caricamento uuid, p_pubblicati_da timestamptz default null)
returns int
language sql
security definer
set search_path = public
as $$
  with documenti as (
    select d.company_id, coalesce(p.user_id, e.user_id) as user_id, d.tipo, d.anno, d.mese
      from public.hr_paghe_documenti d
      left join public.hr_profili p on p.id = d.hr_profilo_id
      left join public.employees e on e.id = d.employee_id
     where d.caricamento_id = p_caricamento and d.per_dipendente
       and d.pubblicato_at is not null
       and (p_pubblicati_da is null or d.pubblicato_at >= p_pubblicati_da)
  ), destinatari as (
    -- Una riga per persona: la busta paga, se c'è, prima del resto.
    select distinct on (user_id) company_id, user_id, tipo, anno, mese
      from documenti where user_id is not null
     order by user_id, case tipo when 'cedolino' then 0 when 'cu' then 1 else 2 end
  ), ins as (
    insert into public.notifications (company_id, user_id, type, title, body, entity_type, entity_id, action_url)
    select company_id, user_id, 'busta_paga',
           case tipo when 'cedolino' then 'È arrivata la tua busta paga'
                     when 'cu' then 'È arrivata la tua Certificazione Unica'
                     else 'Hai un nuovo documento paghe' end,
           case tipo
             when 'cedolino' then coalesce('Il cedolino di ' || ('{gennaio,febbraio,marzo,aprile,maggio,giugno,luglio,agosto,settembre,ottobre,novembre,dicembre}'::text[])[mese]
                                  || ' ' || anno || ' è pronto da vedere e scaricare.', 'La busta paga è pronta da vedere e scaricare.')
             when 'cu' then coalesce('La CU ' || anno || ' è pronta da vedere e scaricare.', 'La CU è pronta da vedere e scaricare.')
             else coalesce('Il foglio presenze di ' || ('{gennaio,febbraio,marzo,aprile,maggio,giugno,luglio,agosto,settembre,ottobre,novembre,dicembre}'::text[])[mese]
                           || ' ' || anno || ' è pronto da vedere.', 'C''è un nuovo documento da vedere.')
           end,
           'hr_paghe_caricamento', p_caricamento,
           case when exists (select 1 from public.user_roles r
                              where r.user_id = destinatari.user_id and r.role in ('employee'::public.app_role, 'worker'::public.app_role))
                then '/campo/cedolini'
                else '/azienda/attivita?stato=cedolini' end
      from destinatari
    returning 1
  )
  select count(*)::int from ins;
$$;
revoke all on function public.paghe_avvisa_dipendenti(uuid, timestamptz) from public, anon, authenticated;

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
  v_ora timestamptz := now();
begin
  select company_id into v_company from public.hr_paghe_caricamenti where id = p_caricamento;
  if v_company is null or not (public.e_amministratore_di(v_company) or public.has_role(auth.uid(), 'super_admin'::public.app_role)) then
    raise exception 'Solo il titolare può pubblicare le buste paga' using errcode = 'P0001';
  end if;
  for v_doc in
    update public.hr_paghe_documenti set pubblicato_at = v_ora
     where caricamento_id = p_caricamento and per_dipendente and pubblicato_at is null
    returning id
  loop
    perform public.paghe_sostituisci_precedente(v_doc);
    perform public.paghe_scrivi_cedolino(v_doc, true);
    v_n := v_n + 1;
  end loop;
  -- Solo chi ha appena ricevuto qualcosa; niente di nuovo, nessun avviso.
  if v_n > 0 then
    perform public.paghe_avvisa_dipendenti(p_caricamento, v_ora);
  end if;
  return v_n;
end;
$$;
revoke all on function public.paghe_pubblica(uuid) from public, anon;
grant execute on function public.paghe_pubblica(uuid) to authenticated;

-- ── 3. Sostituzione solo con un periodo certo ──────────────────────────────
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
  if v.tipo not in ('cedolino', 'presenze', 'riepilogo', 'cu') or v.anno is null
     or (v.tipo <> 'cu' and v.mese is null)
     or (v.hr_profilo_id is null and v.tipo <> 'riepilogo') then
    return;
  end if;
  update public.hr_paghe_documenti o set sostituito_da = p_doc
   where o.company_id = v.company_id and o.id <> p_doc
     and o.hr_profilo_id is not distinct from v.hr_profilo_id and o.tipo = v.tipo
     and o.anno = v.anno and o.mese is not distinct from v.mese
     and o.sostituito_da is null
     and o.caricamento_id is distinct from v.caricamento_id
     -- Una busta consegnata la sostituisce solo una busta consegnata.
     and (o.pubblicato_at is null or v.pubblicato_at is not null or not v.per_dipendente);
end;
$$;
revoke all on function public.paghe_sostituisci_precedente(uuid) from public, anon, authenticated;
