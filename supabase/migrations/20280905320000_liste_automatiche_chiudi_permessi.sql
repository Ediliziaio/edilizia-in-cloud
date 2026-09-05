-- CREATE FUNCTION concede EXECUTE a PUBLIC per impostazione predefinita, e
-- revocarlo ad anon/authenticated non basta: lo ereditano comunque da PUBLIC.
-- Queste due girano solo come trigger, nessuno deve poterle chiamare.
revoke all on function public.aggiorna_liste_del_contatto() from public, anon, authenticated;
revoke all on function public.aggiorna_liste_da_campo_personalizzato() from public, anon, authenticated;
