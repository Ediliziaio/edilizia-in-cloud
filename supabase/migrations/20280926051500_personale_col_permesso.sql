-- Personale: candidati, colloqui, moduli e fasi di selezione, documenti del
-- personale, giornate lavorate, profili attitudinali e passi di onboarding solo
-- con «Personale & HR» (o l'amministratore); festività e sedi le leggono tutti
-- gli interni (calendario, timbratura col GPS) e le scrive l'HR.
--
-- Trovato il 25/09/2026 nell'audit dei permessi: queste regole guardavano
-- l'azienda e, al più, il ruolo generico company_staff (che hanno anche i
-- venditori): chiunque interno leggeva e scriveva i CV e i colloqui dei
-- candidati, i documenti dei dipendenti, le giornate lavorate di tutti, le
-- risposte e i report dei profili attitudinali, e cambiava festività e sedi.
-- Le pagine che li usano chiedono già «Personale & HR» (/azienda/personale):
-- ora lo chiede anche il database. Oggi questi dati li hanno solo le aziende
-- di prova. Restano come sono le regole «la persona vede le sue cose»
-- (giornate, documenti) e quelle dell'amministratore e del super admin.

set local lock_timeout = '3s';

-- 1. Selezione del personale ------------------------------------------------------
drop policy if exists hr_candidati_admin on public.hr_candidati;
create policy hr_candidati_admin on public.hr_candidati
  for all to authenticated
  using (
    (select public.has_role((select auth.uid()), 'super_admin'::public.app_role))
    or (company_id = (select public.get_my_company_id())
        and not (select public.utente_e_cliente_esterno())
        and company_id in (select unnest(public.aziende_con_permesso('can_view_persone'))))
  )
  with check (
    (select public.has_role((select auth.uid()), 'super_admin'::public.app_role))
    or (company_id = (select public.get_my_company_id())
        and not (select public.utente_e_cliente_esterno())
        and company_id in (select unnest(public.aziende_con_permesso('can_view_persone'))))
  );

drop policy if exists hr_candidati_colloqui_admin on public.hr_candidati_colloqui;
create policy hr_candidati_colloqui_admin on public.hr_candidati_colloqui
  for all to authenticated
  using (
    (select public.has_role((select auth.uid()), 'super_admin'::public.app_role))
    or (company_id = (select public.get_my_company_id())
        and not (select public.utente_e_cliente_esterno())
        and company_id in (select unnest(public.aziende_con_permesso('can_view_persone'))))
  )
  with check (
    (select public.has_role((select auth.uid()), 'super_admin'::public.app_role))
    or (company_id = (select public.get_my_company_id())
        and not (select public.utente_e_cliente_esterno())
        and company_id in (select unnest(public.aziende_con_permesso('can_view_persone'))))
  );

drop policy if exists hr_candidatura_forms_admin on public.hr_candidatura_forms;
create policy hr_candidatura_forms_admin on public.hr_candidatura_forms
  for all to authenticated
  using (
    (select public.has_role((select auth.uid()), 'super_admin'::public.app_role))
    or (company_id = (select public.get_my_company_id())
        and not (select public.utente_e_cliente_esterno())
        and company_id in (select unnest(public.aziende_con_permesso('can_view_persone'))))
  )
  with check (
    (select public.has_role((select auth.uid()), 'super_admin'::public.app_role))
    or (company_id = (select public.get_my_company_id())
        and not (select public.utente_e_cliente_esterno())
        and company_id in (select unnest(public.aziende_con_permesso('can_view_persone'))))
  );

drop policy if exists hr_selezione_fasi_admin on public.hr_selezione_fasi;
create policy hr_selezione_fasi_admin on public.hr_selezione_fasi
  for all to authenticated
  using (
    (select public.has_role((select auth.uid()), 'super_admin'::public.app_role))
    or (company_id = (select public.get_my_company_id())
        and not (select public.utente_e_cliente_esterno())
        and company_id in (select unnest(public.aziende_con_permesso('can_view_persone'))))
  )
  with check (
    (select public.has_role((select auth.uid()), 'super_admin'::public.app_role))
    or (company_id = (select public.get_my_company_id())
        and not (select public.utente_e_cliente_esterno())
        and company_id in (select unnest(public.aziende_con_permesso('can_view_persone'))))
  );

-- 2. Documenti del personale (la persona vede i suoi: hr_documenti_self_read) ----
drop policy if exists hr_documenti_admin on public.hr_documenti;
create policy hr_documenti_admin on public.hr_documenti
  for all to authenticated
  using (
    (select public.has_role((select auth.uid()), 'super_admin'::public.app_role))
    or (company_id = (select public.get_my_company_id())
        and not (select public.utente_e_cliente_esterno())
        and company_id in (select unnest(public.aziende_con_permesso('can_view_persone'))))
  )
  with check (
    (select public.has_role((select auth.uid()), 'super_admin'::public.app_role))
    or (company_id = (select public.get_my_company_id())
        and not (select public.utente_e_cliente_esterno())
        and company_id in (select unnest(public.aziende_con_permesso('can_view_persone'))))
  );

-- 3. Giornate lavorate (la persona vede le sue: hr_giornate_self_read) -----------
drop policy if exists hr_giornate_own_company on public.hr_giornate;
drop policy if exists hr_giornate_hr on public.hr_giornate;
create policy hr_giornate_hr on public.hr_giornate
  for all to authenticated
  using (
    company_id = (select public.get_my_company_id())
    and not (select public.utente_e_cliente_esterno())
    and company_id in (select unnest(public.aziende_con_permesso('can_view_persone')))
  )
  with check (
    company_id = (select public.get_my_company_id())
    and not (select public.utente_e_cliente_esterno())
    and company_id in (select unnest(public.aziende_con_permesso('can_view_persone')))
  );

-- 4. Festività e sedi: le leggono tutti gli interni, le scrive l'HR -----------------
drop policy if exists hr_festivita_own_company on public.hr_festivita;
drop policy if exists hr_festivita_lettura on public.hr_festivita;
create policy hr_festivita_lettura on public.hr_festivita
  for select to authenticated
  using (
    company_id = (select public.get_my_company_id())
    and not (select public.utente_e_cliente_esterno())
  );
drop policy if exists hr_festivita_scrittura on public.hr_festivita;
create policy hr_festivita_scrittura on public.hr_festivita
  for all to authenticated
  using (
    company_id = (select public.get_my_company_id())
    and not (select public.utente_e_cliente_esterno())
    and company_id in (select unnest(public.aziende_con_permesso('can_view_persone')))
  )
  with check (
    company_id = (select public.get_my_company_id())
    and not (select public.utente_e_cliente_esterno())
    and company_id in (select unnest(public.aziende_con_permesso('can_view_persone')))
  );

drop policy if exists hr_sedi_own_company on public.hr_sedi;
drop policy if exists hr_sedi_lettura on public.hr_sedi;
create policy hr_sedi_lettura on public.hr_sedi
  for select to authenticated
  using (
    company_id = (select public.get_my_company_id())
    and not (select public.utente_e_cliente_esterno())
  );
drop policy if exists hr_sedi_scrittura on public.hr_sedi;
create policy hr_sedi_scrittura on public.hr_sedi
  for all to authenticated
  using (
    company_id = (select public.get_my_company_id())
    and not (select public.utente_e_cliente_esterno())
    and company_id in (select unnest(public.aziende_con_permesso('can_view_persone')))
  )
  with check (
    company_id = (select public.get_my_company_id())
    and not (select public.utente_e_cliente_esterno())
    and company_id in (select unnest(public.aziende_con_permesso('can_view_persone')))
  );

-- 5. Passi di onboarding: la persona vede i suoi, l'HR quelli dell'azienda ---------
drop policy if exists hr_steps_company on public.hr_onboarding_steps;
drop policy if exists hr_steps_lettura on public.hr_onboarding_steps;
create policy hr_steps_lettura on public.hr_onboarding_steps
  for select to authenticated
  using (
    exists (select 1 from public.employees e
             where e.id = hr_onboarding_steps.employee_id
               and (e.user_id = (select auth.uid())
                    or (e.company_id = (select public.get_my_company_id())
                        and not (select public.utente_e_cliente_esterno())
                        and e.company_id in (select unnest(public.aziende_con_permesso('can_view_persone'))))))
  );

-- 6. Profili attitudinali (hr_talent_*) e link pubblici: solo HR ------------------
create or replace function public.hr_talent_company_allowed(p_company_id uuid)
 returns boolean
 language sql
 stable security definer
 set search_path to 'public'
as $function$
  SELECT
    auth.uid() IS NOT NULL
    AND (
      public.is_super_admin(auth.uid())
      OR (p_company_id = public.get_my_company_id()
          AND NOT public.utente_bloccato()
          AND NOT public.utente_e_cliente_esterno()
          AND p_company_id = ANY (public.aziende_con_permesso('can_view_persone')))
    );
$function$;
