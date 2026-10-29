-- Panoramica Tesoreria filtrabile per conto corrente.
--
-- Le tre RPC della panoramica sommavano sempre TUTTI i conti dell'azienda.
-- Con strutture a piu' conti (Demo 2 ne ha 8 attivi: Materiali, IVA, Stipendi,
-- Provvigioni...) un saldo complessivo sano puo' nascondere un conto in
-- sofferenza, e non c'era modo di guardarne uno solo.
--
-- Aggiungo a tutte e tre un `p_account_id` OPZIONALE: NULL = comportamento di
-- prima (tutti i conti), valorizzato = solo quel conto. Le colonne restituite
-- non cambiano, quindi le chiamate esistenti a due argomenti continuano a
-- funzionare identiche.
--
-- Vanno ricreate e non sostituite con CREATE OR REPLACE: aggiungere un
-- parametro cambia la firma, e un semplice REPLACE creerebbe un overload che
-- renderebbe ambigue le chiamate attuali. Nessun'altra funzione, vista o parte
-- del codice le usa (verificato), quindi il DROP e' sicuro; i permessi vengono
-- riassegnati identici (authenticated + service_role, mai anon).

drop function if exists public.get_treasury_summary(uuid);
drop function if exists public.get_cash_flow_by_month(uuid, integer);
drop function if exists public.get_expenses_by_category(uuid, integer);

create or replace function public.get_treasury_summary(
  p_company_id uuid,
  p_account_id uuid default null
)
returns table(total_balance numeric, total_credit_balance numeric, total_debit_balance numeric,
              accounts_count bigint, connections_count bigint, monthly_income numeric,
              monthly_expenses numeric, monthly_net numeric, last_sync_at timestamp with time zone)
language plpgsql
stable security definer
set search_path to 'public'
as $function$
begin
  perform public.assert_company_access(p_company_id);
  return query
  select
    (select coalesce(sum(ba.current_balance), 0) from public.bank_accounts ba
      where ba.company_id = p_company_id and ba.is_active = true
        and (p_account_id is null or ba.id = p_account_id)),
    (select coalesce(sum(ba.current_balance), 0) from public.bank_accounts ba
      where ba.company_id = p_company_id and ba.is_active = true and ba.current_balance > 0
        and (p_account_id is null or ba.id = p_account_id)),
    (select coalesce(sum(ba.current_balance), 0) from public.bank_accounts ba
      where ba.company_id = p_company_id and ba.is_active = true and ba.current_balance < 0
        and (p_account_id is null or ba.id = p_account_id)),
    (select count(*) from public.bank_accounts ba
      where ba.company_id = p_company_id and ba.is_active = true
        and (p_account_id is null or ba.id = p_account_id)),
    -- Connessioni e ultima sincronizzazione restano dell'azienda: una
    -- connessione bancaria serve piu' conti, non e' un dato del singolo conto.
    (select count(*) from public.bank_connections bc
      where bc.company_id = p_company_id and bc.status in ('active','linked')),
    (select coalesce(sum(t.amount), 0) from public.bank_transactions t
      where t.company_id = p_company_id and t.transaction_type = 'credit' and t.status = 'booked'
        and t.booking_date >= date_trunc('month', current_date)
        and (p_account_id is null or t.account_id = p_account_id)),
    (select coalesce(sum(abs(t.amount)), 0) from public.bank_transactions t
      where t.company_id = p_company_id and t.transaction_type = 'debit' and t.status = 'booked'
        and t.booking_date >= date_trunc('month', current_date)
        and (p_account_id is null or t.account_id = p_account_id)),
    (select coalesce(sum(t.amount), 0) from public.bank_transactions t
      where t.company_id = p_company_id and t.status = 'booked'
        and t.booking_date >= date_trunc('month', current_date)
        and (p_account_id is null or t.account_id = p_account_id)),
    (select max(bc.last_sync_at) from public.bank_connections bc
      where bc.company_id = p_company_id and bc.status in ('active','linked'))
  ;
end;
$function$;

create or replace function public.get_cash_flow_by_month(
  p_company_id uuid,
  p_months integer default 6,
  p_account_id uuid default null
)
returns table(month text, income numeric, expenses numeric, net numeric)
language plpgsql
stable security definer
set search_path to 'public'
as $function$
begin
  perform public.assert_company_access(p_company_id);
  return query
  select
    to_char(date_trunc('month', t.booking_date), 'YYYY-MM'),
    coalesce(sum(t.amount) filter (where t.transaction_type = 'credit'), 0),
    coalesce(sum(abs(t.amount)) filter (where t.transaction_type = 'debit'), 0),
    coalesce(sum(t.amount), 0)
  from public.bank_transactions t
  where t.company_id = p_company_id
    and t.booking_date >= date_trunc('month', current_date) - make_interval(months => p_months - 1)
    and t.status = 'booked'
    and (p_account_id is null or t.account_id = p_account_id)
  group by date_trunc('month', t.booking_date)
  order by 1 asc;
end;
$function$;

create or replace function public.get_expenses_by_category(
  p_company_id uuid,
  p_months integer default 3,
  p_account_id uuid default null
)
returns table(category text, total numeric)
language plpgsql
stable security definer
set search_path to 'public'
as $function$
begin
  perform public.assert_company_access(p_company_id);
  return query
  select coalesce(nullif(t.category, ''), 'Non categorizzata') as category,
         sum(abs(t.amount)) as total
  from public.bank_transactions t
  where t.company_id = p_company_id
    and t.transaction_type = 'debit'
    and t.status = 'booked'
    and t.booking_date >= date_trunc('month', current_date) - make_interval(months => p_months - 1)
    and (p_account_id is null or t.account_id = p_account_id)
  group by 1
  order by 2 desc;
end;
$function$;

-- Permessi identici a prima: mai PUBLIC, mai anon.
revoke all on function public.get_treasury_summary(uuid, uuid) from public, anon;
revoke all on function public.get_cash_flow_by_month(uuid, integer, uuid) from public, anon;
revoke all on function public.get_expenses_by_category(uuid, integer, uuid) from public, anon;

grant execute on function public.get_treasury_summary(uuid, uuid) to authenticated, service_role;
grant execute on function public.get_cash_flow_by_month(uuid, integer, uuid) to authenticated, service_role;
grant execute on function public.get_expenses_by_category(uuid, integer, uuid) to authenticated, service_role;
