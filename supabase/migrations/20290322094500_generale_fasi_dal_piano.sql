-- 20290322094500_generale_fasi_dal_piano.sql
--
-- Le fasi del cantiere dal piano economico (lotto 6 del piano
-- 2026-11-14-operazione-immobiliare-piano-completo). Un'operazione immobiliare caricata da un
-- business plan ha nel piano le voci della costruzione ma zero fasi nel cantiere.
--
-- generale_fasi_dal_piano(generale, fasi): crea sulla commessa generale le fasi scelte
-- (nome, date) e, dentro ognuna, una lavorazione per ogni voce del piano che le appartiene, con
-- l'importo della voce come costo previsto (a corpo: quantità 1). Il browser manda solo come
-- raggruppare: descrizione e importo si rileggono qui dalle voci del piano di questa generale.
-- Le fasi con un nome che c'è già si saltano, come nell'import da computo. Tutto o niente.
--
-- Costo previsto: materiali per le voci «materiali», lavoro (manodopera/ditte) per le altre.
-- Lo scrive solo chi vede i costi; per gli altri le lavorazioni nascono senza costo.

alter table public.order_work_phase_voci drop constraint if exists order_work_phase_voci_origine_check;
alter table public.order_work_phase_voci add constraint order_work_phase_voci_origine_check
  check (origine = any (array['preventivo', 'computo_rst', 'computo', 'listino', 'variante', 'computo_modulo', 'piano']));

create or replace function public.generale_fasi_dal_piano(p_generale_id uuid, p_fasi jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_azienda uuid := public.get_order_company_id(p_generale_id);
  v_costi boolean;
  v_fase jsonb;
  v_fase_id uuid;
  v_sotto_id uuid;
  v_voce record;
  v_base integer;
  v_pos integer;
  v_inizio date;
  v_fine date;
  v_aggiunte integer := 0;
  v_saltate integer := 0;
  v_voci integer := 0;
begin
  if auth.uid() is null or v_azienda is null or public.utente_bloccato()
     or not public.has_permission_for_company(auth.uid(), 'can_edit_orders', v_azienda) then
    raise exception 'Non hai il permesso di aggiungere fasi a questa commessa. Chiedi al titolare dell''azienda di darti l''accesso.' using errcode = '42501';
  end if;
  if not exists (select 1 from public.commesse_generali g join public.orders o on o.id = g.order_id
                  where g.order_id = p_generale_id and o.deleted_at is null) then
    raise exception 'Commessa generale non trovata.' using errcode = 'P0002';
  end if;
  if jsonb_typeof(p_fasi) is distinct from 'array' or jsonb_array_length(p_fasi) = 0 then
    raise exception 'Nessuna fase da creare.' using errcode = '22023';
  end if;
  if jsonb_array_length(p_fasi) > 40 then
    raise exception 'Troppe fasi in una volta: al massimo 40.' using errcode = '22023';
  end if;
  v_costi := public.has_permission_for_company(auth.uid(), 'can_view_costs', v_azienda);

  perform 1 from public.orders where id = p_generale_id for update;
  select coalesce(max(position) + 1, 0) into v_base from public.order_work_phases where order_id = p_generale_id;

  for v_fase in select value from jsonb_array_elements(p_fasi) loop
    continue when btrim(coalesce(v_fase->>'nome', '')) = '';
    if exists (select 1 from public.order_work_phases f where f.order_id = p_generale_id
                and lower(regexp_replace(btrim(f.name), '\s+', ' ', 'g')) = lower(regexp_replace(btrim(v_fase->>'nome'), '\s+', ' ', 'g'))) then
      v_saltate := v_saltate + 1;
      continue;
    end if;
    v_inizio := nullif(v_fase->>'inizio', '')::date;
    v_fine := nullif(v_fase->>'fine', '')::date;
    if v_inizio is not null and v_fine is not null and v_fine < v_inizio then
      raise exception 'La fase «%» finisce prima di cominciare.', btrim(v_fase->>'nome') using errcode = '22023';
    end if;

    insert into public.order_work_phases (company_id, order_id, name, position, start_date, end_date)
    values (v_azienda, p_generale_id, left(btrim(v_fase->>'nome'), 160), v_base + v_aggiunte, v_inizio, v_fine)
    returning id into v_fase_id;
    v_aggiunte := v_aggiunte + 1;
    v_pos := 0;

    -- Le voci: solo quelle del piano di questa generale, nell'ordine scelto.
    for v_voce in
      select pv.id, pv.descrizione, pv.importo, pv.categoria
        from jsonb_array_elements_text(coalesce(v_fase->'voci', '[]'::jsonb)) with ordinality x(id, n)
        join public.generale_piano_voci pv on pv.id = x.id::uuid
        join public.generale_piano_versioni ver on ver.id = pv.versione_id and ver.generale_id = p_generale_id
       order by x.n
    loop
      insert into public.order_work_subphases (phase_id, name, position, peso)
      values (v_fase_id, left(btrim(v_voce.descrizione), 160), v_pos, 1)
      returning id into v_sotto_id;
      insert into public.order_work_phase_voci (company_id, order_id, phase_id, subphase_id, position, descrizione, unita, quantita,
                                                costo_manodopera, costo_materiali, origine, origine_id, origine_codice)
      values (v_azienda, p_generale_id, v_fase_id, v_sotto_id, v_pos, left(btrim(v_voce.descrizione), 2000), 'a corpo', 1,
              case when v_costi and v_voce.categoria <> 'materiali' then greatest(0, round(coalesce(v_voce.importo, 0), 2)) else 0 end,
              case when v_costi and v_voce.categoria = 'materiali' then greatest(0, round(coalesce(v_voce.importo, 0), 2)) else 0 end,
              'piano', v_voce.id, 'Piano economico');
      v_pos := v_pos + 1;
      v_voci := v_voci + 1;
    end loop;
  end loop;

  return jsonb_build_object('aggiunte', v_aggiunte, 'saltate', v_saltate, 'voci', v_voci, 'con_costi', v_costi);
end
$$;

comment on function public.generale_fasi_dal_piano(uuid, jsonb) is
  'Crea le fasi del cantiere di una commessa generale dalle voci del suo piano economico: una lavorazione per voce, importo come costo previsto. 20290322094500.';

revoke all on function public.generale_fasi_dal_piano(uuid, jsonb) from public, anon;
grant execute on function public.generale_fasi_dal_piano(uuid, jsonb) to authenticated, service_role;
