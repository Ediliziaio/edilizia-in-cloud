-- Cleanup anagrafica clienti: corregge i record con numeri di telefono,
-- CF o email finiti per sbaglio nel campo first_name / last_name
-- (bug ricorrente degli import AI/OCR).
--
-- Questa migration:
--   1. Aggiunge una RPC `sanitize_customer_profile` che pulisce UN profilo
--      (usata dal detail page per il "fix rapido").
--   2. Aggiunge una RPC `scan_customers_issues` che ritorna i problemi
--      dei profili di una company (usata dalla dashboard clienti).
--   3. NON esegue un cleanup massivo automatico: l'admin vede i problemi
--      e decide se/quando correggerli (tramite UI).

BEGIN;

-- ────────────────────────────────────────────────────────────────────
-- Helper: detect if a text looks like a phone (≥6 cifre, no lettere)
-- ────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public._looks_like_phone(s TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  cleaned TEXT;
  digits TEXT;
BEGIN
  IF s IS NULL OR trim(s) = '' THEN RETURN FALSE; END IF;
  cleaned := regexp_replace(trim(s), '[\u200B-\u200D\uFEFF]', '', 'g');
  -- Se contiene lettere → non è un phone
  IF cleaned ~* '[a-zàèéìòù]' THEN RETURN FALSE; END IF;
  digits := regexp_replace(cleaned, '\D', '', 'g');
  RETURN char_length(digits) BETWEEN 6 AND 15;
END;
$$;

-- ────────────────────────────────────────────────────────────────────
-- Helper: detect if a text looks like a CF (16 alfanum) or P.IVA (11 digits)
-- ────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public._looks_like_fiscal_code(s TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  cleaned TEXT;
BEGIN
  IF s IS NULL OR trim(s) = '' THEN RETURN FALSE; END IF;
  cleaned := upper(trim(s));
  IF cleaned ~ '^[0-9]{11}$' THEN RETURN TRUE; END IF;
  IF cleaned ~ '^[A-Z]{6}[0-9]{2}[A-Z][0-9]{2}[A-Z][0-9]{3}[A-Z]$' THEN RETURN TRUE; END IF;
  RETURN FALSE;
END;
$$;

-- ────────────────────────────────────────────────────────────────────
-- Helper: detect if a text looks like an email
-- ────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public._looks_like_email(s TEXT)
RETURNS BOOLEAN
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT s IS NOT NULL AND trim(s) ~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$';
$$;

-- ────────────────────────────────────────────────────────────────────
-- RPC: sanitize_customer_profile — aggiorna UN profilo applicando i fix
-- ────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.sanitize_customer_profile(p_customer_id UUID)
RETURNS JSON
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path TO 'public'
AS $$
DECLARE
  v_profile public.profiles;
  v_new_first TEXT;
  v_new_last TEXT;
  v_new_phone TEXT;
  v_new_fc TEXT;
  v_new_notes TEXT;
  v_fixes TEXT[] := '{}';
  v_parts TEXT[];
BEGIN
  SELECT * INTO v_profile FROM public.profiles WHERE id = p_customer_id;
  IF NOT FOUND THEN
    RETURN json_build_object('error', 'profile_not_found');
  END IF;

  v_new_first := trim(coalesce(v_profile.first_name, ''));
  v_new_last  := trim(coalesce(v_profile.last_name, ''));
  v_new_phone := trim(coalesce(v_profile.phone, ''));
  v_new_fc    := upper(trim(coalesce(v_profile.fiscal_code, '')));
  v_new_notes := coalesce(v_profile.notes, '');

  -- FIX 1: first_name è un telefono
  IF public._looks_like_phone(v_new_first) THEN
    IF v_new_phone = '' THEN
      v_new_phone := v_new_first;
      v_new_first := '';
      v_fixes := array_append(v_fixes, 'Nome numerico → Telefono');
    ELSIF v_new_phone <> v_new_first THEN
      v_new_notes := CASE WHEN v_new_notes = '' THEN
        '[Fix] Numero aggiuntivo: ' || v_new_first
      ELSE
        v_new_notes || E'\n[Fix] Numero aggiuntivo: ' || v_new_first
      END;
      v_new_first := '';
      v_fixes := array_append(v_fixes, 'Nome numerico duplicato → Note');
    ELSE
      v_new_first := '';
      v_fixes := array_append(v_fixes, 'Nome duplicato di telefono rimosso');
    END IF;
  END IF;

  -- FIX 2: last_name è un telefono
  IF public._looks_like_phone(v_new_last) THEN
    IF v_new_phone = '' THEN
      v_new_phone := v_new_last;
      v_new_last := '';
      v_fixes := array_append(v_fixes, 'Cognome numerico → Telefono');
    ELSE
      v_new_notes := CASE WHEN v_new_notes = '' THEN
        '[Fix] Numero aggiuntivo: ' || v_new_last
      ELSE
        v_new_notes || E'\n[Fix] Numero aggiuntivo: ' || v_new_last
      END;
      v_new_last := '';
      v_fixes := array_append(v_fixes, 'Cognome numerico → Note');
    END IF;
  END IF;

  -- FIX 3: first_name / last_name è un CF/P.IVA
  IF public._looks_like_fiscal_code(v_new_first) THEN
    IF v_new_fc = '' THEN v_new_fc := upper(v_new_first); END IF;
    v_new_first := '';
    v_fixes := array_append(v_fixes, 'Nome era CF → Codice Fiscale');
  END IF;
  IF public._looks_like_fiscal_code(v_new_last) THEN
    IF v_new_fc = '' THEN v_new_fc := upper(v_new_last); END IF;
    v_new_last := '';
    v_fixes := array_append(v_fixes, 'Cognome era CF → Codice Fiscale');
  END IF;

  -- FIX 4: split se uno dei due è vuoto e l'altro ha più parole
  IF v_new_first = '' AND v_new_last <> '' THEN
    v_parts := regexp_split_to_array(v_new_last, '\s+');
    IF array_length(v_parts, 1) >= 2 THEN
      v_new_first := v_parts[1];
      v_new_last := array_to_string(v_parts[2:array_length(v_parts,1)], ' ');
      v_fixes := array_append(v_fixes, 'Cognome splittato in Nome + Cognome');
    END IF;
  END IF;
  IF v_new_last = '' AND v_new_first <> '' THEN
    v_parts := regexp_split_to_array(v_new_first, '\s+');
    IF array_length(v_parts, 1) >= 2 THEN
      v_new_last := array_to_string(v_parts[2:array_length(v_parts,1)], ' ');
      v_new_first := v_parts[1];
      v_fixes := array_append(v_fixes, 'Nome splittato in Nome + Cognome');
    END IF;
  END IF;

  -- Fallback placeholder per rispettare NOT NULL
  IF v_new_first = '' THEN v_new_first := '—'; END IF;
  IF v_new_last = '' THEN v_new_last := '—'; END IF;

  -- Se nulla è cambiato, ritorna no-op
  IF v_new_first = coalesce(v_profile.first_name, '')
     AND v_new_last = coalesce(v_profile.last_name, '')
     AND v_new_phone = coalesce(v_profile.phone, '')
     AND v_new_fc = upper(coalesce(v_profile.fiscal_code, ''))
     AND v_new_notes = coalesce(v_profile.notes, '') THEN
    RETURN json_build_object('changed', FALSE, 'fixes', '[]'::json);
  END IF;

  UPDATE public.profiles
    SET first_name = v_new_first,
        last_name = v_new_last,
        phone = NULLIF(v_new_phone, ''),
        fiscal_code = NULLIF(v_new_fc, ''),
        notes = NULLIF(v_new_notes, ''),
        updated_at = now()
    WHERE id = p_customer_id;

  RETURN json_build_object(
    'changed', TRUE,
    'fixes', to_json(v_fixes)
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.sanitize_customer_profile(UUID) TO authenticated;

-- ────────────────────────────────────────────────────────────────────
-- RPC: scan_customers_issues — ritorna profili con problemi
-- ────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.scan_customers_issues(p_company_id UUID)
RETURNS JSON
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  result JSON;
BEGIN
  WITH customer_rows AS (
    SELECT p.id, p.first_name, p.last_name, p.email, p.phone, p.fiscal_code
    FROM public.profiles p
    INNER JOIN public.user_roles ur ON ur.user_id = p.id AND ur.role = 'customer'
    WHERE p.company_id = p_company_id
  ),
  flagged AS (
    SELECT id, first_name, last_name, email,
      ARRAY(
        SELECT issue FROM (
          SELECT 'first_name_is_phone'::text AS issue WHERE public._looks_like_phone(first_name)
          UNION ALL
          SELECT 'last_name_is_phone'  WHERE public._looks_like_phone(last_name)
          UNION ALL
          SELECT 'first_name_is_fiscal_code' WHERE public._looks_like_fiscal_code(first_name)
          UNION ALL
          SELECT 'last_name_is_fiscal_code' WHERE public._looks_like_fiscal_code(last_name)
          UNION ALL
          SELECT 'first_name_is_email' WHERE public._looks_like_email(first_name)
          UNION ALL
          SELECT 'missing_phone' WHERE coalesce(trim(phone), '') = ''
          UNION ALL
          SELECT 'first_name_placeholder' WHERE first_name IN ('—', '-', '')
          UNION ALL
          SELECT 'last_name_placeholder' WHERE last_name IN ('—', '-', '')
        ) s
      ) AS issues
    FROM customer_rows
  )
  SELECT json_build_object(
    'total_flagged', (SELECT COUNT(*) FROM flagged WHERE cardinality(issues) > 0),
    'by_type', json_build_object(
      'first_name_is_phone',       (SELECT COUNT(*) FROM flagged WHERE 'first_name_is_phone' = ANY(issues)),
      'last_name_is_phone',        (SELECT COUNT(*) FROM flagged WHERE 'last_name_is_phone' = ANY(issues)),
      'first_name_is_fiscal_code', (SELECT COUNT(*) FROM flagged WHERE 'first_name_is_fiscal_code' = ANY(issues)),
      'last_name_is_fiscal_code',  (SELECT COUNT(*) FROM flagged WHERE 'last_name_is_fiscal_code' = ANY(issues)),
      'first_name_is_email',       (SELECT COUNT(*) FROM flagged WHERE 'first_name_is_email' = ANY(issues))
    ),
    'rows', COALESCE((
      SELECT json_agg(json_build_object(
        'id', id,
        'first_name', first_name,
        'last_name', last_name,
        'email', email,
        'issues', to_json(issues)
      ))
      FROM flagged WHERE cardinality(issues) > 0 LIMIT 500
    ), '[]'::json)
  ) INTO result;

  RETURN result;
END;
$$;

GRANT EXECUTE ON FUNCTION public.scan_customers_issues(UUID) TO authenticated;

COMMIT;
