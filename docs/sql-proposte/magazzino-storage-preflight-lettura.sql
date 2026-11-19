-- SOLA LETTURA. Da eseguire sul servizio effettivo prima del rilascio,
-- solo quando il controllo di quell'ambiente è autorizzato. Non modifica bucket o policy.
BEGIN READ ONLY;
SET LOCAL statement_timeout='10s';
SELECT id,public,file_size_limit,allowed_mime_types
FROM storage.buckets
WHERE id IN ('goods_receipts','foto-cantiere','order-attachments','ddt_attachments','ddt-ricezione') ORDER BY id;
SELECT policyname,cmd,roles,qual,with_check FROM pg_policies
WHERE schemaname='storage' AND tablename='objects' ORDER BY policyname;
SELECT relname,relrowsecurity FROM pg_class WHERE oid='storage.objects'::regclass;
SELECT p.proname,pg_get_function_identity_arguments(p.oid),p.prosecdef,
 has_function_privilege('anon',p.oid,'EXECUTE') AS anon_execute
FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
WHERE n.nspname='public' AND (p.proname LIKE 'warehouse_%' OR p.proname LIKE 'wh_%'
 OR p.proname IN ('insert_goods_receipt_atomic','receive_from_oda_via_scans','create_ddt_from_uscita'))
ORDER BY p.proname;
ROLLBACK;
-- I riferimenti privati nel client non sostituiscono bucket privato e RLS.
-- Verificare upload/download consentito per l'azienda corrente e rifiutato per anon/altra azienda.
