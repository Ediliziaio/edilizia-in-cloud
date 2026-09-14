-- Listino: aggiungere una linea, copiare una tipologia, sistemare i prezzi
-- delle linee di UNA tipologia, senza le trappole trovate il 14/09/2026.
--
-- 1. import_article_family_template: il super admin entrato in un'azienda
--    («Entra in azienda») veniva respinto con «not a member of company», e la
--    tipologia di destinazione non si controllava.
-- 2. importa_serie_serramenti: dava la linea anche ai prodotti nel cestino,
--    cercava solo il verticale «serramenti» (l'editor scrive «serramentista»),
--    non controllava la tipologia e poteva creare una seconda linea con lo
--    stesso nome e un altro codice.
-- 3. listino_aggiungi_linea: una linea nuova («Salamander bluEvolution 73»)
--    dentro una tipologia, sugli stessi modelli, con lo scostamento in %.
-- 4. listino_allinea_linee: dà le linee della tipologia ai prodotti che non
--    le hanno (finivano in «Altri articoli»).
-- 5. listino_prezzi_linee: scostamenti, linee spente e prezzo al metro quadro
--    di una sola tipologia. Il dialog di prima valeva per tutta l'azienda,
--    partiva vuoto e spegneva le linee che non si riscrivevano.
-- 6. listino_copia_tipologia: una tipologia con linee, prodotti, varianti,
--    griglie e schede, in un colpo solo e tutto o niente.
--
-- Idempotente: solo CREATE OR REPLACE e GRANT/REVOKE.

-- ─────────────────────────────────────────────────────────────────────────
-- Il nome di una linea come lo confronta il listino (lineeListino.ts,
-- chiaveTesto): «PVC Salamander 76» → «pvc_salamander_76».
-- ─────────────────────────────────────────────────────────────────────────
create or replace function public.listino_codice_testo(p_testo text)
returns text
language sql
immutable
set search_path to 'public'
as $$
  select btrim(
    regexp_replace(
      lower(translate(coalesce(p_testo, ''),
        'àáâãäåèéêëìíîïòóôõöùúûüýÿçñÀÁÂÃÄÅÈÉÊËÌÍÎÏÒÓÔÕÖÙÚÛÜÝÇÑ',
        'aaaaaaeeeeiiiiooooouuuuyycnAAAAAAEEEEIIIIOOOOOUUUUYCN')),
      '[^a-z0-9]+', '_', 'g'),
    '_');
$$;

revoke all on function public.listino_codice_testo(text) from public, anon;
grant execute on function public.listino_codice_testo(text) to authenticated;

-- ─────────────────────────────────────────────────────────────────────────
-- 1. Modelli pronti: il super admin dentro l'azienda può importarli.
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
        axis_id, company_id, valore, label, descrizione, is_default,
        maggiorazione_tipo, maggiorazione_valore, sort_order, attivo, immagine_url
      ) VALUES (
        v_axis_id, p_company_id, v_value->>'valore', v_value->>'label', v_value->>'descrizione',
        COALESCE((v_value->>'is_default')::boolean, false),
        COALESCE(v_value->>'maggiorazione_tipo', 'none'),
        COALESCE((v_value->>'maggiorazione_valore')::numeric, 0),
        COALESCE((v_value->>'sort_order')::int, 0), true, v_value->>'immagine_url'
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

-- ─────────────────────────────────────────────────────────────────────────
-- 2. Serie di profilo dalla libreria.
-- ─────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.importa_serie_serramenti(p_serie_id uuid, p_company_id uuid, p_macrocategoria_id uuid DEFAULT NULL::uuid, p_prezzo_vendita_mq numeric DEFAULT NULL::numeric, p_prezzo_acquisto_mq numeric DEFAULT NULL::numeric, p_differenza_pct numeric DEFAULT NULL::numeric, p_installa_mancanti boolean DEFAULT true)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_user uuid := auth.uid();
  v_super boolean;
  v_serie public.serramenti_serie%rowtype;
  v_marca public.serramenti_marche%rowtype;
  v_linea_nome text;
  v_linea_valore text;
  v_diff numeric;
  v_tpl record;
  v_family_id uuid;
  v_axis_id uuid;
  v_value_id uuid;
  v_create int := 0;
  v_aggiornate int := 0;
  v_ha_default boolean;
begin
  if v_user is null then raise exception 'unauthenticated'; end if;
  v_super := public.has_role(v_user, 'super_admin'::app_role);
  if not v_super and public.get_user_company_id(v_user) is distinct from p_company_id then
    raise exception 'not a member of company %', p_company_id using errcode = '42501';
  end if;
  if p_macrocategoria_id is not null and not exists (
    select 1 from public.listino_macrocategorie
     where id = p_macrocategoria_id and company_id = p_company_id
  ) then
    raise exception 'La tipologia scelta non è di questa azienda' using errcode = '42501';
  end if;

  select * into v_serie from public.serramenti_serie where id = p_serie_id and is_active;
  if not found then raise exception 'serie % non trovata', p_serie_id; end if;
  select * into v_marca from public.serramenti_marche where id = v_serie.marca_id;

  v_linea_nome := v_marca.nome || ' ' || v_serie.nome;
  v_linea_valore := v_marca.slug || '_' || v_serie.slug;
  v_diff := coalesce(p_differenza_pct, v_serie.differenza_pct, 0);

  for v_tpl in
    select t.* from public.article_family_templates t
     where t.is_active
       and t.vertical_slug = 'serramenti'
       and t.categoria_slug = 'infissi'
       and (cardinality(v_serie.tipologie_incluse) = 0
            or t.tipologia = any (v_serie.tipologie_incluse))
     order by t.sort_order, t.nome
  loop
    -- Il prodotto dell'azienda con lo stesso nome del modello: non quello nel
    -- cestino, e con il verticale scritto in uno dei modi in cui compare.
    select id into v_family_id
      from public.article_families
     where company_id = p_company_id
       and vertical in ('serramenti', 'serramentista', 'serramentisti', 'infissi')
       and nome = v_tpl.nome
       and deleted_at is null
     order by attivo desc, created_at
     limit 1;

    if v_family_id is null then
      if not p_installa_mancanti then continue; end if;
      v_family_id := public.import_article_family_template(
        v_tpl.id, p_company_id, p_macrocategoria_id, null);
      v_create := v_create + 1;
    else
      v_aggiornate := v_aggiornate + 1;
    end if;

    if p_prezzo_vendita_mq is not null then
      update public.article_families
         set modalita_prezzo_base = 'mq',
             prezzo_base_mode = 'vendita',
             prezzo_base_vendita = p_prezzo_vendita_mq,
             prezzo_base_acquisto = coalesce(p_prezzo_acquisto_mq, prezzo_base_acquisto),
             unit_of_measure = 'mq',
             updated_at = now()
       where id = v_family_id
         and (prezzo_base_vendita is null or prezzo_base_vendita = 0);
    end if;

    select id into v_axis_id from public.article_family_axes
     where family_id = v_family_id and codice = 'linea' limit 1;
    if v_axis_id is null then
      insert into public.article_family_axes
        (family_id, company_id, nome, codice, descrizione, tipo, obbligatorio, sort_order)
      values (v_family_id, p_company_id, 'Linea', 'linea',
              'Il modello di profilo. La prima linea è quella di base; le altre si scostano in percentuale.',
              'discrete', true, -1)
      returning id into v_axis_id;
    end if;

    select exists (
      select 1 from public.article_family_axis_values
       where axis_id = v_axis_id and attivo and is_default and valore <> 'linea_base'
    ) into v_ha_default;

    -- Stesso codice, oppure stesso nome scritto in un altro modo: una linea
    -- sola, non due linguette uguali.
    select id into v_value_id from public.article_family_axis_values
     where axis_id = v_axis_id
       and (valore = v_linea_valore
            or public.listino_codice_testo(coalesce(nullif(btrim(label), ''), valore))
               = public.listino_codice_testo(v_linea_nome))
     order by (valore = v_linea_valore) desc
     limit 1;

    if v_value_id is null then
      insert into public.article_family_axis_values
        (axis_id, company_id, valore, label, is_default, maggiorazione_tipo,
         maggiorazione_valore, maggiorazione_acquisto, sort_order, attivo, immagine_url)
      values (v_axis_id, p_company_id, v_linea_valore, v_linea_nome,
              not v_ha_default,
              case when v_diff = 0 then 'none' else 'percentuale' end,
              v_diff, v_diff,
              coalesce((select max(sort_order) + 1 from public.article_family_axis_values
                         where axis_id = v_axis_id), 0),
              true, v_serie.immagine_url);
    else
      update public.article_family_axis_values
         set label = v_linea_nome,
             maggiorazione_tipo = case when v_diff = 0 then 'none' else 'percentuale' end,
             maggiorazione_valore = v_diff,
             maggiorazione_acquisto = v_diff,
             immagine_url = coalesce(v_serie.immagine_url, immagine_url),
             attivo = true
       where id = v_value_id;
    end if;

    update public.article_family_axis_values
       set attivo = false, is_default = false
     where axis_id = v_axis_id and valore = 'linea_base'
       and exists (select 1 from public.article_family_axis_values v2
                    where v2.axis_id = v_axis_id and v2.attivo and v2.valore <> 'linea_base');
  end loop;

  return jsonb_build_object(
    'serie', v_linea_nome,
    'linea', v_linea_valore,
    'differenza_pct', v_diff,
    'tipologie_create', v_create,
    'tipologie_aggiornate', v_aggiornate
  );
end;
$function$;

-- ─────────────────────────────────────────────────────────────────────────
-- 3. Una linea nuova dentro una tipologia.
--
-- Stessi modelli, altro prezzo: il valore va sull'asse «Linea» di ogni
-- prodotto della tipologia. Se la tipologia non ha ancora linee serve anche
-- il nome di quella che ha adesso, che diventa la linea di base (0%).
-- p_copia_da: la linea da cui prendere foto e descrizione del valore.
-- ─────────────────────────────────────────────────────────────────────────
create or replace function public.listino_aggiungi_linea(
  p_macrocategoria_id uuid,
  p_nome text,
  p_scostamento_pct numeric default 0,
  p_nome_base text default null,
  p_copia_da text default null,
  p_immagine_url text default null
)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_user uuid := auth.uid();
  v_company uuid;
  v_nome text := btrim(coalesce(p_nome, ''));
  v_nome_base text := nullif(btrim(coalesce(p_nome_base, '')), '');
  v_chiave text;
  v_chiave_base text;
  v_chiave_origine text := nullif(public.listino_codice_testo(p_copia_da), '');
  v_pct numeric := round(coalesce(p_scostamento_pct, 0), 4);
  v_con_linee int;
  v_fam record;
  v_axis_id uuid;
  v_value_id uuid;
  v_value_attivo boolean;
  v_img text;
  v_desc text;
  v_valore text;
  v_n int;
  v_aggiunte int := 0;
  v_riattivate int := 0;
  v_gia int := 0;
  v_saltati int := 0;
begin
  if v_user is null then
    raise exception 'Accesso non autenticato' using errcode = '42501';
  end if;
  select company_id into v_company from public.listino_macrocategorie where id = p_macrocategoria_id;
  if v_company is null then
    raise exception 'Tipologia non trovata';
  end if;
  if not public.has_permission_for_company(v_user, 'can_edit_settings_pricing', v_company) then
    raise exception 'Non hai il permesso di modificare il listino di questa azienda' using errcode = '42501';
  end if;

  v_chiave := public.listino_codice_testo(v_nome);
  if v_chiave = '' then
    raise exception 'Scrivi il nome della linea';
  end if;
  if v_pct <= -100 then
    raise exception 'Uno scostamento di % per cento azzera il prezzo', v_pct;
  end if;

  select count(*) into v_con_linee
    from public.article_families f
   where f.macrocategoria_id = p_macrocategoria_id
     and f.deleted_at is null
     and exists (
       select 1
         from public.article_family_axes a
         join public.article_family_axis_values v on v.axis_id = a.id and v.attivo
        where a.family_id = f.id
          and (public.listino_codice_testo(a.codice) in ('linea', 'serie')
               or public.listino_codice_testo(a.nome) in ('linea', 'serie')));

  if v_con_linee = 0 then
    if v_nome_base is null then
      raise exception 'Questa tipologia non ha ancora linee: scrivi anche il nome della linea che ha adesso';
    end if;
    v_chiave_base := public.listino_codice_testo(v_nome_base);
    if v_chiave_base = '' then
      raise exception 'Scrivi il nome della linea che la tipologia ha adesso';
    end if;
    if v_chiave_base = v_chiave then
      raise exception 'La linea nuova e quella che c''è già hanno lo stesso nome';
    end if;
  end if;

  for v_fam in
    select f.id
      from public.article_families f
     where f.macrocategoria_id = p_macrocategoria_id
       and f.deleted_at is null
     order by f.nome
  loop
    select a.id into v_axis_id
      from public.article_family_axes a
     where a.family_id = v_fam.id
       and (public.listino_codice_testo(a.codice) in ('linea', 'serie')
            or public.listino_codice_testo(a.nome) in ('linea', 'serie'))
     order by (public.listino_codice_testo(a.codice) = 'linea') desc, a.sort_order
     limit 1;

    if v_con_linee > 0 then
      -- La tipologia ha già le sue linee: un prodotto senza resta com'è
      -- (le riceve tutte insieme da listino_allinea_linee).
      if v_axis_id is null or not exists (
        select 1 from public.article_family_axis_values where axis_id = v_axis_id and attivo
      ) then
        v_saltati := v_saltati + 1;
        continue;
      end if;
    else
      -- Prima linea della tipologia: nasce l'asse, con la linea di adesso come base.
      if v_axis_id is null then
        insert into public.article_family_axes
          (family_id, company_id, nome, codice, descrizione, tipo, obbligatorio, sort_order)
        values (v_fam.id, v_company, 'Linea', 'linea',
                'La linea del prodotto: quella di base e le altre, che si scostano in percentuale.',
                'discrete', true, -1)
        returning id into v_axis_id;
      end if;

      select id into v_value_id
        from public.article_family_axis_values
       where axis_id = v_axis_id
         and public.listino_codice_testo(coalesce(nullif(btrim(label), ''), valore)) = v_chiave_base
       limit 1;
      if v_value_id is null then
        v_valore := v_chiave_base;
        v_n := 1;
        while exists (select 1 from public.article_family_axis_values where axis_id = v_axis_id and valore = v_valore) loop
          v_n := v_n + 1;
          v_valore := v_chiave_base || '_' || v_n;
        end loop;
        insert into public.article_family_axis_values
          (axis_id, company_id, valore, label, is_default, maggiorazione_tipo,
           maggiorazione_valore, maggiorazione_acquisto, sort_order, attivo)
        values (v_axis_id, v_company, v_valore, v_nome_base, true, 'none', 0, 0, 0, true)
        returning id into v_value_id;
      else
        update public.article_family_axis_values
           set attivo = true, is_default = true, label = v_nome_base,
               maggiorazione_tipo = 'none', maggiorazione_valore = 0, maggiorazione_acquisto = 0
         where id = v_value_id;
      end if;
      update public.article_family_axis_values
         set is_default = false
       where axis_id = v_axis_id and id <> v_value_id and is_default;
    end if;

    v_value_id := null;
    v_value_attivo := null;
    select id, attivo into v_value_id, v_value_attivo
      from public.article_family_axis_values
     where axis_id = v_axis_id
       and public.listino_codice_testo(coalesce(nullif(btrim(label), ''), valore)) = v_chiave
     limit 1;

    v_img := null;
    v_desc := null;
    if v_chiave_origine is not null then
      select immagine_url, descrizione into v_img, v_desc
        from public.article_family_axis_values
       where axis_id = v_axis_id
         and public.listino_codice_testo(coalesce(nullif(btrim(label), ''), valore)) = v_chiave_origine
       limit 1;
    end if;

    if v_value_id is not null then
      if v_value_attivo then
        v_gia := v_gia + 1;
      else
        update public.article_family_axis_values
           set attivo = true,
               label = v_nome,
               maggiorazione_tipo = case when v_pct = 0 then 'none' else 'percentuale' end,
               maggiorazione_valore = v_pct,
               maggiorazione_acquisto = v_pct,
               immagine_url = coalesce(p_immagine_url, v_img, immagine_url)
         where id = v_value_id;
        v_riattivate := v_riattivate + 1;
      end if;
    else
      v_valore := v_chiave;
      v_n := 1;
      while exists (select 1 from public.article_family_axis_values where axis_id = v_axis_id and valore = v_valore) loop
        v_n := v_n + 1;
        v_valore := v_chiave || '_' || v_n;
      end loop;
      insert into public.article_family_axis_values
        (axis_id, company_id, valore, label, descrizione, is_default, maggiorazione_tipo,
         maggiorazione_valore, maggiorazione_acquisto, sort_order, attivo, immagine_url)
      values (v_axis_id, v_company, v_valore, v_nome, v_desc, false,
              case when v_pct = 0 then 'none' else 'percentuale' end,
              v_pct, v_pct,
              coalesce((select max(sort_order) + 1 from public.article_family_axis_values where axis_id = v_axis_id), 0),
              true, coalesce(p_immagine_url, v_img));
      v_aggiunte := v_aggiunte + 1;
    end if;
  end loop;

  if v_aggiunte + v_riattivate + v_gia = 0 then
    raise exception 'Nessun prodotto a cui dare la linea: la tipologia è vuota';
  end if;

  return jsonb_build_object(
    'linea', v_nome,
    'aggiunte', v_aggiunte,
    'riattivate', v_riattivate,
    'gia_presenti', v_gia,
    'saltati', v_saltati
  );
end;
$$;

revoke all on function public.listino_aggiungi_linea(uuid, text, numeric, text, text, text) from public, anon;
grant execute on function public.listino_aggiungi_linea(uuid, text, numeric, text, text, text) to authenticated;

-- ─────────────────────────────────────────────────────────────────────────
-- 4. Le linee della tipologia ai prodotti che non le hanno.
-- Il modello: il prodotto con più linee attive.
-- ─────────────────────────────────────────────────────────────────────────
create or replace function public.listino_allinea_linee(p_macrocategoria_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_user uuid := auth.uid();
  v_company uuid;
  v_rif_axis uuid;
  v_fam record;
  v_axis_id uuid;
  v_val record;
  v_chiave text;
  v_valore text;
  v_n int;
  v_prodotti int := 0;
  v_linee int := 0;
begin
  if v_user is null then
    raise exception 'Accesso non autenticato' using errcode = '42501';
  end if;
  select company_id into v_company from public.listino_macrocategorie where id = p_macrocategoria_id;
  if v_company is null then
    raise exception 'Tipologia non trovata';
  end if;
  if not public.has_permission_for_company(v_user, 'can_edit_settings_pricing', v_company) then
    raise exception 'Non hai il permesso di modificare il listino di questa azienda' using errcode = '42501';
  end if;

  select a.id into v_rif_axis
    from public.article_family_axes a
    join public.article_families f on f.id = a.family_id
    join public.article_family_axis_values v on v.axis_id = a.id and v.attivo
   where f.macrocategoria_id = p_macrocategoria_id
     and f.deleted_at is null
     and (public.listino_codice_testo(a.codice) in ('linea', 'serie')
          or public.listino_codice_testo(a.nome) in ('linea', 'serie'))
   group by a.id, f.nome
   order by count(*) desc, f.nome
   limit 1;
  if v_rif_axis is null then
    raise exception 'Nessun prodotto di questa tipologia ha delle linee da copiare';
  end if;
  select count(*) into v_linee from public.article_family_axis_values where axis_id = v_rif_axis and attivo;

  for v_fam in
    select f.id
      from public.article_families f
     where f.macrocategoria_id = p_macrocategoria_id
       and f.deleted_at is null
       and not exists (
         select 1
           from public.article_family_axes a
           join public.article_family_axis_values v on v.axis_id = a.id and v.attivo
          where a.family_id = f.id
            and (public.listino_codice_testo(a.codice) in ('linea', 'serie')
                 or public.listino_codice_testo(a.nome) in ('linea', 'serie')))
  loop
    select a.id into v_axis_id
      from public.article_family_axes a
     where a.family_id = v_fam.id
       and (public.listino_codice_testo(a.codice) in ('linea', 'serie')
            or public.listino_codice_testo(a.nome) in ('linea', 'serie'))
     limit 1;
    if v_axis_id is null then
      insert into public.article_family_axes
        (family_id, company_id, nome, codice, descrizione, tipo, obbligatorio, sort_order)
      select v_fam.id, v_company, a.nome, a.codice, a.descrizione, a.tipo, a.obbligatorio, a.sort_order
        from public.article_family_axes a
       where a.id = v_rif_axis
      returning id into v_axis_id;
    end if;

    for v_val in
      select * from public.article_family_axis_values where axis_id = v_rif_axis and attivo order by sort_order
    loop
      v_chiave := public.listino_codice_testo(coalesce(nullif(btrim(v_val.label), ''), v_val.valore));
      if exists (
        select 1 from public.article_family_axis_values
         where axis_id = v_axis_id
           and public.listino_codice_testo(coalesce(nullif(btrim(label), ''), valore)) = v_chiave
      ) then
        update public.article_family_axis_values
           set attivo = true,
               is_default = v_val.is_default,
               maggiorazione_tipo = v_val.maggiorazione_tipo,
               maggiorazione_valore = v_val.maggiorazione_valore,
               maggiorazione_acquisto = v_val.maggiorazione_acquisto
         where axis_id = v_axis_id
           and public.listino_codice_testo(coalesce(nullif(btrim(label), ''), valore)) = v_chiave;
      else
        v_valore := v_val.valore;
        v_n := 1;
        while exists (select 1 from public.article_family_axis_values where axis_id = v_axis_id and valore = v_valore) loop
          v_n := v_n + 1;
          v_valore := v_val.valore || '_' || v_n;
        end loop;
        insert into public.article_family_axis_values
          (axis_id, company_id, valore, label, descrizione, is_default, maggiorazione_tipo,
           maggiorazione_valore, maggiorazione_acquisto, sort_order, attivo, prezzo_vendita,
           prezzo_acquisto, immagine_url)
        values (v_axis_id, v_company, v_valore, v_val.label, v_val.descrizione, v_val.is_default,
                v_val.maggiorazione_tipo, v_val.maggiorazione_valore, v_val.maggiorazione_acquisto,
                v_val.sort_order, true, v_val.prezzo_vendita, v_val.prezzo_acquisto, v_val.immagine_url);
      end if;
    end loop;
    v_prodotti := v_prodotti + 1;
  end loop;

  return jsonb_build_object('prodotti', v_prodotti, 'linee', v_linee);
end;
$$;

revoke all on function public.listino_allinea_linee(uuid) from public, anon;
grant execute on function public.listino_allinea_linee(uuid) to authenticated;

-- ─────────────────────────────────────────────────────────────────────────
-- 5. Scostamenti e prezzo al metro quadro delle linee di una tipologia.
--
-- p_linee: [{ "nome": "PVC Salamander 76", "pct": 0, "attiva": true }, …]
-- La prima linea attiva a 0% diventa quella proposta nel preventivo. Il
-- prezzo al mq tocca solo i prodotti venduti a metro quadro.
-- ─────────────────────────────────────────────────────────────────────────
create or replace function public.listino_prezzi_linee(
  p_macrocategoria_id uuid,
  p_linee jsonb,
  p_prezzo_vendita_mq numeric default null,
  p_prezzo_acquisto_mq numeric default null
)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_user uuid := auth.uid();
  v_company uuid;
  v_linea jsonb;
  v_chiave text;
  v_pct numeric;
  v_attiva boolean;
  v_base text;
  v_attive int := 0;
  v_n int;
  v_valori int := 0;
  v_prodotti int := 0;
  v_senza text;
begin
  if v_user is null then
    raise exception 'Accesso non autenticato' using errcode = '42501';
  end if;
  select company_id into v_company from public.listino_macrocategorie where id = p_macrocategoria_id;
  if v_company is null then
    raise exception 'Tipologia non trovata';
  end if;
  if not public.has_permission_for_company(v_user, 'can_edit_settings_pricing', v_company) then
    raise exception 'Non hai il permesso di modificare il listino di questa azienda' using errcode = '42501';
  end if;
  if p_linee is null or jsonb_typeof(p_linee) <> 'array' or jsonb_array_length(p_linee) = 0 then
    raise exception 'Nessuna linea da aggiornare';
  end if;
  if p_prezzo_vendita_mq is not null and p_prezzo_vendita_mq <= 0 then
    raise exception 'Il prezzo di vendita al metro quadro deve essere maggiore di zero';
  end if;
  if p_prezzo_acquisto_mq is not null and p_prezzo_acquisto_mq < 0 then
    raise exception 'Il prezzo di acquisto non può essere negativo';
  end if;

  for v_linea in select * from jsonb_array_elements(p_linee) loop
    v_pct := coalesce((v_linea->>'pct')::numeric, 0);
    if v_pct <= -100 then
      raise exception 'La linea «%» azzera il prezzo', v_linea->>'nome';
    end if;
    if coalesce((v_linea->>'attiva')::boolean, true) then
      v_attive := v_attive + 1;
      if v_base is null and v_pct = 0 then
        v_base := public.listino_codice_testo(v_linea->>'nome');
      end if;
    end if;
  end loop;
  if v_attive = 0 then
    raise exception 'Serve almeno una linea attiva';
  end if;

  for v_linea in select * from jsonb_array_elements(p_linee) loop
    v_chiave := public.listino_codice_testo(v_linea->>'nome');
    v_pct := round(coalesce((v_linea->>'pct')::numeric, 0), 4);
    v_attiva := coalesce((v_linea->>'attiva')::boolean, true);
    update public.article_family_axis_values v
       set maggiorazione_tipo = case when v_pct = 0 then 'none' else 'percentuale' end,
           maggiorazione_valore = v_pct,
           maggiorazione_acquisto = v_pct,
           attivo = v_attiva,
           is_default = case
             when v_base is null then v.is_default and v_attiva
             else v_attiva and v_chiave = v_base
           end
      from public.article_family_axes a
      join public.article_families f on f.id = a.family_id
     where v.axis_id = a.id
       and f.macrocategoria_id = p_macrocategoria_id
       and f.deleted_at is null
       and (public.listino_codice_testo(a.codice) in ('linea', 'serie')
            or public.listino_codice_testo(a.nome) in ('linea', 'serie'))
       and public.listino_codice_testo(coalesce(nullif(btrim(v.label), ''), v.valore)) = v_chiave;
    get diagnostics v_n = row_count;
    v_valori := v_valori + v_n;
  end loop;

  -- Un prodotto non può restare con l'asse delle linee e nessuna linea accesa.
  select f.nome into v_senza
    from public.article_families f
    join public.article_family_axes a on a.family_id = f.id
   where f.macrocategoria_id = p_macrocategoria_id
     and f.deleted_at is null
     and (public.listino_codice_testo(a.codice) in ('linea', 'serie')
          or public.listino_codice_testo(a.nome) in ('linea', 'serie'))
     and exists (select 1 from public.article_family_axis_values v where v.axis_id = a.id)
     and not exists (select 1 from public.article_family_axis_values v where v.axis_id = a.id and v.attivo)
   limit 1;
  if v_senza is not null then
    raise exception '«%» resterebbe senza linee accese: lasciane accesa almeno una', v_senza;
  end if;

  if p_prezzo_vendita_mq is not null or p_prezzo_acquisto_mq is not null then
    update public.article_families f
       set prezzo_base_vendita = coalesce(p_prezzo_vendita_mq, f.prezzo_base_vendita),
           prezzo_base_acquisto = coalesce(p_prezzo_acquisto_mq, f.prezzo_base_acquisto),
           prezzo_base_mode = case when p_prezzo_vendita_mq is not null then 'vendita' else f.prezzo_base_mode end,
           updated_at = now()
     where f.macrocategoria_id = p_macrocategoria_id
       and f.deleted_at is null
       and f.modalita_prezzo_base = 'mq';
    get diagnostics v_prodotti = row_count;
  end if;

  return jsonb_build_object('valori', v_valori, 'prodotti_prezzo', v_prodotti);
end;
$$;

revoke all on function public.listino_prezzi_linee(uuid, jsonb, numeric, numeric) from public, anon;
grant execute on function public.listino_prezzi_linee(uuid, jsonb, numeric, numeric) to authenticated;

-- ─────────────────────────────────────────────────────────────────────────
-- 6. Copia di una tipologia.
--
-- Il nome di un prodotto è unico nell'azienda (per verticale, fra i prodotti
-- attivi senza categoria): per copiare i prodotti serve un testo da aggiungere
-- ai nomi, per esempio il materiale. p_variazione_pct cambia prezzo base e
-- griglie della copia (+10 = 10% in più), acquisto compreso.
-- Le tipologie del fotovoltaico non si copiano: ognuna è uno slot del
-- configuratore, e il trigger ne proietterebbe i prodotti due volte.
-- ─────────────────────────────────────────────────────────────────────────
create or replace function public.listino_copia_tipologia(
  p_macrocategoria_id uuid,
  p_nome text,
  p_suffisso_prodotti text default null,
  p_variazione_pct numeric default 0,
  p_con_prodotti boolean default true
)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_user uuid := auth.uid();
  v_src public.listino_macrocategorie%rowtype;
  v_nome text := btrim(coalesce(p_nome, ''));
  v_suffisso text := nullif(btrim(coalesce(p_suffisso_prodotti, '')), '');
  v_k numeric := 1 + coalesce(p_variazione_pct, 0) / 100.0;
  v_new_macro uuid;
  v_new_cat uuid;
  v_new_fam uuid;
  v_new_ax uuid;
  v_cat record;
  v_fam public.article_families%rowtype;
  v_ax record;
  v_mappa_cat jsonb := '{}'::jsonb;
  v_conflitto text;
  v_prodotti int := 0;
  v_linee int := 0;
  v_schede int := 0;
begin
  if v_user is null then
    raise exception 'Accesso non autenticato' using errcode = '42501';
  end if;
  select * into v_src from public.listino_macrocategorie where id = p_macrocategoria_id;
  if not found then
    raise exception 'Tipologia non trovata';
  end if;
  -- Come la regola che lascia creare le tipologie: amministratore o super admin.
  if not (
    public.has_role(v_user, 'super_admin'::app_role)
    or (public.has_role(v_user, 'company_admin'::app_role)
        and public.get_user_company_id(v_user) = v_src.company_id)
    or exists (
      select 1 from public.multi_company_access mca
       where mca.user_id = v_user
         and mca.company_id = v_src.company_id
         and mca.status = 'active'
         and (mca.expires_at is null or mca.expires_at > now())
         and mca.access_role::text = 'company_admin')
  ) then
    raise exception 'Solo l''amministratore dell''azienda può copiare una tipologia' using errcode = '42501';
  end if;
  if v_nome = '' then
    raise exception 'Scrivi il nome della nuova tipologia';
  end if;
  if exists (
    select 1 from public.listino_macrocategorie
     where company_id = v_src.company_id and lower(btrim(nome)) = lower(v_nome)
  ) then
    raise exception 'Esiste già una tipologia «%»', v_nome;
  end if;
  if v_src.fv_categoria is not null then
    raise exception 'Le tipologie del fotovoltaico non si copiano: ognuna è un componente del configuratore';
  end if;
  if v_k <= 0 then
    raise exception 'La variazione di prezzo azzera i prezzi';
  end if;

  if p_con_prodotti then
    select f.nome || coalesce(' ' || v_suffisso, '') into v_conflitto
      from public.article_families f
     where f.macrocategoria_id = v_src.id
       and f.deleted_at is null
       and exists (
         select 1 from public.article_families g
          where g.company_id = f.company_id
            and g.vertical = f.vertical
            and g.deleted_at is null
            and g.attivo
            and g.categoria_id is null
            and g.nome = f.nome || coalesce(' ' || v_suffisso, ''))
     order by f.nome
     limit 1;
    if v_conflitto is not null then
      raise exception 'Esiste già un prodotto «%»: aggiungi ai nomi dei prodotti un testo che li distingua, per esempio il materiale', v_conflitto;
    end if;
  end if;

  insert into public.listino_macrocategorie
    (company_id, nome, descrizione, icona, colore, sort_order, attivo, verticali_abilitati,
     immagine_url, descrizione_estesa, mostra_pagina_dedicata_pdf, categoria_tipo, tipologia, fv_categoria)
  values
    (v_src.company_id, v_nome, v_src.descrizione, v_src.icona, v_src.colore,
     coalesce(v_src.sort_order, 0) + 1, v_src.attivo, v_src.verticali_abilitati,
     v_src.immagine_url, v_src.descrizione_estesa, v_src.mostra_pagina_dedicata_pdf,
     v_src.categoria_tipo, v_src.tipologia, null)
  returning id into v_new_macro;

  for v_cat in
    select * from public.listino_categorie where macrocategoria_id = v_src.id order by sort_order, nome
  loop
    insert into public.listino_categorie
      (company_id, nome, colore, icona, margine_target_percentuale, sort_order, macrocategoria_id,
       descrizione, immagine_url)
    values
      (v_src.company_id, v_cat.nome, v_cat.colore, v_cat.icona, v_cat.margine_target_percentuale,
       v_cat.sort_order, v_new_macro, v_cat.descrizione, v_cat.immagine_url)
    returning id into v_new_cat;
    v_mappa_cat := v_mappa_cat || jsonb_build_object(v_cat.id::text, v_new_cat::text);
    v_linee := v_linee + 1;
  end loop;

  if p_con_prodotti then
    for v_fam in
      select * from public.article_families
       where macrocategoria_id = v_src.id and deleted_at is null
       order by sort_order, nome
    loop
      insert into public.article_families
        (company_id, vertical, categoria_id, nome, descrizione, immagine_url, pdf_scheda_url,
         modalita_prezzo_base, prezzo_base_vendita, prezzo_base_acquisto, vat_rate, unit_of_measure,
         posa_tariffa_default_id, posa_quantita_default, griglia_asse_x_label, griglia_asse_y_label,
         griglia_unita, attivo, sort_order, custom_field_values, posa_linked, supplier_id,
         prezzo_base_mode, markup_tipo, markup_valore, vat_rate_acquisto, sconto_fornitore_1,
         sconto_fornitore_2, manodopera_modalita, manodopera_costo_acquisto, manodopera_prezzo_vendita,
         manodopera_unita, macrocategoria_id, codice, mostra_preventivo)
      values
        (v_src.company_id, v_fam.vertical,
         case when v_fam.categoria_id is null then null else (v_mappa_cat ->> v_fam.categoria_id::text)::uuid end,
         v_fam.nome || coalesce(' ' || v_suffisso, ''), v_fam.descrizione, v_fam.immagine_url,
         v_fam.pdf_scheda_url, v_fam.modalita_prezzo_base,
         case when v_fam.prezzo_base_vendita is null then null else round(v_fam.prezzo_base_vendita * v_k, 2) end,
         case when v_fam.prezzo_base_acquisto is null then null else round(v_fam.prezzo_base_acquisto * v_k, 2) end,
         v_fam.vat_rate, v_fam.unit_of_measure, v_fam.posa_tariffa_default_id, v_fam.posa_quantita_default,
         v_fam.griglia_asse_x_label, v_fam.griglia_asse_y_label, v_fam.griglia_unita, v_fam.attivo,
         v_fam.sort_order, v_fam.custom_field_values, v_fam.posa_linked, v_fam.supplier_id,
         v_fam.prezzo_base_mode, v_fam.markup_tipo, v_fam.markup_valore, v_fam.vat_rate_acquisto,
         v_fam.sconto_fornitore_1, v_fam.sconto_fornitore_2, v_fam.manodopera_modalita,
         v_fam.manodopera_costo_acquisto, v_fam.manodopera_prezzo_vendita, v_fam.manodopera_unita,
         v_new_macro, null, v_fam.mostra_preventivo)
      returning id into v_new_fam;

      for v_ax in
        select * from public.article_family_axes where family_id = v_fam.id order by sort_order
      loop
        insert into public.article_family_axes
          (family_id, company_id, nome, codice, descrizione, tipo, obbligatorio, sort_order)
        values
          (v_new_fam, v_src.company_id, v_ax.nome, v_ax.codice, v_ax.descrizione, v_ax.tipo,
           v_ax.obbligatorio, v_ax.sort_order)
        returning id into v_new_ax;

        insert into public.article_family_axis_values
          (axis_id, company_id, valore, label, descrizione, is_default, maggiorazione_tipo,
           maggiorazione_valore, maggiorazione_acquisto, sort_order, attivo, codice,
           prezzo_vendita, prezzo_acquisto, immagine_url)
        select v_new_ax, v_src.company_id, v.valore, v.label, v.descrizione, v.is_default,
               v.maggiorazione_tipo, v.maggiorazione_valore, v.maggiorazione_acquisto, v.sort_order,
               v.attivo, v.codice, v.prezzo_vendita, v.prezzo_acquisto, v.immagine_url
          from public.article_family_axis_values v
         where v.axis_id = v_ax.id;
      end loop;

      insert into public.listino_griglia
        (company_id, family_id, axis_config, valore_x, valore_y, prezzo_vendita, prezzo_acquisto,
         supplier_catalog_id, supplier_product_line_id, note)
      select v_src.company_id, v_new_fam, g.axis_config, g.valore_x, g.valore_y,
             case when g.prezzo_vendita is null then null else round(g.prezzo_vendita * v_k, 2) end,
             case when g.prezzo_acquisto is null then null else round(g.prezzo_acquisto * v_k, 2) end,
             g.supplier_catalog_id, g.supplier_product_line_id, g.note
        from public.listino_griglia g
       where g.family_id = v_fam.id;

      v_prodotti := v_prodotti + 1;
    end loop;
  end if;

  insert into public.listino_schede_linea
    (company_id, macrocategoria_id, chiave, nome, descrizione, immagine_url, profondita_mm,
     camere, guarnizioni, uw, scheda_tecnica_url, scheda_tecnica_nome)
  select s.company_id, v_new_macro, s.chiave, s.nome, s.descrizione, s.immagine_url, s.profondita_mm,
         s.camere, s.guarnizioni, s.uw, s.scheda_tecnica_url, s.scheda_tecnica_nome
    from public.listino_schede_linea s
   where s.macrocategoria_id = v_src.id;
  get diagnostics v_schede = row_count;

  return jsonb_build_object(
    'id', v_new_macro,
    'nome', v_nome,
    'prodotti', v_prodotti,
    'linee', v_linee,
    'schede', v_schede
  );
exception
  when unique_violation then
    raise exception 'Un nome è già in uso nel listino: cambia il nome della tipologia o il testo da aggiungere ai prodotti';
end;
$$;

revoke all on function public.listino_copia_tipologia(uuid, text, text, numeric, boolean) from public, anon;
grant execute on function public.listino_copia_tipologia(uuid, text, text, numeric, boolean) to authenticated;
