-- Lavori extra e varianti → Lavorazioni (06/11/2026, richiesta di Florin).
-- Prima l'approvazione di una variante cambiava solo lo stato: il lavoro extra non compariva fra le fasi, niente
-- sottofasi, niente voci, nessuno assegnato. Ora, quando il cliente accetta (firma dal link o copia firmata caricata):
--  · nasce la fase «Lavoro extra · <titolo>», in fondo, oppure il lavoro entra nella fase scelta nella bozza
--    (content.destinazione = 'fase' e work_phase_id);
--  · una sottofase per voce (nome, quantità, unità, prezzo); a corpo, una sottofase col titolo;
--  · le voci con origine 'variante' e origine_codice = id della variante (così si sa da dove vengono e non si
--    ricreano); il costo previsto interno della bozza, se c'è, si ripartisce sulle voci in proporzione;
--  · chi lo farà (content.chi) entra in «chi fa la sottofase»: è un piano, non sposta costi né accessi;
--  · il venduto della fase nuova è l'importo della variante. Il conto della commessa NON cambia qui: già oggi somma
--    le varianti approvate (agreedContractValue, v_ordine_marginalita, commessa_iva, rate), e così resta.
-- Le riduzioni non creano niente. Se la creazione fallisce, l'approvazione resta valida (la firma del cliente non si
-- perde): la variante resta senza fase e dalla scheda si crea con «Crea la fase» (variante_crea_lavori_da_ufficio).
-- Idempotente.
set local lock_timeout = '3s';
set local statement_timeout = '60s';

alter table public.order_work_phase_voci drop constraint if exists order_work_phase_voci_origine_check;
alter table public.order_work_phase_voci add constraint order_work_phase_voci_origine_check
  check (origine = any (array['preventivo'::text, 'computo_rst'::text, 'computo'::text, 'listino'::text, 'variante'::text]));
create index if not exists order_work_phase_voci_variante on public.order_work_phase_voci (origine_codice) where origine = 'variante';

-- Un numero scritto da una persona («12,5», «3»): null se non è un numero.
create or replace function public._variante_numero(p text)
returns numeric language sql immutable set search_path = ''
as $$ select case when btrim(coalesce(p, '')) ~ '^-?[0-9]+([.,][0-9]+)?$' then replace(btrim(p), ',', '.')::numeric end $$;
revoke all on function public._variante_numero(text) from public, anon, authenticated;

create or replace function public.variante_crea_lavori(p_id uuid)
returns uuid language plpgsql security definer set search_path = ''
as $$
declare
  v public.ordini_variazione;
  c jsonb;
  v_fase uuid;
  v_pos integer;
  v_pos_sotto integer;
  v_sotto uuid;
  r jsonb;
  q numeric;
  p numeric;
  v_importo numeric;
  v_totale numeric := 0;
  v_costo numeric;
  v_sottofasi uuid[] := '{}';
  x jsonb;
begin
  select * into v from public.ordini_variazione where id = p_id for update;
  if not found or v.status <> 'approvato' then return null; end if;
  -- Già fatto: la fase è quella delle sue voci.
  select phase_id into v_fase from public.order_work_phase_voci where origine = 'variante' and origine_codice = v.id::text limit 1;
  if v_fase is not null then return v_fase; end if;

  select content into c from public.order_variation_workspaces where variation_id = v.id;
  c := coalesce(c, '{}'::jsonb);
  if coalesce(c->>'kind', 'aggiunta') = 'riduzione' or coalesce(v.impatto_economico, 0) < 0 then return null; end if;

  if c->>'destinazione' = 'fase' and v.work_phase_id is not null
     and exists (select 1 from public.order_work_phases where id = v.work_phase_id and order_id = v.order_id) then
    v_fase := v.work_phase_id;
    -- Il venduto della fase cresce del lavoro extra, se la fase ne ha uno.
    update public.order_work_phases set importo_venduto = importo_venduto + greatest(v.impatto_economico, 0)
     where id = v_fase and importo_venduto is not null;
    update public.order_work_phases set status = 'in_corso' where id = v_fase and status = 'completata';
  else
    select coalesce(max(position), -1) + 1 into v_pos from public.order_work_phases where order_id = v.order_id;
    insert into public.order_work_phases (company_id, order_id, name, position, status, notes, importo_venduto)
    values (v.company_id, v.order_id, left('Lavoro extra · ' || v.titolo, 160), v_pos, 'da_iniziare',
            'Dalla variante n. ' || v.numero_odv || ', approvata il ' || to_char(now() at time zone 'Europe/Rome', 'DD/MM/YYYY') || '.',
            nullif(greatest(v.impatto_economico, 0), 0))
    returning id into v_fase;
  end if;

  select coalesce(max(position), -1) + 1 into v_pos_sotto from public.order_work_subphases where phase_id = v_fase;
  v_costo := public._variante_numero(c->>'estimatedCost');

  if c->>'pricing' = 'voci' and jsonb_typeof(c->'lines') = 'array' and jsonb_array_length(c->'lines') > 0 then
    for r in select value from jsonb_array_elements(c->'lines') loop
      q := coalesce(public._variante_numero(r->>'quantity'), 1);
      p := coalesce(public._variante_numero(r->>'price'), 0);
      v_totale := v_totale + abs(round(q * p, 2));
    end loop;
    for r in select value from jsonb_array_elements(c->'lines') loop
      continue when btrim(coalesce(r->>'description', '')) = '';
      q := greatest(coalesce(public._variante_numero(r->>'quantity'), 1), 0);
      p := coalesce(public._variante_numero(r->>'price'), 0);
      v_importo := round(q * p, 2);
      insert into public.order_work_subphases (phase_id, name, position)
      values (v_fase, left(btrim(r->>'description'), 160), v_pos_sotto) returning id into v_sotto;
      v_pos_sotto := v_pos_sotto + 1;
      v_sottofasi := v_sottofasi || v_sotto;
      insert into public.order_work_phase_voci (company_id, order_id, phase_id, subphase_id, position, descrizione, unita, quantita,
                                                costo_manodopera, costo_materiali, importo, origine, origine_id, origine_codice)
      values (v.company_id, v.order_id, v_fase, v_sotto, v_pos_sotto, left(btrim(r->>'description'), 1000), nullif(btrim(coalesce(r->>'unit', '')), ''), q,
              case when coalesce(v_costo, 0) > 0 and v_totale > 0 and q > 0 then round(v_costo * abs(v_importo) / v_totale / q, 4) else 0 end,
              0, v_importo, 'variante', v_sotto, v.id::text);
    end loop;
  end if;
  if cardinality(v_sottofasi) = 0 then
    -- A corpo (o voci tutte vuote): una sottofase col titolo, una voce a corpo.
    insert into public.order_work_subphases (phase_id, name, position, giorni)
    values (v_fase, left(v.titolo, 160), v_pos_sotto, nullif(least(greatest(coalesce(v.impatto_giorni, 0), 0), 3650), 0))
    returning id into v_sotto;
    v_sottofasi := array[v_sotto];
    insert into public.order_work_phase_voci (company_id, order_id, phase_id, subphase_id, position, descrizione, unita, quantita,
                                              costo_manodopera, costo_materiali, importo, origine, origine_id, origine_codice)
    values (v.company_id, v.order_id, v_fase, v_sotto, v_pos_sotto, left(v.titolo, 1000), 'a corpo', 1,
            greatest(coalesce(v_costo, 0), 0), 0, v.impatto_economico, 'variante', v_sotto, v.id::text);
  end if;

  -- Chi lo farà: persone e ditte/squadre dell'azienda della commessa, su ogni sottofase nuova.
  if jsonb_typeof(c->'chi') = 'array' then
    for x in select value from jsonb_array_elements(c->'chi') loop
      continue when coalesce(x->>'id', '') !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$';
      if x->>'tipo' = 'persona' and exists (select 1 from public.employees e where e.id = (x->>'id')::uuid and e.company_id = v.company_id) then
        insert into public.order_work_subphase_chi (order_id, subphase_id, employee_id)
        select v.order_id, s, (x->>'id')::uuid from unnest(v_sottofasi) s on conflict do nothing;
      elsif x->>'tipo' = 'ditta' and exists (select 1 from public.external_teams t where t.id = (x->>'id')::uuid and t.company_id = v.company_id) then
        insert into public.order_work_subphase_chi (order_id, subphase_id, external_team_id)
        select v.order_id, s, (x->>'id')::uuid from unnest(v_sottofasi) s on conflict do nothing;
      end if;
    end loop;
  end if;
  return v_fase;
end;
$$;
revoke all on function public.variante_crea_lavori(uuid) from public, anon, authenticated;

-- All'approvazione (online o con la copia firmata). Un errore qui non annulla la firma: si crea poi a mano.
create or replace function public.tg_variante_approvata_crea_lavori()
returns trigger language plpgsql security definer set search_path = ''
as $$
begin
  if new.status = 'approvato' and old.status is distinct from 'approvato' then
    begin
      perform public.variante_crea_lavori(new.id);
    exception when others then
      raise warning 'variante % approvata senza fase: %', new.id, sqlerrm;
    end;
  end if;
  return null;
end;
$$;
revoke all on function public.tg_variante_approvata_crea_lavori() from public, anon, authenticated;
drop trigger if exists variante_approvata_crea_lavori on public.ordini_variazione;
create trigger variante_approvata_crea_lavori after update of status on public.ordini_variazione
  for each row execute function public.tg_variante_approvata_crea_lavori();

-- «Crea la fase» dalla scheda: per una variante approvata che non l'ha (approvata prima di oggi, o fallita).
create or replace function public.variante_crea_lavori_da_ufficio(p_variante uuid)
returns uuid language plpgsql security definer set search_path = ''
as $$
declare v_company uuid; v_order uuid;
begin
  select company_id, order_id into v_company, v_order from public.ordini_variazione where id = p_variante;
  if v_company is null then raise exception 'Variante non trovata' using errcode = 'P0002'; end if;
  if not public.has_permission_for_company((select auth.uid()), 'can_edit_orders', v_company)
     or not public._order_visible_under_rls(v_order, true) then
    raise exception 'Serve il permesso di modificare le commesse' using errcode = '42501';
  end if;
  return public.variante_crea_lavori(p_variante);
end;
$$;
revoke all on function public.variante_crea_lavori_da_ufficio(uuid) from public, anon;
grant execute on function public.variante_crea_lavori_da_ufficio(uuid) to authenticated;
