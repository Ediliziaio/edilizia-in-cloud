-- LOCAL ROLLOUT DRAFT, NOT APPLIED. Deliberately outside supabase/migrations:
-- pushing unrelated changes must not accidentally activate platform workflows.
-- Before rollout: generate a version with "supabase migration new", verify on
-- local Postgres, then apply under the project's normal approved release process.
-- Prerequisite: automation_trigger_events.dedup_key and its unique partial index.
-- No backfill, no schedule activation, no changes to existing lifecycle triggers.

create or replace function public.enqueue_platform_support_ticket()
returns trigger language plpgsql security definer set search_path = '' as $$
declare company_record record;
begin
  select id, name, email into company_record from public.companies where id = new.company_id;
  if not found or company_record.id = '00000000-0000-0000-0000-000000000001'::uuid then return new; end if;
  insert into public.automation_trigger_events(company_id, trigger_event, entity_id, entity_type, payload, dedup_key)
  values (
    '00000000-0000-0000-0000-000000000001'::uuid, 'PLATFORM_TICKET_OPENED', new.id::text, 'ticket',
    pg_catalog.jsonb_build_object('azienda.id', company_record.id, 'azienda.name', company_record.name,
      'azienda.email', company_record.email, 'ticket.id', new.id, 'ticket.titolo', new.titolo,
      'ticket.priorita', new.urgenza),
    'platform-ticket:' || new.id::text
  ) on conflict (dedup_key) where dedup_key is not null do nothing;
  return new;
end;
$$;
revoke all on function public.enqueue_platform_support_ticket() from public, anon, authenticated;
drop trigger if exists enqueue_platform_support_ticket on public.support_tickets;
create trigger enqueue_platform_support_ticket after insert on public.support_tickets
for each row execute function public.enqueue_platform_support_ticket();

-- Source of truth is the status audit event. It already includes the reason,
-- so we don't race with the lifecycle trigger that clears its session setting.
create or replace function public.enqueue_platform_company_pause()
returns trigger language plpgsql security definer set search_path = '' as $$
declare company_record record;
begin
  if new.stato_a is null or new.stato_a not in ('suspended', 'paused') or new.stato_a is not distinct from new.stato_da then return new; end if;
  select id, name, email into company_record from public.companies where id = new.company_id;
  if not found or company_record.id = '00000000-0000-0000-0000-000000000001'::uuid then return new; end if;
  insert into public.automation_trigger_events(company_id, trigger_event, entity_id, entity_type, payload, dedup_key)
  values (
    '00000000-0000-0000-0000-000000000001'::uuid, 'PLATFORM_COMPANY_PAUSED', company_record.id::text, 'company',
    pg_catalog.jsonb_build_object('azienda.id', company_record.id, 'azienda.name', company_record.name,
      'azienda.email', company_record.email, 'pausa.motivo', new.motivo),
    'platform-pause:' || new.id::text
  ) on conflict (dedup_key) where dedup_key is not null do nothing;
  return new;
end;
$$;
revoke all on function public.enqueue_platform_company_pause() from public, anon, authenticated;
drop trigger if exists enqueue_platform_company_pause on public.company_status_events;
create trigger enqueue_platform_company_pause after insert on public.company_status_events
for each row execute function public.enqueue_platform_company_pause();
