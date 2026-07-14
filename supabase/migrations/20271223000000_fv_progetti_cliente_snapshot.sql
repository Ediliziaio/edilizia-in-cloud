-- FV — snapshot recapiti cliente sul progetto.
-- I dati della Fase 1 (nome/cognome/cellulare/email) vivevano solo in
-- marketing_contacts (se collegato) o nel titolo/localStorage. Alla ripresa di
-- una bozza — soprattutto in inserimento MANUALE o cross-device — non venivano
-- ripristinati. Persistiamo uno snapshot direttamente sul progetto.

ALTER TABLE public.fv_progetti
  ADD COLUMN IF NOT EXISTS cliente_nome     text,
  ADD COLUMN IF NOT EXISTS cliente_cognome  text,
  ADD COLUMN IF NOT EXISTS cliente_telefono text,
  ADD COLUMN IF NOT EXISTS cliente_email    text;

COMMENT ON COLUMN public.fv_progetti.cliente_nome IS 'Snapshot nome cliente (Fase 1) per ripristino bozza anche senza contatto CRM collegato.';
