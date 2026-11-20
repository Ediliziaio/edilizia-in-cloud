-- Proposta: eseguire soltanto dopo autorizzazione alla migrazione.
-- Nessuna pulizia dei dati cliente; ABI esistenti conservate.
set local lock_timeout = '3s';
set local statement_timeout = '60s';
create or replace function public.rapportino_correggi(p_id uuid, p_updated_at timestamptz, p_campi jsonb, p_motivo text)
returns void language plpgsql security definer set search_path to 'public' as $$
declare
  r public.campo_rapportini;
  v_assegnato uuid;
  v_motivo text := nullif(btrim(coalesce(p_motivo, '')), '');
  v_era_approvato boolean;
  v_nuova_approvazione boolean;
  v_riga jsonb;
begin
  select * into r from public.campo_rapportini where id = p_id for update;
  if not found or auth.uid() is null or public.utente_bloccato() or public.utente_e_cliente_esterno() then
    raise exception 'Rapportino non disponibile.' using errcode = '42501';
  end if;
  perform public.assert_company_access(r.company_id);
  select assigned_to into v_assegnato from public.orders where id = r.order_id and deleted_at is null;
  if not found or public.has_permission_for_company(auth.uid(), 'can_edit_orders', r.company_id) is not true
     or public.check_staff_visibility(auth.uid(), v_assegnato) is not true
     or public.campo_e_ufficio(r.company_id) is not true
     or public.has_permission_for_company(auth.uid(), 'can_view_orders', r.company_id) is not true then
    raise exception 'Non puoi correggere questo rapportino.' using errcode = '42501';
  end if;
  if r.annullato_at is not null then raise exception 'Rapportino annullato: scrivine uno nuovo.' using errcode = '23514'; end if;
  if r.ufficio_employee_id is not null and r.stato = 'rifiutato' then
    raise exception 'Queste ore sono state annullate dall’ufficio. Reinseriscile da Ore e persone.' using errcode = '23514';
  end if;
  if r.updated_at is distinct from p_updated_at then
    raise exception 'Il rapportino è cambiato: riaprilo prima di correggerlo.' using errcode = 'PT409';
  end if;
  if jsonb_typeof(p_campi) is distinct from 'object' then raise exception 'Correzione non valida.' using errcode = '22023'; end if;
  if p_campi ? 'presenze' then
    if jsonb_typeof(p_campi->'presenze') is distinct from 'array' then raise exception 'Presenze non valide.' using errcode = '22023'; end if;
    for v_riga in select value from jsonb_array_elements(p_campi->'presenze') loop
      if nullif(v_riga->>'employee_id', '') is not null and not exists (select 1 from public.employees e where e.id = (v_riga->>'employee_id')::uuid and e.company_id = r.company_id) then
        raise exception 'Operaio estraneo all’azienda.' using errcode = '42501';
      end if;
      if nullif(v_riga->>'subappaltatore_id', '') is not null and not exists (select 1 from public.subcontractors d where d.id = (v_riga->>'subappaltatore_id')::uuid and d.company_id = r.company_id) then
        raise exception 'Ditta estranea all’azienda.' using errcode = '42501';
      end if;
      if coalesce((v_riga->>'ore')::numeric, -1) not between 0 and 24 then raise exception 'Ore operaio non valide.' using errcode = '22023'; end if;
    end loop;
  end if;
  if p_campi ? 'mezzi_usati' then
    if jsonb_typeof(p_campi->'mezzi_usati') is distinct from 'array' then raise exception 'Mezzi non validi.' using errcode = '22023'; end if;
    for v_riga in select value from jsonb_array_elements(p_campi->'mezzi_usati') loop
      if nullif(v_riga->>'mezzo_id', '') is not null and not exists (select 1 from public.mezzi m where m.id = (v_riga->>'mezzo_id')::uuid and m.company_id = r.company_id) then
        raise exception 'Mezzo estraneo all’azienda.' using errcode = '42501';
      end if;
      if nullif(v_riga->>'ore', '') is not null and (v_riga->>'ore')::numeric not between 0 and 24 then raise exception 'Ore mezzo non valide.' using errcode = '22023'; end if;
    end loop;
  end if;
  if p_campi ? 'materiali_usati' then
    if jsonb_typeof(p_campi->'materiali_usati') is distinct from 'array' then raise exception 'Materiali non validi.' using errcode = '22023'; end if;
    for v_riga in select value from jsonb_array_elements(p_campi->'materiali_usati') loop
      if coalesce((v_riga->>'quantita')::numeric, -1) < 0 or (v_riga->>'quantita')::numeric::text in ('NaN', 'Infinity', '-Infinity') then
        raise exception 'Quantità materiale non valida.' using errcode = '22023';
      end if;
    end loop;
  end if;
  if p_campi ? 'ore_lavorate' and coalesce((p_campi->>'ore_lavorate')::numeric, -1) not between 0 and 24 then raise exception 'Ore non valide.' using errcode = '22023'; end if;
  if p_campi ? 'ore_straordinario' and coalesce((p_campi->>'ore_straordinario')::numeric, -1) not between 0 and 24 then raise exception 'Straordinario non valido.' using errcode = '22023'; end if;
  v_nuova_approvazione := coalesce(r.user_id = auth.uid(), false) and not coalesce(public.e_amministratore_di(r.company_id), false);
  v_era_approvato := coalesce(r.approvato, false);
  if v_era_approvato then
    if v_motivo is null then raise exception 'Scrivi il motivo della correzione.' using errcode = '22023'; end if;
  end if;
    if exists (select 1 from public.appalto_rendiconto_righe a
                where a.stato <> 'bozza'
                  and (a.rapportino_id = p_id or a.voce_libera_id in (select v.id from public.rapportino_voci_libere v where v.rapportino_id = p_id))) then
      raise exception 'Non si può correggere: è già in un rendiconto confermato.' using errcode = '23514';
    end if;
    if exists (select 1 from public.giornale_lavori g where g.order_id = r.order_id and g.stato = 'firmata' and p_id = any(g.source_rapportini_ids)) then
      raise exception 'Non si può correggere: è in una pagina firmata del giornale. Scrivi un''annotazione sul giornale.' using errcode = '23514';
    end if;
  perform set_config('app.motivo_modifica', coalesce(v_motivo, ''), true);

  if v_era_approvato then
    update public.campo_rapportini set stato = 'inviato', approvato = false, approvato_da = null, approvato_at = null where id = p_id;
    delete from public.avanzamento_dal_rapportino where rapportino_id = p_id;
  end if;

  update public.campo_rapportini set
    descrizione_lavori = case when p_campi ? 'descrizione_lavori' then p_campi->>'descrizione_lavori' else descrizione_lavori end,
    note = case when p_campi ? 'note' then p_campi->>'note' else note end,
    ore_lavorate = case when p_campi ? 'ore_lavorate' then (p_campi->>'ore_lavorate')::numeric else ore_lavorate end,
    ore_straordinario = case when p_campi ? 'ore_straordinario' then (p_campi->>'ore_straordinario')::numeric else ore_straordinario end,
    presenze = case when p_campi ? 'presenze' then p_campi->'presenze' else presenze end,
    fasi_lavorate = case when p_campi ? 'fasi_lavorate' then p_campi->'fasi_lavorate' else fasi_lavorate end,
    materiali_usati = case when p_campi ? 'materiali_usati' then p_campi->'materiali_usati' else materiali_usati end,
    mezzi_usati = case when p_campi ? 'mezzi_usati' then p_campi->'mezzi_usati' else mezzi_usati end,
    stato = case when r.stato = 'rifiutato' then 'inviato' else stato end,
    motivo_rifiuto = case when r.stato = 'rifiutato' then null else motivo_rifiuto end,
    pdf_url = null, updated_at = clock_timestamp()
  where id = p_id;

  if v_era_approvato and not v_nuova_approvazione then
    update public.campo_rapportini
       set stato = 'approvato', approvato = true, approvato_da = r.approvato_da, approvato_at = r.approvato_at
     where id = p_id;
  end if;
  perform set_config('app.motivo_modifica', '', true);
end; $$;
revoke all on function public.rapportino_correggi(uuid, timestamptz, jsonb, text) from public, anon;
grant execute on function public.rapportino_correggi(uuid, timestamptz, jsonb, text) to authenticated;

create or replace function public.aggiungi_fasi_commessa(p_order_id uuid, p_fasi jsonb)
 returns integer
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_azienda uuid;
  v_assegnato uuid;
  v_valide integer := 0;
  v_nome text;
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
  -- Serializza due applicazioni dello stesso modello sulla stessa commessa.
  select company_id, assigned_to into v_azienda, v_assegnato from public.orders where id = p_order_id and deleted_at is null for update;
  if auth.uid() is null or v_azienda is null or public.utente_bloccato() or public.utente_e_cliente_esterno()
     or public.check_staff_visibility(auth.uid(), v_assegnato) is not true
     or not public.has_permission_for_company(auth.uid(), 'can_edit_orders', v_azienda) then
    raise exception 'Non hai il permesso di aggiungere fasi a questa commessa.' using errcode = '42501';
  end if;
  perform public.assert_company_access(v_azienda);
  if jsonb_typeof(p_fasi) is distinct from 'array' or jsonb_array_length(p_fasi) = 0 then
    raise exception 'Nessuna fase da aggiungere.' using errcode = '22023';
  end if;
  if jsonb_array_length(p_fasi) > 60 then
    raise exception 'Troppe fasi in una volta: al massimo 60.' using errcode = '22023';
  end if;
  select coalesce(max(position) + 1, 0) into v_base from public.order_work_phases where order_id = p_order_id;
  for v_fase in select value from jsonb_array_elements(p_fasi) loop
    continue when btrim(coalesce(v_fase->>'nome', '')) = '';
    v_valide := v_valide + 1;
    v_nome := left(btrim(v_fase->>'nome'), 160);
    select id into v_fase_id from public.order_work_phases
      where order_id = p_order_id and lower(regexp_replace(btrim(name), '\s+', ' ', 'g')) = lower(regexp_replace(v_nome, '\s+', ' ', 'g'))
      order by position, id limit 1;
    if v_fase_id is null then
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
    end if;
    select coalesce(max(position) + 1, 0) into v_pos_sotto from public.order_work_subphases where phase_id = v_fase_id;
    if jsonb_typeof(v_fase->'sottofasi') = 'array' then
      for v_sotto in select value from jsonb_array_elements(v_fase->'sottofasi') loop
        continue when btrim(coalesce(v_sotto->>'nome', '')) = '';
        continue when exists (select 1 from public.order_work_subphases where phase_id = v_fase_id
          and lower(regexp_replace(btrim(name), '\s+', ' ', 'g')) = lower(regexp_replace(left(btrim(v_sotto->>'nome'), 160), '\s+', ' ', 'g')));
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
  if v_valide = 0 then
    raise exception 'Nessuna fase con un nome da aggiungere.' using errcode = '22023';
  end if;
  return v_aggiunte;
end;
$function$;

revoke all on function public.aggiungi_fasi_commessa(uuid, jsonb) from public, anon;
grant execute on function public.aggiungi_fasi_commessa(uuid, jsonb) to authenticated, service_role;

-- Correggere una voce con PDF, storico e costi nella stessa transazione.
create or replace function public.rapportino_voce_correggi(p_id uuid, p_updated_at timestamptz, p_campi jsonb, p_motivo text)
returns void language plpgsql security definer set search_path to 'public' as $$
declare
  v public.rapportino_voci_libere;
  r public.campo_rapportini;
  v_report uuid;
  v_nome text;
  v_prima jsonb;
  v_dopo jsonb;
begin
  if auth.uid() is null or public.utente_bloccato() or public.utente_e_cliente_esterno() then
    raise exception 'Voce non disponibile.' using errcode = '42501';
  end if;
  select rapportino_id into v_report from public.rapportino_voci_libere where id = p_id;
  if not found then raise exception 'Voce non disponibile.' using errcode = '42501'; end if;
  -- Stesso ordine di lock delle correzioni del rapportino e dei suoi trigger.
  select * into r from public.campo_rapportini where id = v_report for update;
  perform public.assert_company_access(r.company_id);
  if public.has_permission_for_company(auth.uid(), 'can_view_costs', r.company_id) is not true then
    raise exception 'Non puoi modificare i costi del rapportino.' using errcode = '42501';
  end if;
  select * into v from public.rapportino_voci_libere where id = p_id and rapportino_id = r.id for update;
  if not found or v.updated_at is distinct from p_updated_at then
    raise exception 'La voce è cambiata: riaprila prima di modificarla.' using errcode = 'PT409';
  end if;
  if jsonb_typeof(p_campi) is distinct from 'object' then raise exception 'Correzione non valida.' using errcode = '22023'; end if;
  if p_campi ? 'vendita_unitaria' and public.has_permission_for_company(auth.uid(), 'can_view_order_amounts', r.company_id) is not true then
    raise exception 'Non puoi modificare il prezzo di vendita.' using errcode = '42501';
  end if;
  if exists (select 1 from public.appalto_rendiconto_righe a where a.stato <> 'bozza' and (a.rapportino_id = r.id or a.voce_libera_id = v.id))
     or exists (select 1 from public.giornale_lavori g where g.order_id = r.order_id and g.stato = 'firmata' and r.id = any(g.source_rapportini_ids)) then
    raise exception 'Documento confermato o giornale firmato: la voce non può essere modificata.' using errcode = '23514';
  end if;
  -- Riutilizza controllo ufficio/commessa, motivazione e divieto di autoapprovazione.
  perform public.rapportino_correggi(r.id, r.updated_at, '{}'::jsonb, p_motivo);
  v_prima := jsonb_build_object('descrizione', v.descrizione, 'quantita', v.quantita, 'unita', v.unita);
  update public.rapportino_voci_libere set
    descrizione = case when p_campi ? 'descrizione' then btrim(p_campi->>'descrizione') else descrizione end,
    quantita = case when p_campi ? 'quantita' then (p_campi->>'quantita')::numeric else quantita end,
    unita = case when p_campi ? 'unita' then btrim(p_campi->>'unita') else unita end,
    costo_unitario = case when p_campi ? 'costo_unitario' then (p_campi->>'costo_unitario')::numeric else costo_unitario end,
    vendita_unitaria = case when p_campi ? 'vendita_unitaria' then (p_campi->>'vendita_unitaria')::numeric else vendita_unitaria end,
    viaggio = case when p_campi ? 'viaggio' then nullif(p_campi->'viaggio', 'null'::jsonb) else viaggio end,
    updated_at = clock_timestamp()
  where id = p_id returning * into v;
  if nullif(v.descrizione, '') is null or nullif(v.unita, '') is null or v.quantita is null or v.quantita <= 0
     or v.quantita::text in ('NaN', 'Infinity', '-Infinity')
     or v.costo_unitario < 0 or v.vendita_unitaria < 0
     or v.costo_unitario::text in ('NaN', 'Infinity', '-Infinity') or v.vendita_unitaria::text in ('NaN', 'Infinity', '-Infinity') then
    raise exception 'Controlla descrizione, unità, quantità e prezzi.' using errcode = '22023';
  end if;
  v_dopo := jsonb_build_object('descrizione', v.descrizione, 'quantita', v.quantita, 'unita', v.unita);
  select btrim(concat_ws(' ', first_name, last_name)) into v_nome from public.profiles where id = auth.uid();
  -- Lo storico dei rapportini è leggibile anche senza permesso costi: nessun importo.
  insert into public.rapportino_modifiche(company_id, order_id, rapportino_id, fatta_da, fatta_da_nome, motivo, prima, dopo)
  values(r.company_id, r.order_id, r.id, auth.uid(), v_nome, nullif(btrim(p_motivo), ''),
    jsonb_build_object('voce', v_prima), jsonb_build_object('voce', v_dopo, 'voce_id', v.id));
end; $$;
revoke all on function public.rapportino_voce_correggi(uuid, timestamptz, jsonb, text) from public, anon;
grant execute on function public.rapportino_voce_correggi(uuid, timestamptz, jsonb, text) to authenticated;
