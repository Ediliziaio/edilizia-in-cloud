-- BUG-P0-2: SocioUnico dinamico
-- Aggiunge colonna socio_unico per determinare il campo XML <SocioUnico>
-- SM = più soci (default), SU = unico socio (S.r.l. unipersonale)

ALTER TABLE anagrafica_azienda
  ADD COLUMN IF NOT EXISTS socio_unico boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN anagrafica_azienda.socio_unico IS
  'true = SU (Società Unipersonale, S.r.l. con unico socio), false = SM (più soci). Usato nel campo XML FatturaPA <SocioUnico>.';
