-- La lista di blocco di Elastic Email entra fra i blocchi della piattaforma
-- (07/11/2026).
--
-- Elastic tiene una lista di indirizzi a cui non spedisce più. La
-- piattaforma non la conosceva: nella settimana dal 30/10 le automazioni
-- hanno mandato 148 email a 45 di quegli indirizzi, che Elastic non ha mai
-- consegnato — invii che risultano partiti e non arrivano.
--
-- La classificazione la fa elastic-email-esiti (_shared/esitiElastic.ts,
-- motivoBloccoElastic): solo ciò che il motivo dimostra — indirizzo
-- inesistente, disiscrizione, segnalazione di spam. I rifiuti temporanei
-- (4xx) e quelli «di politica» del server non si copiano. Qui si scrive,
-- con le regole del webhook:
--   · hard_bounce e spam_complaint → blocco globale, optout_email sui
--     contatti con quell'indirizzo;
--   · unsubscribe → blocco delle aziende che a quell'indirizzo hanno scritto
--     con Elastic (la lista di Elastic è dell'account, non dell'azienda: il
--     link di disiscrizione stava in una loro email), e optout_email sui loro
--     contatti. Una disiscrizione senza un'azienda a cui attribuirla non
--     diventa globale.

set local lock_timeout = '3s';
set local statement_timeout = '60s';

create or replace function public.email_blocchi_elastic_registra(p_blocchi jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_globali int := 0;
  v_aziende int := 0;
  v_contatti int := 0;
  v_senza_azienda int := 0;
begin
  create temporary table if not exists blocchi_lotto (email text, reason text, motivo text) on commit drop;
  truncate blocchi_lotto;
  insert into blocchi_lotto (email, reason, motivo)
  select distinct lower(trim(b.email)), b.reason, left(b.motivo, 250)
  from jsonb_to_recordset(coalesce(p_blocchi, '[]'::jsonb)) as b(email text, reason text, motivo text)
  where b.email like '%@%' and b.reason in ('hard_bounce', 'spam_complaint', 'unsubscribe');

  -- 1. Blocchi globali.
  with inseriti as (
    insert into public.email_suppressions (company_id, email, reason, notes, source_provider, metadata)
    select null, l.email, l.reason, left('Lista di blocco Elastic: ' || coalesce(l.motivo, l.reason), 300),
           'elastic_email', jsonb_build_object('fonte', 'elastic-email-esiti/lista_blocco')
    from blocchi_lotto l
    where l.reason in ('hard_bounce', 'spam_complaint')
    on conflict (company_id, email_normalized, reason) do nothing
    returning 1
  )
  select count(*) into v_globali from inseriti;

  -- 2. Disiscrizioni, per le aziende che a quell'indirizzo hanno scritto con Elastic.
  with aziende as (
    select distinct l.email, d.company_id, l.motivo
    from blocchi_lotto l
    join public.email_delivery_log d
      on d.provider = 'elastic_email' and d.company_id is not null and lower(d.recipient) = l.email
    where l.reason = 'unsubscribe'
  ), inseriti as (
    insert into public.email_suppressions (company_id, email, reason, notes, source_provider, metadata)
    select a.company_id, a.email, 'unsubscribe', left('Lista di blocco Elastic: ' || coalesce(a.motivo, 'unsubscribe'), 300),
           'elastic_email', jsonb_build_object('fonte', 'elastic-email-esiti/lista_blocco')
    from aziende a
    on conflict (company_id, email_normalized, reason) do nothing
    returning 1
  )
  select count(*) into v_aziende from inseriti;

  select count(*) into v_senza_azienda
  from blocchi_lotto l
  where l.reason = 'unsubscribe'
    and not exists (select 1 from public.email_delivery_log d
                    where d.provider = 'elastic_email' and d.company_id is not null and lower(d.recipient) = l.email);

  -- 3. I contatti non ricevono più marketing.
  with toccati as (
    update public.marketing_contacts mc set optout_email = true
    from blocchi_lotto l
    where mc.email = l.email and l.reason in ('hard_bounce', 'spam_complaint')
      and mc.optout_email is not true
    returning 1
  ), toccati_azienda as (
    update public.marketing_contacts mc set optout_email = true
    from (select distinct l.email, d.company_id
          from blocchi_lotto l
          join public.email_delivery_log d
            on d.provider = 'elastic_email' and d.company_id is not null and lower(d.recipient) = l.email
          where l.reason = 'unsubscribe') a
    where mc.company_id = a.company_id and lower(mc.email) = a.email
      and mc.optout_email is not true
    returning 1
  )
  select (select count(*) from toccati) + (select count(*) from toccati_azienda) into v_contatti;

  return jsonb_build_object(
    'blocchi_globali_nuovi', v_globali,
    'disiscrizioni_per_azienda_nuove', v_aziende,
    'disiscrizioni_senza_azienda', v_senza_azienda,
    'contatti_in_optout', v_contatti);
end;
$$;

revoke all on function public.email_blocchi_elastic_registra(jsonb) from public, anon, authenticated;
grant execute on function public.email_blocchi_elastic_registra(jsonb) to service_role;

comment on function public.email_blocchi_elastic_registra(jsonb) is
  'Porta fra i blocchi della piattaforma la lista di blocco di Elastic Email, già classificata da elastic-email-esiti. Solo service role.';
