-- ════════════════════════════════════════════════════════════════════════════
-- Materiali per fase: validazione del tecnico, generazione, richieste d'offerta
-- ════════════════════════════════════════════════════════════════════════════
-- Segue 20281023011000_materiali_per_fase_base_dati.
--
--   materiali_fase_cambia_stato(fase, azione, nota)
--       invia_validazione  bozza → da_validare   chi modifica le commesse o valida
--       valida             da_validare → validata   solo can_validate_bom
--       rimanda            da_validare/validata → bozza, con nota
--                                                  solo can_validate_bom; non se
--                                                  ci sono materiali già in offerta
--                                                  o in un ordine
--     Registra chi e quando e manda le notifiche in campanella: a chi valida
--     quando i materiali arrivano da verificare, all'ufficio acquisti e a chi
--     li ha inviati quando sono validati, a chi li ha inviati quando tornano
--     indietro.
--
--   materiali_salva_generazione(commessa, righe, escluse, avvisi, computo)
--       scrive in un colpo solo i materiali generati dal computo e dalle
--       tavole (order_items, natura 'materiale', «da ordinare») nelle fasi
--       indicate. Sostituisce le righe generate in precedenza che non sono
--       ancora in un'offerta o in un ordine, tiene le righe inserite a mano e
--       le quantità confermate a mano. Le fasi devono essere in bozza.
--
--   acquisti_richiedi_offerta(materiali, titolo, fornitori, scadenza)
--       crea la richiesta d'offerta con i materiali scelti (di fasi validate,
--       o di fasi che non usano la validazione) e li collega.
--
--   acquisti_assegna_fornitore(materiali, fornitore)
--       l'ufficio acquisti sceglie il fornitore anche senza poter modificare
--       le commesse.
--
--   materiali_tecnico_aggiorna(materiale, quantità, specifiche)
--       il tecnico corregge quantità e specifiche mentre verifica, anche se
--       non può modificare le commesse.
--
-- Gli ordini si creano come oggi (createMaterialPurchaseOrder): righe
-- dell'ordine collegate al materiale con order_item_id, stato calcolato dalla
-- copertura (bozza, emesso, ricevuto).
--
-- Nessuna riga esistente toccata. Idempotente.
-- ════════════════════════════════════════════════════════════════════════════

SET LOCAL lock_timeout = '3s';
SET LOCAL statement_timeout = '60s';

-- ─── Notifiche a chi ha un permesso ────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.materiali_notifica_permesso(
  _company uuid, _permesso text, _titolo text, _testo text, _url text, _entita uuid)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  n integer;
begin
  if _permesso not in ('can_validate_bom', 'can_manage_purchasing') then
    raise exception 'Permesso non previsto';
  end if;
  insert into public.notifications (company_id, user_id, type, title, body, entity_type, entity_id, action_url)
  select _company, p.id, 'materiali_fase', _titolo, _testo, 'order_work_phase', _entita, _url
    from public.profiles p
   where p.company_id = _company
     and not coalesce(p.is_blocked, false)
     and p.id is distinct from auth.uid()
     and (
       exists (select 1 from public.user_roles ur where ur.user_id = p.id and ur.role = 'company_admin'::public.app_role)
       or (exists (select 1 from public.user_roles ur where ur.user_id = p.id and ur.role = 'company_staff'::public.app_role)
           and public.has_permission_for_company(p.id, _permesso, _company))
     );
  get diagnostics n = row_count;
  return n;
end;
$function$;

REVOKE ALL ON FUNCTION public.materiali_notifica_permesso(uuid, text, text, text, text, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.materiali_notifica_permesso(uuid, text, text, text, text, uuid) TO service_role;

-- Materiali di una fase già in offerta o in un ordine non annullato.
CREATE OR REPLACE FUNCTION public.materiali_fase_in_acquisto(_phase uuid)
 RETURNS integer
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select count(*)::integer
    from public.order_items oi
   where oi.phase_id = _phase
     and oi.natura_riga = 'materiale'
     and (oi.supplier_rfq_item_id is not null
          or exists (select 1 from public.purchase_order_items poi
                       join public.purchase_orders po on po.id = poi.purchase_order_id
                      where poi.order_item_id = oi.id and po.status <> 'annullato'));
$function$;

REVOKE ALL ON FUNCTION public.materiali_fase_in_acquisto(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.materiali_fase_in_acquisto(uuid) TO service_role;

-- ─── Passaggi di stato di una fase ─────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.materiali_fase_cambia_stato(p_phase uuid, p_azione text, p_nota text DEFAULT NULL)
 RETURNS public.materiali_fasi_validazione
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  fase record;
  v public.materiali_fasi_validazione;
  commessa text;
  url text;
  nota text := nullif(btrim(coalesce(p_nota, '')), '');
  materiali integer;
  in_acquisto integer;
begin
  if auth.uid() is null then
    raise exception 'Accesso richiesto' using errcode = '42501';
  end if;

  select w.id, w.name, w.order_id, w.company_id into fase from public.order_work_phases w where w.id = p_phase;
  if fase.id is null or not public.materiali_utente_in_azienda(fase.company_id) then
    raise exception 'Fase non trovata' using errcode = 'P0002';
  end if;

  perform set_config('app.materiali_transizione', 'on', true);
  insert into public.materiali_fasi_validazione (company_id, order_id, phase_id)
  values (fase.company_id, fase.order_id, fase.id)
  on conflict (phase_id) do nothing;
  select * into v from public.materiali_fasi_validazione where phase_id = p_phase for update;

  select coalesce(o.order_code, 'commessa') into commessa from public.orders o where o.id = fase.order_id;
  url := '/azienda/ordini/' || fase.order_id || '?tab=articoli&vista_materiali=articoli&fase=' || fase.id;
  select count(*) into materiali from public.order_items where phase_id = p_phase and natura_riga = 'materiale';

  if p_azione = 'invia_validazione' then
    if v.stato <> 'bozza' then
      raise exception 'Si inviano al tecnico solo i materiali di una fase in bozza' using errcode = '22023';
    end if;
    if not (public.materiali_puo('can_edit_orders', fase.company_id) or public.materiali_puo('can_validate_bom', fase.company_id)) then
      raise exception 'Non hai il permesso di preparare i materiali' using errcode = '42501';
    end if;
    if materiali = 0 then
      raise exception 'La fase non ha materiali da validare' using errcode = '22023';
    end if;
    update public.materiali_fasi_validazione
       set stato = 'da_validare', inviata_da = auth.uid(), inviata_il = now(), note_validazione = coalesce(nota, note_validazione)
     where id = v.id returning * into v;
    perform public.materiali_notifica_permesso(fase.company_id, 'can_validate_bom',
      'Materiali da validare',
      format('%s — fase «%s»: %s materiali da verificare.', commessa, fase.name, materiali), url, fase.id);

  elsif p_azione = 'valida' then
    if v.stato <> 'da_validare' then
      raise exception 'Si validano solo i materiali inviati al tecnico' using errcode = '22023';
    end if;
    if not public.materiali_puo('can_validate_bom', fase.company_id) then
      raise exception 'Solo chi valida i materiali può validarli' using errcode = '42501';
    end if;
    if exists (select 1 from public.order_items where phase_id = p_phase and natura_riga = 'materiale' and coalesce(quantity, 0) <= 0) then
      raise exception 'Ci sono materiali senza quantità: completali prima di validare' using errcode = '22023';
    end if;
    update public.materiali_fasi_validazione
       set stato = 'validata', validata_da = auth.uid(), validata_il = now(), note_validazione = nota
     where id = v.id returning * into v;
    perform public.materiali_notifica_permesso(fase.company_id, 'can_manage_purchasing',
      'Materiali validati da acquistare',
      format('%s — fase «%s»: %s materiali validati dal tecnico.', commessa, fase.name, materiali),
      '/azienda/acquisti-da-fare?commessa=' || fase.order_id, fase.id);
    if v.inviata_da is not null and v.inviata_da <> auth.uid() then
      insert into public.notifications (company_id, user_id, type, title, body, entity_type, entity_id, action_url)
      values (fase.company_id, v.inviata_da, 'materiali_fase', 'Materiali validati',
              format('%s — fase «%s»: il tecnico ha validato i materiali.', commessa, fase.name),
              'order_work_phase', fase.id, url);
    end if;

  elsif p_azione = 'rimanda' then
    if v.stato = 'bozza' then
      raise exception 'I materiali di questa fase sono già in bozza' using errcode = '22023';
    end if;
    if not public.materiali_puo('can_validate_bom', fase.company_id) then
      raise exception 'Solo chi valida i materiali può rimandarli indietro' using errcode = '42501';
    end if;
    if nota is null then
      raise exception 'Scrivi una nota: cosa va corretto' using errcode = '22023';
    end if;
    in_acquisto := public.materiali_fase_in_acquisto(p_phase);
    if in_acquisto > 0 then
      raise exception '% materiali sono già in una richiesta d''offerta o in un ordine: annulla prima quegli acquisti', in_acquisto
        using errcode = '22023';
    end if;
    update public.materiali_fasi_validazione
       set stato = 'bozza', validata_da = null, validata_il = null, note_validazione = nota
     where id = v.id returning * into v;
    if v.inviata_da is not null and v.inviata_da <> auth.uid() then
      insert into public.notifications (company_id, user_id, type, title, body, entity_type, entity_id, action_url)
      values (fase.company_id, v.inviata_da, 'materiali_fase', 'Materiali da correggere',
              format('%s — fase «%s»: %s', commessa, fase.name, nota), 'order_work_phase', fase.id, url);
    end if;

  else
    raise exception 'Azione sconosciuta: %', p_azione using errcode = '22023';
  end if;

  perform set_config('app.materiali_transizione', '', true);
  return v;
end;
$function$;

REVOKE ALL ON FUNCTION public.materiali_fase_cambia_stato(uuid, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.materiali_fase_cambia_stato(uuid, text, text) TO authenticated, service_role;

-- ─── Generazione salvata ───────────────────────────────────────────────────
-- SECURITY INVOKER: valgono RLS e trigger dell'utente (le righe di
-- order_items le scrive chi modifica le commesse).

CREATE OR REPLACE FUNCTION public.materiali_salva_generazione(
  p_order uuid, p_righe jsonb, p_escluse jsonb DEFAULT '[]'::jsonb,
  p_avvisi jsonb DEFAULT '[]'::jsonb, p_computo uuid DEFAULT NULL)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY INVOKER
 SET search_path TO 'public'
AS $function$
declare
  azienda uuid;
  fasi uuid[];
  bloccata text;
  a_mano jsonb;
  liberi uuid[];
  tenute text[];
  inserite integer;
  tolte integer;
  saltate integer;
begin
  select o.company_id into azienda from public.orders o where o.id = p_order;
  if azienda is null then
    raise exception 'Commessa non trovata' using errcode = 'P0002';
  end if;
  if jsonb_typeof(coalesce(p_righe, '[]'::jsonb)) <> 'array' then
    raise exception 'Righe non valide' using errcode = '22023';
  end if;

  select array_agg(distinct (r->>'phase_id')::uuid) filter (where r->>'phase_id' is not null)
    into fasi from jsonb_array_elements(coalesce(p_righe, '[]'::jsonb)) r;

  if exists (select 1 from jsonb_array_elements(coalesce(p_righe, '[]'::jsonb)) r
              where r->>'phase_id' is not null
                and not exists (select 1 from public.order_work_phases w where w.id = (r->>'phase_id')::uuid and w.order_id = p_order)) then
    raise exception 'Una fase indicata non è di questa commessa' using errcode = '22023';
  end if;

  select w.name into bloccata
    from public.materiali_fasi_validazione v join public.order_work_phases w on w.id = v.phase_id
   where v.order_id = p_order and v.stato <> 'bozza' and v.phase_id = any(coalesce(fasi, '{}'))
   limit 1;
  if bloccata is not null then
    raise exception 'La fase «%» è inviata al tecnico o validata: va rimessa in bozza prima di rigenerare i materiali', bloccata
      using errcode = '22023';
  end if;

  -- Le righe generate prima, ancora libere (né offerta né ordine): si
  -- sostituiscono. La quantità cambiata a mano resta, per chiave.
  select coalesce(array_agg(oi.id), '{}'),
         coalesce(jsonb_object_agg(oi.chiave_materiale, oi.quantity)
                    filter (where oi.chiave_materiale is not null
                              and oi.quantity is distinct from ceil(coalesce(oi.quantita_calcolata, oi.quantity))), '{}'::jsonb)
    into liberi, a_mano
    from public.order_items oi
   where oi.order_id = p_order
     and oi.natura_riga = 'materiale'
     and oi.origine_materiale in ('computo', 'planimetria')
     and oi.supplier_rfq_item_id is null
     and oi.status = 'da_ordinare'
     and coalesce(oi.quantity_received, 0) = 0
     and not exists (select 1 from public.purchase_order_items poi
                       join public.purchase_orders po on po.id = poi.purchase_order_id
                      where poi.order_item_id = oi.id and po.status <> 'annullato')
     and (oi.phase_id is null or not exists (
           select 1 from public.materiali_fasi_validazione v where v.phase_id = oi.phase_id and v.stato <> 'bozza'));

  -- Righe generate già in offerta o in un ordine: non si raddoppiano.
  select coalesce(array_agg(oi.chiave_materiale), '{}') into tenute
    from public.order_items oi
   where oi.order_id = p_order and oi.chiave_materiale is not null
     and oi.origine_materiale in ('computo', 'planimetria')
     and not (oi.id = any(liberi));

  delete from public.order_items where id = any(liberi);
  get diagnostics tolte = row_count;

  insert into public.order_items (
    order_id, name, description, quantity, status, natura_riga, phase_id, supplier_id, article_template_id,
    purchase_price, categoria, unita_misura, specifiche, origine_materiale, quantita_netta, quantita_calcolata,
    sfrido, origini, chiave_materiale, computo_voce_id, scomposizione_id, planimetria_documento_id, locale, position)
  select p_order,
         left(x.r->>'descrizione', 500),
         nullif(x.r->>'specifiche', ''),
         greatest(1, coalesce((a_mano->>(x.r->>'chiave'))::integer, ceil(coalesce((x.r->>'quantita_calcolata')::numeric, 0))::integer)),
         'da_ordinare', 'materiale', (x.r->>'phase_id')::uuid, (x.r->>'supplier_id')::uuid, at.id,
         coalesce(at.prezzo_acquisto_netto, at.standard_cost, 0),
         x.r->>'categoria', x.r->>'unita_misura', nullif(x.r->>'specifiche', ''),
         coalesce(x.r->>'origine', 'computo'),
         (x.r->>'quantita_netta')::numeric, (x.r->>'quantita_calcolata')::numeric, (x.r->>'sfrido')::numeric,
         coalesce(x.r->'origini', '[]'::jsonb), x.r->>'chiave',
         (x.r->>'computo_voce_id')::uuid, (x.r->>'scomposizione_id')::uuid,
         (x.r->>'planimetria_documento_id')::uuid, x.r->>'locale',
         1000 + x.n::integer
    from jsonb_array_elements(coalesce(p_righe, '[]'::jsonb)) with ordinality as x(r, n)
    left join public.article_templates at on at.id = (x.r->>'article_template_id')::uuid and at.company_id = azienda
   where coalesce((x.r->>'quantita_calcolata')::numeric, 0) > 0
     and not ((x.r->>'chiave') = any(tenute));
  get diagnostics inserite = row_count;

  saltate := jsonb_array_length(coalesce(p_righe, '[]'::jsonb)) - inserite;

  insert into public.materiali_generazioni (company_id, order_id, computo_upload_id, righe, escluse, avvisi)
  values (azienda, p_order, p_computo, inserite, coalesce(p_escluse, '[]'::jsonb), coalesce(p_avvisi, '[]'::jsonb));

  return jsonb_build_object('inserite', inserite, 'sostituite', tolte, 'saltate', saltate);
end;
$function$;

REVOKE ALL ON FUNCTION public.materiali_salva_generazione(uuid, jsonb, jsonb, jsonb, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.materiali_salva_generazione(uuid, jsonb, jsonb, jsonb, uuid) TO authenticated, service_role;

-- ─── Ufficio acquisti ──────────────────────────────────────────────────────

-- I materiali scelti, controllati: stessa azienda, natura materiale, fase
-- validata (o fase che non usa la validazione).
CREATE OR REPLACE FUNCTION public.acquisti_materiali_controllati(p_items uuid[])
 RETURNS TABLE (id uuid, order_id uuid, company_id uuid, name text, specifiche text, unita_misura text,
                quantity integer, article_template_id uuid, supplier_rfq_item_id uuid)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  aziende integer;
  trovate integer;
  azienda uuid;
begin
  if coalesce(cardinality(p_items), 0) = 0 then
    raise exception 'Seleziona almeno un materiale' using errcode = '22023';
  end if;
  select count(distinct o.company_id), count(*), min(o.company_id::text)::uuid into aziende, trovate, azienda
    from public.order_items oi join public.orders o on o.id = oi.order_id
   where oi.id = any(p_items);
  if trovate <> (select count(distinct x) from unnest(p_items) x) or aziende <> 1
     or not public.materiali_utente_in_azienda(azienda) then
    raise exception 'Materiali non trovati' using errcode = 'P0002';
  end if;
  if not (public.materiali_puo('can_manage_purchasing', azienda) or public.materiali_puo('can_edit_orders', azienda)) then
    raise exception 'Gli acquisti li fa l''ufficio acquisti (o chi modifica le commesse)' using errcode = '42501';
  end if;
  if exists (select 1 from public.order_items oi where oi.id = any(p_items) and oi.natura_riga <> 'materiale') then
    raise exception 'Solo i materiali si comprano: lavorazioni e descrizioni no' using errcode = '22023';
  end if;
  if exists (select 1 from public.order_items oi
               join public.materiali_fasi_validazione v on v.phase_id = oi.phase_id
              where oi.id = any(p_items) and v.stato <> 'validata') then
    raise exception 'Alcuni materiali sono di fasi non ancora validate dal tecnico' using errcode = '22023';
  end if;
  return query
    select oi.id, oi.order_id, o.company_id, oi.name, oi.specifiche, oi.unita_misura, oi.quantity,
           oi.article_template_id, oi.supplier_rfq_item_id
      from public.order_items oi join public.orders o on o.id = oi.order_id
     where oi.id = any(p_items)
     order by oi.order_id, oi.phase_id, oi.position;
end;
$function$;

REVOKE ALL ON FUNCTION public.acquisti_materiali_controllati(uuid[]) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.acquisti_materiali_controllati(uuid[]) TO service_role;

CREATE OR REPLACE FUNCTION public.acquisti_richiedi_offerta(
  p_items uuid[], p_titolo text, p_fornitori uuid[] DEFAULT '{}', p_scadenza date DEFAULT NULL)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  azienda uuid;
  commesse uuid[];
  rfq uuid;
  m record;
  item uuid;
  pos integer := 0;
begin
  select min(c.company_id::text)::uuid, array_agg(distinct c.order_id) into azienda, commesse
    from public.acquisti_materiali_controllati(p_items) c;

  if exists (select 1 from public.order_items oi where oi.id = any(p_items) and oi.supplier_rfq_item_id is not null) then
    raise exception 'Alcuni materiali sono già in una richiesta d''offerta' using errcode = '22023';
  end if;

  insert into public.supplier_rfqs (company_id, titolo, descrizione, order_id, scadenza_offerte, created_by)
  values (azienda, coalesce(nullif(btrim(p_titolo), ''), 'Richiesta d''offerta materiali'),
          'Materiali validati della commessa', case when cardinality(commesse) = 1 then commesse[1] end,
          p_scadenza, auth.uid())
  returning id into rfq;

  perform set_config('app.materiali_sistema', 'on', true);
  for m in select * from public.acquisti_materiali_controllati(p_items) loop
    pos := pos + 1;
    insert into public.supplier_rfq_items (rfq_id, company_id, descrizione, quantita, unita_misura, article_template_id, note, posizione)
    values (rfq, azienda, m.name, greatest(coalesce(m.quantity, 0), 1), coalesce(m.unita_misura, 'pz'), m.article_template_id, m.specifiche, pos)
    returning id into item;
    update public.order_items set supplier_rfq_item_id = item where id = m.id;
  end loop;
  perform set_config('app.materiali_sistema', '', true);

  insert into public.supplier_rfq_suppliers (rfq_id, company_id, supplier_id)
  select rfq, azienda, s.id from public.suppliers s
   where s.id = any(coalesce(p_fornitori, '{}')) and s.company_id = azienda;

  return rfq;
end;
$function$;

REVOKE ALL ON FUNCTION public.acquisti_richiedi_offerta(uuid[], text, uuid[], date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.acquisti_richiedi_offerta(uuid[], text, uuid[], date) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.acquisti_assegna_fornitore(p_items uuid[], p_fornitore uuid)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  azienda uuid;
  n integer;
begin
  select min(company_id::text)::uuid into azienda from public.acquisti_materiali_controllati(p_items);
  if p_fornitore is not null and not exists (select 1 from public.suppliers s where s.id = p_fornitore and s.company_id = azienda) then
    raise exception 'Fornitore non trovato' using errcode = '22023';
  end if;
  update public.order_items set supplier_id = p_fornitore where id = any(p_items);
  get diagnostics n = row_count;
  return n;
end;
$function$;

REVOKE ALL ON FUNCTION public.acquisti_assegna_fornitore(uuid[], uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.acquisti_assegna_fornitore(uuid[], uuid) TO authenticated, service_role;

-- Il tecnico corregge quantità e specifiche mentre verifica, anche se non
-- può modificare le commesse.
CREATE OR REPLACE FUNCTION public.materiali_tecnico_aggiorna(p_item uuid, p_quantita integer, p_specifiche text DEFAULT NULL)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  r record;
begin
  select oi.id, oi.phase_id, o.company_id, v.stato into r
    from public.order_items oi
    join public.orders o on o.id = oi.order_id
    left join public.materiali_fasi_validazione v on v.phase_id = oi.phase_id
   where oi.id = p_item and oi.natura_riga = 'materiale';
  if r.id is null or not public.materiali_utente_in_azienda(r.company_id) then
    raise exception 'Materiale non trovato' using errcode = 'P0002';
  end if;
  if not public.materiali_puo('can_validate_bom', r.company_id) then
    raise exception 'Solo chi valida i materiali' using errcode = '42501';
  end if;
  if coalesce(r.stato, 'bozza') = 'validata' then
    raise exception 'I materiali di questa fase sono validati: rimetti la fase in bozza per cambiarli' using errcode = '22023';
  end if;
  if p_quantita is null or p_quantita <= 0 then
    raise exception 'Quantità non valida' using errcode = '22023';
  end if;
  update public.order_items
     set quantity = p_quantita, specifiche = coalesce(p_specifiche, specifiche)
   where id = p_item;
end;
$function$;

REVOKE ALL ON FUNCTION public.materiali_tecnico_aggiorna(uuid, integer, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.materiali_tecnico_aggiorna(uuid, integer, text) TO authenticated, service_role;
