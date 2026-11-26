-- Il subappaltatore carica i suoi documenti dall'app nel fascicolo della ditta (26/11/2026, fase 0.2).
--
-- Prima l'app li metteva in documenti_dipendenti, che la scheda della ditta in ufficio non legge (nessun
-- documento perso: in produzione erano zero). Ora vanno in subappaltatori_documenti, il fascicolo che
-- l'ufficio vede nella scheda della ditta e in Sicurezza, con gli avvisi di scadenza già attivi.
--
-- 1. Tipi nuovi: patente a crediti (obbligatoria in edilizia dal 1/10/2024) e documento d'identità.
-- 2. La ditta può scrivere SOLO nel proprio fascicolo (subappaltatori.user_id = sé) e cancellare solo ciò
--    che ha caricato lei. L'ufficio resta com'era (sub_docs_admin).
-- 3. private.documenti_ditta_visibili riconosce anche gli id di subappaltatori_sicurezza (a cui punta
--    documenti_subappaltatore), collegati alla ditta da campo_subappaltatore_id.

alter table public.subappaltatori_documenti drop constraint if exists subappaltatori_documenti_tipo_check;
alter table public.subappaltatori_documenti add constraint subappaltatori_documenti_tipo_check
  check (tipo = any (array['durc', 'visura', 'dvr', 'pos', 'soa', 'polizza_rc', 'cassa_edile', 'antimafia',
                           'iscrizione_albo', 'formazione_operai', 'patente_crediti', 'documento_identita', 'altro']));

create or replace function private.documenti_ditta_visibili(p_azienda text, p_ditta text)
returns boolean
language sql
stable security definer
set search_path to ''
as $$
  select not private.utente_solo_campo()
      or exists (select 1 from public.subappaltatori s
                 where s.company_id::text = p_azienda and s.user_id = auth.uid()
                   and (s.id::text = p_ditta
                        or exists (select 1 from public.subappaltatori_sicurezza ss
                                   where ss.id::text = p_ditta and ss.campo_subappaltatore_id = s.id)));
$$;

drop policy if exists sub_docs_propria_ditta_scrive on public.subappaltatori_documenti;
create policy sub_docs_propria_ditta_scrive on public.subappaltatori_documenti for insert to authenticated
  with check (company_id = (select public.get_my_company_id())
              and uploaded_by = (select auth.uid())
              and exists (select 1 from public.subappaltatori s
                          where s.id = subappaltatori_documenti.subappaltatore_id and s.company_id = subappaltatori_documenti.company_id and s.user_id = (select auth.uid())));

drop policy if exists sub_docs_propria_ditta_cancella on public.subappaltatori_documenti;
create policy sub_docs_propria_ditta_cancella on public.subappaltatori_documenti for delete to authenticated
  using (company_id = (select public.get_my_company_id())
         and uploaded_by = (select auth.uid())
         and exists (select 1 from public.subappaltatori s
                     where s.id = subappaltatori_documenti.subappaltatore_id and s.company_id = subappaltatori_documenti.company_id and s.user_id = (select auth.uid())));

-- Un DURC nuovo caricato dalla ditta deve superare il vecchio anche se la ditta non può modificare le
-- righe: il trigger lavora coi diritti del proprietario, sempre e solo sulla stessa ditta e sullo stesso tipo.
create or replace function public.tg_supersede_old_sub_doc()
returns trigger
language plpgsql
security definer
set search_path to ''
as $function$
BEGIN
  IF NEW.status = 'active' THEN
    UPDATE public.subappaltatori_documenti
       SET status = 'superseded', superseded_by = NEW.id, updated_at = NOW()
     WHERE company_id = NEW.company_id
       AND subappaltatore_id = NEW.subappaltatore_id
       AND tipo = NEW.tipo
       AND status = 'active'
       AND id != NEW.id;
  END IF;
  RETURN NEW;
END $function$;
revoke all on function public.tg_supersede_old_sub_doc() from public, anon;
