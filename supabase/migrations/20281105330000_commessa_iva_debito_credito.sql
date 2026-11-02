set local lock_timeout='3s';
set local statement_timeout='60s';
-- IVA della commessa (31/10/2026): a debito, a credito e saldo, come li legge l'amministrazione.
--  · A debito: l'IVA delle fatture emesse sulla commessa (note di credito in meno). Lo split payment non è
--    a debito (la versa l'ente). Prevista: valore della commessa × aliquota; da fatturare = prevista − fatturata.
--  · A credito: l'IVA delle fatture d'acquisto collegate alla commessa (costi, anche ripartiti per quota, e
--    contratti di subappalto), note di credito in meno; i costi registrati a mano senza fattura elettronica
--    collegata danno un credito «previsto»; quelli «senza fattura» nessuno.
--  · Reverse charge (subappalti edili, acquisti dall'estero, autofatture TD16-TD19): l'IVA si integra e va sia
--    a debito sia a credito, quindi non cambia il saldo e non compensa l'IVA delle vendite. Si mostra a parte.
--  · Saldo: a debito − a credito. Ad oggi (fatture registrate) e a fine commessa (con il previsto).
-- SECURITY INVOKER: valgono i permessi di chi guarda (come commessa_quadro_pagamenti).
create or replace function public.commessa_iva(p_order_id uuid)
 returns jsonb language sql stable set search_path to 'public' as $function$
with o as (
  select id, company_id, coalesce(vat_rate, 22) as iva, coalesce(total_amount, 0) as valore
    from public.orders where id = p_order_id and deleted_at is null
),
vendite as (
  select
    coalesce(sum(case when df.tipo = 'nota_credito' then -df.iva_totale else df.iva_totale end)
      filter (where coalesce(df.esigibilita_iva, 'I') <> 'S'), 0) as iva,
    coalesce(sum(case when df.tipo = 'nota_credito' then -df.imponibile_totale else df.imponibile_totale end), 0) as imponibile,
    coalesce(sum(df.iva_totale) filter (where df.esigibilita_iva = 'S'), 0) as split_payment,
    count(*) as documenti
    from public.documenti_fiscali df join o on o.id = df.ordine_id and o.company_id = df.company_id
   where df.deleted_at is null and df.tipo in ('fattura', 'fattura_pa', 'nota_credito')
     and df.stato not in ('bozza', 'annullata')
),
vendite_vecchie as (
  -- fatture importate (es. Aruba) collegate alla commessa
  select coalesce(sum(coalesce(i.total, 0) - coalesce(i.subtotal, 0)), 0) as iva,
         coalesce(sum(coalesce(i.subtotal, 0)), 0) as imponibile, count(*) as documenti
    from public.invoices i join o on o.id = i.order_id
   where i.deleted_at is null and coalesce(i.status, '') in ('issued', 'paid')
     -- la stessa fattura può stare in entrambe le tabelle (stesso numero): si conta una volta
     and not exists (select 1 from public.documenti_fiscali df where df.company_id = o.company_id
                      and df.numero = i.invoice_number and df.deleted_at is null)
),
quota_costi as (
  select c.id, c.amount, c.vat_rate, coalesce(c.senza_fattura, false) as senza_fattura,
         case when jsonb_typeof(c.allocations) = 'array' and jsonb_array_length(c.allocations) > 0 then
           coalesce((select sum(case when (a->>'pct') ~ '^[0-9]+(\.[0-9]+)?$' then (a->>'pct')::numeric else 0 end)
                       from jsonb_array_elements(c.allocations) a where a->>'order_id' = p_order_id::text), 0) / 100
         else 1 end as quota
    from public.company_costs c join o on o.company_id = c.company_id
   where c.order_id = p_order_id
      or (jsonb_typeof(c.allocations) = 'array' and c.allocations @> jsonb_build_array(jsonb_build_object('order_id', p_order_id::text)))
),
fatture_acquisto as (
  -- una volta sola per fattura: dal costo (con la sua quota) o dal contratto di subappalto della commessa
  select distinct on (fr.id) fr.id, fr.tipo_documento, fr.iva_totale, fr.imponibile_totale,
         coalesce(qc.quota, 1) as quota
    from public.fatture_ricevute fr
    join o on o.company_id = fr.company_id
    left join quota_costi qc on qc.id = fr.company_cost_id
    left join public.contratti_subappalto k on k.id = fr.contratto_subappalto_id
   where (qc.id is not null or k.order_id = p_order_id)
     and coalesce(fr.stato, '') not in ('annullata', 'scartata', 'rifiutata')
   order by fr.id, (qc.id is not null) desc
),
acquisti as (
  select
    coalesce(sum(case when tipo_documento in ('TD04', 'TD08', 'passive_credit_note') then -iva_totale else iva_totale end * quota)
      filter (where tipo_documento not in ('TD16', 'TD17', 'TD18', 'TD19', 'self_invoice')), 0) as iva,
    coalesce(sum(case when tipo_documento in ('TD04', 'TD08', 'passive_credit_note') then -imponibile_totale else imponibile_totale end * quota)
      filter (where tipo_documento not in ('TD16', 'TD17', 'TD18', 'TD19', 'self_invoice')), 0) as imponibile,
    coalesce(sum(iva_totale * quota) filter (where tipo_documento in ('TD16', 'TD17', 'TD18', 'TD19', 'self_invoice')), 0) as iva_integrata_fatture,
    count(*) as documenti
    from fatture_acquisto
),
costi_senza_fe as (
  -- costi con IVA registrati a mano, senza fattura elettronica collegata: credito previsto
  select coalesce(sum(qc.amount * coalesce(qc.vat_rate, 0) / 100 * qc.quota), 0) as iva, count(*) as costi
    from quota_costi qc
   where not qc.senza_fattura and coalesce(qc.vat_rate, 0) > 0
     and not exists (select 1 from public.fatture_ricevute fr where fr.company_cost_id = qc.id
                      and coalesce(fr.stato, '') not in ('annullata', 'scartata', 'rifiutata'))
),
ditte as (
  -- previsto delle ditte senza costo collegato: con IVA in fattura è credito; a IVA 0 è reverse charge
  select coalesce(sum(oet.total_cost - oet.total_cost / (1 + coalesce(oet.vat_rate, et.vat_rate) / 100))
           filter (where coalesce(oet.vat_rate, et.vat_rate, 0) > 0), 0) as iva_credito,
         coalesce(sum(oet.total_cost) filter (where coalesce(oet.vat_rate, et.vat_rate, 0) = 0), 0) as imponibile_rc
    from public.order_external_teams oet join o on o.id = oet.order_id
    left join public.external_teams et on et.id = oet.external_team_id
   where coalesce(oet.total_cost, 0) > 0
     and not exists (select 1 from public.company_costs cc where cc.order_external_team_id = oet.id)
),
sal_rc as (
  -- SAL dei subappaltatori in reverse charge (ditta a IVA 0 o senza ditta collegata): imponibile maturato
  select coalesce(sum(ss.importo_lordo), 0) as imponibile
    from public.sal_subappaltatori ss join o on o.id = ss.order_id
    left join public.subappaltatori_sicurezza sub on sub.id = ss.subappaltatore_id
   where ss.stato <> 'contestato'
     and not exists (select 1 from public.external_teams et where et.subappaltatore_id = sub.campo_subappaltatore_id
                      and et.company_id = ss.company_id and coalesce(et.vat_rate, 0) > 0)
),
calc as (
  select o.iva as aliquota, o.valore,
    round(v.iva + vv.iva, 2) as debito_fatturato,
    round(v.imponibile + vv.imponibile, 2) as imponibile_fatturato,
    round(o.valore * o.iva / 100, 2) as debito_previsto,
    round(v.split_payment, 2) as split_payment,
    (v.documenti + vv.documenti) as fatture_emesse,
    round(a.iva, 2) as credito_fatture, round(a.imponibile, 2) as imponibile_acquisti, a.documenti as fatture_ricevute,
    round(cs.iva, 2) as credito_previsto_costi, cs.costi as costi_senza_fattura_elettronica,
    round(d.iva_credito, 2) as credito_previsto_ditte,
    round(sr.imponibile + d.imponibile_rc, 2) as reverse_charge_imponibile,
    round((sr.imponibile + d.imponibile_rc) * o.iva / 100 + a.iva_integrata_fatture, 2) as reverse_charge_iva
  from o, vendite v, vendite_vecchie vv, acquisti a, costi_senza_fe cs, ditte d, sal_rc sr
)
select case when not exists (select 1 from o) then null else (
  select jsonb_build_object(
    'aliquota', aliquota, 'valore_commessa', valore,
    'debito_fatturato', debito_fatturato, 'imponibile_fatturato', imponibile_fatturato, 'fatture_emesse', fatture_emesse,
    'debito_previsto', debito_previsto, 'debito_da_fatturare', greatest(debito_previsto - debito_fatturato, 0),
    'split_payment', split_payment,
    'credito_fatture', credito_fatture, 'imponibile_acquisti', imponibile_acquisti, 'fatture_ricevute', fatture_ricevute,
    'credito_previsto_costi', credito_previsto_costi, 'costi_senza_fattura_elettronica', costi_senza_fattura_elettronica,
    'credito_previsto_ditte', credito_previsto_ditte,
    'reverse_charge_imponibile', reverse_charge_imponibile, 'reverse_charge_iva', reverse_charge_iva,
    'saldo_ad_oggi', round(debito_fatturato - credito_fatture, 2),
    'saldo_previsto', round(greatest(debito_previsto, debito_fatturato) - credito_fatture - credito_previsto_costi - credito_previsto_ditte, 2)
  ) from calc) end
$function$;
