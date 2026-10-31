-- Permessi della migrazione 20281105250000 (i REVOKE vanno da soli).
revoke all on public.subappalto_modello_contratto from public,anon,authenticated;
grant select,insert,update on public.subappalto_modello_contratto to authenticated;
