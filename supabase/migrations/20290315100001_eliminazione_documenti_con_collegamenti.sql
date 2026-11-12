-- Eliminare un documento operativo anche se è collegato (12/11/2026).
--
-- Prima un ordine confermato, un DDT ricevuto, una richiesta d'offerta inviata o un sopralluogo
-- avviato non si potevano eliminare: la finestra rimandava all'annullamento, che per gli ordini
-- confermati nemmeno c'era. Ora si eliminano sempre, con una regola sola:
--   * si cancellano con il documento le sue parti: righe, verifiche, legami, arrivi per posizione;
--   * restano, scollegati, i documenti e i conti che vivono da soli: DDT, costi, fatture,
--     commesse, ricezioni, movimenti, email, giornale;
--   * se per eliminare bisognerebbe cancellare uno di questi, il documento resta e lo si dice.
-- Quando c'è un collegamento, o il documento è già partito, la conferma va scritta: CANCELLA.
-- Un numero d'ordine già mandato al fornitore non torna libero.
set local lock_timeout = '3s';
set local statement_timeout = '60s';

-- Le righe di un DDT con la merce già consegnata non si toccano («registra un reso»). Eliminando
-- l'ordine a cui erano agganciate, però, il database stacca la riga dalla riga d'ordine: la merce
-- resta com'è, cambia solo il riferimento. Solo dentro questa eliminazione, quel distacco passa.
create or replace function public.ddt_consegna_proteggi_riga()
returns trigger language plpgsql security definer set search_path to 'public' as $function$
begin
 if exists(select 1 from ddt_consegne where riga_id=old.id) and (tg_op='DELETE' or new.quantita is distinct from old.quantita
   or new.unita_misura is distinct from old.unita_misura or new.codice_articolo is distinct from old.codice_articolo
   or new.descrizione is distinct from old.descrizione
   or (new.purchase_order_item_id is distinct from old.purchase_order_item_id
       and not (new.purchase_order_item_id is null and current_setting('eic.elimina_documenti', true) = 'on'))
   or new.order_item_id is distinct from old.order_item_id) then
   raise exception 'Consegna già confermata: registra un reso invece di modificare la merce ricevuta';
 end if;
 return new;
end $function$;

drop function if exists public.operational_documents_delete(uuid,text,uuid[],boolean,jsonb);

create or replace function public.operational_documents_delete(
  p_company_id uuid, p_kind text, p_ids uuid[], p_preview boolean default true,
  p_expected jsonb default null, p_conferma text default null)
returns jsonb language plpgsql security definer set search_path to '' set lock_timeout to '3s' as $function$
declare
 v_table text; v_ids uuid[]; v_id uuid; v_row jsonb; v_docs jsonb := '[]';
 v_reason text; v_avviso text; v_label text; v_version text; v_fk record; v_children jsonb; v_child jsonb;
 v_queue jsonb; v_node jsonb; v_pos integer; v_seen text[]; v_key text;
 v_deleted jsonb := '[]'; v_supplier uuid; v_next integer; v_format text; v_number text; v_count integer;
 v_admin boolean; v_cancella jsonb; v_scollega jsonb; v_nullable boolean; v_azioni jsonb := '[]';
 v_azione jsonb; v_libera jsonb;
 -- Ciò che vive da solo: non si cancella mai come «parte» di un altro documento.
 v_restano constant text[] := array['company_costs','fatture_ricevute','documenti_fiscali','invoices','orders','order_items',
   'purchase_orders','ddt_ricezione','supplier_rfqs','surveys','goods_receipts','email_inbox','giornale_eventi','suppliers',
   'warehouse_scan_events','campo_acquisti','campo_rapportini','planimetrie','email_ddt_carico','proposed_purchase_orders',
   'rapportino_materiali_regolarizzati','order_item_misure_storico','fattura_ddt'];
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
 when 'oda' then v_table:='purchase_orders';
 when 'rfq' then v_table:='supplier_rfqs';
 when 'ddt' then v_table:='ddt_ricezione';
 when 'surveys' then v_table:='surveys';
 else raise exception 'Tipo documento non valido'; end case;
 if coalesce(cardinality(p_ids),0)<1 or cardinality(p_ids)>100 or array_position(p_ids,null) is not null then
   raise exception 'Seleziona da 1 a 100 documenti';
 end if;
 select array_agg(distinct id order by id) into v_ids from unnest(p_ids) id;
 if cardinality(v_ids)<>cardinality(p_ids) then raise exception 'Selezione duplicata'; end if;
 if p_kind='oda' then perform pg_advisory_xact_lock(hashtextextended('operational-oda:' || p_company_id::text,0)); end if;
 foreach v_id in array v_ids loop
   execute format('select to_jsonb(d) from public.%I d where id=$1 and company_id=$2 for update',v_table) into v_row using v_id,p_company_id;
   if v_row is null then raise exception 'Un documento non è più disponibile: aggiorna la selezione'; end if;
   if p_kind='ddt' and not v_admin and not coalesce((v_row->>'warehouse_id')::uuid=any(public.get_my_warehouse_ids()),false) then
     raise exception 'DDT non accessibile nel tuo magazzino' using errcode='42501';
   end if;
   v_reason:=null; v_avviso:=null; v_cancella:='{}'; v_scollega:='{}';
   v_label:=coalesce(v_row->>'oda_number',v_row->>'rfq_number',v_row->>'numero_ddt',v_row->>'code',v_id::text);
   v_version:=md5(v_row::text);
   if p_preview is not true and (p_expected is null or p_expected->>v_id::text is distinct from v_version) then
     raise exception 'Documento modificato dopo la conferma. Ricontrolla la selezione';
   end if;
   -- Non blocca più: dice cosa si sta eliminando, e chiede la conferma scritta.
   if p_kind='oda' and (coalesce(v_row->>'status','') not in ('bozza','annullato') or v_row->>'sent_at' is not null or v_row->>'confirmed_at' is not null) then
     v_avviso:='Ordine già inviato o confermato al fornitore';
   elsif p_kind='rfq' and (coalesce(v_row->>'status','')<>'bozza' or v_row->>'purchase_order_id' is not null or v_row->>'supplier_id_aggiudicato' is not null) then
     v_avviso:='Richiesta già inviata, chiusa o aggiudicata';
   elsif p_kind='ddt' and (coalesce(v_row->>'stato','') not in ('attesa','atteso') or coalesce((v_row->>'quantita_ricevuta')::numeric,0)>0 or v_row->>'signature_url' is not null or v_row->>'company_cost_id' is not null) then
     v_avviso:='DDT già ricevuto o contabilizzato: la merce caricata in magazzino resta';
   elsif p_kind='surveys' and (coalesce(v_row->>'status','')<>'draft' or v_row->>'signed_at' is not null or v_row->>'client_signature_at' is not null) then
     v_avviso:='Sopralluogo avviato o firmato';
   end if;
   -- Visita di tutto ciò che punta al documento e alle sue parti.
   v_queue:=jsonb_build_array(jsonb_build_object('table',v_table,'row',v_row,'radice',true));v_pos:=0;v_seen:='{}';
   while v_pos<jsonb_array_length(v_queue) and v_reason is null loop
     if v_pos>5000 then v_reason:='Documento troppo grande: va eliminato a parti'; exit; end if;
     v_node:=v_queue->v_pos;v_pos:=v_pos+1;
     if v_node->'row'->>'id' is null then continue; end if;
     v_key:=(v_node->>'table')||':'||(v_node->'row'->>'id');
     if v_key=any(v_seen) then continue; end if;v_seen:=array_append(v_seen,v_key);
     for v_fk in select n.nspname,t.relname,a.attname,c.conkey,c.confdeltype,a.attnotnull
         from pg_constraint c join pg_class t on t.oid=c.conrelid join pg_namespace n on n.oid=t.relnamespace
         join pg_attribute a on a.attrelid=c.conrelid and a.attnum=c.conkey[1]
        where c.contype='f' and c.confrelid=to_regclass(format('public.%I',v_node->>'table')) loop
       if cardinality(v_fk.conkey)<>1 then v_reason:='Collegamento composto con '||v_fk.relname||': va verificato a mano';exit;end if;
       execute format('select coalesce(jsonb_agg(to_jsonb(q)),''[]'') from (select * from %I.%I where %I=$1 for update) q',v_fk.nspname,v_fk.relname,v_fk.attname)
         into v_children using (v_node->'row'->>'id')::uuid;
       if jsonb_array_length(v_children)=0 then continue; end if;
       for v_child in select value from jsonb_array_elements(v_children) loop
         if (v_child ? 'company_id') and (v_child->>'company_id') is distinct from p_company_id::text then
           v_reason:='Collegamenti con un''altra azienda: il documento va verificato prima'; exit;
         end if;
       end loop;
       exit when v_reason is not null;
       v_nullable := not v_fk.attnotnull;
       if v_fk.nspname<>'public' then v_reason:='Collegamento fuori dall''archivio aziendale ('||v_fk.relname||')';exit;
       elsif v_fk.confdeltype in ('n','d') then
         -- Il database lo scollega da solo.
         v_scollega:=jsonb_set(v_scollega,array[v_fk.relname],to_jsonb(coalesce((v_scollega->>v_fk.relname)::int,0)+jsonb_array_length(v_children)));
       elsif v_fk.relname=any(v_restano) or (v_fk.confdeltype<>'c' and v_nullable) then
         if not v_nullable then
           v_reason:='Collegato a '||v_fk.relname||', che non si può cancellare né staccare';exit;
         end if;
         v_scollega:=jsonb_set(v_scollega,array[v_fk.relname],to_jsonb(coalesce((v_scollega->>v_fk.relname)::int,0)+jsonb_array_length(v_children)));
         v_azioni:=v_azioni||jsonb_build_array(jsonb_build_object('op','scollega','table',v_fk.relname,'col',v_fk.attname,'id',v_node->'row'->>'id'));
       else
         -- Una parte del documento: si cancella qui, dal fondo, prima del documento. Anche quelle
         -- che andrebbero via a cascata: i loro controlli (gli incaricati del sopralluogo scrivono
         -- nel registro) devono trovare il documento ancora al suo posto.
         v_cancella:=jsonb_set(v_cancella,array[v_fk.relname],to_jsonb(coalesce((v_cancella->>v_fk.relname)::int,0)+jsonb_array_length(v_children)));
         v_azioni:=v_azioni||jsonb_build_array(jsonb_build_object('op','cancella','table',v_fk.relname,'col',v_fk.attname,'id',v_node->'row'->>'id'));
         for v_child in select value from jsonb_array_elements(v_children) loop
           v_queue:=v_queue||jsonb_build_array(jsonb_build_object('table',v_fk.relname,'row',v_child));
         end loop;
       end if;
     end loop;
   end loop;
   v_docs:=v_docs||jsonb_build_array(jsonb_build_object('id',v_id,'label',v_label,'version',v_version,
     'allowed',v_reason is null,'reason',v_reason,'avviso',v_avviso,'cancella',v_cancella,'scollega',v_scollega,
     'conferma_scritta',v_avviso is not null or v_scollega<>'{}' or exists(select 1 from jsonb_object_keys(v_cancella) k where k not in
        ('purchase_order_items','procurement_document_events','supplier_rfq_items','supplier_rfq_suppliers','ddt_righe',
         'survey_areas','survey_elements','survey_assignees','survey_activity_log'))));
   v_deleted:=v_deleted||jsonb_build_array(v_row);
 end loop;
 if p_preview is true then return jsonb_build_object('documents',v_docs,'deleted',0); end if;
 if exists(select 1 from jsonb_array_elements(v_docs) d where not (d->>'allowed')::boolean) then
   raise exception 'La selezione contiene documenti non eliminabili. Nessun documento è stato cancellato';
 end if;
 if exists(select 1 from jsonb_array_elements(v_docs) d where (d->>'conferma_scritta')::boolean)
    and upper(btrim(coalesce(p_conferma,''))) <> 'CANCELLA' then
   raise exception 'Per eliminare documenti collegati scrivi CANCELLA nella conferma. Nessun documento è stato cancellato';
 end if;
 -- Prima si staccano i documenti che restano, poi si cancellano le parti dal fondo, poi il documento.
 perform set_config('eic.elimina_documenti','on',true);
 for v_azione in select value from jsonb_array_elements(v_azioni) where value->>'op'='scollega' loop
   execute format('update public.%I set %I=null where %I=$1',v_azione->>'table',v_azione->>'col',v_azione->>'col') using (v_azione->>'id')::uuid;
 end loop;
 for v_azione in select value from jsonb_array_elements(v_azioni) with ordinality e(value,n) where value->>'op'='cancella' order by n desc loop
   execute format('delete from public.%I where %I=$1',v_azione->>'table',v_azione->>'col') using (v_azione->>'id')::uuid;
 end loop;
 execute format('delete from public.%I where company_id=$1 and id=any($2)',v_table) using p_company_id,v_ids;
 get diagnostics v_count=row_count;
 if v_count<>cardinality(v_ids) then raise exception 'Eliminazione incompleta: operazione annullata'; end if;
 perform set_config('eic.elimina_documenti','off',true);
 if p_kind='oda' then
   -- Torna libero solo il numero di una bozza mai partita: un numero già mandato al fornitore
   -- non si riusa. Mai rinumerare gli ordini che restano.
   select coalesce(jsonb_agg(d),'[]') into v_libera from jsonb_array_elements(v_deleted) d
    where d->>'sent_at' is null and d->>'confirmed_at' is null and coalesce(d->>'status','') in ('bozza','annullato');
   for v_supplier in select distinct (d->>'supplier_id')::uuid from jsonb_array_elements(v_libera) d loop
     select oda_prossimo,coalesce(nullif(btrim(oda_formato),''),'{n}') into v_next,v_format from public.suppliers where id=v_supplier and company_id=p_company_id for update;
     while v_next>1 loop
       v_number:=public.oda_formatta_numero(v_format,v_next-1,current_date);
       exit when not exists(select 1 from jsonb_array_elements(v_libera) d where d->>'oda_number'=v_number and (d->>'supplier_id')::uuid=v_supplier)
         or exists(select 1 from public.purchase_orders where company_id=p_company_id and oda_number=v_number);
       v_next:=v_next-1;
     end loop;
     update public.suppliers set oda_prossimo=v_next where id=v_supplier and company_id=p_company_id and oda_prossimo is not null;
   end loop;
   select prossimo,formato into v_next,v_format from public.numerazione_ordini_fornitore where company_id=p_company_id for update;
   while v_next>1 loop
     v_number:=public.oda_formatta_numero(v_format,v_next-1,current_date);
     exit when not exists(select 1 from jsonb_array_elements(v_libera) d where d->>'oda_number'=v_number)
       or exists(select 1 from public.purchase_orders where company_id=p_company_id and oda_number=v_number);
     v_next:=v_next-1;
   end loop;
   update public.numerazione_ordini_fornitore set prossimo=v_next where company_id=p_company_id;
 end if;
 return jsonb_build_object('documents',v_docs,'deleted',v_count);
end $function$;

revoke all on function public.operational_documents_delete(uuid,text,uuid[],boolean,jsonb,text) from public,anon;
grant execute on function public.operational_documents_delete(uuid,text,uuid[],boolean,jsonb,text) to authenticated;
