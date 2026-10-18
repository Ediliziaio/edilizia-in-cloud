-- Rate da incassare: una regola sola con la scheda commessa (19/10/2026).
--
-- Il «Da incassare» della commessa è il totale IVA inclusa meno l'incassato: conta la rata
-- della finanziaria (è un incasso vero) e, se il piano non ha un saldo, anche la parte non
-- coperta da rate. rate_da_incassare ora segue la stessa regola:
--   · la rata della finanziaria c'è, segnata `finanziamento`: entra nella cassa a 30 giorni,
--     resta fuori dai crediti scaduti (la paga la banca, non il cliente);
--   · piano senza saldo: una riga in più, senza data, con la parte scoperta;
--   · somme per commessa con funzioni finestra, senza rileggere le rate per ogni saldo.
-- In più: «Crediti scaduti per cliente» mostra i 20 più grandi (prima 20 a caso), e «Incassi»
-- conta anche le rate segnate pagate senza una fattura collegata.
set local lock_timeout = '3s';
set local statement_timeout = '60s';

drop function if exists public.rate_da_incassare(uuid);
create function public.rate_da_incassare(p_company uuid)
returns table (order_id uuid, installment_id uuid, expected_date date, residuo numeric, finanziamento boolean)
language sql stable security definer set search_path = public
as $$
  with o as (
    select o.id, coalesce(o.total_amount, 0) tot, coalesce(o.vat_rate, 22) iva,
           case when o.payment_type = 'financing' then coalesce(o.financing_cost, 0) else 0 end fc,
           coalesce(v.var, 0) var
      from public.orders o
      left join (select v.order_id, sum(coalesce(v.impatto_economico, 0)) var
                   from public.ordini_variazione v where v.status = 'approvato' group by v.order_id) v on v.order_id = o.id
     where o.company_id = p_company and o.deleted_at is null
  ),
  r0 as (
    select i.id, i.order_id, i.type, i.amount, i.is_paid, i.expected_date, i.documento_fiscale_id,
           row_number() over (partition by i.order_id
                              order by (i.type = 'balance') desc, i.position desc nulls last, i.id desc) as rn
      from public.order_installments i join o on o.id = i.order_id
  ),
  r as (
    select r0.*, (r0.type = 'balance' and r0.rn = 1) as finale,
           sum(case when r0.type = 'balance' and r0.rn = 1 then 0 else coalesce(r0.amount, 0) end)
             over (partition by r0.order_id) as altre,
           bool_or(r0.type = 'balance') over (partition by r0.order_id) as ha_saldo
      from r0
  )
  select r.order_id, r.id, r.expected_date,
         greatest(0, round(case when r.finale
                                then (o.tot + o.var) * (1 + o.iva / 100) - r.altre - o.fc
                                else coalesce(r.amount, 0) end, 2)
                     - coalesce(d.importo_pagato, 0)),
         r.type = 'financing'
    from r join o on o.id = r.order_id
    left join public.documenti_fiscali d on d.id = r.documento_fiscale_id
   where not coalesce(r.is_paid, false)
  union all
  -- Piano senza saldo: la parte del totale non coperta da nessuna rata.
  select s.order_id, null::uuid, null::date, s.scoperto, false
    from (select r.order_id, round((o.tot + o.var) * (1 + o.iva / 100) - o.fc - max(r.altre), 2) as scoperto
            from r join o on o.id = r.order_id
           where not r.ha_saldo
           group by r.order_id, o.tot, o.var, o.iva, o.fc) s
   where s.scoperto > 0
$$;
revoke all on function public.rate_da_incassare(uuid) from public, anon, authenticated;

create or replace function pg_temp.correggi(p_firma text, p_cerca text, p_metti text, p_atteso text)
returns void language plpgsql as $$
declare v_def text; v_nuova text;
begin
  v_def := pg_get_functiondef(p_firma::regprocedure);
  if position(p_atteso in v_def) > 0 then return; end if;
  v_nuova := regexp_replace(v_def, p_cerca, p_metti, 'g');
  if position(p_atteso in v_nuova) = 0 then
    raise exception 'Correzione non applicata a %: il testo della funzione è diverso da quello atteso', p_firma;
  end if;
  execute v_nuova;
end $$;

-- Crediti scaduti: senza la rata della finanziaria; per cliente i 20 più grandi.
select pg_temp.correggi('public.get_metric(text,jsonb,text,text)',
  $re$WHERE x\.expected_date < CURRENT_DATE AND x\.residuo > 0\s*GROUP BY o\.customer_id, p\.first_name, p\.last_name\s*LIMIT 20$re$,
  $to$WHERE x.expected_date < CURRENT_DATE AND x.residuo > 0 AND NOT x.finanziamento
        GROUP BY o.customer_id, p.first_name, p.last_name
        ORDER BY 3 DESC
        LIMIT 20$to$,
  'AND NOT x.finanziamento
        GROUP BY');
select pg_temp.correggi('public.get_metric(text,jsonb,text,text)',
  $re$FROM public\.rate_da_incassare\(v_company_id\) x\s*WHERE x\.expected_date < CURRENT_DATE;$re$,
  $to$FROM public.rate_da_incassare(v_company_id) x
       WHERE x.expected_date < CURRENT_DATE AND NOT x.finanziamento;$to$,
  'WHERE x.expected_date < CURRENT_DATE AND NOT x.finanziamento;');

-- Incassi: pagamenti delle fatture più le rate segnate pagate senza una fattura collegata.
select pg_temp.correggi('public.get_metric(text,jsonb,text,text)',
  $re$FROM invoice_payments(\s+)WHERE company_id = v_company_id AND payment_date BETWEEN v_from::date AND v_to::date$re$,
  $to$FROM (select ip.amount, ip.payment_date, ip.company_id from invoice_payments ip
            union all
            select i.amount, i.paid_date, o.company_id
              from order_installments i join public.orders o on o.id = i.order_id and o.deleted_at is null
             where coalesce(i.is_paid, false) and i.paid_date is not null
               and i.documento_fiscale_id is null and i.invoice_id is null) incassi\1WHERE company_id = v_company_id AND payment_date BETWEEN v_from::date AND v_to::date$to$,
  'and i.documento_fiscale_id is null and i.invoice_id is null) incassi');
