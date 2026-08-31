-- Advisor sicurezza Supabase: funzioni SECURITY DEFINER eseguibili da anon.
-- Ne chiudo due che sono davvero rischiose (le altre in lista sono helper
-- interni usati dalle policy RLS: la' l'accesso anon serve).
--
-- lookup_user_by_email(text) → uuid: dato un indirizzo dice se esiste un
-- account e ne restituisce l'id. E' un oracolo di enumerazione utenti,
-- chiamabile senza login. La usa solo invite-accountant-to-company, che gira
-- in service_role e non ha bisogno del grant anon/authenticated.
REVOKE EXECUTE ON FUNCTION public.lookup_user_by_email(text)
  FROM anon, authenticated, PUBLIC;

-- sr_cleanup_expired_public_tokens(): azzera i public_token dei progetti SR
-- scaduti. E' un job di manutenzione (cron), non deve stare in mano a un
-- chiamante anonimo. Nessun chiamante applicativo nel codice.
REVOKE EXECUTE ON FUNCTION public.sr_cleanup_expired_public_tokens()
  FROM anon, authenticated, PUBLIC;

NOTIFY pgrst, 'reload schema';
