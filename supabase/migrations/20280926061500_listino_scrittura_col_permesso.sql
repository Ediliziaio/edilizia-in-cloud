-- Listino, prodotti, tariffe, articoli, pacchetti e listini dei fornitori: li
-- leggono tutti gli interni (i preventivi hanno bisogno dei prezzi), li
-- modifica chi ha il permesso di modificarli.
--
-- Trovato il 26/09/2026 nell'audit dei permessi: queste tabelle avevano una
-- sola policy FOR ALL «stessa azienda»: chiunque interno, venditori compresi,
-- cambiava prezzi di vendita e d'acquisto della griglia (28.683 righe), i
-- prodotti con assi e varianti, le tariffe e i costi interni, gli articoli, i
-- pacchetti e i listini dei fornitori. Pacchetti e listini fornitore non
-- escludevano nemmeno i clienti del portale. Le pagine che li modificano
-- chiedono già il permesso di modifica (isAdmin = amministratore o
-- canEditSettingsPricing negli editor del listino, delle tariffe e dei
-- margini): ora lo chiede anche il database.
--
-- Chi modifica:
--   griglia, categorie, tariffe, prodotti,
--   assi, varianti, documenti, schede linea → Listino e prezzi (modifica)
--   articoli                                → Listino (modifica), Fatturazione,
--                                             o le opportunità (componenti del
--                                             Fotovoltaico)
--   pacchetti di prodotti                   → Pacchetti o Listino (modifica)
--   listini e voci dei fornitori            → Fornitori (modifica o gestione)
--                                             o Listino (modifica)
-- L'amministratore sempre (aziende_con_permesso lo comprende), anche da
-- accesso multi-azienda attivo. Il super admin ha già le sue policy; dove non
-- le ha (articoli, pacchetti) resta il suo ramo, come prima.
--
-- Le tipologie (listino_macrocategorie) le crea già solo l'amministratore; il
-- listino_prezzi chiede già il permesso. Delle funzioni SECURITY DEFINER che
-- scrivono il listino, copia tipologia e modelli di area chiedono già
-- l'amministratore; import_article_family_template chiedeva solo di essere
-- dell'azienda: ora chiede il permesso di modificare il listino.

set local lock_timeout = '3s';

-- 1. listino_griglia ---------------------------------------------------------------
drop policy if exists lg_company on public.listino_griglia;
drop policy if exists lg_lettura on public.listino_griglia;
create policy lg_lettura on public.listino_griglia
  for select to authenticated
  using (company_id = (select public.get_my_company_id()) and not (select public.utente_e_cliente_esterno()));
drop policy if exists lg_scrittura on public.listino_griglia;
create policy lg_scrittura on public.listino_griglia
  for all to authenticated
  using (company_id = (select public.get_my_company_id()) and not (select public.utente_e_cliente_esterno())
         and company_id in (select unnest(public.aziende_con_permesso('can_edit_settings_pricing'))))
  with check (company_id = (select public.get_my_company_id()) and not (select public.utente_e_cliente_esterno())
         and company_id in (select unnest(public.aziende_con_permesso('can_edit_settings_pricing'))));

-- 2. listino_categorie ---------------------------------------------------------------
drop policy if exists lcat_company on public.listino_categorie;
drop policy if exists lcat_lettura on public.listino_categorie;
create policy lcat_lettura on public.listino_categorie
  for select to authenticated
  using (company_id = (select public.get_my_company_id()) and not (select public.utente_e_cliente_esterno()));
drop policy if exists lcat_scrittura on public.listino_categorie;
create policy lcat_scrittura on public.listino_categorie
  for all to authenticated
  using (company_id = (select public.get_my_company_id()) and not (select public.utente_e_cliente_esterno())
         and company_id in (select unnest(public.aziende_con_permesso('can_edit_settings_pricing'))))
  with check (company_id = (select public.get_my_company_id()) and not (select public.utente_e_cliente_esterno())
         and company_id in (select unnest(public.aziende_con_permesso('can_edit_settings_pricing'))));

-- 3. tariffe_aziendali -----------------------------------------------------------------
drop policy if exists ta_company on public.tariffe_aziendali;
drop policy if exists ta_lettura on public.tariffe_aziendali;
create policy ta_lettura on public.tariffe_aziendali
  for select to authenticated
  using (company_id = (select public.get_my_company_id()) and not (select public.utente_e_cliente_esterno()));
drop policy if exists ta_scrittura on public.tariffe_aziendali;
create policy ta_scrittura on public.tariffe_aziendali
  for all to authenticated
  using (company_id = (select public.get_my_company_id()) and not (select public.utente_e_cliente_esterno())
         and company_id in (select unnest(public.aziende_con_permesso('can_edit_settings_pricing'))))
  with check (company_id = (select public.get_my_company_id()) and not (select public.utente_e_cliente_esterno())
         and company_id in (select unnest(public.aziende_con_permesso('can_edit_settings_pricing'))));

-- 4. articoli_native ---------------------------------------------------------------------
drop policy if exists company_isolation on public.articoli_native;
drop policy if exists articoli_native_lettura on public.articoli_native;
create policy articoli_native_lettura on public.articoli_native
  for select to authenticated
  using (company_id = (select public.get_effective_company_id()) and not (select public.utente_e_cliente_esterno()));
drop policy if exists articoli_native_scrittura on public.articoli_native;
create policy articoli_native_scrittura on public.articoli_native
  for all to authenticated
  using (company_id = (select public.get_effective_company_id()) and not (select public.utente_e_cliente_esterno())
         and (company_id in (select unnest(public.aziende_con_uno_dei_permessi(array[
                'can_edit_settings_pricing', 'can_view_billing', 'can_edit_marketing_opportunities'])))
              or (select public.has_role((select auth.uid()), 'super_admin'::public.app_role))))
  with check (company_id = (select public.get_effective_company_id()) and not (select public.utente_e_cliente_esterno())
         and (company_id in (select unnest(public.aziende_con_uno_dei_permessi(array[
                'can_edit_settings_pricing', 'can_view_billing', 'can_edit_marketing_opportunities'])))
              or (select public.has_role((select auth.uid()), 'super_admin'::public.app_role))));

-- 5. Pacchetti di prodotti ---------------------------------------------------------------
drop policy if exists bp_company on public.bundle_prodotti;
drop policy if exists bp_lettura on public.bundle_prodotti;
create policy bp_lettura on public.bundle_prodotti
  for select to authenticated
  using (company_id = (select public.get_my_company_id()) and not (select public.utente_e_cliente_esterno()));
drop policy if exists bp_scrittura on public.bundle_prodotti;
create policy bp_scrittura on public.bundle_prodotti
  for all to authenticated
  using (company_id = (select public.get_my_company_id()) and not (select public.utente_e_cliente_esterno())
         and (company_id in (select unnest(public.aziende_con_uno_dei_permessi(array[
                'can_edit_settings_bundle', 'can_edit_settings_pricing'])))
              or (select public.has_role((select auth.uid()), 'super_admin'::public.app_role))))
  with check (company_id = (select public.get_my_company_id()) and not (select public.utente_e_cliente_esterno())
         and (company_id in (select unnest(public.aziende_con_uno_dei_permessi(array[
                'can_edit_settings_bundle', 'can_edit_settings_pricing'])))
              or (select public.has_role((select auth.uid()), 'super_admin'::public.app_role))));

drop policy if exists bv_bundle on public.bundle_voci;
drop policy if exists bv_lettura on public.bundle_voci;
create policy bv_lettura on public.bundle_voci
  for select to authenticated
  using (not (select public.utente_e_cliente_esterno())
         and bundle_id in (select b.id from public.bundle_prodotti b where b.company_id = (select public.get_my_company_id())));
drop policy if exists bv_scrittura on public.bundle_voci;
create policy bv_scrittura on public.bundle_voci
  for all to authenticated
  using (not (select public.utente_e_cliente_esterno())
         and bundle_id in (select b.id from public.bundle_prodotti b
                            where b.company_id = (select public.get_my_company_id())
                              and (b.company_id in (select unnest(public.aziende_con_uno_dei_permessi(array[
                                     'can_edit_settings_bundle', 'can_edit_settings_pricing'])))
                                   or (select public.has_role((select auth.uid()), 'super_admin'::public.app_role)))))
  with check (not (select public.utente_e_cliente_esterno())
         and bundle_id in (select b.id from public.bundle_prodotti b
                            where b.company_id = (select public.get_my_company_id())
                              and (b.company_id in (select unnest(public.aziende_con_uno_dei_permessi(array[
                                     'can_edit_settings_bundle', 'can_edit_settings_pricing'])))
                                   or (select public.has_role((select auth.uid()), 'super_admin'::public.app_role)))));

-- 6. Listini dei fornitori -------------------------------------------------------------
drop policy if exists lf_company on public.listini_fornitore;
drop policy if exists lf_lettura on public.listini_fornitore;
create policy lf_lettura on public.listini_fornitore
  for select to authenticated
  using (company_id = (select public.get_my_company_id()) and not (select public.utente_e_cliente_esterno()));
drop policy if exists lf_scrittura on public.listini_fornitore;
create policy lf_scrittura on public.listini_fornitore
  for all to authenticated
  using (company_id = (select public.get_my_company_id()) and not (select public.utente_e_cliente_esterno())
         and company_id in (select unnest(public.aziende_con_uno_dei_permessi(array[
           'can_edit_settings_suppliers', 'can_manage_suppliers', 'can_edit_settings_pricing']))))
  with check (company_id = (select public.get_my_company_id()) and not (select public.utente_e_cliente_esterno())
         and company_id in (select unnest(public.aziende_con_uno_dei_permessi(array[
           'can_edit_settings_suppliers', 'can_manage_suppliers', 'can_edit_settings_pricing']))));

drop policy if exists lfv_company on public.listino_fornitore_voci;
drop policy if exists lfv_lettura on public.listino_fornitore_voci;
create policy lfv_lettura on public.listino_fornitore_voci
  for select to authenticated
  using (company_id = (select public.get_my_company_id()) and not (select public.utente_e_cliente_esterno()));
drop policy if exists lfv_scrittura on public.listino_fornitore_voci;
create policy lfv_scrittura on public.listino_fornitore_voci
  for all to authenticated
  using (company_id = (select public.get_my_company_id()) and not (select public.utente_e_cliente_esterno())
         and company_id in (select unnest(public.aziende_con_uno_dei_permessi(array[
           'can_edit_settings_suppliers', 'can_manage_suppliers', 'can_edit_settings_pricing']))))
  with check (company_id = (select public.get_my_company_id()) and not (select public.utente_e_cliente_esterno())
         and company_id in (select unnest(public.aziende_con_uno_dei_permessi(array[
           'can_edit_settings_suppliers', 'can_manage_suppliers', 'can_edit_settings_pricing']))));

-- 7. Prodotti del listino: famiglie, assi, varianti, documenti ------------------------------
-- Lettura invariata (families_select, axes_select, axis_values_select,
-- afd_select); il super admin ha già families_/axes_/axis_values_super_admin.
drop policy if exists families_cud on public.article_families;
drop policy if exists families_scrittura on public.article_families;
create policy families_scrittura on public.article_families
  for all to authenticated
  using (company_id = (select public.get_user_company_id((select auth.uid()))) and not (select public.utente_e_cliente_esterno())
         and company_id in (select unnest(public.aziende_con_permesso('can_edit_settings_pricing'))))
  with check (company_id = (select public.get_user_company_id((select auth.uid()))) and not (select public.utente_e_cliente_esterno())
         and company_id in (select unnest(public.aziende_con_permesso('can_edit_settings_pricing'))));

drop policy if exists axes_cud on public.article_family_axes;
drop policy if exists axes_scrittura on public.article_family_axes;
create policy axes_scrittura on public.article_family_axes
  for all to authenticated
  using (company_id = (select public.get_user_company_id((select auth.uid()))) and not (select public.utente_e_cliente_esterno())
         and company_id in (select unnest(public.aziende_con_permesso('can_edit_settings_pricing'))))
  with check (company_id = (select public.get_user_company_id((select auth.uid()))) and not (select public.utente_e_cliente_esterno())
         and company_id in (select unnest(public.aziende_con_permesso('can_edit_settings_pricing'))));

drop policy if exists axis_values_cud on public.article_family_axis_values;
drop policy if exists axis_values_scrittura on public.article_family_axis_values;
create policy axis_values_scrittura on public.article_family_axis_values
  for all to authenticated
  using (company_id = (select public.get_user_company_id((select auth.uid()))) and not (select public.utente_e_cliente_esterno())
         and company_id in (select unnest(public.aziende_con_permesso('can_edit_settings_pricing'))))
  with check (company_id = (select public.get_user_company_id((select auth.uid()))) and not (select public.utente_e_cliente_esterno())
         and company_id in (select unnest(public.aziende_con_permesso('can_edit_settings_pricing'))));

-- I documenti non avevano una policy del super admin a parte: il suo ramo resta qui.
drop policy if exists afd_cud on public.article_family_documents;
drop policy if exists afd_scrittura on public.article_family_documents;
create policy afd_scrittura on public.article_family_documents
  for all to authenticated
  using ((company_id = (select public.get_user_company_id((select auth.uid()))) and not (select public.utente_e_cliente_esterno())
          and company_id in (select unnest(public.aziende_con_permesso('can_edit_settings_pricing'))))
         or (select public.has_role((select auth.uid()), 'super_admin'::public.app_role)))
  with check ((company_id = (select public.get_user_company_id((select auth.uid()))) and not (select public.utente_e_cliente_esterno())
          and company_id in (select unnest(public.aziende_con_permesso('can_edit_settings_pricing'))))
         or (select public.has_role((select auth.uid()), 'super_admin'::public.app_role)));

-- 8. Schede delle linee ------------------------------------------------------------------
drop policy if exists lsl_azienda on public.listino_schede_linea;
drop policy if exists lsl_lettura on public.listino_schede_linea;
create policy lsl_lettura on public.listino_schede_linea
  for select to authenticated
  using (company_id = (select public.get_my_company_id()) and not (select public.utente_e_cliente_esterno()));
drop policy if exists lsl_scrittura on public.listino_schede_linea;
create policy lsl_scrittura on public.listino_schede_linea
  for all to authenticated
  using (company_id = (select public.get_my_company_id()) and not (select public.utente_e_cliente_esterno())
         and company_id in (select unnest(public.aziende_con_permesso('can_edit_settings_pricing'))))
  with check (company_id = (select public.get_my_company_id()) and not (select public.utente_e_cliente_esterno())
         and company_id in (select unnest(public.aziende_con_permesso('can_edit_settings_pricing'))));

-- 9. import_article_family_template: oltre a essere dell'azienda, il permesso ------------
create or replace function pg_temp.aggiungi_controllo(p_firma text, p_segno text, p_ancora text, p_aggiunta text)
 returns void
 language plpgsql
as $function$
declare
  v_def text := pg_catalog.pg_get_functiondef(p_firma::pg_catalog.regprocedure);
  v_volte integer;
begin
  if position(p_segno in v_def) > 0 then
    return;  -- già applicata
  end if;
  v_volte := (length(v_def) - length(replace(v_def, p_ancora, ''))) / length(p_ancora);
  if v_volte <> 1 then
    raise exception '%: punto di aggancio trovato % volte invece di una', p_firma, v_volte;
  end if;
  execute replace(v_def, p_ancora, p_ancora || p_aggiunta);
end;
$function$;

select pg_temp.aggiungi_controllo(
  'public.import_article_family_template(uuid,uuid,uuid,text)', 'aziende_con_permesso(',
  E'    RAISE EXCEPTION ''not a member of company %'', p_company_id USING ERRCODE = ''42501'';\n  END IF;\n',
  E'  IF NOT public.has_role(v_user_id, ''super_admin''::app_role)\n'
  || E'     AND NOT (p_company_id = ANY (public.aziende_con_permesso(''can_edit_settings_pricing''))) THEN\n'
  || E'    RAISE EXCEPTION ''Non hai il permesso di modificare il listino.'' USING ERRCODE = ''42501'';\n'
  || E'  END IF;\n');
