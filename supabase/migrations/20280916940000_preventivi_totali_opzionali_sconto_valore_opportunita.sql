-- Preventivi: totali coerenti con sconto e righe opzionali, valore dell'opportunità
-- dal preventivo giusto.
--
-- 1. do_recalculate_quote_totals sommava anche le righe OPZIONALI, che builder,
--    PDF e commessa tengono fuori dal totale: elenco, email e valore
--    dell'opportunità mostravano più di quanto proposto.
-- 2. Lo sconto cambiato senza toccare le righe (autosave del builder,
--    decide_quote_approval) lasciava sconto, IVA e totale col vecchio sconto:
--    OFF-2026-002 ha sconto 1,30% ma importi calcolati allo 0,9%.
-- 3. recompute_opportunity_value contava anche i preventivi nel cestino o
--    annullati (cestinarne uno lo rendeva il più recente) e per il fotovoltaico
--    prendeva costo_totale_netto, che è il costo d'acquisto, invece del prezzo.
--
-- Solo funzioni e un trigger: nessuna riga riscritta.

SET LOCAL lock_timeout = '3s';
SET LOCAL statement_timeout = '60s';

CREATE OR REPLACE FUNCTION public.do_recalculate_quote_totals(p_quote_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  WITH agg AS (
    SELECT
      COALESCE(SUM(line_total), 0)                              AS subtotale,
      COALESCE(SUM(ROUND(line_total * vat_rate / 100, 2)), 0)   AS iva_lorda
    FROM public.quote_items
    WHERE quote_id = p_quote_id
      AND COALESCE(is_optional, false) = false
  )
  UPDATE public.quotes q
  SET
    subtotal        = a.subtotale,
    discount_amount = ROUND(a.subtotale * COALESCE(q.discount_percent, 0) / 100, 2),
    vat_amount      = ROUND(a.iva_lorda  * (1 - COALESCE(q.discount_percent, 0) / 100), 2),
    total           = a.subtotale
                      - ROUND(a.subtotale * COALESCE(q.discount_percent, 0) / 100, 2)
                      + ROUND(a.iva_lorda  * (1 - COALESCE(q.discount_percent, 0) / 100), 2),
    updated_at      = now()
  FROM agg a
  WHERE q.id = p_quote_id;
END;
$function$;

-- Lo sconto cambiato ricalcola i totali. Il ricalcolo non scrive discount_percent,
-- quindi non fa ripartire questo trigger.
CREATE OR REPLACE FUNCTION public.trg_quotes_ricalcola_su_sconto()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.discount_percent IS DISTINCT FROM OLD.discount_percent THEN
    PERFORM public.do_recalculate_quote_totals(NEW.id);
  END IF;
  RETURN NULL;
END;
$function$;

REVOKE ALL ON FUNCTION public.trg_quotes_ricalcola_su_sconto() FROM PUBLIC, anon;

DROP TRIGGER IF EXISTS trg_quotes_ricalcola_su_sconto ON public.quotes;
CREATE TRIGGER trg_quotes_ricalcola_su_sconto
  AFTER UPDATE OF discount_percent ON public.quotes
  FOR EACH ROW EXECUTE FUNCTION public.trg_quotes_ricalcola_su_sconto();

CREATE OR REPLACE FUNCTION public.recompute_opportunity_value(p_opp uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  won_states text[] := array['accettato','accettata','firmato','firmata','approvato','approvata','da_consegnare','consegnato','venduto','vinto'];
  v_total   numeric;
  v_company uuid;
begin
  if p_opp is null then
    return;
  end if;

  -- Solo preventivi vivi: fuori il cestino e i preventivi annullati.
  with cand as (
    select q.total::numeric                                  as total,
           (lower(coalesce(q.status,'')) = any(won_states))  as accepted,
           coalesce(q.updated_at, q.created_at)              as ts,
           q.company_id                                      as company_id
    from public.quotes q
    where q.opportunity_id = p_opp and coalesce(q.total,0) > 0
      and q.deleted_at is null
    union all
    select coalesce(r.totale, r.totale_imponibile)::numeric,
           (lower(coalesce(r.stato,'')) = any(won_states)),
           coalesce(r.updated_at, r.created_at),
           r.company_id
    from public.rst_progetti r
    where r.opportunita_id = p_opp and coalesce(r.totale, r.totale_imponibile, 0) > 0
      and r.deleted_at is null
    union all
    -- Fotovoltaico: il prezzo di vendita. costo_totale_netto è il costo d'acquisto.
    select coalesce(nullif(f.prezzo_vendita_iva_inclusa, 0), f.prezzo_vendita_manuale, f.finanziamento_totale_dovuto_eur)::numeric,
           (lower(coalesce(f.stato,'')) = any(won_states)),
           coalesce(f.updated_at, f.created_at),
           f.company_id
    from public.fv_progetti f
    where f.opportunita_crm_id = p_opp
      and coalesce(nullif(f.prezzo_vendita_iva_inclusa, 0), f.prezzo_vendita_manuale, f.finanziamento_totale_dovuto_eur, 0) > 0
      and f.deleted_at is null
      and coalesce(f.stato, '') <> 'annullato'
    union all
    select coalesce(s.totale_max, s.totale_min)::numeric,
           (lower(s.stato::text) = any(won_states)),
           coalesce(s.updated_at, s.created_at),
           s.company_id
    from public.sr_progetti s
    where s.opportunita_id = p_opp and coalesce(s.totale_max, s.totale_min, 0) > 0
      and s.deleted_at is null
  )
  select total, company_id
    into v_total, v_company
  from cand
  order by accepted desc, ts desc nulls last
  limit 1;

  if v_total is not null then
    update public.marketing_opportunities
       set value = v_total
     where id = p_opp
       and company_id = v_company
       and value is distinct from v_total;
  end if;
end;
$function$;
