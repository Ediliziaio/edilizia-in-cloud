-- Una definizione sola per i numeri delle vendite.
--
-- Sales OS, Reportistica → Venditori e la Dashboard marketing contavano le
-- stesse cose in modi diversi, e diversi erano sbagliati: la vittoria datata
-- con updated_at (126 vinte per 1,27 M€ finivano nel mese sbagliato: basta una
-- modifica dopo la firma; per Renova 78 vinte da ottobre ad agosto risultavano
-- tutte a settembre), le abbandonate ora «aperte» ora «perse», le cancellate
-- contate, gli appuntamenti misurati dalla spunta is_completed che nessuno ha
-- mai usato (0 su 141: Show-Up sempre 0%). Qui le regole stanno in un posto
-- solo; le funzioni dei report (20280915410002 e …003) le usano tutte.
--
-- IL DIZIONARIO
--   periodo             giorni italiani, dal primo all'ultimo compresi
--   cancellata          deleted_at valorizzato: fuori da tutto
--   creata              created_at nel periodo
--   vinta               status 'won'  e won_at  nel periodo
--   persa               status 'lost' e lost_at nel periodo
--   scartata            status 'abandoned': lead non qualificato, NON una
--                       vendita persa; fuori dal tasso di chiusura
--   aperta              status 'open', oggi
--   probabilità         quella dell'opportunità, 50% se manca (la stessa regola
--                       della striscia della pagina Opportunità)
--   appuntamento        solo calendario marketing (calendar_id, regola del
--                       titolare), niente slot bloccati, esclusi annullati e
--                       riprogrammati
--     effettuato        presentato, da_preventivare, preventivo_inviato,
--                       venduto, perso, non_qualificato, completato
--     no-show           no_show
--     senza esito       confermato (o vuoto) con la data già passata: NON è un
--                       no-show, è un esito che nessuno ha scritto
--   preventivo firmato  accettata o convertita, datato signed_at (created_at se
--                       manca), importo SENZA IVA (total - vat_amount: subtotal
--                       è prima dello sconto); il venditore è salesperson_id,
--                       poi assigned_to, poi chi l'ha creato
--
-- SECURITY INVOKER: valgono le regole di visibilità, quindi chi vede solo i
-- propri lead vede solo i propri numeri. Nomi tutti qualificati e niente
-- SET search_path: così il pianificatore può espandere queste funzioni dentro
-- la query che le chiama.

set local lock_timeout = '3s';
set local statement_timeout = '60s';

create or replace function public.vendite_opportunita(
  p_company uuid,
  p_da date,
  p_a date,
  p_venditore uuid default null,
  p_pipeline uuid default null
)
returns table (
  id uuid,
  venditore uuid,
  pipeline_id uuid,
  stage_id uuid,
  contact_id uuid,
  stato text,
  valore numeric,
  probabilita numeric,
  creata boolean,
  vinta boolean,
  persa boolean,
  aperta boolean,
  scartata boolean,
  creata_il timestamptz,
  vinta_il timestamptz,
  persa_il timestamptz,
  giorni_ciclo numeric
)
language sql
stable
as $$
  select o.id,
         o.assigned_to,
         o.pipeline_id,
         o.stage_id,
         o.contact_id,
         o.status,
         coalesce(o.value, 0)::numeric,
         greatest(0, least(100, coalesce(o.probability, 50)))::numeric,
         coalesce(o.created_at >= (p_da::timestamp at time zone 'Europe/Rome')
              and o.created_at < ((p_a + 1)::timestamp at time zone 'Europe/Rome'), false),
         coalesce(o.status = 'won'
              and o.won_at >= (p_da::timestamp at time zone 'Europe/Rome')
              and o.won_at < ((p_a + 1)::timestamp at time zone 'Europe/Rome'), false),
         coalesce(o.status = 'lost'
              and o.lost_at >= (p_da::timestamp at time zone 'Europe/Rome')
              and o.lost_at < ((p_a + 1)::timestamp at time zone 'Europe/Rome'), false),
         coalesce(o.status = 'open', false),
         coalesce(o.status = 'abandoned', false),
         o.created_at,
         case when o.status = 'won' then o.won_at end,
         case when o.status = 'lost' then o.lost_at end,
         case
           when o.status = 'won'  then round((extract(epoch from (o.won_at  - o.created_at)) / 86400.0)::numeric, 1)
           when o.status = 'lost' then round((extract(epoch from (o.lost_at - o.created_at)) / 86400.0)::numeric, 1)
         end
    from public.marketing_opportunities o
   where o.company_id = p_company
     and o.deleted_at is null
     and (p_venditore is null or o.assigned_to = p_venditore)
     and (p_pipeline is null or o.pipeline_id = p_pipeline)
$$;

create or replace function public.vendite_appuntamenti(
  p_company uuid,
  p_da date,
  p_a date,
  p_venditore uuid default null
)
returns table (
  id uuid,
  venditore uuid,
  contact_id uuid,
  opportunity_id uuid,
  data date,
  effettuato boolean,
  no_show boolean,
  senza_esito boolean,
  con_opportunita boolean,
  con_vendita boolean
)
language sql
stable
as $$
  select a.id,
         a.assigned_to,
         a.contact_id,
         a.opportunity_id,
         a.appointment_date,
         coalesce(a.status, '') in ('presentato', 'da_preventivare', 'preventivo_inviato', 'venduto',
                                    'perso', 'non_qualificato', 'completato'),
         coalesce(a.status = 'no_show', false),
         coalesce(a.status, 'confermato') = 'confermato'
           and a.appointment_date < (now() at time zone 'Europe/Rome')::date,
         -- L'opportunità è quella collegata, o una del contatto.
         a.opportunity_id is not null
           or exists (select 1 from public.marketing_opportunities o
                       where o.contact_id = a.contact_id and o.company_id = a.company_id
                         and o.deleted_at is null),
         exists (select 1 from public.marketing_opportunities o
                  where o.company_id = a.company_id and o.deleted_at is null and o.status = 'won'
                    and (o.id = a.opportunity_id or (a.opportunity_id is null and o.contact_id = a.contact_id)))
    from public.appointments a
   where a.company_id = p_company
     and a.calendar_id is not null
     and not coalesce(a.is_blocked_slot, false)
     and coalesce(a.status, '') not in ('annullato', 'riprogrammato')
     and a.appointment_date between p_da and p_a
     and (p_venditore is null or a.assigned_to = p_venditore)
$$;

create or replace function public.vendite_preventivi(
  p_company uuid,
  p_da date,
  p_a date,
  p_venditore uuid default null
)
returns table (
  firmati bigint,
  firmati_valore numeric,
  in_attesa bigint,
  in_attesa_valore numeric,
  rifiutati bigint,
  scaduti bigint,
  tasso_accettazione numeric
)
language sql
stable
as $$
  with q as (
    select q.status,
           coalesce(q.total - q.vat_amount, q.subtotal, q.total, 0)::numeric as imponibile,
           coalesce(q.signed_at, q.created_at) as firmato_il,
           q.created_at
      from public.quotes q
     where q.company_id = p_company
       and q.deleted_at is null
       and (p_venditore is null or coalesce(q.salesperson_id, q.assigned_to, q.created_by) = p_venditore)
  ), r as (
    select q.*,
           q.status in ('accettata', 'convertita') as firmato,
           q.created_at >= (p_da::timestamp at time zone 'Europe/Rome')
             and q.created_at < ((p_a + 1)::timestamp at time zone 'Europe/Rome') as creato_nel_periodo,
           q.firmato_il >= (p_da::timestamp at time zone 'Europe/Rome')
             and q.firmato_il < ((p_a + 1)::timestamp at time zone 'Europe/Rome') as firmato_nel_periodo
      from q
  )
  select count(*) filter (where firmato and firmato_nel_periodo),
         coalesce(sum(imponibile) filter (where firmato and firmato_nel_periodo), 0),
         -- in attesa di risposta: la situazione di oggi, non del periodo
         count(*) filter (where status = 'inviata'),
         coalesce(sum(imponibile) filter (where status = 'inviata'), 0),
         count(*) filter (where status = 'rifiutata' and creato_nel_periodo),
         count(*) filter (where status = 'scaduta' and creato_nel_periodo),
         -- tra i preventivi del periodo che hanno avuto una risposta
         round(100.0 * count(*) filter (where firmato and creato_nel_periodo)
               / nullif(count(*) filter (where creato_nel_periodo
                                           and (firmato or status in ('rifiutata', 'scaduta'))), 0), 1)
    from r
$$;

revoke all on function public.vendite_opportunita(uuid, date, date, uuid, uuid) from public, anon;
revoke all on function public.vendite_appuntamenti(uuid, date, date, uuid) from public, anon;
revoke all on function public.vendite_preventivi(uuid, date, date, uuid) from public, anon;
grant execute on function public.vendite_opportunita(uuid, date, date, uuid, uuid) to authenticated, service_role;
grant execute on function public.vendite_appuntamenti(uuid, date, date, uuid) to authenticated, service_role;
grant execute on function public.vendite_preventivi(uuid, date, date, uuid) to authenticated, service_role;
