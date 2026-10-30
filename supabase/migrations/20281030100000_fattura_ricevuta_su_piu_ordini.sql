-- Una fattura ricevuta divisa tra più ordini d'acquisto (30/10/2026).
--
-- Un fornitore che a fine mese fattura in un colpo solo le consegne di più
-- ordini manda UNA fattura per N ordini. Finora la fattura si collegava a un
-- solo ordine (fatture_ricevute.purchase_order_id): contabilizzandola, tutto
-- l'imponibile finiva sul costo di quell'ordine, mentre gli altri continuavano
-- a contare il proprio valore. Nel margine delle commesse gli acquisti
-- risultavano contati due volte.
--
-- Ora la fattura può avere una QUOTA per ordine (fattura_ricevuta_ordini):
--   * un solo ordine resta come prima: purchase_order_id, nessuna quota;
--   * due o più ordini: purchase_order_id vuoto, una riga per ordine con
--     l'imponibile che gli spetta. La somma non supera l'imponibile della
--     fattura; il resto è un costo generale, non di commessa.
--
-- Contabilizzando una fattura divisa:
--   * nasce UN costo con tutto l'imponibile (le scadenze e le RiBa della
--     fattura restano una sola cosa), senza ordine e senza commessa;
--   * il costo nato alla ricezione di ciascun ordine scende della sua quota
--     (resta il «non ancora fatturato»), così in tesoreria non si paga due volte;
--   * il margine di ogni ordine conta la sua quota (marginalita_costo_oda);
--   * un ordine ricevuto DOPO crea il suo costo al netto delle quote già fatturate.
--
-- Le quote si cambiano solo prima di contabilizzare: dopo, i costi degli
-- ordini sono già stati ridotti e cambiarle li lascerebbe sbagliati.

-- ─── 1. La tabella delle quote ──────────────────────────────────────────────
create table if not exists public.fattura_ricevuta_ordini (
  id                uuid primary key default gen_random_uuid(),
  company_id        uuid not null references public.companies(id) on delete cascade,
  fattura_id        uuid not null references public.fatture_ricevute(id) on delete cascade,
  purchase_order_id uuid not null references public.purchase_orders(id) on delete cascade,
  importo           numeric(14,2) not null check (importo > 0),
  created_at        timestamptz not null default now(),
  created_by        uuid default auth.uid(),
  unique (fattura_id, purchase_order_id)
);

create index if not exists fattura_ricevuta_ordini_oda_idx
  on public.fattura_ricevuta_ordini (purchase_order_id);
create index if not exists fattura_ricevuta_ordini_company_idx
  on public.fattura_ricevuta_ordini (company_id);

alter table public.fattura_ricevuta_ordini enable row level security;

-- Si legge come la fattura; si scrive solo da collega_fattura_a_ordini().
drop policy if exists blocco_utente_bloccato on public.fattura_ricevuta_ordini;
create policy blocco_utente_bloccato on public.fattura_ricevuta_ordini
  as restrictive for all to authenticated
  using (not (select public.utente_bloccato()))
  with check (not (select public.utente_bloccato()));

drop policy if exists fattura_ricevuta_ordini_lettura on public.fattura_ricevuta_ordini;
create policy fattura_ricevuta_ordini_lettura on public.fattura_ricevuta_ordini
  for select to authenticated
  using (company_id = (select public.get_my_company_id())
         and (select public.puo_vedere_documenti_fornitore()));

drop policy if exists fattura_ricevuta_ordini_commercialista on public.fattura_ricevuta_ordini;
create policy fattura_ricevuta_ordini_commercialista on public.fattura_ricevuta_ordini
  for select to authenticated
  using (public.user_can_read_accountant_company(company_id));

revoke all on public.fattura_ricevuta_ordini from anon, public;
grant select on public.fattura_ricevuta_ordini to authenticated;

-- ─── 2. Collegare una fattura a zero, uno o più ordini ─────────────────────
-- p_quote: [{"purchase_order_id": "...", "importo": 123.45}, ...]
create or replace function public.collega_fattura_a_ordini(p_fattura_id uuid, p_quote jsonb)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  f            record;
  v_n          int;
  v_imponibile numeric;
  v_somma      numeric;
  q            record;
begin
  select * into f from public.fatture_ricevute where id = p_fattura_id;
  if not found
     or f.company_id is distinct from public.get_my_company_id()
     or not public.puo_vedere_documenti_fornitore() then
    raise exception 'Fattura non trovata' using errcode = '42501';
  end if;

  if jsonb_typeof(coalesce(p_quote, '[]'::jsonb)) <> 'array' then
    raise exception 'Elenco degli ordini non valido';
  end if;
  v_n := jsonb_array_length(coalesce(p_quote, '[]'::jsonb));

  -- Dopo la contabilizzazione i costi degli ordini sono già stati ridotti
  -- delle quote: cambiarle li lascerebbe sbagliati.
  if f.stato = 'contabilizzata' and exists (select 1 from public.fattura_ricevuta_ordini where fattura_id = f.id) then
    raise exception 'Questa fattura è già contabilizzata e divisa tra più ordini: le quote non si cambiano più.';
  end if;
  if f.stato = 'contabilizzata' and v_n >= 2 then
    raise exception 'Questa fattura è già contabilizzata: si può dividere tra più ordini solo prima di contabilizzarla.';
  end if;

  if v_n >= 2 and left(coalesce(f.tipo_documento, ''), 4) in ('TD04', 'TD05') then
    raise exception 'Una nota di credito o di debito rettifica un solo ordine: collegala a quello.';
  end if;

  -- Ogni ordine: della stessa azienda, emesso, una volta sola.
  for q in
    select (e->>'purchase_order_id')::uuid as po_id,
           round(coalesce(nullif(e->>'importo', '')::numeric, 0), 2) as importo
      from jsonb_array_elements(coalesce(p_quote, '[]'::jsonb)) e
  loop
    if q.po_id is null or not exists (
         select 1 from public.purchase_orders po
          where po.id = q.po_id and po.company_id = f.company_id
            and po.status in ('inviato', 'confermato', 'parziale', 'ricevuto')) then
      raise exception 'Uno degli ordini scelti non è un ordine emesso della tua azienda.' using errcode = '42501';
    end if;
    if v_n >= 2 and q.importo <= 0 then
      raise exception 'Ogni ordine deve avere la sua quota, maggiore di zero.';
    end if;
  end loop;

  if (select count(distinct e->>'purchase_order_id') from jsonb_array_elements(coalesce(p_quote, '[]'::jsonb)) e) <> v_n then
    raise exception 'Lo stesso ordine compare due volte.';
  end if;

  if v_n >= 2 then
    v_imponibile := abs(coalesce(f.imponibile_totale,
                         case when f.totale_documento is not null and f.iva_totale is not null
                              then f.totale_documento - f.iva_totale end));
    select sum(round(coalesce(nullif(e->>'importo', '')::numeric, 0), 2)) into v_somma
      from jsonb_array_elements(p_quote) e;
    if v_imponibile is null or v_imponibile <= 0 then
      raise exception 'Questa fattura non ha l''imponibile: senza, non si può dividere tra gli ordini.';
    end if;
    if v_somma > v_imponibile + 0.01 then
      raise exception 'Le quote (% €) superano l''imponibile della fattura (% €).',
        replace(to_char(v_somma, 'FM999999990.00'), '.', ','),
        replace(to_char(v_imponibile, 'FM999999990.00'), '.', ',');
    end if;
  end if;

  delete from public.fattura_ricevuta_ordini where fattura_id = f.id;

  if v_n = 0 then
    update public.fatture_ricevute
       set purchase_order_id = null, aggancio_oda_manuale = true, updated_at = now()
     where id = f.id;
  elsif v_n = 1 then
    update public.fatture_ricevute
       set purchase_order_id = (p_quote->0->>'purchase_order_id')::uuid,
           aggancio_oda_manuale = true, updated_at = now()
     where id = f.id;
  else
    insert into public.fattura_ricevuta_ordini (company_id, fattura_id, purchase_order_id, importo)
    select f.company_id, f.id, (e->>'purchase_order_id')::uuid,
           round((e->>'importo')::numeric, 2)
      from jsonb_array_elements(p_quote) e;
    update public.fatture_ricevute
       set purchase_order_id = null, aggancio_oda_manuale = true, updated_at = now()
     where id = f.id;
  end if;

  return jsonb_build_object('ordini', v_n, 'resto', case when v_n >= 2 then v_imponibile - v_somma end);
end
$function$;

revoke all on function public.collega_fattura_a_ordini(uuid, jsonb) from public, anon;
grant execute on function public.collega_fattura_a_ordini(uuid, jsonb) to authenticated;

-- ─── 3. Le quote fatturate di un ordine ────────────────────────────────────
-- Solo le fatture contabilizzate: prima, il margine conta il valore dell'ordine
-- (come per la fattura collegata a un solo ordine).
create or replace function public.oda_quote_fatturate()
returns table(purchase_order_id uuid, company_id uuid, tot numeric)
language sql
stable
security definer
set search_path to 'public'
as $function$
  select q.purchase_order_id, q.company_id, sum(q.importo)
    from public.fattura_ricevuta_ordini q
    join public.fatture_ricevute fr on fr.id = q.fattura_id and fr.company_id = q.company_id
   where fr.stato = 'contabilizzata' and fr.company_cost_id is not null
   group by q.purchase_order_id, q.company_id
$function$;

revoke all on function public.oda_quote_fatturate() from public, anon, authenticated;

-- ─── 4. Il margine dell'ordine conta anche le quote ────────────────────────
create or replace function public.marginalita_costo_oda()
returns table(order_id uuid, importo numeric)
language sql
stable security definer
set search_path to 'public'
as $function$
  select po.order_id,
         (case
            when cc.tot is null and qf.tot is null then po.subtotal
            else greatest(0, greatest(coalesce(po.subtotal, 0),
                                      coalesce(cc.tot, 0) + coalesce(qf.tot, 0) + coalesce(nc.tot, 0))
                             - coalesce(nc.tot, 0))
          end)::numeric
    from public.purchase_orders po
    left join (select c.purchase_order_id, c.company_id, sum(coalesce(c.amount, 0)) as tot
                 from public.company_costs c
                where c.purchase_order_id is not null
                group by c.purchase_order_id, c.company_id) cc
           on cc.purchase_order_id = po.id and cc.company_id = po.company_id
    -- le quote delle fatture divise tra più ordini
    left join public.oda_quote_fatturate() qf
           on qf.purchase_order_id = po.id and qf.company_id = po.company_id
    left join (select c.purchase_order_id, c.company_id, sum(abs(coalesce(fr.imponibile_totale, 0))) as tot
                 from public.fatture_ricevute fr
                 join public.company_costs c on c.id = fr.company_cost_id and c.company_id = fr.company_id
                where c.purchase_order_id is not null
                  and fr.tipo_documento in ('TD04', 'passive_credit_note')
                group by c.purchase_order_id, c.company_id) nc
           on nc.purchase_order_id = po.id and nc.company_id = po.company_id
   where po.order_id is not null
     and po.status in ('inviato', 'confermato', 'parziale', 'ricevuto')
     and (auth.uid() is null
          or po.company_id in (select c.id from public.companies c where public.user_can_access_company(c.id)))
$function$;

create or replace function public.marginalita_costo_oda(p_order_id uuid)
returns table(order_id uuid, importo numeric)
language sql
stable security definer
set search_path to 'public'
as $function$
  select po.order_id,
         (case
            when cc.tot is null and qf.tot is null then po.subtotal
            else greatest(0, greatest(coalesce(po.subtotal, 0),
                                      coalesce(cc.tot, 0) + coalesce(qf.tot, 0) + coalesce(nc.tot, 0))
                             - coalesce(nc.tot, 0))
          end)::numeric
    from public.purchase_orders po
    left join (select c.purchase_order_id, c.company_id, sum(coalesce(c.amount, 0)) as tot
                 from public.company_costs c
                where c.purchase_order_id is not null
                group by c.purchase_order_id, c.company_id) cc
           on cc.purchase_order_id = po.id and cc.company_id = po.company_id
    -- le quote delle fatture divise tra più ordini
    left join (select q.purchase_order_id, q.company_id, sum(q.importo) as tot
                 from public.fattura_ricevuta_ordini q
                 join public.fatture_ricevute fr on fr.id = q.fattura_id and fr.company_id = q.company_id
                 join public.purchase_orders p2 on p2.id = q.purchase_order_id
                where p2.order_id = p_order_id
                  and fr.stato = 'contabilizzata' and fr.company_cost_id is not null
                group by q.purchase_order_id, q.company_id) qf
           on qf.purchase_order_id = po.id and qf.company_id = po.company_id
    -- le note di credito già tolte dai costi dell'ordine
    left join (select c.purchase_order_id, c.company_id, sum(abs(coalesce(fr.imponibile_totale, 0))) as tot
                 from public.fatture_ricevute fr
                 join public.company_costs c on c.id = fr.company_cost_id and c.company_id = fr.company_id
                where c.purchase_order_id is not null
                  and fr.tipo_documento in ('TD04', 'passive_credit_note')
                group by c.purchase_order_id, c.company_id) nc
           on nc.purchase_order_id = po.id and nc.company_id = po.company_id
   where po.order_id = p_order_id
     and po.status in ('inviato', 'confermato', 'parziale', 'ricevuto')
     and (auth.uid() is null
          or po.company_id in (select c.id from public.companies c where public.user_can_access_company(c.id)))
$function$;

revoke all on function public.marginalita_costo_oda() from public, anon;
revoke all on function public.marginalita_costo_oda(uuid) from public, anon;

-- ─── 5. L'ordine ricevuto dopo: costo al netto delle quote già fatturate ───
create or replace function public.crea_costo_da_ricezione_oda()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_fornitore  record;
  v_termini    text;
  v_giorni     int;
  v_scadenza   date;
  v_vat        numeric;
  v_fatturato  numeric;
begin
  -- Solo sul VERO passaggio a ricevuto, una volta sola.
  if new.status <> 'ricevuto' or old.status = 'ricevuto' then
    return new;
  end if;
  -- Idempotenza: un ordine puo' ripassare di qui (ripristini, doppi update).
  if exists (select 1 from company_costs c where c.purchase_order_id = new.id and c.company_id = new.company_id) then
    return new;
  end if;
  -- La parte già pagata dentro una fattura divisa tra più ordini non si
  -- registra una seconda volta.
  select coalesce(sum(q.importo), 0) into v_fatturato
    from fattura_ricevuta_ordini q
    join fatture_ricevute fr on fr.id = q.fattura_id
   where q.purchase_order_id = new.id and fr.stato = 'contabilizzata' and fr.company_cost_id is not null;
  -- Un ordine senza importo non ha niente da pagare: un costo a zero sarebbe
  -- solo rumore in tesoreria.
  if coalesce(new.subtotal, 0) - v_fatturato <= 0 then
    return new;
  end if;

  select name, payment_method into v_fornitore
  from suppliers where id = new.supplier_id;

  -- Scadenza dai termini di pagamento: quelli dell'ordine, o quelli abituali
  -- del fornitore. Stessa grammatica del parser frontend
  -- (src/lib/terminiPagamento.ts): "30 gg", "60 giorni", "fine mese",
  -- "alla consegna". Testo incomprensibile => si paga oggi, dichiaratamente:
  -- meglio di una data inventata con l'aria di essere giusta.
  v_termini := coalesce(nullif(new.payment_terms, ''), v_fornitore.payment_method, '');
  if v_termini ~* '(alla\s+consegna|a\s+vista|contanti|immediato|anticipat)' then
    v_giorni := 0;
  else
    v_giorni := nullif((regexp_match(v_termini, '(\d{1,3})\s*(?:gg|giorni|g\.?g\.?|days?|dd)', 'i'))[1], '')::int;
  end if;

  if v_giorni is null then
    v_scadenza := current_date;
  elsif v_termini ~* '(fine\s*mese|f\.?\s*m\.?)' then
    v_scadenza := (date_trunc('month', current_date + v_giorni) + interval '1 month - 1 day')::date;
  else
    v_scadenza := current_date + v_giorni;
  end if;

  v_vat := case when coalesce(new.vat_total, 0) > 0 and new.subtotal > 0
                then round(new.vat_total / new.subtotal * 100, 4)
                else 22 end;

  insert into company_costs (
    company_id, purchase_order_id, order_id, supplier_id,
    name, cost_type, amount, vat_rate, category, recurrence,
    due_date, is_paid, notes
  ) values (
    new.company_id, new.id, new.order_id, new.supplier_id,
    'OdA ' || new.oda_number || ' - ' || coalesce(v_fornitore.name, 'Fornitore'),
    'variable', new.subtotal - v_fatturato, v_vat, 'materiali', 'once',
    v_scadenza, false,
    'Generato automaticamente alla ricezione di ' || new.oda_number
      || case when v_fatturato > 0
              then ' · al netto di ' || replace(to_char(v_fatturato, 'FM999999990.00'), '.', ',')
                   || ' € già fatturati in una fattura divisa tra più ordini'
              else '' end
  );

  return new;
end $function$;

-- ─── 6. L'aggancio automatico non prende un ordine già in una fattura divisa ─
create or replace function public.aggancia_fattura_a_oda()
returns trigger
language plpgsql
set search_path to 'public'
as $function$
declare
  v_piva text;
  v_cf   text;
  v_ids  uuid[];
begin
  -- Le note di credito/debito non ordinano merce: mai agganciarle a un OdA.
  if left(coalesce(new.tipo_documento, ''), 4) in ('TD04', 'TD05') then
    return new;
  end if;

  -- Senza importi (lista Aruba) o senza identita' fiscale del cedente non
  -- c'e' abbastanza per riconoscere l'ordine: meglio nessun link che uno
  -- sbagliato.
  if new.totale_documento is null and new.imponibile_totale is null then
    return new;
  end if;

  -- Normalizzazione: solo cifre/lettere maiuscole, via il prefisso paese "IT"
  -- (nei gestionali la P.IVA gira in entrambe le forme).
  v_piva := nullif(regexp_replace(regexp_replace(upper(coalesce(new.cedente_piva, '')), '[^0-9A-Z]', '', 'g'), '^IT', ''), '');
  v_cf   := nullif(regexp_replace(upper(coalesce(new.cedente_cf, '')), '[^0-9A-Z]', '', 'g'), '');
  if v_piva is null and v_cf is null then
    return new;
  end if;

  -- Candidati: ordini EMESSI dello stesso fornitore (riconosciuto per P.IVA o
  -- codice fiscale) il cui totale — o imponibile — combacia al centesimo, non
  -- gia' rivendicati da un'altra fattura (intera o divisa). Bastano 2 righe
  -- per sapere che il match e' ambiguo.
  select array_agg(id) into v_ids from (
    select po.id
    from purchase_orders po
    join suppliers s on s.id = po.supplier_id
    where po.company_id = new.company_id
      and po.status in ('inviato', 'confermato', 'parziale', 'ricevuto')
      and coalesce(po.total, po.subtotal, 0) > 0
      and (
        (v_piva is not null
          and regexp_replace(regexp_replace(upper(coalesce(s.vat_number, '')), '[^0-9A-Z]', '', 'g'), '^IT', '') = v_piva)
        or
        (v_cf is not null
          and regexp_replace(upper(coalesce(s.fiscal_code, '')), '[^0-9A-Z]', '', 'g') = v_cf)
      )
      and (
        (new.totale_documento is not null and abs(coalesce(po.total, 0) - new.totale_documento) <= 0.01)
        or
        (new.imponibile_totale is not null and abs(coalesce(po.subtotal, 0) - new.imponibile_totale) <= 0.01)
      )
      and not exists (
        select 1 from fatture_ricevute f2
        where f2.purchase_order_id = po.id and f2.id <> new.id
      )
      and not exists (
        select 1 from fattura_ricevuta_ordini q
        where q.purchase_order_id = po.id and q.fattura_id <> new.id
      )
    limit 2
  ) candidati;

  -- UN candidato solo: i numeri parlano chiaro, si aggancia. Due: ambiguo,
  -- decide una persona.
  if coalesce(array_length(v_ids, 1), 0) = 1 then
    new.purchase_order_id := v_ids[1];
  end if;

  return new;
end;
$function$;

-- ─── 7. Contabilizzare una fattura divisa ──────────────────────────────────
create or replace function public.contabilizza_fattura_ricevuta(p_fattura_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  f                record;
  v_costo_esist_id uuid;
  v_costo_gia_fatt boolean := false;  -- il costo dell'ordine è già stato confermato da un'altra fattura
  v_nota_credito   boolean;
  v_supplier_id    uuid;
  v_order_id       uuid;   -- la commessa, presa dall'ODA collegato
  v_imponibile     numeric;
  v_vat            numeric;
  v_cost_id        uuid;
  v_esito          text;
  v_piano          jsonb;
  v_divisa         boolean;
  v_elenco         text;
  q                record;
begin
  select * into f from public.fatture_ricevute where id = p_fattura_id;
  if not found then
    raise exception 'Fattura non trovata';
  end if;
  perform public.assert_company_access(f.company_id);

  if f.stato = 'contabilizzata' and f.company_cost_id is not null then
    return jsonb_build_object('esito', 'gia_contabilizzata', 'company_cost_id', f.company_cost_id);
  end if;

  v_nota_credito := coalesce(f.tipo_documento, '') in ('TD04', 'passive_credit_note');
  -- una nota già applicata a un costo non si applica una seconda volta
  if v_nota_credito and f.company_cost_id is not null then
    return jsonb_build_object('esito', 'gia_contabilizzata', 'company_cost_id', f.company_cost_id);
  end if;

  -- divisa tra più ordini: una quota per ordine (30/10/2026)
  v_divisa := not v_nota_credito
              and exists (select 1 from public.fattura_ricevuta_ordini where fattura_id = f.id);

  v_imponibile := abs(coalesce(
    f.imponibile_totale,
    case when f.totale_documento is not null and f.iva_totale is not null
         then f.totale_documento - f.iva_totale end
  ));
  if v_imponibile is null or v_imponibile <= 0 then
    raise exception 'Questa fattura non ha importi: senza imponibile il costo sarebbe zero. Apri l''XML o completa i dati prima di contabilizzare.';
  end if;

  v_vat := case
             when f.iva_totale is not null and v_imponibile > 0
               then round(abs(f.iva_totale) / v_imponibile * 100)
             else null
           end;

  if f.fornitore_id is not null then
    select s.id into v_supplier_id from public.suppliers s
      where s.company_id=f.company_id and s.id=f.fornitore_id
      and not(public.partner_tax_key(f.cedente_piva)<>'' and public.partner_tax_key(s.vat_number)<>'' and public.partner_tax_key(f.cedente_piva)<>public.partner_tax_key(s.vat_number))
      and not(public.partner_tax_key(f.cedente_cf)<>'' and public.partner_tax_key(s.fiscal_code)<>'' and public.partner_tax_key(f.cedente_cf)<>public.partner_tax_key(s.fiscal_code));
    if not found then raise exception 'Il fornitore confermato non è più coerente con la fattura: verifica il collegamento';end if;
  else
    begin
      select s.id into strict v_supplier_id from public.suppliers s
      where s.company_id=f.company_id and
        ((public.partner_tax_key(f.cedente_piva)<>'' and public.partner_tax_key(s.vat_number)=public.partner_tax_key(f.cedente_piva))
        or(public.partner_tax_key(f.cedente_cf)<>'' and public.partner_tax_key(s.fiscal_code)=public.partner_tax_key(f.cedente_cf)))
      and not(public.partner_tax_key(f.cedente_piva)<>'' and public.partner_tax_key(s.vat_number)<>'' and public.partner_tax_key(f.cedente_piva)<>public.partner_tax_key(s.vat_number))
      and not(public.partner_tax_key(f.cedente_cf)<>'' and public.partner_tax_key(s.fiscal_code)<>'' and public.partner_tax_key(f.cedente_cf)<>public.partner_tax_key(s.fiscal_code));
    exception when no_data_found then v_supplier_id:=null;
      when too_many_rows then raise exception 'Più fornitori hanno gli stessi identificativi: conferma il collegamento prima di contabilizzare';
    end;
  end if;

  if f.purchase_order_id is not null and not v_divisa then
    select po.order_id into v_order_id
    from public.purchase_orders po
    where po.id = f.purchase_order_id and po.company_id = f.company_id;

    -- il costo nato dall'ordine (non quello di un'altra fattura dello stesso ordine)
    select c.id into v_costo_esist_id
    from public.company_costs c
    where c.purchase_order_id = f.purchase_order_id
      and c.company_id = f.company_id
    order by c.created_at
    limit 1;

    if v_costo_esist_id is not null then
      v_costo_gia_fatt := exists (
        select 1 from public.fatture_ricevute fr
         where fr.company_cost_id = v_costo_esist_id and fr.id <> f.id
           and coalesce(fr.tipo_documento, '') not in ('TD04', 'passive_credit_note'));
    end if;
  end if;

  if v_nota_credito then
    -- La nota di credito toglie dal costo dell'ordine che rettifica; un costo non va sotto zero.
    if v_costo_esist_id is null then
      raise exception 'Una nota di credito riduce un costo: collegala prima all''ordine al fornitore della fattura che rettifica.';
    end if;
    if v_imponibile > (select coalesce(amount, 0) from public.company_costs where id = v_costo_esist_id) + 0.01 then
      raise exception 'La nota di credito (% € imponibile) supera il costo dell''ordine che rettifica (% €): controlla gli importi o l''ordine collegato.',
        replace(to_char(v_imponibile, 'FM999999990.00'), '.', ','),
        replace(to_char((select coalesce(amount, 0) from public.company_costs where id = v_costo_esist_id), 'FM999999990.00'), '.', ',');
    end if;
    update public.company_costs
       set amount     = greatest(0, coalesce(amount, 0) - v_imponibile),
           notes      = coalesce(notes || ' · ', '')
                        || 'Ridotto di ' || replace(to_char(v_imponibile, 'FM999999990.00'), '.', ',')
                        || ' € dalla nota di credito ' || coalesce(f.numero_fattura, '')
                        || ' del ' || to_char(f.data_fattura, 'DD/MM/YYYY'),
           updated_at = now()
     where id = v_costo_esist_id;
    v_cost_id := v_costo_esist_id;
    v_esito   := 'costo_ridotto';
  elsif v_costo_esist_id is not null and not v_costo_gia_fatt then
    -- l'importo della fattura, meno le note di credito già applicate a questo costo
    update public.company_costs
       set amount      = greatest(0, v_imponibile - coalesce((
                           select sum(abs(coalesce(fr.imponibile_totale, fr.totale_documento - fr.iva_totale, 0)))
                             from public.fatture_ricevute fr
                            where fr.company_cost_id = v_costo_esist_id and fr.id <> f.id
                              and coalesce(fr.tipo_documento, '') in ('TD04', 'passive_credit_note')), 0)),
           vat_rate    = coalesce(v_vat, vat_rate),
           supplier_id = coalesce(supplier_id, v_supplier_id),
           order_id    = coalesce(order_id, v_order_id),
           notes       = coalesce(notes || ' · ', '')
                         || 'Importo confermato dalla fattura ' || coalesce(f.numero_fattura, '')
                         || ' del ' || to_char(f.data_fattura, 'DD/MM/YYYY'),
           updated_at  = now()
     where id = v_costo_esist_id;
    v_cost_id := v_costo_esist_id;
    v_esito   := 'costo_aggiornato';
  else
    -- nuova fattura (anche la seconda sullo stesso ordine: acconto e saldo sono due costi)
    -- La scadenza dall'XML, non la data della fattura (29/10/2026).
    -- Divisa tra più ordini: un costo solo, senza ordine né commessa; le
    -- commesse prendono la loro quota attraverso gli ordini.
    if v_divisa then
      select string_agg(po.oda_number || ' ' || replace(to_char(q2.importo, 'FM999999990.00'), '.', ',') || ' €', ', '
                        order by po.oda_number)
        into v_elenco
        from public.fattura_ricevuta_ordini q2
        join public.purchase_orders po on po.id = q2.purchase_order_id
       where q2.fattura_id = f.id;
    end if;
    v_piano := public.piano_pagamento_da_xml(f.xml_raw, f.indice_corpo, f.data_fattura);
    insert into public.company_costs (
      company_id, supplier_id, purchase_order_id, order_id,
      name, cost_type, amount, vat_rate, category, recurrence,
      due_date, is_paid, notes, payment_method
    ) values (
      f.company_id, v_supplier_id, case when v_divisa then null else f.purchase_order_id end, v_order_id,
      'Fattura ' || coalesce(f.numero_fattura, 's/n') || ' - ' || coalesce(f.cedente_ragione_sociale, 'Fornitore'),
      'variable', v_imponibile, v_vat,
      coalesce(nullif(f.categoria_ai, ''), 'materiali'), 'once',
      (v_piano->>'scadenza')::date, false,
      'Generato contabilizzando la fattura ricevuta ' || coalesce(f.numero_fattura, '')
        || case when v_divisa then ' · divisa tra gli ordini ' || v_elenco else '' end
        || coalesce(v_piano->>'nota', ''),
      v_piano->>'metodo'
    )
    returning id into v_cost_id;
    v_esito := 'costo_creato';

    if v_divisa then
      -- Il costo nato alla ricezione di ciascun ordine scende della sua quota:
      -- quella parte ora la paga questa fattura.
      for q in
        select q2.purchase_order_id, q2.importo, po.oda_number, po.order_id,
               (select c.id from public.company_costs c
                 where c.purchase_order_id = q2.purchase_order_id and c.company_id = f.company_id
                   and not exists (select 1 from public.fatture_ricevute fr
                                    where fr.company_cost_id = c.id
                                      and coalesce(fr.tipo_documento, '') not in ('TD04', 'passive_credit_note'))
                 order by c.created_at limit 1) as costo_ricezione
          from public.fattura_ricevuta_ordini q2
          join public.purchase_orders po on po.id = q2.purchase_order_id
         where q2.fattura_id = f.id
      loop
        if q.costo_ricezione is not null then
          update public.company_costs
             set amount = greatest(0, coalesce(amount, 0) - q.importo),
                 notes  = coalesce(notes || ' · ', '')
                          || 'Ridotto di ' || replace(to_char(q.importo, 'FM999999990.00'), '.', ',')
                          || ' € fatturati nella fattura ' || coalesce(f.numero_fattura, '')
                          || ' del ' || to_char(f.data_fattura, 'DD/MM/YYYY') || ' (divisa tra più ordini)',
                 updated_at = now()
           where id = q.costo_ricezione;
        end if;
      end loop;
    end if;
  end if;

  update public.fatture_ricevute
     set stato           = 'contabilizzata',
         company_cost_id = v_cost_id,
         updated_at      = now()
   where id = f.id;

  -- Il margine delle commesse degli ordini: la quota ora conta.
  if v_divisa then
    for q in
      select distinct po.order_id
        from public.fattura_ricevuta_ordini q2
        join public.purchase_orders po on po.id = q2.purchase_order_id
       where q2.fattura_id = f.id and po.order_id is not null
    loop
      perform public.ordine_margine_valuta(q.order_id, 'una fattura divisa tra più ordini');
    end loop;
  end if;

  return jsonb_build_object(
    'esito', v_esito,
    'company_cost_id', v_cost_id,
    'imponibile', case when v_nota_credito then -v_imponibile else v_imponibile end,
    'aliquota', v_vat,
    'fornitore_riconosciuto', v_supplier_id is not null,
    'commessa_collegata', v_order_id is not null or v_divisa,
    'ordini', case when v_divisa then (select count(*) from public.fattura_ricevuta_ordini where fattura_id = f.id) end
  );
end $function$;
