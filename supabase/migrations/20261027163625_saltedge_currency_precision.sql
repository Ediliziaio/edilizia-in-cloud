-- Preserve native account balances, including the eight decimal places of BTC.
-- Transaction source amounts remain available in the existing immutable provider metadata.
set local lock_timeout = '3s';
set local statement_timeout = '60s';
alter table public.bank_accounts
  alter column current_balance type numeric(28,8),
  alter column available_balance type numeric(28,8);
