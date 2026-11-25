-- I dati che il dipendente vede di sé stesso non passano più dalla tabella employees.
--
-- Dal 12/11/2026 su public.employees c'è una regola restrittiva (office_financial_select)
-- che apre la tabella grezza solo a chi ha costi + persone. Ogni regola che riconosceva
-- «questa riga è mia» con una sottoquery su employees è morta insieme a quella lettura:
-- la sottoquery dentro una policy rispetta l'RLS di employees. Risultato visto il
-- 25/11/2026: un operaio con 24 cedolini consegnati ne vedeva zero, e lo stesso valeva
-- per assenze, note spese, allegati e passi di onboarding.
--
-- La correzione non tocca la regola restrittiva: sposta il riconoscimento della propria
-- scheda dentro due funzioni SECURITY DEFINER, che leggono employees per conto della
-- regola senza aprirla a chi la interroga.

create or replace function public.e_mia_scheda_dipendente(p_employee uuid)
returns boolean language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.employees e
     where e.id = p_employee and e.user_id = (select auth.uid())
  )
$$;
comment on function public.e_mia_scheda_dipendente(uuid) is
 'La scheda dipendente indicata è dell''utente collegato. Serve alle policy che davano al dipendente i propri dati: senza definer la regola restrittiva su employees le svuota.';
revoke all on function public.e_mia_scheda_dipendente(uuid) from public, anon;
grant execute on function public.e_mia_scheda_dipendente(uuid) to authenticated;

create or replace function public.azienda_della_scheda_dipendente(p_employee uuid)
returns uuid language sql stable security definer set search_path = ''
as $$
  select e.company_id from public.employees e where e.id = p_employee
$$;
comment on function public.azienda_della_scheda_dipendente(uuid) is
 'Azienda di una scheda dipendente, per le policy che confrontano l''azienda senza poter leggere employees.';
revoke all on function public.azienda_della_scheda_dipendente(uuid) from public, anon;
grant execute on function public.azienda_della_scheda_dipendente(uuid) to authenticated;

-- Cedolini: il dipendente vede i propri, consegnati.
drop policy if exists cedolini_select_own on public.hr_cedolini;
create policy cedolini_select_own on public.hr_cedolini for select
 using (stato <> 'bozza' and public.e_mia_scheda_dipendente(employee_id));

drop policy if exists cedolini_self_read_via_employee on public.cedolini_legacy;
create policy cedolini_self_read_via_employee on public.cedolini_legacy for select to authenticated
 using (public.e_mia_scheda_dipendente(employee_id));

-- Assenze, note spese, giornate di lavoro: le proprie.
drop policy if exists hr_assenze_self_read on public.hr_assenze;
create policy hr_assenze_self_read on public.hr_assenze for select to authenticated
 using (public.e_mia_scheda_dipendente(employee_id));

drop policy if exists "Employees can manage their own work logs" on public.work_logs;
create policy "Employees can manage their own work logs" on public.work_logs for all
 using (public.e_mia_scheda_dipendente(employee_id))
 with check (public.e_mia_scheda_dipendente(employee_id));

drop policy if exists expense_reports_self_or_admin on public.expense_reports;
create policy expense_reports_self_or_admin on public.expense_reports for all to authenticated
 using (
   company_id = public.get_my_company_id() and (
     (select public.e_amministratore_di(public.get_my_company_id()))
     or public.has_role((select auth.uid()), 'super_admin'::public.app_role)
     or public.has_role((select auth.uid()), 'accountant'::public.app_role)
     or public.e_mia_scheda_dipendente(employee_id)))
 with check (
   company_id = public.get_my_company_id() and (
     (select public.e_amministratore_di(public.get_my_company_id()))
     or public.has_role((select auth.uid()), 'super_admin'::public.app_role)
     or public.e_mia_scheda_dipendente(employee_id)));

-- Ferie e monte ore: il ramo «è mia» valeva solo per chi legge employees.
drop policy if exists employee_own_leave_select on public.leave_requests;
create policy employee_own_leave_select on public.leave_requests for select
 using (public.e_mia_scheda_dipendente(employee_id) or company_id = public.get_my_company_id());

drop policy if exists employee_update_leave on public.leave_requests;
create policy employee_update_leave on public.leave_requests for update
 using ((public.e_mia_scheda_dipendente(employee_id) and status = 'pending')
        or company_id = public.get_my_company_id());

drop policy if exists leave_balances_read on public.leave_balances;
create policy leave_balances_read on public.leave_balances for select
 using (public.e_mia_scheda_dipendente(employee_id) or company_id = public.get_my_company_id());

-- Allegati e onboarding: i propri, oppure quelli dell'azienda a chi ha il permesso.
drop policy if exists employee_attachments_lettura_public on public.employee_attachments;
create policy employee_attachments_lettura_public on public.employee_attachments for select
 using (
   public.e_mia_scheda_dipendente(employee_id)
   or (public.has_permission((select auth.uid()), 'can_view_employees')
       and public.azienda_della_scheda_dipendente(employee_id)
           = public.get_user_company_id((select auth.uid()))));

drop policy if exists hr_steps_lettura on public.hr_onboarding_steps;
create policy hr_steps_lettura on public.hr_onboarding_steps for select to authenticated
 using (
   public.e_mia_scheda_dipendente(employee_id)
   or (public.azienda_della_scheda_dipendente(employee_id) = (select public.get_my_company_id())
       and not (select public.utente_e_cliente_esterno())
       and public.azienda_della_scheda_dipendente(employee_id)
           = any (public.aziende_con_permesso('can_view_persone'))));

-- La vista dei cedolini prendeva il nome da employees: senza diritti ufficio il join
-- restituiva una riga senza nome. Passa dalla proiezione, che lascia i nomi e toglie
-- le retribuzioni.
create or replace view public.cedolini with (security_invoker = true, security_barrier = true) as
 select c.id, c.company_id, c.employee_id,
        btrim((coalesce(e.first_name, '') || ' ') || coalesce(e.last_name, '')) as employee_name,
        c.mese, c.anno, c.lordo, c.contributi_dipendente, c.contributi_datore,
        c.ritenute_irpef, c.netto, c.stato, c.note, c.created_at, c.pdf_url,
        c.data_emissione, c.data_pagamento, c.documento_id
   from public.hr_cedolini c
   left join public.employees_visibili e on e.id = c.employee_id;
