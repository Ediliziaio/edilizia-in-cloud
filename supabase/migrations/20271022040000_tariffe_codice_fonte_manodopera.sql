-- Voce listino "Manodopera e Servizi" più completa: codice articolo, fonte
-- (prezzario regionale di provenienza) e incidenza manodopera %.
-- Tutti opzionali → nessun impatto sulle voci esistenti. Idempotente.
ALTER TABLE public.tariffe_aziendali
  ADD COLUMN IF NOT EXISTS codice text;
ALTER TABLE public.tariffe_aziendali
  ADD COLUMN IF NOT EXISTS fonte text;
ALTER TABLE public.tariffe_aziendali
  ADD COLUMN IF NOT EXISTS incidenza_manodopera_pct numeric;

COMMENT ON COLUMN public.tariffe_aziendali.codice IS
  'Codice articolo/voce (es. dal prezzario regionale: LOM241.1C.00.010.0010). Opzionale, utile per tracciabilità e match del computo.';
COMMENT ON COLUMN public.tariffe_aziendali.fonte IS
  'Prezzario di provenienza della voce (es. "Prezzario Regione Lombardia 2024"). NULL = voce inserita a mano.';
COMMENT ON COLUMN public.tariffe_aziendali.incidenza_manodopera_pct IS
  'Incidenza manodopera frazionaria 0..1 (obbligo base d''asta nei lavori pubblici). NULL = non specificata.';
