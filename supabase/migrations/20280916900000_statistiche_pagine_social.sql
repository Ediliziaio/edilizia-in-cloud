-- Statistiche vere di Pagina Facebook e profilo Instagram nel Social Manager.
--
-- La scheda «Analitiche» del Social Manager mostrava numeri inventati
-- (DEMO_ANALYTICS): 12.430 di copertura a chiunque, anche a chi non aveva
-- collegato niente. Da qui in avanti i numeri vengono da Meta.
--
-- Chi scrive: SOLO le edge function con il service role —
--   • meta-ads-sync-insights (cron `meta-ads-sync-insights-4h`, ogni 4 ore),
--     passo aggiuntivo per le aziende con pagine collegate;
--   • meta-api-proxy, azione `sincronizza-statistiche-social` («Aggiorna ora»).
-- Le aziende leggono.
--
-- social_statistiche_giornaliere  una riga per account × giorno
-- social_statistiche_post         ultima fotografia di ogni post / contenuto
-- social_statistiche_stato        esito dell'ultima sincronizzazione per account:
--                                 è qui che si legge «permesso mancante», così
--                                 la UI dice «Ricollega Meta» invece di zeri muti.
--
-- Solo schema, nessuna scrittura di righe: istantanea.

SET LOCAL lock_timeout = '3s';

CREATE TABLE IF NOT EXISTS public.social_statistiche_giornaliere (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  piattaforma text NOT NULL CHECK (piattaforma IN ('facebook', 'instagram')),
  -- id della Pagina Facebook o dell'account Instagram professionale
  account_esterno_id text NOT NULL,
  -- Pagina Facebook da cui passa il token (per Instagram: la pagina collegata)
  pagina_id text NOT NULL,
  giorno date NOT NULL,
  follower integer,
  nuovi_follower integer,
  follower_persi integer,
  -- persone raggiunte nel giorno (FB page_total_media_view_unique, IG reach)
  copertura integer,
  -- visualizzazioni dei contenuti (FB page_media_view, IG views)
  visualizzazioni integer,
  -- interazioni (FB page_post_engagements, IG total_interactions)
  interazioni integer,
  -- visite alla Pagina (FB page_views_total); su IG non esiste più
  visite_profilo integer,
  -- tocchi sui link del profilo (IG profile_links_taps)
  click_link integer,
  -- i valori grezzi con il nome della metrica Meta, per non perdere nulla
  metriche jsonb NOT NULL DEFAULT '{}'::jsonb,
  sincronizzato_il timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT social_statistiche_giornaliere_unica UNIQUE (company_id, piattaforma, account_esterno_id, giorno)
);
CREATE INDEX IF NOT EXISTS social_statistiche_giornaliere_azienda_idx
  ON public.social_statistiche_giornaliere (company_id, giorno DESC);

CREATE TABLE IF NOT EXISTS public.social_statistiche_post (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  piattaforma text NOT NULL CHECK (piattaforma IN ('facebook', 'instagram')),
  account_esterno_id text NOT NULL,
  pagina_id text NOT NULL,
  post_id text NOT NULL,
  pubblicato_il timestamptz,
  -- post, foto, video, reel, carosello
  tipo text,
  testo text,
  permalink text,
  immagine_url text,
  copertura integer,
  visualizzazioni integer,
  -- FB: reazioni; IG: mi piace
  reazioni integer,
  commenti integer,
  condivisioni integer,
  salvataggi integer,
  clic integer,
  interazioni integer,
  metriche jsonb NOT NULL DEFAULT '{}'::jsonb,
  sincronizzato_il timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT social_statistiche_post_unico UNIQUE (company_id, piattaforma, post_id)
);
CREATE INDEX IF NOT EXISTS social_statistiche_post_azienda_idx
  ON public.social_statistiche_post (company_id, pubblicato_il DESC);

CREATE TABLE IF NOT EXISTS public.social_statistiche_stato (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  piattaforma text NOT NULL CHECK (piattaforma IN ('facebook', 'instagram')),
  account_esterno_id text NOT NULL,
  pagina_id text NOT NULL,
  nome text,
  username text,
  follower integer,
  contenuti_totali integer,
  esito text NOT NULL DEFAULT 'mai'
    CHECK (esito IN ('mai', 'ok', 'parziale', 'permesso_mancante', 'errore')),
  messaggio text,
  -- metriche che Meta ha rifiutato come non valide (deprecate o sotto soglia)
  metriche_non_disponibili text[] NOT NULL DEFAULT '{}',
  ultima_sync timestamptz,
  ultima_sync_riuscita timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT social_statistiche_stato_unico UNIQUE (company_id, piattaforma, account_esterno_id)
);

COMMENT ON TABLE public.social_statistiche_giornaliere IS
  'Statistiche giornaliere di Pagina Facebook e profilo Instagram. Scrive solo il service role (meta-ads-sync-insights, meta-api-proxy).';
COMMENT ON TABLE public.social_statistiche_post IS
  'Ultima fotografia delle metriche di ogni post Facebook / contenuto Instagram. Scrive solo il service role.';
COMMENT ON TABLE public.social_statistiche_stato IS
  'Esito dell''ultima sincronizzazione statistiche per account social: permesso_mancante = ricollegare Meta.';

ALTER TABLE public.social_statistiche_giornaliere ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.social_statistiche_post ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.social_statistiche_stato ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS social_statistiche_giornaliere_lettura ON public.social_statistiche_giornaliere;
CREATE POLICY social_statistiche_giornaliere_lettura ON public.social_statistiche_giornaliere
  FOR SELECT TO authenticated
  USING (public.conversazioni_puo_accedere(company_id));

DROP POLICY IF EXISTS social_statistiche_post_lettura ON public.social_statistiche_post;
CREATE POLICY social_statistiche_post_lettura ON public.social_statistiche_post
  FOR SELECT TO authenticated
  USING (public.conversazioni_puo_accedere(company_id));

DROP POLICY IF EXISTS social_statistiche_stato_lettura ON public.social_statistiche_stato;
CREATE POLICY social_statistiche_stato_lettura ON public.social_statistiche_stato
  FOR SELECT TO authenticated
  USING (public.conversazioni_puo_accedere(company_id));

DROP POLICY IF EXISTS blocco_utente_bloccato ON public.social_statistiche_giornaliere;
CREATE POLICY blocco_utente_bloccato ON public.social_statistiche_giornaliere AS RESTRICTIVE
  FOR ALL USING (NOT (SELECT public.utente_bloccato())) WITH CHECK (NOT (SELECT public.utente_bloccato()));

DROP POLICY IF EXISTS blocco_utente_bloccato ON public.social_statistiche_post;
CREATE POLICY blocco_utente_bloccato ON public.social_statistiche_post AS RESTRICTIVE
  FOR ALL USING (NOT (SELECT public.utente_bloccato())) WITH CHECK (NOT (SELECT public.utente_bloccato()));

DROP POLICY IF EXISTS blocco_utente_bloccato ON public.social_statistiche_stato;
CREATE POLICY blocco_utente_bloccato ON public.social_statistiche_stato AS RESTRICTIVE
  FOR ALL USING (NOT (SELECT public.utente_bloccato())) WITH CHECK (NOT (SELECT public.utente_bloccato()));

REVOKE ALL ON public.social_statistiche_giornaliere FROM PUBLIC, anon;
REVOKE ALL ON public.social_statistiche_post FROM PUBLIC, anon;
REVOKE ALL ON public.social_statistiche_stato FROM PUBLIC, anon;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.social_statistiche_giornaliere FROM authenticated;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.social_statistiche_post FROM authenticated;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.social_statistiche_stato FROM authenticated;
GRANT SELECT ON public.social_statistiche_giornaliere TO authenticated;
GRANT SELECT ON public.social_statistiche_post TO authenticated;
GRANT SELECT ON public.social_statistiche_stato TO authenticated;
GRANT ALL ON public.social_statistiche_giornaliere TO service_role;
GRANT ALL ON public.social_statistiche_post TO service_role;
GRANT ALL ON public.social_statistiche_stato TO service_role;
