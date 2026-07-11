-- ============================================================================
-- Fix: add_user_to_order_channel referenziava chat_channels/chat_channel_members,
-- tabelle inesistenti (le reali sono internal_chat_channels/internal_chat_members).
-- Effetto del bug: OGNI insert su order_campo_assignments falliva (trigger
-- trg_oca_add_channel_member) → impossibile assegnare operai ai cantieri.
-- Hardening: qualunque errore chat non blocca mai l'assegnazione.
-- (Applicata in prod il 2026-07-10 via MCP: fix_add_user_to_order_channel_internal_chat)
-- ============================================================================
CREATE OR REPLACE FUNCTION public.add_user_to_order_channel(p_order_id uuid, p_user_id uuid, p_company_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_catalog'
AS $function$
DECLARE
  v_channel_id UUID;
  v_order_code TEXT;
  v_name TEXT;
BEGIN
  SELECT order_code INTO v_order_code FROM orders WHERE id = p_order_id;
  IF v_order_code IS NULL THEN
    RETURN;
  END IF;
  -- Stessa convenzione del frontend campo: cantiere-<order_code minuscolo, spazi → trattini>
  v_name := 'cantiere-' || lower(regexp_replace(v_order_code, '\s+', '-', 'g'));

  SELECT id INTO v_channel_id
    FROM internal_chat_channels
   WHERE company_id = p_company_id
     AND (order_id = p_order_id OR name = v_name)
   LIMIT 1;

  IF v_channel_id IS NULL THEN
    INSERT INTO internal_chat_channels(company_id, name, type, created_by, order_id)
    VALUES (p_company_id, v_name, 'cantiere', p_user_id, p_order_id)
    RETURNING id INTO v_channel_id;
  END IF;

  INSERT INTO internal_chat_members(channel_id, user_id, company_id, role)
  VALUES (v_channel_id, p_user_id, p_company_id, 'member')
  ON CONFLICT (channel_id, user_id) DO NOTHING;
EXCEPTION WHEN OTHERS THEN
  -- La chat è accessoria: mai bloccare l'assegnazione dell'operaio al cantiere
  RAISE WARNING 'add_user_to_order_channel fallita per order %: %', p_order_id, SQLERRM;
END;
$function$;
