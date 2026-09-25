-- Modelli, impostazioni e firma dei preventivi: li cambia chi ha il permesso.
--
-- Trovato il 26/09/2026 nell'audit dei permessi: queste tabelle avevano una
-- regola «stessa azienda» anche per scrivere, quindi ogni interno, venditori
-- compresi:
--   - quote_templates: cambiava i modelli dei preventivi (condizioni
--     contrattuali, termini legali, copertina). Le pagine che li modificano
--     chiedono già il permesso di modificare il listino;
--   - preventivo_impostazioni: cambiava margini minimi e target, spese
--     generali, opzioni del PDF, numerazione e prezzo finale a mano
--     (Impostazioni → Margini, col listino) e la firma dei preventivi
--     (Impostazioni → Firma elettronica, con le integrazioni);
--   - fea_configurazione: cambiava il testo del recesso B2C e le clausole
--     vessatorie che finiscono nei contratti firmati (Impostazioni → Firma
--     elettronica). Non escludeva nemmeno i clienti del portale;
--   - quote_versions: inseriva versioni di qualsiasi preventivo;
--   - quote_pdf_materials e quote_render_attachments: nessuna pagina li
--     scrive (i materiali li leggono Contenuti multimediali e il preventivo).
-- Le letture restano a ogni interno: i preventivatori leggono impostazioni e
-- modelli. Le funzioni SECURITY DEFINER (seed dei modelli, versione all'invio)
-- non passano dalla RLS.

set local lock_timeout = '3s';

-- 1. Modelli dei preventivi (la lettura resta company_members_read_templates) --------
drop policy if exists company_admin_manage_templates on public.quote_templates;
drop policy if exists quote_templates_scrittura on public.quote_templates;
create policy quote_templates_scrittura on public.quote_templates
  for all to authenticated
  using (company_id = (select public.get_user_company_id((select auth.uid()))) and not (select public.utente_e_cliente_esterno())
         and company_id in (select unnest(public.aziende_con_permesso('can_edit_settings_pricing'))))
  with check (company_id = (select public.get_user_company_id((select auth.uid()))) and not (select public.utente_e_cliente_esterno())
         and company_id in (select unnest(public.aziende_con_permesso('can_edit_settings_pricing'))));

-- 2. Impostazioni dei preventivi --------------------------------------------------------
drop policy if exists pi_company on public.preventivo_impostazioni;
drop policy if exists pi_lettura on public.preventivo_impostazioni;
create policy pi_lettura on public.preventivo_impostazioni
  for select to authenticated
  using (company_id = (select public.get_my_company_id()) and not (select public.utente_e_cliente_esterno()));
drop policy if exists pi_scrittura on public.preventivo_impostazioni;
create policy pi_scrittura on public.preventivo_impostazioni
  for all to authenticated
  using (company_id = (select public.get_my_company_id()) and not (select public.utente_e_cliente_esterno())
         and company_id in (select unnest(public.aziende_con_uno_dei_permessi(array[
           'can_edit_settings_pricing', 'can_edit_settings_integrations']))))
  with check (company_id = (select public.get_my_company_id()) and not (select public.utente_e_cliente_esterno())
         and company_id in (select unnest(public.aziende_con_uno_dei_permessi(array[
           'can_edit_settings_pricing', 'can_edit_settings_integrations']))));

-- 3. Configurazione della firma elettronica ----------------------------------------------
drop policy if exists fea_config_company on public.fea_configurazione;
drop policy if exists fea_config_lettura on public.fea_configurazione;
create policy fea_config_lettura on public.fea_configurazione
  for select to authenticated
  using (company_id = (select public.get_my_company_id()) and not (select public.utente_e_cliente_esterno()));
drop policy if exists fea_config_scrittura on public.fea_configurazione;
create policy fea_config_scrittura on public.fea_configurazione
  for all to authenticated
  using (company_id = (select public.get_my_company_id()) and not (select public.utente_e_cliente_esterno())
         and company_id in (select unnest(public.aziende_con_permesso('can_edit_settings_integrations'))))
  with check (company_id = (select public.get_my_company_id()) and not (select public.utente_e_cliente_esterno())
         and company_id in (select unnest(public.aziende_con_permesso('can_edit_settings_integrations'))));

-- 4. Versioni dei preventivi: seguono il preventivo -------------------------------------
drop policy if exists quote_versions_select on public.quote_versions;
drop policy if exists quote_versions_lettura on public.quote_versions;
create policy quote_versions_lettura on public.quote_versions
  for select to authenticated
  using (company_id = (select public.get_my_company_id()) and not (select public.utente_e_cliente_esterno())
         and exists (select 1 from public.quotes q where q.id = quote_versions.quote_id));
drop policy if exists quote_versions_insert on public.quote_versions;
drop policy if exists quote_versions_inserimento on public.quote_versions;
create policy quote_versions_inserimento on public.quote_versions
  for insert to authenticated
  with check (company_id = (select public.get_my_company_id()) and not (select public.utente_e_cliente_esterno())
              and exists (select 1 from public.quotes q
                           where q.id = quote_versions.quote_id
                             and ((select public.has_role((select auth.uid()), 'super_admin'::public.app_role))
                                  or q.company_id in (select unnest(public.aziende_con_permesso('can_edit_preventivi'))))
                             and public.check_staff_visibility((select auth.uid()), q.assigned_to)));

-- 5. Materiali PDF e allegati render: si leggono e basta ---------------------------------
drop policy if exists qpm_ins on public.quote_pdf_materials;
drop policy if exists qpm_upd on public.quote_pdf_materials;
drop policy if exists qpm_del on public.quote_pdf_materials;

drop policy if exists co_quote_render_attachments on public.quote_render_attachments;
drop policy if exists quote_render_attachments_lettura on public.quote_render_attachments;
create policy quote_render_attachments_lettura on public.quote_render_attachments
  for select to authenticated
  using (company_id = (select public.get_user_company_id((select auth.uid()))) and not (select public.utente_e_cliente_esterno()));
