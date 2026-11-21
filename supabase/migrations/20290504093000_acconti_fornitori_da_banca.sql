set local lock_timeout = '3s';
set local statement_timeout = '60s';

-- Le quote vere dei pagamenti vivono nello stesso registro della
-- riconciliazione. Le prove di pagamenti già registrati restano fuori dal saldo.
create or replace function private.fornitore_quote_banca(p_company uuid,p_fattura uuid,p_rata uuid)
returns numeric language sql stable set search_path = '' as $$
  select coalesce(sum(r.matched_amount),0)
  from public.bank_reconciliations r
  where r.company_id=p_company and r.unmatched_at is null
    and r.payment_source->>'tipo'='quota_fornitore'
    and ((p_rata is not null and r.rata_fornitore_id=p_rata)
      or (p_rata is null and r.rata_fornitore_id is null and r.fattura_ricevuta_id=p_fattura))
$$;
revoke all on function private.fornitore_quote_banca(uuid,uuid,uuid) from public,anon,authenticated,service_role;

-- Il calcolo dell'IVA split, degli storni e degli anticipi resta quello
-- dell'elenco fatture ricevute. La banca rilegge lo stesso saldo per documento.
do $saldi$
declare
  d text:=pg_get_functiondef('public.fatture_ricevute_saldi(uuid,integer)'::regprocedure);
  originale text;
  fine integer;
  auth_inizio integer;
  corpo_inizio integer;
  firma text:='public.fatture_ricevute_saldi(p_company_id uuid, p_anno integer DEFAULT NULL::integer)';
  by_year text:='    where f.company_id = p_company_id';
  rate_pagato text:='      sum(r.importo) filter (where r.stato = ''pagata'') pagato,';
  rate_join text:='    from public.rate_fornitori r join fatture f on f.id = r.fattura_ricevuta_id';
begin
  -- Se il wrapper è già installato, la migrazione è rieseguibile.
  if strpos(d,'private.fatture_ricevute_calcola_saldi(')>0 then return; end if;
  originale:=d;
  fine:=strpos(d,'end $function$');
  if fine=0 then fine:=strpos(d,E'end\n$function$'); end if;
  corpo_inizio:=strpos(d,'  return query');
  auth_inizio:=strpos(d,'  if auth.uid() is null');
  if strpos(d,firma)=0 or strpos(d,by_year)=0 or strpos(d,rate_pagato)=0 or strpos(d,rate_join)=0
    or auth_inizio=0 or corpo_inizio=0 or fine=0 or strpos(d,'    end netto')=0 then
    raise exception 'Revisionare il calcolo dei saldi delle fatture ricevute';
  end if;
  d:=left(d,auth_inizio-1)||substr(d,corpo_inizio);
  d:=replace(d,firma,'private.fatture_ricevute_calcola_saldi(p_company_id uuid, p_anno integer, p_fattura uuid)');
  d:=replace(d,by_year,by_year||E' and (p_fattura is null or f.id=p_fattura)');
  d:=replace(d,rate_pagato,$s$      sum(greatest(0,r.importo-b.versato)) filter (where r.stato = 'pagata') pagato,
      sum(b.versato) versato_banca,$s$);
  d:=replace(d,rate_join,rate_join||$s$
    cross join lateral (select private.fornitore_quote_banca(r.company_id,null,r.id) versato) b$s$);
  d:=replace(d,'coalesce(r.pagato, case when r.totali is null then piano.pagato end, 0) rate_pagato,',
    $s$coalesce(r.pagato, case when r.totali is null then piano.pagato end, 0) rate_pagato,
      coalesce(r.versato_banca,0)+private.fornitore_quote_banca(p_company_id,f.id,null) versato_banca,$s$);
  d:=replace(d,$s$case when n.fatture_costo = 1 then greatest(n.rate_pagato, n.versato_costo)
        else greatest(0, n.rate_pagato) end versato,$s$,
    $s$n.versato_banca + case when n.fatture_costo = 1 then greatest(n.rate_pagato, n.versato_costo)
        else greatest(0, n.rate_pagato) end versato,$s$);
  execute d;
  execute left(originale,corpo_inizio-1)||
    E'  return query select * from private.fatture_ricevute_calcola_saldi(p_company_id,p_anno,null);\n'||
    substr(originale,fine);
end
$saldi$;
revoke all on function private.fatture_ricevute_calcola_saldi(uuid,integer,uuid) from public,anon,authenticated,service_role;

create or replace function private.fornitore_residuo_rata(p_rata public.rate_fornitori)
returns numeric language sql stable set search_path = '' as $$
  with rate as (
    select r.*, private.fornitore_quote_banca(r.company_id,null,r.id) banca
    from public.rate_fornitori r
    where r.company_id=p_rata.company_id and r.company_cost_id=p_rata.company_cost_id
      and r.stato<>'stornata' and r.id<>p_rata.id
  ), base as (
    select coalesce(sum(greatest(0,r.importo-r.banca)) filter(where r.stato='pagata'),0) chiuse,
      coalesce(sum(greatest(0,r.importo-r.banca)) filter(where r.stato<>'pagata'
        and (coalesce(nullif(r.scadenza,date '9999-12-31'),date 'infinity'),r.numero,r.id) <
          (coalesce(nullif(p_rata.scadenza,date '9999-12-31'),date 'infinity'),p_rata.numero,p_rata.id)),0) precedenti,
      (select coalesce(sum(case when pn.direction='uscita' then pn.amount else -pn.amount end),0)
       from public.prima_nota_entries pn where pn.company_id=p_rata.company_id and pn.cost_id=p_rata.company_cost_id)
        +coalesce(public.anticipi_compensati_costo(p_rata.company_id,p_rata.company_cost_id,current_date),0) versato
    from rate r
  )
  select round(greatest(0,p_rata.importo-private.fornitore_quote_banca(p_rata.company_id,null,p_rata.id)
    -greatest(0,b.versato-b.chiuse-b.precedenti)),2)
  from base b where p_rata.importo is not null
$$;
revoke all on function private.fornitore_residuo_rata(public.rate_fornitori) from public,anon,authenticated,service_role;

create or replace function private.fornitore_registra_quota_banca(
  p_company uuid,p_tx uuid,p_tipo text,p_documento uuid,p_importo numeric,p_data date,p_nota text
)
returns void language plpgsql set search_path = '' as $$
declare
  r public.rate_fornitori%rowtype;
  f public.fatture_ricevute%rowtype;
  fattura uuid;
  residuo numeric;
  chiude boolean;
  fattura_segnata boolean:=false;
  costo_segnato boolean:=false;
  stato_prima text;
  stato_il timestamptz;
  titolo text;
begin
  if p_tipo='rata_fornitore' then
    select x.fattura_ricevuta_id into fattura from public.rate_fornitori x where x.id=p_documento and x.company_id=p_company;
  else
    fattura:=p_documento;
  end if;
  if fattura is not null then
    select * into f from public.fatture_ricevute where id=fattura and company_id=p_company for update;
    if not found or public.e_nota_credito_ricevuta(f.tipo_documento) or public.e_autofattura_ricevuta(f.tipo_documento)
      or f.stato in ('annullata','scartata','rifiutata','eliminata') then
      raise exception 'Fattura del fornitore da verificare.' using errcode='22023';
    end if;
  end if;

  if p_tipo='rata_fornitore' then
    select * into r from public.rate_fornitori where id=p_documento and company_id=p_company for update;
    if not found then raise exception 'Rata del fornitore non trovata.' using errcode='P0002'; end if;
    if r.fattura_ricevuta_id is distinct from fattura then raise exception 'La rata è cambiata.' using errcode='PT409'; end if;
    if r.stato in ('pagata','stornata','da_bloccare','richiamata') then
      raise exception 'La rata del fornitore richiede una verifica (stato %).',r.stato using errcode='22023';
    end if;
    if exists(select 1 from public.company_costs c where c.id=r.company_cost_id and c.company_id=p_company
      and (c.annullato_il is not null or c.is_paid)) then
      raise exception 'Verifica lo stato del costo collegato alla rata.' using errcode='22023';
    end if;
    residuo:=private.fornitore_residuo_rata(r);
    stato_prima:=r.stato;
    titolo:='Rata fornitore n. '||r.numero;
  else
    if f.pagata_il is not null then
      raise exception 'La fattura è già pagata: collega il movimento come prova.' using errcode='22023';
    end if;
    if exists(select 1 from public.rate_fornitori x where x.company_id=p_company and x.fattura_ricevuta_id=f.id and x.stato<>'stornata') then
      raise exception 'La fattura è a rate: scegli la rata del fornitore.' using errcode='22023';
    end if;
    select s.residuo into residuo from private.fatture_ricevute_calcola_saldi(p_company,null,f.id) s;
    titolo:='Fattura fornitore n. '||f.numero_fattura;
  end if;
  if exists(select 1 from public.scadenze x where x.company_id=p_company
    and x.cost_id=coalesce(r.company_cost_id,f.company_cost_id) and x.direction='uscita'
    and x.status in ('da_pagare','parziale') and not coalesce(x.is_previsionale,false)) then
    raise exception 'Scegli la scadenza aperta per registrare il pagamento.' using errcode='22023';
  end if;
  if exists(select 1 from public.bank_reconciliations x where x.company_id=p_company and x.transaction_id=p_tx
    and x.unmatched_at is null and ((r.id is not null and x.rata_fornitore_id=r.id)
      or (r.id is null and x.rata_fornitore_id is null and x.fattura_ricevuta_id=f.id))) then
    raise exception 'Questo documento è già su questo movimento.' using errcode='23505';
  end if;
  if residuo is null or residuo<=0 or p_importo>residuo then
    raise exception 'Controlla il residuo verso il fornitore (% €).',residuo using errcode='22023';
  end if;

  chiude:=p_importo=residuo;
  if chiude and r.id is not null then
    update public.rate_fornitori set stato='pagata',pagata_il=p_data
    where id=r.id and company_id=p_company returning stato_cambiato_il into stato_il;
  end if;
  if chiude and f.id is not null and not exists(
    select 1 from public.rate_fornitori x where x.company_id=p_company and x.fattura_ricevuta_id=f.id
      and x.stato not in ('pagata','stornata')) then
    update public.fatture_ricevute set pagata_il=p_data,pagamento_segnato_da=auth.uid(),pagamento_segnato_at=now()
    where id=f.id and company_id=p_company and pagata_il is null;
    fattura_segnata:=found;
    if fattura_segnata and r.id is null and f.company_cost_id is not null
      and not exists(select 1 from public.fatture_ricevute altra where altra.company_id=p_company
        and altra.company_cost_id=f.company_cost_id and altra.id<>f.id
        and altra.stato not in ('annullata','scartata','rifiutata','eliminata'))
      and not exists(select 1 from public.scadenze x where x.company_id=p_company
        and x.cost_id=f.company_cost_id and x.direction='uscita' and x.status in ('da_pagare','parziale')) then
      update public.company_costs set is_paid=true,paid_date=p_data,updated_at=now()
      where id=f.company_cost_id and company_id=p_company and not coalesce(is_paid,false);
      costo_segnato:=found;
    end if;
  end if;
  insert into public.bank_reconciliations(company_id,transaction_id,rata_fornitore_id,fattura_ricevuta_id,matched_amount,
    match_type,matched_at,matched_by,notes,ripartita,payment_source)
  values(p_company,p_tx,r.id,f.id,p_importo,'manual',now(),auth.uid(),concat_ws(' · ',titolo,p_nota),true,
    jsonb_strip_nulls(jsonb_build_object('tipo','quota_fornitore','chiude',chiude,'stato_prima',stato_prima,
      'stato_rata_il',stato_il,'data',p_data,'fattura_segnata',fattura_segnata,'costo_segnato',costo_segnato)));
end
$$;
revoke all on function private.fornitore_registra_quota_banca(uuid,uuid,text,uuid,numeric,date,text) from public,anon,authenticated,service_role;

create or replace function private.fornitore_scollega_quota_banca(p_quota public.bank_reconciliations)
returns jsonb language plpgsql set search_path = '' as $$
declare
  r public.rate_fornitori%rowtype;
  chiusura public.bank_reconciliations%rowtype;
  segnata public.bank_reconciliations%rowtype;
  riapri_fattura boolean;
begin
  -- Chi paga dalla fattura prende prima la fattura e poi le rate.
  perform f.id from public.fatture_ricevute f
  where f.id=p_quota.fattura_ricevuta_id and f.company_id=p_quota.company_id for update;
  select * into r from public.rate_fornitori
  where id=p_quota.rata_fornitore_id and company_id=p_quota.company_id for update;

  select x.* into chiusura from public.bank_reconciliations x
  where x.company_id=p_quota.company_id and x.unmatched_at is null
    and x.payment_source->>'tipo'='quota_fornitore' and x.payment_source->>'chiude'='true'
    and ((r.id is not null and x.rata_fornitore_id=r.id)
      or (r.id is null and x.rata_fornitore_id is null and x.fattura_ricevuta_id=p_quota.fattura_ricevuta_id))
  order by x.matched_at desc,x.id limit 1;

  select x.* into segnata from public.bank_reconciliations x
  join public.fatture_ricevute f on f.id=x.fattura_ricevuta_id and f.company_id=x.company_id
    and f.pagamento_segnato_at=x.matched_at and f.pagata_il=(x.payment_source->>'data')::date
  where x.company_id=p_quota.company_id and x.fattura_ricevuta_id=p_quota.fattura_ricevuta_id
    and x.unmatched_at is null and x.payment_source->>'tipo'='quota_fornitore' and x.payment_source->>'fattura_segnata'='true'
  order by x.matched_at desc,x.id limit 1;

  update public.bank_reconciliations set unmatched_at=now(),unmatch_reason='Riga scollegata'
  where id=p_quota.id and company_id=p_quota.company_id and unmatched_at is null;

  riapri_fattura:=r.id is null and chiusura.id is not null;
  if r.id is not null and chiusura.id is not null and r.stato='pagata'
    and r.pagata_il=(chiusura.payment_source->>'data')::date
    and r.stato_cambiato_il is not distinct from (chiusura.payment_source->>'stato_rata_il')::timestamptz
    and private.fornitore_residuo_rata(r)>0 then
    update public.rate_fornitori set stato=coalesce(chiusura.payment_source->>'stato_prima','da_pagare'),pagata_il=null
    where id=r.id and company_id=p_quota.company_id;
    riapri_fattura:=true;
  end if;
  if riapri_fattura and segnata.id is not null then
    update public.fatture_ricevute set pagata_il=null,pagamento_segnato_da=null,pagamento_segnato_at=null
    where id=segnata.fattura_ricevuta_id and company_id=segnata.company_id
      and pagamento_segnato_at=segnata.matched_at;
    if segnata.payment_source->>'costo_segnato'='true' then
      update public.company_costs set is_paid=false,paid_date=null,updated_at=now()
      where id=(select company_cost_id from public.fatture_ricevute where id=segnata.fattura_ricevuta_id)
        and company_id=segnata.company_id and paid_date=(segnata.payment_source->>'data')::date;
    end if;
  end if;
  return jsonb_build_object('tipo','quota_fornitore');
end
$$;
revoke all on function private.fornitore_scollega_quota_banca(public.bank_reconciliations) from public,anon,authenticated,service_role;

do $ripartizione$
declare
  d text:=pg_get_functiondef('public.riconcilia_movimento_su_documenti(uuid,jsonb,text)'::regprocedure);
  da integer:=strpos(d,$s$    ELSIF r.tipo = 'rata_fornitore' THEN$s$);
  a integer:=strpos(d,$s$    ELSE
      SELECT * INTO s FROM public.scadenze$s$);
  undo text:=pg_get_functiondef('public.scollega_riga_ripartita(uuid)'::regprocedure);
  links text:=pg_get_functiondef('private.bank_movimento_links(uuid,uuid)'::regprocedure);
  ancora text:=$s$  IF rc.payment_source->>'tipo' IN ('prova', 'rata_fornitore', 'ricevuta') THEN$s$;
  prova text:=$s$'existing_payment',r.prima_nota_id IS NOT NULL OR r.payment_source IS NOT NULL$s$;
  etichetta text:=$s$  j:=jsonb_build_object('id',r.id,'kind',tipo$s$;
begin
  if strpos(d,'private.fornitore_registra_quota_banca(')=0 then
    if da=0 or a<=da then raise exception 'Revisionare la ripartizione delle uscite'; end if;
    execute left(d,da-1)||$s$    ELSIF r.tipo IN ('rata_fornitore','ricevuta') THEN
      PERFORM private.fornitore_registra_quota_banca(v_company,t.id,r.tipo,r.id,r.importo,v_data,v_nota);

$s$||substr(d,a);
  end if;
  if strpos(undo,'private.fornitore_scollega_quota_banca(')=0 then
    if strpos(undo,ancora)=0 then raise exception 'Revisionare lo scollegamento delle uscite'; end if;
    execute replace(undo,ancora,$s$  IF rc.payment_source->>'tipo'='quota_fornitore' THEN
    IF NOT public.puo_gestire_scadenze(rc.company_id) THEN
      RAISE EXCEPTION 'Non hai il permesso di modificare i pagamenti.' USING ERRCODE='42501';
    END IF;
    RETURN private.fornitore_scollega_quota_banca(rc);
  END IF;

$s$||ancora);
  end if;
  if strpos(links,'''quota_fornitore''')=0 then
    if strpos(links,prova)=0 or strpos(links,etichetta)=0 then
      raise exception 'Revisionare i collegamenti delle quote bancarie';
    end if;
    links:=replace(links,prova,$s$'existing_payment',r.prima_nota_id IS NOT NULL OR
    (r.payment_source IS NOT NULL AND r.payment_source->>'tipo' IS DISTINCT FROM 'quota_fornitore')$s$);
    execute replace(links,etichetta,$s$  IF r.payment_source->>'tipo'='quota_fornitore' THEN
    tipo:='quota_fornitore';
    IF billing OR costs THEN
      titolo:=CASE WHEN r.rata_fornitore_id IS NULL THEN 'Fattura fornitore' ELSE 'Rata fornitore' END;
      IF r.fattura_ricevuta_id IS NOT NULL AND billing THEN
        SELECT titolo||' n. '||f.numero_fattura INTO titolo FROM public.fatture_ricevute f
        WHERE f.id=r.fattura_ricevuta_id AND f.company_id=p_company;
        url:='/azienda/documenti/fatture-ricevute';
      END IF;
    END IF;
  END IF;
$s$||etichetta);
  end if;
end
$ripartizione$;

-- Gli stessi residui alimentano il suggerimento e la ricerca manuale.
do $candidati$
declare
  d text:=pg_get_functiondef('public.bank_candidati_movimento(uuid,uuid,text,boolean)'::regprocedure);
  dove text:=$s$  ) SELECT coalesce(jsonb_agg(j),'[]') INTO result FROM($s$;
begin
  if strpos(d,'private.fornitore_residuo_rata(')>0 then return; end if;
  if strpos(d,dove)=0 then raise exception 'Revisionare la ricerca di documenti in banca'; end if;
  execute replace(d,dove,$s$   UNION ALL
   SELECT r.id,'rata_fornitore','Rata '||r.numero||' · '||coalesce(f.numero_fattura,c.name),
     concat_ws(' · ',coalesce(s.name,f.cedente_ragione_sociale),r.scadenza),private.fornitore_residuo_rata(r)
   FROM public.rate_fornitori r
   JOIN public.company_costs c ON c.id=r.company_cost_id AND c.company_id=r.company_id AND c.annullato_il IS NULL AND NOT coalesce(c.is_paid,false)
   LEFT JOIN public.fatture_ricevute f ON f.id=r.fattura_ricevuta_id AND f.company_id=r.company_id
   LEFT JOIN public.suppliers s ON s.id=coalesce(c.supplier_id,f.fornitore_id) AND s.company_id=r.company_id
   WHERE r.company_id=p_company AND r.stato NOT IN('pagata','stornata','da_bloccare','richiamata')
     AND t.transaction_type='debit' AND public.puo_gestire_scadenze(p_company)
     AND NOT EXISTS(select 1 from public.scadenze x where x.company_id=p_company and x.cost_id=c.id
       and x.direction='uscita' and x.status in ('da_pagare','parziale'))
   UNION ALL
   SELECT f.id,'ricevuta','Fattura '||f.numero_fattura,concat_ws(' · ',f.cedente_ragione_sociale,f.data_fattura),saldi.residuo
   FROM private.fatture_ricevute_calcola_saldi(p_company,null,null) saldi
   JOIN public.fatture_ricevute f ON f.id=saldi.id AND f.company_id=p_company
   WHERE t.transaction_type='debit' AND public.puo_gestire_scadenze(p_company)
     AND f.pagata_il IS NULL AND saldi.residuo>0 AND saldi.rate_totali=0
     AND NOT EXISTS(select 1 from public.scadenze x where x.company_id=p_company and x.cost_id=f.company_cost_id
       and x.direction='uscita' and x.status in ('da_pagare','parziale'))
$s$||dove);
end
$candidati$;

do $classificazione$
declare
  d text:=pg_get_functiondef('private.tes_classifica(uuid,uuid)'::regprocedure);
  rata text:=$s$s.id,round(r.importo,2),r.scadenza,false,$s$;
  ricevuta text:=$s$s.id,round(coalesce(f.netto_a_pagare,f.totale_documento),2),NULL::date,false,f.data_fattura$s$;
  fonti_fattura text:=$s$FROM public.fatture_ricevute f LEFT JOIN public.suppliers s ON s.id=f.fornitore_id AND s.company_id=f.company_id
  WHERE NOT cred AND f.company_id=p_company AND f.pagata_il IS NULL$s$;
  filtro_rata text:=$s$   AND (abs(r.importo-amt)<0.005 OR s.id=ANY(forn_ids))$s$;
  filtro_fattura text:=$s$   AND (abs(coalesce(f.netto_a_pagare,f.totale_documento)-amt)<0.005 OR s.id=ANY(forn_ids))$s$;
  parziali text:=$s$NOT (x->>'nc')::boolean AND x->>'tipo' NOT IN('rata','rata_fornitore','ricevuta') AND (x->>'forza'='forte'$s$;
  proposta text:=$s$   out:=jsonb_build_object('esito',CASE WHEN jsonb_array_length(ex)=1 THEN 'proposta' ELSE 'scelta' END,
    'natura',CASE WHEN jsonb_array_length(ex)=1 AND amt>(ex->0->>'residuo')::numeric THEN 'eccedenza' ELSE 'parziale' END,
    'regola','R-PARZIALE'$s$;
begin
  if strpos(d,'private.fornitore_residuo_rata(')>0 then return; end if;
  if strpos(d,rata)=0 or strpos(d,ricevuta)=0 or strpos(d,fonti_fattura)=0 or strpos(d,filtro_rata)=0
    or strpos(d,filtro_fattura)=0 or strpos(d,parziali)=0 or strpos(d,proposta)=0 then
    raise exception 'Revisionare i candidati dei pagamenti fornitori';
  end if;
  d:=replace(d,rata,$s$s.id,rs.residuo,r.scadenza,false,$s$);
  d:=replace(d,$s$  WHERE NOT cred AND r.company_id=p_company AND r.stato NOT IN('pagata','stornata') AND coalesce(r.importo,0)>0.005$s$,
    $s$   CROSS JOIN LATERAL (SELECT private.fornitore_residuo_rata(r) residuo OFFSET 0) rs
  WHERE NOT cred AND r.company_id=p_company AND r.stato NOT IN('pagata','stornata') AND coalesce(r.importo,0)>0.005$s$);
  d:=replace(d,filtro_rata,$s$   AND r.stato NOT IN('da_bloccare','richiamata') AND coalesce(cc.is_paid,false)=false AND cc.annullato_il IS NULL
   AND (s.id=ANY(forn_ids) OR abs(r.importo-amt)<0.005
        OR private.fornitore_quote_banca(p_company,null,r.id)>0
        OR EXISTS(SELECT 1 FROM public.prima_nota_entries p WHERE p.company_id=p_company AND p.cost_id=r.company_cost_id))
   AND (abs(rs.residuo-amt)<0.005 OR s.id=ANY(forn_ids)) AND rs.residuo>0.005$s$);
  d:=replace(d,ricevuta,$s$s.id,saldo.residuo,NULL::date,false,f.data_fattura$s$);
  d:=replace(d,fonti_fattura,$s$FROM public.fatture_ricevute f LEFT JOIN public.suppliers s ON s.id=f.fornitore_id AND s.company_id=f.company_id
   CROSS JOIN LATERAL private.fatture_ricevute_calcola_saldi(p_company,null,f.id) saldo
  WHERE NOT cred AND f.company_id=p_company AND f.pagata_il IS NULL
   AND (s.id=ANY(forn_ids) OR abs(coalesce(f.netto_a_pagare,f.totale_documento)-amt)<0.005
        OR private.fornitore_quote_banca(p_company,f.id,null)>0
        OR (cardinality(rif_fatture)=1 AND private.tes_riferimento_fattura_coincide(rif_fatture[1],f.numero_fattura,extract(year FROM f.data_fattura)::int)))$s$);
  d:=replace(d,filtro_fattura,$s$   AND saldo.residuo>0.005 AND (abs(saldo.residuo-amt)<0.005 OR s.id=ANY(forn_ids)
      OR (cardinality(rif_fatture)=1 AND private.tes_riferimento_fattura_coincide(rif_fatture[1],f.numero_fattura,extract(year FROM f.data_fattura)::int)))$s$);
  d:=replace(d,parziali,$s$NOT (x->>'nc')::boolean AND (x->>'tipo' NOT IN('rata','rata_fornitore','ricevuta')
    OR (x->>'tipo' IN('rata_fornitore','ricevuta') AND cardinality(rif_fatture)=1
      AND x->'riferimenti' ? rif_fatture[1] AND x->>'forza'='forte'
      AND amt<(x->>'residuo')::numeric)) AND (x->>'forza'='forte'$s$);
  d:=replace(d,' rif_fatture text[]; riferita text[];', ' rif_fatture text[]; riferita text[]; acconto_certo boolean;');
  d:=replace(d,proposta,$s$   acconto_certo:=NOT cred AND jsonb_array_length(ex)=1 AND jsonb_array_length(cands)=1
     AND jsonb_array_length(confl)=0 AND cardinality(rif_fatture)=1
     AND ex->0->>'tipo' IN('rata_fornitore','ricevuta') AND amt<(ex->0->>'residuo')::numeric
     AND (length(tx_chiave)>=4 AND tx_chiave=ex->0->>'chiave_soggetto'
       OR ex->0->'motivi' @> '["IBAN verificato della controparte"]'::jsonb)
     AND ncaus~'\m(acconto|anticipo|tranche|pagamento parziale)\M';
   out:=jsonb_build_object('esito',CASE WHEN acconto_certo THEN 'automatico' WHEN jsonb_array_length(ex)=1 THEN 'proposta' ELSE 'scelta' END,
    'natura',CASE WHEN acconto_certo THEN 'documento' WHEN jsonb_array_length(ex)=1 AND amt>(ex->0->>'residuo')::numeric THEN 'eccedenza' ELSE 'parziale' END,
    'regola',CASE WHEN acconto_certo THEN 'R-PARZIALE-FORNITORE' ELSE 'R-PARZIALE' END$s$);
  execute d;
end
$classificazione$;

-- Lo scadenzario legge gli importi per costo e per rata in una sola passata.
-- Espone il totale attribuito senza i dati bancari del movimento.
create or replace function public.fornitore_quote_per_scadenze(p_company uuid)
returns table(costo_id uuid,rata_id uuid,importo numeric,rettifica_totale numeric)
language sql stable security definer set search_path = '' as $$
  with quote as materialized (
    select coalesce(r.company_cost_id,f.company_cost_id) costo,b.rata_fornitore_id rata,
      f.id fattura,f.totale_documento lordo,sum(b.matched_amount) versato
  from public.bank_reconciliations b
  left join public.rate_fornitori r on r.id=b.rata_fornitore_id and r.company_id=p_company
  left join public.fatture_ricevute f on f.id=b.fattura_ricevuta_id and f.company_id=p_company
  where b.company_id=p_company and b.unmatched_at is null and b.payment_source->>'tipo'='quota_fornitore'
    and coalesce(r.company_cost_id,f.company_cost_id) is not null
    and (public.ai_is_service_role() or (
      public.puo_vedere_scadenze(p_company)
      and (
        public.user_can_read_accountant_company(p_company)
        or public.has_role(auth.uid(),'super_admin'::public.app_role)
        or p_company=any(public.aziende_con_permesso('can_view_costs')||public.aziende_con_permesso('can_manage_purchasing'))
        or (p_company=public.get_user_company_id(auth.uid()) and (
          public.has_role(auth.uid(),'company_admin'::public.app_role)
          or public.has_permission(auth.uid(),'can_view_forecast')
        ))
      )
    ))
    group by 1,2,3,4
  )
  select q.costo,q.rata,sum(q.versato),coalesce(sum(s.dovuto-q.lordo),0)
  from quote q left join lateral (
    select v.dovuto from private.fatture_ricevute_calcola_saldi(p_company,null,q.fattura) v
    where q.rata is null and q.fattura is not null
  ) s on true
  group by 1,2
$$;
revoke all on function public.fornitore_quote_per_scadenze(uuid) from public,anon;
grant execute on function public.fornitore_quote_per_scadenze(uuid) to authenticated,service_role;

do $scadenzario$
declare
  d text:=pg_get_functiondef('public.scadenzario_fonti(uuid)'::regprocedure);
  r text:=pg_get_functiondef('public.scadenzario_rate_fornitori(uuid)'::regprocedure);
  d_rata text:=$s$    select r.*
    from public.rate_fornitori r$s$;
  d_totale text:=$s$select c.id,'totale',c.lordo,nullif(c.due_date,date '9999-12-31'),c.payment_method,false,0,0$s$;
  d_residuo text:=$s$else least(q.importo,greatest(0,c.versato-q.chiuse-q.precedente)) end as importo$s$;
  r_rata text:=$s$      r.pagata_il, r.updated_at, r.fattura_ricevuta_id, r.company_cost_id, c.supplier_id, c.is_paid,$s$;
  r_residuo text:=$s$else round(greatest(0, r.importo - greatest(0,$s$;
begin
  if strpos(d,'public.fornitore_quote_per_scadenze(')=0 then
    if strpos(d,d_rata)=0 or strpos(d,d_totale)=0 or strpos(d,d_residuo)=0 then
      raise exception 'Revisionare i residui delle fonti dello scadenzario';
    end if;
    d:=replace(d,'  ), rate as materialized (',$s$  ), banca as materialized (
    select * from public.fornitore_quote_per_scadenze(p_company_id)
  ), rate as materialized ($s$);
    d:=replace(d,d_rata,$s$    select r.*,coalesce(b.importo,0) quota_banca
    from public.rate_fornitori r
    left join banca b on b.rata_id=r.id and b.costo_id=r.company_cost_id$s$);
    d:=replace(d,'r.stato=''pagata'' as pagata,','r.stato=''pagata'' as pagata,r.quota_banca,');
    d:=replace(d,'sum(r.importo) filter(where','sum(greatest(0,r.importo-r.quota_banca)) filter(where');
    d:=replace(d,d_totale,$s$select c.id,'totale',c.lordo+coalesce(b.rettifica_totale,0),nullif(c.due_date,date '9999-12-31'),c.payment_method,false,
      coalesce(b.importo,0),0,0$s$);
    d:=replace(d,'from costi c where not exists(select 1 from rate',
      'from costi c left join banca b on b.costo_id=c.id and b.rata_id is null where not exists(select 1 from rate');
    d:=replace(d,d_residuo,$s$else least(q.importo,q.quota_banca+greatest(0,c.versato-q.chiuse-q.precedente)) end as importo$s$);
    execute d;
  end if;
  if strpos(r,'public.fornitore_quote_per_scadenze(')=0 then
    if strpos(r,r_rata)=0 or strpos(r,r_residuo)=0 then raise exception 'Revisionare i residui delle rate fornitori'; end if;
    r:=replace(r,'  ), rate as (',$s$  ), banca as materialized (
    select * from public.fornitore_quote_per_scadenze(p_company_id)
  ), rate as ($s$);
    r:=replace(r,r_rata,r_rata||$s$
      coalesce(b.importo,0) as quota_banca,$s$);
    r:=replace(r,'sum(r.importo) filter (where','sum(greatest(0,r.importo-coalesce(b.importo,0))) filter (where');
    r:=replace(r,'    from public.rate_fornitori r',$s$    from public.rate_fornitori r
    left join banca b on b.rata_id=r.id and b.costo_id=r.company_cost_id$s$);
    r:=replace(r,r_residuo,$s$else round(greatest(0, r.importo-r.quota_banca - greatest(0,$s$);
    execute r;
  end if;
end
$scadenzario$;

notify pgrst,'reload schema';
