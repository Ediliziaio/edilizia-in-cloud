-- I numeri dei campi propri servono: per commessa, il totale dei campi numero e quanti «sì», separando approvati e da
-- approvare. Vale la RLS di chi chiede (security invoker), quindi gli stessi rapportini che può già leggere.
create or replace function public.rapportini_campi_totali(p_order_id uuid)
returns table (chiave text, etichetta text, tipo text, unita text, phase_id text, fase_nome text, approvati numeric, da_approvare numeric)
language sql stable security invoker set search_path = public
as $$
  with voci as (
    select r.stato, r.data_lavoro, r.created_at, v,
           case when jsonb_typeof(v->'valore') = 'number' then (v->>'valore')::numeric
                when jsonb_typeof(v->'valore') = 'boolean' and (v->>'valore')::boolean then 1::numeric
                else 0::numeric end as quanto
      from public.campo_rapportini r, jsonb_array_elements(r.campi_extra) v
     where r.order_id = p_order_id
       and r.stato in ('inviato', 'approvato')
       and v->>'tipo' in ('number', 'boolean')
  )
  select v->>'chiave',
         (array_agg(v->>'etichetta' order by data_lavoro desc, created_at desc))[1],
         (array_agg(v->>'tipo' order by data_lavoro desc, created_at desc))[1],
         (array_agg(v->>'unita' order by data_lavoro desc, created_at desc))[1],
         v->>'phase_id',
         (array_agg(v->>'fase_nome' order by data_lavoro desc, created_at desc))[1],
         coalesce(sum(quanto) filter (where stato = 'approvato'), 0),
         coalesce(sum(quanto) filter (where stato = 'inviato'), 0)
    from voci
   group by v->>'chiave', v->>'phase_id'
   order by 2, 6
$$;
revoke all on function public.rapportini_campi_totali(uuid) from public, anon;
grant execute on function public.rapportini_campi_totali(uuid) to authenticated;
