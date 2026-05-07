-- Quote template library hardening: linked blocks must belong to the same
-- company and be active. Also cleans all linked references on soft delete,
-- including single links (cover / terms / legal), not only arrays.

CREATE OR REPLACE FUNCTION public.tg_quote_template_validate_links()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_target record;
  v_count int;
BEGIN
  IF NEW.kind <> 'offerta' THEN
    IF NEW.linked_cover_id IS NOT NULL OR NEW.linked_terms_id IS NOT NULL
       OR NEW.linked_legal_id IS NOT NULL
       OR (NEW.linked_product_ids IS NOT NULL AND array_length(NEW.linked_product_ids, 1) > 0)
       OR (NEW.linked_section_ids IS NOT NULL AND array_length(NEW.linked_section_ids, 1) > 0)
    THEN
      RAISE EXCEPTION 'Solo i template kind=offerta possono avere blocchi linkati. Kind attuale: %', NEW.kind
        USING ERRCODE = '23514';
    END IF;
    RETURN NEW;
  END IF;

  IF NEW.linked_cover_id = NEW.id OR NEW.linked_terms_id = NEW.id OR NEW.linked_legal_id = NEW.id THEN
    RAISE EXCEPTION 'Un template offerta non può linkare se stesso' USING ERRCODE = '23514';
  END IF;
  IF NEW.linked_product_ids IS NOT NULL AND NEW.id = ANY(NEW.linked_product_ids) THEN
    RAISE EXCEPTION 'Un template offerta non può linkare se stesso nei prodotti' USING ERRCODE = '23514';
  END IF;
  IF NEW.linked_section_ids IS NOT NULL AND NEW.id = ANY(NEW.linked_section_ids) THEN
    RAISE EXCEPTION 'Un template offerta non può linkare se stesso nelle sezioni' USING ERRCODE = '23514';
  END IF;

  IF NEW.linked_cover_id IS NOT NULL THEN
    SELECT kind, company_id, is_active INTO v_target
    FROM public.quote_templates
    WHERE id = NEW.linked_cover_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'linked_cover_id punta a un template inesistente' USING ERRCODE = '23503';
    END IF;
    IF v_target.kind <> 'copertina' OR v_target.company_id <> NEW.company_id OR v_target.is_active IS NOT TRUE THEN
      RAISE EXCEPTION 'linked_cover_id deve puntare a una copertina attiva della stessa azienda'
        USING ERRCODE = '23514';
    END IF;
  END IF;

  IF NEW.linked_terms_id IS NOT NULL THEN
    SELECT kind, company_id, is_active INTO v_target
    FROM public.quote_templates
    WHERE id = NEW.linked_terms_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'linked_terms_id punta a un template inesistente' USING ERRCODE = '23503';
    END IF;
    IF v_target.kind <> 'condizioni' OR v_target.company_id <> NEW.company_id OR v_target.is_active IS NOT TRUE THEN
      RAISE EXCEPTION 'linked_terms_id deve puntare a condizioni attive della stessa azienda'
        USING ERRCODE = '23514';
    END IF;
  END IF;

  IF NEW.linked_legal_id IS NOT NULL THEN
    SELECT kind, company_id, is_active INTO v_target
    FROM public.quote_templates
    WHERE id = NEW.linked_legal_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'linked_legal_id punta a un template inesistente' USING ERRCODE = '23503';
    END IF;
    IF v_target.kind <> 'legali' OR v_target.company_id <> NEW.company_id OR v_target.is_active IS NOT TRUE THEN
      RAISE EXCEPTION 'linked_legal_id deve puntare a termini legali attivi della stessa azienda'
        USING ERRCODE = '23514';
    END IF;
  END IF;

  IF NEW.linked_product_ids IS NOT NULL AND array_length(NEW.linked_product_ids, 1) > 0 THEN
    SELECT count(*) INTO v_count
    FROM public.quote_templates
    WHERE id = ANY(NEW.linked_product_ids)
      AND kind = 'prodotto'
      AND company_id = NEW.company_id
      AND is_active = true;
    IF v_count < array_length(NEW.linked_product_ids, 1) THEN
      RAISE EXCEPTION 'linked_product_ids contiene template non attivi, non prodotto o di altra azienda'
        USING ERRCODE = '23514';
    END IF;
  END IF;

  IF NEW.linked_section_ids IS NOT NULL AND array_length(NEW.linked_section_ids, 1) > 0 THEN
    SELECT count(*) INTO v_count
    FROM public.quote_templates
    WHERE id = ANY(NEW.linked_section_ids)
      AND kind = 'sezione'
      AND company_id = NEW.company_id
      AND is_active = true;
    IF v_count < array_length(NEW.linked_section_ids, 1) THEN
      RAISE EXCEPTION 'linked_section_ids contiene template non attivi, non sezione o di altra azienda'
        USING ERRCODE = '23514';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.tg_quote_template_validate_links IS
  'Hardening libreria template: anti-circolare, kind matching, same-company, active-only.';

CREATE OR REPLACE FUNCTION public.tg_quote_template_cleanup_array_refs()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF (TG_OP = 'UPDATE' AND OLD.is_active = true AND NEW.is_active = false) THEN
    IF NEW.kind = 'copertina' THEN
      UPDATE public.quote_templates
      SET linked_cover_id = NULL
      WHERE company_id = NEW.company_id
        AND kind = 'offerta'
        AND linked_cover_id = NEW.id;
    ELSIF NEW.kind = 'condizioni' THEN
      UPDATE public.quote_templates
      SET linked_terms_id = NULL
      WHERE company_id = NEW.company_id
        AND kind = 'offerta'
        AND linked_terms_id = NEW.id;
    ELSIF NEW.kind = 'legali' THEN
      UPDATE public.quote_templates
      SET linked_legal_id = NULL
      WHERE company_id = NEW.company_id
        AND kind = 'offerta'
        AND linked_legal_id = NEW.id;
    ELSIF NEW.kind = 'prodotto' THEN
      UPDATE public.quote_templates
      SET linked_product_ids = array_remove(linked_product_ids, NEW.id)
      WHERE company_id = NEW.company_id
        AND kind = 'offerta'
        AND NEW.id = ANY(linked_product_ids);
    ELSIF NEW.kind = 'sezione' THEN
      UPDATE public.quote_templates
      SET linked_section_ids = array_remove(linked_section_ids, NEW.id)
      WHERE company_id = NEW.company_id
        AND kind = 'offerta'
        AND NEW.id = ANY(linked_section_ids);
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.tg_quote_template_cleanup_array_refs IS
  'Hardening libreria template: rimuove link singoli e array quando un blocco diventa inattivo.';

DROP FUNCTION IF EXISTS public.cleanup_inactive_linked_blocks(uuid);

CREATE FUNCTION public.cleanup_inactive_linked_blocks(p_company_id uuid)
RETURNS TABLE (
  offerta_id uuid,
  removed_cover boolean,
  removed_terms boolean,
  removed_legal boolean,
  remaining_products int,
  remaining_sections int
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_active_covers uuid[];
  v_active_terms uuid[];
  v_active_legals uuid[];
  v_active_products uuid[];
  v_active_sections uuid[];
BEGIN
  SELECT coalesce(array_agg(id), '{}'::uuid[]) INTO v_active_covers
    FROM public.quote_templates WHERE company_id = p_company_id AND kind = 'copertina' AND is_active = true;
  SELECT coalesce(array_agg(id), '{}'::uuid[]) INTO v_active_terms
    FROM public.quote_templates WHERE company_id = p_company_id AND kind = 'condizioni' AND is_active = true;
  SELECT coalesce(array_agg(id), '{}'::uuid[]) INTO v_active_legals
    FROM public.quote_templates WHERE company_id = p_company_id AND kind = 'legali' AND is_active = true;
  SELECT coalesce(array_agg(id), '{}'::uuid[]) INTO v_active_products
    FROM public.quote_templates WHERE company_id = p_company_id AND kind = 'prodotto' AND is_active = true;
  SELECT coalesce(array_agg(id), '{}'::uuid[]) INTO v_active_sections
    FROM public.quote_templates WHERE company_id = p_company_id AND kind = 'sezione' AND is_active = true;

  RETURN QUERY
  WITH before_state AS (
    SELECT id, linked_cover_id, linked_terms_id, linked_legal_id
    FROM public.quote_templates
    WHERE company_id = p_company_id AND kind = 'offerta'
  ),
  cleanup AS (
    UPDATE public.quote_templates qt
    SET
      linked_cover_id = CASE WHEN linked_cover_id = ANY(v_active_covers) THEN linked_cover_id ELSE NULL END,
      linked_terms_id = CASE WHEN linked_terms_id = ANY(v_active_terms) THEN linked_terms_id ELSE NULL END,
      linked_legal_id = CASE WHEN linked_legal_id = ANY(v_active_legals) THEN linked_legal_id ELSE NULL END,
      linked_product_ids = coalesce(
        ARRAY(SELECT unnest(qt.linked_product_ids) INTERSECT SELECT unnest(v_active_products)),
        '{}'::uuid[]
      ),
      linked_section_ids = coalesce(
        ARRAY(SELECT unnest(qt.linked_section_ids) INTERSECT SELECT unnest(v_active_sections)),
        '{}'::uuid[]
      )
    WHERE qt.company_id = p_company_id AND qt.kind = 'offerta'
    RETURNING qt.id, qt.linked_cover_id, qt.linked_terms_id, qt.linked_legal_id,
              array_length(qt.linked_product_ids, 1) AS new_p,
              array_length(qt.linked_section_ids, 1) AS new_s
  )
  SELECT c.id,
         b.linked_cover_id IS NOT NULL AND c.linked_cover_id IS NULL,
         b.linked_terms_id IS NOT NULL AND c.linked_terms_id IS NULL,
         b.linked_legal_id IS NOT NULL AND c.linked_legal_id IS NULL,
         coalesce(c.new_p, 0),
         coalesce(c.new_s, 0)
  FROM cleanup c
  JOIN before_state b ON b.id = c.id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.cleanup_inactive_linked_blocks(uuid) TO authenticated, service_role;

COMMENT ON FUNCTION public.cleanup_inactive_linked_blocks(uuid) IS
  'Pulizia massiva: rimuove link a blocchi inattivi o non più validi nella stessa azienda.';
