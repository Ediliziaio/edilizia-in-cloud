-- File ricostruito il 27/10/2026 dal registro del database (supabase_migrations.schema_migrations).
-- La migrazione era già applicata in produzione con questa versione, ma il file non era mai stato salvato nel repository:
-- il controllo «Supabase Preview» segnalava «Remote migration versions not found in local migrations directory».
-- Sotto c'è l'SQL esattamente come applicato.

set local lock_timeout='3s';set local statement_timeout='60s';
-- Both selected documents must still be the versions actually read in the dialog.
revoke execute on function public.sds_collega_revisione(uuid,uuid,uuid,text) from public,anon,authenticated;
create or replace function public.sds_collega_revisione(_company uuid,_documento uuid,_precedente uuid,_impronta_precedente text,_impronta_documento text) returns public.sicurezza_sds_revisioni
language plpgsql security definer set search_path=public set timezone='UTC' as $$
declare d public.sicurezza_fascicolo;r public.sicurezza_sds_revisioni;begin
 if auth.uid() is null or not public.has_permission_for_company(auth.uid(),'can_view_sicurezza_cantiere',_company) or public.utente_sola_lettura(_company) then raise exception 'Non puoi collegare revisioni SDS' using errcode='42501';end if;
 perform set_config('lock_timeout','3s',true);
 perform pg_advisory_xact_lock(hashtextextended('sds_revisioni:'||_company::text,0));
 select * into r from public.sicurezza_sds_revisioni where documento_id=_documento;
 if found and r.company_id=_company and r.precedente_id=_precedente and r.impronta_precedente=_impronta_precedente and r.impronta_documento=_impronta_documento then return r;end if;
 select * into d from public.sicurezza_fascicolo where id=_documento and company_id=_company for share;
 if not found then raise exception 'SDS non disponibile';end if;
 if public.sicurezza_sds_documento(d)->>'impronta' is distinct from _impronta_documento then raise exception 'La nuova SDS è cambiata: rileggila prima di collegare la revisione' using errcode='40001';end if;
 return public.sds_collega_revisione(_company,_documento,_precedente,_impronta_precedente);
end$$;
revoke all on function public.sds_collega_revisione(uuid,uuid,uuid,text,text) from public,anon;
grant execute on function public.sds_collega_revisione(uuid,uuid,uuid,text,text) to authenticated;
