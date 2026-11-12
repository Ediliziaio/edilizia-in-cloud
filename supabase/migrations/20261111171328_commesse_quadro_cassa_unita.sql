-- Recovered from the production migration journal, already applied there.
-- The registered version predates the native general-project schema in Git.
-- Fresh databases defer the original SQL until 20290313155500; production does not rerun it.
create schema if not exists private;
create table if not exists private.recovered_dependency_patches(id text primary key);
alter table private.recovered_dependency_patches enable row level security;
revoke all on private.recovered_dependency_patches from public,anon,authenticated,service_role;

DO $defer_commesse_2$ BEGIN
IF to_regclass('public.unita_movimenti') IS NOT NULL AND to_regclass('public.generale_piano_voci') IS NOT NULL THEN
CREATE OR REPLACE FUNCTION public.rate_da_incassare(p_company uuid)
 RETURNS TABLE(order_id uuid, installment_id uuid, expected_date date, residuo numeric, finanziamento boolean)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  with o as (
    select o.id,
           case when o.order_type='appaltatore_lavoro' and o.valorizzazione='a_misura'
             then coalesce((select sum(c.credito_lordo) from public.commessa_documenti_credito(p_company) c where c.order_id=o.id),0)
             else round((coalesce(o.total_amount, 0)
                  + coalesce((select sum(coalesce(v.impatto_economico, 0)) from public.ordini_variazione v
                               where v.order_id = o.id and v.status = 'approvato'), 0))
                 * (1 + coalesce(o.vat_rate, 22) / 100), 2)
           - case when o.payment_type = 'financing' and o.financing_cost_mode is distinct from 'separato' then coalesce(o.financing_cost, 0) else 0 end - round(coalesce((select sum(um.importo) from public.unita_movimenti um join public.unita_immobiliari ui on ui.id=um.unita_id where ui.order_id=o.id and ui.company_id=o.company_id and um.tipo='permuta' and um.stornato_at is null),0)*(1+coalesce(o.vat_rate,22)/100),2) end as totale
      from public.orders o
     where o.company_id = p_company and o.deleted_at is null
  ),
  r as (select * from public.rate_importi(p_company)),
  incassato as (select x.order_id, sum(x.importo) as i from public.rate_incassi(p_company) x group by x.order_id),
  righe as (
    select r.order_id, r.installment_id, r.expected_date,
           greatest(0, r.importo - coalesce(d.importo_pagato, 0)
                     - case when d.id is null then 0 else public.documento_stornato_totale(d.id) end) as residuo,
           r.type = 'financing' as finanziamento
      from r left join public.documenti_fiscali d on d.id = r.documento_fiscale_id
     where not r.is_paid and not exists(select 1 from public.orders oo where oo.id=r.order_id and oo.order_type='appaltatore_lavoro' and oo.valorizzazione='a_misura')
    union all
    select c.order_id,coalesce(c.documento_id,c.invoice_id),c.scadenza,greatest(0,c.credito_lordo-c.pagato_lordo),false
      from public.commessa_documenti_credito(p_company) c join public.orders oo on oo.id=c.order_id
     where oo.order_type='appaltatore_lavoro' and oo.valorizzazione='a_misura'
    union all
    -- La parte del totale che nessuna rata copre: piano senza saldo, variante dopo il saldo pagato,
    -- o commessa senza alcun piano (deve tutto il suo totale).
    select s.order_id, null::uuid, null::date, s.scoperto, false
      from (select o.id as order_id, round(o.totale - coalesce(sum(r.importo), 0), 2) as scoperto
              from o left join r on r.order_id = o.id
             group by o.id, o.totale) s
     where s.scoperto > 0
  ),
  ordinate as (
    select righe.*,
           sum(righe.residuo) over (partition by righe.order_id
                                    order by righe.expected_date nulls last, righe.installment_id nulls last
                                    rows unbounded preceding) as cumulato
      from righe
  )
  -- Mai oltre il totale meno l'incassato: l'eccedenza del piano si toglie dalle rate più lontane.
  select ord.order_id, ord.installment_id, ord.expected_date,
         greatest(0, least(ord.residuo, greatest(0, o.totale - coalesce(inc.i, 0)) - (ord.cumulato - ord.residuo))),
         ord.finanziamento
    from ordinate ord
    join o on o.id = ord.order_id
    left join incassato inc on inc.order_id = ord.order_id
$function$;

-- The unit cash header shares the ledger and forecast sources; barter is never cash.
create or replace function public.commessa_incassi_unita(p_order_id uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare c uuid:=public.get_order_company_id(p_order_id); inc numeric; resid numeric; scad numeric; g uuid; da_collegare integer;
begin
  if auth.uid() is null or public.utente_bloccato() or public.user_can_access_company(c) is not true
    or public.has_permission_for_company(auth.uid(),'can_view_orders',c) is not true
    or public.has_permission_for_company(auth.uid(),'can_view_order_amounts',c) is not true then
    raise exception 'Non hai il permesso di vedere gli incassi.' using errcode='42501';
  end if;
  if not exists(select 1 from public.unita_immobiliari where order_id=p_order_id and company_id=c) then return null; end if;
  select coalesce(sum(r.importo),0) into inc from public.rate_incassi(c) r where r.order_id=p_order_id;
  select coalesce(sum(r.residuo),0),coalesce(sum(r.residuo) filter(where r.expected_date<(now() at time zone 'Europe/Rome')::date),0)
    into resid,scad from public.rate_da_incassare(c) r where r.order_id=p_order_id;
  select commessa_generale_id into g from public.orders where id=p_order_id;
  select count(*) into da_collegare from public.unita_movimenti m join public.unita_immobiliari u on u.id=m.unita_id
    where u.order_id=p_order_id and m.tipo<>'permuta' and m.stornato_at is null and m.prima_nota_id is null;
  return jsonb_build_object('incassato',inc,'residuo',resid,'scaduto',scad,'generale_id',g,'da_collegare',da_collegare);
end $$;
revoke all on function public.commessa_incassi_unita(uuid) from public,anon;
grant execute on function public.commessa_incassi_unita(uuid) to authenticated;


CREATE OR REPLACE FUNCTION public.commessa_quadro_pagamenti(p_order_id uuid)
 RETURNS jsonb
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
WITH o AS (
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
  SELECT s.id, s.numero_sal, s.data_emissione, s.stato, s.importo_totale, s.maturato_il,
         r.label AS rata, r.is_paid AS incassato,
         round(s.importo_totale - coalesce(p.precedente, 0), 2) AS importo_sal,
         round((s.importo_totale - coalesce(p.precedente, 0)) * (1 + o.iva / 100), 2) AS importo_sal_ivato,
         o.iva AS iva_pct
    FROM public.sal_records s
    JOIN o ON o.id = s.order_id
    LEFT JOIN public.order_installments r ON r.id = s.installment_id
    LEFT JOIN LATERAL (
      SELECT x.importo_totale AS precedente FROM public.sal_records x
       WHERE x.order_id = s.order_id AND x.id <> s.id AND x.numero_sal < s.numero_sal
         AND x.stato IN ('emesso', 'approvato', 'firmato')
       ORDER BY x.numero_sal DESC LIMIT 1
    ) p ON true
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
         s.name AS fornitore, s.tipo AS tipo_fornitore, c.category,
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
             sum(CASE WHEN fr.tipo_documento IN ('TD04', 'TD08', 'passive_credit_note') THEN -abs(fr.totale_documento) ELSE fr.totale_documento END) - public.costo_stornato_da_note(c.id) AS totale
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
      WHEN c.tipo_fornitore IS NULL AND c.purchase_order_id IS NULL AND lower(c.category) = 'subappalti' THEN 'subappalti'
      WHEN c.tipo_fornitore IS NULL AND c.purchase_order_id IS NULL AND lower(c.category) IN ('consulenze_professionali', 'progettazione', 'direzione lavori') THEN 'professionisti'
      WHEN c.tipo_fornitore IS NULL AND c.purchase_order_id IS NULL AND lower(c.category) ~ 'nolegg|noli|nolo' THEN 'noleggi'
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
         k.importo_contrattuale + coalesce(k.oneri_sicurezza, 0) AS contratto,
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
   GROUP BY k.id, sub.id, sub.ragione_sociale, k.descrizione_lavori, k.numero_contratto, k.importo_contrattuale, k.oneri_sicurezza, sub.campo_subappaltatore_id
),
uscite_sub AS (
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
         round(coalesce(oet.total_cost, 0), 2) AS importo,
         NULL::text AS fatture, false AS senza_fattura, false AS ha_ricevuta,
         CASE WHEN oet.is_paid THEN round(coalesce(oet.total_cost, 0), 2) ELSE 0 END AS pagato,
         oet.paid_date AS pagato_il, oet.payment_date AS scadenza,
         false AS ripartito, 100::numeric AS quota_pct,
         'ditta' AS origine_tipo, oet.id AS origine_id,
         CASE WHEN coalesce(oet.vat_rate, et.vat_rate, 0) > 0 THEN coalesce(oet.vat_rate, et.vat_rate) ELSE o.iva END AS iva_pct,
         NOT (coalesce(oet.vat_rate, et.vat_rate, 0) > 0) AS reverse_charge,
         CASE WHEN NOT (coalesce(oet.vat_rate, et.vat_rate, 0) > 0) THEN round(coalesce(oet.total_cost, 0) * o.iva / 100, 2) END AS iva_da_versare
    FROM public.order_external_teams oet
    JOIN o ON o.id = oet.order_id
    LEFT JOIN public.external_teams et ON et.id = oet.external_team_id
   WHERE coalesce(oet.total_cost, 0) > 0
     AND NOT EXISTS (SELECT 1 FROM public.company_costs cc WHERE cc.order_external_team_id = oet.id)
     AND NOT EXISTS (SELECT 1 FROM public.contratti_subappalto k
                       JOIN public.subappaltatori_sicurezza ks ON ks.id = k.subappaltatore_id
                      WHERE k.order_id = p_order_id AND coalesce(k.stato, '') NOT IN ('annullato', 'bozza')
                        AND et.subappaltatore_id IS NOT NULL
                        AND (ks.campo_subappaltatore_id = et.subappaltatore_id OR ks.id = et.subappaltatore_id)
                        AND EXISTS (SELECT 1 FROM public.sal_subappaltatori sx WHERE sx.contratto_id = k.id))
),
uscite AS (
  SELECT chiave, categoria, controparte, descrizione, riferimento, importo, fatture, senza_fattura, ha_ricevuta,
         pagato, pagato_il, scadenza, ripartito, quota_pct, origine_tipo, origine_id,
         NULL::numeric AS contratto, NULL::numeric AS maturato_lordo, NULL::numeric AS ritenute,
         NULL::numeric AS iva_pct, NULL::boolean AS reverse_charge, NULL::numeric AS iva_da_versare
    FROM uscite_costi
  UNION ALL SELECT chiave, categoria, controparte, descrizione, riferimento, importo, fatture, senza_fattura, ha_ricevuta,
         pagato, pagato_il, scadenza, ripartito, quota_pct, origine_tipo, origine_id, NULL, NULL, NULL, NULL, NULL, NULL FROM uscite_oda
  UNION ALL SELECT chiave, categoria, controparte, descrizione, riferimento,
         round(importo * f, 2), fatture, senza_fattura, ha_ricevuta,
         round(pagato * f, 2), pagato_il, scadenza, ripartito, quota_pct, origine_tipo, origine_id,
         round(contratto * f, 2), round(maturato_lordo * f, 2), round(ritenute * f, 2),
         iva_pct, reverse_charge, iva_da_versare FROM (
           SELECT us.*, CASE WHEN us.reverse_charge THEN 1 ELSE 1 + us.iva_pct / 100 END AS f,
                  CASE WHEN us.reverse_charge THEN round(us.maturato_lordo * us.iva_pct / 100, 2) END AS iva_da_versare
             FROM uscite_sub us) x
  UNION ALL SELECT chiave, categoria, controparte, descrizione, riferimento, importo, fatture, senza_fattura, ha_ricevuta,
         pagato, pagato_il, scadenza, ripartito, quota_pct, origine_tipo, origine_id, NULL, NULL, NULL, iva_pct, reverse_charge, iva_da_versare FROM uscite_ditte
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
  'incassi_unita', case when public.has_permission_for_company(auth.uid(),'can_view_order_amounts',public.get_order_company_id(p_order_id)) and exists(select 1 from public.unita_immobiliari ui where ui.order_id=p_order_id) then public.commessa_incassi_unita(p_order_id) end,
  'crediti_misura', case when exists(select 1 from public.orders oo where oo.id=p_order_id and oo.order_type='appaltatore_lavoro' and oo.valorizzazione='a_misura')
    then public.commessa_crediti_misura(p_order_id) end,
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

ELSE INSERT INTO private.recovered_dependency_patches(id) VALUES ('20261111171328_commesse_quadro_cassa_unita.sql') ON CONFLICT DO NOTHING;
END IF; END $defer_commesse_2$;
