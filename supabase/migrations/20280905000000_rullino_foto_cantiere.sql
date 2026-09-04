-- ============================================================================
-- Rullino foto di cantiere — tappa 1
-- ============================================================================
-- Il bucket `foto-cantiere` era privato ma SENZA NESSUNA POLICY: qualunque
-- upload falliva con violazione RLS. È il motivo per cui la tabella
-- `foto_cantiere`, l'hook `useFotoCantiere` e i componenti FotoUploader/
-- FotoGrid/FotoCard sono rimasti orfani: l'infrastruttura c'era tutta ma
-- fisicamente non poteva funzionare.
--
-- Qui si aprono le policy (scoped per azienda sul primo segmento del path,
-- che è già il company_id) e si chiude `campo-rapportini`, rimasto pubblico:
-- foto di cantiere, firme e PDF erano scaricabili da chiunque avesse l'URL.
-- Il frontend firma già questi link (`BUCKET_RISERVATI` in
-- src/lib/storage/fileRiservati.ts include campo-rapportini), quindi la
-- chiusura non rompe la UI.
-- ============================================================================

-- ─── 1. foto-cantiere: policy per azienda ───────────────────────────────────
-- Path: <company_id>/<order_id|senza-ordine>/<timestamp>-<nome>

DROP POLICY IF EXISTS foto_cantiere_storage_select ON storage.objects;
CREATE POLICY foto_cantiere_storage_select ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'foto-cantiere'
    AND (storage.foldername(name))[1] = (
      SELECT p.company_id::text FROM public.profiles p WHERE p.id = auth.uid()
    )
  );

DROP POLICY IF EXISTS foto_cantiere_storage_insert ON storage.objects;
CREATE POLICY foto_cantiere_storage_insert ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'foto-cantiere'
    AND (storage.foldername(name))[1] = (
      SELECT p.company_id::text FROM public.profiles p WHERE p.id = auth.uid()
    )
  );

DROP POLICY IF EXISTS foto_cantiere_storage_delete ON storage.objects;
CREATE POLICY foto_cantiere_storage_delete ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'foto-cantiere'
    AND (storage.foldername(name))[1] = (
      SELECT p.company_id::text FROM public.profiles p WHERE p.id = auth.uid()
    )
  );

-- ─── 2. campo-rapportini: da pubblico a privato ─────────────────────────────

UPDATE storage.buckets SET public = false WHERE id = 'campo-rapportini';

-- La vecchia `campo_rapportini_read` lasciava leggere QUALUNQUE utente
-- autenticato, anche di un altro tenant. Si stringe alla propria azienda.
DROP POLICY IF EXISTS campo_rapportini_read ON storage.objects;
CREATE POLICY campo_rapportini_read ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'campo-rapportini'
    AND (storage.foldername(name))[1] = (
      SELECT p.company_id::text FROM public.profiles p WHERE p.id = auth.uid()
    )
  );

DROP POLICY IF EXISTS campo_rapportini_upload ON storage.objects;
CREATE POLICY campo_rapportini_upload ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'campo-rapportini'
    AND (storage.foldername(name))[1] = (
      SELECT p.company_id::text FROM public.profiles p WHERE p.id = auth.uid()
    )
  );
