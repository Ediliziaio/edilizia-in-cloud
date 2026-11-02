-- Permessi della migrazione 20281105300000: la funzione di trigger non si chiama da fuori.
revoke all on function public.commessa_iva_prevalente_dal_preventivo() from public,anon,authenticated;
