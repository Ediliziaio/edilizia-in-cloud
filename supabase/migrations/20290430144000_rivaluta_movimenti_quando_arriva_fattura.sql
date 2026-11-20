set local lock_timeout = '3s';
set local statement_timeout = '60s';

do $patch$
declare
  definizione text := pg_get_functiondef('public.tesoreria_classifica_movimenti(uuid,integer,boolean)'::regprocedure);
  filtro text := 'WHERE t.company_id=p_company AND t.chiuso_senza_documento IS NULL';
begin
  if position('private.tes_classifica_movimenti_selezionati(' in definizione)>0 then return; end if;
  if position(filtro in definizione)=0 then raise exception 'Verifica il filtro del classificatore di tesoreria.'; end if;
  definizione := regexp_replace(definizione, '^[^' || chr(10) || ']+',
    'CREATE OR REPLACE FUNCTION private.tes_classifica_movimenti_selezionati(p_company uuid, p_limite integer, p_anteprima boolean, p_movimenti uuid[])');
  execute replace(definizione, filtro, filtro || ' AND (p_movimenti IS NULL OR t.id=ANY(p_movimenti))');
  execute $nuova$
    create or replace function public.tesoreria_classifica_movimenti(
      p_company uuid, p_limite integer default 100, p_anteprima boolean default false
    ) returns jsonb language sql security definer set search_path = '' as $funzione$
      select private.tes_classifica_movimenti_selezionati(p_company,p_limite,p_anteprima,null::uuid[]);
    $funzione$
  $nuova$;
end $patch$;
revoke all on function private.tes_classifica_movimenti_selezionati(uuid,integer,boolean,uuid[]) from public,anon,authenticated,service_role;

-- Scambia soltanto segnali: la conferma dei pagamenti resta sul flusso di tesoreria.
create or replace function public.tesoreria_rivaluta_fattura_ricevuta(p_fattura uuid)
returns integer language plpgsql security definer set search_path = ''
set lock_timeout = '2s' set statement_timeout = '10s'
as $$
declare
  f public.fatture_ricevute%rowtype;
  movimenti uuid[];
begin
  if coalesce(auth.role(),'') <> 'service_role' then
    raise exception 'Rivalutazione riservata al servizio.' using errcode='42501';
  end if;
  select * into f from public.fatture_ricevute where id=p_fattura;
  if not found or f.fornitore_id is null or f.data_fattura is null
    or f.stato in ('rifiutata','scartata','annullata','eliminata')
    or public.e_nota_credito_ricevuta(f.tipo_documento) or public.e_autofattura_ricevuta(f.tipo_documento)
    or (public.acquisti_numero_documento(f.numero_fattura)).chiave is null then
    return 0;
  end if;
  with recenti as materialized (
    select t.id,t.booking_date,t.description,t.reference
    from public.bank_transactions t
    where t.company_id=f.company_id and t.transaction_type='debit'
      and coalesce(t.status,'booked')='booked' and coalesce(t.currency,'EUR')='EUR'
      and t.chiuso_senza_documento is null
      and coalesce(t.reconciliation_status,'pending') in ('pending','suggestion','parziale')
      and t.booking_date>=greatest(f.data_fattura-90,current_date-180)
    order by t.booking_date desc,t.id limit 500
  )
  select coalesce(array_agg(id),'{}'::uuid[]) into movimenti from (
    select t.id from recenti t
    where exists (
      select 1 from unnest(private.tes_riferimenti_fattura(concat_ws(' ',t.description,t.reference))) r
      where private.tes_riferimento_fattura_coincide(r, f.numero_fattura, extract(year from f.data_fattura)::integer)
    )
    order by t.booking_date desc,t.id limit 20
  ) candidati;
  if cardinality(movimenti)=0 then return 0; end if;
  -- Se il giro della banca è già in corso, gestirà lui questi movimenti.
  if not pg_try_advisory_xact_lock(hashtextextended(f.company_id::text,3101)) then return 0; end if;
  perform private.tes_classifica_movimenti_selezionati(f.company_id,cardinality(movimenti),false,movimenti);
  return cardinality(movimenti);
end $$;
revoke all on function public.tesoreria_rivaluta_fattura_ricevuta(uuid) from public,anon,authenticated;
grant execute on function public.tesoreria_rivaluta_fattura_ricevuta(uuid) to service_role;

notify pgrst, 'reload schema';
