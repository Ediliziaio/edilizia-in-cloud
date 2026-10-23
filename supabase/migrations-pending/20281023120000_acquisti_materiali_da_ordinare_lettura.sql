-- ════════════════════════════════════════════════════════════════════════════
-- Ufficio acquisti: lettura dei materiali validati senza aprire le commesse
-- ════════════════════════════════════════════════════════════════════════════
-- Segue 20281023011000 e 20281023012000 (materiali per fase).
--
-- Il permesso «Ufficio acquisti» (staff_permissions.can_manage_purchasing)
-- promette di vedere i materiali validati di tutte le commesse. La scheda
-- Commesse › Acquisti li leggeva però direttamente da order_items, orders e
-- order_work_phases, le cui regole chiedono il permesso sulle commesse
-- (can_view_orders): chi aveva solo l'ufficio acquisti vedeva la colonna
-- «Da ordinare» vuota.
--
-- Invece di allargare le regole delle tre tabelle (che esporrebbero tutta la
-- commessa: prezzi di vendita, margini, cliente), una funzione dedicata
-- restituisce esattamente i campi che la pipeline usa:
--
--   acquisti_materiali_da_ordinare(azienda)
--     le righe order_items di natura «materiale» nelle fasi validate dal
--     tecnico (comprese quelle già in offerta o in un ordine: restano in fasi
--     validate), più il codice della commessa, il nome e l'ordine della fase
--     e la richiesta d'offerta collegata. Niente prezzo di vendita, sconti,
--     margini, cliente o descrizione della commessa: solo il costo
--     d'acquisto, che l'ufficio acquisti vede già negli ordini ai fornitori.
--
-- Chi la usa:
--   - l'azienda deve essere quella in cui si lavora (get_effective_company_id:
--     azienda propria, accesso multi-azienda attivo e non scaduto, o
--     impersonazione del super admin); il super admin anche le altre;
--   - serve can_manage_purchasing o can_view_orders in quell'azienda
--     (gli amministratori li hanno tutti): senza, zero righe;
--   - utente bloccato e cliente esterno: zero righe;
--   - la visibilità delle commesse resta quella di oggi (can_see_order:
--     «solo le commesse assegnate», «solo il mio magazzino»);
--   - commesse nel cestino escluse.
-- Sola lettura: nessuna regola delle tabelle cambia, nessuna riga scritta.
-- Idempotente.
-- ════════════════════════════════════════════════════════════════════════════

SET LOCAL lock_timeout = '3s';
SET LOCAL statement_timeout = '60s';

CREATE OR REPLACE FUNCTION public.acquisti_materiali_da_ordinare(p_company uuid)
 RETURNS TABLE (
   id uuid,
   order_id uuid,
   name text,
   description text,
   quantity integer,
   status text,
   supplier_id uuid,
   purchase_price numeric,
   vat_rate numeric,
   phase_id uuid,
   unita_misura text,
   specifiche text,
   origine_materiale text,
   quantita_calcolata numeric,
   origini jsonb,
   locale text,
   supplier_rfq_item_id uuid,
   stock_item_id uuid,
   posizioni jsonb,
   rfq_id uuid,
   commessa text,
   fase text,
   posizione_fase integer)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
#variable_conflict use_column
declare
  uid uuid := auth.uid();
begin
  if uid is null or p_company is null then
    return;
  end if;
  if public.utente_bloccato() or public.utente_e_cliente_esterno() then
    return;
  end if;
  if p_company is distinct from public.get_effective_company_id()
     and not public.has_role(uid, 'super_admin'::public.app_role) then
    return;
  end if;
  if not (public.materiali_puo('can_manage_purchasing', p_company)
          or public.materiali_puo('can_view_orders', p_company)) then
    return;
  end if;

  return query
    select oi.id, oi.order_id, oi.name, oi.description, oi.quantity, oi.status, oi.supplier_id,
           oi.purchase_price, oi.vat_rate, oi.phase_id, oi.unita_misura, oi.specifiche,
           oi.origine_materiale, oi.quantita_calcolata, oi.origini, oi.locale,
           oi.supplier_rfq_item_id, oi.stock_item_id, oi.posizioni,
           ri.rfq_id, o.order_code, w.name, w.position
      from public.materiali_fasi_validazione v
      join public.orders o on o.id = v.order_id
      join public.order_work_phases w on w.id = v.phase_id
      join public.order_items oi on oi.phase_id = v.phase_id and oi.order_id = o.id
      left join public.supplier_rfq_items ri on ri.id = oi.supplier_rfq_item_id and ri.company_id = p_company
     where v.company_id = p_company
       and v.stato = 'validata'
       and o.company_id = p_company
       and o.deleted_at is null
       and oi.natura_riga = 'materiale'
       and public.can_see_order(o.id, o.assigned_to, o.destination_warehouse_id)
     order by o.order_code, w.position, oi.position, oi.id;
end;
$function$;

COMMENT ON FUNCTION public.acquisti_materiali_da_ordinare(uuid) IS
  'Ufficio acquisti: i materiali delle fasi validate (solo i campi della pipeline, niente prezzi di vendita). Serve can_manage_purchasing o can_view_orders nell''azienda in cui si lavora.';

REVOKE ALL ON FUNCTION public.acquisti_materiali_da_ordinare(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.acquisti_materiali_da_ordinare(uuid) TO authenticated, service_role;
