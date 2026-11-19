-- SOLO LETTURA. Eseguire nel futuro collaudo di rilascio, per un’azienda esplicita.
-- Impostare eic.audit_company_id nella propria sessione prima di eseguire.
-- Nessuna correzione automatica di giacenze, prenotazioni o storico.
WITH expected AS (
 SELECT i.stock_item_id,
   sum(CASE WHEN public.fulfillment_status_holds_reserve(i.fulfillment_status)
     THEN coalesce(nullif(to_jsonb(i)->>'warehouse_reserved_quantity','')::numeric,i.quantity,0) ELSE 0 END) AS reserved
 FROM public.order_items i JOIN public.orders o ON o.id=i.order_id
 WHERE o.company_id=nullif(current_setting('eic.audit_company_id',true),'')::uuid
 GROUP BY i.stock_item_id
)
SELECT s.id,s.warehouse_id,s.unita_misura,s.quantity,s.quantity_reserved,
 coalesce(e.reserved,0) AS prenotato_dalle_righe,
 s.quantity_reserved-coalesce(e.reserved,0) AS differenza_prenotazioni,
 s.quantity_reserved>s.quantity OR coalesce(e.reserved,0)>s.quantity AS disponibilita_incoerente,
 s.prezzo_da_definire
FROM public.warehouse_stock s LEFT JOIN expected e ON e.stock_item_id=s.id
WHERE s.company_id=nullif(current_setting('eic.audit_company_id',true),'')::uuid
 AND (s.quantity_reserved IS DISTINCT FROM coalesce(e.reserved,0)
      OR s.quantity_reserved>s.quantity OR coalesce(e.reserved,0)>s.quantity)
ORDER BY s.id;
