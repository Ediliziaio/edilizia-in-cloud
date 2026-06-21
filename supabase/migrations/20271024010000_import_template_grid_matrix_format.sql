-- Aggiorna import_article_family_template per accettare griglia_default anche
-- in formato MATRICE COMPATTO: { "xs":[larghezze], "ys":[altezze], "m":[[riga ys[0]], ...] }
-- m[i][j] = prezzo per (xs[j], ys[i]); null = cella non quotata.
-- Mantiene compatibilità col formato array-di-celle [{"x","y","pv"}].
CREATE OR REPLACE FUNCTION public.import_article_family_template(
  p_template_id uuid,
  p_company_id uuid,
  p_macrocategoria_id uuid DEFAULT NULL::uuid,
  p_nome_override text DEFAULT NULL::text
)
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
  IF public.get_user_company_id(v_user_id) IS DISTINCT FROM p_company_id THEN
    RAISE EXCEPTION 'not a member of company %', p_company_id USING ERRCODE = '42501';
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

  v_g := v_template.griglia_default;
  IF v_g IS NOT NULL AND jsonb_typeof(v_g) = 'object' AND (v_g ? 'm') THEN
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
