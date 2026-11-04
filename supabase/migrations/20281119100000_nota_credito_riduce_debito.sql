-- Una nota di credito ricevuta riduce il debito della fattura che storna, anche senza ordine d'acquisto
-- (docs/flussi-acquisti-pagamenti.md, caso F, 04/11/2026).
--
-- PRIMA. contabilizza_fattura_ricevuta rifiutava la nota senza ordine collegato, e anche con l'ordine
-- abbassava il costo ma non le rate: chi non usa gli ordini restava col debito pieno, nel previsionale e
-- nelle RiBa.
--
-- ORA. Il collegamento nota → fattura è una riga di note_credito_storni, scelta sempre da una persona:
-- nessun trigger collega da solo, nemmeno quando il riferimento dell'XML è univoco (quello la pagina lo
-- propone soltanto). La riga ricorda tutto quello che ha toccato, quindi togliere il collegamento rimette
-- costo e rate come erano. Una nota può coprire più fatture (nei dati veri 5 note ne citano 2 o 3) e una
-- fattura può ricevere più note.
--
-- I SEGNI. Lo SDI ammette TD04 con importi positivi e negativi, e netto_a_pagare su una nota può essere
-- negativo o zero (visto su Bonarrigo): l'importo della nota è il valore assoluto del totale, meno la
-- ritenuta, e non passa da netto_a_pagare.
--
-- QUALI RATE. Da quella che scade prima. Si toccano le rate aperte; una RiBa già avvisata per ultima, e
-- l'esito lo dice, perché la banca addebita lo stesso l'importo pieno finché nessuno la blocca. Quel che
-- non trova rate aperte (fattura già pagata) è un credito verso il fornitore: resta scritto, non sparisce.
--
-- Una rata azzerata diventa «stornata»: non è stata pagata, e non è più da pagare.
--
-- Idempotente.

set local lock_timeout = '3s';
set local statement_timeout = '60s';

-- ── 1. Lo stato della rata azzerata ────────────────────────────────────────

alter table public.rate_fornitori drop constraint if exists rate_fornitori_stato_check;
alter table public.rate_fornitori add constraint rate_fornitori_stato_check check (stato = any (array[
  'da_pagare', 'avvisata', 'da_bloccare', 'richiamata', 'pagata', 'insoluta', 'stornata']));

-- «Stornata» la mette e la toglie solo il collegamento: il browser può cambiare lo stato di una rata.
create or replace function public.rate_fornitori_prima_di_salvare()
returns trigger language plpgsql set search_path = '' as $fn$
begin
  new.updated_at := now();
  if tg_op = 'UPDATE' and new.stato is distinct from old.stato then
    if 'stornata' in (new.stato, old.stato) and current_setting('rate_fornitori.da_storno', true) is distinct from 'on' then
      raise exception 'Questa rata è chiusa da una nota di credito: togli prima il collegamento della nota.' using errcode = 'P0001';
    end if;
    new.stato_cambiato_da := auth.uid();
    new.stato_cambiato_il := now();
    if new.stato = 'pagata' and new.pagata_il is null then
      new.pagata_il := (now() at time zone 'Europe/Rome')::date;
    elsif new.stato <> 'pagata' then
      new.pagata_il := null;
    end if;
  end if;
  return new;
end
$fn$;

create or replace function public.rate_fornitori_allinea_costo()
returns trigger language plpgsql security definer set search_path = '' as $fn$
declare
  v_cost       uuid := coalesce(new.company_cost_id, old.company_cost_id);
  v_aperte     integer;
  v_totali     integer;
  v_ultima     date;
  v_prossima   date;
  v_is_paid    boolean;
  v_scadenza   date;
begin
  select count(*) filter (where stato not in ('pagata', 'stornata')),
         count(*),
         max(pagata_il),
         min(scadenza) filter (where stato not in ('pagata', 'stornata'))
    into v_aperte, v_totali, v_ultima, v_prossima
    from public.rate_fornitori where company_cost_id = v_cost;
  if v_totali = 0 then
    return null;
  end if;

  select is_paid, due_date into v_is_paid, v_scadenza
    from public.company_costs where id = v_cost;

  perform set_config('rate_fornitori.da_rata', 'on', true);
  if v_aperte = 0 and not coalesce(v_is_paid, false) then
    update public.company_costs
       set is_paid = true, paid_date = v_ultima, updated_at = now()
     where id = v_cost;
  elsif v_aperte > 0 and coalesce(v_is_paid, false) then
    update public.company_costs
       set is_paid = false, paid_date = null, updated_at = now()
     where id = v_cost;
  end if;
  if v_prossima is not null and v_prossima is distinct from v_scadenza then
    update public.company_costs
       set due_date = v_prossima, updated_at = now()
     where id = v_cost;
  end if;
  perform set_config('rate_fornitori.da_rata', 'off', true);
  return null;
end
$fn$;

create or replace function public.costo_allinea_rate_fornitori()
returns trigger language plpgsql security definer set search_path = '' as $fn$
begin
  if current_setting('rate_fornitori.da_rata', true) = 'on' then
    return null;
  end if;
  if new.is_paid is not distinct from old.is_paid then
    return null;
  end if;

  if coalesce(new.is_paid, false) then
    update public.rate_fornitori
       set stato = 'pagata', pagata_il = coalesce(new.paid_date, pagata_il)
     where company_cost_id = new.id and stato not in ('pagata', 'stornata');
  else
    update public.rate_fornitori
       set stato = 'da_pagare', pagata_il = null
     where company_cost_id = new.id and stato = 'pagata';
  end if;
  return null;
end
$fn$;

create or replace function public.segna_fattura_ricevuta_pagata(p_id uuid, p_pagata boolean, p_data date default null::date)
returns date language plpgsql set search_path = '' as $fn$
declare
  v_costo uuid;
  v_data date := case when p_pagata then coalesce(p_data, (now() at time zone 'Europe/Rome')::date) end;
begin
  if p_data is not null and (p_data > (now() at time zone 'Europe/Rome')::date + 1 or p_data < date '2000-01-01') then
    raise exception 'Data di pagamento non valida' using errcode = '22007';
  end if;

  update public.fatture_ricevute
     set pagata_il = v_data,
         pagamento_segnato_da = auth.uid(),
         pagamento_segnato_at = now()
   where id = p_id
  returning company_cost_id into v_costo;

  if not found then
    raise exception 'Fattura non trovata o senza permesso sui documenti dei fornitori' using errcode = '42501';
  end if;

  if v_costo is not null then
    if p_pagata then
      update public.rate_fornitori
         set stato = 'pagata', pagata_il = v_data
       where fattura_ricevuta_id = p_id and stato not in ('pagata', 'stornata');
    else
      update public.rate_fornitori
         set stato = 'da_pagare', pagata_il = null
       where fattura_ricevuta_id = p_id and stato = 'pagata';
    end if;
  end if;

  return v_data;
end;
$fn$;

-- ── 2. Il collegamento ─────────────────────────────────────────────────────

create table if not exists public.note_credito_storni (
  id                  uuid primary key default gen_random_uuid(),
  company_id          uuid not null references public.companies(id) on delete cascade,
  nota_id             uuid not null references public.fatture_ricevute(id) on delete cascade,
  fattura_id          uuid not null references public.fatture_ricevute(id) on delete cascade,
  company_cost_id     uuid references public.company_costs(id) on delete set null,
  importo             numeric(14,2) not null check (importo > 0),
  imponibile          numeric(14,2) not null default 0 check (imponibile >= 0),
  -- Quello che è stato fatto davvero, per poterlo disfare: costo, rate, stati di prima.
  costo_ridotto_di    numeric(14,2) not null default 0 check (costo_ridotto_di >= 0),
  costo_nota          text,
  credito_residuo     numeric(14,2) not null default 0 check (credito_residuo >= 0),
  rate_ridotte        jsonb not null default '[]'::jsonb,
  nota_stato_prima    text,
  nota_costo_prima    uuid,
  -- Valorizzato solo se la fattura è diventata un costo per effetto di questo collegamento.
  fattura_stato_prima text,
  creato_da           uuid,
  created_at          timestamptz not null default now(),
  unique (nota_id, fattura_id),
  check (nota_id <> fattura_id)
);
comment on table public.note_credito_storni is
  'Quale fattura ricevuta storna una nota di credito ricevuta, per quanto (lordo), e cosa ha toccato: costo ridotto, rate ridotte, credito verso il fornitore che non ha trovato rate aperte. Lo crea solo nota_credito_collega, su scelta di una persona.';
create index if not exists note_credito_storni_fattura_idx on public.note_credito_storni (fattura_id);
create index if not exists note_credito_storni_costo_idx on public.note_credito_storni (company_cost_id) where company_cost_id is not null;
create index if not exists note_credito_storni_azienda_idx on public.note_credito_storni (company_id);

-- Quanto vale una nota, con qualunque segno sia stata scritta.
create or replace function public.nota_credito_importo(p_totale numeric, p_imponibile numeric, p_iva numeric, p_ritenuta numeric)
returns numeric language sql immutable set search_path = '' as $fn$
  select greatest(0, round(
    case when coalesce(p_totale, 0) <> 0 then abs(p_totale)
         else abs(coalesce(p_imponibile, 0)) + abs(coalesce(p_iva, 0)) end
    - abs(coalesce(p_ritenuta, 0)), 2))
$fn$;
revoke all on function public.nota_credito_importo(numeric, numeric, numeric, numeric) from public, anon;
grant execute on function public.nota_credito_importo(numeric, numeric, numeric, numeric) to authenticated, service_role;

-- Porta la riduzione sulle rate aperte: prima le altre, poi le RiBa già avvisate; in ciascun gruppo dalla più vicina.
create or replace function public.nota_credito_riduci_rate(p_storno uuid, p_quanto numeric)
returns numeric language plpgsql security definer set search_path = '' as $fn$
declare
  s public.note_credito_storni%rowtype;
  r record;
  v_resto numeric := p_quanto;
  v_taglio numeric;
  v_voci jsonb := '[]'::jsonb;
begin
  select * into s from public.note_credito_storni where id = p_storno;
  perform set_config('rate_fornitori.da_storno', 'on', true);
  for r in
    select id, numero, scadenza, importo, stato, metodo from public.rate_fornitori
     where fattura_ricevuta_id = s.fattura_id
       and stato in ('da_pagare', 'da_bloccare', 'insoluta', 'richiamata', 'avvisata')
       and coalesce(importo, 0) > 0
     order by (stato = 'avvisata'), scadenza nulls last, numero
     for update
  loop
    exit when v_resto <= 0;
    v_taglio := least(r.importo, v_resto);
    update public.rate_fornitori
       set importo = r.importo - v_taglio,
           stato = case when r.importo - v_taglio <= 0 then 'stornata' else r.stato end
     where id = r.id;
    v_voci := v_voci || jsonb_build_object('rata_id', r.id, 'numero', r.numero, 'scadenza', r.scadenza, 'importo', v_taglio,
                                           'stato_prima', r.stato, 'metodo', r.metodo);
    v_resto := v_resto - v_taglio;
  end loop;
  perform set_config('rate_fornitori.da_storno', 'off', true);
  update public.note_credito_storni
     set rate_ridotte = rate_ridotte || v_voci, credito_residuo = greatest(0, v_resto)
   where id = p_storno;
  return greatest(0, v_resto);
end
$fn$;
revoke all on function public.nota_credito_riduci_rate(uuid, numeric) from public, anon, authenticated;

-- Disfa una riga. Una rata pagata dopo la riduzione non si può riportare indietro senza dire il falso
-- (risulterebbe pagato l'importo pieno): si ferma, a meno che il documento stia sparendo (p_forza).
create or replace function public.nota_credito_annulla_storno(p_storno uuid, p_forza boolean default false)
returns void language plpgsql security definer set search_path = '' as $fn$
declare
  s public.note_credito_storni%rowtype;
  e record;
  r record;
  v_altra record;
  v_resto numeric;
begin
  select * into s from public.note_credito_storni where id = p_storno for update;
  if not found then return; end if;
  perform set_config('rate_fornitori.da_storno', 'on', true);
  for e in
    select value as v from jsonb_array_elements(s.rate_ridotte) with ordinality as x(value, n) order by n desc
  loop
    select id, numero, stato into r from public.rate_fornitori where id = (e.v->>'rata_id')::uuid for update;
    continue when not found;
    if r.stato = 'pagata' and not p_forza then
      raise exception 'La rata % è già stata pagata con l''importo ridotto: togli prima il pagamento, poi il collegamento.', r.numero
        using errcode = 'P0001';
    end if;
    update public.rate_fornitori
       set importo = coalesce(importo, 0) + (e.v->>'importo')::numeric,
           stato = case when stato = 'stornata' then e.v->>'stato_prima' else stato end
     where id = r.id;
  end loop;
  perform set_config('rate_fornitori.da_storno', 'off', true);

  if s.company_cost_id is not null and s.costo_ridotto_di > 0 then
    update public.company_costs
       set amount = coalesce(amount, 0) + s.costo_ridotto_di,
           notes = nullif(replace(replace(coalesce(notes, ''), ' · ' || coalesce(s.costo_nota, chr(1)), ''), coalesce(s.costo_nota, chr(1)), ''), ''),
           updated_at = now()
     where id = s.company_cost_id;
  end if;
  delete from public.note_credito_storni where id = p_storno;

  -- Tornate aperte delle rate, le altre note della fattura rimaste con un credito lo riportano sulle rate.
  if not p_forza then
    for v_altra in
      select id, credito_residuo from public.note_credito_storni
       where fattura_id = s.fattura_id and credito_residuo > 0 order by created_at, id
    loop
      v_resto := public.nota_credito_riduci_rate(v_altra.id, v_altra.credito_residuo);
    end loop;
  end if;
end
$fn$;
revoke all on function public.nota_credito_annulla_storno(uuid, boolean) from public, anon, authenticated;

-- Stato e costo della nota, da quello che resta collegato.
create or replace function public.nota_credito_riallinea(p_nota uuid, p_stato_prima text, p_costo_prima uuid)
returns void language plpgsql security definer set search_path = '' as $fn$
declare
  v_quante integer; v_costi integer; v_costo uuid; v_somma numeric; n record;
begin
  select count(*), count(distinct company_cost_id), (array_agg(company_cost_id) filter (where company_cost_id is not null))[1], coalesce(sum(importo), 0)
    into v_quante, v_costi, v_costo, v_somma
    from public.note_credito_storni where nota_id = p_nota;
  if v_quante = 0 then
    update public.fatture_ricevute
       set stato = coalesce(p_stato_prima, stato), company_cost_id = p_costo_prima, updated_at = now()
     where id = p_nota;
    return;
  end if;
  select totale_documento, imponibile_totale, iva_totale, ritenuta_importo into n from public.fatture_ricevute where id = p_nota;
  -- Sul costo solo se la nota è tutta lì: è così che la leggono margine e pagamenti. Divisa su più costi,
  -- o assegnata in parte, valgono le quote (costo_stornato_da_note).
  update public.fatture_ricevute
     set stato = 'contabilizzata',
         company_cost_id = coalesce(p_costo_prima, case
           when v_costi = 1 and v_somma >= public.nota_credito_importo(n.totale_documento, n.imponibile_totale, n.iva_totale, n.ritenuta_importo) - 0.01
             then v_costo end),
         updated_at = now()
   where id = p_nota;
end
$fn$;
revoke all on function public.nota_credito_riallinea(uuid, text, uuid) from public, anon, authenticated;

-- Toglie tutti i collegamenti della nota. Restituisce le fatture che restano contabilizzate.
create or replace function public.nota_credito_scollega_interna(p_nota uuid)
returns text[] language plpgsql security definer set search_path = '' as $fn$
declare
  s public.note_credito_storni;
  v_righe public.note_credito_storni[];
  v_stato text; v_costo uuid;
  v_restano text[] := '{}';
  v_numero text;
begin
  select array_agg(x order by x.created_at desc, x.id) into v_righe from public.note_credito_storni x where x.nota_id = p_nota;
  if v_righe is null then return v_restano; end if;
  foreach s in array v_righe loop
    perform public.nota_credito_annulla_storno(s.id, false);
    v_stato := s.nota_stato_prima; v_costo := s.nota_costo_prima;
  end loop;
  perform public.nota_credito_riallinea(p_nota, v_stato, v_costo);

  -- La fattura era diventata un costo per questo collegamento: se nessuno ci ha lavorato sopra, torna com'era.
  foreach s in array v_righe loop
    continue when s.fattura_stato_prima is null or s.company_cost_id is null;
    select numero_fattura into v_numero from public.fatture_ricevute where id = s.fattura_id;
    if exists (select 1 from public.note_credito_storni o where o.fattura_id = s.fattura_id)
       or exists (select 1 from public.fatture_ricevute o where o.company_cost_id = s.company_cost_id and o.id <> s.fattura_id)
       or exists (select 1 from public.rate_fornitori r where r.company_cost_id = s.company_cost_id and r.stato = 'pagata')
       or exists (select 1 from public.company_costs k where k.id = s.company_cost_id and coalesce(k.is_paid, false))
       or exists (select 1 from public.prima_nota_entries p where p.cost_id = s.company_cost_id) then
      v_restano := v_restano || coalesce(v_numero, 's/n');
      continue;
    end if;
    begin
      update public.fatture_ricevute set company_cost_id = null, stato = s.fattura_stato_prima, updated_at = now() where id = s.fattura_id;
      delete from public.company_costs where id = s.company_cost_id;
    exception when others then
      v_restano := v_restano || coalesce(v_numero, 's/n');
    end;
  end loop;
  return v_restano;
end
$fn$;
revoke all on function public.nota_credito_scollega_interna(uuid) from public, anon, authenticated;

-- ── 3. Le azioni della pagina ──────────────────────────────────────────────

-- Le fatture dello stesso fornitore tra cui scegliere, con quanto resta aperto su ognuna.
create or replace function public.nota_credito_candidate(p_nota uuid)
returns jsonb language sql stable set search_path = '' as $fn$
  select coalesce(jsonb_agg(jsonb_build_object(
           'id', f.id, 'numero_fattura', f.numero_fattura, 'data_fattura', f.data_fattura,
           'totale_documento', f.totale_documento, 'stato', f.stato, 'storico_esterno', f.storico_esterno,
           'company_cost_id', f.company_cost_id,
           'aperto', (select coalesce(sum(r.importo), 0) from public.rate_fornitori r
                       where r.fattura_ricevuta_id = f.id and r.stato not in ('pagata', 'stornata')),
           'stornato', (select coalesce(sum(s.importo), 0) from public.note_credito_storni s
                         where s.fattura_id = f.id and s.nota_id <> n.id))
         order by f.data_fattura desc, f.numero_fattura), '[]'::jsonb)
    from public.fatture_ricevute n
    join public.fatture_ricevute f
      on f.company_id = n.company_id and f.id <> n.id
     and ((public.partner_tax_key(n.cedente_piva) <> '' and public.partner_tax_key(f.cedente_piva) = public.partner_tax_key(n.cedente_piva))
          or (public.partner_tax_key(n.cedente_cf) <> '' and public.partner_tax_key(f.cedente_cf) = public.partner_tax_key(n.cedente_cf))
          or (n.fornitore_id is not null and f.fornitore_id = n.fornitore_id))
     and not public.e_nota_credito_ricevuta(f.tipo_documento)
     and not public.e_autofattura_ricevuta(f.tipo_documento)
     and f.stato <> 'rifiutata'
   where n.id = p_nota;
$fn$;
revoke all on function public.nota_credito_candidate(uuid) from public, anon;
grant execute on function public.nota_credito_candidate(uuid) to authenticated, service_role;

-- p_quote: [{fattura_id, importo}], importi lordi e positivi. Sostituisce i collegamenti che la nota aveva già.
create or replace function public.nota_credito_collega(p_nota uuid, p_quote jsonb)
returns jsonb language plpgsql security definer set search_path = public set lock_timeout to '3s' as $fn$
declare
  n record; f record; q record; k record;
  v_id uuid;
  v_importo_nota numeric; v_imponibile_nota numeric; v_somma numeric; v_quanti integer;
  v_gia_stornato numeric; v_imp_quota numeric; v_imp_usato numeric := 0; v_riduci numeric := 0; v_nota text;
  v_stato_prima text; v_costo_prima uuid; v_stato_fattura text; v_esito jsonb; v_cost uuid; v_credito numeric := 0; v_rifatta text[];
  v_avvisate jsonb := '[]'::jsonb; v_chiuse jsonb := '[]'::jsonb; v_senza_debito jsonb := '[]'::jsonb; v_i integer := 0; v_r numeric;
begin
  select * into n from public.fatture_ricevute where id = p_nota for update;
  if not found then raise exception 'Nota di credito non trovata.' using errcode = 'P0002'; end if;
  if not (n.company_id = any (public.aziende_con_permesso('can_view_costs'))) or public.utente_sola_lettura(n.company_id) then
    raise exception 'Il tuo ruolo non permette di registrare i costi.' using errcode = '42501';
  end if;
  if not public.e_nota_credito_ricevuta(n.tipo_documento) then raise exception 'Questo documento non è una nota di credito.' using errcode = 'P0001'; end if;
  if n.stato = 'rifiutata' then raise exception 'La nota di credito è rifiutata: non riduce nessun debito.' using errcode = 'P0001'; end if;
  if p_quote is null or jsonb_typeof(p_quote) <> 'array' or jsonb_array_length(p_quote) = 0 then
    raise exception 'Scegli almeno una fattura da stornare.' using errcode = '22023';
  end if;
  if exists (select 1 from jsonb_array_elements(p_quote) x
              where nullif(x->>'fattura_id', '') is null or coalesce(nullif(x->>'importo', '')::numeric, 0) <= 0) then
    raise exception 'Ogni fattura ha bisogno di un importo maggiore di zero.' using errcode = '22023';
  end if;
  select count(distinct x->>'fattura_id'), count(*), round(sum((x->>'importo')::numeric), 2) into v_i, v_quanti, v_somma from jsonb_array_elements(p_quote) x;
  if v_i <> v_quanti then raise exception 'Una fattura compare due volte.' using errcode = '22023'; end if;
  v_i := 0;

  v_importo_nota := public.nota_credito_importo(n.totale_documento, n.imponibile_totale, n.iva_totale, n.ritenuta_importo);
  if v_importo_nota <= 0 then raise exception 'La nota di credito non ha importi: aprila e completa i dati.' using errcode = '22023'; end if;
  if v_somma > v_importo_nota + 0.01 then
    raise exception 'Le quote (% €) superano la nota di credito (% €).',
      replace(to_char(v_somma, 'FM999999990.00'), '.', ','), replace(to_char(v_importo_nota, 'FM999999990.00'), '.', ',') using errcode = '22023';
  end if;
  v_imponibile_nota := abs(coalesce(n.imponibile_totale, coalesce(n.totale_documento, 0) - coalesce(n.iva_totale, 0)));

  -- Si riparte pulito: cambiare un collegamento è togliere il vecchio e mettere il nuovo, nella stessa transazione.
  v_rifatta := public.nota_credito_scollega_interna(p_nota);
  select * into n from public.fatture_ricevute where id = p_nota;
  v_stato_prima := n.stato;
  v_costo_prima := n.company_cost_id;

  if v_costo_prima is not null and v_quanti > 1 then
    raise exception 'Questa nota rettifica già il costo di un ordine: può stornare una sola fattura, quella di quel costo.' using errcode = 'P0001';
  end if;

  for q in
    select (x.e->>'fattura_id')::uuid as fattura_id, round((x.e->>'importo')::numeric, 2) as importo, x.ord
      from jsonb_array_elements(p_quote) with ordinality as x(e, ord) order by x.ord
  loop
    v_i := v_i + 1;
    select * into f from public.fatture_ricevute where id = q.fattura_id for update;
    if not found or f.company_id <> n.company_id then raise exception 'Una fattura non è di questa azienda.' using errcode = '42501'; end if;
    if f.id = n.id or public.e_nota_credito_ricevuta(f.tipo_documento) or public.e_autofattura_ricevuta(f.tipo_documento) then
      raise exception 'La fattura % non si può stornare con una nota di credito.', f.numero_fattura using errcode = 'P0001';
    end if;
    if f.stato = 'rifiutata' then raise exception 'La fattura % è rifiutata: non c''è un debito da ridurre.', f.numero_fattura using errcode = 'P0001'; end if;
    if not ((public.partner_tax_key(n.cedente_piva) <> '' and public.partner_tax_key(f.cedente_piva) = public.partner_tax_key(n.cedente_piva))
            or (public.partner_tax_key(n.cedente_cf) <> '' and public.partner_tax_key(f.cedente_cf) = public.partner_tax_key(n.cedente_cf))
            or (n.fornitore_id is not null and f.fornitore_id = n.fornitore_id)) then
      raise exception 'La fattura % è di un altro fornitore.', f.numero_fattura using errcode = 'P0001';
    end if;
    select coalesce(sum(s.importo), 0) into v_gia_stornato from public.note_credito_storni s where s.fattura_id = f.id;
    if q.importo + v_gia_stornato > abs(coalesce(f.totale_documento, 0)) + 0.01 then
      raise exception 'La fattura % è di % € e ne sono già stornati % €: non può ricevere altri % €.', f.numero_fattura,
        replace(to_char(abs(coalesce(f.totale_documento, 0)), 'FM999999990.00'), '.', ','),
        replace(to_char(v_gia_stornato, 'FM999999990.00'), '.', ','),
        replace(to_char(q.importo, 'FM999999990.00'), '.', ',') using errcode = 'P0001';
    end if;

    v_cost := f.company_cost_id;
    v_stato_fattura := null;
    if v_costo_prima is not null and v_cost is distinct from v_costo_prima then
      raise exception 'Questa nota rettifica già il costo di un ordine, e la fattura % non è su quel costo.', f.numero_fattura using errcode = 'P0001';
    end if;
    -- Il debito deve esistere per poterlo ridurre. Lo storico importato è già chiuso fuori dal gestionale: lì
    -- resta solo il collegamento.
    if v_cost is null and not coalesce(f.storico_esterno, false) then
      v_esito := public.contabilizza_fattura_ricevuta(f.id);
      v_cost := (v_esito->>'company_cost_id')::uuid;
      if v_esito->>'esito' = 'costo_creato' and not exists (select 1 from public.fattura_ricevuta_ordini o where o.fattura_id = f.id) then
        v_stato_fattura := f.stato;
      end if;
    end if;

    -- L'ultima quota prende il resto dell'imponibile, se la nota è assegnata tutta: niente centesimi persi.
    v_imp_quota := case
      when v_i = v_quanti and v_somma >= v_importo_nota - 0.01 then greatest(0, v_imponibile_nota - v_imp_usato)
      else round(v_imponibile_nota * q.importo / v_importo_nota, 2) end;
    v_imp_usato := v_imp_usato + v_imp_quota;

    v_riduci := 0; v_nota := null;
    if v_cost is not null and v_costo_prima is null then
      select id, amount into k from public.company_costs where id = v_cost for update;
      v_riduci := least(v_imp_quota, coalesce(k.amount, 0));
      v_nota := 'Ridotto di ' || replace(to_char(v_riduci, 'FM999999990.00'), '.', ',') || ' € dalla nota di credito '
                || coalesce(n.numero_fattura, '') || ' del ' || to_char(n.data_fattura, 'DD/MM/YYYY');
      update public.company_costs
         set amount = coalesce(amount, 0) - v_riduci,
             notes = coalesce(notes || ' · ', '') || v_nota,
             updated_at = now()
       where id = v_cost;
    end if;

    insert into public.note_credito_storni
      (company_id, nota_id, fattura_id, company_cost_id, importo, imponibile, costo_ridotto_di, costo_nota,
       nota_stato_prima, nota_costo_prima, fattura_stato_prima, creato_da)
    values
      (n.company_id, n.id, f.id, v_cost, q.importo, v_imp_quota, v_riduci, v_nota,
       v_stato_prima, v_costo_prima, v_stato_fattura, auth.uid())
    returning id into v_id;

    if coalesce(f.storico_esterno, false) and f.company_cost_id is null then
      v_senza_debito := v_senza_debito || to_jsonb(f.numero_fattura);
    else
      v_r := public.nota_credito_riduci_rate(v_id, q.importo);
      v_credito := v_credito + v_r;
    end if;

    select v_avvisate || coalesce(jsonb_agg(jsonb_build_object('fattura', f.numero_fattura, 'numero', e->'numero', 'scadenza', e->'scadenza', 'importo', e->'importo')), '[]'::jsonb)
      into v_avvisate
      from public.note_credito_storni s, jsonb_array_elements(s.rate_ridotte) e
     where s.id = v_id and e->>'stato_prima' = 'avvisata';
    if not exists (select 1 from public.rate_fornitori r where r.fattura_ricevuta_id = f.id and r.stato <> 'stornata')
       and exists (select 1 from public.rate_fornitori r where r.fattura_ricevuta_id = f.id) then
      v_chiuse := v_chiuse || to_jsonb(f.numero_fattura);
    end if;
  end loop;

  perform public.nota_credito_riallinea(n.id, v_stato_prima, v_costo_prima);

  return jsonb_build_object(
    'esito', 'collegata', 'fatture', v_quanti, 'stornato', v_somma,
    'non_assegnato', greatest(0, round(v_importo_nota - v_somma, 2)),
    'credito_residuo', v_credito,
    'fatture_chiuse', v_chiuse,
    'riba_avvisate', v_avvisate,
    'solo_collegamento', v_senza_debito);
end
$fn$;
revoke all on function public.nota_credito_collega(uuid, jsonb) from public, anon;
grant execute on function public.nota_credito_collega(uuid, jsonb) to authenticated, service_role;

create or replace function public.nota_credito_scollega(p_nota uuid)
returns jsonb language plpgsql security definer set search_path = public set lock_timeout to '3s' as $fn$
declare
  n record; v_restano text[];
begin
  select id, company_id into n from public.fatture_ricevute where id = p_nota for update;
  if not found then raise exception 'Nota di credito non trovata.' using errcode = 'P0002'; end if;
  if not (n.company_id = any (public.aziende_con_permesso('can_view_costs'))) or public.utente_sola_lettura(n.company_id) then
    raise exception 'Il tuo ruolo non permette di registrare i costi.' using errcode = '42501';
  end if;
  v_restano := public.nota_credito_scollega_interna(p_nota);
  return jsonb_build_object('esito', 'scollegata', 'fatture_restano_contabilizzate', to_jsonb(v_restano));
end
$fn$;
revoke all on function public.nota_credito_scollega(uuid) from public, anon;
grant execute on function public.nota_credito_scollega(uuid) to authenticated, service_role;

-- ── 4. Le fatture collegate non cambiano sotto i piedi ─────────────────────

create or replace function public.fattura_con_storni_guardia()
returns trigger language plpgsql security definer set search_path = '' as $fn$
begin
  if new.stato = 'rifiutata' and old.stato <> 'rifiutata'
     and exists (select 1 from public.note_credito_storni s where new.id in (s.nota_id, s.fattura_id)) then
    raise exception 'Questo documento è legato a una nota di credito: togli prima il collegamento.' using errcode = 'P0001';
  end if;
  -- Spostare la fattura su un altro costo lascerebbe la riduzione sul vecchio. La sparizione del costo
  -- (on delete set null) passa: non resta niente da riallineare.
  if new.company_cost_id is not null and new.company_cost_id is distinct from old.company_cost_id
     and exists (select 1 from public.note_credito_storni s where s.fattura_id = new.id) then
    raise exception 'Questa fattura è ridotta da una nota di credito: togli prima il collegamento.' using errcode = 'P0001';
  end if;
  return new;
end
$fn$;
revoke all on function public.fattura_con_storni_guardia() from public, anon, authenticated;
drop trigger if exists fattura_con_storni_guardia on public.fatture_ricevute;
create trigger fattura_con_storni_guardia
  before update of stato, company_cost_id on public.fatture_ricevute
  for each row execute function public.fattura_con_storni_guardia();

-- Un documento che sparisce porta via il suo effetto: la nota cancellata non lascia le rate ridotte.
create or replace function public.fattura_con_storni_via()
returns trigger language plpgsql security definer set search_path = '' as $fn$
declare s record;
begin
  for s in select * from public.note_credito_storni x where old.id in (x.nota_id, x.fattura_id) loop
    perform public.nota_credito_annulla_storno(s.id, true);
    if s.nota_id <> old.id then
      perform public.nota_credito_riallinea(s.nota_id, s.nota_stato_prima, s.nota_costo_prima);
    end if;
  end loop;
  return old;
end
$fn$;
revoke all on function public.fattura_con_storni_via() from public, anon, authenticated;
drop trigger if exists fattura_con_storni_via on public.fatture_ricevute;
create trigger fattura_con_storni_via
  before delete on public.fatture_ricevute
  for each row execute function public.fattura_con_storni_via();

-- ── 5. Chi legge il debito ─────────────────────────────────────────────────

-- La parte delle note che non sta sul costo perché divisa: margine e pagamenti leggono le note collegate al
-- costo, e una nota su più costi non può esserlo.
create or replace function public.costo_stornato_da_note(p_costo uuid)
returns numeric language sql stable set search_path = '' as $fn$
  select coalesce(sum(s.importo), 0)
    from public.note_credito_storni s
    join public.fatture_ricevute n on n.id = s.nota_id
   where s.company_cost_id = p_costo and n.company_cost_id is null
$fn$;
revoke all on function public.costo_stornato_da_note(uuid) from public, anon;
grant execute on function public.costo_stornato_da_note(uuid) to authenticated, service_role;

do $$
declare
  v_def text; v_nuova text;
begin
  -- contabilizza: la nota collegata è già a posto; quella senza collegamento dice cosa fare.
  v_def := pg_get_functiondef('public.contabilizza_fattura_ricevuta(uuid)'::regprocedure);
  if position('note_credito_storni' in v_def) = 0 then
    v_nuova := replace(v_def, $q$if v_nota_credito and f.company_cost_id is not null then$q$,
      $q$if v_nota_credito and (f.company_cost_id is not null or exists (select 1 from public.note_credito_storni s where s.nota_id = f.id)) then$q$);
    v_nuova := replace(v_nuova, $q$'Una nota di credito riduce un costo: collegala prima all''ordine al fornitore della fattura che rettifica.'$q$,
      $q$'Una nota di credito riduce il debito di una fattura: scegli la fattura che storna con «Collega alla fattura» (o l''ordine che rettifica).'$q$);
    if v_nuova = v_def or position('Collega alla fattura' in v_nuova) = 0 or position('note_credito_storni' in v_nuova) = 0 then
      raise exception 'contabilizza_fattura_ricevuta: punti da cambiare non trovati';
    end if;
    execute v_nuova;
  end if;

  -- Il totale del costo: note collegate col segno giusto, comprese quelle da Fatture in Cloud, meno le quote.
  v_def := pg_get_functiondef('public.dettaglio_pagamento_costo(uuid)'::regprocedure);
  if position('costo_stornato_da_note' in v_def) = 0 then
    v_nuova := replace(v_def, $q$tipo_documento in ('TD04','TD08') then$q$, $q$tipo_documento in ('TD04','TD08','passive_credit_note') then$q$);
    v_nuova := replace(v_nuova, $q$c.amount*(1+coalesce(c.vat_rate,0)/100)),2) into totale$q$, $q$c.amount*(1+coalesce(c.vat_rate,0)/100))-public.costo_stornato_da_note(c.id),2) into totale$q$);
    if position('costo_stornato_da_note' in v_nuova) = 0 or position('passive_credit_note' in v_nuova) = 0 then
      raise exception 'dettaglio_pagamento_costo: punti da cambiare non trovati';
    end if;
    execute v_nuova;
  end if;

  v_def := pg_get_functiondef('public.spesa_pagamento_totale(uuid)'::regprocedure);
  if position('costo_stornato_da_note' in v_def) = 0 then
    v_nuova := replace(v_def, $q$tipo_documento in ('TD04','TD08') then$q$, $q$tipo_documento in ('TD04','TD08','passive_credit_note') then$q$);
    v_nuova := replace(v_nuova, $q$c.amount*(1+coalesce(c.vat_rate,0)/100)),2) into valore$q$, $q$c.amount*(1+coalesce(c.vat_rate,0)/100))-public.costo_stornato_da_note(c.id),2) into valore$q$);
    if position('costo_stornato_da_note' in v_nuova) = 0 or position('passive_credit_note' in v_nuova) = 0 then
      raise exception 'spesa_pagamento_totale: punti da cambiare non trovati';
    end if;
    execute v_nuova;
  end if;

  v_def := pg_get_functiondef('public.commessa_quadro_pagamenti(uuid)'::regprocedure);
  if position('costo_stornato_da_note' in v_def) = 0 then
    v_nuova := replace(v_def,
      $q$sum(CASE WHEN fr.tipo_documento IN ('TD04', 'TD08') THEN -abs(fr.totale_documento) ELSE fr.totale_documento END) AS totale$q$,
      $q$sum(CASE WHEN fr.tipo_documento IN ('TD04', 'TD08', 'passive_credit_note') THEN -abs(fr.totale_documento) ELSE fr.totale_documento END) - public.costo_stornato_da_note(c.id) AS totale$q$);
    if position('costo_stornato_da_note' in v_nuova) = 0 then
      raise exception 'commessa_quadro_pagamenti: punto da cambiare non trovato';
    end if;
    execute v_nuova;
  end if;

  -- Le viste delle rate. CREATE OR REPLACE VIEW azzera le opzioni: security_invoker va riscritto.
  v_def := pg_get_viewdef('public.v_uscite_stato'::regclass);
  if position('stornata' in v_def) = 0 then
    v_nuova := replace(replace(v_def, $q$(r.stato <> 'pagata'::text)$q$, $q$((r.stato <> 'pagata'::text) AND (r.stato <> 'stornata'::text))$q$),
                       $q$(x.stato <> 'pagata'::text)$q$, $q$((x.stato <> 'pagata'::text) AND (x.stato <> 'stornata'::text))$q$);
    if v_nuova = v_def then raise exception 'v_uscite_stato: punto da cambiare non trovato'; end if;
    execute 'create or replace view public.v_uscite_stato with (security_invoker = on) as ' || v_nuova;
  end if;

  v_def := pg_get_viewdef('public.v_riba_fornitori'::regclass);
  if position('stornata' in v_def) = 0 then
    v_nuova := replace(v_def, $q$WHERE (r.metodo = 'riba'::text)$q$, $q$WHERE ((r.metodo = 'riba'::text) AND (r.stato <> 'stornata'::text))$q$);
    if v_nuova = v_def then raise exception 'v_riba_fornitori: punto da cambiare non trovato'; end if;
    execute 'create or replace view public.v_riba_fornitori with (security_invoker = on) as ' || v_nuova;
  end if;

  v_def := pg_get_viewdef('public.fatture_ricevute_pagamento'::regclass);
  if position('stornata' in v_def) = 0 then
    -- Le stornate non contano né fra le aperte né fra le totali: rate_pagate (totali - aperte) resta il numero delle
    -- pagate, e «Pagata 1 rata su 2» parla delle rate che si pagano davvero.
    v_nuova := replace(v_def, $q$(rf.stato <> 'pagata'::text)$q$, $q$((rf.stato <> 'pagata'::text) AND (rf.stato <> 'stornata'::text))$q$);
    v_nuova := replace(v_nuova, $q$count(*) AS n,$q$, $q$count(*) FILTER (WHERE (rf.stato <> 'stornata'::text)) AS n,$q$);
    if v_nuova = v_def or position('AS n,' in v_nuova) = 0 or position($q$FILTER (WHERE (rf.stato <> 'stornata'::text)) AS n$q$ in v_nuova) = 0 then
      raise exception 'fatture_ricevute_pagamento: punti da cambiare non trovati';
    end if;
    execute 'create or replace view public.fatture_ricevute_pagamento with (security_invoker = true) as ' || v_nuova;
  end if;
end $$;

-- ── 6. Accessi: si legge chi vede la nota, la fattura o il costo; si scrive solo dalle funzioni ──

alter table public.note_credito_storni enable row level security;
revoke all on public.note_credito_storni from public, anon, authenticated;
grant select on public.note_credito_storni to authenticated;
grant all on public.note_credito_storni to service_role;

drop policy if exists blocco_utente_bloccato on public.note_credito_storni;
create policy blocco_utente_bloccato on public.note_credito_storni
  as restrictive for all to authenticated
  using (not (select public.utente_bloccato()))
  with check (not (select public.utente_bloccato()));

drop policy if exists note_credito_storni_lettura on public.note_credito_storni;
create policy note_credito_storni_lettura on public.note_credito_storni for select to authenticated
  using (exists (select 1 from public.fatture_ricevute f where f.id = note_credito_storni.nota_id)
         or exists (select 1 from public.company_costs c where c.id = note_credito_storni.company_cost_id));

drop trigger if exists trg_registra_azione_utente on public.note_credito_storni;
create trigger trg_registra_azione_utente
  after insert or update or delete on public.note_credito_storni
  for each row execute function public.registra_azione_utente();
