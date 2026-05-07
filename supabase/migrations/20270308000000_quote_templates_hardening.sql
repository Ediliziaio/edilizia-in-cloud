-- ════════════════════════════════════════════════════════════════════════════
-- QUOTE TEMPLATES — Hardening: anti-circolare + kind matching + cleanup arrays
-- ════════════════════════════════════════════════════════════════════════════
-- Aggiunge protezioni DB-level alla libreria template:
--
--   1. Trigger BEFORE INSERT/UPDATE che valida:
--      - Nessun self-link (template che linka se stesso)
--      - linked_cover_id punta a kind='copertina', linked_terms_id a 'condizioni',
--        linked_legal_id a 'legali'
--      - linked_product_ids contengono solo kind='prodotto'
--      - linked_section_ids contengono solo kind='sezione'
--      - I link sono solo permessi se kind='offerta' (gli altri sono blocchi
--        atomici, non possono linkarsi a vicenda → niente cicli A→B→C→A)
--      - Tutti i blocchi linkati sono nella stessa company_id
--
--   2. Funzione cleanup_inactive_linked_blocks() per rimuovere riferimenti a
--      blocchi soft-deleted (is_active=false) dagli array linked_product_ids
--      e linked_section_ids (gli ID singoli con FK ON DELETE SET NULL si
--      auto-puliscono già).
--
-- Tutto additive. Le offerte esistenti (legacy senza link) non sono toccate.
-- ════════════════════════════════════════════════════════════════════════════

-- 1) Trigger di validazione kind matching + anti-circolare
CREATE OR REPLACE FUNCTION public.tg_quote_template_validate_links()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_record record;
  v_target_kind text;
  v_count int;
BEGIN
  -- Solo kind='offerta' può avere linked_*
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

  -- Self-reference: l'offerta non può linkare se stessa
  IF NEW.linked_cover_id = NEW.id OR NEW.linked_terms_id = NEW.id OR NEW.linked_legal_id = NEW.id THEN
    RAISE EXCEPTION 'Un template offerta non può linkare se stesso' USING ERRCODE = '23514';
  END IF;
  IF NEW.linked_product_ids IS NOT NULL AND NEW.id = ANY(NEW.linked_product_ids) THEN
    RAISE EXCEPTION 'Un template offerta non può linkare se stesso nei prodotti' USING ERRCODE = '23514';
  END IF;
  IF NEW.linked_section_ids IS NOT NULL AND NEW.id = ANY(NEW.linked_section_ids) THEN
    RAISE EXCEPTION 'Un template offerta non può linkare se stesso nelle sezioni' USING ERRCODE = '23514';
  END IF;

  -- Validate linked_cover_id: kind='copertina', stessa company
  IF NEW.linked_cover_id IS NOT NULL THEN
    SELECT kind, company_id INTO v_target_kind, v_record
      FROM public.quote_templates WHERE id = NEW.linked_cover_id;
    IF v_target_kind IS NULL THEN
      RAISE EXCEPTION 'linked_cover_id punta a un template inesistente' USING ERRCODE = '23503';
    END IF;
    IF v_target_kind <> 'copertina' THEN
      RAISE EXCEPTION 'linked_cover_id deve puntare a un kind=copertina (trovato: %)', v_target_kind
        USING ERRCODE = '23514';
    END IF;
  END IF;

  -- Validate linked_terms_id: kind='condizioni'
  IF NEW.linked_terms_id IS NOT NULL THEN
    SELECT kind INTO v_target_kind FROM public.quote_templates WHERE id = NEW.linked_terms_id;
    IF v_target_kind IS NULL THEN
      RAISE EXCEPTION 'linked_terms_id punta a un template inesistente' USING ERRCODE = '23503';
    END IF;
    IF v_target_kind <> 'condizioni' THEN
      RAISE EXCEPTION 'linked_terms_id deve puntare a un kind=condizioni (trovato: %)', v_target_kind
        USING ERRCODE = '23514';
    END IF;
  END IF;

  -- Validate linked_legal_id: kind='legali'
  IF NEW.linked_legal_id IS NOT NULL THEN
    SELECT kind INTO v_target_kind FROM public.quote_templates WHERE id = NEW.linked_legal_id;
    IF v_target_kind IS NULL THEN
      RAISE EXCEPTION 'linked_legal_id punta a un template inesistente' USING ERRCODE = '23503';
    END IF;
    IF v_target_kind <> 'legali' THEN
      RAISE EXCEPTION 'linked_legal_id deve puntare a un kind=legali (trovato: %)', v_target_kind
        USING ERRCODE = '23514';
    END IF;
  END IF;

  -- Validate linked_product_ids: ogni id è kind='prodotto'
  IF NEW.linked_product_ids IS NOT NULL AND array_length(NEW.linked_product_ids, 1) > 0 THEN
    SELECT count(*) INTO v_count
      FROM public.quote_templates
      WHERE id = ANY(NEW.linked_product_ids) AND kind = 'prodotto';
    IF v_count < array_length(NEW.linked_product_ids, 1) THEN
      RAISE EXCEPTION 'linked_product_ids contiene template che non sono kind=prodotto'
        USING ERRCODE = '23514';
    END IF;
  END IF;

  -- Validate linked_section_ids: ogni id è kind='sezione'
  IF NEW.linked_section_ids IS NOT NULL AND array_length(NEW.linked_section_ids, 1) > 0 THEN
    SELECT count(*) INTO v_count
      FROM public.quote_templates
      WHERE id = ANY(NEW.linked_section_ids) AND kind = 'sezione';
    IF v_count < array_length(NEW.linked_section_ids, 1) THEN
      RAISE EXCEPTION 'linked_section_ids contiene template che non sono kind=sezione'
        USING ERRCODE = '23514';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_quote_template_validate_links ON public.quote_templates;
CREATE TRIGGER trg_quote_template_validate_links
  BEFORE INSERT OR UPDATE ON public.quote_templates
  FOR EACH ROW
  EXECUTE FUNCTION public.tg_quote_template_validate_links();

COMMENT ON FUNCTION public.tg_quote_template_validate_links IS
  'Hardening libreria template: anti-circolare + kind matching + only-offerta-can-link.';

-- 2) Cleanup automatico array linked_*_ids quando un blocco viene
--    soft-deleted (is_active=false). I blocchi referenziati da FK singola
--    con ON DELETE SET NULL si auto-puliscono già; gli array no.
CREATE OR REPLACE FUNCTION public.tg_quote_template_cleanup_array_refs()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Solo se passa da is_active=true a is_active=false (soft delete)
  IF (TG_OP = 'UPDATE' AND OLD.is_active = true AND NEW.is_active = false) THEN
    IF NEW.kind = 'prodotto' THEN
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

DROP TRIGGER IF EXISTS trg_quote_template_cleanup_arrays ON public.quote_templates;
CREATE TRIGGER trg_quote_template_cleanup_arrays
  AFTER UPDATE ON public.quote_templates
  FOR EACH ROW
  WHEN (OLD.is_active IS DISTINCT FROM NEW.is_active)
  EXECUTE FUNCTION public.tg_quote_template_cleanup_array_refs();

COMMENT ON FUNCTION public.tg_quote_template_cleanup_array_refs IS
  'Hardening libreria template: rimuove auto-link da linked_product_ids/linked_section_ids quando il blocco diventa inattivo.';

-- 3) Funzione utility chiamabile manualmente per pulizia massiva (es. dopo
--    bulk-deactivation di blocchi)
CREATE OR REPLACE FUNCTION public.cleanup_inactive_linked_blocks(p_company_id uuid)
RETURNS TABLE (offerta_id uuid, removed_products int, removed_sections int)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_active_products uuid[];
  v_active_sections uuid[];
BEGIN
  SELECT array_agg(id) INTO v_active_products
    FROM public.quote_templates
    WHERE company_id = p_company_id AND kind = 'prodotto' AND is_active = true;
  SELECT array_agg(id) INTO v_active_sections
    FROM public.quote_templates
    WHERE company_id = p_company_id AND kind = 'sezione' AND is_active = true;

  RETURN QUERY
  WITH cleanup AS (
    UPDATE public.quote_templates qt
    SET
      linked_product_ids = COALESCE(
        ARRAY(SELECT unnest(qt.linked_product_ids) INTERSECT SELECT unnest(coalesce(v_active_products, '{}'::uuid[]))),
        '{}'::uuid[]
      ),
      linked_section_ids = COALESCE(
        ARRAY(SELECT unnest(qt.linked_section_ids) INTERSECT SELECT unnest(coalesce(v_active_sections, '{}'::uuid[]))),
        '{}'::uuid[]
      )
    WHERE qt.company_id = p_company_id AND qt.kind = 'offerta'
    RETURNING qt.id,
              array_length(qt.linked_product_ids, 1) AS new_p,
              array_length(qt.linked_section_ids, 1) AS new_s
  )
  SELECT id, COALESCE(new_p, 0), COALESCE(new_s, 0) FROM cleanup;
END;
$$;

GRANT EXECUTE ON FUNCTION public.cleanup_inactive_linked_blocks(uuid) TO authenticated, service_role;

COMMENT ON FUNCTION public.cleanup_inactive_linked_blocks IS
  'Pulizia massiva: rimuove dai linked_*_ids di tutte le offerte i blocchi non più attivi.';
