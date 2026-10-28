set local lock_timeout='3s';set local statement_timeout='60s';
create or replace function public.sicurezza_snapshot_verbale_dpi(e public.sicurezza_fascicolo) returns jsonb language sql stable security invoker set search_path=public as $$
 select jsonb_build_object('impronta',public.sicurezza_impronta_verbale_dpi(e),'id',e.id,'operaio_id',e.operaio_id,'titolo',e.titolo,'revisione',e.revisione,'file_name',e.file_name,'catalogo_id',e.catalogo_id,'catalogo_versione',e.catalogo_versione,'order_id',e.order_id,'fase_id',e.fase_id,'applicabile_dal',e.applicabile_dal,'applicabile_al',e.applicabile_al,'stato',e.stato,'data_rilascio',e.data_rilascio,'data_scadenza',e.data_scadenza,'updated_at',e.updated_at);
$$;
revoke all on function public.sicurezza_snapshot_verbale_dpi(public.sicurezza_fascicolo) from public,anon,authenticated;


create or replace function public.sub_dpi_quadro(_company uuid,_sub uuid,_ordine uuid default null,_data date default ((now() at time zone 'Europe/Rome')::date),_fase uuid default null,_operaio uuid default null)
returns jsonb language plpgsql security definer set search_path=public as $$declare risultato jsonb;begin
 if auth.uid() is null or not public.has_permission_for_company(auth.uid(),'can_view_sicurezza_cantiere',_company) then raise exception 'Permesso Sicurezza cantiere necessario' using errcode='42501';end if;
 if not exists(select 1 from public.subappaltatori_sicurezza where id=_sub and company_id=_company) then raise exception 'Impresa non disponibile';end if;
 if _data is null or _ordine is null and _fase is not null then raise exception 'Indica data e contesto della fase';end if;
 if _ordine is not null then perform public.sicurezza_itp_contesto(_company,_ordine,_sub,_fase);end if;
 if _operaio is not null and not exists(select 1 from public.subappaltatori_operai where id=_operaio and company_id=_company and subappaltatore_id=_sub) then raise exception 'Operaio non appartenente all’impresa';end if;
 with addetti as (
 select o.* from public.subappaltatori_operai o where o.company_id=_company and o.subappaltatore_id=_sub and (_operaio is null or o.id=_operaio)
 and (_ordine is null or exists(select 1 from public.subappaltatori_assegnazioni a where a.company_id=_company and a.subappaltatore_id=_sub and a.operaio_id=o.id and a.order_id=_ordine and a.dal<=_data and (a.al is null or a.al>=_data) and (_fase is null or a.fase_id is null or a.fase_id=_fase)))
 ), documenti as (
 select e.* from public.sicurezza_fascicolo e join addetti a on a.id=e.operaio_id where e.company_id=_company and e.subappaltatore_id=_sub and e.incarico_id is null and e.tipo='dpi' and e.catalogo_id='consegna_dpi'
 )
 select jsonb_build_object('company_id',_company,'sub_id',_sub,'order_id',_ordine,'data',_data,'fase_id',_fase,
 'addetti',coalesce((select jsonb_agg(jsonb_build_object('id',a.id,'nome',a.nome,'cognome',a.cognome,'qualifica',a.mansione,'attivo',a.attivo,'assegnazioni','[]'::jsonb,
 'consegne',coalesce((select jsonb_agg(public.sicurezza_dpi_esterno_json(d)||jsonb_build_object(
 'verbale_cambiato',d.evidenza_id is not null and (d.evidenza_updated_at is distinct from e.updated_at or d.evidenza_impronta is distinct from public.sicurezza_impronta_verbale_dpi(e)),
 'verbale_pertinente',e.id is not null and e.file_path is not null and e.file_name is not null and e.stato<>'superato' and (_ordine is null or (e.order_id is null or e.order_id=_ordine) and (e.fase_id is null or e.fase_id=_fase) and (e.applicabile_dal is null or e.applicabile_dal<=_data) and (e.applicabile_al is null or e.applicabile_al>=_data)),
 'verbale_corrente',case when e.id is not null then public.sicurezza_snapshot_verbale_dpi(e) end) order by d.consegnato_il desc,d.id)
 from public.subappaltatori_dpi_consegne d left join documenti e on e.id=d.evidenza_id where d.company_id=_company and d.subappaltatore_id=_sub and d.operaio_id=a.id),'[]'::jsonb)) order by a.cognome,a.nome,a.id) from addetti a),'[]'::jsonb),
 'evidenze',coalesce((select jsonb_agg(public.sicurezza_snapshot_verbale_dpi(e) order by e.titolo,e.id) from documenti e where e.file_path is not null and e.file_name is not null and e.stato<>'superato' and (_ordine is null or (e.order_id is null or e.order_id=_ordine) and (e.fase_id is null or e.fase_id=_fase) and (e.applicabile_dal is null or e.applicabile_dal<=_data) and (e.applicabile_al is null or e.applicabile_al>=_data))),'[]'::jsonb)) into risultato;
 return risultato;
end$$;
revoke all on function public.sub_dpi_quadro(uuid,uuid,uuid,date,uuid,uuid) from public,anon;
grant execute on function public.sub_dpi_quadro(uuid,uuid,uuid,date,uuid,uuid) to authenticated;


