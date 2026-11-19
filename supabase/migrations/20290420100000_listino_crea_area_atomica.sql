-- Un'area e tutte le tipologie scelte nascono nella stessa transazione.
-- SECURITY INVOKER: restano attive anche le policy sulle macrocategorie.
set local lock_timeout = '3s';
set local statement_timeout = '60s';

create or replace function public.listino_crea_area(
  p_company_id uuid, p_area text, p_nome_area text, p_tipologia text, p_tipologie jsonb
) returns jsonb language plpgsql security invoker set search_path = public, pg_temp as $$
declare
  v_voce jsonb;
  v_nome text;
  v_base text;
  v_candidato text;
  v_visti text[] := array[]::text[];
  v_macro public.listino_macrocategorie%rowtype;
  v_id uuid;
  v_prima uuid;
  v_ordine integer;
  v_numero integer := 0;
  v_suffisso integer;
  v_riusa boolean;
begin
  if auth.uid() is null or p_company_id is distinct from public.get_effective_company_id()
     or not (public.e_amministratore_di(p_company_id) or public.has_role(auth.uid(), 'super_admin'::public.app_role))
     or public.utente_e_cliente_esterno() then
    raise exception 'Solo un amministratore può creare le aree di questa azienda.' using errcode = '42501';
  end if;
  if p_area is null or p_area !~ '^[a-z0-9_]{1,80}$' or p_area in ('generale','generico','altro')
     or nullif(btrim(p_nome_area),'') is null or length(p_nome_area) > 80
     or nullif(btrim(p_tipologia),'') is null or length(p_tipologia) > 80 then
    raise exception 'Scrivi un nome valido per l''area.' using errcode = '22023';
  end if;
  if jsonb_typeof(p_tipologie) is distinct from 'array' then
    raise exception 'Scegli le tipologie da creare.' using errcode = '22023';
  end if;
  if jsonb_array_length(p_tipologie) not between 1 and 30 then
    raise exception 'Scegli da 1 a 30 tipologie.' using errcode = '22023';
  end if;
  if not pg_try_advisory_xact_lock(hashtextextended('listino_crea_area:' || p_company_id::text, 0)) then
    raise exception 'Un''area è già in creazione. Attendi qualche secondo e riprova.' using errcode = 'PT409';
  end if;
  select coalesce(max(sort_order), 0) + 10 into v_ordine
    from public.listino_macrocategorie where company_id = p_company_id;

  for v_voce in select value from jsonb_array_elements(p_tipologie) loop
    v_base := btrim(v_voce->>'nome');
    if nullif(v_base,'') is null or length(v_base) > 100
       or coalesce(v_voce->>'categoria_tipo','') not in ('principale','accessorio')
       or (v_voce->>'fv_categoria' is not null and
          (p_tipologia <> 'fotovoltaico' or v_voce->>'fv_categoria' not in ('pannello','inverter','accumulo','wallbox','ottimizzatore','struttura','altro'))) then
      raise exception 'Controlla il nome e il tipo di ogni tipologia.' using errcode = '22023';
    end if;
    if lower(v_base) = any(v_visti) then
      raise exception 'Una tipologia è scritta due volte.' using errcode = '22023';
    end if;
    v_visti := array_append(v_visti, lower(v_base));
    v_nome := v_base;
    v_suffisso := 0;
    loop
      select * into v_macro from public.listino_macrocategorie
        where company_id = p_company_id and lower(btrim(nome)) = lower(v_nome) limit 1 for update;
      exit when not found;
      -- Un secondo invio ritrova la stessa tipologia; non la sovrascrive.
      if p_area = any(coalesce(v_macro.verticali_abilitati,array[]::text[])) then
        exit;
      end if;
      v_riusa := cardinality(coalesce(v_macro.verticali_abilitati,array[]::text[])) = 0
        and v_macro.tipologia is null
        and not exists (select 1 from public.article_families f left join public.listino_categorie c on c.id=f.categoria_id
          where f.company_id=p_company_id and (f.macrocategoria_id=v_macro.id or c.macrocategoria_id=v_macro.id));
      exit when v_riusa;
      v_suffisso := v_suffisso + 1;
      v_candidato := v_base || ' ' || btrim(p_nome_area);
      v_nome := v_candidato || case when v_suffisso > 1 then ' ' || v_suffisso::text else '' end;
    end loop;

    if v_macro.id is null then
      insert into public.listino_macrocategorie(company_id,nome,verticali_abilitati,tipologia,categoria_tipo,fv_categoria,sort_order,attivo)
      values(p_company_id,v_nome,array[p_area],p_tipologia,v_voce->>'categoria_tipo',v_voce->>'fv_categoria',v_ordine,true)
      returning id into v_id;
    else
      v_id := v_macro.id;
      if v_riusa then
        update public.listino_macrocategorie set verticali_abilitati=array[p_area],tipologia=p_tipologia,
          categoria_tipo=v_voce->>'categoria_tipo',fv_categoria=v_voce->>'fv_categoria',sort_order=v_ordine,attivo=true
          where id=v_id and company_id=p_company_id;
        if not found then raise exception 'Non puoi aggiornare questa tipologia.' using errcode='42501'; end if;
      end if;
    end if;
    v_prima := coalesce(v_prima,v_id);
    v_numero := v_numero+1;
    v_ordine := v_ordine+10;
    v_riusa := false;
  end loop;
  return jsonb_build_object('prima_id',v_prima,'tipologie',v_numero);
end;
$$;
revoke all on function public.listino_crea_area(uuid,text,text,text,jsonb) from public, anon;
grant execute on function public.listino_crea_area(uuid,text,text,text,jsonb) to authenticated;
notify pgrst, 'reload schema';
