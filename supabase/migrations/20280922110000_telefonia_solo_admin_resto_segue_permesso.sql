-- ════════════════════════════════════════════════════════════════════════════
-- Telefonia solo all'amministratore; WhatsApp Bot, email e scontistica
-- seguono il permesso, come i costi
-- ════════════════════════════════════════════════════════════════════════════
--
-- PERCHÉ (21/09/2026, seguito dell'audit dello stesso giorno)
-- Cinque pagine delle impostazioni non controllavano NESSUN permesso lato
-- interfaccia. Guardando il database, non erano tutte uguali:
--
--   · WhatsApp Bot (messaging_whatsapp_config) e Dominio+Preferenze email
--     (company_email_domains, azione dentro la funzione edge
--     manage-email-domain; company_email_preferences) scrivevano solo con
--     l'amministratore — bottoni che 6-8 persone vedevano attivi e il
--     salvataggio falliva in silenzio. Scontistica (discount_rules, non
--     salespeople — quella è solo l'elenco nomi nel menu) andava all'opposto:
--     apertissima, chiunque in azienda poteva scriverci. Florin: «se l'utente
--     ha l'accesso come permesso [...] in teoria può ancora modificare e
--     creare» — stessa regola dei costi (20280921220000): chi ha il permesso
--     di VISTA, e non è in sola lettura, scrive anche (né più aperto né più
--     chiuso di così).
--
--   · Numeri di telefono (virtual_phone_numbers, sms_telnyx_numbers,
--     ai_phone_numbers_v2): qui il guasto era peggiore. Comprare un numero
--     costa un canone mensile vero; le policy si chiamavano «Admins can
--     insert/update/delete…» ma non controllavano NESSUN ruolo — company_id
--     bastava. Chiunque delle 8 persone che aprono quella pagina poteva
--     comprare o rilasciare un numero, non solo l'amministratore. Le stesse
--     funzioni edge (telnyx-proxy, telnyx-acquista-numero) non controllavano
--     il ruolo nemmeno loro — sistemate nello stesso giro, file a parte.
--     Florin: «solo chi è amministratore può farlo» — qui si RESTRINGE,
--     aggiungendo il controllo di ruolo che il nome della policy prometteva
--     e il codice non manteneva.
--
-- Idempotente: si può rieseguire. Nessun dato cambia.

-- ── Telefonia: solo l'amministratore, per davvero ───────────────────────────
-- Le 3 policy avevano già il nome giusto ma non il controllo: sostituite con
-- una versione che controlla anche has_role(...,'company_admin'). super_admin
-- resta coperto dalle sue policy ALL dedicate, già corrette.
drop policy if exists "Admins can insert company phone numbers" on public.virtual_phone_numbers;
create policy "Admins can insert company phone numbers" on public.virtual_phone_numbers
  for insert to authenticated
  with check (company_id = public.get_my_company_id() and public.has_role((select auth.uid()), 'company_admin'::app_role));

drop policy if exists "Admins can update company phone numbers" on public.virtual_phone_numbers;
create policy "Admins can update company phone numbers" on public.virtual_phone_numbers
  for update to authenticated
  using (company_id = public.get_my_company_id() and public.has_role((select auth.uid()), 'company_admin'::app_role))
  with check (company_id = public.get_my_company_id() and public.has_role((select auth.uid()), 'company_admin'::app_role));

drop policy if exists "Admins can delete company phone numbers" on public.virtual_phone_numbers;
create policy "Admins can delete company phone numbers" on public.virtual_phone_numbers
  for delete to authenticated
  using (company_id = public.get_my_company_id() and public.has_role((select auth.uid()), 'company_admin'::app_role));

drop policy if exists "sms_telnyx_numbers_insert" on public.sms_telnyx_numbers;
create policy "sms_telnyx_numbers_insert" on public.sms_telnyx_numbers
  for insert to authenticated
  with check (
    public.has_role((select auth.uid()), 'company_admin'::app_role)
    and company_id in (
      select profiles.company_id from public.profiles where profiles.id = (select auth.uid())
      union
      select multi_company_access.company_id from public.multi_company_access where multi_company_access.user_id = (select auth.uid())
    )
  );

drop policy if exists "sms_telnyx_numbers_update" on public.sms_telnyx_numbers;
create policy "sms_telnyx_numbers_update" on public.sms_telnyx_numbers
  for update to authenticated
  using (
    public.has_role((select auth.uid()), 'company_admin'::app_role)
    and company_id in (
      select profiles.company_id from public.profiles where profiles.id = (select auth.uid())
      union
      select multi_company_access.company_id from public.multi_company_access where multi_company_access.user_id = (select auth.uid())
    )
  );

-- ai_phone_numbers_v2 (i numeri usati dagli agenti vocali AI, importati da
-- qui): stessa correzione. La lettura resta a chiunque veda la pagina.
drop policy if exists "phone_v2_company_isolation" on public.ai_phone_numbers_v2;
create policy "phone_v2_company_isolation_legge" on public.ai_phone_numbers_v2
  for select to authenticated
  using (company_id = public.get_my_company_id());
create policy "phone_v2_company_isolation_scrive" on public.ai_phone_numbers_v2
  for all to authenticated
  using (company_id = public.get_my_company_id() and public.has_role((select auth.uid()), 'company_admin'::app_role))
  with check (company_id = public.get_my_company_id() and public.has_role((select auth.uid()), 'company_admin'::app_role));

-- ── WhatsApp Bot, email, scontistica: la modifica segue il permesso ────────
drop policy if exists "Permesso integrazioni: whatsapp bot inserisce" on public.messaging_whatsapp_config;
create policy "Permesso integrazioni: whatsapp bot inserisce" on public.messaging_whatsapp_config
  for insert to authenticated
  with check (
    company_id in (select unnest(public.aziende_con_permesso('can_view_settings_integrations')))
    and not public.utente_sola_lettura(company_id)
  );
drop policy if exists "Permesso integrazioni: whatsapp bot modifica" on public.messaging_whatsapp_config;
create policy "Permesso integrazioni: whatsapp bot modifica" on public.messaging_whatsapp_config
  for update to authenticated
  using (
    company_id in (select unnest(public.aziende_con_permesso('can_view_settings_integrations')))
    and not public.utente_sola_lettura(company_id)
  )
  with check (
    company_id in (select unnest(public.aziende_con_permesso('can_view_settings_integrations')))
    and not public.utente_sola_lettura(company_id)
  );
drop policy if exists "Permesso integrazioni: whatsapp bot elimina" on public.messaging_whatsapp_config;
create policy "Permesso integrazioni: whatsapp bot elimina" on public.messaging_whatsapp_config
  for delete to authenticated
  using (
    company_id in (select unnest(public.aziende_con_permesso('can_view_settings_integrations')))
    and not public.utente_sola_lettura(company_id)
  );

drop policy if exists "Permesso email: dominio inserisce" on public.company_email_domains;
create policy "Permesso email: dominio inserisce" on public.company_email_domains
  for insert to authenticated
  with check (
    company_id in (select unnest(public.aziende_con_permesso('can_view_marketing_email')))
    and not public.utente_sola_lettura(company_id)
  );
drop policy if exists "Permesso email: dominio modifica" on public.company_email_domains;
create policy "Permesso email: dominio modifica" on public.company_email_domains
  for update to authenticated
  using (
    company_id in (select unnest(public.aziende_con_permesso('can_view_marketing_email')))
    and not public.utente_sola_lettura(company_id)
  )
  with check (
    company_id in (select unnest(public.aziende_con_permesso('can_view_marketing_email')))
    and not public.utente_sola_lettura(company_id)
  );
drop policy if exists "Permesso email: dominio elimina" on public.company_email_domains;
create policy "Permesso email: dominio elimina" on public.company_email_domains
  for delete to authenticated
  using (
    company_id in (select unnest(public.aziende_con_permesso('can_view_marketing_email')))
    and not public.utente_sola_lettura(company_id)
  );

drop policy if exists "Permesso email: preferenze inserisce" on public.company_email_preferences;
create policy "Permesso email: preferenze inserisce" on public.company_email_preferences
  for insert to authenticated
  with check (
    company_id in (select unnest(public.aziende_con_permesso('can_view_marketing_email')))
    and not public.utente_sola_lettura(company_id)
  );
drop policy if exists "Permesso email: preferenze modifica" on public.company_email_preferences;
create policy "Permesso email: preferenze modifica" on public.company_email_preferences
  for update to authenticated
  using (
    company_id in (select unnest(public.aziende_con_permesso('can_view_marketing_email')))
    and not public.utente_sola_lettura(company_id)
  )
  with check (
    company_id in (select unnest(public.aziende_con_permesso('can_view_marketing_email')))
    and not public.utente_sola_lettura(company_id)
  );
drop policy if exists "Permesso email: preferenze elimina" on public.company_email_preferences;
create policy "Permesso email: preferenze elimina" on public.company_email_preferences
  for delete to authenticated
  using (
    company_id in (select unnest(public.aziende_con_permesso('can_view_marketing_email')))
    and not public.utente_sola_lettura(company_id)
  );

-- Scontistica scrive davvero su discount_rules (src/hooks/useDiscountRules.ts):
-- «salespeople» in quella pagina è solo la lista dei nomi nel menu a tendina,
-- in sola lettura. discount_rules era una policy sola, aperta a chiunque
-- avesse un profilo in azienda (user_can_access_company), permessi a parte —
-- va ristretta a chi ha «Scontistica» in vista, non lasciata come sta.
drop policy if exists "discount_rules_company_access" on public.discount_rules;
drop policy if exists "Permesso scontistica: legge" on public.discount_rules;
create policy "Permesso scontistica: legge" on public.discount_rules
  for select to authenticated
  using (company_id in (select unnest(public.aziende_con_permesso('can_view_settings_scontistica'))));
drop policy if exists "Permesso scontistica: inserisce" on public.discount_rules;
create policy "Permesso scontistica: inserisce" on public.discount_rules
  for insert to authenticated
  with check (
    company_id in (select unnest(public.aziende_con_permesso('can_view_settings_scontistica')))
    and not public.utente_sola_lettura(company_id)
  );
drop policy if exists "Permesso scontistica: modifica" on public.discount_rules;
create policy "Permesso scontistica: modifica" on public.discount_rules
  for update to authenticated
  using (
    company_id in (select unnest(public.aziende_con_permesso('can_view_settings_scontistica')))
    and not public.utente_sola_lettura(company_id)
  )
  with check (
    company_id in (select unnest(public.aziende_con_permesso('can_view_settings_scontistica')))
    and not public.utente_sola_lettura(company_id)
  );
drop policy if exists "Permesso scontistica: elimina" on public.discount_rules;
create policy "Permesso scontistica: elimina" on public.discount_rules
  for delete to authenticated
  using (
    company_id in (select unnest(public.aziende_con_permesso('can_view_settings_scontistica')))
    and not public.utente_sola_lettura(company_id)
  );
