-- Conteggi riutilizzabili e confronto con gli acquisti. Nessun ricalcolo massivo.
set local lock_timeout = '3s';
set local statement_timeout = '30s';

create or replace function public.planimetrie_salva_conteggi(
  p_order uuid, p_documento uuid, p_nome text, p_sha256 text, p_righe jsonb
) returns jsonb language plpgsql security invoker set search_path = public as $f$
declare azienda uuid; r jsonb; precedente public.planimetrie_conteggi%rowtype; n int := 0; identita text; fase uuid; dettagli jsonb; unita text;
begin
  if auth.uid() is null then raise exception 'Accesso richiesto' using errcode='42501'; end if;
  select company_id into azienda from public.orders where id=p_order for update;
  if azienda is null or not coalesce((public.materiali_puo('can_edit_orders',azienda) or public.materiali_puo('can_validate_bom',azienda)),false) then raise exception 'Commessa non modificabile' using errcode='42501'; end if;
  if p_sha256 !~ '^[a-f0-9]{64}$' or p_sha256 is null or nullif(trim(p_nome),'') is null then raise exception 'Origine del disegno non valida'; end if;
  if p_documento is not null and not exists(select 1 from public.order_attachments where id=p_documento and order_id=p_order) then raise exception 'Documento di un’altra commessa' using errcode='42501'; end if;
  if jsonb_typeof(p_righe) is distinct from 'array' or jsonb_array_length(p_righe) not between 1 and 5000 then raise exception 'Conteggi mancanti o oltre il limite'; end if;
  for r in select value from jsonb_array_elements(p_righe) loop
    if nullif(trim(r->>'simbolo'),'') is null or length(r->>'simbolo')>500 or (r->>'quantita')::numeric < 0 or (r->>'quantita')::numeric is null or (r->>'quantita')::numeric>1000000000
      or r->>'metodo' not in ('testo','ai_immagine','dwg','manuale') or r->>'metodo' is null then raise exception 'Conteggio non valido'; end if;
    fase := nullif(r->>'phase_id','')::uuid; unita := coalesce(nullif(r->>'unita',''),'pz');
    if unita not in ('pz','m') or (unita='pz' and (r->>'quantita')::numeric<>trunc((r->>'quantita')::numeric)) then raise exception 'Quantità e unità non coerenti'; end if;
    if fase is not null and not exists(select 1 from public.order_work_phases where id=fase and order_id=p_order) then raise exception 'Fase di un’altra commessa' using errcode='42501'; end if;
    dettagli := (case when jsonb_typeof(r->'dettaglio')='object' then r->'dettaglio' else '{}'::jsonb end) || jsonb_build_object('_file_sha256',p_sha256);
    identita := md5(jsonb_build_array(p_sha256,coalesce((r->>'pagina')::int,1),r->>'simbolo',r->>'locale',unita,r->>'metodo')::text);
    dettagli := dettagli || jsonb_build_object('_identita_conteggio',identita);
    select * into precedente from public.planimetrie_conteggi where order_id=p_order and dettaglio->>'_identita_conteggio'=identita order by created_at limit 1 for update;
    if found then
      if precedente.dettaglio->>'quantita_modificata_a_mano'='true' then n:=n+1; continue; end if;
      if row(precedente.quantita,precedente.phase_id,precedente.descrizione_legenda,precedente.dettaglio) is distinct from row((r->>'quantita')::numeric,fase,r->>'descrizione_legenda',dettagli) then
        update public.planimetrie_conteggi set quantita=(r->>'quantita')::numeric,phase_id=fase,descrizione_legenda=r->>'descrizione_legenda',dettaglio=dettagli,
          confidenza=nullif(r->>'confidenza','')::numeric,confermato=false,updated_at=now() where id=precedente.id;
      end if;
    else
      insert into public.planimetrie_conteggi(company_id,order_id,documento_id,documento_nome,pagina,phase_id,simbolo,descrizione_legenda,locale,quantita,unita,metodo,confidenza,dettaglio)
      values(azienda,p_order,p_documento,p_nome,coalesce((r->>'pagina')::int,1),fase,r->>'simbolo',r->>'descrizione_legenda',r->>'locale',(r->>'quantita')::numeric,unita,r->>'metodo',nullif(r->>'confidenza','')::numeric,dettagli);
    end if;
    n := n+1;
  end loop;
  return jsonb_build_object('conteggi',n);
end;$f$;
revoke all on function public.planimetrie_salva_conteggi(uuid,uuid,text,text,jsonb) from public,anon;
grant execute on function public.planimetrie_salva_conteggi(uuid,uuid,text,text,jsonb) to authenticated;

create or replace function public.materiale_quantita_da_tavola(p_order uuid,p_item uuid,p_conteggi jsonb,p_versione timestamptz,p_nota text)
returns jsonb language plpgsql security invoker set search_path = public as $f$
declare azienda uuid; articolo public.order_items%rowtype; c public.planimetrie_conteggi%rowtype; fonte jsonb; nuove jsonb := '[]'; v_origini jsonb; q numeric:=0; u text; primo text; chiave text; ids uuid[]:='{}'; stato text;
begin
  if auth.uid() is null then raise exception 'Accesso richiesto' using errcode='42501'; end if;
  select company_id into azienda from public.orders where id=p_order;
  if azienda is null or not coalesce((public.materiali_puo('can_edit_orders',azienda) or public.materiali_puo('can_validate_bom',azienda)),false) then raise exception 'Commessa non modificabile' using errcode='42501'; end if;
  select * into articolo from public.order_items where id=p_item and order_id=p_order for update;
  if not found or articolo.updated_at is distinct from p_versione then raise exception 'L’articolo è cambiato: aggiorna il confronto e riprova'; end if;
  if jsonb_typeof(p_conteggi) is distinct from 'array' or jsonb_array_length(p_conteggi) not between 1 and 1000 or nullif(trim(p_nota),'') is null then raise exception 'Seleziona e verifica i conteggi della tavola'; end if;
  if articolo.stock_item_id is not null or articolo.supplier_rfq_item_id is not null then raise exception 'La riga è già collegata a magazzino o offerta: riconcilia prima l’impegno'; end if;
  if articolo.phase_id is not null then
    select v.stato into stato from public.materiali_fasi_validazione v where v.order_id=p_order and v.phase_id=articolo.phase_id for update;
    if stato is not null and stato <> 'bozza' then raise exception 'Riporta la fase in bozza prima di aggiornare il fabbisogno'; end if;
  end if;
  for fonte in select value from jsonb_array_elements(p_conteggi) loop
    if (fonte->>'id')::uuid = any(ids) then raise exception 'Conteggio ripetuto'; end if;
    ids := array_append(ids,(fonte->>'id')::uuid);
    select * into c from public.planimetrie_conteggi where id=(fonte->>'id')::uuid and order_id=p_order and company_id=azienda for share;
    if not found or not c.confermato or c.updated_at is distinct from (fonte->>'versione')::timestamptz then raise exception 'Il conteggio è cambiato o non è confermato: aggiorna la tavola'; end if;
    if c.phase_id is not null and c.phase_id is distinct from articolo.phase_id then raise exception 'Tavola e articolo appartengono a fasi diverse'; end if;
    u := lower(trim(coalesce(c.unita,'pz')));
    if u in ('cad','cadauno','pezzi','n','nr') then u:='pz'; end if;
    if u <> (case when lower(trim(articolo.unita_misura)) in ('cad','cadauno','pezzi','n','nr','pz') then 'pz' else lower(trim(articolo.unita_misura)) end) or articolo.unita_misura is null then raise exception 'Le unità non coincidono: non trasformo superfici in pezzi'; end if;
    if c.quantita<=0 or (u='pz' and c.quantita<>trunc(c.quantita)) then raise exception 'Quantità della tavola non valida'; end if;
    if coalesce(nullif(trim(c.descrizione_legenda),''),c.simbolo) ~* '^(A\$C[0-9A-F]+|\*U[0-9]+)$' then raise exception 'Classifica il blocco anonimo prima di usarlo negli acquisti'; end if;
    chiave := jsonb_build_array(coalesce(c.documento_id::text,c.dettaglio->>'_file_sha256',c.documento_nome),c.pagina,c.metodo,coalesce(c.descrizione_legenda,c.simbolo),u,c.phase_id)::text;
    if primo is not null and primo<>chiave then raise exception 'Confronta una sola tavola, pagina e tipologia alla volta'; end if;
    primo:=chiave; q:=q+c.quantita;
    nuove:=nuove || jsonb_build_array(jsonb_build_object('tipo','planimetria','ruolo','riscontro_quantita','conteggio_id',c.id,'conteggio_versione',c.updated_at,
      'documento_id',c.documento_id,'documento',c.documento_nome,'pagina',c.pagina,'locale',c.locale,'simbolo',c.simbolo,'quantita_simbolo',c.quantita,'quantita',c.quantita,
      'verifica_acquisto',jsonb_build_object('stato','confermata','motivi',jsonb_build_array(p_nota),'campi_mancanti','[]'::jsonb,'confermata_da',auth.uid(),'confermata_il',now())));
  end loop;
  -- I riscontri precedenti restano nello storico del dato, ma solo il nuovo gruppo determina la quantità.
  select coalesce(jsonb_agg(case when o->>'ruolo'='riscontro_quantita' then jsonb_set(o,'{ruolo}','"riscontro_precedente"'::jsonb) else o end),'[]'::jsonb)
    into v_origini from jsonb_array_elements(coalesce(articolo.origini,'[]'::jsonb)) o;
  update public.order_items set quantity=q,quantita_calcolata=q,quantita_netta=q,chiave_materiale=coalesce(chiave_materiale,'riscontro-tavola|'||p_item::text),origini=v_origini || nuove,updated_at=now() where id=p_item;
  return jsonb_build_object('id',p_item,'prima',articolo.quantity,'quantita',q);
end;$f$;
revoke all on function public.materiale_quantita_da_tavola(uuid,uuid,jsonb,timestamptz,text) from public,anon;
grant execute on function public.materiale_quantita_da_tavola(uuid,uuid,jsonb,timestamptz,text) to authenticated;

-- Un conteggio modificato dopo l'approvazione non autorizza un nuovo ordine.
create or replace function public.controlla_riscontro_tavola_ordine() returns trigger language plpgsql security invoker set search_path=public as $f$
declare fonte jsonb;
begin
  if new.order_item_id is null then return new; end if;
  for fonte in select x from public.order_items i cross join lateral jsonb_array_elements(coalesce(i.origini,'[]'::jsonb)) x
    where i.id=new.order_item_id and x->>'tipo'='planimetria' and x->>'ruolo'='riscontro_quantita' loop
    perform c.id from public.planimetrie_conteggi c where c.id=(fonte->>'conteggio_id')::uuid and c.confermato and c.updated_at=(fonte->>'conteggio_versione')::timestamptz for share;
    if not found then
      raise exception 'La tavola è cambiata: aggiorna e verifica il fabbisogno prima di ordinare';
    end if;
  end loop;
  return new;
end;$f$;
revoke all on function public.controlla_riscontro_tavola_ordine() from public,anon,authenticated;
drop trigger if exists riscontro_tavola_prima_ordine on public.purchase_order_items;
create trigger riscontro_tavola_prima_ordine before insert or update of order_item_id,quantity on public.purchase_order_items for each row execute function public.controlla_riscontro_tavola_ordine();
