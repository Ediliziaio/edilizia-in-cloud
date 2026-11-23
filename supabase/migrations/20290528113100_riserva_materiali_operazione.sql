ALTER TABLE public.order_items ADD COLUMN warehouse_supply_quantity numeric;
ALTER TABLE public.order_items ADD CONSTRAINT order_items_warehouse_supply_quantity_check
  CHECK (warehouse_supply_quantity IS NULL OR
    (stock_item_id IS NOT NULL AND warehouse_supply_quantity > 0 AND warehouse_supply_quantity <= quantity));
COMMENT ON COLUMN public.order_items.warehouse_supply_quantity IS
  'Quota assegnata al magazzino per la copertura acquisti, riservata o già prelevata. NULL conserva il comportamento delle righe di magazzino precedenti.';

CREATE FUNCTION public.commessa_riserva_materiale(
  p_generale uuid, p_order_item_id uuid, p_stock_item_id uuid, p_quantity numeric,
  p_riserva_attesa numeric, p_request_id uuid
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO '' AS $$
DECLARE
  r public.order_items;
  o public.orders;
  w public.warehouse_stock;
  replay jsonb;
  result jsonb;
  ordered numeric;
  issued numeric := 0;
  prior_reserve numeric;
  balance jsonb;
BEGIN
  SELECT * INTO r FROM public.order_items WHERE id=p_order_item_id;
  SELECT * INTO o FROM public.orders WHERE id=r.order_id AND deleted_at IS NULL;
  PERFORM public.warehouse_access_v2(o.company_id,'can_edit_orders');
  PERFORM public.warehouse_access_v2(o.company_id,'can_edit_warehouse');
  IF public.utente_bloccato() OR public.utente_sola_lettura(o.company_id)
    OR NOT coalesce(public.can_see_order(o.id,o.assigned_to,o.destination_warehouse_id), false)
    OR NOT (o.id=p_generale OR o.commessa_generale_id IS NOT DISTINCT FROM p_generale)
    OR NOT EXISTS (
      SELECT 1 FROM public.orders g WHERE g.id=p_generale AND g.company_id=o.company_id
        AND g.workflow_kind='generale' AND g.deleted_at IS NULL
        AND public.can_see_order(g.id,g.assigned_to,g.destination_warehouse_id)
    ) THEN RAISE EXCEPTION 'Riga non accessibile da questa operazione.' USING ERRCODE='42501'; END IF;

  -- Lo stesso lock usato dalla creazione degli OdA della commessa.
  PERFORM pg_advisory_xact_lock(hashtextextended(o.company_id::text || ':' || o.id::text, 0));
  replay:=public.warehouse_claim_v2(o.company_id,p_request_id,'reserve-operation-material',
    jsonb_build_object('generale',p_generale,'riga',p_order_item_id,'stock',p_stock_item_id,'quantity',p_quantity,'attesa',p_riserva_attesa));
  IF replay IS NOT NULL THEN RETURN replay; END IF;

  SELECT * INTO r FROM public.order_items WHERE id=p_order_item_id AND order_id=o.id FOR UPDATE;
  IF r.id IS NULL OR r.natura_riga IS DISTINCT FROM 'materiale'
    OR coalesce(r.auto_deducted,false) OR coalesce(r.status,'da_ordinare') NOT IN ('da_ordinare','ordinato')
    OR r.fulfillment_status='delivered' OR coalesce(jsonb_array_length(r.posizioni),0)>0
    OR r.supplier_rfq_item_id IS NOT NULL OR coalesce(r.quantity_received,0)>0
    OR (r.stock_item_id IS NOT NULL AND (r.warehouse_supply_quantity IS NULL OR r.stock_item_id IS DISTINCT FROM p_stock_item_id))
    THEN RAISE EXCEPTION 'Questa riga non è modificabile nella ripartizione magazzino. Verifica impegni, arrivi e posizioni.' USING ERRCODE='PT409'; END IF;

  SELECT * INTO w FROM public.warehouse_stock WHERE id=p_stock_item_id AND company_id=o.company_id;
  IF w.id IS NULL THEN RAISE EXCEPTION 'Articolo di magazzino non accessibile.' USING ERRCODE='42501'; END IF;
  PERFORM public.warehouse_location_access_v2(o.company_id,w.warehouse_id);
  IF nullif(btrim(r.unita_misura),'') IS NULL OR nullif(btrim(w.unita_misura),'') IS NULL
    OR public.unita_confrontabile(r.unita_misura) IS DISTINCT FROM public.unita_confrontabile(w.unita_misura)
    THEN RAISE EXCEPTION 'Le unità di misura di articolo e magazzino devono coincidere.' USING ERRCODE='22023'; END IF;

  IF p_quantity IS NULL OR p_quantity::text IN ('NaN','Infinity','-Infinity') OR p_quantity < 0
    OR p_quantity <> round(p_quantity,4) THEN
    RAISE EXCEPTION 'Inserisci una quantità valida con al massimo quattro decimali.' USING ERRCODE='22023';
  END IF;
  prior_reserve := CASE WHEN r.stock_item_id IS NULL THEN 0 ELSE
    public.warehouse_effective_reserve_v2(r.fulfillment_status,r.quantity,r.warehouse_reserved_quantity) END;
  IF prior_reserve IS DISTINCT FROM p_riserva_attesa THEN
    RAISE EXCEPTION 'La riserva è cambiata. Aggiorna la riga e controlla la nuova quantità.' USING ERRCODE='PT409';
  END IF;

  IF r.stock_item_id IS NOT NULL THEN
    balance:=public.warehouse_return_state_v2(o.id,w.id,r.id);
    issued:=greatest((balance->>'issued')::numeric-(balance->>'returned')::numeric,0);
  END IF;
  SELECT coalesce(sum(pi.quantity),0) INTO ordered FROM public.purchase_order_items pi
    JOIN public.purchase_orders po ON po.id=pi.purchase_order_id AND po.company_id=o.company_id
    WHERE pi.company_id=o.company_id AND pi.order_item_id=r.id AND po.status<>'annullato';
  IF EXISTS (SELECT 1 FROM public.purchase_order_items pi JOIN public.purchase_orders po ON po.id=pi.purchase_order_id
      WHERE pi.company_id=o.company_id AND po.company_id=o.company_id AND pi.order_item_id=r.id AND po.status<>'annullato'
        AND (coalesce(pi.quantity_received,0)>0 OR (nullif(btrim(pi.unit_of_measure),'') IS NOT NULL
          AND public.unita_confrontabile(pi.unit_of_measure) IS DISTINCT FROM public.unita_confrontabile(r.unita_misura)))) THEN
    RAISE EXCEPTION 'Verifica gli arrivi o le unità dell’OdA prima di modificare la riserva.' USING ERRCODE='PT409';
  END IF;
  IF p_quantity > greatest(coalesce(r.quantity,0)-ordered-issued,0) THEN
    RAISE EXCEPTION 'Quantità oltre il fabbisogno libero dagli OdA e dai prelievi.' USING ERRCODE='PT409';
  END IF;
  -- Il trigger nativo di Magazzino applica il delta e blocca l'eventuale sovra-prenotazione.
  UPDATE public.order_items SET
    stock_item_id = CASE WHEN p_quantity+issued>0 THEN w.id ELSE NULL END,
    warehouse_supply_quantity = nullif(p_quantity+issued,0),
    fulfillment_status = CASE WHEN p_quantity+issued>0 THEN 'received' ELSE 'not_started' END,
    warehouse_reserved_quantity = p_quantity,
    updated_at=now()
  WHERE id=r.id;
  result:=jsonb_build_object('order_item_id',r.id,'reserved',p_quantity,
    'da_ordinare',greatest(coalesce(r.quantity,0)-ordered-issued-p_quantity,0));
  UPDATE public.warehouse_operation_requests SET response=result WHERE company_id=o.company_id AND request_id=p_request_id;
  RETURN result;
END $$;
REVOKE ALL ON FUNCTION public.commessa_riserva_materiale(uuid,uuid,uuid,numeric,numeric,uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.commessa_riserva_materiale(uuid,uuid,uuid,numeric,numeric,uuid) TO authenticated;

-- La quota assegnata è modificabile dalla RPC che valida insieme OdA, unità e magazzino.
CREATE FUNCTION public.proteggi_quota_magazzino_commessa()
RETURNS trigger LANGUAGE plpgsql SET search_path TO '' AS $$
BEGIN
  IF current_user IN ('anon','authenticated') THEN
    IF TG_OP='INSERT' THEN
      IF NEW.warehouse_supply_quantity IS NOT NULL THEN
        RAISE EXCEPTION 'Assegna la riserva da Materiali della commessa.' USING ERRCODE='42501';
      END IF;
    ELSIF NEW.warehouse_supply_quantity IS DISTINCT FROM OLD.warehouse_supply_quantity
       OR (OLD.warehouse_supply_quantity IS NOT NULL
           AND (NEW.warehouse_reserved_quantity, NEW.stock_item_id, NEW.order_id)
            IS DISTINCT FROM (OLD.warehouse_reserved_quantity, OLD.stock_item_id, OLD.order_id)) THEN
      RAISE EXCEPTION 'Modifica la riserva da Materiali della commessa.' USING ERRCODE='42501';
    END IF;
  END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.proteggi_quota_magazzino_commessa() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER a_proteggi_quota_magazzino_commessa BEFORE INSERT
  OR UPDATE OF warehouse_supply_quantity, warehouse_reserved_quantity, stock_item_id, order_id
  ON public.order_items FOR EACH ROW EXECUTE FUNCTION public.proteggi_quota_magazzino_commessa();

DO $migrazione$
DECLARE
  prima text;
  def text;
BEGIN
  SELECT pg_get_functiondef('public.crea_oda_materiali_atomica(uuid,uuid,uuid,jsonb)'::regprocedure) INTO def;
  prima:=def;
  def:=replace(def,'or v_item.stock_item_id is not null then',
    'or (v_item.stock_item_id is not null and v_item.warehouse_supply_quantity is null) then');
  IF def=prima THEN RAISE EXCEPTION 'Rivedere il controllo stock nella funzione OdA'; END IF;
  prima:=def;
  def:=replace(def,'i.id=v_group.item_id and i.order_id=p_order_id;',
    'i.id=v_group.item_id and i.order_id=p_order_id for update;');
  IF def=prima THEN RAISE EXCEPTION 'Rivedere il lock della riga OdA'; END IF;
  prima:=def;
  def:=replace(def,'round(v_item.quantity-v_covered,6)',
    'round(v_item.quantity-v_covered-coalesce(v_item.warehouse_supply_quantity,0),6)');
  IF def=prima THEN RAISE EXCEPTION 'Rivedere il calcolo del residuo OdA'; END IF;
  EXECUTE def;

  SELECT pg_get_functiondef('public.warehouse_reserve_v2(uuid,numeric,uuid)'::regprocedure) INTO def;
  prima:=def;
  def:=replace(def,'IF p_quantity IS NULL OR p_quantity::text',
    'IF r.warehouse_supply_quantity IS NOT NULL THEN RAISE EXCEPTION ''Apri Materiali della commessa generale per modificare questa riserva.'' USING ERRCODE=''PT409''; END IF;
  IF p_quantity IS NULL OR p_quantity::text');
  IF def=prima THEN RAISE EXCEPTION 'Rivedere la funzione prenotazioni per le quote condivise'; END IF;
  EXECUTE def;
END
$migrazione$;
