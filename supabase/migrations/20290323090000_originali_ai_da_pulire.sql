-- Originali dei contratti letti con l'AI e mai entrati in una commessa (14/11/2026).
--
-- Prima che la commessa esista, il lettore AI carica l'originale in
-- documenti-smart/<azienda>/ai-contratti/<sha>-nome; alla creazione collegaOriginaleAi
-- lo COPIA nei documenti della commessa. Se la commessa non nasce, il file resta lì
-- per sempre. Il cron cleanup-capture-orphans (ogni notte) chiede a questa funzione
-- quali togliere: più vecchi di p_giorni e non citati da un'ipotesi del simulatore
-- (generale_ipotesi.dati.importazione.originale li conserva finché l'operazione
-- non si crea). Quelli già copiati in una commessa sono doppioni: si tolgono anche loro.
--
-- Una bozza di nuova commessa sta nel browser (localStorage): se è ferma da più di
-- p_giorni, alla riapertura la pagina dice «Ricarica il contratto prima di creare
-- la commessa».

CREATE OR REPLACE FUNCTION public.originali_ai_da_pulire(p_giorni int DEFAULT 30, p_limite int DEFAULT 200)
RETURNS SETOF text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $function$
  select o.name
    from storage.objects o
   where o.bucket_id = 'documenti-smart'
     and o.name ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/ai-contratti/[^/]+$'
     and o.created_at < now() - make_interval(days => greatest(coalesce(p_giorni, 30), 7))
     and not exists (
       select 1 from public.generale_ipotesi g
        where g.dati -> 'importazione' -> 'originale' ->> 'path' = o.name
     )
   order by o.created_at
   limit least(greatest(coalesce(p_limite, 200), 1), 1000);
$function$;

REVOKE ALL ON FUNCTION public.originali_ai_da_pulire(int, int) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.originali_ai_da_pulire(int, int) TO service_role;
