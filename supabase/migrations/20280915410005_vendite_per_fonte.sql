-- Vendite per fonte sulla definizione unica (20280915410001).
--
-- Sales OS → Analisi calcolava la conversione per fonte nel browser: vinte
-- diviso TUTTE le opportunità, aperte comprese (per BeMade 0,1% contro il 100%
-- del resto della stessa pagina), dall'inizio del periodo senza una fine,
-- cancellate incluse. Qui:
--   · create        opportunità create nel periodo
--   · vinte/perse   per won_at / lost_at nel periodo
--   · tasso chiusura vinte ÷ (vinte + perse), lo stesso di tutti i report
--   · conversione   quante delle create nel periodo sono già state vinte
-- La fonte è quella dell'opportunità, altrimenti quella del contatto.

set local lock_timeout = '3s';
set local statement_timeout = '60s';

create or replace function public.vendite_per_fonte(
  p_company uuid,
  p_da date,
  p_a date,
  p_venditore uuid default null,
  p_pipeline uuid default null
)
returns table (
  fonte text,
  contatti bigint,
  create_n bigint,
  vinte bigint,
  perse bigint,
  valore_vinto numeric,
  ticket_medio numeric,
  tasso_chiusura numeric,
  conversione numeric
)
language sql
stable
as $$
  select coalesce(nullif(btrim(o.source), ''), nullif(btrim(c.source), ''), 'Sconosciuto'),
         count(distinct v.contact_id) filter (where v.creata),
         count(*) filter (where v.creata),
         count(*) filter (where v.vinta),
         count(*) filter (where v.persa),
         coalesce(sum(v.valore) filter (where v.vinta), 0),
         round(avg(v.valore) filter (where v.vinta), 2),
         round(100.0 * count(*) filter (where v.vinta) / nullif(count(*) filter (where v.vinta or v.persa), 0), 1),
         round(100.0 * count(*) filter (where v.creata and v.stato = 'won') / nullif(count(*) filter (where v.creata), 0), 1)
    from public.vendite_opportunita(p_company, p_da, p_a, p_venditore, p_pipeline) v
    join public.marketing_opportunities o on o.id = v.id
    left join public.marketing_contacts c on c.id = v.contact_id
   where v.creata or v.vinta or v.persa
   group by 1
$$;

revoke all on function public.vendite_per_fonte(uuid, date, date, uuid, uuid) from public, anon;
grant execute on function public.vendite_per_fonte(uuid, date, date, uuid, uuid) to authenticated, service_role;
