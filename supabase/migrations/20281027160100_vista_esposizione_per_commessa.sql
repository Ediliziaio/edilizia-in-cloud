-- L'esposizione di cassa calcolata commessa per commessa (censita di nuovo il 27/10/2026).
--
-- Preparata il 12/10/2026 insieme alla marginalità e non applicata. La marginalità è stata riscritta nel
-- frattempo (rientri di magazzino, ripartizioni dei costi, IVA delle squadre esterne) e va rifatta a parte:
-- questa vista è rimasta come era, e si applica da sola.
--
-- v_ordine_esposizione sommava ogni tabella figlia (rate, costi, dipendenti, squadre, provvigioni) con un GROUP
-- BY su TUTTE le commesse di tutte le aziende, e poi univa il risultato alle commesse richieste. Con
-- security_invoker le regole RLS si valutano su ogni riga sommata: anche per mostrare 15 commesse si leggevano
-- le tabelle intere. Misurato in produzione, amministratore con 15 commesse:
--
--   esposizione, commesse in rosso   374 ms di pianificazione + 283 ms
--
-- Ora ogni importo è una sottoquery sulla commessa (order_id = o.id, tutte con indice) dentro una LATERAL con
-- OFFSET 0: si leggono solo le righe delle commesse richieste, ogni somma si calcola una volta per commessa, e
-- le somme delle colonne non richieste non si calcolano affatto.
--
-- Stesse colonne, stessi tipi, stesso ordine, stesse regole di calcolo, security_invoker come prima: le regole
-- RLS delle tabelle valgono per chi legge. Tutti gli importi sono numeric, la somma non dipende dall'ordine
-- delle righe.
--
-- Provata il 27/10/2026 in produzione, in transazioni annullate, con la vista nuova in pg_temp:
--   · tutte le 759 commesse, EXCEPT nei due versi → 0 righe di differenza;
--   · 20 utenti delle quattro aziende con più commesse, 385 righe lette in tutto → 0 differenze, né nelle righe
--     viste né negli importi.
--
-- CREATE OR REPLACE VIEW tiene GRANT e dipendenze. Prende un lock esclusivo sulla vista: lock_timeout evita di
-- restare in coda dietro una lettura lunga. Rilanciabile: la vista deve avere la definizione censita il
-- 27/10/2026 (impronta md5) oppure essere già quella nuova.

set local lock_timeout = '3s';
set local statement_timeout = '60s';
-- Il testo della vista (pg_get_viewdef) dipende dal search_path: lo stesso del censimento, così le impronte si
-- confrontano alla pari.
set local search_path = "$user", public, extensions;

do $$
declare
  -- [impronta censita il 27/10/2026, impronta nuova] di pg_get_viewdef.
  v_attese constant text[] := array['359bb6cefa39c32ab1914c70b91e7a1b', 'c62407593a64dfaa3f47d00e530847b5'];
  v_impronta text;
begin
  v_impronta := md5(pg_get_viewdef('public.v_ordine_esposizione'::regclass, true));
  if not (v_impronta = any (v_attese)) then
    raise exception 'La vista v_ordine_esposizione è cambiata dopo il censimento del 27/10/2026 (impronta %): rivedere prima di sostituirla', v_impronta;
  end if;
end $$;

create or replace view public.v_ordine_esposizione
with (security_invoker = on) as
select b.id,
    b.company_id,
    b.order_code,
    b.description,
    b.current_status_id,
    b.incassato,
    b.uscite_pagate,
    b.incassato - b.uscite_pagate as saldo
  from (
    select o.id,
        o.company_id,
        o.order_code,
        o.description,
        o.current_status_id,
        case
          when coalesce(r.n_rate, 0) > 0 then
            coalesce(r.incassato_semplice, 0::numeric)
            + case
                when r.balance_pagata then greatest(0::numeric,
                  coalesce(o.total_amount, 0::numeric) * (1::numeric + coalesce(o.vat_rate, 22::numeric) / 100.0)
                  - coalesce(r.non_balance_sum, 0::numeric) - coalesce(o.financing_cost, 0::numeric))
                else 0::numeric
              end
          else
            case when o.deposit_paid then greatest(coalesce(o.deposit_amount, 0::numeric), 0::numeric) else 0::numeric end
            + case when o.deposit_2_paid then greatest(coalesce(o.deposit_2_amount, 0::numeric), 0::numeric) else 0::numeric end
            + case
                when o.balance_paid and coalesce(o.balance_amount, 0::numeric) > 0::numeric then greatest(0::numeric,
                  coalesce(o.total_amount, 0::numeric) * (1::numeric + coalesce(o.vat_rate, 22::numeric) / 100.0)
                  - greatest(coalesce(o.deposit_amount, 0::numeric), 0::numeric)
                  - greatest(coalesce(o.deposit_2_amount, 0::numeric), 0::numeric)
                  - greatest(coalesce(o.financing_amount, 0::numeric), 0::numeric)
                  - coalesce(o.financing_cost, 0::numeric))
                else 0::numeric
              end
        end as incassato,
        coalesce(u.uscite_pagate, 0::numeric) as uscite_pagate
      from orders o
      -- Le rate della commessa.
      cross join lateral (
        select count(*)::integer as n_rate,
               sum(case when oi.type <> 'balance'::text then greatest(oi.amount, 0::numeric) else 0::numeric end) as non_balance_sum,
               sum(case when oi.is_paid and (oi.type <> all (array['balance'::text, 'financing'::text]))
                        then greatest(oi.amount, 0::numeric) else 0::numeric end) as incassato_semplice,
               bool_or(oi.is_paid and oi.type = 'balance'::text) as balance_pagata
          from order_installments oi
         where oi.order_id = o.id
        offset 0
      ) r
      -- Le uscite pagate della commessa.
      cross join lateral (
        select sum(x.v) as uscite_pagate
          from (select cc.amount * (1::numeric + coalesce(cc.vat_rate, 0::numeric) / 100.0) as v
                  from company_costs cc
                 where cc.order_id = o.id and cc.is_paid
                union all
                select coalesce(oe.total_cost, 0::numeric)
                  from order_employees oe
                 where oe.order_id = o.id and oe.is_paid
                union all
                select coalesce(ot.total_cost, 0::numeric)
                  from order_external_teams ot
                 where ot.order_id = o.id and ot.is_paid
                union all
                select greatest(greatest(coalesce(os.commission_amount, 0::numeric), 0::numeric)
                                - greatest(coalesce(os.deduction_amount, 0::numeric), 0::numeric), 0::numeric)
                  from order_salespeople os
                 where os.order_id = o.id and os.is_paid) x
        offset 0
      ) u
  ) b;
