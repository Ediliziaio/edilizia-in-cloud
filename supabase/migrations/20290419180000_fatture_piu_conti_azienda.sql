-- ════════════════════════════════════════════════════════════════════════════
-- Fatture: l'azienda può avere più conti, e in fattura si sceglie quale (19/11/2026)
-- ════════════════════════════════════════════════════════════════════════════
-- In fattura l'IBAN si compilava da solo con `iban_principale` delle impostazioni, e l'unico modo di
-- metterne un altro era riscriverlo a mano ogni volta. Impresa Vulcano lavora con due banche (BPER e
-- BCC) e si trovava sempre proposta BPER.
--
-- I conti della Tesoreria non servono allo scopo: l'Open Banking manda l'IBAN MASCHERATO (su Vulcano
-- 9 caratteri, «•••• 0901»), che su una fattura non si può scrivere. Servono gli IBAN veri, scritti
-- dall'azienda una volta sola.
--
-- `conti_fatturazione`: gli altri conti, oltre al principale, ognuno con un nome che si riconosce.
--   [{"nome":"BCC conto lavori","iban":"IT…","bic":"…","banca":"BCC Busto Garolfo"}]
-- Il principale resta dov'era e resta quello proposto di serie: nessuna azienda deve rifare niente.
--
-- Idempotente: ADD COLUMN IF NOT EXISTS, e il vincolo si aggiunge solo se non c'è.
-- ════════════════════════════════════════════════════════════════════════════

ALTER TABLE public.anagrafica_azienda
  ADD COLUMN IF NOT EXISTS conti_fatturazione jsonb NOT NULL DEFAULT '[]'::jsonb;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'anagrafica_azienda_conti_fatturazione_array') THEN
    ALTER TABLE public.anagrafica_azienda
      ADD CONSTRAINT anagrafica_azienda_conti_fatturazione_array
      CHECK (jsonb_typeof(conti_fatturazione) = 'array' AND jsonb_array_length(conti_fatturazione) <= 20);
  END IF;
END $$;

COMMENT ON COLUMN public.anagrafica_azienda.conti_fatturazione IS
  'Gli altri conti dell''azienda da proporre in fattura, oltre a iban_principale: '
  '[{nome, iban, bic, banca}]. Gli IBAN della Tesoreria non servono: l''Open Banking li manda mascherati.';
