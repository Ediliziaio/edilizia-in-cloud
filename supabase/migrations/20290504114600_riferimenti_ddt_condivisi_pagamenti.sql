set local lock_timeout = '3s';
set local statement_timeout = '60s';

create or replace function private.operazioni_ddt_univoco(p_azienda uuid,p_fornitore uuid,p_numero text,p_data date)
returns uuid language sql stable set search_path='' as $$
  select case when count(distinct c.ddt_id)=1 then (array_agg(c.ddt_id))[1] end
  from public.acquisti_ddt_candidati(p_azienda,p_fornitore,p_numero,p_data) c
  where p_data is null or c.data=p_data
$$;

-- L'importazione può conservare numero e data senza scrivere il collegamento.
-- Usa gli stessi vincoli sul fornitore e sul riferimento del controllo fattura.
create or replace function private.operazioni_fatture_della_bolla(p_azienda uuid,p_bolla uuid)
returns table(fattura_id uuid) language sql stable set search_path='' as $$
  with bolla as materialized (
    select b.id,b.supplier_id,b.data_ricezione,(public.acquisti_numero_documento(b.numero_ddt)).chiave chiave
    from public.ddt_ricezione b where b.company_id=p_azienda and b.id=p_bolla
  )
  select l.fattura_ricevuta_id
  from public.fattura_ddt l
  where l.company_id=p_azienda and l.ddt_ricezione_id=p_bolla
  union
  select f.id
  from bolla b
  join public.fatture_ricevute f on f.company_id=p_azienda and f.fornitore_id=b.supplier_id
  join public.fattura_ddt l on l.fattura_ricevuta_id=f.id and l.company_id=p_azienda
  where l.ddt_ricezione_id is null and (l.data_ddt is null or l.data_ddt=b.data_ricezione)
    and (public.acquisti_numero_documento(l.numero_ddt)).chiave=b.chiave
    and private.operazioni_ddt_univoco(p_azienda,f.fornitore_id,l.numero_ddt,l.data_ddt)=b.id
$$;

do $patch$
declare
  definizione text:=pg_get_functiondef('private.pagamento_fornitore_controllo(uuid)'::regprocedure);
  dichiarazione text:='  somma_consumata numeric;';
  precedente text:=$sql$        if exists (
          select 1 from public.fattura_ddt l
          join public.fatture_ricevute altra on altra.id=l.fattura_ricevuta_id and altra.company_id=f.company_id
          where l.company_id=f.company_id and l.ddt_ricezione_id=d.bolla and altra.id<>f.id
            and altra.stato not in ('rifiutata','scartata','annullata','eliminata')
            and not public.e_nota_credito_ricevuta(altra.tipo_documento)
            and not public.e_autofattura_ricevuta(altra.tipo_documento)
            and not exists (
              select 1 from public.fattura_ddt_consumi(f.company_id,array[d.bolla],f.id) c
              where c.fattura_id=altra.id
            )
        ) then
          problemi:=problemi||jsonb_build_array(jsonb_build_object('tipo','ddt_su_piu_fatture','riga',r.n,
            'descrizione',r.descrizione,'ddt_id',d.bolla));
        end if;$sql$;
begin
  if position('private.operazioni_fatture_della_bolla' in definizione)>0 then return; end if;
  if position(precedente in definizione)=0 or position(dichiarazione in definizione)=0 then
    raise exception 'Rivedere il controllo dei riferimenti DDT condivisi';
  end if;
  definizione:=replace(definizione,dichiarazione,dichiarazione||chr(10)||'  fatture_concorrenti uuid[];');
  definizione:=replace(definizione,precedente,$sql$        select array_agg(altra.id order by altra.id) into fatture_concorrenti
        from private.operazioni_fatture_della_bolla(f.company_id,d.bolla) l
        join public.fatture_ricevute altra on altra.id=l.fattura_id and altra.company_id=f.company_id
        where altra.id<>f.id and altra.fornitore_id=f.fornitore_id
          and altra.stato not in ('rifiutata','scartata','annullata','eliminata')
          and not public.e_nota_credito_ricevuta(altra.tipo_documento)
          and not public.e_autofattura_ricevuta(altra.tipo_documento)
          and not exists (
            select 1 from public.fattura_ddt_consumi(f.company_id,array[d.bolla],f.id) c
            where c.fattura_id=altra.id and c.quantita>0
          );
        if cardinality(fatture_concorrenti)>0 then
          problemi:=problemi||jsonb_build_array(jsonb_build_object('tipo','ddt_su_piu_fatture','riga',r.n,
            'descrizione',r.descrizione,'ddt_id',d.bolla,'fatture',fatture_concorrenti));
        end if;$sql$);
  execute definizione;
end
$patch$;

create or replace function private.operazioni_ddt_del_legame(l public.fattura_ddt)
returns uuid language sql stable set search_path='' as $$
  select coalesce(l.ddt_ricezione_id,private.operazioni_ddt_univoco(l.company_id,
    (select f.fornitore_id from public.fatture_ricevute f where f.id=l.fattura_ricevuta_id and f.company_id=l.company_id),
    l.numero_ddt,l.data_ddt))
$$;

create or replace function private.operazioni_consumo_ddt_evento()
returns trigger language plpgsql security definer set search_path='' as $$
declare
  azienda uuid;
  bolle uuid[]:='{}';
  nuova uuid;
  vecchia uuid;
  r record;
begin
  if tg_op='DELETE' then azienda:=old.company_id; else azienda:=new.company_id; end if;
  if tg_table_name='fatture_ricevute' then
    bolle:=array(select distinct private.operazioni_ddt_del_legame(l) from public.fattura_ddt l
      where l.company_id=azienda and l.fattura_ricevuta_id=new.id);
  elsif tg_table_name='fattura_ddt_quantita' then
    if tg_op<>'DELETE' then nuova:=new.ddt_riga; end if;
    if tg_op<>'INSERT' then vecchia:=old.ddt_riga; end if;
    bolle:=array(select distinct b.ddt_ricezione_id from public.ddt_righe b where b.company_id=azienda and b.id in (nuova,vecchia));
  elsif tg_table_name='fattura_ddt' then
    if tg_op<>'DELETE' then bolle:=array_append(bolle,private.operazioni_ddt_del_legame(new)); end if;
    if tg_op<>'INSERT' then bolle:=array_append(bolle,private.operazioni_ddt_del_legame(old)); end if;
  else
    if tg_op<>'DELETE' then bolle:=array_append(bolle,new.ddt_id); end if;
    if tg_op<>'INSERT' then bolle:=array_append(bolle,old.ddt_id); end if;
  end if;
  for r in
    select distinct f.fattura_id from (select distinct b from unnest(bolle) b where b is not null) b
    cross join lateral private.operazioni_fatture_della_bolla(azienda,b.b) f order by f.fattura_id
  loop
    perform private.operazioni_accoda('fattura',r.fattura_id);
  end loop;
  return null;
end
$$;

create or replace trigger operazioni_consumo_legame
  after insert or update of ddt_ricezione_id,fattura_ricevuta_id,numero_ddt,data_ddt or delete on public.fattura_ddt
  for each row execute function private.operazioni_consumo_ddt_evento();

revoke all on function private.operazioni_ddt_univoco(uuid,uuid,text,date),
  private.operazioni_fatture_della_bolla(uuid,uuid),private.operazioni_ddt_del_legame(public.fattura_ddt),
  private.operazioni_consumo_ddt_evento() from public,anon,authenticated,service_role;
