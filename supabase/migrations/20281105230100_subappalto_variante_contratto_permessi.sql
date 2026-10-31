-- Permessi della variante: tabella leggibile solo da chi ha i permessi (via policy), funzione solo agli autenticati.
revoke all on public.subappalto_varianti_contratto from public,anon,authenticated;
grant select on public.subappalto_varianti_contratto to authenticated;
revoke all on function public.subappalto_base_contratto_protetta() from public,anon,authenticated;
revoke all on function public.subappalto_variante_registra(uuid,uuid,numeric,numeric,text) from public,anon;
grant execute on function public.subappalto_variante_registra(uuid,uuid,numeric,numeric,text) to authenticated;
