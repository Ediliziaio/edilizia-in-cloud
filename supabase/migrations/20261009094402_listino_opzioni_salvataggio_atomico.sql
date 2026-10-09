-- Atomic option edits: tenant + permission checks, row locks and rollback on failure.
create or replace function public.listino_salva_opzioni(
  p_family_id uuid, p_axis_id uuid, p_value_id uuid, p_patch jsonb,
  p_value_ids uuid[] default null
) returns jsonb language plpgsql security definer set search_path = public
set lock_timeout = '5s' as $fn$
declare
  v_company uuid; v_axis public.article_family_axes%rowtype;
  v_row public.article_family_axis_values%rowtype; v_id uuid; v_count int := 0;
  v_ids uuid[]; v_bulk boolean := p_value_ids is not null;
begin
  select company_id into v_company from public.article_families
    where id=p_family_id and deleted_at is null;
  if auth.uid() is null or v_company is null or
    not public.has_permission_for_company(auth.uid(), 'can_edit_settings_pricing', v_company) then
    raise exception 'Non puoi modificare le opzioni di questa azienda' using errcode='42501';
  end if;
  if p_patch is null or jsonb_typeof(p_patch)<>'object' or p_patch='{}'::jsonb then
    raise exception 'Modifica vuota o non valida';
  end if;
  if exists(select 1 from jsonb_object_keys(p_patch) k where k not in
    ('valore','label','descrizione','is_default','maggiorazione_tipo','maggiorazione_valore',
     'maggiorazione_acquisto','sort_order','attivo','codice','prezzo_vendita','prezzo_acquisto','opzioni')) then
    raise exception 'Campo opzione non ammesso';
  end if;
  if v_bulk then
    if cardinality(p_value_ids) not between 1 and 300 or p_axis_id is not null or p_value_id is not null or
      exists(select 1 from jsonb_object_keys(p_patch) k where k not in
        ('attivo','maggiorazione_tipo','maggiorazione_valore','maggiorazione_acquisto')) then
      raise exception 'Modifica multipla non valida';
    end if;
    select array_agg(distinct x) into v_ids from unnest(p_value_ids) x;
    if (select count(*) from public.article_family_axis_values v
      join public.article_family_axes a on a.id=v.axis_id
      where v.id=any(v_ids) and a.family_id=p_family_id and a.company_id=v_company and v.company_id=v_company)
      <> cardinality(v_ids) then raise exception 'Selezione estranea al prodotto' using errcode='42501'; end if;
    perform 1 from public.article_family_axes a where a.id in
      (select axis_id from public.article_family_axis_values where id=any(v_ids)) order by a.id for update;
  else
    select * into v_axis from public.article_family_axes
      where id=p_axis_id and family_id=p_family_id and company_id=v_company for update;
    if not found then raise exception 'Opzione estranea al prodotto' using errcode='42501'; end if;
    v_ids:=array[coalesce(p_value_id,gen_random_uuid())];
  end if;
  foreach v_id in array v_ids loop
    if v_bulk or p_value_id is not null then
      select * into v_row from public.article_family_axis_values
        where id=v_id and company_id=v_company for update;
      if not found or (not v_bulk and v_row.axis_id<>p_axis_id) then
        raise exception 'Scelta estranea al prodotto' using errcode='42501';
      end if;
    else
      v_row:=null; v_row.id:=v_id; v_row.axis_id:=p_axis_id; v_row.company_id:=v_company;
      v_row.is_default:=false; v_row.attivo:=true; v_row.sort_order:=0;
      v_row.maggiorazione_tipo:='none'; v_row.maggiorazione_valore:=0;
      v_row.maggiorazione_acquisto:=0; v_row.opzioni:='[]'::jsonb; v_row.created_at:=now();
    end if;
    v_row:=jsonb_populate_record(v_row,p_patch);
    if coalesce(btrim(v_row.label),'')='' or coalesce(btrim(v_row.valore),'')='' or
      v_row.attivo is null or v_row.is_default is null or
      (v_row.is_default and not v_row.attivo) then raise exception 'La scelta predefinita deve essere attiva e avere un nome'; end if;
    if v_row.maggiorazione_tipo not in ('none','percentuale','fisso_pz','fisso_mq','fisso_ml','fisso_mc') or
      v_row.maggiorazione_tipo is null or v_row.maggiorazione_valore is null or v_row.maggiorazione_acquisto is null or
      v_row.maggiorazione_valore::text in ('NaN','Infinity','-Infinity') or
      v_row.maggiorazione_acquisto::text in ('NaN','Infinity','-Infinity') or
      (v_row.maggiorazione_tipo='percentuale' and least(v_row.maggiorazione_valore,v_row.maggiorazione_acquisto)<-100) or
      (v_row.maggiorazione_tipo='none' and (v_row.maggiorazione_valore<>0 or v_row.maggiorazione_acquisto<>0)) then
      raise exception 'Supplemento non valido';
    end if;
    if v_row.prezzo_vendita<0 or v_row.prezzo_acquisto<0 or
      v_row.prezzo_vendita::text in ('NaN','Infinity','-Infinity') or
      v_row.prezzo_acquisto::text in ('NaN','Infinity','-Infinity') then raise exception 'Prezzo non valido'; end if;
    if v_row.is_default and not v_bulk then
      update public.article_family_axis_values set is_default=false
        where axis_id=v_row.axis_id and company_id=v_company and id<>v_row.id and is_default;
    end if;
    insert into public.article_family_axis_values select (v_row).*
      on conflict(id) do update set
        valore=excluded.valore,label=excluded.label,descrizione=excluded.descrizione,
        is_default=excluded.is_default,attivo=excluded.attivo,sort_order=excluded.sort_order,
        maggiorazione_tipo=excluded.maggiorazione_tipo,maggiorazione_valore=excluded.maggiorazione_valore,
        maggiorazione_acquisto=excluded.maggiorazione_acquisto,codice=excluded.codice,
        prezzo_vendita=excluded.prezzo_vendita,prezzo_acquisto=excluded.prezzo_acquisto,opzioni=excluded.opzioni;
    v_count:=v_count+1;
  end loop;
  if exists(select 1 from public.article_family_axes a where a.family_id=p_family_id
      and a.id in (select axis_id from public.article_family_axis_values where id=any(v_ids))
      and a.obbligatorio and not exists(select 1 from public.article_family_axis_values v
        where v.axis_id=a.id and v.attivo and v.is_default)) then
    raise exception 'Mantieni una scelta predefinita attiva per ogni opzione obbligatoria';
  end if;
  return jsonb_build_object('aggiornati',v_count);
end;
$fn$;
revoke all on function public.listino_salva_opzioni(uuid,uuid,uuid,jsonb,uuid[]) from public,anon;
grant execute on function public.listino_salva_opzioni(uuid,uuid,uuid,jsonb,uuid[]) to authenticated;

-- Explicit line scope; the existing whole-typology RPC remains backward compatible.
CREATE OR REPLACE FUNCTION public.listino_varianti_linea(p_macrocategoria_id uuid, p_assi jsonb, p_family_ids uuid[])
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
 SET lock_timeout TO '5s'
AS $function$
declare
  v_user uuid := auth.uid();
  v_company uuid;
  v_fv text;
  v_asse jsonb;
  v_chiave text;
  v_nome_asse text;
  v_base text;
  v_allinea boolean;
  v_completa boolean;
  v_obbligatorio boolean;
  v_valore jsonb;
  v_nome text;
  v_k text;
  v_tipo text;
  v_vendita numeric;
  v_acquisto numeric;
  v_attivo boolean;
  v_opzioni jsonb;
  v_voce jsonb;
  v_chiavi text[];
  v_n int;
  v_valori int := 0;
  v_elenchi int := 0;
  v_aggiunti int := 0;
  v_assi_creati int := 0;
  v_senza text;
begin
  if v_user is null then
    raise exception 'Accesso non autenticato' using errcode = '42501';
  end if;
  select company_id, fv_categoria into v_company, v_fv
    from public.listino_macrocategorie where id = p_macrocategoria_id;
  if v_company is null then
    raise exception 'Tipologia non trovata';
  end if;
  if not public.has_permission_for_company(v_user, 'can_edit_settings_pricing', v_company) then
    raise exception 'Non hai il permesso di modificare il listino di questa azienda' using errcode = '42501';
  end if;
  if cardinality(p_family_ids) not between 1 and 500 or p_family_ids is null or
    exists(select 1 from unnest(p_family_ids) id where not exists(
      select 1 from public.article_families f where f.id=id and f.company_id=v_company
        and f.macrocategoria_id=p_macrocategoria_id and f.deleted_at is null and f.attivo)) then
    raise exception 'La selezione non appartiene ai prodotti attivi della tipologia' using errcode='42501';
  end if;
  perform 1 from public.article_family_axes a where a.family_id=any(p_family_ids)
    order by a.id for update;
  if p_assi is null or jsonb_typeof(p_assi) <> 'array' or jsonb_array_length(p_assi) = 0 then
    raise exception 'Nessuna variante da aggiornare';
  end if;

  for v_asse in select * from jsonb_array_elements(p_assi) loop
    v_chiave := public.listino_codice_testo(coalesce(nullif(btrim(v_asse->>'chiave'), ''), v_asse->>'nome'));
    v_nome_asse := coalesce(nullif(btrim(v_asse->>'nome'), ''), v_chiave);
    v_base := nullif(public.listino_codice_testo(v_asse->>'base'), '');
    v_allinea := coalesce((v_asse->>'allinea_base')::boolean, false);
    v_completa := coalesce((v_asse->>'completa')::boolean, false);
    if v_chiave = '' then
      raise exception 'Una variabile senza nome';
    end if;
    if v_chiave in ('linea', 'serie') then
      raise exception 'Le linee si cambiano da «Prezzi delle linee»';
    end if;
    if v_completa and v_fv is not null then
      raise exception 'Nel fotovoltaico le varianti si aggiungono prodotto per prodotto';
    end if;
    if jsonb_typeof(v_asse->'valori') is distinct from 'array' then
      raise exception '«%»: mancano i valori', v_nome_asse;
    end if;

    -- Controlli prima di scrivere.
    v_chiavi := array[]::text[];
    for v_valore in select * from jsonb_array_elements(v_asse->'valori') loop
      v_nome := btrim(coalesce(v_valore->>'nome', ''));
      v_k := public.listino_codice_testo(v_nome);
      if v_k = '' then
        raise exception '«%»: un valore senza nome', v_nome_asse;
      end if;
      if v_k = any(v_chiavi) then
        raise exception '«%»: «%» c''è due volte', v_nome_asse, v_nome;
      end if;
      v_chiavi := v_chiavi || v_k;
      v_tipo := coalesce(v_valore->>'tipo', 'none');
      if v_tipo not in ('none', 'percentuale', 'fisso_pz', 'fisso_mq', 'fisso_ml', 'fisso_mc') then
        raise exception '«%»: maggiorazione «%» non valida', v_nome, v_tipo;
      end if;
      v_vendita := coalesce((v_valore->>'vendita')::numeric, 0);
      v_acquisto := coalesce((v_valore->>'acquisto')::numeric, 0);
      if v_tipo = 'none' and (v_vendita <> 0 or v_acquisto <> 0) then
        raise exception '«%»: scegli come si applica la maggiorazione', v_nome;
      end if;
      if v_tipo = 'percentuale' and (v_vendita <= -100 or v_acquisto <= -100) then
        raise exception '«%» azzererebbe il prezzo', v_nome;
      end if;
      v_opzioni := coalesce(v_valore->'opzioni', '[]'::jsonb);
      if jsonb_typeof(v_opzioni) <> 'array' then
        raise exception '«%»: l''elenco di cosa comprende va scritto come lista', v_nome;
      end if;
      if jsonb_array_length(v_opzioni) > 300 then
        raise exception '«%»: al massimo 300 voci nell''elenco', v_nome;
      end if;
      for v_voce in select * from jsonb_array_elements(v_opzioni) loop
        if jsonb_typeof(v_voce) <> 'string'
           or btrim(v_voce #>> '{}') = ''
           or length(v_voce #>> '{}') > 120 then
          raise exception '«%»: nell''elenco c''è una voce vuota o più lunga di 120 caratteri', v_nome;
        end if;
      end loop;
    end loop;

    -- 1. La variabile nei prodotti che non ce l'hanno.
    if v_completa then
      select coalesce(bool_or(a.obbligatorio), v_base is not null) into v_obbligatorio
        from public.article_family_axes a
        join public.article_families f on f.id = a.family_id
       where f.macrocategoria_id = p_macrocategoria_id and f.company_id = v_company and f.id = any(p_family_ids) and f.attivo
         and f.deleted_at is null
         and coalesce(nullif(public.listino_codice_testo(a.codice), ''), public.listino_codice_testo(a.nome)) = v_chiave;

      insert into public.article_family_axes (family_id, company_id, nome, codice, tipo, obbligatorio, sort_order)
      select f.id, f.company_id, v_nome_asse, v_chiave, 'discrete', v_obbligatorio,
             coalesce((select max(a2.sort_order) + 1 from public.article_family_axes a2 where a2.family_id = f.id), 0)
        from public.article_families f
       where f.macrocategoria_id = p_macrocategoria_id and f.company_id = v_company and f.id = any(p_family_ids) and f.attivo
         and f.deleted_at is null
         and not exists (
           select 1 from public.article_family_axes a
            where a.family_id = f.id
              and coalesce(nullif(public.listino_codice_testo(a.codice), ''), public.listino_codice_testo(a.nome)) = v_chiave
         )
      on conflict (family_id, codice) do nothing;
      get diagnostics v_n = row_count;
      v_assi_creati := v_assi_creati + v_n;
    end if;

    -- 2. I valori, uno per uno: aggiornati dove ci sono, aggiunti dove mancano.
    for v_valore in select * from jsonb_array_elements(v_asse->'valori') loop
      v_nome := btrim(v_valore->>'nome');
      v_k := public.listino_codice_testo(v_nome);
      v_vendita := round(coalesce((v_valore->>'vendita')::numeric, 0), 4);
      v_acquisto := round(coalesce((v_valore->>'acquisto')::numeric, 0), 4);
      v_tipo := case when v_vendita = 0 and v_acquisto = 0 then 'none' else coalesce(v_valore->>'tipo', 'percentuale') end;
      v_attivo := coalesce((v_valore->>'attivo')::boolean, true);
      v_opzioni := coalesce(v_valore->'opzioni', '[]'::jsonb);

      if coalesce((v_valore->>'aggiorna')::boolean, true) then
        update public.article_family_axis_values v
           set maggiorazione_tipo = v_tipo,
               maggiorazione_valore = v_vendita,
               maggiorazione_acquisto = v_acquisto,
               attivo = v_attivo,
               is_default = v.is_default and v_attivo
          from public.article_family_axes a
          join public.article_families f on f.id = a.family_id
         where v.axis_id = a.id
           and f.macrocategoria_id = p_macrocategoria_id and f.company_id = v_company and f.id = any(p_family_ids) and f.attivo
           and f.deleted_at is null
           and coalesce(nullif(public.listino_codice_testo(a.codice), ''), public.listino_codice_testo(a.nome)) = v_chiave
           and public.listino_codice_testo(coalesce(nullif(btrim(v.label), ''), v.valore)) = v_k;
        get diagnostics v_n = row_count;
        v_valori := v_valori + v_n;
      end if;

      if coalesce((v_valore->>'aggiorna_opzioni')::boolean, false) then
        update public.article_family_axis_values v
           set opzioni = v_opzioni
          from public.article_family_axes a
          join public.article_families f on f.id = a.family_id
         where v.axis_id = a.id
           and f.macrocategoria_id = p_macrocategoria_id and f.company_id = v_company and f.id = any(p_family_ids) and f.attivo
           and f.deleted_at is null
           and coalesce(nullif(public.listino_codice_testo(a.codice), ''), public.listino_codice_testo(a.nome)) = v_chiave
           and public.listino_codice_testo(coalesce(nullif(btrim(v.label), ''), v.valore)) = v_k
           and v.opzioni is distinct from v_opzioni;
        get diagnostics v_n = row_count;
        v_elenchi := v_elenchi + v_n;
      end if;

      if v_completa then
        insert into public.article_family_axis_values (
          axis_id, company_id, valore, label, is_default,
          maggiorazione_tipo, maggiorazione_valore, maggiorazione_acquisto, sort_order, attivo, opzioni
        )
        select a.id, a.company_id,
               -- Il codice può essere già di un valore rinominato: allora uno libero.
               case
                 when exists (
                   select 1 from public.article_family_axis_values v3
                    where v3.axis_id = a.id and v3.valore = v_k
                 ) then v_k || '_' || substr(md5(a.id::text || v_k || clock_timestamp()::text), 1, 6)
                 else v_k
               end,
               v_nome, v_attivo and v_k = v_base,
               v_tipo, v_vendita, v_acquisto,
               coalesce((select max(v2.sort_order) + 1 from public.article_family_axis_values v2 where v2.axis_id = a.id), 0),
               v_attivo, v_opzioni
          from public.article_family_axes a
          join public.article_families f on f.id = a.family_id
         where f.macrocategoria_id = p_macrocategoria_id and f.company_id = v_company and f.id = any(p_family_ids) and f.attivo
           and f.deleted_at is null
           and coalesce(nullif(public.listino_codice_testo(a.codice), ''), public.listino_codice_testo(a.nome)) = v_chiave
           and not exists (
             select 1 from public.article_family_axis_values v
              where v.axis_id = a.id
                and public.listino_codice_testo(coalesce(nullif(btrim(v.label), ''), v.valore)) = v_k
           )
        on conflict (axis_id, valore) do nothing;
        get diagnostics v_n = row_count;
        v_aggiunti := v_aggiunti + v_n;
      end if;
    end loop;

    -- 3. Lo stesso valore di serie in tutti i prodotti, se è cambiato.
    if v_allinea and v_base is not null then
      update public.article_family_axis_values v
         set is_default = (public.listino_codice_testo(coalesce(nullif(btrim(v.label), ''), v.valore)) = v_base and v.attivo)
        from public.article_family_axes a
        join public.article_families f on f.id = a.family_id
       where v.axis_id = a.id
         and f.macrocategoria_id = p_macrocategoria_id and f.company_id = v_company and f.id = any(p_family_ids) and f.attivo
         and f.deleted_at is null
         and coalesce(nullif(public.listino_codice_testo(a.codice), ''), public.listino_codice_testo(a.nome)) = v_chiave
         and v.is_default is distinct from
             (public.listino_codice_testo(coalesce(nullif(btrim(v.label), ''), v.valore)) = v_base and v.attivo);

      select f.nome into v_senza
        from public.article_families f
        join public.article_family_axes a on a.family_id = f.id
       where f.macrocategoria_id = p_macrocategoria_id and f.company_id = v_company and f.id = any(p_family_ids) and f.attivo
         and f.deleted_at is null
         and coalesce(nullif(public.listino_codice_testo(a.codice), ''), public.listino_codice_testo(a.nome)) = v_chiave
         and not exists (select 1 from public.article_family_axis_values v where v.axis_id = a.id and v.is_default)
       limit 1;
      if v_senza is not null then
        raise exception '«%» non ha «%» acceso: non può essere il valore di serie di «%»', v_senza, btrim(v_asse->>'base'), v_nome_asse;
      end if;
    end if;

    -- 4. Nessun prodotto con la variabile e tutti i valori spenti.
    select f.nome into v_senza
      from public.article_families f
      join public.article_family_axes a on a.family_id = f.id
     where f.macrocategoria_id = p_macrocategoria_id and f.company_id = v_company and f.id = any(p_family_ids) and f.attivo
       and f.deleted_at is null
       and coalesce(nullif(public.listino_codice_testo(a.codice), ''), public.listino_codice_testo(a.nome)) = v_chiave
       and exists (select 1 from public.article_family_axis_values v where v.axis_id = a.id)
       and not exists (select 1 from public.article_family_axis_values v where v.axis_id = a.id and v.attivo)
     limit 1;
    if v_senza is not null then
      raise exception '«%» resterebbe senza valori accesi in «%»: lasciane acceso almeno uno', v_senza, v_nome_asse;
    end if;
  end loop;

  return jsonb_build_object('valori', v_valori, 'elenchi', v_elenchi, 'aggiunti', v_aggiunti, 'assi', v_assi_creati);
end;
$function$;

revoke all on function public.listino_varianti_linea(uuid,jsonb,uuid[]) from public,anon;
grant execute on function public.listino_varianti_linea(uuid,jsonb,uuid[]) to authenticated;
