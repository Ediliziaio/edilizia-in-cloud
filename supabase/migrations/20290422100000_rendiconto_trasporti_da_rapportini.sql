set local lock_timeout = '3s';

alter table public.rapportino_voci_libere
  add column viaggio jsonb check (viaggio is null or jsonb_typeof(viaggio) = 'object');
grant select (viaggio), insert (viaggio) on public.rapportino_voci_libere to authenticated;

-- Scrittura atomica insieme alle altre voci, con i controlli già usati dal rapportino.
do $$
declare
  definizione text := pg_get_functiondef('public.ufficio_crea_rapportini(uuid,jsonb)'::regprocedure);
  colonne constant text := 'insert into public.rapportino_voci_libere (rapportino_id, descrizione, quantita, unita, costo_unitario, vendita_unitaria, tariffa_id)';
  tariffa constant text := $sql$then (e->>'tariffa_id')::uuid end
        from jsonb_array_elements(v_voci) e$sql$;
begin
  if strpos(definizione, colonne) = 0 or strpos(definizione, tariffa) = 0 then
    raise exception 'Non trovo il salvataggio delle voci in ufficio_crea_rapportini';
  end if;
  definizione := replace(definizione, colonne, replace(colonne, 'tariffa_id)', 'tariffa_id, viaggio)'));
  execute replace(definizione, tariffa, replace(tariffa, '::uuid end', $sql$::uuid end, nullif(e->'viaggio', 'null'::jsonb)$sql$));
end $$;

-- Il quadro del rapportino mostra gli stessi dettagli, anche a salvataggio concluso.
do $$
declare
  definizione text := pg_get_functiondef('private.office_rapportino_economia_raw(uuid)'::regprocedure);
  prima constant text := $sql$'prezzo_a_mano', x.prezzo_a_mano) order by x.created_at$sql$;
begin
  if strpos(definizione, prima) = 0 then
    raise exception 'Non trovo la lettura delle voci nel quadro del rapportino';
  end if;
  execute replace(definizione, prima, $sql$'prezzo_a_mano', x.prezzo_a_mano, 'viaggio', x.viaggio) order by x.created_at$sql$);
end $$;

-- Rilegge a ogni generazione lo stato dei rapportini. RLS applicata anche
-- alle voci. Il costo interno non rientra tra i dati del documento.
create or replace function public.rapportini_voci_approvate_per_trasporti(
  p_company_id uuid, p_order_id uuid, p_rapportini uuid[]
) returns table (
  id uuid, data date, descrizione text, quantita numeric, unita text,
  vendita_unitaria numeric, viaggio jsonb
)
language sql stable security invoker set search_path = ''
as $$
  select v.id, r.data_lavoro, v.descrizione, v.quantita, v.unita,
    case when public.has_permission_for_company((select auth.uid()), 'can_view_order_amounts', p_company_id)
         then v.vendita_unitaria end,
    v.viaggio
  from public.rapportino_voci_libere v
  join public.campo_rapportini r
    on (r.id, r.company_id, r.order_id) = (v.rapportino_id, v.company_id, v.order_id)
  join public.orders o on (o.id, o.company_id) = (r.order_id, r.company_id)
  where v.company_id = p_company_id and v.order_id = p_order_id
    and r.id = any(p_rapportini) and r.annullato_at is null and o.deleted_at is null
    and (r.stato = 'approvato' or (r.stato is null and r.approvato is true))
    and (v.viaggio is not null or btrim(v.unita) ~* '^viaggi[oi]$'
      or btrim(v.descrizione) ~* '^(trasport[oi]|viaggi[oi])\y')
  order by r.data_lavoro, v.id;
$$;
revoke all on function public.rapportini_voci_approvate_per_trasporti(uuid, uuid, uuid[]) from public, anon;
grant execute on function public.rapportini_voci_approvate_per_trasporti(uuid, uuid, uuid[]) to authenticated;
