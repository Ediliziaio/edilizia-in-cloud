-- Decimo controllo (19/10/2026).
--
-- Cantiere
--  1. Timbrature dimenticate senza commessa: le vede e le decide solo chi segue tutte le commesse
--     (prima bastava il permesso commesse, anche a una ditta esterna «solo assegnati»).
--  2. Bolle dal cantiere nelle approvazioni: solo per chi può verificarle (l'ufficio), come la
--     scheda della commessa e la verifica stessa.
--  3. Cantieri oggi: contano anche le persone senza account (la maggior parte dei dipendenti):
--     previste dalle assegnazioni, presenti se hanno timbrato o sono nel rapportino del giorno.
set local lock_timeout = '3s';
set local statement_timeout = '60s';

create or replace function pg_temp.correggi(p_firma text, p_cerca text, p_metti text, p_atteso text)
returns void language plpgsql as $$
declare v_def text; v_nuova text;
begin
  v_def := pg_get_functiondef(p_firma::regprocedure);
  if position(p_atteso in v_def) > 0 then return; end if;
  v_nuova := regexp_replace(v_def, p_cerca, p_metti);
  if position(p_atteso in v_nuova) = 0 then
    raise exception 'Correzione non applicata a %: il testo della funzione è diverso da quello atteso', p_firma;
  end if;
  execute v_nuova;
end $$;

-- 1 ────────────────────────────────────────────────────────────────────────────────────────
select pg_temp.correggi('public.campo_timbratura_correzione_decidi(uuid,boolean,text)',
  $re$(  if c\.order_id is not null and not exists \()$re$,
  $to$  -- Senza commessa la decide solo chi segue tutte le commesse (non una ditta o «solo assegnati»).
  if c.order_id is null and not coalesce(public.ufficio_vede_tutte_le_commesse(), false) then
    raise exception 'Questa correzione non è legata a un cantiere che segui' using errcode = '42501';
  end if;
\1$to$,
  'Questa correzione non è legata a un cantiere che segui');

select pg_temp.correggi('public.ufficio_da_approvare()',
  $re$and \(c\.order_id is null or \(v_tutte or public\.ufficio_vede_commessa\(o\.id\)\)\)\)$re$,
  $to$and (case when c.order_id is null then v_tutte else (v_tutte or public.ufficio_vede_commessa(o.id)) end))$to$,
  'and (case when c.order_id is null then v_tutte else (v_tutte or public.ufficio_vede_commessa(o.id)) end))');

drop policy if exists correzioni_lettura on public.campo_timbrature_correzioni;
create policy correzioni_lettura on public.campo_timbrature_correzioni for select to authenticated
  using (
    user_id = (select auth.uid())
    or (company_id = (select public.get_my_company_id())
        and ((select public.campo_e_ufficio(campo_timbrature_correzioni.company_id))
             or coalesce(public.has_permission_for_company((select auth.uid()), 'can_edit_orders', company_id), false))
        and coalesce(public.has_permission_for_company((select auth.uid()), 'can_view_orders', company_id), false)
        and (case when order_id is null then (select public.ufficio_vede_tutte_le_commesse())
                  else public.ufficio_vede_commessa(order_id) end))
  );

-- 2 ────────────────────────────────────────────────────────────────────────────────────────
select pg_temp.correggi('public.ufficio_da_approvare()',
  $re$where ca\.company_id = v_company and ca\.stato = 'da_verificare'\s+and \(ca\.order_id is null or \(v_tutte or public\.ufficio_vede_commessa\(o\.id\)\)\)\)$re$,
  $to$where ca.company_id = v_company and ca.stato = 'da_verificare'
        -- le bolle le verifica l'ufficio (campo_acquisto_verifica): solo a chi può farlo
        and public.campo_e_ufficio(v_company)
        and (case when ca.order_id is null then v_tutte else (v_tutte or public.ufficio_vede_commessa(o.id)) end))$to$,
  'le bolle le verifica l''ufficio (campo_acquisto_verifica): solo a chi può farlo');

-- 3 ────────────────────────────────────────────────────────────────────────────────────────
select pg_temp.correggi('public.ufficio_cantieri_oggi(date)',
  $re$select oe\.order_id, e\.user_id\s+from public\.order_employees oe$re$,
  $to$select oe.order_id, coalesce(e.user_id::text, 'dip:' || e.id::text) as chi
        from public.order_employees oe$to$,
  $at$coalesce(e.user_id::text, 'dip:' || e.id::text) as chi$at$);
select pg_temp.correggi('public.ufficio_cantieri_oggi(date)',
  $re$select oca\.order_id, oca\.user_id\s+from public\.order_campo_assignments oca$re$,
  $to$select oca.order_id, oca.user_id::text
        from public.order_campo_assignments oca$to$,
  'select oca.order_id, oca.user_id::text');
select pg_temp.correggi('public.ufficio_cantieri_oggi(date)',
  $re$select order_id, count\(distinct user_id\) n from previste_persone group by order_id$re$,
  $to$select order_id, count(distinct chi) n from previste_persone group by order_id$to$,
  'count(distinct chi) n from previste_persone');
-- Presenti: chi ha timbrato oggi più chi è nel rapportino di oggi (le persone senza account non
-- timbrano: le porta il rapportino di squadra).
select pg_temp.correggi('public.ufficio_cantieri_oggi(date)',
  $re$timbrate as \(\s+select t\.order_id, count\(distinct t\.user_id\) n, max\(t\.timestamp_evento\) ultima\s+from public\.campo_timbrature t join aperte a on a\.id = t\.order_id\s+where t\.company_id = v_company and t\.timestamp_evento >= v_inizio and t\.timestamp_evento < v_fine\s+group by t\.order_id\s+\),$re$,
  $to$presenti_persone as (
      select t.order_id, t.user_id::text as chi
        from public.campo_timbrature t join aperte a on a.id = t.order_id
       where t.company_id = v_company and t.timestamp_evento >= v_inizio and t.timestamp_evento < v_fine
      union
      select r.order_id, coalesce(e.user_id::text, 'dip:' || e.id::text)
        from public.campo_rapportini r join aperte a on a.id = r.order_id
        cross join lateral jsonb_array_elements(case when jsonb_typeof(r.presenze) = 'array' then r.presenze else '[]'::jsonb end) x
        join public.employees e on e.id = nullif(x->>'employee_id', '')::uuid and e.company_id = v_company
       where r.company_id = v_company and r.data_lavoro = v_giorno and r.stato in ('inviato', 'approvato')
      union
      select r.order_id, r.user_id::text
        from public.campo_rapportini r join aperte a on a.id = r.order_id
       where r.company_id = v_company and r.data_lavoro = v_giorno and r.stato in ('inviato', 'approvato')
         and r.user_id is not null
         and not (jsonb_typeof(r.presenze) = 'array' and jsonb_array_length(r.presenze) > 0)
         and not coalesce(r.lavoro_completato, false) and nullif(btrim(r.firma_cliente_url), '') is null
    ),
    timbrate as (
      select p.order_id, count(distinct p.chi) n from presenti_persone p group by p.order_id
    ),$to$,
  'presenti_persone as (');

-- Magazzino
--  4. Divisione di una voce coperta da un ordine d'acquisto: anche la riga dell'ordine si divide
--     (quantità ordinata e ricevuta in proporzione; gli importi li ricalcola il database), così la nuova voce resta coperta
--     dall'ordine e il margine non conta il materiale due volte (ordine + magazzino).
--  5. DDT confermato: le righe che non entrano in magazzino (articolo non trovato, oltre il
--     residuo dell'ordine, decimali) restano scritte sul carico e si vedono in Magazzino finché
--     qualcuno non le segna sistemate. Gli articoli caricati si sommano per riga di bolla.
-- 4 ────────────────────────────────────────────────────────────────────────────────────────
create or replace function public.dividi_righe_ordine_acquisto(p_originale uuid, p_nuova uuid, p_quantita numeric)
returns integer language plpgsql security definer set search_path = public
as $$
declare
  a public.order_items; b public.order_items; v_company uuid;
  v_da_spostare numeric := coalesce(p_quantita, 0); v_q numeric; v_r numeric; v_quota numeric; v_n integer := 0;
  i record;
begin
  select * into a from public.order_items where id = p_originale;
  select * into b from public.order_items where id = p_nuova;
  if a.id is null or b.id is null or a.order_id <> b.order_id then return 0; end if;
  select o.company_id into v_company from public.orders o where o.id = a.order_id;
  if auth.uid() is null or not coalesce(public.has_permission_for_company(auth.uid(), 'can_edit_orders', v_company), false) then
    raise exception 'Non puoi modificare i materiali di questa commessa.' using errcode = '42501';
  end if;
  for i in
    select poi.* from public.purchase_order_items poi
      join public.purchase_orders po on po.id = poi.purchase_order_id
     where poi.order_item_id = a.id and po.company_id = v_company and po.status <> 'annullato'
     order by poi.created_at, poi.id
     for update of poi
  loop
    exit when v_da_spostare <= 0;
    continue when coalesce(i.quantity, 0) <= 0;
    v_q := least(v_da_spostare, i.quantity);
    v_quota := v_q / i.quantity;
    v_r := round(coalesce(i.quantity_received, 0) * v_quota, 3);
    if v_q >= i.quantity then
      update public.purchase_order_items set order_item_id = b.id, updated_at = now() where id = i.id;
    else
      insert into public.purchase_order_items
        (company_id, purchase_order_id, description, sku, unit_of_measure, quantity, unit_price, discount_percent,
         vat_rate, quantity_received, received_date, article_template_id, sort_order, notes,
         order_item_id, warehouse_id)
      values
        (i.company_id, i.purchase_order_id, i.description, i.sku, i.unit_of_measure, v_q, i.unit_price, i.discount_percent,
         i.vat_rate, v_r, i.received_date, i.article_template_id, i.sort_order, i.notes, b.id, i.warehouse_id);
      update public.purchase_order_items
         set quantity = i.quantity - v_q,
             quantity_received = greatest(coalesce(i.quantity_received, 0) - v_r, 0),
             updated_at = now()
       where id = i.id;
    end if;
    v_da_spostare := v_da_spostare - v_q;
    v_n := v_n + 1;
  end loop;
  return v_n;
end $$;
revoke all on function public.dividi_righe_ordine_acquisto(uuid, uuid, numeric) from public, anon;
grant execute on function public.dividi_righe_ordine_acquisto(uuid, uuid, numeric) to authenticated;

-- dividi_scarico_magazzino divide anche le righe dell'ordine d'acquisto, prima di guardare il magazzino.
select pg_temp.correggi('public.dividi_scarico_magazzino(uuid,uuid,numeric)',
  $re$(  if a\.stock_item_id is null or b\.stock_item_id is distinct from a\.stock_item_id or coalesce\(p_quantita, 0\) <= 0 then)$re$,
  $to$  -- La nuova voce resta coperta dall'ordine d'acquisto per la sua parte.
  perform public.dividi_righe_ordine_acquisto(a.id, b.id, p_quantita);
\1$to$,
  'perform public.dividi_righe_ordine_acquisto(a.id, b.id, p_quantita);');

-- 5 ────────────────────────────────────────────────────────────────────────────────────────
alter table public.email_ddt_carico add column if not exists da_abbinare jsonb not null default '[]'::jsonb;
alter table public.email_ddt_carico add column if not exists da_abbinare_chiuso_at timestamptz;
alter table public.email_ddt_carico add column if not exists da_abbinare_chiuso_da uuid;

select pg_temp.correggi('public.conferma_carico_ddt(uuid,uuid)',
  $re$set stato = 'confermato', confirmed_by = v_utente, confirmed_at = now\(\), movimento_created = true$re$,
  $to$set stato = 'confermato', confirmed_by = v_utente, confirmed_at = now(), movimento_created = true,
         da_abbinare = v_da_abbinare$to$,
  'movimento_created = true,
         da_abbinare = v_da_abbinare');

-- Più righe dell'ordine per una riga di bolla: un solo articolo caricato, con la somma.
select pg_temp.correggi('public.conferma_carico_ddt(uuid,uuid)',
  $re$(  v_mancante numeric; v_completo boolean; v_testo_mancante text; v_data date;)$re$,
  $to$\1
  v_tot_riga numeric := 0;$to$,
  'v_tot_riga numeric := 0;');
select pg_temp.correggi('public.conferma_carico_ddt(uuid,uuid)',
  $re$        v_caricati := v_caricati \|\| jsonb_build_object\('articolo', v_art_nome, 'quantita', v_registrata::int\);\n        v_qta := v_qta - v_registrata;\n      end loop;$re$,
  $to$        v_tot_riga := v_tot_riga + v_registrata;
        v_qta := v_qta - v_registrata;
      end loop;
      if v_tot_riga > 0 then
        v_caricati := v_caricati || jsonb_build_object('articolo', v_art_nome, 'quantita', v_tot_riga::int);
      end if;$to$,
  'v_tot_riga := v_tot_riga + v_registrata;');
select pg_temp.correggi('public.conferma_carico_ddt(uuid,uuid)',
  $re$    if v_c\.purchase_order_id is not null then\n      while v_qta > 0 loop$re$,
  $to$    if v_c.purchase_order_id is not null then
      v_tot_riga := 0;
      while v_qta > 0 loop$to$,
  $at$      v_tot_riga := 0;
      while v_qta > 0 loop$at$);


create or replace function public.magazzino_righe_da_abbinare()
returns jsonb language plpgsql stable security definer set search_path = public
as $$
declare v_company uuid := public.get_my_company_id();
begin
  if auth.uid() is null or v_company is null or public.utente_bloccato()
     or not coalesce(public.has_permission_for_company(auth.uid(), 'can_view_warehouse', v_company), false) then
    raise exception 'Non puoi vedere il magazzino di questa azienda.' using errcode = '42501';
  end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', c.id, 'ddt_numero', c.ddt_numero, 'ddt_data', c.ddt_data, 'confermato_il', c.confirmed_at,
      'ordine', po.oda_number, 'righe', c.da_abbinare) order by c.confirmed_at desc)
      from public.email_ddt_carico c
      left join public.purchase_orders po on po.id = c.purchase_order_id
     where c.company_id = v_company and c.stato = 'confermato' and c.da_abbinare_chiuso_at is null
       and jsonb_typeof(c.da_abbinare) = 'array' and jsonb_array_length(c.da_abbinare) > 0
  ), '[]'::jsonb);
end $$;
revoke all on function public.magazzino_righe_da_abbinare() from public, anon;
grant execute on function public.magazzino_righe_da_abbinare() to authenticated;

create or replace function public.magazzino_righe_abbinate(p_carico uuid)
returns void language plpgsql security definer set search_path = public
as $$
declare v_company uuid;
begin
  select company_id into v_company from public.email_ddt_carico where id = p_carico;
  if v_company is null then raise exception 'Carico non trovato.' using errcode = 'P0002'; end if;
  if auth.uid() is null or public.utente_bloccato()
     or not coalesce(public.has_permission_for_company(auth.uid(), 'can_edit_warehouse', v_company), false) then
    raise exception 'Solo chi gestisce il magazzino può chiudere queste righe.' using errcode = '42501';
  end if;
  update public.email_ddt_carico
     set da_abbinare_chiuso_at = now(), da_abbinare_chiuso_da = auth.uid()
   where id = p_carico and da_abbinare_chiuso_at is null;
end $$;
revoke all on function public.magazzino_righe_abbinate(uuid) from public, anon;
grant execute on function public.magazzino_righe_abbinate(uuid) to authenticated;

-- Economia
--  6. Widget: «Top clienti» e fatturato per cliente in ordine di valore (prima 10/20 clienti a
--     caso); fatturato per settimana o giorno e aggregazioni diverse dalla somma tolti dal
--     catalogo: la funzione non li calcolava e i grafici restavano vuoti o sbagliati.
--  7. Silvio (KPI azienda, andamento del mese, migliori clienti, riepilogo commesse): commesse nel
--     cestino escluse e valore con le varianti approvate, dalla vista commesse_valore_pattuito;
--     il «da incassare» viene dalle rate (rate_da_incassare), non dal vecchio campo del saldo.
-- 6 ────────────────────────────────────────────────────────────────────────────────────────
create or replace function pg_temp.correggi_g(p_firma text, p_cerca text, p_metti text, p_atteso text)
returns void language plpgsql as $$
declare v_def text; v_nuova text;
begin
  v_def := pg_get_functiondef(p_firma::regprocedure);
  if position(p_atteso in v_def) > 0 then return; end if;
  v_nuova := regexp_replace(v_def, p_cerca, p_metti, 'g');
  if position(p_atteso in v_nuova) = 0 then
    raise exception 'Correzione non applicata a %: il testo della funzione è diverso da quello atteso', p_firma;
  end if;
  execute v_nuova;
end $$;

select pg_temp.correggi_g('public.get_metric(text,jsonb,text,text)',
  $re$(GROUP BY o\.customer_id, p\.first_name, p\.last_name)(\s+)LIMIT (10|20)$re$,
  $to$\1\2ORDER BY 3 DESC\2LIMIT \3$to$,
  $at$GROUP BY o.customer_id, p.first_name, p.last_name
        ORDER BY 3 DESC$at$);

update public.metric_catalog
   set allowed_dimensions = array(select d from unnest(allowed_dimensions) d where d not in ('week', 'day')),
       allowed_aggregations = array['sum']
 where id in ('revenue_total', 'revenue_real');

-- 7 ────────────────────────────────────────────────────────────────────────────────────────
do $v$
declare v_colonne text;
begin
  select string_agg(case when column_name = 'total_amount'
                         then '(coalesce(o.total_amount, 0) + public.commessa_varianti_approvate(o.id)) as total_amount'
                         else 'o.' || quote_ident(column_name) end, ', ' order by ordinal_position)
    into v_colonne
    from information_schema.columns where table_schema = 'public' and table_name = 'orders';
  execute 'create or replace view public.commesse_valore_pattuito with (security_invoker = true) as select '
       || v_colonne || ' from public.orders o where o.deleted_at is null';
end $v$;
comment on view public.commesse_valore_pattuito is
  'Commesse non nel cestino; total_amount = contratto più varianti approvate (IVA esclusa), come la scheda commessa.';
revoke all on public.commesse_valore_pattuito from public, anon;
grant select on public.commesse_valore_pattuito to authenticated, service_role;

select pg_temp.correggi_g('public.silvio_tool_company_kpi(uuid)',
  $re$FROM public\.orders o\M$re$, 'FROM public.commesse_valore_pattuito o',
  'FROM public.commesse_valore_pattuito o');
select pg_temp.correggi_g('public.silvio_tool_company_kpi(uuid)',
  $re$FROM public\.orders WHERE company_id = p_company_id$re$, 'FROM public.commesse_valore_pattuito WHERE company_id = p_company_id',
  'FROM public.commesse_valore_pattuito WHERE company_id = p_company_id');
select pg_temp.correggi_g('public.silvio_tool_monthly_performance(uuid,integer,integer)',
  $re$FROM public\.orders(\s+WHERE company_id = p_company_id\s+AND created_at >= v_start)$re$, $to$FROM public.commesse_valore_pattuito\1$to$,
  'FROM public.commesse_valore_pattuito');

select pg_temp.correggi_g('public.silvio_tool_top_customers(uuid,integer)',
  $re$FROM public\.orders o\M$re$,
  $to$FROM public.commesse_valore_pattuito o
    LEFT JOIN (select x.order_id, sum(x.residuo) r from public.rate_da_incassare(p_company_id) x group by x.order_id) di ON di.order_id = o.id$to$,
  'LEFT JOIN (select x.order_id, sum(x.residuo) r from public.rate_da_incassare(p_company_id) x group by x.order_id) di');
select pg_temp.correggi_g('public.silvio_tool_top_customers(uuid,integer)',
  $re$round\(sum\(o\.balance_amount\)::numeric, 2\) AS da_incassare_eur$re$,
  'round(sum(coalesce(di.r, 0))::numeric, 2) AS da_incassare_eur',
  'round(sum(coalesce(di.r, 0))::numeric, 2) AS da_incassare_eur');

select pg_temp.correggi_g('public.silvio_tool_orders_summary(uuid,text,integer)',
  $re$FROM public\.orders o\M$re$,
  $to$FROM public.commesse_valore_pattuito o
    LEFT JOIN (select x.order_id, sum(x.residuo) r from public.rate_da_incassare(p_company_id) x group by x.order_id) di ON di.order_id = o.id$to$,
  'LEFT JOIN (select x.order_id, sum(x.residuo) r from public.rate_da_incassare(p_company_id) x group by x.order_id) di');
select pg_temp.correggi_g('public.silvio_tool_orders_summary(uuid,text,integer)',
  $re$GREATEST\(COALESCE\(o\.balance_amount, 0\), 0\)$re$, 'coalesce(di.r, 0)',
  'round(coalesce(di.r, 0)::numeric, 2)');
select pg_temp.correggi_g('public.silvio_tool_orders_summary(uuid,text,integer)',
  $re$COALESCE\(o\.balance_paid, false\) = false$re$, 'coalesce(di.r, 0) > 0',
  'coalesce(di.r, 0) > 0');
select pg_temp.correggi_g('public.silvio_tool_orders_summary(uuid,text,integer)',
  $re$COALESCE\(o\.balance_paid, false\) = true$re$, 'coalesce(di.r, 0) <= 0',
  'coalesce(di.r, 0) <= 0');
