-- Perche' un pagamento e' stato rifiutato.
--
-- Finora nel registro restava solo "Pagamento fallito (tentativo #3) -
-- in_1U4n...". Ma carta scaduta, fondi insufficienti e 3D Secure mancante
-- chiedono tre risposte diverse — cambiare carta, riprovare piu' tardi,
-- riautenticare — e senza il motivo non si puo' scegliere quale.
ALTER TABLE public.companies
  ADD COLUMN IF NOT EXISTS last_payment_failure_reason text;

COMMENT ON COLUMN public.companies.last_payment_failure_reason IS
  'decline_code | code | message dell''ultimo rifiuto Stripe (da last_payment_error del PaymentIntent). Serve a distinguere authentication_required da insufficient_funds da expired_card.';
