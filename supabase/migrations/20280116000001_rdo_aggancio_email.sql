-- Quando il fornitore risponde alla richiesta d'offerta, l'email deve tornare
-- da sola sulla riga giusta. Altrimenti si finisce a cercare a mano in una
-- casella con migliaia di messaggi quale dei tre fornitori ha risposto a quale
-- richiesta — che e' esattamente il lavoro che questa parte dovrebbe togliere.
--
-- Come si aggancia, in ordine di certezza:
--
--   1. CODICE NELL'OGGETTO  L'email in uscita porta [RDO-2026-0001] nel
--      subject. Rispondendo, il client lo lascia dentro il "Re:". Trovato il
--      codice, la richiesta e' quella: nessun dubbio. Regge anche se il
--      fornitore inoltra il messaggio a un collega che risponde da un'altra
--      casella, perche' il codice viaggia col testo e non con l'indirizzo.
--
--   2. MITTENTE -> FORNITORE  Niente codice: si guarda chi scrive. Se
--      quell'indirizzo e' in anagrafica ed e' stato invitato a UNA sola
--      richiesta ancora aperta, si propone quella. Proposta, non verdetto:
--      resta da confermare a mano.
--
-- Quello che NON si fa mai e' riempire i prezzi da soli. L'email dice "ha
-- risposto", non "ecco quanto costa": leggere un preventivo PDF e sbagliare
-- una cifra vale piu' danni di dieci minuti di digitazione.

alter table public.supplier_rfq_suppliers
  add column if not exists email_inbox_id uuid references public.email_inbox(id) on delete set null,
  add column if not exists aggancio_da text,
  add column if not exists aggancio_confidenza numeric(3,2),
  add column if not exists aggancio_da_confermare boolean not null default false;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'rfq_suppliers_aggancio_da_check'
      and conrelid = 'public.supplier_rfq_suppliers'::regclass
  ) then
    alter table public.supplier_rfq_suppliers
      add constraint rfq_suppliers_aggancio_da_check
      check (aggancio_da is null or aggancio_da in ('codice', 'mittente', 'manuale'));
  end if;
end $$;

comment on column public.supplier_rfq_suppliers.aggancio_da is
  'Come e'' stata riconosciuta la risposta: codice nell''oggetto (certo), mittente in anagrafica (da confermare), a mano.';

create index if not exists idx_rfq_suppliers_email
  on public.supplier_rfq_suppliers(email_inbox_id)
  where email_inbox_id is not null;

-- L'email in entrata segna anche da che parte guardare, cosi' la posta puo'
-- mostrare "questa e' la risposta alla RDO-2026-0001" senza rifare il lavoro.
alter table public.email_inbox
  add column if not exists rfq_supplier_id uuid references public.supplier_rfq_suppliers(id) on delete set null;

create index if not exists idx_email_inbox_rfq
  on public.email_inbox(rfq_supplier_id)
  where rfq_supplier_id is not null;

-- ── Il riconoscitore ────────────────────────────────────────────────────────
create or replace function public.aggancia_email_a_rdo(p_email_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_email record;
  v_codice text;
  v_rfq_id uuid;
  v_rs_id uuid;
  v_quante int;
  v_da text;
  v_conf numeric(3,2);
begin
  select id, company_id, from_email, subject, raw_text, mailbox_folder, rfq_supplier_id
    into v_email
  from email_inbox where id = p_email_id;

  if v_email.id is null then
    return jsonb_build_object('ok', false, 'motivo', 'email inesistente');
  end if;
  -- La copia di cortesia di cio' che abbiamo mandato noi non e' una risposta.
  if coalesce(v_email.mailbox_folder, '') = 'sent' then
    return jsonb_build_object('ok', false, 'motivo', 'e'' una email in uscita');
  end if;
  if v_email.rfq_supplier_id is not null then
    return jsonb_build_object('ok', true, 'motivo', 'gia'' agganciata');
  end if;

  -- 1) Codice nell'oggetto (o nel corpo, se il fornitore riscrive da capo).
  v_codice := substring(
    coalesce(v_email.subject, '') || ' ' || left(coalesce(v_email.raw_text, ''), 4000)
    from 'RDO-[0-9]{4}-[0-9]{4}'
  );

  if v_codice is not null then
    select id into v_rfq_id
    from supplier_rfqs
    where company_id = v_email.company_id and rfq_number = v_codice;

    if v_rfq_id is not null then
      -- Dentro la richiesta giusta, il fornitore lo dice l'indirizzo. Se non
      -- combacia (ha risposto un collega da un'altra casella) si aggancia
      -- comunque la richiesta, lasciando scegliere la riga a mano.
      select rs.id into v_rs_id
      from supplier_rfq_suppliers rs
      join suppliers s on s.id = rs.supplier_id
      where rs.rfq_id = v_rfq_id
        and lower(coalesce(s.email, '')) = lower(coalesce(v_email.from_email, ''))
      limit 1;

      if v_rs_id is not null then
        v_da := 'codice';
        v_conf := 1.00;
      else
        select rs.id into v_rs_id
        from supplier_rfq_suppliers rs
        where rs.rfq_id = v_rfq_id
        order by rs.created_at
        limit 1;
        v_da := 'codice';
        v_conf := 0.60;   -- richiesta certa, fornitore no
      end if;
    end if;
  end if;

  -- 2) Nessun codice: chi scrive e' un fornitore invitato a una sola
  --    richiesta ancora aperta? Allora e' quasi certamente quella.
  if v_rs_id is null and coalesce(v_email.from_email, '') <> '' then
    -- Prima si conta, poi si prende: solo se la candidata e' UNA. Con due
    -- richieste aperte allo stesso fornitore indovinare vuol dire sbagliare
    -- una volta su due, e una risposta finita sulla gara sbagliata e' peggio
    -- di una risposta da smistare a mano.
    select count(*) into v_quante
    from supplier_rfq_suppliers rs
    join suppliers s on s.id = rs.supplier_id
    join supplier_rfqs r on r.id = rs.rfq_id
    where rs.company_id = v_email.company_id
      and lower(s.email) = lower(v_email.from_email)
      and r.status in ('inviata', 'in_valutazione')
      and rs.status in ('inviata', 'da_inviare');

    if v_quante = 1 then
      select rs.id into v_rs_id
      from supplier_rfq_suppliers rs
      join suppliers s on s.id = rs.supplier_id
      join supplier_rfqs r on r.id = rs.rfq_id
      where rs.company_id = v_email.company_id
        and lower(s.email) = lower(v_email.from_email)
        and r.status in ('inviata', 'in_valutazione')
        and rs.status in ('inviata', 'da_inviare')
      limit 1;
      v_da := 'mittente';
      v_conf := 0.70;
    end if;
  end if;

  if v_rs_id is null then
    return jsonb_build_object('ok', false, 'motivo', 'nessuna richiesta riconosciuta');
  end if;

  update supplier_rfq_suppliers
  set email_inbox_id = p_email_id,
      aggancio_da = v_da,
      aggancio_confidenza = v_conf,
      -- Solo l'aggancio pieno via codice si da' per buono senza rileggerlo.
      aggancio_da_confermare = (v_conf < 1.00),
      status = case when status in ('da_inviare', 'inviata') then 'risposta' else status end,
      risposta_at = coalesce(risposta_at, now())
  where id = v_rs_id;

  update email_inbox set rfq_supplier_id = v_rs_id where id = p_email_id;

  -- La richiesta entra in valutazione: e' arrivato qualcosa da guardare.
  update supplier_rfqs r
  set status = 'in_valutazione'
  from supplier_rfq_suppliers rs
  where rs.id = v_rs_id and r.id = rs.rfq_id and r.status = 'inviata';

  return jsonb_build_object(
    'ok', true, 'rfq_supplier_id', v_rs_id, 'da', v_da, 'confidenza', v_conf
  );
end $$;

-- ── Si aggancia da solo, da qualunque strada arrivi l'email ─────────────────
-- Il trigger sta sull'inserimento invece che dentro il poller perche' le email
-- entrano da piu' parti (IMAP, OAuth, webhook): metterlo in una sola di quelle
-- avrebbe lasciato scoperte le altre.
create or replace function public.trg_aggancia_email_a_rdo()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  if coalesce(new.mailbox_folder, '') <> 'sent' then
    perform public.aggancia_email_a_rdo(new.id);
  end if;
  return null;
end $$;

drop trigger if exists trg_email_inbox_aggancia_rdo on public.email_inbox;
create trigger trg_email_inbox_aggancia_rdo
  after insert on public.email_inbox
  for each row execute function public.trg_aggancia_email_a_rdo();
