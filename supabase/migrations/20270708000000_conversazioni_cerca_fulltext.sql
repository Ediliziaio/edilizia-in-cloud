-- =============================================================================
-- Conversazioni / Inbox — ricerca nel CONTENUTO dei messaggi
-- =============================================================================
-- conversazioni_lista ritorna solo l'anteprima (ultimo messaggio); la ricerca
-- client-side copre nome/email/telefono/anteprima. Questa RPC cerca dentro il
-- TESTO di tutti i messaggi (email/sms/whatsapp/customer_messages via la view
-- v_conversazioni_messaggi) e ritorna le entità che hanno almeno un messaggio
-- che combacia, con snippet.
--
-- SECURITY DEFINER + filtro company (come le altre RPC conversazioni). ILIKE
-- substring (no full-text index: `testo` è calcolato nella view, non indicizzabile
-- direttamente) → gated da length>=2 + LIMIT 100. Sufficiente per un inbox; per
-- volumi grandi si valuterà un indice trigram sulle colonne sorgente.
--
-- Il frontend (ConversazioniInbox) usa questa RPC con DEGRADO AUTOMATICO: se non è
-- ancora deployata ricade sulla ricerca client-side → nessuna rottura.
-- CREATE OR REPLACE = idempotente. NON applicata (modalità locale).
-- =============================================================================
CREATE OR REPLACE FUNCTION public.conversazioni_cerca(p_company_id uuid, p_query text)
RETURNS TABLE (entita_tipo text, entita_id uuid, snippet text, match_ts timestamptz)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF NOT (public.is_super_admin() OR p_company_id = public.get_user_company_id(auth.uid())) THEN
    RAISE EXCEPTION 'Accesso negato' USING ERRCODE = '42501';
  END IF;
  IF length(COALESCE(trim(p_query), '')) < 2 THEN
    RETURN;
  END IF;

  RETURN QUERY
    SELECT DISTINCT ON (m.entita_tipo, m.entita_id)
           m.entita_tipo,
           m.entita_id,
           left(m.testo, 160) AS snippet,
           m.ts               AS match_ts
    FROM public.v_conversazioni_messaggi m
    WHERE m.company_id = p_company_id
      AND m.testo ILIKE '%' || trim(p_query) || '%'
    ORDER BY m.entita_tipo, m.entita_id, m.ts DESC
    LIMIT 100;
END;
$$;

REVOKE ALL ON FUNCTION public.conversazioni_cerca(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.conversazioni_cerca(uuid, text) TO authenticated;
