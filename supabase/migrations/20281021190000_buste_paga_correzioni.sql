-- Buste paga: correzioni dopo la prima prova.
--
-- 1. Policy del bucket `buste-paga`: in Postgres l'AND non ha un ordine garantito,
--    e il cast `(foldername)[1]::uuid` poteva girare su oggetti di ALTRI bucket con
--    una cartella che non è un uuid, facendo fallire la loro lettura. Ora il cast
--    sta dentro un CASE, che si valuta solo per `buste-paga` con un uuid valido.
-- 2. Il dipendente non legge più i propri cedolini in bozza (non ancora consegnati):
--    l'interfaccia li nascondeva, ma l'API li dava.
-- 3. L'avviso porta dove la busta si vede: l'operaio nell'app di cantiere, gli
--    altri (titolare compreso) in «Il mio stato» (?stato=cedolini su qualunque pagina).
-- 4. Ricaricare lo stesso mese sostituisce anche il riepilogo dell'azienda,
--    invece di affiancarne un secondo.

-- ── 1. Policy del bucket ───────────────────────────────────────────────────
drop policy if exists buste_paga_admin on storage.objects;
create policy buste_paga_admin on storage.objects for all to authenticated
  using (case when bucket_id = 'buste-paga' and (storage.foldername(name))[1] ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
              then public.e_amministratore_di(((storage.foldername(name))[1])::uuid)
                   or public.has_role(auth.uid(), 'super_admin'::public.app_role)
              else false end)
  with check (case when bucket_id = 'buste-paga' and (storage.foldername(name))[1] ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
              then public.e_amministratore_di(((storage.foldername(name))[1])::uuid)
                   or public.has_role(auth.uid(), 'super_admin'::public.app_role)
              else false end);

drop policy if exists buste_paga_proprie on storage.objects;
create policy buste_paga_proprie on storage.objects for select to authenticated
  using (case when bucket_id = 'buste-paga' then exists (
    select 1 from public.hr_paghe_documenti d
      join public.hr_profili p on p.id = d.hr_profilo_id
     where d.file_path = storage.objects.name
       and d.per_dipendente and d.pubblicato_at is not null
       and p.user_id = auth.uid())
    else false end);

-- ── 2. Bozze non visibili al dipendente ────────────────────────────────────
drop policy if exists cedolini_select_own on public.hr_cedolini;
create policy cedolini_select_own on public.hr_cedolini for select
  using (stato <> 'bozza' and exists (
    select 1 from public.employees e
     where e.id = hr_cedolini.employee_id and e.user_id = (select auth.uid())));

-- ── 3. Avviso con il link giusto per chi lo riceve ─────────────────────────
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
revoke all on function public.paghe_avvisa_dipendenti(uuid) from public, anon, authenticated;
