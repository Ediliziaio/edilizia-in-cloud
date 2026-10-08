-- READ ONLY. Verified ledger rows with absent credit history, 2026-10-07.
-- NEVER call charge_ai_call to repair these: that risks charging a second time.
-- Saldo_prima/saldo_dopo are mandatory but unavailable in these ledger records.
-- Therefore no automatic INSERT and no invented zero balances. Recover signed
-- historical evidence first, then review an explicit history-only repair.
begin read only;
with targets(id, expected_amount) as (values
  ('3b1f40eb-f4fe-4b14-8245-2d136157c1a1'::uuid, 0.43198623::numeric),
  ('ecba26e1-3046-4611-b574-c609db7d69e0'::uuid, 0.08695995::numeric)
)
select l.id as ledger_id, l.company_id, l.created_at, l.cost_billed_eur,
  l.cost_real_usd, l.metadata ->> 'generation_id' as generation_id,
  case when exists (select 1 from public.ai_credit_transactions t where t.metadata->>'ledger_id'=l.id::text)
    then 'already_linked_no_action'
    when l.cost_billed_eur <> targets.expected_amount or l.status <> 'success' then 'stop_evidence_changed'
    else 'blocked_missing_historical_balances_do_not_recharge' end as recovery_status,
  (select count(*) from public.ai_credit_transactions t where t.company_id=l.company_id
    and abs(t.crediti)=l.cost_billed_eur
    and abs(extract(epoch from (t.creato_il-l.created_at)))<5) as possible_existing_transactions
from targets join public.ai_call_ledger l on l.id=targets.id;
rollback;
