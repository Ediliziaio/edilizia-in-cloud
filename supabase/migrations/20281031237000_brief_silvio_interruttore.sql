-- Brief di Silvio del mattino: un interruttore suo, per azienda (31/10/2026).
--
-- Florin: «i brief non sono attivi per nessuna azienda: si devono poter
-- attivare e disattivare». Dal 19/10 il brief di Silvio nella chat dell'app
-- partiva solo con la routine «Report del mattino» del bot WhatsApp accesa:
-- un'azienda senza numero WhatsApp collegato non poteva accenderlo per niente,
-- e al 31/10 nessuna delle 32 aziende lo aveva.
--
-- Ora si accende in Impostazioni → Automazioni AI → «Cosa parte da solo»:
--   spento        — non parte (come oggi per tutti: nessuno lo riceve a sorpresa);
--   responsabili  — agli amministratori dell'azienda che usano l'app;
--   tutti         — a chi ha usato l'app negli ultimi 14 giorni.
-- La routine WhatsApp «Report del mattino» resta valida come prima: chi l'ha
-- accesa continua a riceverlo.

set local lock_timeout = '3s';

alter table public.companies
  add column if not exists silvio_brief_mattino text not null default 'spento';

alter table public.companies drop constraint if exists companies_silvio_brief_mattino_check;
alter table public.companies add constraint companies_silvio_brief_mattino_check
  check (silvio_brief_mattino in ('spento', 'responsabili', 'tutti'));

comment on column public.companies.silvio_brief_mattino is
  'Brief di Silvio del mattino nella chat dell''app: spento, responsabili (amministratori) o tutti (chi usa l''app). Impostazioni → Automazioni AI.';
