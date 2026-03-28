-- Migration: Add atomic SDI ProgressivoInvio counter
-- Il ProgressivoInvio deve essere univoco per trasmittente nell'anno.
-- Non si può usare il numero fattura perché possono esserci collisioni.

-- 1. Add counter column to anagrafica_azienda
ALTER TABLE anagrafica_azienda
ADD COLUMN IF NOT EXISTS sdi_progressivo_invio integer NOT NULL DEFAULT 0;
