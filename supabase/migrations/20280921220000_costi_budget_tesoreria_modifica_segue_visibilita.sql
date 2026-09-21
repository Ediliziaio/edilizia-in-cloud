-- ════════════════════════════════════════════════════════════════════════════
-- Costi, budget e tesoreria: la modifica segue la visibilità, non l'amministratore
-- ════════════════════════════════════════════════════════════════════════════
--
-- PERCHÉ (21/09/2026)
-- Il 21/09 la fase 1 aveva lasciato Costi e Tesoreria in SOLA LETTURA per lo
-- staff «com'era deciso»: era la regola letta nel codice esistente, non una
-- richiesta di Florin. Rivisto lo stesso giorno: anche qui la modifica deve
-- seguire il permesso, come per le altre 8 aree operative (ordini, magazzino,
-- clienti, ticket, giornale lavori, contatti, opportunità, preventivi) e come
-- per email e automazioni — non solo l'amministratore.
--
-- Insieme, l'audit ha trovato che «Budget per categoria» e «Categorie costi»
-- andavano nella direzione OPPOSTA: chiunque nell'azienda poteva scrivere
-- (nessun controllo, nemmeno di ruolo), pagina delle impostazioni compresa —
-- più aperto persino di quanto costi/tesoreria fossero prima. Qui si allinea
-- tutt'e quattro alla stessa regola: chi ha «Costi» (o «Tesoreria») in vista,
-- e non è in sola lettura, può anche scrivere.
--
-- Idempotente: si può rieseguire. Nessun dato cambia.

-- ── Costi (company_costs): dalla sola lettura dell'amministratore al permesso ─
drop policy if exists "Permesso costi: inserisce" on public.company_costs;
create policy "Permesso costi: inserisce" on public.company_costs
  for insert to authenticated
  with check (
    company_id in (select unnest(public.aziende_con_permesso('can_view_costs')))
    and not public.utente_sola_lettura(company_id)
  );
drop policy if exists "Permesso costi: modifica" on public.company_costs;
create policy "Permesso costi: modifica" on public.company_costs
  for update to authenticated
  using (
    company_id in (select unnest(public.aziende_con_permesso('can_view_costs')))
    and not public.utente_sola_lettura(company_id)
  )
  with check (
    company_id in (select unnest(public.aziende_con_permesso('can_view_costs')))
    and not public.utente_sola_lettura(company_id)
  );
drop policy if exists "Permesso costi: elimina" on public.company_costs;
create policy "Permesso costi: elimina" on public.company_costs
  for delete to authenticated
  using (
    company_id in (select unnest(public.aziende_con_permesso('can_view_costs')))
    and not public.utente_sola_lettura(company_id)
  );

-- ── Tesoreria (treasury_categories): stessa regola, con can_view_tesoreria ──
drop policy if exists "Permesso tesoreria: inserisce" on public.treasury_categories;
create policy "Permesso tesoreria: inserisce" on public.treasury_categories
  for insert to authenticated
  with check (
    company_id in (select unnest(public.aziende_con_permesso('can_view_tesoreria')))
    and not public.utente_sola_lettura(company_id)
  );
drop policy if exists "Permesso tesoreria: modifica" on public.treasury_categories;
create policy "Permesso tesoreria: modifica" on public.treasury_categories
  for update to authenticated
  using (
    company_id in (select unnest(public.aziende_con_permesso('can_view_tesoreria')))
    and not public.utente_sola_lettura(company_id)
  )
  with check (
    company_id in (select unnest(public.aziende_con_permesso('can_view_tesoreria')))
    and not public.utente_sola_lettura(company_id)
  );
drop policy if exists "Permesso tesoreria: elimina" on public.treasury_categories;
create policy "Permesso tesoreria: elimina" on public.treasury_categories
  for delete to authenticated
  using (
    company_id in (select unnest(public.aziende_con_permesso('can_view_tesoreria')))
    and not public.utente_sola_lettura(company_id)
  );

-- ── Budget per categoria (cost_budgets): era aperto a TUTTA l'azienda ───────
-- «Users can insert/update/delete own company budgets» lasciava scrivere
-- chiunque avesse un profilo in azienda, permessi a parte — un operaio senza
-- «Costi» poteva comunque creare budget. Si restringe alla stessa regola di
-- company_costs (can_view_costs, non sola lettura) e si allinea anche la
-- lettura, oggi aperta a chiunque: chi crea un costo deve poter vedere le
-- categorie del budget, non il contrario.
drop policy if exists "cost_budgets_lettura_authenticated" on public.cost_budgets;
create policy "Permesso costi: budget legge" on public.cost_budgets
  for select to authenticated
  using (
    company_id in (select unnest(public.aziende_con_permesso('can_view_costs')))
    or public.user_can_read_accountant_company(company_id)
  );

drop policy if exists "Users can insert own company budgets" on public.cost_budgets;
create policy "Permesso costi: budget inserisce" on public.cost_budgets
  for insert to authenticated
  with check (
    company_id in (select unnest(public.aziende_con_permesso('can_view_costs')))
    and not public.utente_sola_lettura(company_id)
  );
drop policy if exists "Users can update own company budgets" on public.cost_budgets;
create policy "Permesso costi: budget modifica" on public.cost_budgets
  for update to authenticated
  using (
    company_id in (select unnest(public.aziende_con_permesso('can_view_costs')))
    and not public.utente_sola_lettura(company_id)
  )
  with check (
    company_id in (select unnest(public.aziende_con_permesso('can_view_costs')))
    and not public.utente_sola_lettura(company_id)
  );
drop policy if exists "Users can delete own company budgets" on public.cost_budgets;
create policy "Permesso costi: budget elimina" on public.cost_budgets
  for delete to authenticated
  using (
    company_id in (select unnest(public.aziende_con_permesso('can_view_costs')))
    and not public.utente_sola_lettura(company_id)
  );

-- ── Categorie costi (cost_categories): stesso guasto, stesso rimedio ────────
-- «Users can manage own company cost categories» era un FOR ALL aperto a
-- chiunque in azienda (lettura compresa): tolto e sostituito dalle 4 regole
-- separate, come per il resto. Usata solo da CostFormDialog, useCompanyCostsData
-- e dalla pagina impostazioni — mai fuori dall'area costi. La lettura del
-- commercialista resta sulla sua policy dedicata (cost_categories_accountant_select),
-- non tocca.
drop policy if exists "Users can manage own company cost categories" on public.cost_categories;
drop policy if exists "Permesso costi: categorie legge" on public.cost_categories;
create policy "Permesso costi: categorie legge" on public.cost_categories
  for select to authenticated
  using (company_id in (select unnest(public.aziende_con_permesso('can_view_costs'))));
drop policy if exists "Permesso costi: categorie inserisce" on public.cost_categories;
create policy "Permesso costi: categorie inserisce" on public.cost_categories
  for insert to authenticated
  with check (
    company_id in (select unnest(public.aziende_con_permesso('can_view_costs')))
    and not public.utente_sola_lettura(company_id)
  );
drop policy if exists "Permesso costi: categorie modifica" on public.cost_categories;
create policy "Permesso costi: categorie modifica" on public.cost_categories
  for update to authenticated
  using (
    company_id in (select unnest(public.aziende_con_permesso('can_view_costs')))
    and not public.utente_sola_lettura(company_id)
  )
  with check (
    company_id in (select unnest(public.aziende_con_permesso('can_view_costs')))
    and not public.utente_sola_lettura(company_id)
  );
drop policy if exists "Permesso costi: categorie elimina" on public.cost_categories;
create policy "Permesso costi: categorie elimina" on public.cost_categories
  for delete to authenticated
  using (
    company_id in (select unnest(public.aziende_con_permesso('can_view_costs')))
    and not public.utente_sola_lettura(company_id)
  );
