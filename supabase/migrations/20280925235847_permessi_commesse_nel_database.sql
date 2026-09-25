-- Permessi che il database non faceva rispettare: cancellare le commesse, la
-- loro cronologia, le bozze dei documenti fiscali, le pulizie del cestino.
--
-- Trovati il 25/09/2026 con il guardiano degli accessi, in prove annullate:
--   - delete_order_cascading (SECURITY DEFINER) controllava solo l'azienda:
--     un venditore con i soli permessi marketing e un cliente del portale
--     cancellavano una commessa di Ke Bei, con righe, attività e
--     appuntamenti. L'app mostra il pulsante solo a chi è amministratore o ha
--     «Elimina Ordini»: ora la stessa regola sta nella funzione, e con «Solo i
--     propri» si elimina solo quello che si vede.
--   - la policy dello staff su orders era FOR ALL con can_edit_orders: anche
--     la DELETE diretta passava senza «Elimina Ordini» (33 utenti).
--   - order_events (la cronologia delle commesse) era leggibile e scrivibile
--     da qualunque utente interno: un venditore senza commesse leggeva le 398
--     righe di Ke Bei. La scrivono solo i trigger SECURITY DEFINER e l'app la
--     legge solo nel dettaglio commessa: ora si legge per le commesse che si
--     vedono, e a mano non la scrive nessuno.
--   - rilascia_numero_documento cancellava una bozza di documento fiscale e
--     scalava la numerazione per chiunque fosse dell'azienda: ora serve
--     «Fatturazione» o il commercialista con scrittura, come per aprire
--     l'editor (companyRoutes: canViewBilling o commercialista).
--   - cleanup_cestino_documenti e purge_cestino_preventivi le chiama solo il
--     cron, come postgres: nessun utente deve poterle lanciare.
--   - commessa_salva controllava can_edit_orders ma non «Solo i propri»: chi
--     ha la restrizione salvava via API anche le commesse degli altri.

set local lock_timeout = '3s';

-- 1. delete_order_cascading ---------------------------------------------------
create or replace function public.delete_order_cascading(p_order_id uuid, p_company_id uuid)
 returns void
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
DECLARE
  v_company_id    UUID := public.get_my_company_id();
  v_assegnata     UUID;
  v_magazzino     UUID;
  v_invoices      BIGINT;
  v_costs         BIGINT;
  v_fiscal_docs   BIGINT;
  v_fiscal_links  BIGINT;
  v_installments  BIGINT;
  v_blockers      TEXT[] := ARRAY[]::TEXT[];
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Sessione scaduta. Accedi di nuovo.';
  END IF;
  IF p_company_id IS NULL THEN
    RAISE EXCEPTION 'Azienda obbligatoria.';
  END IF;
  IF p_company_id IS DISTINCT FROM v_company_id
     AND NOT public.has_role(auth.uid(), 'super_admin'::public.app_role) THEN
    RAISE EXCEPTION 'Azienda non valida per l''operazione.';
  END IF;

  -- Chi può: il super admin, l'amministratore dell'azienda, chi ha «Elimina
  -- Ordini». È la regola del pulsante nell'app (OrdersList, OrderDetail).
  IF NOT public.has_role(auth.uid(), 'super_admin'::public.app_role)
     AND (public.utente_bloccato()
          OR public.utente_e_cliente_esterno()
          OR NOT (p_company_id = ANY (public.aziende_con_permesso('can_delete_orders')))) THEN
    RAISE EXCEPTION 'Non hai il permesso di eliminare le commesse (chiedi all''amministratore).'
      USING ERRCODE = '42501';
  END IF;

  SELECT assigned_to, destination_warehouse_id INTO v_assegnata, v_magazzino
    FROM public.orders WHERE id = p_order_id AND company_id = p_company_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Commessa non trovata o non accessibile.';
  END IF;
  -- Con «Solo i propri» o «Solo il mio magazzino» si elimina solo quello che
  -- si vede (per amministratori e super admin can_see_order è sempre vero).
  IF NOT public.can_see_order(p_order_id, v_assegnata, v_magazzino) THEN
    RAISE EXCEPTION 'Commessa non trovata o non accessibile.';
  END IF;

  SELECT count(*) INTO v_invoices     FROM public.invoices          WHERE order_id = p_order_id;
  SELECT count(*) INTO v_costs        FROM public.company_costs     WHERE order_id = p_order_id;
  SELECT count(*) INTO v_fiscal_docs  FROM public.documenti_fiscali WHERE ordine_id = p_order_id AND deleted_at IS NULL;
  SELECT count(*) INTO v_fiscal_links FROM public.fattura_ordine    WHERE ordine_id = p_order_id;
  SELECT count(*) INTO v_installments FROM public.order_installments WHERE order_id = p_order_id;

  IF v_invoices > 0 OR v_fiscal_docs > 0 OR v_fiscal_links > 0 THEN
    v_blockers := array_append(v_blockers, 'documenti fiscali/fatture');
  END IF;
  IF v_costs > 0 THEN
    v_blockers := array_append(v_blockers, 'costi collegati');
  END IF;
  IF v_installments > 0 THEN
    v_blockers := array_append(v_blockers, 'scadenze o pagamenti');
  END IF;
  IF array_length(v_blockers, 1) > 0 THEN
    RAISE EXCEPTION 'Eliminazione bloccata: la commessa ha %. Mantienila nello storico o scollega prima i movimenti.',
      array_to_string(v_blockers, ', ');
  END IF;

  DELETE FROM public.order_item_attachments
   WHERE order_item_id IN (SELECT id FROM public.order_items WHERE order_id = p_order_id);

  DELETE FROM public.order_items         WHERE order_id = p_order_id;
  DELETE FROM public.order_status_history WHERE order_id = p_order_id;
  DELETE FROM public.order_employees     WHERE order_id = p_order_id;
  DELETE FROM public.order_external_teams WHERE order_id = p_order_id;
  DELETE FROM public.order_salespeople   WHERE order_id = p_order_id;
  DELETE FROM public.order_attachments   WHERE order_id = p_order_id;
  DELETE FROM public.order_errors        WHERE order_id = p_order_id;
  DELETE FROM public.tasks               WHERE order_id = p_order_id;
  DELETE FROM public.appointments        WHERE order_id = p_order_id;
  DELETE FROM public.order_installments  WHERE order_id = p_order_id;

  DELETE FROM public.orders WHERE id = p_order_id AND company_id = p_company_id;
END;
$function$;

-- 2. orders: la policy staff FOR ALL lasciava cancellare con la sola modifica.
--    La lettura resta a orders_lettura_authenticated (can_view_orders: chi
--    modifica vede sempre, lo garantisce permessi_modifica_segue_visibilita).
drop policy if exists "Staff can manage orders if permitted" on public.orders;

drop policy if exists "Staff inserisce commesse col permesso" on public.orders;
create policy "Staff inserisce commesse col permesso" on public.orders
  for insert to authenticated
  with check (
    (select public.has_permission((select auth.uid()), 'can_edit_orders'))
    and company_id = (select public.get_user_company_id((select auth.uid())))
    and public.can_see_order(id, assigned_to, destination_warehouse_id)
  );

drop policy if exists "Staff modifica commesse col permesso" on public.orders;
create policy "Staff modifica commesse col permesso" on public.orders
  for update to authenticated
  using (
    (select public.has_permission((select auth.uid()), 'can_edit_orders'))
    and company_id = (select public.get_user_company_id((select auth.uid())))
    and public.can_see_order(id, assigned_to, destination_warehouse_id)
  )
  with check (
    (select public.has_permission((select auth.uid()), 'can_edit_orders'))
    and company_id = (select public.get_user_company_id((select auth.uid())))
    and public.can_see_order(id, assigned_to, destination_warehouse_id)
  );

drop policy if exists "Staff elimina commesse col permesso" on public.orders;
create policy "Staff elimina commesse col permesso" on public.orders
  for delete to authenticated
  using (
    (select public.has_permission((select auth.uid()), 'can_delete_orders'))
    and company_id = (select public.get_user_company_id((select auth.uid())))
    and public.can_see_order(id, assigned_to, destination_warehouse_id)
  );

-- 3. order_events: la scrivono solo i trigger; si legge per le commesse che si
--    vedono (la sottoquery su orders applica la RLS di orders a chi legge).
drop policy if exists order_events_company_isolation on public.order_events;
drop policy if exists order_events_lettura on public.order_events;
create policy order_events_lettura on public.order_events
  for select to authenticated
  using (
    not (select public.utente_e_cliente_esterno())
    and exists (select 1 from public.orders o where o.id = order_events.order_id)
  );

-- 4. rilascia_numero_documento -------------------------------------------------
create or replace function public.rilascia_numero_documento(p_documento_id uuid)
 returns boolean
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
DECLARE
  v_doc RECORD;
  v_company_id UUID;
  v_progressivo INTEGER;
  v_tipo TEXT;
  v_anno INTEGER;
  v_rilasciato BOOLEAN := FALSE;
  v_azienda_doc UUID := (SELECT x.company_id FROM public.documenti_fiscali x WHERE x.id = p_documento_id);
BEGIN
  -- [audit sicurezza 2026-08-27] guardia anti cross-tenant
  IF v_azienda_doc IS NOT NULL
     AND NOT public.user_can_access_company(v_azienda_doc) THEN
    RAISE EXCEPTION 'accesso negato: azienda non consentita' USING ERRCODE = '42501';
  END IF;

  -- Serve «Fatturazione» o il commercialista con scrittura, come per aprire
  -- l'editor. Senza utente (service role) si passa.
  IF v_azienda_doc IS NOT NULL
     AND auth.uid() IS NOT NULL
     AND NOT public.has_role(auth.uid(), 'super_admin'::public.app_role)
     AND (public.utente_bloccato()
          OR NOT (v_azienda_doc = ANY (public.aziende_con_permesso('can_view_billing'))
                  OR public.user_can_write_accountant_company(v_azienda_doc))) THEN
    RAISE EXCEPTION 'Non hai il permesso di gestire i documenti fiscali.' USING ERRCODE = '42501';
  END IF;

  SELECT id, company_id, numero_progressivo, tipo, anno, stato
    INTO v_doc
  FROM public.documenti_fiscali
  WHERE id = p_documento_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN FALSE;
  END IF;

  IF v_doc.stato != 'bozza' THEN
    RETURN FALSE;
  END IF;

  v_company_id := v_doc.company_id;
  v_progressivo := v_doc.numero_progressivo;
  v_tipo := v_doc.tipo;
  v_anno := v_doc.anno;

  -- Decrementa solo se il progressivo del doc e' il piu' alto emesso per
  -- quel tipo/anno/azienda, e confrontando l'anno col contatore GIUSTO.
  CASE v_tipo
    WHEN 'fattura', 'fattura_pa', 'autofattura',
         'integrazione_servizi_estero', 'integrazione_beni_ue', 'integrazione_beni_extra_ue' THEN
      UPDATE public.anagrafica_azienda
      SET ultimo_numero_fattura = ultimo_numero_fattura - 1
      WHERE company_id = v_company_id
        AND anno_corrente_fattura = v_anno
        AND ultimo_numero_fattura = v_progressivo;
      IF FOUND THEN v_rilasciato := TRUE; END IF;

    WHEN 'preventivo' THEN
      UPDATE public.anagrafica_azienda
      SET ultimo_numero_preventivo = ultimo_numero_preventivo - 1
      WHERE company_id = v_company_id
        AND anno_corrente_preventivo = v_anno
        AND ultimo_numero_preventivo = v_progressivo;
      IF FOUND THEN v_rilasciato := TRUE; END IF;

    WHEN 'proforma' THEN
      UPDATE public.anagrafica_azienda
      SET ultimo_numero_proforma = ultimo_numero_proforma - 1
      WHERE company_id = v_company_id
        AND anno_corrente_proforma = v_anno
        AND ultimo_numero_proforma = v_progressivo;
      IF FOUND THEN v_rilasciato := TRUE; END IF;

    -- Nota di credito e DDT: serie continua, il generatore non le azzera a
    -- inizio anno → qui niente controllo d'anno, altrimenti dal 2027 il
    -- numero non tornerebbe mai indietro.
    WHEN 'nota_credito' THEN
      UPDATE public.anagrafica_azienda
      SET ultimo_numero_nc = ultimo_numero_nc - 1
      WHERE company_id = v_company_id
        AND ultimo_numero_nc = v_progressivo;
      IF FOUND THEN v_rilasciato := TRUE; END IF;

    WHEN 'ddt' THEN
      UPDATE public.anagrafica_azienda
      SET ultimo_numero_ddt = ultimo_numero_ddt - 1
      WHERE company_id = v_company_id
        AND ultimo_numero_ddt = v_progressivo;
      IF FOUND THEN v_rilasciato := TRUE; END IF;

    ELSE
      RETURN FALSE;
  END CASE;

  -- La bozza vuota se ne va comunque: se il numero non era l'ultimo, il buco
  -- resta ma il documento fantasma no.
  DELETE FROM public.documenti_fiscali WHERE id = p_documento_id;

  RETURN v_rilasciato;
END;
$function$;

-- 5. Pulizie del cestino: le lancia solo il cron (come postgres).
revoke all on function public.cleanup_cestino_documenti() from public, anon, authenticated;
revoke all on function public.purge_cestino_preventivi() from public, anon, authenticated;

-- 6. commessa_salva: «Solo i propri» vale anche qui. La funzione è lunga
--    (salva campi, rate, bonus, voci e venditore): si aggiunge il controllo
--    subito dopo quello del permesso, senza riscriverla.
do $patch$
declare
  v_def text := pg_catalog.pg_get_functiondef(
    'public.commessa_salva(uuid,jsonb,jsonb,jsonb,jsonb,jsonb,integer)'::pg_catalog.regprocedure);
  v_ancora constant text :=
    E'  perform public.assert_permesso(''can_edit_orders'', ''salvare una commessa'');\n';
  v_aggiunta constant text := E'  -- «Solo i propri» e «Solo il mio magazzino» valgono anche qui: la funzione\n'
    || E'  -- è SECURITY DEFINER e la RLS di orders non la guarda.\n'
    || E'  if not exists (\n'
    || E'    select 1 from public.orders o\n'
    || E'     where o.id = p_commessa\n'
    || E'       and public.can_see_order(o.id, o.assigned_to, o.destination_warehouse_id)\n'
    || E'  ) then\n'
    || E'    raise exception ''Accesso negato: questa commessa non è tra quelle che puoi vedere'' using errcode = ''42501'';\n'
    || E'  end if;\n';
  v_volte integer;
begin
  if position('public.can_see_order(o.id, o.assigned_to, o.destination_warehouse_id)' in v_def) > 0 then
    return;  -- già applicata
  end if;
  v_volte := (length(v_def) - length(replace(v_def, v_ancora, ''))) / length(v_ancora);
  if v_volte <> 1 then
    raise exception 'commessa_salva: punto di aggancio trovato % volte invece di una', v_volte;
  end if;
  execute replace(v_def, v_ancora, v_ancora || v_aggiunta);
end
$patch$;
