-- Costo previsto delle lavorazioni: dalle voci del preventivo e dal listino
-- manodopera (29/10/2026, richiesta di Dimora Torino, vale per tutti).
--
-- Cosa mancava. Sulla commessa O-0001 di Dimora (dal computo RST-2026-010) le
-- 13 lavorazioni hanno 12 ditte e nessun costo previsto: il computo sapeva per
-- ogni voce quantità, unità, tariffa del listino manodopera e costo (59 voci su
-- 59 collegate a tariffe_aziendali, 38.641,75 € di manodopera), ma
-- converti_modulo_commessa_atomic ne copiava solo il testo nelle note della
-- fase; crea_commessa_preventivo_atomic faceva lo stesso con le righe di posa
-- del preventivo. E il dialog della ditta calcolava tariffa × quantità per
-- poi salvare solo l'importo: da dove venisse non restava scritto.
--
-- Cosa fa.
-- 1. order_work_phase_voci: le voci previste di una lavorazione, una riga per
--    voce del preventivo, con quantità, unità, tariffa, costo unitario
--    (lavoro e materiali, senza IVA) e venduto. Le leggono solo staff con
--    «Ordini e Commesse» e «Costi» sulla commessa: l'operaio e il
--    subappaltatore, che vedono la fase, non vedono i costi.
-- 2. order_external_teams: tariffa_id, quantita, costo_unitario (senza IVA) e
--    costo_origine (listino, preventivo, manuale) del costo previsto della
--    ditta.
-- 3. Le due conversioni scrivono le voci; quella dal computo RST mette anche
--    il venduto della fase (somma delle voci) quando le voci fanno
--    esattamente l'imponibile del preventivo (niente sconto finale da
--    ripartire).
-- 4. Le commesse già aperte ricevono le voci (il 29/10: O-0001 di Dimora, 59
--    voci su 13 lavorazioni, l'unica dal computo RST con voci; le 8
--    lavorazioni da preventivo stanno su commesse di prova cancellate); il
--    venduto solo dove la fase non ne ha uno.
--
-- v_ordine_marginalita non cambia: il conto economico della commessa resta sul
-- consuntivo. Il previsto delle voci vale nella tabella delle lavorazioni
-- (economiaFasi), e solo dove nessuna assegnazione ha un costo previsto.

set local lock_timeout = '3s';
set local statement_timeout = '60s';

-- 1 ────────────────────────────────────────────────────────────────────────
create table if not exists public.order_work_phase_voci (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  order_id uuid not null references public.orders(id) on delete cascade,
  phase_id uuid not null references public.order_work_phases(id) on delete cascade,
  position integer not null default 0,
  descrizione text not null,
  unita text,
  quantita numeric not null default 0 check (quantita >= 0),
  -- Unitari senza IVA. Lavoro: posa, ma anche trasporto, nolo, smaltimento.
  costo_manodopera numeric not null default 0 check (costo_manodopera >= 0),
  costo_materiali numeric not null default 0 check (costo_materiali >= 0),
  -- Venduto della voce senza IVA, come sul preventivo.
  importo numeric,
  tariffa_id uuid references public.tariffe_aziendali(id) on delete set null,
  origine text not null check (origine in ('preventivo', 'computo_rst')),
  origine_id uuid not null,
  origine_codice text,
  created_at timestamptz not null default now(),
  unique (phase_id, origine, origine_id)
);
create index if not exists order_work_phase_voci_order_idx on public.order_work_phase_voci (order_id);
create index if not exists order_work_phase_voci_tariffa_idx on public.order_work_phase_voci (tariffa_id) where tariffa_id is not null;

comment on table public.order_work_phase_voci is
  'Voci previste di una lavorazione, dal preventivo o dal computo: quantità, tariffa del listino, costo unitario senza IVA. Il costo previsto della fase quando nessuna assegnazione ne ha uno.';

-- Commessa e azienda sono quelle della fase, qualunque cosa arrivi.
create or replace function public.voce_fase_segue_la_fase()
returns trigger language plpgsql security definer set search_path to 'public' as $$
begin
  select f.order_id, f.company_id into new.order_id, new.company_id
    from public.order_work_phases f where f.id = new.phase_id;
  if new.order_id is null then raise exception 'Lavorazione non trovata.'; end if;
  if new.tariffa_id is not null and not exists (
    select 1 from public.tariffe_aziendali t where t.id = new.tariffa_id and t.company_id = new.company_id) then
    new.tariffa_id := null;
  end if;
  return new;
end;
$$;
revoke all on function public.voce_fase_segue_la_fase() from public, anon, authenticated;
drop trigger if exists trg_voce_fase_segue_la_fase on public.order_work_phase_voci;
create trigger trg_voce_fase_segue_la_fase before insert or update on public.order_work_phase_voci
  for each row execute function public.voce_fase_segue_la_fase();

alter table public.order_work_phase_voci enable row level security;
revoke all on public.order_work_phase_voci from public, anon;
grant select, insert, update, delete on public.order_work_phase_voci to authenticated;

drop policy if exists voci_fase_lettura on public.order_work_phase_voci;
create policy voci_fase_lettura on public.order_work_phase_voci for select to authenticated
  using (
    public.has_permission_for_company((select auth.uid()), 'can_view_orders', public.get_order_company_id(order_id))
    and public.has_permission_for_company((select auth.uid()), 'can_view_costs', public.get_order_company_id(order_id))
    and public._order_visible_under_rls(order_id, false)
  );
drop policy if exists voci_fase_scrittura on public.order_work_phase_voci;
create policy voci_fase_scrittura on public.order_work_phase_voci for all to authenticated
  using (
    public.has_permission_for_company((select auth.uid()), 'can_edit_orders', public.get_order_company_id(order_id))
    and public.has_permission_for_company((select auth.uid()), 'can_view_costs', public.get_order_company_id(order_id))
    and public._order_visible_under_rls(order_id, true)
  )
  with check (
    public.has_permission_for_company((select auth.uid()), 'can_edit_orders', public.get_order_company_id(order_id))
    and public.has_permission_for_company((select auth.uid()), 'can_view_costs', public.get_order_company_id(order_id))
    and public._order_visible_under_rls(order_id, true)
  );
drop policy if exists blocco_utente_bloccato on public.order_work_phase_voci;
create policy blocco_utente_bloccato on public.order_work_phase_voci as restrictive for all to authenticated
  using (not (select public.utente_bloccato())) with check (not (select public.utente_bloccato()));

-- 2 ────────────────────────────────────────────────────────────────────────
alter table public.order_external_teams
  add column if not exists tariffa_id uuid references public.tariffe_aziendali(id) on delete set null,
  add column if not exists quantita numeric,
  add column if not exists costo_unitario numeric,
  add column if not exists costo_origine text;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'order_external_teams_costo_origine_check') then
    alter table public.order_external_teams add constraint order_external_teams_costo_origine_check
      check (costo_origine is null or costo_origine in ('listino', 'preventivo', 'manuale'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'order_external_teams_quantita_check') then
    alter table public.order_external_teams add constraint order_external_teams_quantita_check
      check ((quantita is null or quantita >= 0) and (costo_unitario is null or costo_unitario >= 0));
  end if;
end $$;
comment on column public.order_external_teams.costo_unitario is
  'Costo unitario senza IVA da cui è uscito cost_preventivo (tariffa del listino o voci del preventivo).';

-- 3a ───────────────────────────────────────────────────────────────────────
create or replace function public.crea_commessa_preventivo_atomic(p_quote_id uuid, p_order_data jsonb, p_items jsonb DEFAULT '[]'::jsonb, p_installments jsonb DEFAULT '[]'::jsonb, p_salesperson jsonb DEFAULT NULL::jsonb, p_quote_version integer DEFAULT NULL::integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  q public.quotes%rowtype;
  v_result jsonb;
  v_order uuid;
  v_net numeric;
  v_vat numeric;
  v_position integer := 0;
  r record;
  v_famiglia record;
  v_fase uuid;
begin
  if auth.uid() is null then raise exception 'Sessione scaduta. Accedi di nuovo.' using errcode='42501'; end if;
  -- Serializza le due strade e i doppi clic sullo stesso preventivo.
  select * into q from public.quotes where id=p_quote_id for update;
  if not found then raise exception 'Preventivo non trovato.'; end if;
  perform public.assert_company_access(q.company_id);
  if public.has_permission_for_company(auth.uid(), 'can_edit_orders', q.company_id) is not true then
    raise exception 'Non hai il permesso di creare commesse.' using errcode='42501';
  end if;
  if q.deleted_at is not null or q.status <> 'accettata' or coalesce(q.source,'') like 'modulo:%' then
    raise exception 'Il preventivo deve essere accettato e appartenere al preventivatore.';
  end if;
  if p_quote_version is not null and q.version is distinct from p_quote_version then
    raise exception 'Il preventivo è cambiato. Riaprilo e controlla le voci prima di continuare.';
  end if;
  if exists(select 1 from public.orders where quote_id=q.id) then
    raise exception 'Esiste già una commessa associata a questo preventivo.' using errcode='23505';
  end if;
  -- Una revisione (o la madre) di un preventivo che è già una commessa: un contratto, una commessa.
  -- Le modifiche dopo la firma sono una variante di quella commessa, non un cantiere nuovo.
  with recursive su as (
    select id, parent_quote_id from public.quotes where id = q.id
    union all
    select p.id, p.parent_quote_id from public.quotes p join su on p.id = su.parent_quote_id
  ), giu as (
    select id from su where parent_quote_id is null
    union all
    select c.id from public.quotes c join giu on c.parent_quote_id = giu.id
  )
  select o.order_code, oq.quote_number into v_famiglia
    from public.orders o join public.quotes oq on oq.id = o.quote_id
   where o.quote_id in (select id from giu) and o.quote_id <> q.id and o.deleted_at is null
   limit 1;
  if v_famiglia.order_code is not null or v_famiglia.quote_number is not null then
    raise exception 'Il preventivo % è già la commessa %: le modifiche di questa revisione vanno registrate come variante di quella commessa.',
      v_famiglia.quote_number, v_famiglia.order_code using errcode='23505';
  end if;
  if (p_order_data->>'company_id')::uuid is distinct from q.company_id then
    raise exception 'Azienda non valida.' using errcode='42501';
  end if;
  if exists(select 1 from public.quote_items where quote_id=q.id
    and not coalesce(is_optional,false) and coalesce(quantity,1) <> 0
    and case when nullif(item_category,'') is null then coalesce(item_type,'') not in ('product','service')
      else item_category not in ('prodotto','posa','trasporto','smaltimento','nolo','tiro_piano','pratica','nota','sconto','subtotale') end) then
    raise exception 'Ci sono voci da classificare: rivedi il preventivo.';
  end if;
  v_net := case when q.subtotal > 0 then round(q.subtotal-coalesce(q.discount_amount,0),2) else round(coalesce(q.total,0),2) end;
  v_vat := case when q.subtotal > 0 and v_net > 0 then round(coalesce(q.vat_amount,0)/v_net*100,2) else 0 end;
  -- Importo contrattuale e aliquota provengono dal preventivo, mai dalla somma dei soli materiali.
  v_result := public.create_order_atomic(
    p_order_data || jsonb_build_object('total_amount',v_net,'vat_rate',v_vat),
    p_items, p_salesperson, auth.uid(), p_installments);
  v_order := (v_result->>'id')::uuid;
  update public.orders set quote_id=q.id, quote_number=q.quote_number,
    client_name=q.client_name,client_email=q.client_email,client_phone=q.client_phone,
    client_company=q.client_company,client_address=q.client_address,
    indirizzo_lavori=q.indirizzo_lavori,tipo_lavoro=q.tipo_lavoro,opportunity_id=q.opportunity_id,
    created_by=auth.uid()
    where id=v_order and company_id=q.company_id;
  -- Le lavorazioni non entrano in order_items: nessun acquisto o costo automatico.
  for r in select * from public.quote_items where quote_id=q.id
    and not coalesce(is_optional,false) and coalesce(quantity,1) <> 0
    and (item_category in ('posa','trasporto','smaltimento','nolo','tiro_piano','pratica')
      or (nullif(item_category,'') is null and item_type='service'))
    order by sort_order,id
  loop
    insert into public.order_work_phases(company_id,order_id,name,position,notes,importo_venduto)
    values(q.company_id,v_order,r.name,v_position,
      concat_ws(E'\n',nullif(r.description,''),'Dal preventivo '||coalesce(q.quote_number,''),
        coalesce(r.quantity,1)::text||' '||coalesce(r.unit_of_measure,'')),
      case when coalesce(q.prezzo_manuale,0)=0 and coalesce(q.discount_amount,0)=0
        and coalesce(r.line_total,0)>=0 then r.line_total else null end)
    returning id into v_fase;
    -- La voce resta in chiaro: quantità, tariffa e costo interno sono il costo previsto della fase.
    insert into public.order_work_phase_voci(company_id,order_id,phase_id,position,descrizione,unita,quantita,
      costo_manodopera,importo,tariffa_id,origine,origine_id,origine_codice)
    values(q.company_id,v_order,v_fase,0,r.name,nullif(r.unit_of_measure,''),abs(coalesce(r.quantity,1)),
      greatest(coalesce(r.prezzo_acquisto,0),0),r.line_total,r.tariffa_id,'preventivo',r.id,q.quote_number)
    on conflict do nothing;
    v_position := v_position+1;
  end loop;
  update public.quotes set status='convertita',updated_at=now() where id=q.id;
  return v_result || jsonb_build_object('order_id',v_order,'lavorazioni',v_position);
end;
$function$;

-- 3b ───────────────────────────────────────────────────────────────────────
create or replace function public.converti_modulo_commessa_atomic(p_modulo text, p_progetto_id uuid, p_raggruppa_capitoli boolean DEFAULT false, p_anteprima boolean DEFAULT true, p_impronta text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  q jsonb; r jsonb; materiali jsonb := '[]'; fasi jsonb := '[]';
  componenti jsonb := '[]'; servizi jsonb := '[]'; ore jsonb := '[]'; voci jsonb := '[]';
  azienda uuid; profilo uuid; ordine uuid; fase_id uuid; sotto jsonb; sotto_pos integer; stato uuid; esito jsonb;
  aliquota numeric; netto numeric; quantita numeric; prezzo numeric; costo numeric;
  nome text; note text; descrizione text; indirizzo text; codice text; impronta text;
  posizione integer := 0; esclusi integer := 0;
  voce jsonb; voce_pos integer; somma_voci numeric := 0;
begin
  if auth.uid() is null or public.utente_bloccato() or public.utente_e_cliente_esterno() then
    raise exception 'Sessione non autorizzata.' using errcode='42501';
  end if;
  if p_modulo='fv' then
    select to_jsonb(p) into q from public.fv_progetti p where id=p_progetto_id for update;
  elsif p_modulo='rst' then
    select to_jsonb(p) into q from public.rst_progetti p where id=p_progetto_id for update;
  else raise exception 'Modulo non valido.'; end if;
  if q is null then raise exception 'Preventivo non trovato.'; end if;
  azienda := (q->>'company_id')::uuid;
  perform public.assert_company_access(azienda);
  -- Stessa visibilità delle tabelle di origine, anche per «solo assegnati».
  if azienda is distinct from public.get_effective_company_id()
     or public.check_staff_visibility(auth.uid(), (q->>'created_by')::uuid) is not true
     or public.has_permission_for_company(auth.uid(),'can_edit_orders',azienda) is not true then
    raise exception 'Non hai il permesso di convertire questo preventivo.' using errcode='42501';
  end if;
  -- Non basta che una vecchia riga di accesso esista ancora.
  if azienda is distinct from public.get_user_company_id(auth.uid())
     and not public.has_role(auth.uid(),'super_admin'::public.app_role)
     and not exists(select 1 from public.multi_company_access m where m.user_id=auth.uid()
       and m.company_id=azienda and m.status = 'active' and (m.expires_at is null or m.expires_at>now())) then
    raise exception 'Accesso azienda scaduto o revocato.' using errcode='42501';
  end if;
  if nullif(q->>'ordine_id','') is not null then
    raise exception 'Questo preventivo è già diventato una commessa.' using errcode='23505';
  end if;
  if coalesce((q->>'annullato')::boolean,false) or nullif(q->>'deleted_at','') is not null then
    raise exception 'Il preventivo è stato eliminato o annullato.';
  end if;
  aliquota := coalesce((q->>case when p_modulo='fv' then 'iva_aliquota' else 'iva_pct' end)::numeric,
    case when p_modulo='fv' then 10 else 22 end);
  if aliquota<0 then aliquota := case when p_modulo='fv' then 10 else 22 end; end if;
  if aliquota>0 and aliquota<=1 then aliquota := round(aliquota*100,2); end if;
  if p_modulo='fv' then
    netto := case when coalesce((q->>'prezzo_vendita_manuale')::numeric,0)>0
      then round((q->>'prezzo_vendita_manuale')::numeric,2)
      else round(coalesce((q->>'prezzo_vendita_iva_inclusa')::numeric,0)/(1+aliquota/100),2) end;
    select coalesce(jsonb_agg(to_jsonb(c) order by ordinamento,id),'[]') into componenti
      from (select * from public.fv_componenti_progetto where progetto_id=p_progetto_id for share) c;
    select coalesce(jsonb_agg(to_jsonb(s) order by ordinamento,id),'[]') into servizi
      from (select * from public.fv_servizi_progetto where progetto_id=p_progetto_id for share) s;
    select coalesce(jsonb_agg(to_jsonb(m) order by ordinamento,id),'[]') into ore
      from (select * from public.fv_manodopera_progetto where progetto_id=p_progetto_id for share) m;
    for r in select value from jsonb_array_elements(componenti) loop
      quantita := coalesce((r->>'quantita')::numeric,0);
      if quantita<=0 then esclusi:=esclusi+1; continue; end if;
      nome := coalesce(nullif(trim(concat_ws(' ',r->>'marca',r->>'modello')),''),nullif(r->>'descrizione',''),'Componente');
      prezzo := coalesce((r->>'prezzo_unitario_vendita')::numeric,(r->>'prezzo_unitario_netto')::numeric,0);
      costo := coalesce((r->>'prezzo_unitario_netto')::numeric,0);
      note := nullif(concat_ws(' · ',nullif(r->>'descrizione',''),nullif(r->>'categoria','')),'');
      if quantita<>trunc(quantita) then
        note:=concat(quantita,' unità × ',prezzo,' €',case when note is not null then ' · '||note else '' end);
      end if;
      materiali:=materiali||jsonb_build_array(jsonb_build_object('name',left(nome,120),'description',note,
        'quantity',(case when quantita=trunc(quantita) then quantita else 1 end)::integer,
        'unit_price',round(case when quantita=trunc(quantita) then prezzo else prezzo*quantita end,2),
        'purchase_price',round(case when quantita=trunc(quantita) then costo else costo*quantita end,2),
        'status','da_ordinare','position',jsonb_array_length(materiali),'vat_rate',aliquota));
    end loop;
    for r in select value from jsonb_array_elements(servizi) loop
      quantita:=coalesce((r->>'quantita')::numeric,1);
      if quantita<=0 then esclusi:=esclusi+1; continue; end if;
      fasi:=fasi||jsonb_build_array(jsonb_build_object('name',coalesce(nullif(r->>'descrizione',''),nullif(r->>'tipo',''),'Servizio'),
        'notes',concat_ws(E'\n',nullif(r->>'tipo',''),quantita||' unità')));
    end loop;
    for r in select value from jsonb_array_elements(ore) loop
      quantita:=coalesce((r->>'ore')::numeric,0);
      if quantita<=0 then esclusi:=esclusi+1; continue; end if;
      fasi:=fasi||jsonb_build_array(jsonb_build_object('name',coalesce(nullif(r->>'descrizione',''),'Manodopera'),
        'notes',quantita||' h · Manodopera prevista; le ore effettive si registrano in cantiere.'));
    end loop;
    descrizione:=coalesce(nullif(trim(q->>'titolo'),''),'Impianto fotovoltaico '||coalesce(q->>'numero',''));
    codice:=q->>'numero';
    indirizzo:=concat_ws(', ',nullif(q->>'indirizzo',''),nullif(trim(concat_ws(' ',q->>'cap',q->>'comune')),''),nullif(q->>'provincia',''));
  else
    netto:=case when coalesce((q->>'totale_imponibile')::numeric,0)>0 then round((q->>'totale_imponibile')::numeric,2)
      else round(coalesce((q->>'totale')::numeric,0)/(1+aliquota/100),2) end;
    select coalesce(jsonb_agg(to_jsonb(v) order by v.ordine,v.id),'[]') into voci
      from (select * from public.rst_computo_voci where progetto_id=p_progetto_id for share) v;
    for r in select value from jsonb_array_elements(voci) loop
      quantita:=coalesce((r->>'quantita')::numeric,0);
      if quantita<=0 then esclusi:=esclusi+1; continue; end if;
      somma_voci:=somma_voci+coalesce((r->>'importo')::numeric,0);
      -- Il costo materiali di un computo è una stima della lavorazione:
      -- non identifica un articolo reale da ordinare né un costo consuntivo.
      -- Resta, con quantità e tariffa, nella voce prevista della fase.
      fasi:=fasi||jsonb_build_array(jsonb_build_object('name',coalesce(nullif(r->>'descrizione',''),'Lavorazione'),
        'capitolo',coalesce(nullif(trim(r->>'capitolo_nome'),''),'Generale'),
        'notes',concat_ws(E'\n',nullif(r->>'capitolo_nome',''),quantita||' '||coalesce(r->>'unita_misura','')),
        'voci',jsonb_build_array(jsonb_build_object(
          'descrizione',coalesce(nullif(r->>'descrizione',''),'Lavorazione'),
          'unita',nullif(r->>'unita_misura',''),
          'quantita',quantita,
          'costo_manodopera',greatest(coalesce((r->>'costo_manodopera')::numeric,0),0),
          'costo_materiali',greatest(coalesce((r->>'costo_materiali')::numeric,0),0),
          'importo',(r->>'importo')::numeric,
          'tariffa_id',(select l.tariffa_id from public.rst_listino_voci l
                         where l.id=nullif(r->>'listino_voce_id','')::uuid and l.company_id=azienda),
          'origine_id',r->>'id'))));
    end loop;
    if p_raggruppa_capitoli then
      select coalesce(jsonb_agg(jsonb_build_object('name',capitolo,'notes',dettaglio,'voci',voci_capitolo) order by prima),'[]') into fasi
      from (select value->>'capitolo' capitolo,min(n) prima,
        string_agg((value->>'name')||E'\n'||(value->>'notes'),E'\n\n' order by n) dettaglio,
        jsonb_agg(value->'voci'->0 order by n) voci_capitolo
        from jsonb_array_elements(fasi) with ordinality a(value,n) group by value->>'capitolo') gruppi;
    end if;
    if jsonb_typeof(q->'fasi_previste')='array' and jsonb_array_length(q->'fasi_previste')>0 then
      fasi:=q->'fasi_previste';
    elsif abs(somma_voci-netto)<0.01 then
      -- Le voci fanno l'imponibile: il venduto di ogni lavorazione è la somma delle sue voci.
      select coalesce(jsonb_agg(f || jsonb_build_object('importo_venduto',
          (select round(sum(coalesce((v->>'importo')::numeric,0)),2) from jsonb_array_elements(f->'voci') v)) order by n),'[]')
        into fasi from jsonb_array_elements(fasi) with ordinality x(f,n);
    end if;
    descrizione:=coalesce(nullif(left(split_part(trim(q->>'note'),E'\n',1),120),''),'Ristrutturazione '||coalesce(q->>'code',''));
    codice:=q->>'code';
    indirizzo:=concat_ws(', ',nullif(q->>'cantiere_indirizzo',''),nullif(trim(concat_ws(' ',q->>'cantiere_cap',q->>'cantiere_citta')),''),nullif(q->>'cantiere_provincia',''));
  end if;
  if netto<=0 then raise exception 'Il preventivo non ha un prezzo di vendita: completalo prima di creare la commessa.'; end if;
  impronta:=md5(jsonb_build_array(q,componenti,servizi,ore,voci,p_raggruppa_capitoli)::text);
  esito:=jsonb_build_object('materiali',materiali,'fasi',fasi,'imponibile',netto,'aliquota',aliquota,
    'totale',round(netto*(1+aliquota/100),2),'impronta',impronta,'esclusi',esclusi,'descrizione',descrizione);
  if p_anteprima then return esito; end if;
  if p_impronta is distinct from impronta then
    raise exception 'Il preventivo è cambiato: rivedi il riepilogo prima di creare la commessa.' using errcode='40001';
  end if;
  select id into stato from public.order_statuses where company_id=azienda
    order by is_default desc nulls last,position asc nulls last,created_at asc limit 1;
  if stato is null then raise exception 'Imposta almeno uno stato commessa per questa azienda.'; end if;
  select customer_profile_id into profilo from public.marketing_contacts
    where id=(q->>'cliente_id')::uuid and company_id=azienda;
  esito:=esito||public.create_order_atomic(jsonb_build_object('company_id',azienda,'customer_id',profilo,
    'order_code',public.prossimo_numero_commessa(azienda),'description',descrizione,'total_amount',netto,
    'deposit_amount',0,'balance_amount',netto,'payment_type','standard','current_status_id',stato,
    'assigned_to',case when public.solo_assegnati_attivo() then auth.uid() else null end,
    'vat_rate',aliquota,'internal_notes',concat('Da preventivo ',p_modulo,' ',codice)),materiali,null,auth.uid(),'[]');
  ordine:=(esito->>'id')::uuid;
  update public.orders set created_by=auth.uid(),
    client_name=nullif(trim(concat_ws(' ',q->>'cliente_nome',q->>'cliente_cognome')),''),
    client_email=nullif(q->>'cliente_email',''),client_phone=nullif(q->>'cliente_telefono',''),
    indirizzo_lavori=nullif(indirizzo,''),work_address=nullif(indirizzo,''),
    fv_progetto_id=case when p_modulo='fv' then p_progetto_id else null end,
    rst_progetto_id=case when p_modulo='rst' then p_progetto_id else null end
    where id=ordine and company_id=azienda;
  for r in select value from jsonb_array_elements(fasi) loop
    insert into public.order_work_phases(company_id,order_id,name,position,notes,importo_venduto)
      values(azienda,ordine,r->>'name',posizione,concat_ws(E'\n',r->>'notes','Dal preventivo '||coalesce(codice,'')),(r->>'importo_venduto')::numeric) returning id into fase_id;
    sotto_pos:=0;
    for sotto in select value from jsonb_array_elements(coalesce(r->'sottofasi','[]')) loop
      insert into public.order_work_subphases(phase_id,name,position,peso,fatta)
        values(fase_id,sotto->>'name',sotto_pos,coalesce((sotto->>'peso')::integer,1),false);
      sotto_pos:=sotto_pos+1;
    end loop;
    voce_pos:=0;
    for voce in select value from jsonb_array_elements(case when jsonb_typeof(r->'voci')='array' then r->'voci' else '[]' end) loop
      insert into public.order_work_phase_voci(company_id,order_id,phase_id,position,descrizione,unita,quantita,
        costo_manodopera,costo_materiali,importo,tariffa_id,origine,origine_id,origine_codice)
      values(azienda,ordine,fase_id,voce_pos,voce->>'descrizione',voce->>'unita',(voce->>'quantita')::numeric,
        (voce->>'costo_manodopera')::numeric,(voce->>'costo_materiali')::numeric,(voce->>'importo')::numeric,
        nullif(voce->>'tariffa_id','')::uuid,'computo_rst',(voce->>'origine_id')::uuid,codice)
      on conflict do nothing;
      voce_pos:=voce_pos+1;
    end loop;
    posizione:=posizione+1;
  end loop;
  if p_modulo='fv' then update public.fv_progetti set ordine_id=ordine where id=p_progetto_id;
  else update public.rst_progetti set ordine_id=ordine where id=p_progetto_id; end if;
  return esito;
end;
$function$;

-- 4 ────────────────────────────────────────────────────────────────────────
-- Commesse già aperte dal computo RST. Una lavorazione per capitolo (raggruppate)
-- o una per voce, nello stesso ordine della conversione: la voce va alla fase con
-- quel capitolo, altrimenti a quella col suo nome e la sua posizione.
with voci as (
  select v.*, o.id order_id, p.code,
         row_number() over (partition by o.id order by v.ordine, v.id) - 1 n
    from public.orders o
    join public.rst_progetti p on p.id = o.rst_progetto_id
    join public.rst_computo_voci v on v.progetto_id = p.id and coalesce(v.quantita, 0) > 0
   where o.deleted_at is null
), abbinate as (
  select vo.*, coalesce(
           (select f.id from public.order_work_phases f
             where f.order_id = vo.order_id and f.name = coalesce(nullif(trim(vo.capitolo_nome), ''), 'Generale')
               and f.notes like '%Dal preventivo ' || vo.code || '%'
             order by f.position limit 1),
           (select f.id from public.order_work_phases f
             where f.order_id = vo.order_id and f.position = vo.n
               and f.name = coalesce(nullif(vo.descrizione, ''), 'Lavorazione')
               and f.notes like '%Dal preventivo ' || vo.code || '%')) phase_id
    from voci vo
)
insert into public.order_work_phase_voci(company_id, order_id, phase_id, position, descrizione, unita, quantita,
  costo_manodopera, costo_materiali, importo, tariffa_id, origine, origine_id, origine_codice)
select a.company_id, a.order_id, a.phase_id,
       (row_number() over (partition by a.phase_id order by a.ordine, a.id) - 1)::integer,
       coalesce(nullif(a.descrizione, ''), 'Lavorazione'), nullif(a.unita_misura, ''), a.quantita,
       greatest(coalesce(a.costo_manodopera, 0), 0), greatest(coalesce(a.costo_materiali, 0), 0), a.importo,
       (select l.tariffa_id from public.rst_listino_voci l where l.id = a.listino_voce_id and l.company_id = a.company_id),
       'computo_rst', a.id, a.code
  from abbinate a
 where a.phase_id is not null
on conflict do nothing;

-- Venduto delle lavorazioni RST rimaste senza: solo se ogni voce ha trovato la
-- sua fase e le voci fanno l'importo della commessa.
with commesse as (
  select o.id order_id, o.total_amount,
         (select count(*) from public.rst_computo_voci v where v.progetto_id = o.rst_progetto_id and coalesce(v.quantita, 0) > 0) n_voci,
         (select count(*) from public.order_work_phase_voci w where w.order_id = o.id and w.origine = 'computo_rst') n_abbinate,
         (select coalesce(sum(w.importo), 0) from public.order_work_phase_voci w where w.order_id = o.id and w.origine = 'computo_rst') somma
    from public.orders o
   where o.rst_progetto_id is not null and o.deleted_at is null
)
update public.order_work_phases f
   set importo_venduto = s.venduto
  from (select w.phase_id, round(sum(coalesce(w.importo, 0)), 2) venduto
          from public.order_work_phase_voci w join commesse c on c.order_id = w.order_id
         where c.n_voci > 0 and c.n_voci = c.n_abbinate and abs(c.somma - coalesce(c.total_amount, 0)) < 0.01
         group by w.phase_id) s
 where f.id = s.phase_id and f.importo_venduto is null;

-- Commesse già aperte da preventivo: una lavorazione per riga di servizio, nello
-- stesso ordine e con lo stesso nome.
with righe as (
  select qi.*, o.id order_id, q.quote_number,
         row_number() over (partition by o.id order by qi.sort_order, qi.id) - 1 n
    from public.orders o
    join public.quotes q on q.id = o.quote_id
    join public.quote_items qi on qi.quote_id = q.id
   where o.deleted_at is null
     and not coalesce(qi.is_optional, false) and coalesce(qi.quantity, 1) <> 0
     and (qi.item_category in ('posa','trasporto','smaltimento','nolo','tiro_piano','pratica')
       or (nullif(qi.item_category, '') is null and qi.item_type = 'service'))
)
insert into public.order_work_phase_voci(company_id, order_id, phase_id, position, descrizione, unita, quantita,
  costo_manodopera, importo, tariffa_id, origine, origine_id, origine_codice)
select f.company_id, r.order_id, f.id, 0, r.name, nullif(r.unit_of_measure, ''), abs(coalesce(r.quantity, 1)),
       greatest(coalesce(r.prezzo_acquisto, 0), 0), r.line_total, r.tariffa_id, 'preventivo', r.id, r.quote_number
  from righe r
  join public.order_work_phases f on f.order_id = r.order_id and f.position = r.n and f.name = r.name
   and f.notes like '%Dal preventivo ' || coalesce(r.quote_number, '') || '%'
on conflict do nothing;
