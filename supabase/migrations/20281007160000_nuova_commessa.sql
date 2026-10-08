-- Come parte una commessa nuova (07/10/2026).
--
-- Dopo il 07/10 le fasi, i loro modelli e le regole per azienda esistono, ma una
-- commessa nasce ancora «vuota»: il modulo di nuova commessa non chiede le fasi,
-- e le altre strade che creano commesse (conversione dei preventivi, simulatore)
-- non sanno niente dei modelli. Qui si preparano tre cose, tutte facoltative:
--   · company_fasi_settings.modello_fasi_predefinito: il modello di fasi che
--     l'azienda vuole di partenza nelle commesse nuove (se ne ha uno solo);
--   · company_fasi_settings.controlli_avvio: cosa controlla il riquadro «Cantiere
--     da organizzare» (indirizzo, data di inizio, fasi, chi lavora, pagamenti):
--     un'azienda che non usa le fasi non deve vedersele chieste per sempre;
--   · commessa_avvia(): applica a una commessa appena nata i modelli predefiniti
--     dell'azienda, una volta sola e solo se è ancora vuota. Così ogni strada che
--     crea commesse ha un solo gesto da fare.
-- aggiungi_fasi_commessa impara a portare il «venduto» di ogni fase (serve alla
-- conversione dei computi di ristrutturazione: un capitolo = una fase col suo
-- importo), con lo stesso permesso del trigger delle fasi.
--
-- Additiva: due colonne con default che non cambiano il comportamento, e
-- funzioni nuove o rimpiazzate. Dipende da 20281007140000 (modelli) e 20281007143000/150000
-- (la versione di fasi_impostazioni_salva che questa riprende).

set local lock_timeout = '3s';

alter table public.company_fasi_settings
  add column if not exists modello_fasi_predefinito uuid references public.work_phase_templates(id) on delete set null,
  add column if not exists controlli_avvio text[] not null default array['indirizzo', 'date', 'fasi', 'chi', 'pagamenti']::text[];

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'company_fasi_settings_controlli_avvio_check') then
    alter table public.company_fasi_settings
      add constraint company_fasi_settings_controlli_avvio_check
      check (controlli_avvio <@ array['indirizzo', 'date', 'fasi', 'chi', 'pagamenti']::text[]);
  end if;
end $$;

-- Le regole dell'azienda, ora anche modello di partenza e controlli. Stesse regole
-- di prima per chi_spunta e peso_media (20281007143000 e 20281007150000).
create or replace function public.fasi_impostazioni_salva(p_company_id uuid, p_valori jsonb)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_modello uuid;
  v_controlli text[];
  v_ammessi constant text[] := array['indirizzo', 'date', 'fasi', 'chi', 'pagamenti'];
begin
  if auth.uid() is null
     or not public.has_permission_for_company(auth.uid(), 'can_edit_settings_orders', p_company_id) then
    raise exception 'Non hai il permesso di cambiare queste impostazioni.' using errcode = '42501';
  end if;
  insert into public.company_fasi_settings (company_id) values (p_company_id) on conflict (company_id) do nothing;

  if p_valori ? 'chi_spunta' then
    if (p_valori->>'chi_spunta') not in ('tutti', 'chi_la_fa', 'capi') then
      raise exception 'Scelta non valida.' using errcode = '22023';
    end if;
    update public.company_fasi_settings
       set chi_spunta = p_valori->>'chi_spunta', updated_at = now()
     where company_id = p_company_id;
  end if;

  if p_valori ? 'peso_media' then
    if (p_valori->>'peso_media') not in ('uguale', 'durata', 'venduto') then
      raise exception 'Scelta non valida.' using errcode = '22023';
    end if;
    update public.company_fasi_settings
       set peso_media = p_valori->>'peso_media', updated_at = now()
     where company_id = p_company_id;
    -- Le commesse dell'azienda si riallineano subito: il numero che si vede
    -- deve essere quello della scelta.
    perform public.recompute_order_progress(o.order_id)
      from (select distinct order_id from public.order_work_phases where company_id = p_company_id) o;
  end if;

  if p_valori ? 'modello_fasi_predefinito' then
    v_modello := nullif(p_valori->>'modello_fasi_predefinito', '')::uuid;
    if v_modello is not null
       and not exists (select 1 from public.work_phase_templates t where t.id = v_modello and t.company_id = p_company_id) then
      raise exception 'Modello non trovato.' using errcode = 'P0002';
    end if;
    update public.company_fasi_settings
       set modello_fasi_predefinito = v_modello, updated_at = now()
     where company_id = p_company_id;
  end if;

  if p_valori ? 'controlli_avvio' then
    if jsonb_typeof(p_valori->'controlli_avvio') is distinct from 'array'
       or exists (select 1 from jsonb_array_elements_text(p_valori->'controlli_avvio') x where x <> all (v_ammessi)) then
      raise exception 'Scelta non valida.' using errcode = '22023';
    end if;
    -- Sempre nell'ordine di lettura, senza doppioni.
    select coalesce(array_agg(c order by array_position(v_ammessi, c)), '{}'::text[])
      into v_controlli
      from (select distinct x as c from jsonb_array_elements_text(p_valori->'controlli_avvio') x) s;
    update public.company_fasi_settings
       set controlli_avvio = v_controlli, updated_at = now()
     where company_id = p_company_id;
  end if;
end;
$$;

revoke all on function public.fasi_impostazioni_salva(uuid, jsonb) from public, anon;
grant execute on function public.fasi_impostazioni_salva(uuid, jsonb) to authenticated;

-- Fasi e sottofasi in una commessa, in un colpo solo, ora anche col venduto.
--   p_fasi = [ { nome, venduto?, sottofasi: [ { nome, peso } ] } ]
create or replace function public.aggiungi_fasi_commessa(p_order_id uuid, p_fasi jsonb)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_azienda uuid := public.get_order_company_id(p_order_id);
  v_fase jsonb;
  v_sotto jsonb;
  v_fase_id uuid;
  v_base integer;
  v_aggiunte integer := 0;
  v_pos_sotto integer;
  v_venduto numeric;
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
      -- Come il trigger delle fasi: il venduto lo scrive solo chi ha «Ordini e Commesse» e «Importi di vendita».
      if not public.has_permission_for_company(auth.uid(), 'can_view_order_amounts', v_azienda) then
        raise exception 'Il venduto della fase lo scrive solo chi ha i permessi «Ordini e Commesse» e «Importi di vendita».'
          using errcode = '42501';
      end if;
      v_venduto := greatest(0, round((v_fase->>'venduto')::numeric, 2));
    end if;
    insert into public.order_work_phases (company_id, order_id, name, position, importo_venduto)
    values (v_azienda, p_order_id, left(btrim(v_fase->>'nome'), 160), v_base + v_aggiunte, v_venduto)
    returning id into v_fase_id;
    v_aggiunte := v_aggiunte + 1;
    v_pos_sotto := 0;
    if jsonb_typeof(v_fase->'sottofasi') = 'array' then
      for v_sotto in select value from jsonb_array_elements(v_fase->'sottofasi') loop
        continue when btrim(coalesce(v_sotto->>'nome', '')) = '';
        insert into public.order_work_subphases (phase_id, name, position, peso)
        values (v_fase_id, left(btrim(v_sotto->>'nome'), 160), v_pos_sotto,
                least(100, greatest(1, round(coalesce(nullif(v_sotto->>'peso', '')::numeric, 1))::integer)));
        v_pos_sotto := v_pos_sotto + 1;
      end loop;
    end if;
  end loop;

  if v_aggiunte = 0 then
    raise exception 'Nessuna fase con un nome da aggiungere.' using errcode = '22023';
  end if;
  return v_aggiunte;
end;
$$;

revoke all on function public.aggiungi_fasi_commessa(uuid, jsonb) from public, anon;
grant execute on function public.aggiungi_fasi_commessa(uuid, jsonb) to authenticated;

-- Applica a una commessa appena nata i modelli predefiniti dell'azienda: una
-- volta sola e solo se la commessa è ancora vuota (nessuna fase). Chi la
-- chiama (modulo, conversioni, simulatore) non deve sapere cosa c'è dentro.
create or replace function public.commessa_avvia(p_order_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_azienda uuid := public.get_order_company_id(p_order_id);
  v_modello uuid;
  v_fasi jsonb;
  v_n_fasi integer := 0;
begin
  if auth.uid() is null or v_azienda is null
     or not public.has_permission_for_company(auth.uid(), 'can_edit_orders', v_azienda) then
    raise exception 'Non hai il permesso di avviare questa commessa.' using errcode = '42501';
  end if;

  select s.modello_fasi_predefinito into v_modello
    from public.company_fasi_settings s where s.company_id = v_azienda;

  if v_modello is not null and not exists (select 1 from public.order_work_phases f where f.order_id = p_order_id) then
    select coalesce(jsonb_agg(
             jsonb_build_object(
               'nome', f.name,
               'sottofasi', coalesce((select jsonb_agg(jsonb_build_object('nome', s.name, 'peso', s.peso) order by s.position)
                                        from public.work_phase_template_subphases s where s.template_phase_id = f.id), '[]'::jsonb))
             order by f.position), '[]'::jsonb)
      into v_fasi
      from public.work_phase_template_phases f
     where f.template_id = v_modello;
    if jsonb_array_length(v_fasi) > 0 then
      v_n_fasi := public.aggiungi_fasi_commessa(p_order_id, v_fasi);
    end if;
  end if;

  return jsonb_build_object('fasi', v_n_fasi);
end;
$$;

revoke all on function public.commessa_avvia(uuid) from public, anon;
grant execute on function public.commessa_avvia(uuid) to authenticated;
