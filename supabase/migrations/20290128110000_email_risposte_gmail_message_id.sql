-- Le risposte alle email partite da Gmail si riconoscono (09/11/2026).
--
-- email_outbox.provider_message_id per Gmail contiene l'id interno di Gmail,
-- mentre chi risponde cita il Message-ID in forma <…@…>: il confronto in
-- email_risponde_a_conversazioni non trovava mai niente, e le risposte a
-- un'email mandata dalla scheda restavano fuori dallo storico. Con le caselle
-- IMAP funzionava perché lì i due valori coincidono.
--
-- Il Message-ID vero sta in una colonna sua: provider_message_id continua a
-- servire ciò che serve adesso. Nessuna riga viene riscritta.

set local lock_timeout = '3s';
set local statement_timeout = '60s';

alter table public.email_outbox add column if not exists rfc_message_id text;
comment on column public.email_outbox.rfc_message_id is
  'Message-ID RFC dell''email spedita, quando provider_message_id è un id interno del provider (Gmail).';

create index if not exists idx_email_outbox_rfc_msgid_conversazioni
  on public.email_outbox (company_id, rfc_message_id)
  where origine = 'conversazioni' and rfc_message_id is not null;

create or replace function public.email_risponde_a_conversazioni(p_company uuid, p_in_reply_to text, p_references text[])
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $function$
  select exists (
    select 1
      from public.email_outbox o
     where o.company_id = p_company
       and o.origine = 'conversazioni'
       and (
         (o.provider_message_id is not null
          and (o.provider_message_id = p_in_reply_to or o.provider_message_id = any (coalesce(p_references, '{}'::text[]))))
         or
         (o.rfc_message_id is not null
          and (o.rfc_message_id = p_in_reply_to or o.rfc_message_id = any (coalesce(p_references, '{}'::text[]))))
       )
  )
$function$;

revoke all on function public.email_risponde_a_conversazioni(uuid, text, text[]) from public, anon, authenticated;
grant execute on function public.email_risponde_a_conversazioni(uuid, text, text[]) to service_role;
