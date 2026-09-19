-- Risposte cold: sulla riga resta scritto A CHI ha risposto.
--
-- 18/09/2026. Tre servizi scrivono alle stesse aziende (Edilizia in Cloud,
-- Marketing Edile, ThermoDMR) e lo stesso contatto può essere iscritto a tutti
-- e tre. Il brand della risposta veniva ricostruito al volo dalla PRIMA
-- iscrizione attiva del contatto: due risposte a «Richieste di preventivo…»
-- di Marketing Edile risultavano di ThermoDMR. Adesso chi legge la posta
-- decide il brand dall'invio vero (header citato, casella che ha ricevuto) e
-- lo SCRIVE qui: l'attribuzione resta verificabile anche dopo, e il
-- riepilogo giornaliero conta per brand senza indovinare.
alter table public.outreach_replies
  add column if not exists brand_id uuid references public.outreach_brands(id) on delete set null,
  add column if not exists sender_account_id uuid references public.outreach_sender_accounts(id) on delete set null;

create index if not exists idx_outreach_replies_brand
  on public.outreach_replies (brand_id, received_at desc);

comment on column public.outreach_replies.brand_id is
  'Il brand a cui ha risposto davvero: deciso dall''invio (header/casella), non dalla prima iscrizione trovata.';
comment on column public.outreach_replies.sender_account_id is
  'La casella che ha ricevuto la risposta.';

-- Riempimento delle risposte già arrivate. L'oggetto della risposta è
-- «Re: <oggetto nostro>», e gli oggetti dei tre brand sono diversi: si prende
-- l'invio con lo stesso oggetto, e solo in mancanza l'ultimo prima della
-- risposta. Poche righe, ma con le protezioni d'ordinanza.
do $$
begin
  set local lock_timeout = '3s';
  set local statement_timeout = '60s';

  with invio as (
    select r.id, q.brand_id, q.sender_account_id
      from public.outreach_replies r
      cross join lateral (
        select s.brand_id, s.sender_account_id
          from public.outreach_send_queue s
         where s.contact_id = r.contact_id
           and s.status = 'sent'
           and s.sent_at <= coalesce(r.received_at, now())
         order by (lower(regexp_replace(coalesce(r.subject, ''), '^\s*((re|r|fw|fwd|i)\s*:\s*)+', '', 'i'))
                   = lower(regexp_replace(coalesce(s.subject, ''), '^\s*((re|r|fw|fwd|i)\s*:\s*)+', '', 'i'))) desc,
                  s.sent_at desc
         limit 1
      ) q
     where r.contact_id is not null
       and (r.brand_id is null or r.sender_account_id is null)
  )
  update public.outreach_replies r
     set brand_id = coalesce(r.brand_id, i.brand_id),
         sender_account_id = coalesce(r.sender_account_id, i.sender_account_id)
    from invio i
   where i.id = r.id;
end
$$;
