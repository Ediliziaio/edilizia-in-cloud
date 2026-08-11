-- Applicata direttamente in produzione dal pannello Supabase e ricostruita
-- qui dal registro migrazioni (supabase_migrations.schema_migrations),
-- per riallineare la cartella del repo alla storia reale del database.

-- ── Fatturazione VOCE: config tariffe (wholesale + prezzo cliente) ──────────────
-- Singola riga di config piattaforma (come sms_pricing_config). Il wholesale e il
-- margine NON sono visibili alle aziende: la tabella è leggibile solo dal super_admin,
-- e il consuntivo per azienda passa da una funzione SECURITY DEFINER che mostra il
-- costo cliente a tutti e wholesale/margine solo al super_admin.
create table if not exists public.voice_pricing_config (
  id                      uuid primary key default gen_random_uuid(),
  prezzo_numero_mensile   numeric not null default 8,    -- canone numero rivenduto/mese (cliente)
  costo_numero_wholesale  numeric not null default 1,    -- canone che paghi tu a Telnyx
  prezzo_min_it_fisso     numeric not null default 0.03, -- €/min cliente
  prezzo_min_it_mobile    numeric not null default 0.13,
  prezzo_min_inbound      numeric not null default 0.015,
  prezzo_min_intl         numeric not null default 0.25,
  costo_min_it_fisso      numeric not null default 0.010,-- €/min wholesale (Telnyx)
  costo_min_it_mobile     numeric not null default 0.050,
  costo_min_inbound       numeric not null default 0.005,
  costo_min_intl          numeric not null default 0.080,
  attivo                  boolean not null default true,
  updated_at              timestamptz not null default now()
);

insert into public.voice_pricing_config default values
on conflict do nothing;

alter table public.voice_pricing_config enable row level security;
drop policy if exists voice_pricing_config_admin on public.voice_pricing_config;
create policy voice_pricing_config_admin on public.voice_pricing_config
  for all using (public.is_super_admin()) with check (public.is_super_admin());

-- ── Consuntivo chiamate per azienda ─────────────────────────────────────────────
-- Classifica ogni chiamata umana (centralino) per destinazione dal numero e calcola
-- minuti (arrotondati al minuto, scatto telecom) × tariffa. Mostra il costo cliente
-- a tutti gli utenti dell'azienda; wholesale e margine solo al super_admin.
create or replace function public.get_voice_consuntivo(p_company_id uuid)
returns table(chiamate bigint, minuti numeric, costo_cliente numeric, costo_wholesale numeric, margine numeric)
language plpgsql security definer set search_path = public as $$
declare
  v_admin boolean := public.is_super_admin();
  v_my    uuid    := public.get_my_company_id();
begin
  if not v_admin and (v_my is null or v_my <> p_company_id) then
    raise exception 'not authorized';
  end if;

  return query
  with cfg as (select * from public.voice_pricing_config where attivo order by updated_at desc limit 1),
  calls as (
    select
      case
        when h.direction = 'inbound' then 'inbound'
        when regexp_replace(coalesce(h.to_number,''), '\D', '', 'g') ~ '^393' then 'it_mobile'
        when regexp_replace(coalesce(h.to_number,''), '\D', '', 'g') ~ '^39'  then 'it_fisso'
        when regexp_replace(coalesce(h.to_number,''), '\D', '', 'g') = ''      then 'it_fisso'
        else 'intl'
      end as dest,
      ceil(coalesce(h.duration_seconds, 0) / 60.0) as minuti
    from public.human_call_logs h
    where h.company_id = p_company_id and h.status in ('completed','active')
  ),
  priced as (
    select
      c.minuti,
      c.minuti * (case c.dest
        when 'it_mobile' then (select prezzo_min_it_mobile from cfg)
        when 'inbound'   then (select prezzo_min_inbound   from cfg)
        when 'intl'      then (select prezzo_min_intl      from cfg)
        else (select prezzo_min_it_fisso from cfg) end) as cli,
      c.minuti * (case c.dest
        when 'it_mobile' then (select costo_min_it_mobile from cfg)
        when 'inbound'   then (select costo_min_inbound   from cfg)
        when 'intl'      then (select costo_min_intl      from cfg)
        else (select costo_min_it_fisso from cfg) end) as whs
    from calls c
  )
  select
    count(*)::bigint,
    coalesce(sum(p.minuti), 0)::numeric,
    round(coalesce(sum(p.cli), 0), 2),
    case when v_admin then round(coalesce(sum(p.whs), 0), 2) else null end,
    case when v_admin then round(coalesce(sum(p.cli) - sum(p.whs), 0), 2) else null end
  from priced p;
end$$;

grant execute on function public.get_voice_consuntivo(uuid) to authenticated;
