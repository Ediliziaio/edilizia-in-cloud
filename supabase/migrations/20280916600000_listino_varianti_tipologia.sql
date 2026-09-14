-- Colori e varianti di una tipologia, decisi una volta sola (14/09/2026).
--
-- Ogni prodotto ha le sue varianti: nel listino di Renova il «Colore fuori
-- standard» valeva +15% sull'alzante e zero sulle altre 22 finestre, e
-- «pellicola solo un lato» esisteva in un prodotto solo. Nel preventivo lo
-- stesso colore costava in un modo o nell'altro a seconda della finestra.
--
-- listino_varianti_tipologia decide una variabile (colore, vetro, rete…) per
-- tutti i prodotti della tipologia: maggiorazione di vendita e di acquisto,
-- acceso o spento, valore di serie, e — se chiesto — la aggiunge ai prodotti
-- che non l'hanno. Le linee restano a listino_prezzi_linee. Tutto o niente.
--
-- import_article_family_template: i modelli pronti non copiavano la
-- maggiorazione sull'acquisto. Una variante a +35% nasceva con il costo
-- invariato, e il margine di quella scelta risultava più alto del vero. Ora
-- l'acquisto segue la vendita quando il modello non lo dice, come per le linee.
--
-- Idempotente: solo CREATE OR REPLACE e GRANT/REVOKE.

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
  v_chiavi text[];
  v_n int;
  v_valori int := 0;
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

      if v_completa then
        insert into public.article_family_axis_values (
          axis_id, company_id, valore, label, is_default,
          maggiorazione_tipo, maggiorazione_valore, maggiorazione_acquisto, sort_order, attivo
        )
        select a.id, a.company_id, v_k, v_nome, v_attivo and v_k = v_base,
               v_tipo, v_vendita, v_acquisto,
               coalesce((select max(v2.sort_order) + 1 from public.article_family_axis_values v2 where v2.axis_id = a.id), 0),
               v_attivo
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

  return jsonb_build_object('valori', v_valori, 'aggiunti', v_aggiunti, 'assi', v_assi_creati);
end;
$$;

revoke all on function public.listino_varianti_tipologia(uuid, jsonb) from public, anon;
grant execute on function public.listino_varianti_tipologia(uuid, jsonb) to authenticated;

-- ─────────────────────────────────────────────────────────────────────────
-- Modelli pronti: la maggiorazione sull'acquisto, il codice, i prezzi propri
-- e lo stato del valore arrivano nel listino come li dice il modello.
-- Il resto della funzione è quello di 20280916500000.
-- ─────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.import_article_family_template(p_template_id uuid, p_company_id uuid, p_macrocategoria_id uuid DEFAULT NULL::uuid, p_nome_override text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_template public.article_family_templates%ROWTYPE;
  v_family_id UUID;
  v_asse JSONB;
  v_axis_id UUID;
  v_value JSONB;
  v_cell JSONB;
  v_user_id UUID := auth.uid();
  v_g JSONB;
  v_xs JSONB; v_ys JSONB; v_m JSONB; v_price JSONB;
  i INT; j INT;
BEGIN
  IF v_user_id IS NULL THEN RAISE EXCEPTION 'unauthenticated'; END IF;
  -- Il super admin lavora dentro l'azienda con «Entra in azienda»: la sua
  -- azienda anagrafica è un'altra (14/09/2026).
  IF public.get_user_company_id(v_user_id) IS DISTINCT FROM p_company_id
     AND NOT public.has_role(v_user_id, 'super_admin'::app_role) THEN
    RAISE EXCEPTION 'not a member of company %', p_company_id USING ERRCODE = '42501';
  END IF;
  IF p_macrocategoria_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.listino_macrocategorie
     WHERE id = p_macrocategoria_id AND company_id = p_company_id
  ) THEN
    RAISE EXCEPTION 'La tipologia scelta non è di questa azienda' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_template FROM public.article_family_templates
  WHERE id = p_template_id AND is_active = true;
  IF NOT FOUND THEN RAISE EXCEPTION 'template % not found or inactive', p_template_id; END IF;

  INSERT INTO public.article_families (
    company_id, vertical, macrocategoria_id, nome, descrizione,
    immagine_url, modalita_prezzo_base, prezzo_base_vendita, vat_rate,
    unit_of_measure, griglia_asse_x_label, griglia_asse_y_label, griglia_unita,
    custom_field_values, attivo
  ) VALUES (
    p_company_id, v_template.vertical_slug, p_macrocategoria_id,
    COALESCE(p_nome_override, v_template.nome), v_template.descrizione,
    v_template.image_url, v_template.modalita_prezzo_base,
    COALESCE(v_template.prezzo_base_vendita, 0), COALESCE(v_template.vat_rate, 22),
    COALESCE(v_template.unit_of_measure, 'pz'),
    COALESCE(v_template.griglia_asse_x_label, 'Larghezza (mm)'),
    COALESCE(v_template.griglia_asse_y_label, 'Altezza (mm)'),
    COALESCE(v_template.griglia_unita, 'mm'),
    COALESCE(v_template.custom_field_defaults, '{}'::jsonb), true
  ) RETURNING id INTO v_family_id;

  -- Assi (varianti) + valori
  FOR v_asse IN SELECT * FROM jsonb_array_elements(COALESCE(v_template.assi_default, '[]'::jsonb))
  LOOP
    INSERT INTO public.article_family_axes (
      family_id, company_id, nome, codice, descrizione, tipo, obbligatorio, sort_order
    ) VALUES (
      v_family_id, p_company_id, v_asse->>'nome', v_asse->>'codice', v_asse->>'descrizione',
      COALESCE(v_asse->>'tipo', 'discrete'), COALESCE((v_asse->>'obbligatorio')::boolean, true),
      COALESCE((v_asse->>'sort_order')::int, 0)
    ) RETURNING id INTO v_axis_id;
    FOR v_value IN SELECT * FROM jsonb_array_elements(COALESCE(v_asse->'values', '[]'::jsonb))
    LOOP
      INSERT INTO public.article_family_axis_values (
        axis_id, company_id, valore, label, descrizione, codice, is_default,
        maggiorazione_tipo, maggiorazione_valore, maggiorazione_acquisto,
        prezzo_vendita, prezzo_acquisto, sort_order, attivo, immagine_url
      ) VALUES (
        v_axis_id, p_company_id, v_value->>'valore', v_value->>'label', v_value->>'descrizione',
        NULLIF(v_value->>'codice', ''),
        COALESCE((v_value->>'is_default')::boolean, false),
        COALESCE(v_value->>'maggiorazione_tipo', 'none'),
        COALESCE((v_value->>'maggiorazione_valore')::numeric, 0),
        -- Una variante in percentuale costa di più anche al fornitore: se il
        -- modello non dice l'acquisto, segue la vendita.
        COALESCE(
          (v_value->>'maggiorazione_acquisto')::numeric,
          CASE WHEN COALESCE(v_value->>'maggiorazione_tipo', 'none') = 'percentuale'
               THEN COALESCE((v_value->>'maggiorazione_valore')::numeric, 0)
               ELSE 0 END
        ),
        NULLIF(v_value->>'prezzo_vendita', '')::numeric,
        NULLIF(v_value->>'prezzo_acquisto', '')::numeric,
        COALESCE((v_value->>'sort_order')::int, 0),
        COALESCE((v_value->>'attivo')::boolean, true),
        v_value->>'immagine_url'
      );
    END LOOP;
  END LOOP;

  -- Griglia prezzi
  v_g := v_template.griglia_default;
  IF v_g IS NOT NULL AND jsonb_typeof(v_g) = 'object' AND (v_g ? 'm') THEN
    -- formato MATRICE compatto
    v_xs := v_g->'xs'; v_ys := v_g->'ys'; v_m := v_g->'m';
    IF v_xs IS NOT NULL AND v_ys IS NOT NULL AND v_m IS NOT NULL THEN
      FOR i IN 0 .. jsonb_array_length(v_ys)-1 LOOP
        FOR j IN 0 .. jsonb_array_length(v_xs)-1 LOOP
          v_price := v_m->i->j;
          IF v_price IS NOT NULL AND jsonb_typeof(v_price) = 'number' THEN
            INSERT INTO public.listino_griglia (company_id, family_id, valore_x, valore_y, prezzo_vendita, prezzo_acquisto)
            VALUES (p_company_id, v_family_id, (v_xs->>j)::int, (v_ys->>i)::int, (v_price#>>'{}')::numeric, 0);
          END IF;
        END LOOP;
      END LOOP;
    END IF;
  ELSIF v_g IS NOT NULL AND jsonb_typeof(v_g) = 'array' THEN
    -- formato array-di-celle (compatibilità)
    FOR v_cell IN SELECT * FROM jsonb_array_elements(v_g)
    LOOP
      IF (v_cell->>'x') IS NOT NULL AND (v_cell->>'y') IS NOT NULL AND (v_cell->>'pv') IS NOT NULL THEN
        INSERT INTO public.listino_griglia (company_id, family_id, valore_x, valore_y, prezzo_vendita, prezzo_acquisto)
        VALUES (p_company_id, v_family_id, (v_cell->>'x')::int, (v_cell->>'y')::int, (v_cell->>'pv')::numeric, COALESCE((v_cell->>'pa')::numeric, 0));
      END IF;
    END LOOP;
  END IF;

  RETURN v_family_id;
END;
$function$;
