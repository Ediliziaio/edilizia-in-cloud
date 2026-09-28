-- Report del mattino più ricco (28/09/2026): oltre a commesse/incassi/scorta,
-- aggiunge gli appuntamenti di oggi (conteggio + lista), i preventivi in attesa
-- di risposta e le prime scadenze con il nome del cliente. Serve al testo scritto
-- dall'AqI, che così ha «una bella quantità di dati» veri da cui partire.

create or replace function public.bot_report_mattino_dati(p_company_id uuid)
returns jsonb
language sql
stable
security definer
set search_path to 'public'
as $function$
  select jsonb_build_object(
    'commesse_attive', (select count(*) from public.orders o
        where o.company_id = p_company_id and o.status in ('active','in_corso','confermato') and o.deleted_at is null),

    'scaduto', (select jsonb_build_object('n', count(*), 'tot', coalesce(sum(i.amount),0))
        from public.order_installments i join public.orders o on o.id = i.order_id
        where o.company_id = p_company_id and coalesce(i.is_paid,false) = false and i.expected_date < current_date),

    'in_scadenza_7gg', (select jsonb_build_object('n', count(*), 'tot', coalesce(sum(i.amount),0))
        from public.order_installments i join public.orders o on o.id = i.order_id
        where o.company_id = p_company_id and coalesce(i.is_paid,false) = false
          and i.expected_date >= current_date and i.expected_date < current_date + 7),

    'sotto_scorta', (select count(*) from public.warehouse_stock w
        where w.company_id = p_company_id and coalesce(w.quantity,0) < coalesce(w.min_stock_level,0) and coalesce(w.min_stock_level,0) > 0),

    'appuntamenti_oggi', (select count(*) from public.appointments a
        where a.company_id = p_company_id and a.appointment_date = current_date
          and coalesce(a.is_completed,false) = false and coalesce(a.is_blocked_slot,false) = false and a.cancelled_at is null),

    'appuntamenti_lista', (
        select coalesce(jsonb_agg(jsonb_build_object('ora', ora, 'titolo', titolo, 'luogo', luogo) order by ora), '[]'::jsonb)
        from (
          select to_char(a.appointment_time, 'HH24:MI') as ora, a.title as titolo, coalesce(a.formatted_address, a.address_city) as luogo
          from public.appointments a
          where a.company_id = p_company_id and a.appointment_date = current_date
            and coalesce(a.is_completed,false) = false and coalesce(a.is_blocked_slot,false) = false and a.cancelled_at is null
          order by a.appointment_time
          limit 5
        ) s),

    'preventivi_in_attesa', (select jsonb_build_object('n', count(*), 'tot', coalesce(sum(q.total),0))
        from public.quotes q
        where q.company_id = p_company_id and q.deleted_at is null and coalesce(q.status,'') = 'inviata'),

    'scadute_top', (
        select coalesce(jsonb_agg(jsonb_build_object('cliente', cliente, 'importo', importo, 'giorni', giorni) order by importo desc), '[]'::jsonb)
        from (
          select o.client_name as cliente, i.amount as importo, (current_date - i.expected_date) as giorni
          from public.order_installments i join public.orders o on o.id = i.order_id
          where o.company_id = p_company_id and coalesce(i.is_paid,false) = false and i.expected_date < current_date
          order by i.amount desc
          limit 3
        ) s)
  );
$function$;
