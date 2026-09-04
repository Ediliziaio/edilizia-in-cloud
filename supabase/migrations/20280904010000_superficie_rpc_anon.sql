-- Ondata 0.1 — Chiudere l'accesso ai dati senza login (parte 2: la superficie)
--
-- Stato prima dell'intervento, misurato in produzione:
--   935 funzioni in public (esclusi trigger ed estensioni)
--   461 eseguibili da `anon`, di cui 404 SECURITY DEFINER (scavalcano la RLS)
--   396 con EXECUTE concesso a PUBLIC: revocare solo ad `anon` non basterebbe,
--       il privilegio rientrerebbe dalla porta di PUBLIC.
--
-- La superficie pubblica vera, misurata e non stimata:
--   * browser senza sessione  -> 9 RPC, tutte protette da un token nell'URL
--     (firma OdV/SAL, profilo talent, recensione pubblica, portale cliente)
--   * flussi pubblici lato server (lead, QR, recensioni, prenotazioni,
--     form-render/form-submit, widget chat, checkout) -> tutti edge function
--     che usano SERVICE_ROLE_KEY: la revoca ad `anon` non li tocca.
--   * 24 h di log PostgREST: nessuna chiamata RPC con ruolo `anon` oltre alle
--     sonde di questo intervento.
--
-- Non basta però un elenco scritto a mano. Le espressioni di RLS, i CHECK, i
-- default e gli indici vengono valutati *con i privilegi di chi interroga*:
-- togliere EXECUTE ad `anon` su una funzione usata da una policy romperebbe la
-- lettura di quella tabella invece di proteggerla. Per questo la superficie
-- consentita si calcola, non si copia: elenco esplicito + tutto ciò che lo
-- schema richiede. Così resta corretta anche quando lo schema cambia.
--
-- Idempotente: si può rieseguire, ed è pensata per essere rieseguita dopo ogni
-- migrazione che aggiunge funzioni.

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. L'elenco esplicito, dichiarato nel database (non solo in questo file)
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.rpc_pubbliche (
  nome_funzione text PRIMARY KEY,
  motivo        text NOT NULL,
  aggiunta_il   timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.rpc_pubbliche IS
  'Le uniche RPC che un visitatore senza login può chiamare. Ogni riga va '
  'motivata. public.rpc_anon_applica_superficie() rende lo stato del database '
  'uguale a questo elenco.';

ALTER TABLE public.rpc_pubbliche ENABLE ROW LEVEL SECURITY;
-- Nessuna policy: nessuno la legge dal client. Solo il service role e il
-- proprietario, che la RLS non riguarda.
REVOKE ALL ON TABLE public.rpc_pubbliche FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.rpc_pubbliche TO service_role;

INSERT INTO public.rpc_pubbliche (nome_funzione, motivo) VALUES
  ('odv_view_by_token',              'Firma OdV: /firma-odv/:token, il token è la credenziale'),
  ('odv_sign_with_token',            'Firma OdV: accettazione da parte del destinatario'),
  ('odv_reject_with_token',          'Firma OdV: rifiuto da parte del destinatario'),
  ('sal_view_by_token',              'Firma SAL committente: /firma-sal/:token'),
  ('sal_sign_with_token',            'Firma SAL committente: apposizione firma'),
  ('hr_talent_public_session',       'Profilo talent pubblico: /talent-profile/:token'),
  ('hr_talent_public_save_answers',  'Profilo talent pubblico: salvataggio risposte'),
  ('submit_public_reputation_review','Recensione pubblica: /review/:companyId'),
  ('valida_portale_token',           'Portale cliente: convalida del token prima della sessione')
ON CONFLICT (nome_funzione) DO UPDATE SET motivo = EXCLUDED.motivo;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. Cosa `anon` deve poter eseguire, calcolato dallo schema
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.rpc_anon_superficie_attesa()
RETURNS TABLE(nome_funzione text, motivo text)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  -- (a) l'elenco esplicito
  SELECT w.nome_funzione, w.motivo FROM public.rpc_pubbliche w
  UNION
  -- (b) le funzioni che lo schema valuta con i privilegi di chi interroga:
  --     policy RLS, CHECK, default di colonna, colonne generate, indici, viste.
  --     Togliere EXECUTE qui non protegge nulla: rompe la lettura.
  SELECT p.proname, 'usata da policy/vincolo/indice: senza EXECUTE la tabella non si legge'
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public'
    AND EXISTS (
      SELECT 1 FROM (
        SELECT coalesce(pg_get_expr(pol.polqual, pol.polrelid), '') || ' ' ||
               coalesce(pg_get_expr(pol.polwithcheck, pol.polrelid), '') AS e
        FROM pg_policy pol
        JOIN pg_class c ON c.oid = pol.polrelid
        JOIN pg_namespace cn ON cn.oid = c.relnamespace
        WHERE cn.nspname = 'public'
        UNION ALL
        SELECT pg_get_constraintdef(con.oid)
        FROM pg_constraint con
        JOIN pg_class c ON c.oid = con.conrelid
        JOIN pg_namespace cn ON cn.oid = c.relnamespace
        WHERE cn.nspname = 'public' AND con.contype = 'c'
        UNION ALL
        SELECT pg_get_expr(ad.adbin, ad.adrelid)
        FROM pg_attrdef ad
        JOIN pg_class c ON c.oid = ad.adrelid
        JOIN pg_namespace cn ON cn.oid = c.relnamespace
        WHERE cn.nspname = 'public'
        UNION ALL
        SELECT pg_get_indexdef(i.indexrelid)
        FROM pg_index i
        JOIN pg_class c ON c.oid = i.indrelid
        JOIN pg_namespace cn ON cn.oid = c.relnamespace
        WHERE cn.nspname = 'public' AND (i.indexprs IS NOT NULL OR i.indpred IS NOT NULL)
        UNION ALL
        SELECT pg_get_viewdef(c.oid)
        FROM pg_class c
        JOIN pg_namespace cn ON cn.oid = c.relnamespace
        WHERE cn.nspname = 'public' AND c.relkind IN ('v', 'm')
      ) src
      WHERE src.e ~ ('(^|[^a-z0-9_])' || p.proname || '\s*\(')
    );
$function$;

REVOKE ALL ON FUNCTION public.rpc_anon_superficie_attesa() FROM PUBLIC, anon, authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. L'applicazione: rende il database uguale alla superficie attesa
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.rpc_anon_applica_superficie()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  r            record;
  v_attesa     text[];
  v_revocate   int := 0;
  v_mantenute  int := 0;
  v_elenco     text[] := '{}';
BEGIN
  SELECT array_agg(DISTINCT nome_funzione) INTO v_attesa
  FROM public.rpc_anon_superficie_attesa();
  v_attesa := coalesce(v_attesa, '{}');

  FOR r IN
    SELECT p.oid::regprocedure::text AS sig,
           p.proname,
           has_function_privilege('authenticated', p.oid, 'EXECUTE') AS authed,
           has_function_privilege('anon', p.oid, 'EXECUTE')          AS anon_ora
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    LEFT JOIN pg_depend d ON d.objid = p.oid AND d.deptype = 'e'
    WHERE n.nspname = 'public'
      AND p.prokind = 'f'
      AND d.objid IS NULL
      AND p.prorettype NOT IN ('trigger'::regtype, 'event_trigger'::regtype)
  LOOP
    -- Chi è autenticato e il service role oggi passano (anche) da PUBLIC:
    -- si rende esplicito il loro privilegio PRIMA di togliere PUBLIC, così
    -- nessun utente legittimo perde nulla.
    IF r.authed THEN
      EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated', r.sig);
    END IF;
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role', r.sig);
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC', r.sig);

    IF r.proname = ANY(v_attesa) THEN
      EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO anon', r.sig);
      v_mantenute := v_mantenute + 1;
    ELSE
      EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM anon', r.sig);
      IF r.anon_ora THEN
        v_revocate := v_revocate + 1;
        v_elenco := v_elenco || r.sig;
      END IF;
    END IF;
  END LOOP;

  RETURN jsonb_build_object(
    'revocate_ora', v_revocate,
    'mantenute_ad_anon', v_mantenute,
    'revocate_elenco', to_jsonb(v_elenco)
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.rpc_anon_applica_superficie() FROM PUBLIC, anon, authenticated;

SELECT public.rpc_anon_applica_superficie();

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. Che la superficie non ricresca da sola
-- ─────────────────────────────────────────────────────────────────────────────
-- Postgres concede EXECUTE a PUBLIC su ogni funzione nuova: senza questo, ogni
-- migrazione futura riaprirebbe un pezzo di superficie senza che nessuno lo
-- decida. Chi è autenticato e il service role continuano a ricevere il
-- privilegio automaticamente, così nessuna migrazione si rompe per una GRANT
-- dimenticata; `anon` no, e va concesso a mano aggiungendo una riga a
-- public.rpc_pubbliche.
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  GRANT EXECUTE ON FUNCTIONS TO authenticated, service_role;
