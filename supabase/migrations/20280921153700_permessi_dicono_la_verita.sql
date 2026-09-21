-- ════════════════════════════════════════════════════════════════════════════
-- I permessi dicono la verità: chi può aprire una pagina ci può anche lavorare
-- ════════════════════════════════════════════════════════════════════════════
--
-- PERCHÉ (21/09/2026)
-- L'app apre molte pagine a chi ha il permesso corrispondente, ma il database
-- su quelle tabelle lasciava scrivere SOLO l'amministratore. Lo staff con il
-- permesso apriva la pagina, modificava, premeva Salva e riceveva un rifiuto
-- (o, peggio, niente). Censite 35 tabelle così; qui le 17 che le pagine
-- scrivono davvero. Stessa cosa sul lato lettura in cinque punti: pagina
-- aperta dal permesso, righe visibili solo con un permesso diverso → pagina
-- vuota (5 persone su 80 avevano «Costi» senza «Previsionale»).
--
-- LA REGOLA (le stesse del progetto, non nuove):
--   · Impostazioni: la modifica ha un permesso suo, can_edit_settings_<area>
--     («Sola lettura» lo spegne). Il database accetta quello.
--   · Aree operative senza un permesso di modifica (modelli email,
--     automazioni): la modifica segue la visibilità, tranne in «Sola lettura»
--     — la decisione del 16/09 per le otto aree operative, estesa a queste due.
--   · Finanza (costi, categorie di tesoreria): per lo staff resta SOLA LETTURA,
--     com'era deciso; qui si allinea solo chi può vedere. I pulsanti di
--     modifica, nell'app, li vede solo l'amministratore.
--
-- COME: aziende_con_permesso('<permesso>') — amministratori dell'azienda,
-- amministratori multi-azienda e staff col permesso — calcolata una volta per
-- richiesta, non riga per riga. Regole separate per inserire, modificare,
-- cancellare: la lettura non si tocca (una regola FOR ALL si applicherebbe
-- anche a ogni SELECT). Le regole restrittive esistenti (utente bloccato,
-- pipeline nascoste) continuano a valere su tutto.
--
-- Idempotente: si può rieseguire. Nessun dato cambia.

do $$
declare
  -- tabella, permesso, condizione aggiuntiva ('' o 'sola_lettura'), nome breve
  voce record;
begin
  for voce in
    select * from (values
      -- Impostazioni → Personalizzazione
      ('marketing_pipelines',            'can_edit_settings_customization', '',             'personalizzazione'),
      ('marketing_pipeline_stages',      'can_edit_settings_customization', '',             'personalizzazione'),
      ('marketing_custom_fields',        'can_edit_settings_customization', '',             'personalizzazione'),
      ('marketing_custom_field_folders', 'can_edit_settings_customization', '',             'personalizzazione'),
      ('company_task_statuses',          'can_edit_settings_customization', '',             'personalizzazione'),
      -- Impostazioni → Integrazioni
      ('meta_lead_forms',                'can_edit_settings_integrations',  '',             'integrazioni'),
      -- Impostazioni → Fornitori (e chi lavora le commesse, che li crea al volo)
      ('suppliers',                      'can_edit_settings_suppliers',     '',             'fornitori'),
      -- Impostazioni → Listino & prezzi
      ('listino_prezzi',                 'can_edit_settings_pricing',       '',             'listino'),
      ('quote_clause_templates',         'can_edit_settings_pricing',       '',             'listino'),
      -- Impostazioni → Persone (team)
      ('teams',                          'can_edit_settings_people',        '',             'persone'),
      ('team_members',                   'can_edit_settings_people',        '',             'persone'),
      -- Marketing → Email: la modifica segue la visibilità
      ('email_templates',                'can_view_marketing_email',        'sola_lettura', 'email'),
      ('email_folders',                  'can_view_marketing_email',        'sola_lettura', 'email'),
      -- Automazioni: la modifica segue la visibilità (due permessi aprono l'area)
      ('automation_flows',               'can_view_automazioni',            'sola_lettura', 'automazioni'),
      ('automation_nodes',               'can_view_automazioni',            'sola_lettura', 'automazioni'),
      ('automation_connections',         'can_view_automazioni',            'sola_lettura', 'automazioni'),
      ('automation_enrollments',         'can_view_automazioni',            'sola_lettura', 'automazioni'),
      ('automation_flows',               'can_view_marketing_automations',  'sola_lettura', 'automazioni marketing'),
      ('automation_nodes',               'can_view_marketing_automations',  'sola_lettura', 'automazioni marketing'),
      ('automation_connections',         'can_view_marketing_automations',  'sola_lettura', 'automazioni marketing'),
      ('automation_enrollments',         'can_view_marketing_automations',  'sola_lettura', 'automazioni marketing')
    ) as v(tabella, permesso, extra, breve)
  loop
    execute format(
      'drop policy if exists %I on public.%I',
      'Permesso ' || voce.breve || ': inserisce', voce.tabella);
    execute format(
      'create policy %I on public.%I for insert to authenticated with check (%s)',
      'Permesso ' || voce.breve || ': inserisce', voce.tabella,
      format('company_id in (select unnest(public.aziende_con_permesso(%L)))', voce.permesso)
        || case when voce.extra = 'sola_lettura' then ' and not public.utente_sola_lettura(company_id)' else '' end);

    execute format(
      'drop policy if exists %I on public.%I',
      'Permesso ' || voce.breve || ': modifica', voce.tabella);
    execute format(
      'create policy %I on public.%I for update to authenticated using (%s) with check (%s)',
      'Permesso ' || voce.breve || ': modifica', voce.tabella,
      format('company_id in (select unnest(public.aziende_con_permesso(%L)))', voce.permesso)
        || case when voce.extra = 'sola_lettura' then ' and not public.utente_sola_lettura(company_id)' else '' end,
      format('company_id in (select unnest(public.aziende_con_permesso(%L)))', voce.permesso)
        || case when voce.extra = 'sola_lettura' then ' and not public.utente_sola_lettura(company_id)' else '' end);

    execute format(
      'drop policy if exists %I on public.%I',
      'Permesso ' || voce.breve || ': elimina', voce.tabella);
    execute format(
      'create policy %I on public.%I for delete to authenticated using (%s)',
      'Permesso ' || voce.breve || ': elimina', voce.tabella,
      format('company_id in (select unnest(public.aziende_con_permesso(%L)))', voce.permesso)
        || case when voce.extra = 'sola_lettura' then ' and not public.utente_sola_lettura(company_id)' else '' end);
  end loop;
end $$;

-- Fornitori creati al volo da una commessa o da un ordine d'acquisto: chi
-- lavora le commesse li inserisce e li corregge; cancellarli resta a chi ha
-- il permesso delle impostazioni Fornitori.
drop policy if exists "Permesso commesse: inserisce fornitori" on public.suppliers;
create policy "Permesso commesse: inserisce fornitori" on public.suppliers
  for insert to authenticated
  with check (company_id in (select unnest(public.aziende_con_permesso('can_edit_orders'))));
drop policy if exists "Permesso commesse: modifica fornitori" on public.suppliers;
create policy "Permesso commesse: modifica fornitori" on public.suppliers
  for update to authenticated
  using (company_id in (select unnest(public.aziende_con_permesso('can_edit_orders'))))
  with check (company_id in (select unnest(public.aziende_con_permesso('can_edit_orders'))));

-- ── Lettura: chi apre la pagina deve vederne il contenuto ──────────────────
-- Pipeline, fasi e campi personalizzati: la pagina delle impostazioni si apre
-- col permesso «personalizzazione», le righe si vedevano solo con quello delle
-- opportunità o delle commesse.
drop policy if exists "Permesso personalizzazione: legge" on public.marketing_pipelines;
create policy "Permesso personalizzazione: legge" on public.marketing_pipelines
  for select to authenticated
  using (company_id in (select unnest(public.aziende_con_permesso('can_view_settings_customization'))));
drop policy if exists "Permesso personalizzazione: legge" on public.marketing_pipeline_stages;
create policy "Permesso personalizzazione: legge" on public.marketing_pipeline_stages
  for select to authenticated
  using (company_id in (select unnest(public.aziende_con_permesso('can_view_settings_customization'))));
drop policy if exists "Permesso personalizzazione: legge" on public.marketing_custom_fields;
create policy "Permesso personalizzazione: legge" on public.marketing_custom_fields
  for select to authenticated
  using (company_id in (select unnest(public.aziende_con_permesso('can_view_settings_customization'))));

-- Fornitori: la pagina si apre col permesso «Fornitori», le righe si vedevano
-- solo con quello delle commesse.
drop policy if exists "Permesso fornitori: legge" on public.suppliers;
create policy "Permesso fornitori: legge" on public.suppliers
  for select to authenticated
  using (company_id in (select unnest(public.aziende_con_permesso('can_view_settings_suppliers'))));

-- Costi e categorie di tesoreria: le pagine si aprono con «Costi» e
-- «Tesoreria», le righe si vedevano solo con «Previsionale».
drop policy if exists "Permesso costi: legge" on public.company_costs;
create policy "Permesso costi: legge" on public.company_costs
  for select to authenticated
  using (company_id in (select unnest(public.aziende_con_permesso('can_view_costs'))));
drop policy if exists "Permesso tesoreria: legge" on public.treasury_categories;
create policy "Permesso tesoreria: legge" on public.treasury_categories
  for select to authenticated
  using (company_id in (select unnest(public.aziende_con_permesso('can_view_tesoreria'))));
