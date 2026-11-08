-- Accessi degli oggetti su misura / acquisti (proposta del guardiano, 08/11/2026).
--
-- Prima si poteva, provato con utenti veri in transazioni annullate:
--   * un'azienda B scriveva una riga dentro un ODA dell'azienda A (i totali di A cambiano);
--   * con order_item_id di A su una riga propria leggeva misure e riferimento e, segnando
--     quantity_received, scriveva quantity_received e fulfillment_status della riga di A;
--   * chi ha solo can_view_orders scriveva da PostgREST ordina_comunque_* e riordino_motivo,
--     e così mandava l'ordine con misure aperte senza motivo; cambiava anche lo stato
--     dell'ordine (parziale/ricevuto con la conferma rossa non accettata);
--   * il cliente esterno e lo staff senza permessi leggevano oda_misure_da_confermare e
--     l'arrivo di un ODA senza commessa, con le righe di una bolla qualsiasi;
--   * lo staff senza permessi registrava arrivi e scriveva le misure del sopralluogo;
--   * storico misure e misure_conferma davano costo_prima/costo_dopo senza can_view_costs;
--   * commessa_aggiungi_voci guardava il permesso nell'azienda in cui si lavora, non in
--     quella della commessa.
--
-- Devono continuare a funzionare: admin e chi ha il permesso (oda_ordina_comunque, Accetto,
-- misure_conferma, arrivo_*); le funzioni DEFINER e il service role, che scrivono questi
-- campi con current_user diverso da authenticated.
-- Prima/dopo nel resoconto del guardiano.
--
-- Nessuna riga viene scritta. Rieseguirla non fa niente.
set local lock_timeout = '3s';
set local statement_timeout = '60s';
-- CREATE POLICY tiene bloccato auth fino al COMMIT: le tabelle si prendono subito, così o parte o rinuncia in 3 secondi.
lock table public.order_item_misure_storico in access exclusive mode;
lock table public.purchase_order_items, public.purchase_orders in share row exclusive mode;

-- ── La riga dell'ordine sta nell'azienda dell'ordine e della commessa ───────
create or replace function public.purchase_order_items_stessa_azienda()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  if not exists (select 1 from public.purchase_orders po
                  where po.id = new.purchase_order_id and po.company_id = new.company_id) then
    raise exception 'Ordine non accessibile' using errcode = '42501';
  end if;
  if new.order_item_id is not null and not exists (
       select 1 from public.order_items oi join public.orders o on o.id = oi.order_id
        where oi.id = new.order_item_id and o.company_id = new.company_id) then
    raise exception 'Riga della commessa non accessibile' using errcode = '42501';
  end if;
  return new;
end;
$$;
revoke all on function public.purchase_order_items_stessa_azienda() from public, anon, authenticated;

drop trigger if exists a_poi_stessa_azienda on public.purchase_order_items;
create trigger a_poi_stessa_azienda
  before insert or update of company_id, purchase_order_id, order_item_id on public.purchase_order_items
  for each row execute function public.purchase_order_items_stessa_azienda();

-- ── Riordino: il motivo lo scrive solo arrivo_riordina ──────────────────────
-- SECURITY INVOKER di proposito: current_user dice se scrive il browser.
create or replace function public.purchase_order_items_riordino_protetto()
returns trigger
language plpgsql
set search_path to 'public'
as $$
begin
  if current_user = 'authenticated'
     and new.riordino_motivo is distinct from (case when tg_op = 'UPDATE' then old.riordino_motivo end) then
    raise exception 'Il riordino si fa dall''arrivo merce' using errcode = '42501';
  end if;
  return new;
end;
$$;
revoke all on function public.purchase_order_items_riordino_protetto() from public, anon, authenticated;

drop trigger if exists a_poi_riordino_protetto on public.purchase_order_items;
create trigger a_poi_riordino_protetto
  before insert or update of riordino_motivo on public.purchase_order_items
  for each row execute function public.purchase_order_items_riordino_protetto();

-- ── Ordine: «Ordina comunque» solo dalla funzione, stato solo con un permesso ─
create or replace function public.purchase_orders_campi_protetti()
returns trigger
language plpgsql
set search_path to 'public'
as $$
begin
  if current_user <> 'authenticated' then
    return new;
  end if;
  if tg_op = 'INSERT' then
    if new.ordina_comunque_motivo is not null or new.ordina_comunque_il is not null
       or new.ordina_comunque_da is not null or new.ordina_comunque_righe is not null then
      raise exception '«Ordina comunque» si usa dal suo pulsante, con il motivo' using errcode = '42501';
    end if;
    return new;
  end if;
  if new.ordina_comunque_motivo is distinct from old.ordina_comunque_motivo
     or new.ordina_comunque_il is distinct from old.ordina_comunque_il
     or new.ordina_comunque_da is distinct from old.ordina_comunque_da
     or new.ordina_comunque_righe is distinct from old.ordina_comunque_righe then
    raise exception '«Ordina comunque» si usa dal suo pulsante, con il motivo' using errcode = '42501';
  end if;
  if new.status is distinct from old.status and not exists (
       select 1 from unnest(array['can_manage_purchasing', 'can_edit_orders', 'can_approve_orders',
                                  'can_edit_warehouse', 'can_manage_suppliers']) p
        where public.has_permission_for_company(auth.uid(), p, new.company_id)) then
    raise exception 'Non hai il permesso di cambiare lo stato dell''ordine' using errcode = '42501';
  end if;
  return new;
end;
$$;
revoke all on function public.purchase_orders_campi_protetti() from public, anon, authenticated;

drop trigger if exists a_po_campi_protetti on public.purchase_orders;
create trigger a_po_campi_protetti
  before insert or update on public.purchase_orders
  for each row execute function public.purchase_orders_campi_protetti();

-- ── Storico misure: solo chi vede le commesse, e i costi restano fuori ──────
revoke select on public.order_item_misure_storico from authenticated;
grant select (id, company_id, order_id, order_item_id, evento, survey_id, survey_element_id,
              misure_prima, misure_dopo, stato_prima, stato_dopo, creato_da, created_at)
  on public.order_item_misure_storico to authenticated;
drop policy if exists misure_storico_lettura on public.order_item_misure_storico;
create policy misure_storico_lettura on public.order_item_misure_storico
  for select to authenticated
  using (public.user_can_access_company(company_id) and public.materiali_puo('can_view_orders', company_id));

-- ── Chi può registrare l'arrivo dall'ufficio ────────────────────────────────
create or replace function public.arrivo_puo_registrare(p_company uuid, p_order uuid)
returns boolean
language sql
stable security definer
set search_path to 'public'
as $$
  select auth.uid() is not null
     and not public.utente_bloccato()
     and not public.utente_e_cliente_esterno()
     and not public.utente_sola_lettura(p_company)
     and ((public.campo_e_ufficio(p_company) and coalesce(public.ufficio_vede_commessa(p_order), false)
           and exists (select 1 from unnest(array['can_view_orders', 'can_edit_orders', 'can_view_warehouse',
                                                  'can_edit_warehouse', 'can_manage_purchasing']) x
                        where public.has_permission_for_company(auth.uid(), x, p_company)))
          or coalesce(public.campo_lavoro_su_commessa(p_order), false));
$$;
revoke all on function public.arrivo_puo_registrare(uuid, uuid) from public, anon, authenticated;

-- ── Ritocchi alle funzioni: il pezzo si cambia solo se c'è, una volta sola ──
do $migrazione$
declare
  rec record;
  def text;
begin
  for rec in select * from (values
    ('public.misure_conferma(uuid,uuid[])',
     $o$  return jsonb_build_object('confermate', v_confermate, 'gia_confermate', v_gia, 'saltate', v_saltate, 'scarti', v_scarti);$o$,
     $n$  -- Chi non vede i costi riceve gli scarti senza le cifre.
  if public.has_permission_for_company(auth.uid(), 'can_view_costs', v_azienda) is not true then
    select coalesce(jsonb_agg(e - 'costo_prima' - 'costo_dopo'), '[]'::jsonb) into v_scarti
      from jsonb_array_elements(v_scarti) e;
  end if;

  return jsonb_build_object('confermate', v_confermate, 'gia_confermate', v_gia, 'saltate', v_saltate, 'scarti', v_scarti);$n$),
    ('public.commessa_aggiungi_voci(uuid,jsonb)',
     $o$  perform public.assert_permesso('can_edit_orders', 'aggiungere articoli a una commessa');$o$,
     $n$  -- Il permesso è quello dell'azienda della commessa, non dell'azienda in cui si lavora.
  if public.has_permission_for_company(v_attore, 'can_edit_orders', v_company) is not true then
    raise exception 'Permesso mancante per aggiungere articoli a una commessa' using errcode = '42501';
  end if;$n$),
    ('public.arrivo_elenco(uuid,uuid)',
     $o$  if v_order is not null and not exists (
       select 1 from public.purchase_order_items p join public.order_items oi on oi.id = p.order_item_id
        where p.purchase_order_id = po.id and public.arrivo_puo_registrare(v_company, oi.order_id)) then$o$,
     $n$  if (v_order is null and not (public.materiali_puo('can_view_orders', v_company)
                                 or public.materiali_puo('can_manage_purchasing', v_company)))
     or (v_order is not null and not exists (
       select 1 from public.purchase_order_items p join public.order_items oi on oi.id = p.order_item_id
        where p.purchase_order_id = po.id and public.arrivo_puo_registrare(v_company, oi.order_id))) then$n$),
    ('public.arrivo_elenco(uuid,uuid)',
     $o$where r.ddt_ricezione_id = p_ddt_id and d.company_id = v_company)$o$,
     $n$where r.ddt_ricezione_id = p_ddt_id and d.company_id = v_company
         and (d.purchase_order_id = po.id or d.purchase_order_id is null))$n$),
    ('public.oda_misure_da_confermare(uuid)',
     $o$  if azienda is null or not public.user_can_access_company(azienda) then$o$,
     $n$  if azienda is null or not public.user_can_access_company(azienda)
     or not (public.materiali_puo('can_view_orders', azienda) or public.materiali_puo('can_manage_purchasing', azienda)) then$n$),
    ('public.rdo_misure_cambiate(uuid)',
     $o$  if azienda is null or not public.user_can_access_company(azienda) then$o$,
     $n$  if azienda is null or not public.user_can_access_company(azienda)
     or not (public.materiali_puo('can_view_orders', azienda) or public.materiali_puo('can_manage_purchasing', azienda)) then$n$),
    ('public.sopralluogo_puo_lavorare(uuid,boolean)',
     $o$  return not (p_scrive and public.utente_sola_lettura(v_azienda));$o$,
     $n$  -- Dall'ufficio serve un permesso: il tecnico sul campo è già passato dal controllo sopra.
  if not survey_private.field_actor() and not public.is_survey_assignee(p_survey) and not public.is_super_admin()
     and not exists (select 1 from unnest(array['can_view_sopralluoghi', 'can_edit_orders', 'can_validate_bom']) x
                      where public.has_permission_for_company(auth.uid(), x, v_azienda)) then
    return false;
  end if;
  return not (p_scrive and public.utente_sola_lettura(v_azienda));$n$)
  ) as v(firma, vecchio, nuovo) loop
    def := pg_get_functiondef(rec.firma::regprocedure);
    if position(rec.nuovo in def) > 0 then
      continue;
    end if;
    if position(rec.vecchio in def) = 0 then
      raise exception 'Pezzo non trovato in %: «%»', rec.firma, left(rec.vecchio, 60);
    end if;
    execute replace(def, rec.vecchio, rec.nuovo);
  end loop;
end
$migrazione$;
