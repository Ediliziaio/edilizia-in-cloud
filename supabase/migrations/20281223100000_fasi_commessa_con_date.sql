-- Nuova commessa: le fasi di partenza nascono già con le loro date (07/11/2026).
--
-- aggiungi_fasi_commessa accetta, per ogni fase, "data_inizio" e "data_fine"
-- (AAAA-MM-GG) e le scrive in order_work_phases.start_date / end_date. Senza le
-- due chiavi si comporta come prima. Due date incoerenti (fine prima
-- dell'inizio) o una sola delle due non vengono scritte: la fase nasce senza
-- date, come oggi, e si pianifica dal Cantiere.
--
-- Idempotente: CREATE OR REPLACE con la stessa firma; i permessi restano quelli
-- di prima (solo authenticated e service_role) e si riscrivono per chiarezza.

create or replace function public.aggiungi_fasi_commessa(p_order_id uuid, p_fasi jsonb)
 returns integer
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_azienda uuid := public.get_order_company_id(p_order_id);
  v_fase jsonb;
  v_sotto jsonb;
  v_fase_id uuid;
  v_base integer;
  v_aggiunte integer := 0;
  v_pos_sotto integer;
  v_venduto numeric;
  v_giorni integer;
  v_dal date;
  v_al date;
begin
  if auth.uid() is null or v_azienda is null
     or not public.has_permission_for_company(auth.uid(), 'can_edit_orders', v_azienda) then
    raise exception 'Non hai il permesso di aggiungere fasi a questa commessa.' using errcode = '42501';
  end if;
  if jsonb_typeof(p_fasi) is distinct from 'array' or jsonb_array_length(p_fasi) = 0 then
    raise exception 'Nessuna fase da aggiungere.' using errcode = '22023';
  end if;
  if jsonb_array_length(p_fasi) > 60 then
    raise exception 'Troppe fasi in una volta: al massimo 60.' using errcode = '22023';
  end if;
  select coalesce(max(position) + 1, 0) into v_base from public.order_work_phases where order_id = p_order_id;
  for v_fase in select value from jsonb_array_elements(p_fasi) loop
    continue when btrim(coalesce(v_fase->>'nome', '')) = '';
    v_venduto := null;
    if nullif(v_fase->>'venduto', '') is not null then
      if not public.has_permission_for_company(auth.uid(), 'can_view_order_amounts', v_azienda) then
        raise exception 'Il venduto della fase lo scrive solo chi ha i permessi «Ordini e Commesse» e «Importi di vendita».'
          using errcode = '42501';
      end if;
      v_venduto := greatest(0, round((v_fase->>'venduto')::numeric, 2));
    end if;
    -- Le date: tutte e due, nel formato giusto, e la fine non prima dell'inizio.
    v_dal := case when coalesce(v_fase->>'data_inizio', '') ~ '^\d{4}-\d{2}-\d{2}$' then (v_fase->>'data_inizio')::date end;
    v_al  := case when coalesce(v_fase->>'data_fine', '')   ~ '^\d{4}-\d{2}-\d{2}$' then (v_fase->>'data_fine')::date end;
    if v_dal is null or v_al is null or v_al < v_dal then
      v_dal := null;
      v_al := null;
    end if;
    insert into public.order_work_phases (company_id, order_id, name, position, importo_venduto, start_date, end_date)
    values (v_azienda, p_order_id, left(btrim(v_fase->>'nome'), 160), v_base + v_aggiunte, v_venduto, v_dal, v_al)
    returning id into v_fase_id;
    v_aggiunte := v_aggiunte + 1;
    v_pos_sotto := 0;
    if jsonb_typeof(v_fase->'sottofasi') = 'array' then
      for v_sotto in select value from jsonb_array_elements(v_fase->'sottofasi') loop
        continue when btrim(coalesce(v_sotto->>'nome', '')) = '';
        v_giorni := case when coalesce(v_sotto->>'giorni', '') ~ '^\d{1,4}$'
                          and (v_sotto->>'giorni')::integer between 1 and 3650
                         then (v_sotto->>'giorni')::integer end;
        insert into public.order_work_subphases (phase_id, name, position, peso, giorni, in_parallelo)
        values (v_fase_id, left(btrim(v_sotto->>'nome'), 160), v_pos_sotto,
                least(100, greatest(1, round(coalesce(nullif(v_sotto->>'peso', '')::numeric, 1))::integer)),
                v_giorni, coalesce((v_sotto->>'in_parallelo')::boolean, false) and v_pos_sotto > 0);
        v_pos_sotto := v_pos_sotto + 1;
      end loop;
    end if;
  end loop;
  if v_aggiunte = 0 then
    raise exception 'Nessuna fase con un nome da aggiungere.' using errcode = '22023';
  end if;
  return v_aggiunte;
end;
$function$;

revoke all on function public.aggiungi_fasi_commessa(uuid, jsonb) from public, anon;
grant execute on function public.aggiungi_fasi_commessa(uuid, jsonb) to authenticated, service_role;
