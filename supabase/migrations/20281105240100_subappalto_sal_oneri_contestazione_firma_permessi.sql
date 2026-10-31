-- Permessi della migrazione 20281105240000 (separati: i REVOKE vanno da soli).
revoke all on function public.subappalto_sal_contestazione_misure() from public,anon,authenticated;
revoke all on function public.subappalto_sal_misure_coerenti() from public,anon,authenticated;
revoke all on function public.subappalto_sal_da_misure(uuid,uuid,uuid,uuid[],date,numeric,text) from public,anon;
grant execute on function public.subappalto_sal_da_misure(uuid,uuid,uuid,uuid[],date,numeric,text) to authenticated;
revoke all on function public.subappalto_firma_annulla(uuid,uuid) from public,anon;
grant execute on function public.subappalto_firma_annulla(uuid,uuid) to authenticated;
