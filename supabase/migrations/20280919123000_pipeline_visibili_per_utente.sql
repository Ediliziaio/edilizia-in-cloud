-- Pipeline visibili per utente.
--
-- Il Bagno Group (19/09/2026): i consulenti, tranne alcuni, devono vedere
-- solo certe pipeline. Florin: «a livello di utenza e permessi può far
-- decidere se far vedere tutte le pipeline o solo determinate pipeline…
-- potrebbe servire a diversi». Quindi è un permesso di tutti, non una
-- regola per un'azienda: nella scheda utente si spuntano le pipeline che
-- vede; nessuna spuntata = tutte (come «Aree visibili»).
--
-- La regola sta nel database, come il blocco utente: una policy RESTRICTIVE
-- su opportunità, pipeline e fasi. Così vale ovunque senza toccare le
-- schermate — kanban, elenco, ricerca, scheda contatto, report — perché le
-- funzioni che le caricano (opportunita_filtrate, opportunita_schede,
-- vendite_*, get_vendor_*) girano coi permessi di chi chiama.
--
-- Gli amministratori dell'azienda e i super admin vedono sempre tutto.

alter table public.staff_permissions
  add column if not exists pipeline_visibili uuid[] not null default '{}';

comment on column public.staff_permissions.pipeline_visibili is
  'Pipeline che l''utente vede in questa azienda. Vuoto = tutte. Applicato dalle policy «pipeline visibili» tramite pipeline_nascoste().';

-- Le pipeline che l'utente NON vede, in ogni azienda in cui ha una
-- restrizione. Le policy la chiamano come (select …): un calcolo per query,
-- non uno per riga. SECURITY DEFINER: legge staff_permissions e
-- marketing_pipelines senza passare dalle loro policy (niente ricorsione).
create or replace function public.pipeline_nascoste()
returns uuid[]
language sql
stable
security definer
set search_path to 'public'
as $$
  select coalesce(array_agg(p.id), '{}'::uuid[])
  from staff_permissions sp
  join marketing_pipelines p on p.company_id = sp.company_id
  where sp.user_id = (select auth.uid())
    and cardinality(sp.pipeline_visibili) > 0
    and not (p.id = any (sp.pipeline_visibili))
    -- Se tutte le pipeline scelte sono state cancellate, la restrizione non
    -- lascerebbe vedere più niente: in quel caso non vale.
    and exists (select 1 from marketing_pipelines v
                where v.company_id = sp.company_id and v.id = any (sp.pipeline_visibili))
    and not public.has_role((select auth.uid()), 'super_admin')
    and not (public.has_role((select auth.uid()), 'company_admin')
             and sp.company_id = public.get_user_company_id((select auth.uid())))
$$;

revoke all on function public.pipeline_nascoste() from public, anon;
grant execute on function public.pipeline_nascoste() to authenticated, service_role;

-- ── Le policy ────────────────────────────────────────────────────────────
-- Il cast ::uuid[] non è decorativo: senza, «= any ((select …))» è letto
-- come confronto con le righe di una sottoquery (uuid = uuid[], errore).
-- Col cast è l'elenco, e la sottoquery resta una sola per query.
drop policy if exists "pipeline_visibili_utente" on public.marketing_opportunities;
create policy "pipeline_visibili_utente" on public.marketing_opportunities
  as restrictive
  for all
  to authenticated
  using (pipeline_id is null or not (pipeline_id = any ((select public.pipeline_nascoste())::uuid[])))
  with check (pipeline_id is null or not (pipeline_id = any ((select public.pipeline_nascoste())::uuid[])));

drop policy if exists "pipeline_visibili_utente" on public.marketing_pipelines;
create policy "pipeline_visibili_utente" on public.marketing_pipelines
  as restrictive
  for all
  to authenticated
  using (not (id = any ((select public.pipeline_nascoste())::uuid[])))
  with check (not (id = any ((select public.pipeline_nascoste())::uuid[])));

drop policy if exists "pipeline_visibili_utente" on public.marketing_pipeline_stages;
create policy "pipeline_visibili_utente" on public.marketing_pipeline_stages
  as restrictive
  for all
  to authenticated
  using (pipeline_id is null or not (pipeline_id = any ((select public.pipeline_nascoste())::uuid[])))
  with check (pipeline_id is null or not (pipeline_id = any ((select public.pipeline_nascoste())::uuid[])));

-- ── I contatti seguiti ───────────────────────────────────────────────────
-- Chi ha «Solo elementi assegnati» vede i contatti delle opportunità che
-- segue. Un'opportunità in una pipeline che non vede non gli porta il
-- contatto: altrimenti la pipeline nascosta rientrerebbe dalla scheda contatto.
create or replace function public.contatti_seguiti_da_me()
returns setof uuid
language sql
stable
security definer
set search_path to 'public'
as $$
  with nascoste as (select public.pipeline_nascoste() as ids)
  select o.contact_id from public.marketing_opportunities o, nascoste n
   where o.assigned_to = (select auth.uid()) and o.deleted_at is null and o.contact_id is not null
     and not coalesce(o.pipeline_id = any (n.ids), false)
  union
  select o.contact_id from public.marketing_opportunities o, nascoste n
   where o.call_center_id = (select auth.uid()) and o.deleted_at is null and o.contact_id is not null
     and not coalesce(o.pipeline_id = any (n.ids), false)
  union
  select o.contact_id from public.marketing_opportunities o, nascoste n
   where o.follower_id = (select auth.uid()) and o.deleted_at is null and o.contact_id is not null
     and not coalesce(o.pipeline_id = any (n.ids), false)
  union
  select o.contact_id from public.marketing_opportunities o, nascoste n
   where o.assigned_to in (select unnest(public.membri_mie_squadre())) and o.deleted_at is null and o.contact_id is not null
     and not coalesce(o.pipeline_id = any (n.ids), false);
$$;

create or replace function public.contatto_seguito_da_me(p_contact uuid)
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $$
  select exists (
    select 1 from marketing_opportunities o
    where o.contact_id = p_contact
      and o.deleted_at is null
      and (select auth.uid()) in (o.assigned_to, o.call_center_id, o.follower_id)
      and not coalesce(o.pipeline_id = any (public.pipeline_nascoste()), false)
  );
$$;
