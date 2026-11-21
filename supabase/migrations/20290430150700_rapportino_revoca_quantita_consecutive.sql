-- Ricostruisce soltanto una sequenza continua di misure. Una rettifica manuale
-- interrompe la sequenza quando lo stato della voce differisce dalle fotografie.
create or replace function private.sottofase_storna_quantita_consecutive(
  p_revocata public.sottofasi_dal_rapportino,
  p_sottofase public.order_work_subphases,
  p_order uuid
) returns void language plpgsql set search_path = '' as $$
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

  foreach v_riga in array v_fotografie_aggiornate loop
    update public.sottofasi_dal_rapportino a
       set quantita_prima = v_riga.quantita_prima, quantita_dopo = v_riga.quantita_dopo,
           percentuale_prima = v_riga.percentuale_prima, percentuale_dopo = v_riga.percentuale_dopo
     where a.rapportino_id = v_riga.rapportino_id and a.subphase_id = p_sottofase.id;
  end loop;
  update public.order_work_subphases
     set quantita_fatta = v_quantita, percentuale = v_percentuale, fatta = v_percentuale = 100
   where id = p_sottofase.id;
end;
$$;
revoke all on function private.sottofase_storna_quantita_consecutive(public.sottofasi_dal_rapportino, public.order_work_subphases, uuid) from public, anon, authenticated;

create or replace function public.sottofase_revoca_avanzata(p_rapportino uuid, p_order uuid)
returns uuid[] language plpgsql security definer set search_path = '' as $$
declare
  x record;
  v_gestite uuid[] := '{}';
begin
  for x in
    select a.*, s.percentuale, s.quantita_fatta, s.fatta, a as movimento, s as sottofase
      from public.sottofasi_dal_rapportino a
      join public.order_work_subphases s on s.id = a.subphase_id
      join public.order_work_phases fp on fp.id = s.phase_id and fp.order_id = p_order
     where a.rapportino_id = p_rapportino
     order by a.subphase_id
     for update of s
  loop
    v_gestite := v_gestite || x.subphase_id;
    if (case when x.fatta then 100 else x.percentuale end) <> x.percentuale_dopo
       or x.quantita_fatta is distinct from round(x.quantita_dopo, 3) then
      perform private.sottofase_storna_quantita_consecutive(x.movimento, x.sottofase, p_order);
      continue;
    end if;
    if x.fatta_dal_rapportino and exists (
      select 1 from public.campo_rapportini r
      cross join lateral jsonb_array_elements(case when jsonb_typeof(r.fasi_lavorate) = 'array'
        then r.fasi_lavorate else '[]'::jsonb end) f
      where r.id <> p_rapportino and r.stato = 'approvato' and r.order_id = p_order
        and (f->'sottofasi_fatte') ? x.subphase_id::text
    ) then
      continue;
    end if;
    update public.order_work_subphases
       set fatta = false, percentuale = x.percentuale_prima, quantita_fatta = x.quantita_prima
     where id = x.subphase_id;
  end loop;
  delete from public.sottofasi_dal_rapportino where rapportino_id = p_rapportino;
  return v_gestite;
end;
$$;
revoke all on function public.sottofase_revoca_avanzata(uuid, uuid) from public, anon, authenticated;
