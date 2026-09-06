-- Analytics dei siti della rete dentro il SuperAdmin.
--
-- I dati restano qui, non su Google: si scaricano una volta al giorno e si
-- salvano. Chi tiene i numeri solo nella console altrui, il giorno che cambia
-- strumento riparte da zero — ed è già successo con il tracciamento del sito,
-- dove il passato non è ricostruibile.
--
-- Due fonti per sito, e servono entrambe. GA4 dice quanti sono arrivati e cosa
-- hanno fatto. Search Console dice quante volte Google ha mostrato il sito e
-- quante volte l'hanno cliccato: per una rete di testate il cui problema è
-- l'indicizzazione, la seconda conta più della prima. Un sito con zero
-- impressioni non ha un problema di conversione, non esiste.

CREATE TABLE IF NOT EXISTS public.siti_monitorati (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nome             text NOT NULL,
  dominio          text NOT NULL UNIQUE,
  ga4_property_id  text,
  gsc_site_url     text,
  attivo           boolean NOT NULL DEFAULT true,
  note             text,
  ultimo_sync      timestamptz,
  ultimo_errore    text,
  creato_il        timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.siti_monitorati IS
  'I siti di cui si raccolgono le metriche. ga4_property_id è il numero della proprietà GA4 (senza "properties/"); gsc_site_url è l''URL come compare in Search Console, incluso il protocollo o il prefisso sc-domain:.';

CREATE TABLE IF NOT EXISTS public.siti_metriche_giornaliere (
  sito_id          uuid NOT NULL REFERENCES public.siti_monitorati(id) ON DELETE CASCADE,
  giorno           date NOT NULL,
  fonte            text NOT NULL CHECK (fonte IN ('ga4', 'gsc')),
  utenti           int,
  sessioni         int,
  visualizzazioni  int,
  durata_media_s   numeric(10,1),
  impressioni      int,
  clic             int,
  posizione_media  numeric(6,2),
  raccolto_il      timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (sito_id, giorno, fonte)
);

COMMENT ON TABLE public.siti_metriche_giornaliere IS
  'Una riga per sito, giorno e fonte. Le colonne di GA4 (utenti, sessioni, visualizzazioni) e quelle di Search Console (impressioni, clic, posizione) restano separate perché misurano cose diverse e non vanno sommate.';

-- Le pagine: la classifica che serve davvero quando si chiede "cosa funziona".
CREATE TABLE IF NOT EXISTS public.siti_pagine_giornaliere (
  sito_id          uuid NOT NULL REFERENCES public.siti_monitorati(id) ON DELETE CASCADE,
  giorno           date NOT NULL,
  fonte            text NOT NULL CHECK (fonte IN ('ga4', 'gsc')),
  percorso         text NOT NULL,
  visualizzazioni  int,
  utenti           int,
  durata_media_s   numeric(10,1),
  impressioni      int,
  clic             int,
  posizione_media  numeric(6,2),
  PRIMARY KEY (sito_id, giorno, fonte, percorso)
);

CREATE INDEX IF NOT EXISTS siti_metriche_giorno_idx ON public.siti_metriche_giornaliere (giorno DESC);
CREATE INDEX IF NOT EXISTS siti_pagine_giorno_idx   ON public.siti_pagine_giornaliere (sito_id, giorno DESC);

ALTER TABLE public.siti_monitorati            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.siti_metriche_giornaliere  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.siti_pagine_giornaliere    ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.siti_monitorati, public.siti_metriche_giornaliere, public.siti_pagine_giornaliere FROM PUBLIC, anon;
GRANT SELECT ON public.siti_monitorati, public.siti_metriche_giornaliere, public.siti_pagine_giornaliere TO service_role;

-- La chiave del service account sta nel Vault, non in platform_settings: è la
-- credenziale che apre i dati di tutte le proprietà, e platform_settings è una
-- tabella normale che finisce in ogni dump.
--
-- Questa funzione è l'unico modo per rileggerla, restituisce soltanto quella, e
-- la può chiamare solo il service_role: nessun utente autenticato, nemmeno il
-- super admin dal browser.
CREATE OR REPLACE FUNCTION public.google_service_account()
RETURNS text
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO 'public', 'vault' AS $function$
  SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'google_service_account' LIMIT 1;
$function$;

REVOKE ALL ON FUNCTION public.google_service_account() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.google_service_account() TO service_role;

-- I siti di cui conosco il dominio con certezza. Gli altri della rete si
-- aggiungono dalla pagina: inventarli qui significherebbe scrivere metriche
-- sotto un dominio sbagliato e non accorgersene.
INSERT INTO public.siti_monitorati (nome, dominio, note) VALUES
  ('Edilizia in Cloud',  'www.ediliziaincloud.com', 'Sito del prodotto'),
  ('Edilizia 24 Ore',    'edilizia24ore.it',        'Testata della rete'),
  ('Corriere Edile',     'www.corrieredile.it',     'Testata della rete'),
  ('Il Giornale Edile',  'www.ilgiornaleedile.it',  'Testata della rete')
ON CONFLICT (dominio) DO NOTHING;
