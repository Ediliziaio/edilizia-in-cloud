-- ============================================================================
-- Merce presa in negozio: l'operaio fotografa il documento, l'ufficio verifica
-- ============================================================================
-- Un operaio va da Tecnomat o da Leroy Merlin, ritira o compra della merce e ha in mano
-- una bolla, uno scontrino o una fattura. Prima di questa migrazione, in app non poteva
-- fare niente: il costo restava nella sua tasca o in un foglio. Ora segna COME l'ha presa:
--   · pagato_da_me   — l'ho pagata io (scontrino): l'azienda deve rimborsarmi;
--   · conto_azienda  — me l'hanno addebitata sul conto/carta dell'azienda (bolla o fattura dopo);
--   · ritiro_ordine  — ritiro di un ordine che l'ufficio aveva già fatto (c'è un ODA).
-- e l'ufficio verifica prima che il costo conti: niente costo, niente rimborso e niente
-- movimento di cassa finché non c'è un sì.
--
-- Doppio conteggio: il margine della commessa conta gli ordini d'acquisto per intero e i
-- costi diretti SENZA ordine d'acquisto. Per questo:
--   · ritiro di un ordine → si collega l'ODA e NON si crea nessun costo (il costo è già
--     nell'ordine; il carico a magazzino si registra dall'ordine, come sempre);
--   · tutto il resto → UN costo diretto sulla commessa (company_costs, senza ODA).
-- Se pagato_da_me, quel costo è anche il debito verso l'operaio nello scadenzario, e si
-- chiude con «rimborsato».
--
-- Tabella chiusa: le scritture passano solo da queste funzioni (nessuna policy di scrittura).
-- Idempotente.

set local lock_timeout = '3s';
set local statement_timeout = '60s';

create table if not exists public.campo_acquisti (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  user_id uuid references public.profiles(id) on delete set null,
  order_id uuid references public.orders(id) on delete set null,
  giorno date not null default ((now() at time zone 'Europe/Rome')::date),
  modalita text not null check (modalita in ('pagato_da_me', 'conto_azienda', 'ritiro_ordine')),
  tipo_documento text not null default 'altro' check (tipo_documento in ('bolla', 'scontrino', 'fattura', 'altro')),
  fornitore text,
  supplier_id uuid references public.suppliers(id) on delete set null,
  numero_documento text,
  data_documento date,
  totale numeric(12,2) check (totale is null or totale >= 0),
  righe jsonb not null default '[]'::jsonb,
  foto_path text,
  lettura_ai jsonb,
  purchase_order_id uuid references public.purchase_orders(id) on delete set null,
  stato text not null default 'da_verificare' check (stato in ('da_verificare', 'registrato', 'rifiutato', 'annullato')),
  motivo_rifiuto text,
  rimborso_stato text not null default 'non_dovuto' check (rimborso_stato in ('non_dovuto', 'da_rimborsare', 'rimborsato')),
  company_cost_id uuid references public.company_costs(id) on delete set null,
  verificato_da uuid references public.profiles(id) on delete set null,
  verificato_at timestamptz,
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_campo_acquisti_azienda_stato on public.campo_acquisti (company_id, stato, created_at desc);
create index if not exists idx_campo_acquisti_utente on public.campo_acquisti (user_id, created_at desc);
create index if not exists idx_campo_acquisti_commessa on public.campo_acquisti (order_id);
create index if not exists idx_campo_acquisti_documento on public.campo_acquisti (company_id, lower(btrim(coalesce(fornitore, ''))), btrim(coalesce(numero_documento, '')));

alter table public.campo_acquisti enable row level security;
revoke all on public.campo_acquisti from anon, authenticated;
grant select on public.campo_acquisti to authenticated;

drop policy if exists campo_acquisti_lettura on public.campo_acquisti;
create policy campo_acquisti_lettura on public.campo_acquisti for select to authenticated
  using (
    user_id = (select auth.uid())
    or (
      company_id = (select p.company_id from public.profiles p where p.id = (select auth.uid()))
      and (
        public.e_amministratore_di(company_id)
        or exists (select 1 from public.user_roles ur
                    where ur.user_id = (select auth.uid())
                      and ur.role in ('company_staff', 'super_admin'))
      )
    )
  );

drop trigger if exists trg_campo_acquisti_updated on public.campo_acquisti;
create trigger trg_campo_acquisti_updated
  before update on public.campo_acquisti
  for each row execute function public.set_hr_buoni_pasto_updated_at();

-- ── L'operaio segna la merce presa ───────────────────────────────────────────
create or replace function public.campo_acquisto_registra(
  p_order_id uuid,
  p_modalita text,
  p_tipo_documento text default 'altro',
  p_fornitore text default null,
  p_numero text default null,
  p_data date default null,
  p_totale numeric default null,
  p_righe jsonb default '[]'::jsonb,
  p_foto_path text default null,
  p_lettura jsonb default null,
  p_note text default null
)
returns uuid
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_uid uuid := auth.uid();
  v_company uuid;
  v_nome text;
  v_codice text;
  v_forn text := left(btrim(coalesce(p_fornitore, '')), 120);
  v_num text := left(btrim(coalesce(p_numero, '')), 60);
  v_tipo text := case when p_tipo_documento in ('bolla', 'scontrino', 'fattura') then p_tipo_documento else 'altro' end;
  v_righe jsonb := '[]'::jsonb;
  v_r jsonb;
  v_desc text;
  v_qta numeric;
  v_prezzo numeric;
  v_imp numeric;
  v_somma numeric := 0;
  v_totale numeric := p_totale;
  v_suppliers uuid[];
  v_supplier uuid;
  v_oda uuid[];
  v_po uuid;
  v_dup record;
  v_id uuid;
  v_admin record;
begin
  if v_uid is null then
    raise exception using errcode = 'P0001', message = 'Sessione scaduta: accedi di nuovo.';
  end if;
  select company_id, nullif(btrim(coalesce(first_name, '') || ' ' || coalesce(last_name, '')), '')
    into v_company, v_nome from public.profiles where id = v_uid;
  if v_company is null then
    raise exception using errcode = 'P0001', message = 'Il tuo profilo non è collegato a un''azienda: avvisa l''ufficio.';
  end if;
  if p_modalita is null or p_modalita not in ('pagato_da_me', 'conto_azienda', 'ritiro_ordine') then
    raise exception using errcode = 'P0001', message = 'Dici come hai preso la merce: l''hai pagata tu, è sul conto dell''azienda o è un ordine già fatto.';
  end if;

  -- cantiere: dell'azienda, e la persona ci lavora (o è dell'ufficio)
  select order_code into v_codice from public.orders
   where id = p_order_id and company_id = v_company and deleted_at is null;
  if not found then
    raise exception using errcode = 'P0001', message = 'Scegli il cantiere a cui va la merce.';
  end if;
  if not (public.campo_e_ufficio(v_company)
          or exists (select 1 from public.order_campo_assignments a where a.order_id = p_order_id and a.user_id = v_uid)
          or exists (select 1 from public.order_employees oe join public.employees e on e.id = oe.employee_id
                      where oe.order_id = p_order_id and e.user_id = v_uid)) then
    raise exception using errcode = 'P0001', message = 'Non puoi segnare merce per un cantiere che non ti è assegnato.';
  end if;

  -- prodotti: solo righe con una descrizione, quantità e importi puliti
  if jsonb_typeof(p_righe) = 'array' then
    for v_r in select * from jsonb_array_elements(p_righe) limit 200 loop
      v_desc := left(btrim(coalesce(v_r->>'descrizione', '')), 200);
      continue when v_desc = '';
      v_qta := case when (v_r->>'quantita') ~ '^[0-9]+([.][0-9]+)?$' then (v_r->>'quantita')::numeric else 1 end;
      v_prezzo := case when (v_r->>'prezzo_unitario') ~ '^[0-9]+([.][0-9]+)?$' then (v_r->>'prezzo_unitario')::numeric else null end;
      v_imp := case when (v_r->>'importo') ~ '^[0-9]+([.][0-9]+)?$' then (v_r->>'importo')::numeric
                    when v_prezzo is not null then round(v_prezzo * v_qta, 2) else null end;
      v_somma := v_somma + coalesce(v_imp, 0);
      v_righe := v_righe || jsonb_build_object(
        'descrizione', v_desc,
        'codice', nullif(left(btrim(coalesce(v_r->>'codice', '')), 60), ''),
        'quantita', least(v_qta, 1000000),
        'unita', nullif(left(btrim(coalesce(v_r->>'unita', '')), 12), ''),
        'prezzo_unitario', v_prezzo,
        'importo', v_imp);
    end loop;
  end if;
  if v_totale is null and v_somma > 0 then v_totale := round(v_somma, 2); end if;
  if v_totale is not null and (v_totale < 0 or v_totale > 1000000) then
    raise exception using errcode = 'P0001', message = 'Il totale non sembra giusto: controllalo.';
  end if;
  if p_modalita = 'pagato_da_me' and coalesce(v_totale, 0) <= 0 then
    raise exception using errcode = 'P0001', message = 'Indica quanto hai speso: serve per il rimborso.';
  end if;
  if v_totale is null and jsonb_array_length(v_righe) = 0 then
    raise exception using errcode = 'P0001', message = 'Indica almeno il totale o i prodotti che hai preso.';
  end if;

  -- stesso documento due volte: non si carica due volte (doppio costo, doppio rimborso)
  if v_num <> '' then
    select a.created_at, coalesce(nullif(btrim(coalesce(pr.first_name, '') || ' ' || coalesce(pr.last_name, '')), ''), 'un collega') as chi
      into v_dup
      from public.campo_acquisti a left join public.profiles pr on pr.id = a.user_id
     where a.company_id = v_company and a.stato not in ('rifiutato', 'annullato')
       and lower(btrim(coalesce(a.fornitore, ''))) = lower(v_forn)
       and btrim(coalesce(a.numero_documento, '')) = v_num
       and a.data_documento is not distinct from p_data
     order by a.created_at desc limit 1;
    if found then
      raise exception using errcode = 'P0001', message =
        'Questo documento è già stato caricato da ' || v_dup.chi || ' il ' || to_char(v_dup.created_at at time zone 'Europe/Rome', 'DD/MM') || ': non serve rimandarlo.';
    end if;
  elsif exists (select 1 from public.campo_acquisti a
                 where a.user_id = v_uid and a.stato not in ('rifiutato', 'annullato')
                   and a.created_at > now() - interval '6 hours'
                   and a.totale is not distinct from v_totale
                   and lower(btrim(coalesce(a.fornitore, ''))) = lower(v_forn)) then
    raise exception using errcode = 'P0001', message = 'Hai già inviato questo documento poco fa: non serve rimandarlo.';
  end if;

  -- fornitore dell'anagrafica, se uno solo corrisponde («Tecnomat» trova «Tecnomat S.p.A.»)
  if length(v_forn) >= 4 then
    select array_agg(s.id) into v_suppliers from public.suppliers s
     where s.company_id = v_company and length(btrim(s.name)) >= 4
       and (position(lower(btrim(s.name)) in lower(v_forn)) > 0 or position(lower(v_forn) in lower(btrim(s.name))) > 0);
    if cardinality(v_suppliers) = 1 then v_supplier := v_suppliers[1]; end if;
  end if;

  -- ritiro di un ordine: se c'è UN solo ordine d'acquisto aperto per questo cantiere (e fornitore), lo propone
  if p_modalita = 'ritiro_ordine' then
    select array_agg(po.id) into v_oda from public.purchase_orders po
     where po.company_id = v_company and po.order_id = p_order_id
       and po.status in ('inviato', 'confermato', 'parziale')
       and (v_supplier is null or po.supplier_id = v_supplier);
    if cardinality(v_oda) = 1 then v_po := v_oda[1]; end if;
  end if;

  insert into public.campo_acquisti (company_id, user_id, order_id, modalita, tipo_documento, fornitore, supplier_id,
                                     numero_documento, data_documento, totale, righe, foto_path, lettura_ai,
                                     purchase_order_id, rimborso_stato, note)
  values (v_company, v_uid, p_order_id, p_modalita, v_tipo, nullif(v_forn, ''), v_supplier,
          nullif(v_num, ''), p_data, v_totale, v_righe, nullif(left(coalesce(p_foto_path, ''), 300), ''), p_lettura,
          v_po, case when p_modalita = 'pagato_da_me' then 'da_rimborsare' else 'non_dovuto' end,
          nullif(left(btrim(coalesce(p_note, '')), 500), ''))
  returning id into v_id;

  -- l'ufficio lo vede subito
  for v_admin in
    select p.id from public.profiles p join public.user_roles ur on ur.user_id = p.id
     where p.company_id = v_company and ur.role in ('company_admin', 'company_staff')
  loop
    perform public.campo_notifica(v_company, v_admin.id, 'campo_acquisto', 'Merce da verificare',
      coalesce(v_nome, 'Un operaio') || ' ha preso della merce' || coalesce(' da ' || nullif(v_forn, ''), '')
        || ' per ' || coalesce(v_codice, 'un cantiere')
        || case when v_totale is not null then ' (' || replace(to_char(v_totale, 'FM9999990.00'), '.', ',') || ' €)' else '' end || '.',
      'campo_acquisto', v_id, '/azienda/magazzino');
  end loop;

  return v_id;
end;
$$;
revoke all on function public.campo_acquisto_registra(uuid, text, text, text, text, date, numeric, jsonb, text, jsonb, text) from public, anon;
grant execute on function public.campo_acquisto_registra(uuid, text, text, text, text, date, numeric, jsonb, text, jsonb, text) to authenticated;

-- ── L'ufficio verifica: registra (costo/ordine), rifiuta, segna rimborsato ───
create or replace function public.campo_acquisto_verifica(
  p_id uuid,
  p_azione text,
  p_totale numeric default null,
  p_purchase_order_id uuid default null,
  p_motivo text default null
)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  a public.campo_acquisti;
  v_uid uuid := auth.uid();
  v_importo numeric;
  v_po uuid;
  v_cost uuid;
  v_nome_op text;
  v_codice text;
  v_msg text;
  v_forn text;
begin
  select * into a from public.campo_acquisti where id = p_id for update;
  if not found then
    raise exception using errcode = 'P0001', message = 'Acquisto non trovato.';
  end if;
  if v_uid is null or not public.campo_e_ufficio(a.company_id) then
    raise exception using errcode = 'P0001', message = 'Solo l''ufficio può verificare la merce presa in negozio.';
  end if;
  select nullif(btrim(coalesce(first_name, '') || ' ' || coalesce(last_name, '')), '') into v_nome_op from public.profiles where id = a.user_id;
  select order_code into v_codice from public.orders where id = a.order_id;
  v_forn := coalesce(nullif(btrim(coalesce(a.fornitore, '')), ''), 'negozio');

  if p_azione = 'rifiuta' then
    if a.stato <> 'da_verificare' then
      raise exception using errcode = 'P0001', message = 'Questo acquisto è già stato verificato.';
    end if;
    update public.campo_acquisti
       set stato = 'rifiutato', rimborso_stato = 'non_dovuto', verificato_da = v_uid, verificato_at = now(),
           motivo_rifiuto = nullif(left(btrim(coalesce(p_motivo, '')), 300), '')
     where id = p_id;
    perform public.campo_notifica(a.company_id, a.user_id, 'campo_acquisto', 'Merce non accettata',
      'L''ufficio non ha accettato il documento di ' || v_forn || coalesce(' del cantiere ' || v_codice, '') || '.'
        || coalesce(' Motivo: ' || nullif(btrim(coalesce(p_motivo, '')), ''), ''),
      'campo_acquisto', a.id, '/campo/merce');
    return jsonb_build_object('ok', true, 'stato', 'rifiutato');

  elsif p_azione = 'registra' then
    if a.stato <> 'da_verificare' then
      raise exception using errcode = 'P0001', message = 'Questo acquisto è già stato verificato.';
    end if;
    v_importo := coalesce(p_totale, a.totale);
    v_po := coalesce(p_purchase_order_id, a.purchase_order_id);
    if v_po is not null and not exists (select 1 from public.purchase_orders where id = v_po and company_id = a.company_id) then
      raise exception using errcode = 'P0001', message = 'L''ordine d''acquisto scelto non è di questa azienda.';
    end if;

    if v_po is not null then
      -- Il costo è già nell'ordine d'acquisto: crearne un altro lo conterebbe due volte.
      update public.campo_acquisti
         set stato = 'registrato', purchase_order_id = v_po, verificato_da = v_uid, verificato_at = now(),
             totale = coalesce(p_totale, totale)
       where id = p_id;
      v_msg := 'Collegata all''ordine d''acquisto: il costo è già lì. Registra l''arrivo della merce dall''ordine per caricarla a magazzino.';
    else
      if coalesce(v_importo, 0) <= 0 then
        raise exception using errcode = 'P0001', message = 'Indica il totale per registrare la spesa.';
      end if;
      -- Un solo costo diretto sulla commessa. Se l'ha pagato l'operaio è anche il suo rimborso da fare.
      insert into public.company_costs (company_id, name, cost_type, amount, recurrence, due_date, is_paid, category,
                                        notes, order_id, vat_rate, supplier_id, trigger_evento)
      values (a.company_id,
              case when a.modalita = 'pagato_da_me'
                   then 'Rimborso a ' || coalesce(v_nome_op, 'operaio') || ' — acquisto ' || v_forn
                   else 'Acquisto ' || v_forn end
                || coalesce(' n. ' || nullif(btrim(coalesce(a.numero_documento, '')), ''), ''),
              'variable', v_importo, 'once',
              case when a.modalita = 'pagato_da_me' then (now() at time zone 'Europe/Rome')::date
                   else coalesce(a.data_documento, a.giorno) + 30 end,
              false, 'materiali_edili',
              'Merce presa in negozio da ' || coalesce(v_nome_op, 'un operaio') || ' per ' || coalesce(v_codice, 'il cantiere')
                || case a.modalita when 'pagato_da_me' then ' · pagata dall''operaio, da rimborsare'
                                   when 'conto_azienda' then ' · addebitata sul conto aziendale'
                                   else ' · ritiro senza ordine d''acquisto collegato' end,
              a.order_id, 22, a.supplier_id, 'data_fissa')
      returning id into v_cost;
      update public.campo_acquisti
         set stato = 'registrato', company_cost_id = v_cost, verificato_da = v_uid, verificato_at = now(),
             totale = v_importo
       where id = p_id;
      v_msg := case a.modalita
                 when 'pagato_da_me' then 'Registrato come costo del cantiere. Il rimborso a ' || coalesce(v_nome_op, 'l''operaio') || ' è nello scadenzario.'
                 when 'conto_azienda' then 'Registrato come costo del cantiere, da pagare entro 30 giorni.'
                 else 'Nessun ordine d''acquisto collegato: registrato come costo diretto del cantiere.' end;
    end if;
    perform public.campo_notifica(a.company_id, a.user_id, 'campo_acquisto', 'Merce registrata',
      'L''ufficio ha registrato il documento di ' || v_forn || coalesce(' del cantiere ' || v_codice, '') || '.'
        || case when a.modalita = 'pagato_da_me' then ' Il rimborso è in programma.' else '' end,
      'campo_acquisto', a.id, '/campo/merce');
    return jsonb_build_object('ok', true, 'stato', 'registrato', 'messaggio', v_msg, 'company_cost_id', v_cost, 'purchase_order_id', v_po);

  elsif p_azione = 'rimborsato' then
    if a.stato <> 'registrato' or a.rimborso_stato <> 'da_rimborsare' then
      raise exception using errcode = 'P0001', message = 'Non c''è un rimborso da segnare per questo acquisto.';
    end if;
    update public.campo_acquisti set rimborso_stato = 'rimborsato' where id = p_id;
    if a.company_cost_id is not null then
      update public.company_costs set is_paid = true, paid_date = (now() at time zone 'Europe/Rome')::date where id = a.company_cost_id;
    end if;
    perform public.campo_notifica(a.company_id, a.user_id, 'campo_acquisto', 'Rimborso fatto',
      'Ti hanno rimborsato la spesa da ' || v_forn || coalesce(' (' || replace(to_char(a.totale, 'FM9999990.00'), '.', ',') || ' €)', '') || '.',
      'campo_acquisto', a.id, '/campo/merce');
    return jsonb_build_object('ok', true, 'stato', 'registrato', 'rimborso', 'rimborsato');
  end if;

  raise exception using errcode = 'P0001', message = 'Azione non riconosciuta.';
end;
$$;
revoke all on function public.campo_acquisto_verifica(uuid, text, numeric, uuid, text) from public, anon;
grant execute on function public.campo_acquisto_verifica(uuid, text, numeric, uuid, text) to authenticated;

-- ── L'operaio ritira un documento che non ha ancora visto l'ufficio ──────────
create or replace function public.campo_acquisto_annulla(p_id uuid)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  update public.campo_acquisti
     set stato = 'annullato', rimborso_stato = 'non_dovuto'
   where id = p_id and user_id = auth.uid() and stato = 'da_verificare';
  if not found then
    raise exception using errcode = 'P0001', message = 'Questo documento non si può più ritirare: l''ufficio lo ha già verificato.';
  end if;
end;
$$;
revoke all on function public.campo_acquisto_annulla(uuid) from public, anon;
grant execute on function public.campo_acquisto_annulla(uuid) to authenticated;
