-- ============================================================================
-- Percorso del visitatore sul sito: quali pagine, in che ordine
-- ============================================================================
-- `attribution_sessions` esiste già e sa tenere fonte, campagna, gclid/fbclid
-- e un contatore `pages_viewed` — ma non l'elenco delle pagine, e soprattutto
-- non la scriveva nessuno: 0 righe. La UI di lettura c'è (ContactAttributionTab
-- + ContactTrackingPanel) e mostra "Nessun dato di attribuzione disponibile".
--
-- Il contatore da solo non risponde alla domanda vera: "questo che ha chiesto
-- la demo tre volte, cosa aveva guardato prima?". Serve la sequenza.
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.attribution_pageviews (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id   uuid NOT NULL,
  session_id   text NOT NULL,
  visitor_id   text,
  path         text NOT NULL,
  title        text,
  referrer     text,
  viewed_at    timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.attribution_pageviews IS
  'Pagine viste dai visitatori del sito pubblico, in ordine. Legata a attribution_sessions per session_id: da qui si ricostruisce il percorso che ha portato a una richiesta.';

-- Il percorso si legge sempre per sessione e in ordine di tempo.
CREATE INDEX IF NOT EXISTS idx_attribution_pageviews_sessione
  ON public.attribution_pageviews (session_id, viewed_at);

-- Per le classifiche "da quale pagina arrivano le richieste".
CREATE INDEX IF NOT EXISTS idx_attribution_pageviews_azienda_data
  ON public.attribution_pageviews (company_id, viewed_at DESC);

ALTER TABLE public.attribution_pageviews ENABLE ROW LEVEL SECURITY;

-- Scrive solo la edge function (service_role): il visitatore anonimo non ha
-- accesso diretto, altrimenti chiunque potrebbe riempire la tabella di righe.
DROP POLICY IF EXISTS attribution_pageviews_service_all ON public.attribution_pageviews;
CREATE POLICY attribution_pageviews_service_all ON public.attribution_pageviews
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- Legge chi è dentro l'azienda a cui i dati appartengono.
DROP POLICY IF EXISTS attribution_pageviews_tenant_select ON public.attribution_pageviews;
CREATE POLICY attribution_pageviews_tenant_select ON public.attribution_pageviews
  FOR SELECT TO authenticated
  USING (
    company_id = (SELECT p.company_id FROM public.profiles p WHERE p.id = auth.uid())
  );
