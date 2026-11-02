-- RiBa in arrivo: l'amministratore lo sa cinque giorni prima, col totale (lotto 5 di
-- docs/piano-costi-commessa.md, B4, 01/11/2026).
--
-- Prima: le RiBa dei fornitori si vedevano solo aprendo il previsionale o la scheda del fornitore.
-- L'addebito arrivava senza preavviso, e un conto scoperto se ne accorgeva dall'insoluto.
--
-- Ora, ogni mattina alle 06:15 UTC, riba_avvisa_in_arrivo():
--   · prende le rate RiBa ancora da pagare che scadono da oggi a 5 giorni;
--   · per ogni azienda manda UNA notifica agli amministratori: quante sono, il totale, la prima data e i
--     fornitori principali;
--   · ogni rata si avvisa una volta sola (riba_avvisi): la notifica del giorno dopo dice solo le nuove.
-- Il lavoro è tutto nel database: niente pg_net, niente coda dei cron.

set local lock_timeout = '3s';
set local statement_timeout = '60s';

create table if not exists public.riba_avvisi (
  rata_id uuid primary key references public.rate_fornitori(id) on delete cascade,
  company_id uuid not null references public.companies(id) on delete cascade,
  avvisata_il timestamptz not null default now()
);
alter table public.riba_avvisi enable row level security;
revoke all on table public.riba_avvisi from anon, authenticated;
comment on table public.riba_avvisi is
  'Rate RiBa già avvisate agli amministratori (riba_avvisa_in_arrivo): una notifica per rata.';

create or replace function public.riba_avvisa_in_arrivo()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_notifiche integer := 0;
  a record;
begin
  for a in
    with prossime as (
      select r.id, r.company_id, r.scadenza, coalesce(r.importo, 0) as importo,
             coalesce(nullif(btrim(s.name), ''), nullif(btrim(f.cedente_ragione_sociale), ''), 'Fornitore') as fornitore
        from public.rate_fornitori r
        join public.company_costs c on c.id = r.company_cost_id
        left join public.suppliers s on s.id = c.supplier_id
        left join public.fatture_ricevute f on f.id = r.fattura_ricevuta_id
       where r.metodo = 'riba'
         and r.stato in ('da_pagare', 'avvisata')
         and r.scadenza between current_date and current_date + 5
         and not exists (select 1 from public.riba_avvisi x where x.rata_id = r.id)
    ), per_fornitore as (
      select company_id, fornitore, sum(importo) as totale
        from prossime group by company_id, fornitore
    )
    select p.company_id,
           count(*) as quante,
           sum(p.importo) as totale,
           min(p.scadenza) as prima,
           array_agg(p.id) as rate,
           (select string_agg(pf.fornitore || ' ' || translate(to_char(pf.totale, 'FM999,999,990.00'), ',.', '.,') || ' €', ', ' order by pf.totale desc)
              from (select * from per_fornitore x where x.company_id = p.company_id order by x.totale desc limit 4) pf) as chi
      from prossime p
     group by p.company_id
  loop
    insert into public.notifications (company_id, user_id, type, title, body, entity_type, entity_id, action_url)
    select a.company_id, pr.id, 'riba_in_arrivo',
           case when a.quante = 1 then 'Una RiBa in addebito entro 5 giorni: '
                else a.quante || ' RiBa in addebito entro 5 giorni: ' end
             || translate(to_char(a.totale, 'FM999,999,990.00'), ',.', '.,') || ' €',
           left('Dal ' || to_char(a.prima, 'DD/MM') || '. ' || coalesce(a.chi, '')
                || '. Controlla che sul conto ci siano i soldi.', 300),
           'riba', null, '/azienda/previsionale'
      from public.profiles pr
     where pr.company_id = a.company_id
       and not coalesce(pr.is_blocked, false)
       and exists (select 1 from public.user_roles ur
                    where ur.user_id = pr.id and ur.role = 'company_admin'::public.app_role);
    insert into public.riba_avvisi (rata_id, company_id)
    select unnest(a.rate), a.company_id
    on conflict (rata_id) do nothing;
    v_notifiche := v_notifiche + 1;
  end loop;
  return v_notifiche;
end $$;
revoke all on function public.riba_avvisa_in_arrivo() from public, anon, authenticated;
grant execute on function public.riba_avvisa_in_arrivo() to service_role;

select cron.unschedule('riba-avviso-in-arrivo') where exists (select 1 from cron.job where jobname = 'riba-avviso-in-arrivo');
select cron.schedule('riba-avviso-in-arrivo', '15 6 * * *', $$select public.riba_avvisa_in_arrivo();$$);
