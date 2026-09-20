-- Aziende senza un backup recente, per il rapporto del mattino.
--
-- Il backup settimanale gira la domenica alle 02:30 UTC e nessuno ne legge la
-- risposta: il cron la fa partire e basta. Il 20/09/2026 le quattro aziende più
-- grandi sono andate in «statement timeout» (il dump unico supera gli 8 secondi
-- di PostgREST) e due erano senza copia già dalla domenica prima. Lo si è
-- scoperto per caso, guardando altro.
--
-- Da oggi quelle aziende si salvano a blocchi (company-backup), e questa
-- funzione dice al rapporto del mattino chi è rimasto senza: un'azienda viva
-- da più di otto giorni, senza nemmeno un file in company-exports negli ultimi
-- otto. Conta qualunque file sotto la cartella dell'azienda: il dump unico
-- (<id>/<data>-backup.json) e i blocchi (<id>/<data>/…).

CREATE OR REPLACE FUNCTION public.ops_backup_mancanti(p_giorni integer DEFAULT 8)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
           'azienda', x.name,
           'ultimo_backup', x.ultimo::date,
           'giorni_senza', CASE WHEN x.ultimo IS NULL THEN NULL ELSE (CURRENT_DATE - x.ultimo::date) END,
           'nota', CASE WHEN x.ultimo IS NULL THEN 'mai salvata' ELSE 'l''ultima copia è vecchia' END
         ) ORDER BY x.ultimo NULLS FIRST), '[]'::jsonb)
  FROM (
    SELECT c.name,
           (SELECT max(o.created_at) FROM storage.objects o
             WHERE o.bucket_id = 'company-exports' AND o.name LIKE c.id::text || '/%') AS ultimo
      FROM public.companies c
     WHERE c.deleted_at IS NULL
       AND c.created_at < now() - make_interval(days => GREATEST(p_giorni, 1))
  ) x
  WHERE x.ultimo IS NULL OR x.ultimo < now() - make_interval(days => GREATEST(p_giorni, 1));
$function$;

REVOKE ALL ON FUNCTION public.ops_backup_mancanti(integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.ops_backup_mancanti(integer) TO service_role;
