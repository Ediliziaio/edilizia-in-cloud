-- Outreach: la misura che conta per l'obiettivo del 3% (24/09/2026).
--
-- Il riepilogo del mattino contava risposte e interessati di ieri, sulle email
-- spedite. Per sapere se un flusso funziona serve un altro conto: delle PERSONE
-- contattate negli ultimi 30 giorni, quante hanno risposto in positivo
-- (interessato o domanda). Una persona riceve 7-9 email: contando per email,
-- il flusso che scrive di più sembrava sempre il peggiore.

create or replace function public.outreach_positive_30_giorni()
returns table (brand_id uuid, persone bigint, positive bigint)
language sql
stable
set search_path = public
as $$
  with raggiunte as (
    select distinct q.brand_id, q.enrollment_id
      from public.outreach_send_queue q
     where q.status = 'sent' and q.channel = 'email' and q.kind = 'send'
       and q.enrollment_id is not null
       and q.sent_at >= now() - interval '30 days'
  ), positive as (
    select distinct r.enrollment_id
      from public.outreach_replies r
     where r.intent in ('interested', 'question')
       and r.enrollment_id is not null
       and r.received_at >= now() - interval '30 days'
  )
  select g.brand_id, count(*) as persone, count(p.enrollment_id) as positive
    from raggiunte g
    left join positive p on p.enrollment_id = g.enrollment_id
   group by g.brand_id;
$$;

comment on function public.outreach_positive_30_giorni() is
  'Per brand: persone contattate via email negli ultimi 30 giorni e quante hanno risposto interessato o con una domanda. La legge il riepilogo del mattino (outreach-riepilogo).';

-- La chiama solo la edge function del riepilogo, col service role.
revoke all on function public.outreach_positive_30_giorni() from public, anon, authenticated;
grant execute on function public.outreach_positive_30_giorni() to service_role;
