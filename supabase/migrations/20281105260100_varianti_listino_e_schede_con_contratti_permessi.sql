-- Permessi della migrazione 20281105260000: la funzione di trigger non si chiama da fuori.
revoke all on function public.subappaltatore_scheda_con_contratti() from public,anon,authenticated;
