-- Gli avvisi automatici del bot operativo (28/09/2026).
-- Una sola funzione valuta, per un'azienda, le condizioni che meritano un avviso
-- (fatture scadute, preventivi visti ma fermi, materiale sotto scorta) rispettando
-- le soglie scelte dal titolare nella routine (bot_routine.regole).
-- Restituisce dati strutturati: il testo lo compone l'edge (logica pura testata).

create or replace function public.bot_avvisi_valuta(p_company_id uuid, p_regole jsonb default '{}'::jsonb)
returns jsonb
language sql
stable
security definer
set search_path to 'public'
as $function$
  with cfg as (
    select
      coalesce((p_regole->>'fattura_scaduta')::boolean, true)  as f_fatt,
      coalesce((p_regole->>'preventivo_fermo')::boolean, true)  as f_prev,
      coalesce((p_regole->>'sotto_scorta')::boolean, true)      as f_scorta,
      greatest(coalesce((p_regole->>'preventivo_giorni')::int, 3), 1) as prev_giorni
  )
  select jsonb_build_object(
    'fatture_scadute', case when (select f_fatt from cfg) then coalesce((
      select jsonb_agg(x) from (
        select i.id, o.order_code, o.client_name, i.label, i.amount,
               (current_date - i.expected_date) as giorni
        from public.order_installments i
        join public.orders o on o.id = i.order_id
        where o.company_id = p_company_id and o.deleted_at is null
          and coalesce(i.is_paid, false) = false
          and i.expected_date is not null and i.expected_date < current_date
        order by i.amount desc
        limit 8
      ) x
    ), '[]'::jsonb) else '[]'::jsonb end,

    'preventivi_fermi', case when (select f_prev from cfg) then coalesce((
      select jsonb_agg(y) from (
        select q.id, q.quote_number, q.client_name, q.total,
               (current_date - q.viewed_at::date) as giorni
        from public.quotes q
        where q.company_id = p_company_id and q.deleted_at is null
          and q.viewed_at is not null and q.signed_at is null and q.refused_at is null
          and coalesce(q.status,'') not in ('accettata','accettato','convertita','rifiutata','refused','scaduta','scaduto')
          and q.viewed_at::date <= current_date - (select prev_giorni from cfg)
        order by (current_date - q.viewed_at::date) desc
        limit 8
      ) y
    ), '[]'::jsonb) else '[]'::jsonb end,

    'sotto_scorta', case when (select f_scorta from cfg) then (
      select jsonb_build_object(
        'n', count(*),
        'items', coalesce(jsonb_agg(jsonb_build_object('nome', nome, 'quantita', q, 'minimo', m))
                          filter (where rn <= 6), '[]'::jsonb)
      )
      from (
        select coalesce(w.name, 'articolo') as nome,
               coalesce(w.quantity, 0) as q,
               coalesce(w.min_stock_level, 0) as m,
               row_number() over (order by (coalesce(w.min_stock_level,0) - coalesce(w.quantity,0)) desc) as rn
        from public.warehouse_stock w
        where w.company_id = p_company_id
          and coalesce(w.quantity, 0) < coalesce(w.min_stock_level, 0)
          and coalesce(w.min_stock_level, 0) > 0
      ) z
    ) else jsonb_build_object('n', 0, 'items', '[]'::jsonb) end
  );
$function$;

revoke all on function public.bot_avvisi_valuta(uuid, jsonb) from public, anon;
grant execute on function public.bot_avvisi_valuta(uuid, jsonb) to authenticated, service_role;
