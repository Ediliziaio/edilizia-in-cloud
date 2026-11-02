-- Permessi della migrazione 20281105330000: solo utenti autenticati (la funzione è SECURITY INVOKER: valgono le RLS).
revoke all on function public.commessa_iva(uuid) from public,anon;
grant execute on function public.commessa_iva(uuid) to authenticated;
