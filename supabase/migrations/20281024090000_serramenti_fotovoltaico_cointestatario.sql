-- Preventivo cointestato anche in Serramenti e Fotovoltaico (24/10/2026).
--
-- Come nei preventivatori edili (20281023170000): nome, cognome e codice fiscale del
-- secondo intestatario, facoltativi. Il PDF li mostra accanto al cliente, nelle condizioni
-- e con una sua riga di firma. Aggiungere colonne facoltative non tocca le righe esistenti.
set local lock_timeout = '3s';

do $$
declare t text;
begin
  foreach t in array array['sr_progetti', 'fv_progetti'] loop
    execute format('alter table public.%I add column if not exists cointestatario_nome text', t);
    execute format('alter table public.%I add column if not exists cointestatario_cognome text', t);
    execute format('alter table public.%I add column if not exists cointestatario_codice_fiscale text', t);
  end loop;
end $$;
