-- Documenti fiscali (fatture, proforma, note di credito, DDT) e il loro legame
-- con le commesse: servono «Fatturazione», il commercialista con scrittura o,
-- per i DDT, il magazzino o le commesse.
--
-- Trovato il 25/09/2026 nell'audit dei permessi:
--   - documenti_fiscali aveva una sola policy FOR ALL «stessa azienda»: chi
--     era interno, venditori compresi, leggeva, modificava e cancellava ogni
--     documento fiscale;
--   - documento_crea, documento_emetti, documento_fiscale_aggiorna,
--     claim_documento_per_invio e collega_rata_fattura (SECURITY DEFINER)
--     controllavano solo l'azienda, create_ddt_from_uscita nemmeno quella
--     di un permesso: un venditore creava ed emetteva fatture;
--   - fattura_ordine guardava solo l'azienda (clienti del portale compresi).
-- Oggi i documenti fiscali li hanno solo le aziende di prova: nessun dato
-- vero è uscito, e la regola arriva prima che la fatturazione nativa si usi.
--
-- Chi legge un documento fiscale:
--   - chi ha Fatturazione, Tesoreria, Scadenzario, Prima nota, Cruscotto,
--     Controllo di gestione o Report finanziari (le pagine che li mostrano);
--   - i DDT anche chi ha il magazzino o le commesse;
--   - chi vede la commessa a cui il documento è legato (la RLS di orders) e
--     ne vede gli importi, perché la commessa mostra le sue fatture;
--   - il commercialista (policy a parte, invariate).
-- Chi li scrive: puo_gestire_documento_fiscale (Fatturazione, commercialista
-- con scrittura, per i DDT magazzino o commesse). Il servizio (senza utente)
-- passa come prima nelle funzioni che lo prevedono.

set local lock_timeout = '3s';

-- 1. Chi può gestire un documento fiscale -----------------------------------------
create or replace function public.puo_gestire_documento_fiscale(_company_id uuid, _tipo text)
 returns boolean
 language sql
 stable security definer
 set search_path to 'public'
as $function$
  select coalesce(
    auth.uid() is not null
    and _company_id is not null
    and not public.utente_bloccato()
    and not public.utente_e_cliente_esterno()
    and (
      public.has_role(auth.uid(), 'super_admin'::public.app_role)
      or _company_id = any (public.aziende_con_permesso('can_view_billing'))
      or public.user_can_write_accountant_company(_company_id)
      or (_tipo = 'ddt'
          and (_company_id = any (public.aziende_con_permesso('can_view_warehouse'))
               or _company_id = any (public.aziende_con_permesso('can_edit_orders'))))
    ),
    false);
$function$;
revoke all on function public.puo_gestire_documento_fiscale(uuid, text) from public, anon;
grant execute on function public.puo_gestire_documento_fiscale(uuid, text) to authenticated, service_role;

-- Aziende in cui l'utente ha almeno uno dei permessi (amministratore compreso).
create or replace function public.aziende_con_uno_dei_permessi(_permessi text[])
 returns uuid[]
 language plpgsql
 stable security definer
 set search_path to 'public'
as $function$
declare
  _out uuid[] := '{}';
  _p text;
begin
  if auth.uid() is null then
    return '{}';
  end if;
  foreach _p in array coalesce(_permessi, '{}') loop
    _out := _out || public.aziende_con_permesso(_p);
  end loop;
  return array(select distinct x from unnest(_out) x where x is not null);
end;
$function$;
revoke all on function public.aziende_con_uno_dei_permessi(text[]) from public, anon;
grant execute on function public.aziende_con_uno_dei_permessi(text[]) to authenticated, service_role;

-- 2. documenti_fiscali -------------------------------------------------------------
drop policy if exists company_isolation on public.documenti_fiscali;

drop policy if exists documenti_fiscali_lettura on public.documenti_fiscali;
create policy documenti_fiscali_lettura on public.documenti_fiscali
  for select to authenticated
  using (
    company_id = (select public.get_my_company_id())
    and not (select public.utente_e_cliente_esterno())
    and (
      company_id in (select unnest(public.aziende_con_uno_dei_permessi(array[
        'can_view_billing', 'can_view_tesoreria', 'can_view_scadenzario', 'can_view_prima_nota',
        'can_view_cruscotto', 'can_view_controllo_gestione', 'can_view_financial_reports'])))
      or (tipo = 'ddt'
          and company_id in (select unnest(public.aziende_con_uno_dei_permessi(array['can_view_warehouse', 'can_view_orders']))))
      or (company_id in (select unnest(public.aziende_con_permesso('can_view_order_amounts')))
          and (exists (select 1 from public.orders o where o.id = documenti_fiscali.ordine_id)
               or exists (select 1 from public.fattura_ordine fo join public.orders o on o.id = fo.ordine_id
                           where fo.fattura_id = documenti_fiscali.id)))
    )
  );

drop policy if exists documenti_fiscali_inserimento on public.documenti_fiscali;
create policy documenti_fiscali_inserimento on public.documenti_fiscali
  for insert to authenticated
  with check (
    company_id = (select public.get_my_company_id())
    and public.puo_gestire_documento_fiscale(company_id, tipo)
  );

drop policy if exists documenti_fiscali_modifica on public.documenti_fiscali;
create policy documenti_fiscali_modifica on public.documenti_fiscali
  for update to authenticated
  using (
    company_id = (select public.get_my_company_id())
    and public.puo_gestire_documento_fiscale(company_id, tipo)
  )
  with check (
    company_id = (select public.get_my_company_id())
    and public.puo_gestire_documento_fiscale(company_id, tipo)
  );

drop policy if exists documenti_fiscali_cancellazione on public.documenti_fiscali;
create policy documenti_fiscali_cancellazione on public.documenti_fiscali
  for delete to authenticated
  using (
    company_id = (select public.get_my_company_id())
    and public.puo_gestire_documento_fiscale(company_id, tipo)
  );

-- 3. fattura_ordine (legame fattura ↔ commessa) -------------------------------------
--    Niente riferimenti a documenti_fiscali qui: la policy di documenti_fiscali
--    legge fattura_ordine, e il giro inverso sarebbe una ricorsione.
drop policy if exists fattura_ordine_delete on public.fattura_ordine;
drop policy if exists fattura_ordine_insert on public.fattura_ordine;
drop policy if exists fattura_ordine_lettura_authenticated on public.fattura_ordine;
drop policy if exists fo_del on public.fattura_ordine;
drop policy if exists fo_ins on public.fattura_ordine;
drop policy if exists fo_upd on public.fattura_ordine;

drop policy if exists fattura_ordine_lettura on public.fattura_ordine;
create policy fattura_ordine_lettura on public.fattura_ordine
  for select to authenticated
  using (
    public.user_can_read_accountant_company(company_id)
    or (select public.has_role((select auth.uid()), 'super_admin'::public.app_role))
    or (company_id = (select public.get_my_company_id())
        and not (select public.utente_e_cliente_esterno())
        and (company_id in (select unnest(public.aziende_con_uno_dei_permessi(array[
               'can_view_billing', 'can_view_tesoreria', 'can_view_scadenzario', 'can_view_prima_nota',
               'can_view_cruscotto', 'can_view_controllo_gestione', 'can_view_financial_reports'])))
             or (company_id in (select unnest(public.aziende_con_permesso('can_view_order_amounts')))
                 and exists (select 1 from public.orders o where o.id = fattura_ordine.ordine_id))))
  );

drop policy if exists fattura_ordine_scrittura on public.fattura_ordine;
create policy fattura_ordine_scrittura on public.fattura_ordine
  for all to authenticated
  using (
    (select public.has_role((select auth.uid()), 'super_admin'::public.app_role))
    or (company_id = (select public.get_my_company_id())
        and public.puo_gestire_documento_fiscale(company_id, 'fattura'))
  )
  with check (
    (select public.has_role((select auth.uid()), 'super_admin'::public.app_role))
    or (company_id = (select public.get_my_company_id())
        and public.puo_gestire_documento_fiscale(company_id, 'fattura'))
  );

-- 4. Le funzioni che scrivono documenti fiscali controllano il permesso ------------
--    Si aggiunge il controllo a un punto di aggancio, senza riscriverle: sono
--    lunghe e altre sessioni le toccano. Rilanciata non lo aggiunge due volte.
create or replace function pg_temp.aggiungi_controllo(p_firma text, p_ancora text, p_aggiunta text, p_prima boolean)
 returns void
 language plpgsql
as $function$
declare
  v_def text := pg_catalog.pg_get_functiondef(p_firma::pg_catalog.regprocedure);
  v_volte integer;
begin
  if position('puo_gestire_documento_fiscale(' in v_def) > 0 then
    return;  -- già applicata
  end if;
  v_volte := (length(v_def) - length(replace(v_def, p_ancora, ''))) / length(p_ancora);
  if v_volte <> 1 then
    raise exception '%: punto di aggancio trovato % volte invece di una', p_firma, v_volte;
  end if;
  execute replace(v_def, p_ancora,
                  case when p_prima then p_aggiunta || p_ancora else p_ancora || p_aggiunta end);
end;
$function$;

select pg_temp.aggiungi_controllo(
  'public.documento_crea(uuid,jsonb)',
  E'  if v_tipo = any (c_fiscali) then\n',
  E'  if not public.puo_gestire_documento_fiscale(p_company_id, v_tipo) then\n'
  || E'    raise exception ''Non hai il permesso di creare documenti fiscali (serve «Fatturazione»).'' using errcode = ''42501'';\n'
  || E'  end if;\n\n',
  true);

select pg_temp.aggiungi_controllo(
  'public.documento_emetti(uuid)',
  E'  if public.user_can_access_company(v_doc.company_id) is not true then\n    raise exception ''Accesso negato'' using errcode = ''42501'';\n  end if;\n',
  E'  if not public.puo_gestire_documento_fiscale(v_doc.company_id, v_doc.tipo) then\n'
  || E'    raise exception ''Non hai il permesso di emettere documenti fiscali (serve «Fatturazione»).'' using errcode = ''42501'';\n'
  || E'  end if;\n',
  false);

select pg_temp.aggiungi_controllo(
  'public.documento_fiscale_aggiorna(uuid,jsonb)',
  E'  IF public.user_can_access_company(v_doc.company_id) IS NOT TRUE THEN\n    RAISE EXCEPTION ''Accesso negato'' USING ERRCODE = ''42501'';\n  END IF;\n',
  E'  IF NOT public.puo_gestire_documento_fiscale(v_doc.company_id, v_doc.tipo) THEN\n'
  || E'    RAISE EXCEPTION ''Non hai il permesso di modificare documenti fiscali (serve «Fatturazione»).'' USING ERRCODE = ''42501'';\n'
  || E'  END IF;\n',
  false);

-- Lo chiamano le funzioni dello SDI col service role (senza utente): per loro
-- non cambia niente; un utente che la chiama da sé deve poter fatturare.
select pg_temp.aggiungi_controllo(
  'public.claim_documento_per_invio(uuid)',
  E'    RAISE EXCEPTION ''accesso negato: azienda non consentita'' USING ERRCODE = ''42501'';\n  END IF;\n',
  E'  IF auth.uid() IS NOT NULL\n'
  || E'     AND EXISTS (SELECT 1 FROM public.documenti_fiscali x WHERE x.id = p_documento_id)\n'
  || E'     AND NOT public.puo_gestire_documento_fiscale(\n'
  || E'           (SELECT x.company_id FROM public.documenti_fiscali x WHERE x.id = p_documento_id),\n'
  || E'           (SELECT x.tipo FROM public.documenti_fiscali x WHERE x.id = p_documento_id)) THEN\n'
  || E'    RAISE EXCEPTION ''Non hai il permesso di inviare documenti fiscali (serve «Fatturazione»).'' USING ERRCODE = ''42501'';\n'
  || E'  END IF;\n',
  false);

select pg_temp.aggiungi_controllo(
  'public.collega_rata_fattura(uuid,uuid)',
  E'  IF d.company_id <> r.company_id THEN\n    RAISE EXCEPTION ''Accesso negato'' USING ERRCODE = ''42501'';\n  END IF;\n',
  E'  IF NOT public.puo_gestire_documento_fiscale(d.company_id, d.tipo) THEN\n'
  || E'    RAISE EXCEPTION ''Non hai il permesso di collegare le fatture (serve «Fatturazione»).'' USING ERRCODE = ''42501'';\n'
  || E'  END IF;\n',
  false);

select pg_temp.aggiungi_controllo(
  'public.create_ddt_from_uscita(uuid,jsonb)',
  E'  IF v_company_id IS NULL THEN RAISE EXCEPTION ''No company context''; END IF;\n',
  E'  IF NOT public.puo_gestire_documento_fiscale(v_company_id, ''ddt'') THEN\n'
  || E'    RAISE EXCEPTION ''Non hai il permesso di creare DDT (servono magazzino, commesse o «Fatturazione»).'' USING ERRCODE = ''42501'';\n'
  || E'  END IF;\n',
  false);
