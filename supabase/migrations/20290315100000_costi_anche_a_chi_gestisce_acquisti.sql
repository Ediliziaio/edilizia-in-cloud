-- I costi: li legge e li registra anche chi gestisce gli acquisti, come l'app ha sempre detto (12/11/2026).
--
-- Per l'app «può vedere i costi» è `can_view_costs` OPPURE `can_manage_purchasing`
-- (usePermissions: canViewCosts). Così mostra la sezione «Uscite senza fattura», il bottone
-- «Nuova uscita» e i costi della commessa anche a chi gestisce gli acquisti. Le regole di
-- company_costs invece chiedevano il solo `can_view_costs`: il salvataggio tornava 403 e
-- l'utente vedeva «non salva». Successo il 12/11 a un'impresa: tre uscite rifiutate in due
-- minuti, a due persone d'ufficio con gli acquisti e senza «Costi».
--
-- Le tabelle vicine usano già tutte e due (fattura_ricevuta_mezzi, fattura_segna_verifica):
-- qui si allinea company_costs. Chi è in sola lettura resta fuori come prima.
set local lock_timeout = '3s';
set local statement_timeout = '30s';

drop policy if exists "Permesso costi: legge" on public.company_costs;
create policy "Permesso costi: legge" on public.company_costs
  for select to authenticated
  using (company_id in (select unnest(public.aziende_con_permesso('can_view_costs') || public.aziende_con_permesso('can_manage_purchasing'))));

drop policy if exists "Permesso costi: inserisce" on public.company_costs;
create policy "Permesso costi: inserisce" on public.company_costs
  for insert to authenticated
  with check (company_id in (select unnest(public.aziende_con_permesso('can_view_costs') || public.aziende_con_permesso('can_manage_purchasing')))
              and not public.utente_sola_lettura(company_id));

drop policy if exists "Permesso costi: modifica" on public.company_costs;
create policy "Permesso costi: modifica" on public.company_costs
  for update to authenticated
  using (company_id in (select unnest(public.aziende_con_permesso('can_view_costs') || public.aziende_con_permesso('can_manage_purchasing')))
         and not public.utente_sola_lettura(company_id))
  with check (company_id in (select unnest(public.aziende_con_permesso('can_view_costs') || public.aziende_con_permesso('can_manage_purchasing')))
              and not public.utente_sola_lettura(company_id));

drop policy if exists "Permesso costi: elimina" on public.company_costs;
create policy "Permesso costi: elimina" on public.company_costs
  for delete to authenticated
  using (company_id in (select unnest(public.aziende_con_permesso('can_view_costs') || public.aziende_con_permesso('can_manage_purchasing')))
         and not public.utente_sola_lettura(company_id));
