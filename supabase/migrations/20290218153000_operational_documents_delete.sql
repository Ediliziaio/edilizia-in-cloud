-- Eliminazione protetta dei documenti operativi; frontend inizialmente locale.
-- Nessuna cancellazione viene eseguita installando queste funzioni.
set local lock_timeout = '3s';
set local statement_timeout = '60s';

-- Conserva il numero completo anche oltre 9999, senza sovrascrivere altre modifiche del generatore.
do $padding$
declare v_definition text;
begin
  v_definition := pg_get_functiondef('public.generate_oda_number(uuid,uuid)'::regprocedure);
  if position('lpad(v_next::text, 4, ''0'')' in v_definition)>0 then
    execute replace(v_definition, 'lpad(v_next::text, 4, ''0'')', 'lpad(v_next::text, greatest(4,length(v_next::text)), ''0'')');
  end if;
end $padding$;

-- Serializza assegnazione del numero e cancellazione/recupero dell'ultima bozza.
create or replace function public.operational_oda_number_lock()
returns trigger language plpgsql security invoker set search_path = '' as $$
begin
  perform pg_advisory_xact_lock(hashtextextended('operational-oda:' || new.company_id::text, 0));
  return new;
end $$;
revoke all on function public.operational_oda_number_lock() from public, anon;
drop trigger if exists a0_operational_oda_number_lock on public.purchase_orders;
create trigger a0_operational_oda_number_lock before insert on public.purchase_orders
for each row execute function public.operational_oda_number_lock();

create or replace function public.operational_documents_delete(
 p_company_id uuid, p_kind text, p_ids uuid[], p_preview boolean default true, p_expected jsonb default null)
returns jsonb language plpgsql security definer set search_path = '' set lock_timeout = '3s' as $$
declare
 v_table text; v_allowed text[]; v_ids uuid[]; v_id uuid; v_row jsonb; v_docs jsonb := '[]';
 v_reason text; v_label text; v_version text; v_fk record; v_children jsonb; v_child jsonb;
 v_queue jsonb; v_node jsonb; v_oid oid; v_pos integer; v_seen text[]; v_key text;
 v_deleted jsonb := '[]'; v_supplier uuid; v_next integer; v_format text; v_number text; v_count integer;
 v_admin boolean;
begin
 if auth.uid() is null or not public.user_can_access_company(p_company_id)
    or public.utente_bloccato() or public.utente_sola_lettura(p_company_id)
    or public.utente_e_cliente_esterno() or public.e_solo_campo() then
   raise exception 'Non hai il permesso di eliminare questi documenti' using errcode='42501';
 end if;
 v_admin := public.e_amministratore_di(p_company_id) or public.has_role(auth.uid(),'super_admin'::public.app_role);
 if p_kind='surveys' then
   if not v_admin then raise exception 'Solo gli amministratori possono eliminare i sopralluoghi' using errcode='42501'; end if;
 else
   if not (v_admin or public.has_permission_for_company(auth.uid(),'can_manage_purchasing',p_company_id)
     or public.has_permission_for_company(auth.uid(),'can_edit_orders',p_company_id)
     or (p_kind='ddt' and public.has_permission_for_company(auth.uid(),'can_edit_warehouse',p_company_id))) then
     raise exception 'Permesso di gestione acquisti richiesto' using errcode='42501';
   end if;
 end if;
 case p_kind
 when 'oda' then v_table:='purchase_orders'; v_allowed:=array['purchase_order_items','procurement_document_events'];
 when 'rfq' then v_table:='supplier_rfqs'; v_allowed:=array['supplier_rfq_items','supplier_rfq_suppliers','procurement_document_events'];
 when 'ddt' then v_table:='ddt_ricezione'; v_allowed:=array['ddt_righe'];
 when 'surveys' then v_table:='surveys'; v_allowed:=array['survey_areas','survey_elements','survey_assignees','survey_activity_log'];
 else raise exception 'Tipo documento non valido'; end case;
 if coalesce(cardinality(p_ids),0)<1 or cardinality(p_ids)>100 or array_position(p_ids,null) is not null then
   raise exception 'Seleziona da 1 a 100 documenti';
 end if;
 select array_agg(distinct id order by id) into v_ids from unnest(p_ids) id;
 if cardinality(v_ids)<>cardinality(p_ids) then raise exception 'Selezione duplicata'; end if;
 -- Same lock order as the insert trigger; FK parent locks prevent new dependencies during deletion.
 if p_kind='oda' then perform pg_advisory_xact_lock(hashtextextended('operational-oda:' || p_company_id::text,0)); end if;
 foreach v_id in array v_ids loop
   execute format('select to_jsonb(d) from public.%I d where id=$1 and company_id=$2 for update',v_table) into v_row using v_id,p_company_id;
   if v_row is null then raise exception 'Un documento non è più disponibile: aggiorna la selezione'; end if;
   if p_kind='ddt' and not v_admin and not coalesce((v_row->>'warehouse_id')::uuid=any(public.get_my_warehouse_ids()),false) then
     raise exception 'DDT non accessibile nel tuo magazzino' using errcode='42501';
   end if;
   v_reason:=null;
   v_label:=coalesce(v_row->>'oda_number',v_row->>'rfq_number',v_row->>'numero_ddt',v_row->>'code',v_id::text);
   v_version:=md5(v_row::text);
   if p_preview is not true and (p_expected is null or p_expected->>v_id::text is distinct from v_version) then
     raise exception 'Documento modificato dopo la conferma. Ricontrolla la selezione';
   end if;
   if p_kind='oda' and (coalesce(v_row->>'status','') not in ('bozza','annullato') or v_row->>'sent_at' is not null or v_row->>'confirmed_at' is not null) then
     v_reason:='Ordine già inviato o operativo: usa l’annullamento e conserva lo storico';
   elsif p_kind='rfq' and (coalesce(v_row->>'status','')<>'bozza' or v_row->>'purchase_order_id' is not null or v_row->>'supplier_id_aggiudicato' is not null) then
     v_reason:='Richiesta già inviata, chiusa o aggiudicata';
   elsif p_kind='ddt' and (coalesce(v_row->>'stato','') not in ('attesa','atteso') or coalesce((v_row->>'quantita_ricevuta')::numeric,0)>0 or v_row->>'signature_url' is not null or v_row->>'company_cost_id' is not null) then
     v_reason:='DDT già ricevuto o contabilizzato: occorre gestire prima le ricezioni';
   elsif p_kind='surveys' and (coalesce(v_row->>'status','')<>'draft' or v_row->>'order_id' is not null or v_row->>'estimate_id' is not null or v_row->>'signed_at' is not null or v_row->>'client_signature_at' is not null or v_row->>'client_signature_url' is not null or v_row->>'supplier_order_id' is not null) then
     v_reason:='Sopralluogo avviato, firmato o collegato a un documento';
   end if;
   -- Traverse owned children, but stop at any business document, offer, receipt, cost,
   -- stock movement, file or unknown relationship. Do not cascade it silently.
   v_queue:=jsonb_build_array(jsonb_build_object('table',v_table,'row',v_row));v_pos:=0;v_seen:='{}';
   while v_pos<jsonb_array_length(v_queue) and v_reason is null loop
     if v_pos>5000 then raise exception 'Documento troppo grande: richiede verifica dedicata'; end if;
     v_node:=v_queue->v_pos;v_pos:=v_pos+1;
     v_key:=(v_node->>'table')||':'||coalesce(v_node->'row'->>'id',v_pos::text);
     if v_key=any(v_seen) then continue; end if;v_seen:=array_append(v_seen,v_key);
     if v_node->>'table'='purchase_order_items' and coalesce((v_node->'row'->>'quantity_received')::numeric,0)>0 then v_reason:='Sono presenti quantità già ricevute';exit; end if;
     if v_node->>'table'='supplier_rfq_suppliers' and (coalesce(v_node->'row'->>'status','')<>'da_inviare' or v_node->'row'->>'inviata_at' is not null or v_node->'row'->>'risposta_at' is not null or v_node->'row'->>'totale_offerto' is not null) then v_reason:='Sono presenti inviti inviati o offerte ricevute';exit;end if;
     v_oid:=to_regclass(format('public.%I',v_node->>'table'));
     for v_fk in select c.conrelid,n.nspname,t.relname,a.attname,c.conkey,c.confkey from pg_constraint c join pg_class t on t.oid=c.conrelid join pg_namespace n on n.oid=t.relnamespace join pg_attribute a on a.attrelid=c.conrelid and a.attnum=c.conkey[1] where c.contype='f' and c.confrelid=v_oid loop
       if cardinality(v_fk.conkey)<>1 or cardinality(v_fk.confkey)<>1 then v_reason:='Collegamento composto da verificare prima dell’eliminazione';exit;end if;
       if v_node->'row'->>'id' is null then v_reason:='Collegamenti da verificare prima dell’eliminazione';exit;end if;
       execute format('select coalesce(jsonb_agg(to_jsonb(q)),''[]'') from (select * from %I.%I where %I=$1 for update) q',v_fk.nspname,v_fk.relname,v_fk.attname) into v_children using (v_node->'row'->>'id')::uuid;
       if jsonb_array_length(v_children)=0 then continue; end if;
       if v_fk.nspname<>'public' or not(v_fk.relname=any(v_allowed)) then v_reason:=case
         when v_fk.relname='ddt_ricezione' then 'Sono presenti DDT collegati all’ordine: conserva il documento e gestisci le ricezioni'
         when v_fk.relname in ('fatture_ricevute','fattura_ricevuta_ordini','fattura_ddt') then 'Sono presenti fatture collegate: il documento non può essere eliminato direttamente'
         when v_fk.relname in ('company_costs','mezzi_piani_spese') then 'È già registrato un costo collegato al documento'
         when v_fk.relname in ('goods_receipts','ddt_consegne','ddt_operazioni_consegna','warehouse_scan_events','arrivi_posizione') then 'Sono presenti ricezioni o movimenti collegati al documento'
         when v_fk.relname in ('supplier_rfqs','supplier_rfq_quotes','controlli_documento_fornitore') then 'Sono presenti offerte o verifiche collegate al documento'
         when v_fk.relname in ('survey_media','planimetrie') then 'Sono presenti allegati o planimetrie collegati al sopralluogo'
         else 'Sono presenti collegamenti operativi da verificare nel dettaglio: il documento non può essere eliminato direttamente' end;exit;end if;
       for v_child in select value from jsonb_array_elements(v_children) loop
         v_queue:=v_queue||jsonb_build_array(jsonb_build_object('table',v_fk.relname,'row',v_child));
       end loop;
     end loop;
   end loop;
   v_docs:=v_docs||jsonb_build_array(jsonb_build_object('id',v_id,'label',v_label,'version',v_version,'allowed',v_reason is null,'reason',v_reason));
   v_deleted:=v_deleted||jsonb_build_array(v_row);
 end loop;
 if p_preview is true then return jsonb_build_object('documents',v_docs,'deleted',0); end if;
 if exists(select 1 from jsonb_array_elements(v_docs) d where not (d->>'allowed')::boolean) then
   raise exception 'La selezione contiene documenti non eliminabili. Nessun documento è stato cancellato';
 end if;
 execute format('delete from public.%I where company_id=$1 and id=any($2)',v_table) using p_company_id,v_ids;
 get diagnostics v_count=row_count;
 if v_count<>cardinality(v_ids) then raise exception 'Eliminazione incompleta: operazione annullata'; end if;
 if p_kind='oda' then
   -- Reclaim only a contiguous tail actually removed in this transaction. Never renumber survivors.
   for v_supplier in select distinct (d->>'supplier_id')::uuid from jsonb_array_elements(v_deleted) d loop
     select oda_prossimo,coalesce(nullif(btrim(oda_formato),''),'{n}') into v_next,v_format from public.suppliers where id=v_supplier and company_id=p_company_id for update;
     while v_next>1 loop
       v_number:=public.oda_formatta_numero(v_format,v_next-1,current_date);
       exit when not exists(select 1 from jsonb_array_elements(v_deleted) d where d->>'oda_number'=v_number and (d->>'supplier_id')::uuid=v_supplier)
         or exists(select 1 from public.purchase_orders where company_id=p_company_id and oda_number=v_number);
       v_next:=v_next-1;
     end loop;
     update public.suppliers set oda_prossimo=v_next where id=v_supplier and company_id=p_company_id and oda_prossimo is not null;
   end loop;
   select prossimo,formato into v_next,v_format from public.numerazione_ordini_fornitore where company_id=p_company_id for update;
   while v_next>1 loop
     v_number:=public.oda_formatta_numero(v_format,v_next-1,current_date);
     exit when not exists(select 1 from jsonb_array_elements(v_deleted) d where d->>'oda_number'=v_number)
       or exists(select 1 from public.purchase_orders where company_id=p_company_id and oda_number=v_number);
     v_next:=v_next-1;
   end loop;
   update public.numerazione_ordini_fornitore set prossimo=v_next where company_id=p_company_id;
   -- The standard ODA-YYYY-NNNN generator already uses MAX+1; no counter to alter.
 end if;
 return jsonb_build_object('documents',v_docs,'deleted',v_count);
end $$;
revoke all on function public.operational_documents_delete(uuid,text,uuid[],boolean,jsonb) from public,anon;
grant execute on function public.operational_documents_delete(uuid,text,uuid[],boolean,jsonb) to authenticated;
