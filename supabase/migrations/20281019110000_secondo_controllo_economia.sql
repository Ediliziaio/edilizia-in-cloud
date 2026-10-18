-- Secondo controllo dell'economia (19/10/2026).
--  1. Widget «Crediti scaduti» e «Cassa a 30 giorni»: dalle rate non pagate, non dal saldo
--     riassunto della commessa, che restava anche dopo il pagamento (Demo 2: 6,26 M di cui
--     5,88 M già incassati). I costi in uscita entrano IVA inclusa, come le rate.
--  2. Avviso «margine basso»: tutte le commesse aperte (anche «confermato» e «active»), non
--     solo cinque stati che nei dati quasi non esistono.
--  3. Modifica commessa: il saldo riassunto della commessa è l'ultima rata «saldo», come in
--     «Nuova commessa»; le precedenti sono SAL intermedi.
set local lock_timeout = '3s';
set local statement_timeout = '60s';

create or replace function pg_temp.correggi(p_firma text, p_cerca text, p_metti text, p_atteso text)
returns void language plpgsql as $$
declare v_def text; v_nuova text;
begin
  v_def := pg_get_functiondef(p_firma::regprocedure);
  if position(p_atteso in v_def) > 0 then return; end if;
  v_nuova := regexp_replace(v_def, p_cerca, p_metti);
  if position(p_atteso in v_nuova) = 0 then
    raise exception 'Correzione non applicata a %: il testo della funzione è diverso da quello atteso', p_firma;
  end if;
  execute v_nuova;
end $$;

-- 1 ────────────────────────────────────────────────────────────────────────────────────────
select pg_temp.correggi('public.get_metric(text,jsonb,text,text)',
  $re$ELSIF p_metric_id = 'overdue_receivables' THEN[\s\S]*?(\s*-- ═══ ORDINI \(storico\) ═══)$re$,
  $to$ELSIF p_metric_id = 'overdue_receivables' THEN
    -- Rate scadute e non pagate (IVA inclusa), come «Rate scadute».
    IF v_breakdown = 'customer' THEN
      SELECT COALESCE(jsonb_agg(jsonb_build_object('key', key, 'label', label, 'value', value) ORDER BY value DESC), '[]'::jsonb) INTO v_breakdown_rows FROM (
        SELECT o.customer_id::text AS key,
               COALESCE(p.first_name || ' ' || p.last_name, 'Cliente') AS label,
               COALESCE(SUM(i.amount), 0) AS value
        FROM order_installments i
        JOIN (select * from public.orders where deleted_at is null) o ON o.id = i.order_id
        LEFT JOIN profiles p ON p.id = o.customer_id
        WHERE o.company_id = v_company_id
          AND COALESCE(i.is_paid, false) = false
          AND i.expected_date < CURRENT_DATE
        GROUP BY o.customer_id, p.first_name, p.last_name
        LIMIT 20
      ) r;
    ELSE
      SELECT COALESCE(SUM(i.amount), 0) INTO v_value
      FROM order_installments i
      JOIN (select * from public.orders where deleted_at is null) o ON o.id = i.order_id
      WHERE o.company_id = v_company_id
        AND COALESCE(i.is_paid, false) = false
        AND i.expected_date < CURRENT_DATE;
    END IF;

  ELSIF p_metric_id = 'cashflow_forecast_30d' THEN
    -- Rate da incassare nei prossimi 30 giorni meno i costi da pagare, tutto IVA inclusa.
    SELECT
      COALESCE((SELECT SUM(i.amount) FROM order_installments i
                  JOIN (select * from public.orders where deleted_at is null) o ON o.id = i.order_id
                 WHERE o.company_id = v_company_id
                   AND COALESCE(i.is_paid, false) = false
                   AND i.expected_date BETWEEN CURRENT_DATE AND CURRENT_DATE + INTERVAL '30 days'), 0)
      -
      COALESCE((SELECT SUM(amount * (1 + COALESCE(vat_rate, 0) / 100)) FROM company_costs
                WHERE company_id = v_company_id AND is_paid = false
                  AND due_date BETWEEN CURRENT_DATE AND CURRENT_DATE + INTERVAL '30 days'), 0)
    INTO v_value;
\1$to$,
  'Rate scadute e non pagate (IVA inclusa), come «Rate scadute».');

-- 2 ────────────────────────────────────────────────────────────────────────────────────────
select pg_temp.correggi('public.get_cantieri_margine_basso(uuid,numeric)',
  $re$and o\.status in \('in_produzione', 'in_corso', 'attivo', 'aperto', 'in_lavorazione'\)$re$,
  $to$and coalesce(o.status, '') not in ('completato', 'chiuso', 'annullato', 'completed', 'cancelled', 'bozza')$to$,
  $$not in ('completato', 'chiuso', 'annullato', 'completed', 'cancelled', 'bozza')$$);

-- 3 ────────────────────────────────────────────────────────────────────────────────────────
select pg_temp.correggi('public.commessa_salva(uuid,jsonb,jsonb,jsonb,jsonb,jsonb,integer)',
  $re$sal as \(select \* from r0 where tipo = 'balance'\s+order by pos limit 1\)$re$,
  $to$sal as (select * from r0 where tipo = 'balance'   order by pos desc limit 1)$to$,
  $$where tipo = 'balance'   order by pos desc limit 1$$);
