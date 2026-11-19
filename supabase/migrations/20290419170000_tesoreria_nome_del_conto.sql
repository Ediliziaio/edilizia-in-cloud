-- ════════════════════════════════════════════════════════════════════════════
-- Tesoreria: da quale banca e da quale conto arriva un movimento (19/11/2026)
-- ════════════════════════════════════════════════════════════════════════════
-- Impresa Vulcano ha otto conti su due banche. Sei si chiamano «Account» e due
-- «IMPRESA VULCANO S.R.L.»: è il nome che manda l'Open Banking, e nella colonna
-- «Conto» si leggeva quello. Con otto conti non si capiva da dove arrivassero i
-- soldi — e nel popup della riconciliazione si leggeva «Account · 4 nov 2026».
--
-- La banca però la sappiamo: sta sulla connessione (BPER Banca, BCC Busto
-- Garolfo e Buguggiate), e l'IBAN, anche se l'Open Banking lo manda mascherato,
-- porta le ultime quattro cifre, che è esattamente ciò che distingue due conti
-- della stessa banca. «BCC Busto Garolfo e Buguggiate ···0901» si legge.
--
-- Il nome del conto nasce qui, in un posto solo: elenco dei movimenti, popup
-- della riconciliazione e tendina dei conti dicono la stessa cosa. Il nome
-- scelto dall'azienda (`display_name`) vince sempre su quello dedotto.
--
-- Idempotente: CREATE OR REPLACE, e la patch sulla funzione dell'elenco si
-- riconosce da sola se è già stata applicata.
-- ════════════════════════════════════════════════════════════════════════════

/** Come si chiama un conto: la banca e le ultime cifre dell'IBAN. NULL se non si sa nulla. */
CREATE OR REPLACE FUNCTION private.tes_nome_conto(p_company uuid, p_account uuid)
 RETURNS text
 LANGUAGE sql
 STABLE
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
  SELECT nullif(btrim(
           coalesce(nullif(btrim(c.institution_name), ''), '')
           || coalesce(' ···' || right(regexp_replace(coalesce(a.iban, a.bban, ''), '[^A-Za-z0-9]', '', 'g'), 4), '')
         ), '')
    FROM public.bank_accounts a
    LEFT JOIN public.bank_connections c ON c.id = a.connection_id
   WHERE a.id = p_account AND a.company_id = p_company
$function$;

-- La gamba opposta di un giroconto: stesso nome, stessa regola.
CREATE OR REPLACE FUNCTION private.tes_altro_conto(p_company uuid, p_account uuid)
 RETURNS text
 LANGUAGE sql
 STABLE
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
  SELECT coalesce(
    nullif(btrim((SELECT a.display_name FROM public.bank_accounts a WHERE a.id = p_account AND a.company_id = p_company)), ''),
    private.tes_nome_conto(p_company, p_account),
    'Altro conto')
$function$;

/** I conti dell'azienda, col nome che si legge: per la tendina dei filtri. */
CREATE OR REPLACE FUNCTION public.tesoreria_conti(p_company uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v jsonb;
BEGIN
  PERFORM public.assert_company_access(p_company);
  SELECT coalesce(jsonb_agg(x.riga ORDER BY x.attivo DESC, x.nome), '[]'::jsonb) INTO v
    FROM (
      SELECT coalesce(a.is_active, true) AS attivo,
             coalesce(nullif(btrim(a.display_name), ''), private.tes_nome_conto(p_company, a.id),
                      nullif(btrim(a.account_name), ''), 'Conto') AS nome,
             jsonb_build_object(
               'id', a.id,
               'nome', coalesce(nullif(btrim(a.display_name), ''), private.tes_nome_conto(p_company, a.id),
                                nullif(btrim(a.account_name), ''), 'Conto'),
               'currency', a.currency,
               'attivo', coalesce(a.is_active, true)) AS riga
        FROM public.bank_accounts a
       WHERE a.company_id = p_company
    ) x;
  RETURN v;
END;
$function$;

REVOKE ALL ON FUNCTION private.tes_nome_conto(uuid, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION private.tes_altro_conto(uuid, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.tesoreria_conti(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.tesoreria_conti(uuid) TO authenticated, service_role;

-- L'elenco dei movimenti: il nome del conto passa dalla regola di sopra. La funzione è lunga e viva,
-- quindi si cambia il solo punto che serve e si rifiuta se quel punto non c'è più.
DO $patch$
DECLARE
  d text := pg_get_functiondef('public.bank_movimenti_elenco(uuid,jsonb,integer,integer)'::regprocedure);
  n text;
  vecchio text := 'coalesce(a.display_name,a.account_name,''Conto'') account_name';
  nuovo   text := 'coalesce(nullif(btrim(a.display_name),''''),private.tes_nome_conto(p_company,a.id),nullif(btrim(a.account_name),''''),''Conto'') account_name';
BEGIN
  IF position(nuovo in d) > 0 THEN RETURN; END IF;
  n := replace(d, vecchio, nuovo);
  IF n = d THEN
    RAISE EXCEPTION 'bank_movimenti_elenco: il punto da cambiare non c''è più, la patch del nome del conto va rifatta a mano';
  END IF;
  EXECUTE n;
END
$patch$;

COMMENT ON FUNCTION public.tesoreria_conti(uuid) IS
  'I conti dell''azienda col nome che si legge: quello scelto dall''azienda, oppure banca e ultime '
  'cifre dell''IBAN. Stessa regola dell''elenco dei movimenti.';
