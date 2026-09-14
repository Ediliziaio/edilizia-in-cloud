-- Colori e varianti: un valore si aggiunge anche dove il suo codice è già preso
-- (14/09/2026).
--
-- Nel listino di Renova l'alzante ha «pellicola solo un lato» col codice di
-- «Colore Standard» (colore_standard): rinominato a mano. «Metti i valori
-- mancanti» provava a dare «Colore Standard» all'alzante con lo stesso codice,
-- il vincolo (axis_id, valore) lo scartava in silenzio e il dialog continuava
-- a dire che mancava. Ora il valore nuovo prende un codice libero.
--
-- Il resto della funzione è quello di 20280916710000. Idempotente.

create or replace function public.listino_varianti_tipologia(
  p_macrocategoria_id uuid,
  p_assi jsonb
)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
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
       where f.macrocategoria_id = p_macrocategoria_id
         and f.deleted_at is null
         and coalesce(nullif(public.listino_codice_testo(a.codice), ''), public.listino_codice_testo(a.nome)) = v_chiave;

      insert into public.article_family_axes (family_id, company_id, nome, codice, tipo, obbligatorio, sort_order)
      select f.id, f.company_id, v_nome_asse, v_chiave, 'discrete', v_obbligatorio,
             coalesce((select max(a2.sort_order) + 1 from public.article_family_axes a2 where a2.family_id = f.id), 0)
        from public.article_families f
       where f.macrocategoria_id = p_macrocategoria_id
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
           and f.macrocategoria_id = p_macrocategoria_id
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
           and f.macrocategoria_id = p_macrocategoria_id
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
         where f.macrocategoria_id = p_macrocategoria_id
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
         and f.macrocategoria_id = p_macrocategoria_id
         and f.deleted_at is null
         and coalesce(nullif(public.listino_codice_testo(a.codice), ''), public.listino_codice_testo(a.nome)) = v_chiave
         and v.is_default is distinct from
             (public.listino_codice_testo(coalesce(nullif(btrim(v.label), ''), v.valore)) = v_base and v.attivo);

      select f.nome into v_senza
        from public.article_families f
        join public.article_family_axes a on a.family_id = f.id
       where f.macrocategoria_id = p_macrocategoria_id
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
     where f.macrocategoria_id = p_macrocategoria_id
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
$$;

revoke all on function public.listino_varianti_tipologia(uuid, jsonb) from public, anon;
grant execute on function public.listino_varianti_tipologia(uuid, jsonb) to authenticated;
