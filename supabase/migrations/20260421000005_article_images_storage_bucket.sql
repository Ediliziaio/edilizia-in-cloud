-- ============================================================================
-- article-images · Storage bucket per foto articoli di listino
-- ============================================================================
-- Obiettivo:
--   Permettere all'utente di caricare un'immagine preview per ogni articolo
--   (famiglia) del listino preventivi — es. foto del cassonetto, finestra 2
--   ante, ecc. Il URL viene persistito in `article_families.immagine_url`
--   (colonna gia' esistente dalla migration iniziale 20260917000002).
--
-- Layout path: {company_id}/{family_id}.{ext}
--   - segmenta per company_id per RLS scope (una company non vede i file
--     dell'altra)
--   - file name = family_id così un re-upload sovrascrive e mantiene la
--     granularità per-articolo (upsert)
--
-- Bucket pubblico: le immagini articoli vanno referenziate anche nei PDF
-- preventivo emessi al cliente (pattern futuro). Rendere il bucket pubblico
-- evita di dover firmare ogni URL. RLS blocca comunque le write non
-- autorizzate.
-- ============================================================================

-- 1. Bucket (idempotente)
INSERT INTO storage.buckets (id, name, public)
VALUES ('article-images', 'article-images', true)
ON CONFLICT (id) DO NOTHING;

-- 2. RLS INSERT: solo utenti autenticati della company corrispondente
DROP POLICY IF EXISTS "Company users can upload article images" ON storage.objects;
CREATE POLICY "Company users can upload article images"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'article-images'
  AND (storage.foldername(name))[1] = get_user_company_id(auth.uid())::text
);

-- 3. RLS UPDATE (upsert)
DROP POLICY IF EXISTS "Company users can update article images" ON storage.objects;
CREATE POLICY "Company users can update article images"
ON storage.objects FOR UPDATE
TO authenticated
USING (
  bucket_id = 'article-images'
  AND (storage.foldername(name))[1] = get_user_company_id(auth.uid())::text
);

-- 4. RLS DELETE
DROP POLICY IF EXISTS "Company users can delete article images" ON storage.objects;
CREATE POLICY "Company users can delete article images"
ON storage.objects FOR DELETE
TO authenticated
USING (
  bucket_id = 'article-images'
  AND (storage.foldername(name))[1] = get_user_company_id(auth.uid())::text
);

-- 5. RLS SELECT pubblica: il bucket è pubblico, l'accesso in lettura è
--    sempre consentito (le URL sono comunque opache per UUID).
DROP POLICY IF EXISTS "Anyone can view article images" ON storage.objects;
CREATE POLICY "Anyone can view article images"
ON storage.objects FOR SELECT
TO public
USING (bucket_id = 'article-images');

-- 6. Super admin: accesso completo (stesso pattern company-logos)
DROP POLICY IF EXISTS "Super admins can manage all article images" ON storage.objects;
CREATE POLICY "Super admins can manage all article images"
ON storage.objects FOR ALL
TO authenticated
USING (
  bucket_id = 'article-images'
  AND has_role(auth.uid(), 'super_admin')
);

-- 7. Force PostgREST schema cache reload (innocuo, i bucket non sono esposti
--    via PostgREST ma teniamo il pattern coerente con le altre migration).
NOTIFY pgrst, 'reload schema';
