-- Local change only. Apply before deploying the updated WhatsApp processor.
-- Keep legacy sessions/history; never transfer a pending confirmation across
-- company phone numbers or invent an employee for an office/admin account.
begin;

alter table public.whatsapp_sessions
  add column if not exists wa_number_id uuid references public.ai_whatsapp_numbers(id) on delete cascade,
  add column if not exists user_id uuid references auth.users(id) on delete cascade;
alter table public.whatsapp_sessions alter column operaio_id drop not null;

do $$ begin
  if not exists (select 1 from pg_constraint where conrelid = 'public.whatsapp_sessions'::regclass
    and conname = 'whatsapp_sessions_identity_required') then
    alter table public.whatsapp_sessions add constraint whatsapp_sessions_identity_required
      check (operaio_id is not null or user_id is not null) not valid;
  end if;
end $$;
alter table public.whatsapp_sessions validate constraint whatsapp_sessions_identity_required;

drop index if exists public.idx_wa_sessions_phone;
create unique index if not exists whatsapp_sessions_number_phone_key
  on public.whatsapp_sessions(company_id, wa_number_id, phone_number);

-- Session state grants execution permissions after a verified phone reply.
-- It must not be forgeable from an authenticated browser or anonymous client.
alter table public.whatsapp_sessions enable row level security;
revoke insert, update, delete, truncate, references, trigger on public.whatsapp_sessions from public, anon, authenticated;
grant select, insert, update, delete on public.whatsapp_sessions to service_role;
comment on column public.whatsapp_sessions.wa_number_id is
  'Conversation scope. NULL identifies retained legacy sessions, never reused for new confirmations.';
commit;
