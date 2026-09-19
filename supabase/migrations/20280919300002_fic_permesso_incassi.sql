-- Fatture in Cloud: si sa se il collegamento può registrare gli incassi.
--
-- Fino al 19/09/2026 il collegamento chiedeva solo permessi di lettura, quindi
-- «segna pagata» non poteva aggiornare Fatture in Cloud. Ora billing-connect
-- chiede anche issued_documents.invoices:a e segna qui che è stato concesso:
-- le impostazioni mostrano «ricollega» a chi aveva collegato prima.

SET lock_timeout = '3s';

ALTER TABLE public.billing_integrations
  ADD COLUMN IF NOT EXISTS scrittura_incassi_autorizzata boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.billing_integrations.scrittura_incassi_autorizzata IS
  'true se il collegamento (solo fattureincloud) è stato fatto chiedendo issued_documents.invoices:a: billing-payment-push può segnare pagate le fatture su FIC.';
