-- File ricostruito il 27/10/2026 dal registro del database (supabase_migrations.schema_migrations).
-- La migrazione era già applicata in produzione con questa versione, ma il file non era mai stato salvato nel repository:
-- il controllo «Supabase Preview» segnalava «Remote migration versions not found in local migrations directory».
-- Sotto c'è l'SQL esattamente come applicato.

set local lock_timeout='3s';set local statement_timeout='60s';
create or replace function public.sicurezza_soggetti_serializza() returns trigger language plpgsql security invoker set search_path=public as $$declare a uuid;b uuid;k uuid;begin
 perform set_config('lock_timeout','3s',true);
 if tg_op<>'INSERT' then a:=old.company_id;end if;if tg_op<>'DELETE' then b:=new.company_id;end if;
 for k in select distinct v from unnest(array[a,b])v where v is not null order by v loop
  if current_user='authenticated' and (auth.uid() is null or not public.has_permission_for_company(auth.uid(),'can_view_sicurezza_cantiere',k) or public.utente_sola_lettura(k)) then raise exception 'Non puoi modificare i soggetti sicurezza in questa azienda' using errcode='42501';end if;
  perform pg_advisory_xact_lock(hashtextextended('itp_soggetti:'||k::text,0));end loop;
 if tg_op='DELETE' then return old;end if;return new;
end$$;
revoke all on function public.sicurezza_soggetti_serializza() from public,anon,authenticated;

create or replace function public.sicurezza_itp_soggetti(_company uuid,_ordine uuid,_sub uuid)
returns jsonb language plpgsql security invoker set search_path=public as $$declare risultato jsonb;begin
 perform public.sicurezza_itp_contesto(_company,_ordine,_sub,null);
 select jsonb_build_object('operai',coalesce((select jsonb_agg(jsonb_build_object('id',o.id,'nome',o.nome,'cognome',o.cognome,'mansione',o.mansione,'attivo',o.attivo,'updated_at',o.updated_at,'assegnazioni',(select jsonb_agg(jsonb_build_object('id',a.id,'dal',a.dal,'al',a.al,'area',a.area,'attivita',a.attivita,'fase_id',a.fase_id,'updated_at',a.updated_at) order by a.id) from public.subappaltatori_assegnazioni a where a.company_id=_company and a.order_id=_ordine and a.subappaltatore_id=_sub and a.operaio_id=o.id)) order by o.id) from public.subappaltatori_operai o where o.company_id=_company and o.subappaltatore_id=_sub and exists(select 1 from public.subappaltatori_assegnazioni a where a.company_id=_company and a.order_id=_ordine and a.subappaltatore_id=_sub and a.operaio_id=o.id)),'[]'::jsonb),'incarichi',coalesce((select jsonb_agg(jsonb_build_object('id',i.id,'ruolo',i.ruolo,'nominativo',i.nominativo,'dal',i.dal,'al',i.al,'stato',i.stato,'figura_id',i.figura_id,'subappaltatore_id',i.subappaltatore_id,'order_id',i.order_id,'updated_at',i.updated_at) order by i.id) from public.sicurezza_incarichi i where i.company_id=_company and (i.subappaltatore_id=_sub and (i.order_id is null or i.order_id=_ordine) or i.subappaltatore_id is null and i.order_id=_ordine)),'[]'::jsonb)) into risultato;
 return risultato;
end$$;
revoke all on function public.sicurezza_itp_soggetti(uuid,uuid,uuid) from public,anon;
grant execute on function public.sicurezza_itp_soggetti(uuid,uuid,uuid) to authenticated;
