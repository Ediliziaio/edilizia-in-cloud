-- Permessi della migrazione 20281105290000: la funzione di trigger non si chiama da fuori.
revoke all on function public.sal_records_numero_libero() from public,anon,authenticated;
