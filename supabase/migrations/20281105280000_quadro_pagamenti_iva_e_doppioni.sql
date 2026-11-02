set local lock_timeout='3s';
set local statement_timeout='60s';
-- Pagamenti della commessa (audit 31/10/2026): la pagina dice «Importi IVA inclusa» ma subappalti e ditte erano
-- senza IVA. Ora: subappalti con l'IVA della ditta o, in reverse charge, con quella della commessa (iva_pct,
-- reverse_charge per dirlo in pagina); ditte a IVA 0 con l'IVA della commessa; ordini senza totale stimati con
-- IVA; la ditta con un contratto di subappalto sulla commessa non è più contata due volte; i SAL del cliente
-- hanno la quota del singolo SAL (non il cumulativo) anche con IVA. Solo CREATE OR REPLACE.
CREATE OR REPLACE FUNCTION public.commessa_quadro_pagamenti(p_order_id uuid)
 RETURNS jsonb
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
WITH o AS (
  -- IVA della commessa: serve per i subappalti in reverse charge (l'IVA la integra l'impresa) e per i SAL del cliente.
  SELECT id, company_id, coalesce(vat_rate, 22) AS iva FROM public.orders WHERE id = p_order_id AND deleted_at IS NULL
),
oggi AS (SELECT (now() AT TIME ZONE 'Europe/Rome')::date AS d),
rate AS (
  SELECT i.id, i.position, i.label, i.type, i.amount, i.is_paid, i.paid_date, i.expected_date,
         coalesce(inv.invoice_number, df.numero) AS fattura,
         (NOT i.is_paid AND i.expected_date IS NOT NULL AND i.expected_date < (SELECT d FROM oggi)) AS scaduta
    FROM public.order_installments i
    JOIN o ON o.id = i.order_id
    LEFT JOIN public.invoices inv ON inv.id = i.invoice_id AND inv.deleted_at IS NULL
    LEFT JOIN public.documenti_fiscali df ON df.id = i.documento_fiscale_id AND df.deleted_at IS NULL
),
sal_cliente AS (
  -- importo_totale è il cumulativo senza IVA: la quota del SAL è la differenza col precedente, e si mostra anche con IVA.
  SELECT s.id, s.numero_sal, s.data_emissione, s.stato, s.importo_totale, s.maturato_il,
         r.label AS rata, r.is_paid AS incassato,
         round(s.importo_totale - coalesce(lag(s.importo_totale) OVER (ORDER BY s.numero_sal), 0), 2) AS importo_sal,
         round((s.importo_totale - coalesce(lag(s.importo_totale) OVER (ORDER BY s.numero_sal), 0)) * (1 + o.iva / 100), 2) AS importo_sal_ivato,
         o.iva AS iva_pct
    FROM public.sal_records s
    JOIN o ON o.id = s.order_id
    LEFT JOIN public.order_installments r ON r.id = s.installment_id
),
costi AS (
  SELECT c.*,
         CASE
           WHEN jsonb_typeof(c.allocations) = 'array' AND jsonb_array_length(c.allocations) > 0 THEN
             coalesce((SELECT sum(CASE WHEN (a->>'pct') ~ '^[0-9]+(\.[0-9]+)?$' THEN (a->>'pct')::numeric ELSE 0 END)
                         FROM jsonb_array_elements(c.allocations) a
                        WHERE a->>'order_id' = p_order_id::text), 0) / 100
           ELSE 1
         END AS quota
    FROM public.company_costs c
    JOIN o ON o.company_id = c.company_id
   WHERE c.order_id = p_order_id
      OR (jsonb_typeof(c.allocations) = 'array'
          AND c.allocations @> jsonb_build_array(jsonb_build_object('order_id', p_order_id::text)))
),
costi_calc AS (
  SELECT c.id, c.name, c.due_date, c.is_paid, c.paid_date, c.quota, c.senza_fattura, c.allegato_path,
         c.purchase_order_id, c.order_external_team_id, c.supplier_id,
         s.name AS fornitore, s.tipo AS tipo_fornitore,
         po.oda_number,
         et.name AS ditta,
         f.numeri AS fatture, f.totale AS totale_fatture,
         round(coalesce(f.totale, c.amount * (1 + coalesce(c.vat_rate, 0) / 100)), 2) AS totale,
         coalesce(pn.pagato, 0) AS pagato_pn,
         (SELECT min(r.scadenza) FROM public.rate_fornitori r
           WHERE r.company_cost_id = c.id AND r.stato = 'da_pagare') AS prossima_rata,
         (SELECT min(d.due_date) FROM public.scadenze d
           WHERE d.cost_id = c.id AND d.direction = 'uscita' AND d.status IN ('da_pagare', 'parziale')) AS prossima_scadenza
    FROM costi c
    LEFT JOIN public.suppliers s ON s.id = c.supplier_id
    LEFT JOIN public.purchase_orders po ON po.id = c.purchase_order_id
    LEFT JOIN public.order_external_teams oet ON oet.id = c.order_external_team_id
    LEFT JOIN public.external_teams et ON et.id = oet.external_team_id
    LEFT JOIN LATERAL (
      SELECT string_agg(coalesce(fr.numero_fattura, 's/n'), ', ' ORDER BY fr.data_fattura) AS numeri,
             sum(CASE WHEN fr.tipo_documento IN ('TD04', 'TD08') THEN -abs(fr.totale_documento) ELSE fr.totale_documento END) AS totale
        FROM public.fatture_ricevute fr
       WHERE fr.company_cost_id = c.id AND fr.company_id = c.company_id
         AND coalesce(fr.stato, '') NOT IN ('annullata', 'scartata', 'rifiutata')
    ) f ON true
    LEFT JOIN LATERAL (
      SELECT sum(CASE WHEN p.direction = 'uscita' THEN p.amount ELSE -p.amount END) AS pagato
        FROM public.prima_nota_entries p
       WHERE p.company_id = c.company_id
         AND (p.cost_id = c.id OR EXISTS (SELECT 1 FROM public.scadenze d
                                           WHERE d.id = p.scadenza_id AND d.cost_id = c.id))
    ) pn ON true
   WHERE c.quota > 0
     -- fattura del subappalto: la dice la riga del contratto
     AND NOT EXISTS (SELECT 1 FROM public.fatture_ricevute frs
                      JOIN public.contratti_subappalto ks ON ks.id = frs.contratto_subappalto_id
                     WHERE frs.company_cost_id = c.id AND ks.order_id = p_order_id
                       AND (frs.sal_subappaltatore_id IS NOT NULL
                            OR EXISTS (SELECT 1 FROM public.sal_subappaltatori sx WHERE sx.contratto_id = ks.id)))
),
uscite_costi AS (
  SELECT
    'costo:' || c.id AS chiave,
    CASE
      WHEN c.order_external_team_id IS NOT NULL OR c.tipo_fornitore = 'subappalto' THEN 'subappalti'
      WHEN c.tipo_fornitore = 'professionisti' THEN 'professionisti'
      WHEN c.tipo_fornitore IN ('noli_servizi', 'mezzi') THEN 'noleggi'
      WHEN c.tipo_fornitore = 'materiali' OR c.purchase_order_id IS NOT NULL THEN 'materiali'
      WHEN c.supplier_id IS NOT NULL AND c.tipo_fornitore IS NULL AND NOT c.senza_fattura THEN 'materiali'
      ELSE 'extra'
    END AS categoria,
    coalesce(c.fornitore, c.ditta) AS controparte,
    c.name AS descrizione,
    CASE WHEN c.oda_number IS NOT NULL THEN 'OdA ' || c.oda_number END AS riferimento,
    round(c.totale * c.quota, 2) AS importo,
    c.fatture,
    c.senza_fattura,
    c.allegato_path IS NOT NULL AS ha_ricevuta,
    round(least(c.totale, CASE WHEN c.is_paid AND c.pagato_pn = 0 THEN c.totale ELSE c.pagato_pn END) * c.quota, 2) AS pagato,
    CASE WHEN c.is_paid AND c.pagato_pn = 0 THEN c.paid_date END AS pagato_il,
    coalesce(c.prossima_rata, c.prossima_scadenza, c.due_date) AS scadenza,
    c.quota < 1 AS ripartito,
    round(c.quota * 100, 2) AS quota_pct,
    'costo' AS origine_tipo, c.id AS origine_id
  FROM costi_calc c
),
uscite_oda AS (
  SELECT 'oda:' || po.id AS chiave, 'materiali' AS categoria, s.name AS controparte,
         'Ordine d''acquisto' AS descrizione, 'OdA ' || po.oda_number AS riferimento,
         -- senza totale si stima con l'IVA ordinaria sul subtotale (prima era senza IVA)
         round(coalesce(po.total, po.subtotal * 1.22, 0), 2) AS importo,
         NULL::text AS fatture, false AS senza_fattura, false AS ha_ricevuta,
         0::numeric AS pagato, NULL::date AS pagato_il,
         po.expected_delivery_date::date AS scadenza,
         false AS ripartito, 100::numeric AS quota_pct,
         'oda' AS origine_tipo, po.id AS origine_id
    FROM public.purchase_orders po
    JOIN o ON o.id = po.order_id AND o.company_id = po.company_id
    LEFT JOIN public.suppliers s ON s.id = po.supplier_id
   WHERE coalesce(po.status, '') NOT IN ('bozza', 'annullato', 'cancelled', 'draft')
     AND NOT EXISTS (SELECT 1 FROM public.company_costs cc WHERE cc.purchase_order_id = po.id)
     AND NOT EXISTS (SELECT 1 FROM public.fatture_ricevute fr WHERE fr.purchase_order_id = po.id)
),
sal_sub AS (
  SELECT ss.*,
         CASE WHEN ss.stato = 'pagato' THEN greatest(coalesce(ss.pagato_registrato, 0), coalesce(ss.importo_netto, 0))
              ELSE coalesce(ss.pagato_registrato, 0) END AS pagato
    FROM public.sal_subappaltatori ss
    JOIN o ON o.id = ss.order_id AND o.company_id = ss.company_id
),
uscite_sub_base AS (
  SELECT 'sub:' || coalesce(k.id::text, 'senza:' || sub.id::text) AS chiave,
         'subappalti' AS categoria,
         sub.ragione_sociale AS controparte,
         coalesce(k.descrizione_lavori, 'SAL senza contratto') AS descrizione,
         CASE WHEN k.numero_contratto IS NOT NULL THEN 'Contratto ' || k.numero_contratto END AS riferimento,
         coalesce(sum(ss.importo_netto), 0) AS importo,
         CASE WHEN count(ss.id) > 0 THEN count(ss.id) || ' SAL' END AS fatture,
         false AS senza_fattura, false AS ha_ricevuta,
         coalesce(sum(ss.pagato), 0) AS pagato,
         NULL::date AS pagato_il,
         min(ss.data_emissione) FILTER (WHERE ss.stato <> 'pagato') AS scadenza,
         false AS ripartito, 100::numeric AS quota_pct,
         'subappalto' AS origine_tipo, coalesce(k.id, sub.id) AS origine_id,
         k.importo_contrattuale AS contratto,
         coalesce(sum(ss.importo_lordo), 0) AS maturato_lordo,
         coalesce(sum(ss.ritenuta_importo), 0) AS ritenute,
         sub.campo_subappaltatore_id AS campo_id
    FROM (SELECT DISTINCT ss.contratto_id, ss.subappaltatore_id FROM sal_sub ss
          UNION
          SELECT k.id, k.subappaltatore_id FROM public.contratti_subappalto k JOIN o ON o.id = k.order_id
           WHERE coalesce(k.stato, '') NOT IN ('annullato', 'bozza')) g
    LEFT JOIN public.contratti_subappalto k ON k.id = g.contratto_id
    LEFT JOIN public.subappaltatori_sicurezza sub ON sub.id = coalesce(k.subappaltatore_id, g.subappaltatore_id)
    LEFT JOIN sal_sub ss ON (ss.contratto_id = g.contratto_id)
                         OR (g.contratto_id IS NULL AND ss.contratto_id IS NULL AND ss.subappaltatore_id = g.subappaltatore_id)
   GROUP BY k.id, sub.id, sub.ragione_sociale, k.descrizione_lavori, k.numero_contratto, k.importo_contrattuale, sub.campo_subappaltatore_id
),
uscite_sub AS (
  -- SAL e contratti sono senza IVA: si mostra l'IVA della ditta, o quella della commessa se fattura in reverse charge.
  SELECT b.*, x.iva_pct, x.reverse_charge
    FROM uscite_sub_base b
    CROSS JOIN LATERAL (
      SELECT CASE WHEN coalesce(d.vat_rate, 0) > 0 THEN d.vat_rate ELSE (SELECT iva FROM o) END AS iva_pct,
             NOT (coalesce(d.vat_rate, 0) > 0) AS reverse_charge
        FROM (SELECT (SELECT et.vat_rate FROM public.external_teams et
                       WHERE et.subappaltatore_id = b.campo_id AND et.company_id = (SELECT company_id FROM o)
                       ORDER BY (coalesce(et.vat_rate, 0) > 0) DESC LIMIT 1) AS vat_rate) d
    ) x
),
uscite_ditte AS (
  SELECT 'ditta:' || oet.id AS chiave, 'subappalti' AS categoria, et.name AS controparte,
         coalesce(nullif(oet.notes, ''), 'Lavoro della ditta') AS descrizione, NULL::text AS riferimento,
         -- total_cost ha già l'IVA della ditta; a IVA 0 (reverse charge) si aggiunge quella della commessa
         round(coalesce(oet.total_cost, 0) * CASE WHEN coalesce(et.vat_rate, 0) > 0 THEN 1 ELSE 1 + o.iva / 100 END, 2) AS importo,
         NULL::text AS fatture, false AS senza_fattura, false AS ha_ricevuta,
         CASE WHEN oet.is_paid THEN round(coalesce(oet.total_cost, 0) * CASE WHEN coalesce(et.vat_rate, 0) > 0 THEN 1 ELSE 1 + o.iva / 100 END, 2) ELSE 0 END AS pagato,
         oet.paid_date AS pagato_il, oet.payment_date AS scadenza,
         false AS ripartito, 100::numeric AS quota_pct,
         'ditta' AS origine_tipo, oet.id AS origine_id,
         CASE WHEN coalesce(et.vat_rate, 0) > 0 THEN et.vat_rate ELSE o.iva END AS iva_pct,
         NOT (coalesce(et.vat_rate, 0) > 0) AS reverse_charge
    FROM public.order_external_teams oet
    JOIN o ON o.id = oet.order_id
    LEFT JOIN public.external_teams et ON et.id = oet.external_team_id
   WHERE coalesce(oet.total_cost, 0) > 0
     AND NOT EXISTS (SELECT 1 FROM public.company_costs cc WHERE cc.order_external_team_id = oet.id)
     -- la ditta che ha un contratto di subappalto su questa commessa sta già nella riga del contratto
     AND NOT EXISTS (SELECT 1 FROM public.contratti_subappalto k
                       JOIN public.subappaltatori_sicurezza ks ON ks.id = k.subappaltatore_id
                      WHERE k.order_id = p_order_id AND coalesce(k.stato, '') NOT IN ('annullato', 'bozza')
                        AND et.subappaltatore_id IS NOT NULL
                        AND (ks.campo_subappaltatore_id = et.subappaltatore_id OR ks.id = et.subappaltatore_id))
),
uscite AS (
  SELECT chiave, categoria, controparte, descrizione, riferimento, importo, fatture, senza_fattura, ha_ricevuta,
         pagato, pagato_il, scadenza, ripartito, quota_pct, origine_tipo, origine_id,
         NULL::numeric AS contratto, NULL::numeric AS maturato_lordo, NULL::numeric AS ritenute,
         NULL::numeric AS iva_pct, NULL::boolean AS reverse_charge
    FROM uscite_costi
  UNION ALL SELECT chiave, categoria, controparte, descrizione, riferimento, importo, fatture, senza_fattura, ha_ricevuta,
         pagato, pagato_il, scadenza, ripartito, quota_pct, origine_tipo, origine_id, NULL, NULL, NULL, NULL, NULL FROM uscite_oda
  UNION ALL SELECT chiave, categoria, controparte, descrizione, riferimento,
         round(importo * (1 + iva_pct / 100), 2), fatture, senza_fattura, ha_ricevuta,
         round(pagato * (1 + iva_pct / 100), 2), pagato_il, scadenza, ripartito, quota_pct, origine_tipo, origine_id,
         round(contratto * (1 + iva_pct / 100), 2), round(maturato_lordo * (1 + iva_pct / 100), 2), round(ritenute * (1 + iva_pct / 100), 2),
         iva_pct, reverse_charge FROM uscite_sub
  UNION ALL SELECT chiave, categoria, controparte, descrizione, riferimento, importo, fatture, senza_fattura, ha_ricevuta,
         pagato, pagato_il, scadenza, ripartito, quota_pct, origine_tipo, origine_id, NULL, NULL, NULL, iva_pct, reverse_charge FROM uscite_ditte
),
uscite_stato AS (
  SELECT u.*,
         greatest(u.importo - u.pagato, 0) AS residuo,
         CASE
           WHEN u.origine_tipo = 'oda' THEN 'fattura_da_arrivare'
           WHEN u.importo > 0 AND u.pagato >= u.importo - 0.01 THEN 'pagato'
           WHEN u.scadenza IS NOT NULL AND u.scadenza < (SELECT d FROM oggi) AND u.origine_tipo <> 'subappalto' THEN 'scaduto'
           WHEN u.pagato > 0 THEN 'parziale'
           WHEN u.importo = 0 THEN 'da_maturare'
           ELSE 'da_pagare'
         END AS stato
    FROM uscite u
)
SELECT CASE WHEN NOT EXISTS (SELECT 1 FROM o) THEN NULL ELSE jsonb_build_object(
  'oggi', (SELECT d FROM oggi),
  'rate', coalesce((SELECT jsonb_agg(to_jsonb(r) ORDER BY r.position NULLS LAST, r.expected_date) FROM rate r), '[]'::jsonb),
  'sal_cliente', coalesce((SELECT jsonb_agg(to_jsonb(s) ORDER BY s.numero_sal) FROM sal_cliente s), '[]'::jsonb),
  'uscite', coalesce((SELECT jsonb_agg(to_jsonb(u) ORDER BY
                        CASE u.stato WHEN 'scaduto' THEN 0 WHEN 'da_pagare' THEN 1 WHEN 'parziale' THEN 1
                                     WHEN 'fattura_da_arrivare' THEN 2 WHEN 'da_maturare' THEN 3 ELSE 4 END,
                        u.scadenza NULLS LAST, u.controparte) FROM uscite_stato u), '[]'::jsonb),
  'mezzi_stimati', (SELECT jsonb_build_object('costo', m.costo_mezzi_stimato, 'mezzi', m.mezzi_usati, 'giorni', m.giorni_mezzo)
                      FROM public.v_ordine_costi_mezzi_stimati m WHERE m.order_id = p_order_id LIMIT 1)
) END
$function$;
