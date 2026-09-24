-- Social: post, file e pagine social con lo stesso criterio di
-- user_can_access_company (24/09/2026).
--
-- Le policy social_posts_company_access, social_media_items_company_access e
-- social_accounts_company_access (20260523092000_social_manager_core) aprivano
-- l'azienda a chi aveva una riga qualsiasi in multi_company_access: anche un
-- accesso sospeso, un invito mai accettato o un accesso scaduto.
-- user_can_access_company vuole status = 'active' ed expires_at vuoto o futuro.
-- E social_posts e social_media_items non escludevano il cliente esterno (solo
-- il ruolo customer): con il portale clienti acceso e il cliente sbloccato,
-- avrebbe letto, modificato e cancellato post e file social dell'azienda.
-- social_accounts lo escludeva in lettura ma non nel WITH CHECK: poteva creare
-- pagine social.
--
-- Provato prima di correggere, in una transazione annullata: con l'accesso
-- sospeso, invitato o scaduto si leggevano i 47 post dell'azienda di prova, e
-- si modificavano, cancellavano e creavano; il cliente esterno faceva lo stesso
-- su post e file, e creava pagine. Il 24/09 le 12 righe di multi_company_access
-- erano tutte attive e senza scadenza, e nessuna azienda aveva il portale
-- clienti acceso: nessuno era esposto, il buco era latente.
--
-- Il criterio, ramo per ramo come user_can_access_company:
--   - l'azienda del profilo (get_user_company_id: NULL per anonimo e bloccato);
--   - un accesso multi-azienda attivo e non scaduto;
--   - il super admin;
-- e mai il cliente esterno, in lettura come in scrittura.
-- Resta fuori il ramo del commercialista (can_accountant_access_company): post,
-- file e pagine social non erano suoi e non lo diventano.
--
-- Non si chiama user_can_access_company(company_id): prende la colonna della
-- riga, quindi girerebbe una volta per riga. Qui le funzioni stanno tra
-- (SELECT …) e girano una volta per richiesta, e gli accessi multi-azienda sono
-- un sottoquery che non dipende dalla riga, calcolato una volta.
-- Le RESTRICTIVE blocco_utente_bloccato restano come sono.

SET LOCAL lock_timeout = '3s';

-- social_posts: bozze, approvazioni e pianificazioni
DROP POLICY IF EXISTS social_posts_company_access ON public.social_posts;
CREATE POLICY social_posts_company_access ON public.social_posts
  AS PERMISSIVE
  FOR ALL TO authenticated
  USING (
    (
      company_id = (SELECT public.get_user_company_id((SELECT auth.uid())))
      OR company_id IN (
        SELECT m.company_id
          FROM public.multi_company_access m
         WHERE m.user_id = (SELECT auth.uid())
           AND m.status = 'active'
           AND (m.expires_at IS NULL OR m.expires_at > now())
      )
      OR (SELECT public.has_role((SELECT auth.uid()), 'super_admin'::public.app_role))
    )
    AND NOT (SELECT public.utente_e_cliente_esterno())
  )
  WITH CHECK (
    (
      company_id = (SELECT public.get_user_company_id((SELECT auth.uid())))
      OR company_id IN (
        SELECT m.company_id
          FROM public.multi_company_access m
         WHERE m.user_id = (SELECT auth.uid())
           AND m.status = 'active'
           AND (m.expires_at IS NULL OR m.expires_at > now())
      )
      OR (SELECT public.has_role((SELECT auth.uid()), 'super_admin'::public.app_role))
    )
    AND NOT (SELECT public.utente_e_cliente_esterno())
  );

-- social_media_items: la libreria di foto e video
DROP POLICY IF EXISTS social_media_items_company_access ON public.social_media_items;
CREATE POLICY social_media_items_company_access ON public.social_media_items
  AS PERMISSIVE
  FOR ALL TO authenticated
  USING (
    (
      company_id = (SELECT public.get_user_company_id((SELECT auth.uid())))
      OR company_id IN (
        SELECT m.company_id
          FROM public.multi_company_access m
         WHERE m.user_id = (SELECT auth.uid())
           AND m.status = 'active'
           AND (m.expires_at IS NULL OR m.expires_at > now())
      )
      OR (SELECT public.has_role((SELECT auth.uid()), 'super_admin'::public.app_role))
    )
    AND NOT (SELECT public.utente_e_cliente_esterno())
  )
  WITH CHECK (
    (
      company_id = (SELECT public.get_user_company_id((SELECT auth.uid())))
      OR company_id IN (
        SELECT m.company_id
          FROM public.multi_company_access m
         WHERE m.user_id = (SELECT auth.uid())
           AND m.status = 'active'
           AND (m.expires_at IS NULL OR m.expires_at > now())
      )
      OR (SELECT public.has_role((SELECT auth.uid()), 'super_admin'::public.app_role))
    )
    AND NOT (SELECT public.utente_e_cliente_esterno())
  );

-- social_accounts: le pagine collegate (i token stanno in social_account_tokens)
DROP POLICY IF EXISTS social_accounts_company_access ON public.social_accounts;
CREATE POLICY social_accounts_company_access ON public.social_accounts
  AS PERMISSIVE
  FOR ALL TO authenticated
  USING (
    (
      company_id = (SELECT public.get_user_company_id((SELECT auth.uid())))
      OR company_id IN (
        SELECT m.company_id
          FROM public.multi_company_access m
         WHERE m.user_id = (SELECT auth.uid())
           AND m.status = 'active'
           AND (m.expires_at IS NULL OR m.expires_at > now())
      )
      OR (SELECT public.has_role((SELECT auth.uid()), 'super_admin'::public.app_role))
    )
    AND NOT (SELECT public.utente_e_cliente_esterno())
  )
  WITH CHECK (
    (
      company_id = (SELECT public.get_user_company_id((SELECT auth.uid())))
      OR company_id IN (
        SELECT m.company_id
          FROM public.multi_company_access m
         WHERE m.user_id = (SELECT auth.uid())
           AND m.status = 'active'
           AND (m.expires_at IS NULL OR m.expires_at > now())
      )
      OR (SELECT public.has_role((SELECT auth.uid()), 'super_admin'::public.app_role))
    )
    AND NOT (SELECT public.utente_e_cliente_esterno())
  );
