-- «5 minuti di sicurezza» e ingressi: li legge anche chi ha il permesso «Sicurezza cantiere» (26/11/2026,
-- piano campo completo). Prima solo l'amministratore e chi li aveva registrati: chi gestisce la sicurezza
-- non poteva vedere le prove della formazione breve né il registro ingressi.

drop policy if exists campo_briefing_lettura on public.campo_briefing_sicurezza;
create policy campo_briefing_lettura on public.campo_briefing_sicurezza for select to authenticated
  using (public.e_amministratore_di(company_id) or created_by = (select auth.uid())
         or (company_id = public.get_my_company_id() and not private.utente_solo_campo()
             and coalesce(public.has_permission_for_company((select auth.uid()), 'can_view_sicurezza_cantiere', company_id), false)));

drop policy if exists campo_ingressi_lettura on public.campo_ingressi;
create policy campo_ingressi_lettura on public.campo_ingressi for select to authenticated
  using (public.e_amministratore_di(company_id) or registrato_da = (select auth.uid())
         or (company_id = public.get_my_company_id() and not private.utente_solo_campo()
             and coalesce(public.has_permission_for_company((select auth.uid()), 'can_view_sicurezza_cantiere', company_id), false)));
