-- ============================================================================
-- Il provider openapi.it non si poteva salvare: integrazione irraggiungibile.
--
-- Nelle impostazioni di fatturazione il menu offre tre canali per lo SDI —
-- openapi.it, Aruba PEC e manuale — e la funzione di invio ha il ramo openapi
-- completo (POST dell'XML a invoice.openapi.com/IT-invoices, registrazione
-- automatica del cedente se non ancora censito, ritentativo, tracciamento
-- delle risposte). Il token openapi e' configurato a livello piattaforma.
--
-- Ma il vincolo su anagrafica_azienda.sdi_provider ammetteva solo
-- 'aruba', 'infocert', 'poste', 'manuale': scegliendo openapi.it il
-- salvataggio veniva RIFIUTATO dal database (violates check constraint), e
-- nessuna azienda poteva quindi attivare quel canale. Tutto il ramo di invio
-- openapi era codice morto.
--
-- Qui si aggiunge 'openapi' ai valori ammessi. Restano infocert e poste, che
-- il menu non mostra ancora (non implementati) ma che il vincolo tollerava
-- gia': toglierli non serve e rischierebbe di invalidare righe esistenti.
-- ============================================================================

ALTER TABLE public.anagrafica_azienda
  DROP CONSTRAINT IF EXISTS anagrafica_azienda_sdi_provider_check;

ALTER TABLE public.anagrafica_azienda
  ADD CONSTRAINT anagrafica_azienda_sdi_provider_check
  CHECK (sdi_provider = ANY (ARRAY['openapi'::text, 'aruba'::text, 'infocert'::text, 'poste'::text, 'manuale'::text]));
