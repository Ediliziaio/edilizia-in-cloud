-- Le automazioni AI e i messaggi automatici ai clienti partono solo se
-- l'azienda li accende (19/10/2026).
--
-- Erano accesi di base per tutte le aziende, senza un interruttore nell'app:
--   - morning_briefing_enabled: il brief AI ai capomastri (27 aziende accese,
--     tutte per il valore di base, mai partito);
--   - giornale_auto_enabled: il giornale di cantiere scritto dall'AI ogni sera
--     (27 aziende accese per il valore di base).
-- Ora sono spenti di base e si accendono da Impostazioni → Automazioni AI.
-- Nuova: promemoria_preventivo_cliente, l'email al cliente a 3 e a 1 giorno
-- dalla scadenza dell'offerta (prima partiva sempre). Il promemoria interno a
-- chi ha fatto il preventivo resta.
--
-- Rilanciabile. La tabella delle aziende è piccola: le scritture sono immediate.

set local lock_timeout = '3s';
set local statement_timeout = '60s';

alter table public.companies alter column morning_briefing_enabled set default false;
alter table public.companies alter column giornale_auto_enabled set default false;
alter table public.companies add column if not exists promemoria_preventivo_cliente boolean not null default false;

update public.companies set morning_briefing_enabled = false where morning_briefing_enabled;
update public.companies set giornale_auto_enabled = false where giornale_auto_enabled;
