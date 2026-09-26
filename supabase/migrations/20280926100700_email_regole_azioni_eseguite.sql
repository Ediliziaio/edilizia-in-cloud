-- Regole email: le azioni oltre la categoria fanno davvero qualcosa (26/09/2026).
--
-- La pagina delle regole (EmailRulesSettings) offriva «Imposta priorità»,
-- «Silenzia», «Marca da fare», «Etichetta» e «Salta AI», ma la cascata del server
-- (_shared/email-ai-cascade.ts) applicava solo la categoria. Da oggi, deciso con
-- Florin:
--   - «Silenzia» segna l'email come letta (is_read): non conta tra le non lette;
--   - «Marca da fare» la contrassegna con la stella (is_starred, «Contrassegnata»);
--   - «Imposta priorità» scrive ai_priority, e l'AI non la cambia più.
-- «Etichetta» (nessuna pagina mostra le etichette) e «Salta AI» (una regola che
-- scatta salta già l'AI) spariscono dalla pagina.
--
-- regola_applicata_at: quando la regola ha agito sull'email. Il cron L1 ripassa
-- ogni 5 minuti sulle email ancora senza categoria: senza questo segno
-- rimetterebbe la stella o il «letta» che l'utente ha appena tolto.
-- regola_priorita: la priorità decisa dalla regola. Il trigger la rimette in
-- ai_priority a ogni scrittura: email-triage-ai ed email-ai-assistant scrivono
-- ai_priority in quattro punti, e la regola deve vincere su tutti.
--
-- Solo colonne nuove e vuote su email_inbox (circa 3.900 righe): niente
-- riscritture di dati.

set local lock_timeout = '3s';
set local statement_timeout = '60s';

alter table public.email_inbox add column if not exists regola_applicata_at timestamptz;
alter table public.email_inbox add column if not exists regola_priorita text;

alter table public.email_inbox drop constraint if exists email_inbox_regola_priorita_valida;
alter table public.email_inbox add constraint email_inbox_regola_priorita_valida
  check (regola_priorita is null or regola_priorita in ('alta', 'media', 'bassa'));

comment on column public.email_inbox.regola_applicata_at is
  'Quando una regola di email_regole ha agito sull''email (letta, stella, priorità): una volta sola. Null = nessuna regola.';
comment on column public.email_inbox.regola_priorita is
  'Priorità decisa da una regola email: il trigger email_inbox_priorita_della_regola la tiene in ai_priority contro le scritture dell''AI.';

create or replace function public.email_inbox_priorita_della_regola()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.regola_priorita is not null then
    new.ai_priority := new.regola_priorita;
  end if;
  return new;
end;
$$;

comment on function public.email_inbox_priorita_della_regola() is
  'Trigger: se una regola email ha deciso la priorità, ai_priority resta quella (26/09/2026).';

-- Funzione di trigger: nessuno deve poterla chiamare (lo scatto non controlla EXECUTE).
revoke all on function public.email_inbox_priorita_della_regola() from public, anon, authenticated;

drop trigger if exists email_inbox_priorita_della_regola on public.email_inbox;
create trigger email_inbox_priorita_della_regola
  before update of ai_priority, regola_priorita on public.email_inbox
  for each row execute function public.email_inbox_priorita_della_regola();
