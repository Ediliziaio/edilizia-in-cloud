-- Certificato di pagamento del SAL: l'importo rinviato al certificato dopo (10/11/2026).
--
-- Un certificato arrotonda il netto (107.427,62 → 107.400) o ne rinvia una parte al prossimo.
-- Finora quella parte finiva nelle «altre detrazioni», che sono CUMULATIVE: il certificato dopo
-- le ricopiava e, con gli acconti pari al netto già certificato, il cliente non riceveva mai
-- quei soldi. Simulato sul SAL n. 3 di una commessa vera: 27,62 € in meno in fattura.
--
-- Ora il rinviato ha la sua colonna: netto = lordo − ritenuta − recupero − altre detrazioni −
-- acconti − rinviato. Il certificato dopo parte da acconti = quanto certificato davvero (cioè
-- senza il rinviato), e così lo restituisce. Le altre detrazioni restano per sconti, penali e
-- compensazioni.
--
-- Dati: solo i due certificati dell'unica commessa che usava le altre detrazioni per un rinvio
-- (riconosciuti dalla nota). Le altre 11 righe con altre detrazioni sono sconti e compensazioni.
SET LOCAL lock_timeout = '3s';
SET LOCAL statement_timeout = '60s';

ALTER TABLE public.sal_certificati ADD COLUMN IF NOT EXISTS rinviato numeric(14,2) NOT NULL DEFAULT 0;
COMMENT ON COLUMN public.sal_certificati.rinviato IS 'Importo rinviato al certificato successivo (arrotondamento del netto): il certificato dopo lo restituisce.';

ALTER TABLE public.sal_certificati DROP CONSTRAINT IF EXISTS sal_certificati_rinviato;
ALTER TABLE public.sal_certificati ADD CONSTRAINT sal_certificati_rinviato CHECK (rinviato >= 0);

ALTER TABLE public.sal_certificati DROP CONSTRAINT IF EXISTS sal_certificati_netto_torna;
ALTER TABLE public.sal_certificati ADD CONSTRAINT sal_certificati_netto_torna
  CHECK (abs(netto - (lavori_contrattuali + varianti - ritenuta - recupero_anticipazione - altre_detrazioni - acconti_precedenti - rinviato)) <= 0.05);

-- Le due righe che usavano le altre detrazioni per un rinvio: lo stesso importo passa al rinviato.
UPDATE public.sal_certificati
   SET rinviato = altre_detrazioni, altre_detrazioni = 0
 WHERE rinviato = 0 AND altre_detrazioni > 0
   AND (altre_detrazioni_nota ILIKE 'Credito arrotondato%' OR altre_detrazioni_nota ILIKE '%il resto è entrato nel certificato%');
