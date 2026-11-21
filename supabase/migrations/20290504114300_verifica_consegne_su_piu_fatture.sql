set local lock_timeout = '3s';
set local statement_timeout = '60s';

-- La stessa quantità ricevuta non prova due volte il debito. Quando una
-- fattura ha già una quota confermata, si usa il consumo già registrato.
do $patch$
declare
  definizione text:=pg_get_functiondef('private.pagamento_fornitore_controllo(uuid)'::regprocedure);
  ancora_ddt text:=$sql$        q_calcolata:=greatest(0,somma_consegnata-somma_consumata);$sql$;
  ancora_oda text:=$sql$        if q_calcolata is null and jsonb_array_length(riferimenti)=0 then q_calcolata:=coalesce(o.ricevuto,0); end if;$sql$;
begin
  if position('ddt_su_piu_fatture' in definizione)>0 then return; end if;
  if position(ancora_ddt in definizione)=0 or position(ancora_oda in definizione)=0 then
    raise exception 'Rivedere la verifica delle quantità fatturate';
  end if;
  definizione:=replace(definizione,ancora_ddt,ancora_ddt||$sql$
        if exists (
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
        end if;$sql$);
  definizione:=replace(definizione,ancora_oda,$sql$
        if q_calcolata is null and jsonb_array_length(riferimenti)=0 then
          q_calcolata:=coalesce(o.ricevuto,0);
          if exists (
            select 1 from public.fatture_ricevute altra
            where altra.company_id=f.company_id and altra.purchase_order_id=o.ordine and altra.id<>f.id
              and altra.stato not in ('rifiutata','scartata','annullata','eliminata')
              and not public.e_nota_credito_ricevuta(altra.tipo_documento)
              and not public.e_autofattura_ricevuta(altra.tipo_documento)
          ) then
            problemi:=problemi||jsonb_build_array(jsonb_build_object('tipo','ordine_su_piu_fatture','riga',r.n,
              'descrizione',r.descrizione,'ordine_id',o.ordine));
          end if;
        end if;$sql$);
  execute definizione;
end
$patch$;

create or replace function private.operazioni_consumo_ddt_evento()
returns trigger language plpgsql security definer set search_path='' as $$
declare bolle uuid[]:='{}'; nuova uuid; vecchia uuid; r record;
begin
  if tg_table_name='fatture_ricevute' then
    bolle:=array(select l.ddt_ricezione_id from public.fattura_ddt l
      where l.company_id=new.company_id and l.fattura_ricevuta_id=new.id and l.ddt_ricezione_id is not null);
  elsif tg_table_name='fattura_ddt_quantita' then
    if tg_op<>'DELETE' then nuova:=new.ddt_riga; end if;
    if tg_op<>'INSERT' then vecchia:=old.ddt_riga; end if;
    bolle:=array(select distinct b.ddt_ricezione_id from public.ddt_righe b where b.id in (nuova,vecchia));
  elsif tg_table_name='fattura_ddt' then
    if tg_op<>'DELETE' then bolle:=array_append(bolle,new.ddt_ricezione_id); end if;
    if tg_op<>'INSERT' then bolle:=array_append(bolle,old.ddt_ricezione_id); end if;
  else
    if tg_op<>'DELETE' then bolle:=array_append(bolle,new.ddt_id); end if;
    if tg_op<>'INSERT' then bolle:=array_append(bolle,old.ddt_id); end if;
  end if;
  for r in select distinct l.fattura_ricevuta_id from public.fattura_ddt l
    where l.ddt_ricezione_id=any(bolle) order by l.fattura_ricevuta_id
  loop perform private.operazioni_accoda('fattura',r.fattura_ricevuta_id); end loop;
  return null;
end
$$;

create or replace trigger operazioni_consumo_legame
  after insert or update of ddt_ricezione_id,fattura_ricevuta_id or delete on public.fattura_ddt
  for each row execute function private.operazioni_consumo_ddt_evento();
create or replace trigger operazioni_consumo_quantita
  after insert or update or delete on public.fattura_ddt_quantita
  for each row execute function private.operazioni_consumo_ddt_evento();
create or replace trigger operazioni_consumo_prezzo
  after insert or update or delete on public.ddt_valorizzazioni
  for each row execute function private.operazioni_consumo_ddt_evento();
create or replace trigger operazioni_consumo_fattura
  after update of stato on public.fatture_ricevute for each row
  when ((old.stato in ('rifiutata','scartata','annullata','eliminata')) is distinct from
    (new.stato in ('rifiutata','scartata','annullata','eliminata')))
  execute function private.operazioni_consumo_ddt_evento();

revoke all on function private.operazioni_consumo_ddt_evento() from public,anon,authenticated,service_role;

-- Il backup aziendale cataloga le tabelle in public. I dati restano
-- raggiungibili dall'app solo attraverso le RPC con controllo d'azienda.
do $backup$
declare
  tabelle text[]:=array['operazioni_eccezioni','pagamenti_verifiche_fornitori',
    'distinte_pagamenti_fornitori','distinte_pagamenti_righe'];
  t text;
  d text;
  definizioni text[];
begin
  if to_regclass('private.operazioni_eccezioni') is null then return; end if;
  select array_agg(pg_get_functiondef(p.oid) order by p.oid) into definizioni
  from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname in ('private','public') and (
      p.proname like 'operazioni_%' or p.proname like 'distinta_pagamenti_%'
      or (n.nspname='private' and p.proname='pagamento_fornitore_controllo'))
    and exists(select 1 from unnest(tabelle) nome where strpos(pg_get_functiondef(p.oid),'private.'||nome)>0);
  foreach t in array tabelle loop
    execute format('alter table private.%I set schema public',t);
    execute format('revoke all on public.%I from public,anon,authenticated,service_role',t);
  end loop;
  foreach d in array definizioni loop
    foreach t in array tabelle loop
      d:=replace(d,'private.'||t,'public.'||t);
    end loop;
    execute d;
  end loop;
end
$backup$;
notify pgrst,'reload schema';

