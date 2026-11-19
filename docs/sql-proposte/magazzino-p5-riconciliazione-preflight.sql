-- DIAGNOSTICA SOLTANTO. Non applicata online. Nessuna modifica di dati.
-- Da eseguire su una copia autorizzata prima di adottare il registro P5.
-- Una scansione legacy non conserva l'id della riga ODA: non si può inventare
-- l'abbinamento quando più posizioni usano lo stesso articolo di stock.
BEGIN READ ONLY;
SET LOCAL statement_timeout='15s';
WITH scans AS (
 SELECT company_id,purchase_order_id,resolved_stock_item_id,sum(quantity) AS quantity_scanned
 FROM public.warehouse_scan_events WHERE scan_type='oda_receive'
 GROUP BY company_id,purchase_order_id,resolved_stock_item_id
), receipts AS (
 SELECT g.company_id,g.order_item_id,d.purchase_order_id,sum(g.quantity_received) AS quantity_documented
 FROM public.goods_receipts g LEFT JOIN public.ddt_ricezione d ON d.id=g.ddt_ricezione_id AND d.company_id=g.company_id
 GROUP BY g.company_id,g.order_item_id,d.purchase_order_id
)
SELECT i.company_id,i.purchase_order_id,i.id AS purchase_order_item_id,i.order_item_id,i.stock_item_id,
 i.quantity_received AS quantity_recorded,coalesce(sum(r.quantity_documented),0) AS quantity_documented,
 s.quantity_scanned,
 (SELECT count(*) FROM public.purchase_order_items same WHERE same.purchase_order_id=i.purchase_order_id AND same.stock_item_id=i.stock_item_id) AS possible_rows_for_stock
FROM public.purchase_order_items i JOIN scans s ON s.company_id=i.company_id AND s.purchase_order_id=i.purchase_order_id AND s.resolved_stock_item_id=i.stock_item_id
LEFT JOIN receipts r ON r.company_id=i.company_id AND r.order_item_id=i.order_item_id AND (r.purchase_order_id=i.purchase_order_id OR r.purchase_order_id IS NULL)
WHERE i.order_item_id IS NOT NULL
GROUP BY i.company_id,i.purchase_order_id,i.id,i.order_item_id,i.stock_item_id,i.quantity_received,s.quantity_scanned
HAVING i.quantity_received<>coalesce(sum(r.quantity_documented),0)
ORDER BY i.company_id,i.purchase_order_id,i.id;
ROLLBACK;
