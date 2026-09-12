-- Quale pipeline conta come marketing.
--
-- Diversi clienti ne hanno piu' di una e la console le sommava tutte. Best
-- Infissi ne ha quattro: «Infissi» e' quella viva, «Clienti e trattative Zoho»
-- e' l'import storico con 2.160 opportunita' ferme. Contarle insieme gonfia
-- l'imbuto, sporca la classifica delle persone e rende illeggibile il tasso di
-- lavorazione. BeMade ne ha due (17.882 + 2.772), Ener Italia cinque.
--
-- Da qui in avanti ogni contratto puo' dire quali pipeline sono le sue.
-- NULL vuol dire «tutte», che e' il comportamento di prima: nessun numero
-- cambia finche' qualcuno non sceglie.
--
-- Il filtro entra in otto punti delle due RPC grandi (opportunita', vinte,
-- pipeline aperta, imbuto, perse, vendite, e le due basi da cui derivano lead e
-- persone). Riscrivere qui 30 kB di funzioni per aggiungere una condizione
-- seppellirebbe la modifica: la sostituzione e' fatta sul testo gia' installato,
-- con il conteggio delle occorrenze verificato, e fallisce rumorosamente se il
-- testo non e' quello atteso.
--
-- Provato su Best Infissi il 12/09/2026: 62 opportunita' e 11 fasi nell'imbuto
-- con tutte le pipeline, 57 e 10 con la sola «Infissi».

ALTER TABLE public.aedix_service_clients
  ADD COLUMN IF NOT EXISTS mkt_pipeline_ids uuid[];

COMMENT ON COLUMN public.aedix_service_clients.mkt_pipeline_ids IS
  'Quali pipeline del cliente contano come marketing. NULL = tutte.';

DO $migrazione$
DECLARE
  v_def text;
  v_nuova text;
  v_attesi int;
  v_trovati int;
  r record;
  c_join_vecchio constant text := 'JOIN cli ON cli.company_id = o.company_id';
  c_join_nuovo constant text :=
    'JOIN cli ON cli.company_id = o.company_id' || E'\n' ||
    '       AND (cli.mkt_pipeline_ids IS NULL' || E'\n' ||
    '            OR o.stage_id IN (SELECT s0.id FROM public.marketing_pipeline_stages s0' || E'\n' ||
    '                               WHERE s0.pipeline_id = ANY (cli.mkt_pipeline_ids)))';
BEGIN
  FOR r IN
    SELECT * FROM (VALUES
      ('admin_clienti_marketing_riepilogo',
       'SELECT c.id, c.company_id, c.contact_id, c.cliente_nome,',
       'SELECT c.id, c.company_id, c.contact_id, c.cliente_nome, c.mkt_pipeline_ids,',
       3),
      ('admin_cliente_marketing_scheda',
       'SELECT sc.id, sc.company_id, sc.contact_id, sc.cliente_nome,',
       'SELECT sc.id, sc.company_id, sc.contact_id, sc.cliente_nome, sc.mkt_pipeline_ids,',
       5)
    ) AS t(funzione, cli_vecchio, cli_nuovo, join_attesi)
  LOOP
    SELECT pg_get_functiondef(p.oid) INTO v_def
      FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public' AND p.proname = r.funzione;

    IF v_def IS NULL THEN
      RAISE EXCEPTION 'funzione % non trovata', r.funzione;
    END IF;

    -- Gia' applicata? Non si fa niente: la migrazione resta ripetibile.
    IF position('cli.mkt_pipeline_ids IS NULL' IN v_def) > 0 THEN
      CONTINUE;
    END IF;

    v_trovati := (length(v_def) - length(replace(v_def, r.cli_vecchio, ''))) / length(r.cli_vecchio);
    IF v_trovati <> 1 THEN
      RAISE EXCEPTION 'in % la riga del CTE cli compare % volte invece di 1', r.funzione, v_trovati;
    END IF;

    v_attesi := r.join_attesi;
    v_trovati := (length(v_def) - length(replace(v_def, c_join_vecchio, ''))) / length(c_join_vecchio);
    IF v_trovati <> v_attesi THEN
      RAISE EXCEPTION 'in % il join sulle opportunita compare % volte invece di %', r.funzione, v_trovati, v_attesi;
    END IF;

    v_nuova := replace(replace(v_def, r.cli_vecchio, r.cli_nuovo), c_join_vecchio, c_join_nuovo);
    EXECUTE v_nuova;
  END LOOP;
END $migrazione$;

-- ------------------------------------------------------------------
-- Leggere e scegliere le pipeline
-- ------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.admin_cliente_marketing_pipeline(p_service_client_id uuid)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $fn$
  WITH guardia AS (SELECT (SELECT public.mkt_vede_cliente(p_service_client_id)) AS ok),
  cli AS (
    SELECT sc.company_id, sc.mkt_pipeline_ids
      FROM public.aedix_service_clients sc CROSS JOIN guardia
     WHERE sc.id = p_service_client_id AND guardia.ok
  )
  SELECT coalesce(jsonb_agg(to_jsonb(x) ORDER BY x.opportunita DESC), '[]'::jsonb)
    FROM (
      SELECT pl.id, pl.name AS nome,
             (SELECT count(*) FROM public.marketing_opportunities o
               JOIN public.marketing_pipeline_stages s ON s.id = o.stage_id
              WHERE s.pipeline_id = pl.id AND o.deleted_at IS NULL) AS opportunita,
             (SELECT count(*) FROM public.marketing_opportunities o
               JOIN public.marketing_pipeline_stages s ON s.id = o.stage_id
              WHERE s.pipeline_id = pl.id AND o.deleted_at IS NULL
                AND o.created_at >= now() - interval '30 days') AS nuove_30gg,
             (cli.mkt_pipeline_ids IS NULL OR pl.id = ANY (cli.mkt_pipeline_ids)) AS scelta,
             (cli.mkt_pipeline_ids IS NULL) AS tutte
        FROM public.marketing_pipelines pl JOIN cli ON cli.company_id = pl.company_id
    ) x;
$fn$;

COMMENT ON FUNCTION public.admin_cliente_marketing_pipeline(uuid) IS
  'Le pipeline del cliente con quante opportunita contengono e quali contano come marketing.';

REVOKE ALL ON FUNCTION public.admin_cliente_marketing_pipeline(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_cliente_marketing_pipeline(uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.admin_cliente_marketing_pipeline_imposta(
  p_service_client_id uuid,
  p_pipeline_ids uuid[] DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_company uuid;
  v_valide uuid[];
BEGIN
  IF NOT (SELECT public.mkt_vede_cliente(p_service_client_id)) THEN
    RAISE EXCEPTION 'Questo cliente non lo segui tu' USING ERRCODE = '42501';
  END IF;

  SELECT sc.company_id INTO v_company
    FROM public.aedix_service_clients sc WHERE sc.id = p_service_client_id;

  IF v_company IS NULL THEN
    RAISE EXCEPTION 'Contratto senza azienda collegata' USING ERRCODE = 'P0002';
  END IF;

  -- Un elenco vuoto vale come «tutte»: meglio di zero numeri ovunque.
  IF p_pipeline_ids IS NULL OR cardinality(p_pipeline_ids) = 0 THEN
    UPDATE public.aedix_service_clients
       SET mkt_pipeline_ids = NULL, updated_at = now()
     WHERE id = p_service_client_id;
    RETURN jsonb_build_object('ok', true, 'pipeline', NULL, 'tutte', true);
  END IF;

  SELECT array_agg(pl.id) INTO v_valide
    FROM public.marketing_pipelines pl
   WHERE pl.company_id = v_company AND pl.id = ANY (p_pipeline_ids);

  IF v_valide IS NULL THEN
    RAISE EXCEPTION 'Nessuna di quelle pipeline appartiene a questo cliente' USING ERRCODE = '22023';
  END IF;

  UPDATE public.aedix_service_clients
     SET mkt_pipeline_ids = v_valide, updated_at = now()
   WHERE id = p_service_client_id;

  RETURN jsonb_build_object('ok', true, 'pipeline', to_jsonb(v_valide), 'tutte', false);
END;
$fn$;

REVOKE ALL ON FUNCTION public.admin_cliente_marketing_pipeline_imposta(uuid, uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_cliente_marketing_pipeline_imposta(uuid, uuid[]) TO authenticated, service_role;
