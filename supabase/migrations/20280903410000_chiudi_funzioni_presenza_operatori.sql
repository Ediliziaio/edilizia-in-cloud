-- ============================================================================
-- Chiusura dei permessi sulle funzioni della presenza operatori
-- ============================================================================
-- Le funzioni PostgreSQL nascono con EXECUTE concesso a PUBLIC. Nella migration
-- precedente avevo revocato da "anon, authenticated" — che NON basta, perché
-- quei ruoli ereditano da PUBLIC: restavano chiamabili da qualunque utente
-- autenticato passando QUALSIASI company_id.
--
-- Non è un dettaglio formale: `operatore_libero` e `passa_chiamata_a_operatore`
-- restituiscono i numeri di telefono degli operatori. Aperte così, un utente di
-- un'azienda leggeva i recapiti dei commerciali di un'altra.
--
-- Regola da ricordare: dopo ogni CREATE FUNCTION, REVOKE FROM PUBLIC, poi GRANT
-- solo a chi serve. Vedi lo stesso schema negli audit multi-tenant precedenti.
-- ============================================================================

REVOKE ALL ON FUNCTION public.passa_chiamata_a_operatore(uuid, text, text, text, uuid, uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.operatore_libero(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.segnala_presenza_operatore(uuid, boolean, text) FROM PUBLIC;

-- Il passaggio lo esegue solo l'assistente vocale, via edge con service role.
GRANT EXECUTE ON FUNCTION public.passa_chiamata_a_operatore(uuid, text, text, text, uuid, uuid, text) TO service_role;

-- Presenza: la usa l'utente loggato, ma solo sulla propria azienda.
GRANT EXECUTE ON FUNCTION public.segnala_presenza_operatore(uuid, boolean, text) TO authenticated, service_role;

-- Cintura oltre alle bretelle: il controllo di accesso dentro la funzione, così
-- vale anche se un domani qualcuno riallarga i permessi. operatore_libero è SQL
-- puro, quindi il controllo diventa una condizione della query invece di un
-- PERFORM: senza accesso l'elenco esce vuoto.
CREATE OR REPLACE FUNCTION public.operatore_libero(p_company_id uuid)
RETURNS TABLE (user_id uuid, nome text, telefono text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    p.id,
    COALESCE(
      NULLIF(TRIM(COALESCE(p.first_name, '') || ' ' || COALESCE(p.last_name, '')), ''),
      p.email,
      'Collega'
    ),
    op.telefono
  FROM public.operatori_presenza op
  JOIN public.profiles p ON p.id = op.user_id
  WHERE op.company_id = p_company_id
    AND public.user_can_access_company(p_company_id)
    AND op.disponibile
    AND op.telefono IS NOT NULL
    AND length(regexp_replace(op.telefono, '\s', '', 'g')) >= 8
    AND op.ultimo_segnale > now() - interval '3 minutes'
    AND (op.occupato_fino_a IS NULL OR op.occupato_fino_a < now())
  ORDER BY op.ultimo_passaggio_at NULLS FIRST, op.ultimo_segnale DESC
  LIMIT 1;
$$;

REVOKE ALL ON FUNCTION public.operatore_libero(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.operatore_libero(uuid) TO authenticated, service_role;
