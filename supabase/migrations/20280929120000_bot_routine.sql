-- Le automazioni del bot operativo, configurabili dal titolare (28/09/2026).
--
-- Una «routine» dice al bot cosa mandare da solo, a chi e quando: il report del
-- mattino, le cose del giorno a ogni operaio, gli avvisi. Le crea/spegne il
-- titolare dalla schermata «Automazioni del bot»; il dispatcher bot-routine-dispatch
-- (pg_cron) le esegue. Qui: la tabella + la funzione che raccoglie i numeri del
-- report del mattino.

set lock_timeout = '5s';

create table if not exists public.bot_routine (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null,
  wa_number_id uuid not null references public.ai_whatsapp_numbers(id) on delete cascade,
  tipo text not null check (tipo in ('report_mattino','todo_operaio','avviso','promemoria_appuntamento')),
  attiva boolean not null default true,
  ora time,                                 -- ora italiana, per report/to-do
  giorni int[] not null default '{1,2,3,4,5}',-- 1=lun … 7=dom
  destinatari jsonb not null default '{}'::jsonb, -- {ruoli?:[], utenti?:[], ogni_operaio?:bool}
  regole jsonb not null default '{}'::jsonb,      -- soglie per gli avvisi
  template_nome text,                       -- modello Meta per fuori finestra 24h
  creata_da uuid,
  creata_il timestamptz not null default now(),
  aggiornata_il timestamptz not null default now()
);
create index if not exists idx_bot_routine_azienda on public.bot_routine(company_id, attiva);

alter table public.bot_routine enable row level security;
do $$ begin
  if not exists (select 1 from pg_policy where polrelid='public.bot_routine'::regclass and polname='bot_routine_accesso_azienda') then
    create policy bot_routine_accesso_azienda on public.bot_routine
      for all using (public.user_can_access_company(company_id))
      with check (public.user_can_access_company(company_id));
  end if;
end $$;
revoke all on public.bot_routine from anon;

-- I numeri del report del mattino di un'azienda (read-only).
create or replace function public.bot_report_mattino_dati(p_company_id uuid)
returns jsonb
language sql
security definer
set search_path = public
stable
as $$
  select jsonb_build_object(
    'commesse_attive', (
      select count(*) from public.orders o
      where o.company_id = p_company_id and o.status in ('active','in_corso','confermato') and o.deleted_at is null),
    'scaduto', (
      select jsonb_build_object('n', count(*), 'tot', coalesce(sum(i.amount),0))
      from public.order_installments i join public.orders o on o.id = i.order_id
      where o.company_id = p_company_id and coalesce(i.is_paid,false) = false and i.expected_date < current_date),
    'in_scadenza_7gg', (
      select jsonb_build_object('n', count(*), 'tot', coalesce(sum(i.amount),0))
      from public.order_installments i join public.orders o on o.id = i.order_id
      where o.company_id = p_company_id and coalesce(i.is_paid,false) = false
        and i.expected_date >= current_date and i.expected_date < current_date + 7),
    'sotto_scorta', (
      select count(*) from public.warehouse_stock w
      where w.company_id = p_company_id and coalesce(w.quantity,0) < coalesce(w.min_stock_level,0) and coalesce(w.min_stock_level,0) > 0)
  );
$$;

revoke all on function public.bot_report_mattino_dati(uuid) from public, anon;
grant execute on function public.bot_report_mattino_dati(uuid) to authenticated, service_role;

comment on table public.bot_routine is 'Automazioni del bot operativo WhatsApp: report mattino, to-do operai, avvisi, promemoria — configurate dal titolare.';
