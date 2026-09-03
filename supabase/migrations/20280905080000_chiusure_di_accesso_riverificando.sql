-- ════════════════════════════════════════════════════════════════════════════
-- Ondata 5.5 — quattro chiusure, tre delle quali su codice mio
-- ════════════════════════════════════════════════════════════════════════════
--
-- Rileggendo cosa avevo scritto nelle ondate precedenti, con una sonda invece
-- che a occhio: utente dell'azienda A che chiede i dati dell'azienda B.
-- La maggior parte delle funzioni ha retto. Queste no.

-- ── 1. La vista degli incassi era leggibile da chiunque, per ogni azienda ────
--
-- `fattura_pagamento_stato` non ha `security_invoker`, quindi gira coi diritti
-- di chi l'ha creata e le policy di riga di documenti_fiscali non si applicano.
-- Misurato: l'utente demo dell'azienda 778a2c76 vedeva 35 righe, di cui 34 di
-- un'altra azienda — numeri di fattura, importi, scadenze, stato di incasso.
-- La dashboard filtra `.eq("company_id", …)` nel browser, il che nasconde il
-- problema senza risolverlo: bastava una query diretta.
--
-- Non è un difetto che ho introdotto io — la vista era già così — ma l'ho
-- riscritta nell'ondata 5.4 e adesso è roba mia.
ALTER VIEW public.fattura_pagamento_stato SET (security_invoker = true);

-- ── 2. sconto_max_azienda: mia, dell'ondata 1, senza controllo ──────────────
-- SECURITY DEFINER e nessuna verifica: restituiva il tetto sconto di qualunque
-- azienda a chiunque sapesse il suo id. Un numero solo, ma è comunque un dato
-- di un'altra azienda.
-- I trigger che la usano (valida_sconto_progetto, valida_sconto_fv) girano
-- nella sessione di chi salva la riga, sulla propria azienda: il controllo
-- passa. Il service role passa per la stessa strada.
CREATE OR REPLACE FUNCTION public.sconto_max_azienda(p_company_id uuid)
RETURNS numeric
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT min(dr.sconto_max_pct)
  FROM public.discount_rules dr
  WHERE dr.company_id = p_company_id
    AND public.user_can_access_company(p_company_id)
    AND dr.is_active = true
    AND dr.scope = 'globale'
    AND dr.sconto_max_pct IS NOT NULL;
$function$;

-- ── 3. documento_stornato: mia, dell'ondata 5.4, senza controllo ────────────
-- Chi conoscesse l'id di un documento poteva sapere quanto è stato stornato.
CREATE OR REPLACE FUNCTION public.documento_stornato(p_documento_id uuid)
RETURNS numeric
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT coalesce(sum(coalesce(nc.totale_da_pagare, nc.totale_documento, 0)), 0)
    FROM public.documenti_fiscali nc
   WHERE nc.documento_correlato_id = p_documento_id
     AND nc.tipo = 'nota_credito'
     AND nc.stato NOT IN ('bozza', 'annullata')
     AND nc.deleted_at IS NULL
     AND public.user_can_access_company(nc.company_id);
$function$;

-- ── 4. Le sentinelle erano eseguibili da chiunque ───────────────────────────
--
-- Qui c'è una lezione che vale oltre queste due funzioni. Nell'ondata 0.1 ho
-- messo
--     ALTER DEFAULT PRIVILEGES … GRANT EXECUTE ON FUNCTIONS TO authenticated
-- perché la superficie non ricrescesse verso `anon`. Effetto collaterale: ogni
-- funzione nuova nasce eseguibile da `authenticated`, e un
--     REVOKE ALL … FROM PUBLIC, anon
-- non la toglie, perché il permesso è concesso al ruolo, non a PUBLIC.
-- Risultato: `sentinelle_effetti_cron()` — che scrive notifiche ai super_admin
-- — e `destinatari_allarmi_piattaforma()` — che elenca chi sono — erano
-- chiamabili da qualunque utente autenticato, nonostante avessi scritto una
-- GRANT al solo service_role.
--
-- Da qui in avanti, per una funzione che deve restare interna serve un REVOKE
-- esplicito da `authenticated`.
REVOKE EXECUTE ON FUNCTION public.sentinelle_effetti_cron() FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.destinatari_allarmi_piattaforma() FROM authenticated;
