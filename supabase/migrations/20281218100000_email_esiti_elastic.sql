-- Esiti delle email Elastic Email: consegne, aperture, click, rimbalzi,
-- reclami, disiscrizioni (07/11/2026).
--
-- Fino a oggi nessun esito di Elastic arrivava in piattaforma: delle 3.255
-- email Elastic dell'ultimo mese, zero avevano delivered_at, opened_at,
-- clicked_at o bounced_at. Il webhook non era mai stato chiamato. Gli esiti
-- li legge ora la edge function elastic-email-esiti da GET /v4/events, e li
-- scrive qui un lotto alla volta.
--
-- Stesse regole di email-provider-webhook:
--   · le colonne di email_delivery_log tengono il PRIMO istante (rileggere
--     un evento è innocuo);
--   · lo stato diventa bounced / spam / unsubscribed come nel webhook;
--   · rimbalzo definitivo e reclamo → blocco globale dell'indirizzo, e
--     optout_email sui contatti con quell'indirizzo;
--   · disiscrizione → blocco della sola azienda che ha spedito.
-- Conta solo ciò che si aggancia a un invio nostro (provider_id = MsgID o
-- TransactionID): un evento dell'account Elastic che non c'entra con noi
-- non blocca nessun indirizzo.

set local lock_timeout = '3s';
set local statement_timeout = '60s';

-- Senza questo indice ogni lotto leggerebbe tutta la tabella (52.000 righe).
create index if not exists email_delivery_log_provider_id_idx
  on public.email_delivery_log (provider_id)
  where provider_id is not null;

create or replace function public.email_esiti_registra(p_esiti jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_aggiornate int := 0;
  v_blocchi int := 0;
  v_contatti int := 0;
begin
  create temporary table if not exists esiti_lotto (
    provider_id text, tipo text, quando timestamptz, email text, motivo text
  ) on commit drop;
  truncate esiti_lotto;

  insert into esiti_lotto (provider_id, tipo, quando, email, motivo)
  select distinct ids.pid, e.tipo, e.quando, lower(nullif(trim(e.email), '')), e.motivo
  from jsonb_to_recordset(coalesce(p_esiti, '[]'::jsonb))
       as e(msg_id text, transaction_id text, tipo text, quando timestamptz, email text, motivo text)
  cross join lateral (values (e.msg_id), (e.transaction_id)) as ids(pid)
  where ids.pid is not null and ids.pid <> '' and e.quando is not null
    and e.tipo in ('consegnata','aperta','cliccata','rimbalzo_definitivo','non_consegnata','reclamo','disiscrizione');

  -- 1. Gli esiti sugli invii.
  with agganciati as (
    select d.id,
      min(l.quando) filter (where l.tipo = 'consegnata')    as consegnata,
      min(l.quando) filter (where l.tipo = 'aperta')        as aperta,
      min(l.quando) filter (where l.tipo = 'cliccata')      as cliccata,
      min(l.quando) filter (where l.tipo in ('rimbalzo_definitivo','non_consegnata')) as rimbalzo,
      bool_or(l.tipo = 'rimbalzo_definitivo')               as definitivo,
      min(l.quando) filter (where l.tipo = 'reclamo')       as reclamo,
      min(l.quando) filter (where l.tipo = 'disiscrizione') as disiscrizione,
      max(l.motivo) filter (where l.tipo in ('rimbalzo_definitivo','non_consegnata')) as motivo
    from esiti_lotto l
    join public.email_delivery_log d on d.provider_id = l.provider_id and d.provider = 'elastic_email'
    group by d.id
  ), aggiornate as (
    update public.email_delivery_log d set
      delivered_at    = coalesce(d.delivered_at, a.consegnata),
      -- Chi clicca ha aperto, anche se il pixel non è stato caricato.
      opened_at       = coalesce(d.opened_at, a.aperta, a.cliccata),
      clicked_at      = coalesce(d.clicked_at, a.cliccata),
      bounced_at      = coalesce(d.bounced_at, a.rimbalzo),
      bounce_type     = case when a.rimbalzo is null then d.bounce_type
                             when a.definitivo then 'hard'
                             else coalesce(d.bounce_type, 'soft') end,
      complaint_at    = coalesce(d.complaint_at, a.reclamo),
      unsubscribed_at = coalesce(d.unsubscribed_at, a.disiscrizione),
      status = case when a.reclamo is not null then 'spam'
                    when a.disiscrizione is not null then 'unsubscribed'
                    when a.rimbalzo is not null then 'bounced'
                    else d.status end,
      error_message = case when a.rimbalzo is not null then coalesce(d.error_message, a.motivo) else d.error_message end
    from agganciati a
    where d.id = a.id
    returning d.id
  )
  select count(*) into v_aggiornate from aggiornate;

  -- 2. I blocchi degli indirizzi, solo per esiti agganciati a un nostro invio.
  with da_bloccare as (
    select distinct
      case when l.tipo = 'disiscrizione' then d.company_id else null end as company_id,
      l.email,
      case l.tipo when 'rimbalzo_definitivo' then 'hard_bounce'
                  when 'reclamo' then 'spam_complaint'
                  else 'unsubscribe' end as reason,
      min(l.motivo) as motivo
    from esiti_lotto l
    join public.email_delivery_log d on d.provider_id = l.provider_id and d.provider = 'elastic_email'
    where l.email is not null
      and l.tipo in ('rimbalzo_definitivo','reclamo','disiscrizione')
      -- Una disiscrizione senza azienda resterebbe globale: come nel webhook, no.
      and (l.tipo <> 'disiscrizione' or d.company_id is not null)
    group by 1, 2, 3
  ), inseriti as (
    insert into public.email_suppressions (company_id, email, reason, notes, source_provider, metadata)
    select b.company_id, b.email, b.reason, left('Elastic Email: ' || coalesce(b.motivo, b.reason), 300),
           'elastic_email', jsonb_build_object('fonte', 'elastic-email-esiti')
    from da_bloccare b
    on conflict (company_id, email_normalized, reason) do nothing
    returning 1
  )
  select count(*) into v_blocchi from inseriti;

  -- 3. Il contatto non riceve più marketing (come nel webhook).
  with indirizzi as (
    select distinct l.email,
      case when l.tipo = 'disiscrizione' then d.company_id else null end as company_id
    from esiti_lotto l
    join public.email_delivery_log d on d.provider_id = l.provider_id and d.provider = 'elastic_email'
    where l.email is not null and l.tipo in ('rimbalzo_definitivo','reclamo','disiscrizione')
      and (l.tipo <> 'disiscrizione' or d.company_id is not null)
  ), toccati as (
    update public.marketing_contacts mc set optout_email = true
    from indirizzi i
    where mc.email = i.email
      and (i.company_id is null or mc.company_id = i.company_id)
      and mc.optout_email is not true
    returning 1
  )
  select count(*) into v_contatti from toccati;

  return jsonb_build_object('invii_aggiornati', v_aggiornate, 'indirizzi_bloccati', v_blocchi, 'contatti_in_optout', v_contatti);
end;
$$;

revoke all on function public.email_esiti_registra(jsonb) from public, anon, authenticated;
grant execute on function public.email_esiti_registra(jsonb) to service_role;

comment on function public.email_esiti_registra(jsonb) is
  'Scrive gli esiti di Elastic Email (consegne, aperture, click, rimbalzi, reclami, disiscrizioni) su email_delivery_log, email_suppressions e marketing_contacts. Solo service role: la chiama elastic-email-esiti.';
