-- Ricostruisce soltanto una sequenza continua di misure. Una rettifica manuale
-- interrompe la sequenza quando lo stato della voce differisce dalle fotografie.
create or replace function private.sottofase_piano_storno_consecutivo(
  p_revocata public.sottofasi_dal_rapportino,
  p_sottofase public.order_work_subphases,
  p_order uuid
) returns table (quantita numeric, percentuale integer, fotografie public.sottofasi_dal_rapportino[])
language plpgsql stable set search_path = '' as $$
declare
  v_totale numeric := public.sottofase_quantita_totale(p_sottofase.id);
  v_quantita numeric := p_sottofase.quantita_fatta;
  v_percentuale integer := case when p_sottofase.fatta then 100 else p_sottofase.percentuale end;
  v_soglia numeric := round(p_revocata.quantita_dopo, 3);
  v_passaggio record;
  v_successivi public.sottofasi_dal_rapportino[] := '{}';
  v_fotografie_aggiornate public.sottofasi_dal_rapportino[] := '{}';
  v_riga public.sottofasi_dal_rapportino;
  v_nuova_quantita numeric;
begin
  if v_totale is null or v_totale <= 0 or v_quantita is null or v_soglia is null
     or v_quantita <= v_soglia or p_revocata.fatta_dal_rapportino
     or v_soglia <= coalesce(p_revocata.quantita_prima, v_totale * p_revocata.percentuale_prima / 100)
     or p_revocata.percentuale_dopo <> greatest(1, least(99, round(100 * p_revocata.quantita_dopo / v_totale)))::integer then
    return;
  end if;

  -- Partiamo dalla misura visibile e risaliamo solo se c'è un unico percorso
  -- fino al rapportino revocato. Gli aumenti stretti rendono finita la risalita.
  while v_quantita > v_soglia loop
    select a as riga, count(*) over () as candidati into v_passaggio
      from public.sottofasi_dal_rapportino a
      join public.campo_rapportini r on r.id = a.rapportino_id
    where a.subphase_id = p_sottofase.id and a.rapportino_id <> p_revocata.rapportino_id
      and r.order_id = p_order and r.stato = 'approvato' and r.annullato_at is null
      and round(a.quantita_dopo, 3) = v_quantita and a.percentuale_dopo = v_percentuale
      and not a.fatta_dal_rapportino and a.quantita_prima >= v_soglia and a.quantita_prima < v_quantita
      and a.percentuale_dopo = case when a.quantita_dopo >= v_totale then 100
        else greatest(1, least(99, round(100 * a.quantita_dopo / v_totale)))::integer end
    limit 1;
    if not found or v_passaggio.candidati <> 1 then return; end if;
    v_riga := v_passaggio.riga;
    v_successivi := array_prepend(v_riga, v_successivi);
    v_quantita := v_riga.quantita_prima;
    v_percentuale := v_riga.percentuale_prima;
  end loop;
  if v_percentuale <> p_revocata.percentuale_dopo then return; end if;
  -- Una misura reinserita a mano può coincidere con una fotografia più vecchia.
  -- In quel caso una fotografia successiva rimasta fuori dal percorso lo rende ambiguo.
  if exists (
    select 1 from public.sottofasi_dal_rapportino a
    join public.campo_rapportini r on r.id = a.rapportino_id
    where a.subphase_id = p_sottofase.id and a.rapportino_id <> p_revocata.rapportino_id
      and r.order_id = p_order and r.stato = 'approvato' and r.annullato_at is null
      and (a.created_at > p_revocata.created_at or
        (a.created_at = p_revocata.created_at and a.quantita_prima >= v_soglia))
      and not exists (select 1 from unnest(v_successivi) s where s.rapportino_id = a.rapportino_id)
  ) then return; end if;

  -- Ricalcola anche le fotografie dei rapportini rimasti, così un'altra revoca
  -- può ripartire dai nuovi valori.
  v_quantita := p_revocata.quantita_prima;
  v_percentuale := p_revocata.percentuale_prima;
  foreach v_riga in array v_successivi loop
    v_nuova_quantita := coalesce(v_quantita, v_totale * v_percentuale / 100)
      + v_riga.quantita_dopo - v_riga.quantita_prima;
    v_riga.quantita_prima := v_quantita;
    v_riga.percentuale_prima := v_percentuale;
    v_riga.quantita_dopo := v_nuova_quantita;
    v_riga.percentuale_dopo := case when v_nuova_quantita >= v_totale then 100
      else greatest(1, least(99, round(100 * v_nuova_quantita / v_totale)))::integer end;
    v_fotografie_aggiornate := array_append(v_fotografie_aggiornate, v_riga);
    v_quantita := round(v_nuova_quantita, 3);
    v_percentuale := v_riga.percentuale_dopo;
  end loop;

  if p_sottofase.fatta and v_percentuale < 100 and exists (
    select 1 from public.campo_rapportini r
    cross join lateral jsonb_array_elements(case when jsonb_typeof(r.fasi_lavorate) = 'array'
      then r.fasi_lavorate else '[]'::jsonb end) f
    where r.order_id = p_order and r.id <> p_revocata.rapportino_id
      and r.stato = 'approvato' and r.annullato_at is null
      and f->>'phase_id' = p_sottofase.phase_id::text
      and (f->'sottofasi_fatte') ? p_sottofase.id::text
  ) then
    return;
  end if;

  return query select v_quantita, v_percentuale, v_fotografie_aggiornate;
end;
$$;
revoke all on function private.sottofase_piano_storno_consecutivo(public.sottofasi_dal_rapportino, public.order_work_subphases, uuid) from public, anon, authenticated;

-- Il piano è di sola lettura ed è usato anche quando si applica la revoca.
create or replace function private.sottofase_piano_revoca(
  p_movimento public.sottofasi_dal_rapportino,
  p_voce public.order_work_subphases,
  p_order uuid
) returns table (quantita numeric, percentuale integer, esito text, fotografie public.sottofasi_dal_rapportino[])
language plpgsql stable set search_path = '' as $$
declare
  v_oggi integer := case when p_voce.fatta then 100 else p_voce.percentuale end;
  v_storno record;
begin
  if v_oggi is distinct from p_movimento.percentuale_dopo
     or p_voce.quantita_fatta is distinct from round(p_movimento.quantita_dopo, 3) then
    select * into v_storno from private.sottofase_piano_storno_consecutivo(p_movimento, p_voce, p_order);
    if found then
      return query select v_storno.quantita, v_storno.percentuale, 'ricalcolata'::text, v_storno.fotografie;
    else
      return query select p_voce.quantita_fatta, v_oggi, 'verifica'::text, '{}'::public.sottofasi_dal_rapportino[];
    end if;
  elsif p_movimento.fatta_dal_rapportino and exists (
    select 1 from public.campo_rapportini r
    cross join lateral jsonb_array_elements(case when jsonb_typeof(r.fasi_lavorate) = 'array'
      then r.fasi_lavorate else '[]'::jsonb end) f
    where r.id <> p_movimento.rapportino_id and r.stato = 'approvato' and r.order_id = p_order
      and (f->'sottofasi_fatte') ? p_voce.id::text
  ) then
    return query select p_voce.quantita_fatta, v_oggi, 'altri_rapportini'::text, '{}'::public.sottofasi_dal_rapportino[];
  else
    return query select p_movimento.quantita_prima, p_movimento.percentuale_prima,
      'ricalcolata'::text, '{}'::public.sottofasi_dal_rapportino[];
  end if;
end;
$$;
revoke all on function private.sottofase_piano_revoca(public.sottofasi_dal_rapportino, public.order_work_subphases, uuid) from public, anon, authenticated;

create or replace function public.sottofase_revoca_avanzata(p_rapportino uuid, p_order uuid)
returns uuid[] language plpgsql security definer set search_path = '' as $$
declare
  x record;
  v_piano record;
  v_riga public.sottofasi_dal_rapportino;
  v_gestite uuid[] := '{}';
begin
  for x in
    select a as movimento, s as voce, s.id from public.sottofasi_dal_rapportino a
    join public.order_work_subphases s on s.id = a.subphase_id
    join public.order_work_phases f on f.id = s.phase_id and f.order_id = p_order
    where a.rapportino_id = p_rapportino order by s.id for update of s
  loop
    v_gestite := array_append(v_gestite, x.id);
    select * into strict v_piano from private.sottofase_piano_revoca(x.movimento, x.voce, p_order);
    if v_piano.esito <> 'ricalcolata' then continue; end if;
    foreach v_riga in array v_piano.fotografie loop
      update public.sottofasi_dal_rapportino a
         set quantita_prima = v_riga.quantita_prima, quantita_dopo = v_riga.quantita_dopo,
             percentuale_prima = v_riga.percentuale_prima, percentuale_dopo = v_riga.percentuale_dopo
       where a.rapportino_id = v_riga.rapportino_id and a.subphase_id = x.id;
    end loop;
    update public.order_work_subphases set quantita_fatta = v_piano.quantita,
      percentuale = v_piano.percentuale, fatta = v_piano.percentuale >= 100 where id = x.id;
  end loop;
  delete from public.sottofasi_dal_rapportino where rapportino_id = p_rapportino;
  return v_gestite;
end;
$$;
revoke all on function public.sottofase_revoca_avanzata(uuid, uuid) from public, anon, authenticated;
drop function if exists private.sottofase_storna_quantita_consecutive(public.sottofasi_dal_rapportino, public.order_work_subphases, uuid);

-- Percentuale di fase con i pesi reali, o con gli importi se tutti i pesi
-- sono quelli predefiniti. L'anteprima può sostituire la misura di alcune voci.
create or replace function private.fase_percentuale_da_voci(p_fase uuid, p_previste jsonb)
returns integer language sql stable set search_path = '' as $$
  with voci as (
    select s.peso, coalesce((p_previste->>s.id::text)::integer, case when s.fatta then 100 else s.percentuale end) as pct,
      (select v.importo from public.order_work_phase_voci v where v.subphase_id = s.id limit 1) as importo
    from public.order_work_subphases s where s.phase_id = p_fase
  )
  select case when count(*) = 0 then null
    when bool_and(pct >= 100) then 100
    else least(99, round(case when bool_and(peso = 1 and coalesce(importo, 0) > 0)
      then sum(importo * pct) / sum(importo) else sum((peso * pct)::numeric) / sum(peso) end)::integer)
  end from voci
$$;
revoke all on function private.fase_percentuale_da_voci(uuid, jsonb) from public, anon, authenticated;

create or replace function public.fase_avanzamento_derivato(p_phase_id uuid, p_status_proposto text, p_status_precedente text)
returns table(derivata boolean, percentuale integer, stato text)
language sql stable security definer set search_path = '' as $$
  with p as (select private.fase_percentuale_da_voci(p_phase_id, '{}'::jsonb) as pct)
  select pct is not null, pct, case
    when pct is null then null when pct >= 100 then 'completata' when pct > 0 then 'in_corso'
    when p_status_proposto in ('da_iniziare', 'in_corso') then p_status_proposto
    when p_status_precedente = 'completata' then 'in_corso' else p_status_precedente end
  from p
$$;
revoke all on function public.fase_avanzamento_derivato(uuid, text, text) from public, anon, authenticated;

create or replace function private.campo_rapportino_verifica_annullo(p_id uuid, p_updated_at timestamptz, p_blocca boolean)
returns public.campo_rapportini language plpgsql set search_path = '' as $$
declare
  r public.campo_rapportini;
  v_assegnato uuid;
begin
  if auth.uid() is null or public.utente_bloccato() or public.utente_e_cliente_esterno() then
    raise exception 'Rapportino non disponibile.' using errcode = '42501';
  end if;
  if p_blocca then
    select * into r from public.campo_rapportini where id = p_id for update;
  else
    select * into r from public.campo_rapportini where id = p_id;
  end if;
  if r.id is null then raise exception 'Rapportino non disponibile.' using errcode = '42501'; end if;
  perform public.assert_company_access(r.company_id);
  select assigned_to into v_assegnato from public.orders
    where id = r.order_id and company_id = r.company_id and deleted_at is null;
  if not found or r.company_id is distinct from public.get_effective_company_id()
     or public.has_permission_for_company(auth.uid(), 'can_edit_orders', r.company_id) is not true
     or public.has_permission_for_company(auth.uid(), 'can_view_orders', r.company_id) is not true
     or public.check_staff_visibility(auth.uid(), v_assegnato) is not true
     or public.campo_e_ufficio(r.company_id) is not true then
    raise exception 'Non hai il permesso di annullare questo rapportino.' using errcode = '42501';
  end if;
  if r.annullato_at is not null then return r; end if;
  if r.updated_at is distinct from p_updated_at then
    raise exception 'Il rapportino è cambiato. Riaprilo per controllare i dati aggiornati.' using errcode = 'PT409';
  end if;
  if exists (select 1 from public.appalto_rendiconto_righe a where a.rapportino_id = p_id and a.stato <> 'bozza') then
    raise exception 'Non si può annullare: è già in un rendiconto non più in bozza.' using errcode = '23514';
  end if;
  if exists (select 1 from public.giornale_lavori g where g.order_id = r.order_id
    and g.stato = 'firmata' and p_id = any(g.source_rapportini_ids)) then
    raise exception 'Non si può annullare: è riportato in una pagina firmata del giornale dei lavori.' using errcode = '23514';
  end if;
  return r;
end;
$$;
revoke all on function private.campo_rapportino_verifica_annullo(uuid, timestamptz, boolean) from public, anon, authenticated;

create or replace function private.campo_rapportino_piano_annullo(r public.campo_rapportini)
returns jsonb language plpgsql stable set search_path = '' as $$
declare
  v_dichiarate jsonb := case when jsonb_typeof(r.fasi_lavorate) = 'array' then r.fasi_lavorate else '[]'::jsonb end;
  v_voci jsonb := '[]';
  v_fasi jsonb := '[]';
  v_commessa jsonb;
  v_previste jsonb;
  v_attuale numeric;
  v_dopo numeric;
  v_esito text;
  f record;
begin
  if r.stato is distinct from 'approvato' or r.lavoro_completato or nullif(btrim(r.firma_cliente_url), '') is not null then
    return jsonb_build_object('voci', v_voci, 'fasi', v_fasi, 'commessa', v_commessa);
  end if;

  with moderne as (
    select s.id, s.name, fp.id as fase, s.quantita_fatta as prima, p.quantita as dopo,
      case when s.fatta then 100 else s.percentuale end as percentuale_prima, p.percentuale as percentuale_dopo, p.esito
    from public.sottofasi_dal_rapportino m
    join public.order_work_subphases s on s.id = m.subphase_id
    join public.order_work_phases fp on fp.id = s.phase_id and fp.order_id = r.order_id
    cross join lateral private.sottofase_piano_revoca(m, s, r.order_id) p where m.rapportino_id = r.id
  ), storiche as (
    select distinct s.id, s.name, fp.id as fase, s.quantita_fatta as prima, s.quantita_fatta as dopo,
      case when s.fatta then 100 else s.percentuale end as percentuale_prima,
      case when regola.esito = 'ricalcolata' then 0 when s.fatta then 100 else s.percentuale end as percentuale_dopo,
      regola.esito
    from jsonb_array_elements(v_dichiarate) e
    join public.order_work_phases fp on fp.id::text = e->>'phase_id' and fp.order_id = r.order_id
    join public.order_work_subphases s on s.phase_id = fp.id
    cross join lateral (select case
      when not s.fatta then 'invariata'
      when exists (
        select 1 from public.campo_rapportini altro
        cross join lateral jsonb_array_elements(case when jsonb_typeof(altro.fasi_lavorate) = 'array'
          then altro.fasi_lavorate else '[]'::jsonb end) d
        where altro.order_id = r.order_id and altro.id <> r.id and altro.stato = 'approvato'
          and (d->'sottofasi_fatte') ? s.id::text
      ) then 'altri_rapportini'
      when s.fatta_il = ((r.data_lavoro::timestamp + interval '12 hours') at time zone 'Europe/Rome') then 'ricalcolata'
      else 'verifica' end as esito) regola
    where (e->'sottofasi_fatte') ? s.id::text and not exists (select 1 from moderne m where m.id = s.id)
  ), voci as (select * from moderne union all select * from storiche)
  select coalesce(jsonb_agg(to_jsonb(voci) || jsonb_build_object('unita', (
    select case when count(distinct v.unita) = 1 then min(v.unita) end
    from public.order_work_phase_voci v where v.subphase_id = voci.id
  )) order by fase, name, id), '[]') into v_voci from voci;

  for f in
    select p.*, a.percentuale_prima, a.percentuale_dopo, d.dichiarata
    from public.order_work_phases p
    left join public.avanzamento_dal_rapportino a on a.rapportino_id = r.id and a.phase_id = p.id
    left join lateral (select round(nullif(e->>'percentuale','')::numeric) as dichiarata
      from jsonb_array_elements(v_dichiarate) e where e->>'phase_id' = p.id::text limit 1) d on true
    where p.order_id = r.order_id and (a.id is not null or d.dichiarata is not null
      or exists (select 1 from jsonb_array_elements(v_voci) v where v->>'fase' = p.id::text))
    order by p.name, p.id
  loop
    select coalesce(jsonb_object_agg(v->>'id', v->'percentuale_dopo'), '{}') into v_previste
      from jsonb_array_elements(v_voci) v where v->>'fase' = f.id::text and v->>'esito' = 'ricalcolata';
    v_attuale := f.percentuale;
    v_dopo := private.fase_percentuale_da_voci(f.id, v_previste);
    v_esito := 'ricalcolata';
    if v_dopo is not null then
      if v_previste = '{}'::jsonb then v_dopo := v_attuale; end if;
    elsif v_attuale is not distinct from coalesce(f.percentuale_dopo, f.dichiarata) then
      select greatest(coalesce(f.percentuale_prima, 0), coalesce(round(max(nullif(e->>'percentuale','')::numeric)), 0))
        into v_dopo from public.campo_rapportini altro
        cross join lateral jsonb_array_elements(case when jsonb_typeof(altro.fasi_lavorate) = 'array'
          then altro.fasi_lavorate else '[]'::jsonb end) e
        where altro.order_id = r.order_id and altro.id <> r.id and altro.stato = 'approvato' and e->>'phase_id' = f.id::text;
    else
      v_dopo := v_attuale;
      v_esito := 'verifica';
    end if;
    v_fasi := v_fasi || jsonb_build_array(jsonb_build_object('id', f.id, 'name', f.name, 'prima', v_attuale, 'dopo', v_dopo, 'esito', v_esito));
  end loop;

  if jsonb_array_length(v_dichiarate) = 0 and coalesce(r.percentuale_avanzamento, 0) > 0 then
    select o.percentuale_avanzamento, coalesce(a.percentuale_prima, 0) as base,
      coalesce(a.percentuale_dopo, r.percentuale_avanzamento) as applicata
    into f from public.orders o left join public.avanzamento_dal_rapportino a
      on a.rapportino_id = r.id and a.phase_id is null where o.id = r.order_id;
    v_attuale := f.percentuale_avanzamento;
    v_esito := 'verifica';
    v_dopo := v_attuale;
    if v_attuale is not distinct from f.applicata then
      select greatest(f.base, coalesce(max(altro.percentuale_avanzamento), 0)) into v_dopo
        from public.campo_rapportini altro where altro.order_id = r.order_id
          and altro.id <> r.id and altro.stato = 'approvato' and coalesce(jsonb_array_length(altro.fasi_lavorate), 0) = 0;
      v_esito := 'ricalcolata';
    end if;
    v_commessa := jsonb_build_object('prima', v_attuale, 'dopo', v_dopo, 'esito', v_esito);
  end if;
  return jsonb_build_object('voci', v_voci, 'fasi', v_fasi, 'commessa', v_commessa);
end;
$$;
revoke all on function private.campo_rapportino_piano_annullo(public.campo_rapportini) from public, anon, authenticated;

create or replace function public.campo_rapportino_anteprima_annullo(p_id uuid, p_updated_at timestamptz)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  r public.campo_rapportini := private.campo_rapportino_verifica_annullo(p_id, p_updated_at, false);
  v_piano jsonb;
begin
  if r.annullato_at is not null then raise exception 'Questo rapportino è già stato annullato.' using errcode = 'PT409'; end if;
  v_piano := private.campo_rapportino_piano_annullo(r);
  return v_piano || jsonb_build_object('versione', md5(v_piano::text));
end;
$$;
revoke all on function public.campo_rapportino_anteprima_annullo(uuid, timestamptz) from public, anon;
grant execute on function public.campo_rapportino_anteprima_annullo(uuid, timestamptz) to authenticated;

create or replace function public.campo_rapportino_annulla(p_id uuid, p_updated_at timestamptz, p_motivo text)
returns void language plpgsql security definer set search_path = '' as $$
declare
  r public.campo_rapportini := private.campo_rapportino_verifica_annullo(p_id, p_updated_at, true);
  v_motivo text := nullif(btrim(p_motivo), '');
begin
  if r.annullato_at is not null then return; end if;
  if v_motivo is null then raise exception 'Scrivi il motivo dell''annullamento.' using errcode = '22023'; end if;
  update public.campo_rapportini
     set stato = 'rifiutato', approvato = false, motivo_rifiuto = v_motivo, pdf_url = null,
         annullato_at = now(), annullato_da = auth.uid()
   where id = r.id;
end;
$$;
revoke all on function public.campo_rapportino_annulla(uuid, timestamptz, text) from public, anon;
grant execute on function public.campo_rapportino_annulla(uuid, timestamptz, text) to authenticated, service_role;

create or replace function public.campo_rapportino_conferma_annullo(
  p_id uuid, p_updated_at timestamptz, p_motivo text, p_anteprima text
) returns void language plpgsql security definer set search_path = '' as $$
declare
  r public.campo_rapportini := private.campo_rapportino_verifica_annullo(p_id, p_updated_at, true);
  v_fasi uuid[];
begin
  if r.annullato_at is not null then return; end if;
  select array(select fp.id from public.order_work_phases fp
    where fp.order_id = r.order_id and fp.company_id = r.company_id and (
      fp.id::text in (select v->>'phase_id' from jsonb_array_elements(
        case when jsonb_typeof(r.fasi_lavorate) = 'array' then r.fasi_lavorate else '[]'::jsonb end) v)
      or exists (select 1 from public.order_work_subphases s
        join public.sottofasi_dal_rapportino m on m.subphase_id = s.id
        where s.phase_id = fp.id and m.rapportino_id = r.id)
    )) into v_fasi;
  if cardinality(v_fasi) = 0 then
    perform 1 from public.orders where id = r.order_id and company_id = r.company_id for update;
  else
    -- Stesso ordine dell'approvazione. Anche due revoche sulla stessa fase
    -- rivalutano il piano prima di confermare.
    perform 1 from public.order_work_phases where id = any(v_fasi) order by id for update;
    perform 1 from public.order_work_subphases where phase_id = any(v_fasi) order by id for update;
  end if;
  if p_anteprima is distinct from md5(private.campo_rapportino_piano_annullo(r)::text) then
    raise exception 'L’avanzamento è cambiato. Controlla la nuova anteprima prima di confermare.' using errcode = 'PT409';
  end if;
  perform public.campo_rapportino_annulla(p_id, p_updated_at, p_motivo);
end;
$$;
revoke all on function public.campo_rapportino_conferma_annullo(uuid, timestamptz, text, text) from public, anon;
grant execute on function public.campo_rapportino_conferma_annullo(uuid, timestamptz, text, text) to authenticated;
notify pgrst, 'reload schema';
