-- F5-04 + F2-12 — Briefing operativo e diritto di accesso che funziona.
-- Applicate a produzione via MCP il 2026-09-05.
--
-- F5-04 BRIEFING OPERATIVO
-- L'infrastruttura di briefing esisteva già e girava ogni giorno, ma guardava
-- marketing e vendite. Le cose che fanno perdere clienti e soldi — un job
-- rotto, un insoluto che matura, un trial che scade, un cliente che smette di
-- entrare — non comparivano finché non era tardi.
-- `admin_briefing_operativo()` raccoglie sette controlli in un elenco ordinato
-- per urgenza, una riga ciascuno, ognuno con dove andare. Sta in poche righe di
-- proposito: se ne servissero venti nessuno lo leggerebbe.
--
-- F2-12 GDPR — IL BUCKET NON ESISTEVA
-- `gdpr-compliance` genera l'export dei dati di un utente e lo carica nel
-- bucket `gdpr-exports`, poi ne firma l'URL. Quel bucket NON ESISTEVA:
-- l'upload sarebbe fallito a ogni richiesta e la funzione avrebbe restituito
-- errore a chiunque avesse esercitato l'art. 15 del GDPR. Nessuno se n'era
-- accorto perché nessuna richiesta è mai stata processata — gdpr_data_requests
-- ha zero righe. Collaudare voleva dire scoprire questo.
-- Creato privato, con purge a 30 giorni: un export contiene i dati personali
-- completi di una persona e non deve restare per sempre.

INSERT INTO storage.buckets (id, name, public, file_size_limit)
VALUES ('gdpr-exports', 'gdpr-exports', false, 52428800)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "gdpr_exports_super_admin" ON storage.objects;
CREATE POLICY "gdpr_exports_super_admin"
  ON storage.objects FOR ALL TO authenticated
  USING (bucket_id = 'gdpr-exports' AND public.is_super_admin(auth.uid()))
  WITH CHECK (bucket_id = 'gdpr-exports' AND public.is_super_admin(auth.uid()));

CREATE OR REPLACE FUNCTION public.purge_gdpr_exports()
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public', 'storage' AS $function$
DECLARE v_n integer;
BEGIN
  DELETE FROM storage.objects
   WHERE bucket_id = 'gdpr-exports' AND created_at < now() - interval '30 days';
  GET DIAGNOSTICS v_n = ROW_COUNT;
  IF v_n > 0 THEN RAISE LOG 'purge export GDPR: rimossi % file scaduti', v_n; END IF;
  RETURN v_n;
END; $function$;

REVOKE ALL ON FUNCTION public.purge_gdpr_exports() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.purge_gdpr_exports() TO service_role;

SELECT cron.schedule('purge-gdpr-exports', '15 3 * * *',
  $$SELECT public.purge_gdpr_exports()$$);

-- admin_briefing_operativo() è applicata via MCP: sette controlli (job rotti,
-- clienti paganti a rischio, insoluti in sospensione stanotte, trial in
-- scadenza a 3 giorni, integrazioni degradate, aziende prossime al purge,
-- aziende attive ferme da 3 settimane).
