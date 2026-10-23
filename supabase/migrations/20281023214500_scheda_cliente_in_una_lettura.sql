-- La scheda cliente in una lettura sola (23/10/2026).
--
-- La pagina faceva nove richieste separate (commesse, anagrafica fiscale,
-- fatture, preventivi, ticket, interventi, appuntamenti, rate, da incassare),
-- più quelle della vista da telefono caricata anche sul computer. Ora una:
-- stesse tabelle, stessi filtri, con i permessi di chi guarda (SECURITY
-- INVOKER: le regole di accesso delle tabelle valgono come prima).
--
-- Una richiesta sola vuol dire anche una connessione sola, invece di nove in
-- parallelo: è il carico che a ottobre saturava il database.
--
-- Le rate si leggono con le colonne vere (expected_date, is_paid, paid_date):
-- la pagina chiedeva due_date e paid_at, che non esistono, e il pannello
-- «Rate» era sempre in errore. Il residuo di ogni rata è quello della scheda
-- commessa e del cruscotto (cruscotto_rate_da_incassare).

create or replace function public.scheda_cliente(p_customer_id uuid, p_company_id uuid)
returns jsonb
language plpgsql
stable
security invoker
set search_path = public
-- Il costo vero di queste letture è preparare le regole di accesso (oltre
-- 200 ms per tabella), non leggere le righe (pochi ms). Con il piano generico
-- la preparazione si fa una volta per connessione: provato il 23/10/2026,
-- 477 ms la prima chiamata, 23-26 ms dalla seconda.
set plan_cache_mode = force_generic_plan
as $$
declare
  v_contatto uuid;
  v_email text;
  v_anagrafica record;
  v_ordini uuid[];
  v_residui jsonb := '[]'::jsonb;
  v_preventivi jsonb;
begin
  select marketing_contact_id, nullif(lower(btrim(email)), '')
    into v_contatto, v_email
    from public.profiles where id = p_customer_id and company_id = p_company_id;
  if not found then
    return null;
  end if;
  if v_email like '%@no-email.ediliziaincloud.local' or v_email not like '%@%' then
    v_email := null;
  end if;

  select coalesce(array_agg(o.id), '{}') into v_ordini
    from public.orders o
   where o.customer_id = p_customer_id and o.company_id = p_company_id and o.deleted_at is null;

  select id, ragione_sociale, partita_iva into v_anagrafica
    from public.anagrafiche_native where cliente_id = p_customer_id limit 1;

  -- Il residuo da incassare: per chi non può vedere gli incassi vale null
  -- («non so»), non un elenco vuoto («tutto incassato»).
  if cardinality(v_ordini) > 0 then
    begin
      select coalesce(jsonb_agg(jsonb_build_object(
               'id', r.id, 'order_id', r.order_id, 'residuo', r.amount,
               'expected_date', r.expected_date, 'finanziamento', r.finanziamento)), '[]'::jsonb)
        into v_residui
        from public.cruscotto_rate_da_incassare(p_company_id) r
       where r.order_id = any (v_ordini);
    exception when insufficient_privilege then
      v_residui := null;
    end;
  end if;

  if v_contatto is not null then
    select coalesce(jsonb_agg(jsonb_build_object(
             'id', p.id, 'quote_number', p.numero, 'title', p.tipo, 'total', p.totale,
             'status', p.stato_unificato, 'created_at', coalesce(p.data::text, p.created_at::text))
             order by p.created_at desc), '[]'::jsonb)
      into v_preventivi
      from public.v_preventivi_unificati p
     where p.company_id = p_company_id and p.contact_id = v_contatto;
  elsif v_email is not null then
    select coalesce(jsonb_agg(jsonb_build_object(
             'id', q.id, 'quote_number', q.quote_number, 'title', q.title, 'total', q.total,
             'status', q.status, 'created_at', q.created_at)
             order by q.created_at desc), '[]'::jsonb)
      into v_preventivi
      from public.quotes q
     where q.company_id = p_company_id and lower(q.client_email) = v_email and q.deleted_at is null;
  end if;

  return jsonb_build_object(
    'ordini', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', o.id, 'order_code', o.order_code, 'description', o.description,
               'total_amount', o.total_amount, 'created_at', o.created_at,
               'current_status_id', o.current_status_id,
               'order_statuses', case when s.id is null then null else jsonb_build_object('name', s.name, 'color', s.color) end)
               order by o.created_at desc)
        from public.orders o
        left join public.order_statuses s on s.id = o.current_status_id
       where o.id = any (v_ordini)), '[]'::jsonb),
    'anagrafica', case when v_anagrafica.id is null then null else jsonb_build_object(
      'id', v_anagrafica.id, 'ragione_sociale', v_anagrafica.ragione_sociale, 'partita_iva', v_anagrafica.partita_iva) end,
    'fatture', coalesce((
      select jsonb_agg(f order by f.data_emissione desc nulls last)
        from (select d.id, d.tipo, d.numero, d.data_emissione, d.stato, d.totale_documento
                from public.documenti_fiscali d
               where v_anagrafica.id is not null and d.anagrafica_id = v_anagrafica.id and d.deleted_at is null
               order by d.data_emissione desc nulls last
               limit 20) f), '[]'::jsonb),
    'preventivi', coalesce(v_preventivi, '[]'::jsonb),
    'ticket', coalesce((
      select jsonb_agg(jsonb_build_object('id', t.id, 'title', t.subject, 'status', t.status,
               'priority', t.priority, 'created_at', t.created_at) order by t.created_at desc)
        from public.tickets t
       where t.customer_id = p_customer_id and t.company_id = p_company_id), '[]'::jsonb),
    'interventi', coalesce((
      select jsonb_agg(x order by x.created_at desc)
        from (select r.id, r.created_at, r.descrizione, r.note
                from public.rapportini_intervento r
                join public.tickets t on t.id = r.ticket_id
               where t.customer_id = p_customer_id and r.company_id = p_company_id
               order by r.created_at desc limit 20) x), '[]'::jsonb),
    'appuntamenti', coalesce((
      select jsonb_agg(x order by x.appointment_date desc nulls last)
        from (select a.id, a.title, a.appointment_date, a.appointment_time, a.appointment_end_time,
                     a.status, a.appointment_type, a.order_id
                from public.appointments a
               where a.order_id = any (v_ordini) and a.company_id = p_company_id
               order by a.appointment_date desc nulls last limit 50) x), '[]'::jsonb),
    'rate', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', i.id, 'order_id', i.order_id, 'label', i.label, 'tipo', i.type,
               'importo', i.amount, 'is_paid', i.is_paid, 'paid_date', i.paid_date,
               'expected_date', i.expected_date) order by i.order_id, i.position)
        from public.order_installments i
       where i.order_id = any (v_ordini)), '[]'::jsonb),
    'da_incassare', v_residui
  );
end
$$;

revoke all on function public.scheda_cliente(uuid, uuid) from public, anon;
grant execute on function public.scheda_cliente(uuid, uuid) to authenticated;
