-- Social: «collegata» vuol dire «può pubblicare», e se no si dice perché (24/09/2026).
--
-- La pagina /azienda/marketing/social contava «collegata» ogni riga attiva di
-- social_accounts. Ma una pagina può esserci e non poter pubblicare:
--  - il token Meta è scaduto (Demo Azienda e Ser Style, quel giorno);
--  - Meta non ha dato il permesso di pubblicare: il gruppo «post» è in
--    «revisione» (platform_settings.meta_permessi_modalita), e il collegamento
--    lo chiede solo al super admin (vedi _shared/metaPermessi.ts);
--  - per Instagram, la pagina non ha un account business collegato.
-- Il post si scriveva, si programmava e falliva all'uscita.
--
-- stato_pubblicazione_social(azienda) risponde, pagina per pagina, se può
-- pubblicare adesso e, se no, con quale motivo. Non restituisce token né
-- l'elenco dei permessi.
--
-- I permessi vengono da integration_credentials.granted_scopes, scritti dal
-- collegamento (meta-oauth-callback). Chi si è collegato prima che li salvasse
-- ha l'elenco vuoto («permessi_da_verificare»): la pagina Social chiama allora
-- meta-api-proxy «get-permissions», che li chiede a Meta e li salva.

CREATE OR REPLACE FUNCTION public.stato_pubblicazione_social(p_company_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_testo text;
  v_modalita text := '';
  v_integrazione public.integrations%ROWTYPE;
  v_ha_credenziali boolean := false;
  v_scade timestamptz;
  v_permessi text[];
  v_token_pagine jsonb;
  v_collegata boolean := false;
  v_scaduta boolean := false;
  v_pagine jsonb;
BEGIN
  IF NOT public.user_can_access_company(p_company_id) THEN
    RAISE EXCEPTION 'Azienda non accessibile' USING ERRCODE = '42501';
  END IF;

  -- Modalità del gruppo «post», letta come leggiModalita() nelle edge function.
  SELECT ps.value INTO v_testo FROM public.platform_settings ps WHERE ps.key = 'meta_permessi_modalita';
  BEGIN
    v_modalita := lower(trim(coalesce(v_testo::jsonb ->> 'post', '')));
  EXCEPTION WHEN others THEN
    v_modalita := '';
  END;
  v_modalita := CASE
    WHEN v_modalita IN ('attivo', 'true') THEN 'attivo'
    WHEN v_modalita IN ('revisione', 'review') THEN 'revisione'
    ELSE 'spento'
  END;

  SELECT * INTO v_integrazione
    FROM public.integrations i
   WHERE i.company_id = p_company_id AND i.provider = 'meta'
   ORDER BY i.updated_at DESC
   LIMIT 1;

  IF v_integrazione.id IS NOT NULL THEN
    SELECT true,
           ic.expires_at,
           CASE WHEN jsonb_typeof(ic.granted_scopes) = 'array'
                THEN ARRAY(SELECT jsonb_array_elements_text(ic.granted_scopes))
                ELSE '{}'::text[] END,
           coalesce(ic.meta_page_tokens, '{}'::jsonb)
      INTO v_ha_credenziali, v_scade, v_permessi, v_token_pagine
      FROM public.integration_credentials ic
     WHERE ic.integration_id = v_integrazione.id
     LIMIT 1;
    v_ha_credenziali := coalesce(v_ha_credenziali, false);
    v_collegata := v_ha_credenziali AND v_integrazione.status <> 'disconnected';
    v_scaduta := v_integrazione.status = 'token_expired' OR (v_scade IS NOT NULL AND v_scade <= now());
  END IF;
  v_permessi := coalesce(v_permessi, '{}'::text[]);
  v_token_pagine := coalesce(v_token_pagine, '{}'::jsonb);

  SELECT coalesce(jsonb_agg(righe.pagina ORDER BY righe.piattaforma, righe.nome), '[]'::jsonb)
    INTO v_pagine
    FROM (
      SELECT sa.platform_id AS piattaforma,
             sa.page_name AS nome,
             jsonb_build_object(
               'id', sa.id,
               'piattaforma', sa.platform_id,
               'page_id', sa.page_id,
               'nome', sa.page_name,
               'motivo', m.motivo,
               'puo_pubblicare', m.motivo = 'ok'
             ) AS pagina
        FROM public.social_accounts sa
        CROSS JOIN LATERAL (
          SELECT CASE
            WHEN NOT v_collegata THEN 'nessuna_integrazione'
            WHEN v_scaduta THEN 'token_scaduto'
            WHEN sa.platform_id NOT IN ('facebook', 'instagram') THEN 'piattaforma_non_supportata'
            WHEN NOT (v_token_pagine ? sa.page_id) THEN 'pagina_senza_token'
            WHEN cardinality(v_permessi) = 0 THEN 'permessi_da_verificare'
            WHEN NOT (
              CASE sa.platform_id
                WHEN 'facebook' THEN 'pages_manage_posts' = ANY (v_permessi)
                ELSE 'instagram_basic' = ANY (v_permessi) AND 'instagram_content_publish' = ANY (v_permessi)
              END
            ) THEN CASE v_modalita
                     WHEN 'attivo' THEN 'permesso_mancante'
                     WHEN 'revisione' THEN 'in_approvazione_meta'
                     ELSE 'pubblicazione_non_attiva'
                   END
            WHEN sa.platform_id = 'instagram' AND NOT EXISTS (
              SELECT 1
                FROM public.meta_assets ma
               WHERE ma.integration_id = v_integrazione.id
                 AND ma.asset_type = 'page'
                 AND ma.asset_id = sa.page_id
                 AND ma.metadata -> 'instagram_business_account' ->> 'id' IS NOT NULL
            ) THEN 'instagram_senza_account_business'
            ELSE 'ok'
          END AS motivo
        ) m
       WHERE sa.company_id = p_company_id
         AND sa.is_active
    ) righe;

  RETURN jsonb_build_object(
    'modalita_post', v_modalita,
    'integrazione', CASE WHEN v_integrazione.id IS NULL THEN NULL ELSE jsonb_build_object(
      'id', v_integrazione.id,
      'stato', v_integrazione.status,
      'scade_il', v_scade,
      'scaduta', v_scaduta,
      'permessi_noti', cardinality(v_permessi) > 0
    ) END,
    'pagine', v_pagine
  );
END;
$$;

COMMENT ON FUNCTION public.stato_pubblicazione_social(uuid) IS
  'Per ogni pagina social dell''azienda: può pubblicare adesso? Se no, il motivo (token scaduto, permesso Meta in approvazione, ...). Nessun token in uscita.';

REVOKE ALL ON FUNCTION public.stato_pubblicazione_social(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.stato_pubblicazione_social(uuid) TO authenticated, service_role;
