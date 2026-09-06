-- Il tracciamento del sito, acceso ieri, ha raccolto 1.621 pagine viste in
-- trenta ore. Sembrano tante per un sito da poche centinaia di visite
-- organiche al mese, e infatti non lo sono: 1.557 su 1.621, il 96%, sono di
-- sette "visitatori" che hanno guardato 243 pagine in novanta secondi l'uno.
--
-- Duecentoquarantatré è il numero di pagine che il build prerenderizza. Ogni
-- deploy su Cloudflare manda il crawler di prerender su tutte le pagine, il
-- tracciamento lo conta come una persona, e ieri di deploy ce ne sono stati
-- sette. Le visite vere, nello stesso periodo, erano 64.
--
-- Due conseguenze: le classifiche delle pagine sono dominate dal crawler, e
-- ogni pubblicazione peggiora il rumore. Qui si ripulisce lo storico; il
-- filtro che impedisce di riempirla di nuovo sta nella edge function e nel
-- client, perché è lì che si riconosce chi sta chiedendo la pagina.

-- Quanto tempo è stato su questa pagina. Senza, alla domanda "dove si
-- fermano gli utenti" si può rispondere solo con l'ultima pagina vista, che
-- dice dove escono ma non se hanno letto o rimbalzato in due secondi.
ALTER TABLE public.attribution_pageviews
  ADD COLUMN IF NOT EXISTS durata_ms int,
  ADD COLUMN IF NOT EXISTS client_id text;

COMMENT ON COLUMN public.attribution_pageviews.durata_ms IS
  'Millisecondi di permanenza sulla pagina, misurati dal browser e inviati quando la scheda viene nascosta o chiusa. NULL se il visitatore ha chiuso in modo che il beacon non è partito.';
COMMENT ON COLUMN public.attribution_pageviews.client_id IS
  'Identificativo generato dal browser per questa specifica vista: serve al beacon di uscita per aggiornare la riga giusta senza poterne toccare altre.';

CREATE INDEX IF NOT EXISTS attribution_pageviews_client_idx
  ON public.attribution_pageviews (client_id) WHERE client_id IS NOT NULL;

-- Indici per le classifiche: oggi la tabella è piccola, ma le domande che le
-- si faranno sono sempre "per pagina" e "per periodo".
CREATE INDEX IF NOT EXISTS attribution_pageviews_path_idx ON public.attribution_pageviews (path, viewed_at DESC);
CREATE INDEX IF NOT EXISTS attribution_pageviews_sessione_idx ON public.attribution_pageviews (session_id, viewed_at);

-- Pulizia dello storico: via il crawler, restano le visite vere.
-- Cinquanta pagine dallo stesso visitatore è una soglia larga — la sessione
-- umana più lunga in tabella ne ha dodici in dodici ore.
WITH robot AS (
  SELECT visitor_id
    FROM public.attribution_pageviews
   WHERE visitor_id IS NOT NULL
   GROUP BY visitor_id
  HAVING count(*) >= 50
), sessioni_robot AS (
  SELECT DISTINCT session_id FROM public.attribution_pageviews
   WHERE visitor_id IN (SELECT visitor_id FROM robot)
), cancellate AS (
  DELETE FROM public.attribution_pageviews
   WHERE visitor_id IN (SELECT visitor_id FROM robot)
  RETURNING 1
)
DELETE FROM public.attribution_sessions
 WHERE session_id IN (SELECT session_id FROM sessioni_robot);
