-- Importare un computo o un preventivo nelle fasi di una commessa che esiste già (14/11/2026).
--
-- Prima un computo diventava fasi solo creando una commessa nuova; in una commessa esistente si
-- poteva solo caricare il file, che diventava materiale da ordinare, non lavorazioni per i SAL.
-- Ora: ogni capitolo è una fase, ogni riga una sottofase con la sua voce (quantità, unità,
-- importo): sono le colonne che i SAL leggono (leggiFasiPerSal / sottofasiPerSal).
-- Le fasi che la commessa ha già con lo stesso nome si saltano: importare due volte non
-- raddoppia niente. Il venduto e gli importi delle voci li scrive solo chi ha «Venduto e importi».
set local lock_timeout = '3s';
set local statement_timeout = '60s';

create or replace function public.commessa_importa_fasi(
  p_order_id uuid, p_fasi jsonb, p_origine text default 'computo', p_codice text default null)
returns jsonb language plpgsql security definer set search_path = '' as $function$
declare
  v_azienda uuid := public.get_order_company_id(p_order_id);
  v_importi boolean;
  v_fase jsonb; v_voce jsonb;
  v_fase_id uuid; v_sotto_id uuid;
  v_base integer; v_pos integer;
  v_aggiunte integer := 0; v_saltate integer := 0; v_voci integer := 0;
  v_totale_voci integer := 0;
  v_somma numeric;
begin
  if auth.uid() is null or v_azienda is null or public.utente_bloccato()
     or not public.has_permission_for_company(auth.uid(), 'can_edit_orders', v_azienda) then
    raise exception 'Non hai il permesso di aggiungere fasi a questa commessa. Chiedi al titolare dell''azienda di darti l''accesso.' using errcode = '42501';
  end if;
  if not exists (select 1 from public.orders o where o.id = p_order_id and o.deleted_at is null
                  and public.can_see_order(o.id, o.assigned_to, o.destination_warehouse_id)) then
    raise exception 'Questa commessa non è tra quelle che puoi vedere.' using errcode = '42501';
  end if;
  if p_origine not in ('computo', 'preventivo') then
    raise exception 'Origine non valida.' using errcode = '22023';
  end if;
  if jsonb_typeof(p_fasi) is distinct from 'array' or jsonb_array_length(p_fasi) = 0 then
    raise exception 'Nessuna fase da importare.' using errcode = '22023';
  end if;
  if jsonb_array_length(p_fasi) > 60 then
    raise exception 'Troppe fasi in una volta: al massimo 60.' using errcode = '22023';
  end if;
  select coalesce(sum(jsonb_array_length(coalesce(f->'voci', '[]'::jsonb))), 0) into v_totale_voci from jsonb_array_elements(p_fasi) f;
  if v_totale_voci > 3000 then
    raise exception 'Troppe righe in una volta: al massimo 3000.' using errcode = '22023';
  end if;
  v_importi := public.has_permission_for_company(auth.uid(), 'can_view_order_amounts', v_azienda);

  perform 1 from public.orders where id = p_order_id for update;
  select coalesce(max(position) + 1, 0) into v_base from public.order_work_phases where order_id = p_order_id;

  for v_fase in select value from jsonb_array_elements(p_fasi) loop
    continue when btrim(coalesce(v_fase->>'nome', '')) = '';
    if exists (select 1 from public.order_work_phases f where f.order_id = p_order_id
                and lower(regexp_replace(btrim(f.name), '\s+', ' ', 'g')) = lower(regexp_replace(btrim(v_fase->>'nome'), '\s+', ' ', 'g'))) then
      v_saltate := v_saltate + 1;
      continue;
    end if;
    select coalesce(sum(greatest(0, coalesce(nullif(v->>'importo', '')::numeric, 0))), 0) into v_somma
      from jsonb_array_elements(coalesce(v_fase->'voci', '[]'::jsonb)) v;
    insert into public.order_work_phases (company_id, order_id, name, position, importo_venduto)
    values (v_azienda, p_order_id, left(btrim(v_fase->>'nome'), 160), v_base + v_aggiunte,
            case when v_importi and v_somma > 0 then round(v_somma, 2) end)
    returning id into v_fase_id;
    v_aggiunte := v_aggiunte + 1;
    v_pos := 0;
    for v_voce in select value from jsonb_array_elements(coalesce(v_fase->'voci', '[]'::jsonb)) loop
      continue when btrim(coalesce(v_voce->>'descrizione', '')) = '';
      insert into public.order_work_subphases (phase_id, name, position, peso)
      values (v_fase_id, left(btrim(v_voce->>'descrizione'), 160), v_pos, 1)
      returning id into v_sotto_id;
      insert into public.order_work_phase_voci (company_id, order_id, phase_id, subphase_id, position, descrizione, unita, quantita, importo, origine, origine_id, origine_codice)
      values (v_azienda, p_order_id, v_fase_id, v_sotto_id, v_pos, left(btrim(v_voce->>'descrizione'), 2000),
              nullif(left(btrim(coalesce(v_voce->>'unita', '')), 20), ''),
              greatest(0, coalesce(nullif(v_voce->>'quantita', '')::numeric, 0)),
              case when v_importi then greatest(0, round(coalesce(nullif(v_voce->>'importo', '')::numeric, 0), 2)) end,
              p_origine, v_sotto_id, nullif(left(btrim(coalesce(p_codice, '')), 120), ''));
      v_pos := v_pos + 1;
      v_voci := v_voci + 1;
    end loop;
  end loop;
  return jsonb_build_object('aggiunte', v_aggiunte, 'saltate', v_saltate, 'voci', v_voci, 'con_importi', v_importi);
end
$function$;

revoke all on function public.commessa_importa_fasi(uuid, jsonb, text, text) from public, anon;
grant execute on function public.commessa_importa_fasi(uuid, jsonb, text, text) to authenticated;
