set local lock_timeout = '3s';
alter table public.controlli_documento_fornitore
  add column base_ordine jsonb,
  add column impronta_ordine text,
  add column versione integer not null default 1,
  add column errore text,
  add column originale_path text,
  add column originale_mime text,
  add column abbinamenti jsonb not null default '{}'::jsonb,
  add column decisioni_storico jsonb not null default '[]'::jsonb;
alter table public.controlli_documento_fornitore drop constraint controlli_documento_fornitore_stato_check;
alter table public.controlli_documento_fornitore add constraint controlli_documento_fornitore_stato_check check(stato in ('in_lettura','letto','errore'));
drop index public.controlli_documento_fornitore_unico;
create unique index controlli_documento_fornitore_unico on public.controlli_documento_fornitore
 (company_id,coalesce(purchase_order_id,rfq_supplier_id),tipo,file_hash,coalesce(impronta_ordine,'storico'));

-- Solo dati commerciali: gli arrivi, gli stati logistici e i timestamp non
-- cambiano l'identità di ciò che è stato richiesto al fornitore.
create function public._controllo_documento_dati(p_po uuid,p_rfq uuid) returns jsonb
language plpgsql stable security definer set search_path=public as $$
declare testata jsonb; righe jsonb;
begin
 if (p_po is null)=(p_rfq is null) then raise exception 'Scegli un ordine o una richiesta.';end if;
 if p_po is not null then
  select jsonb_build_object('company_id',p.company_id,'fornitore_id',p.supplier_id,'numero',p.oda_number,
   'consegna',p.expected_delivery_date,'pagamento',p.payment_terms,'metodo_pagamento',p.payment_method,
   'destinazione',p.delivery_address,'magazzino',p.delivery_warehouse_id,'dettagli',p.document_details,'note',p.notes)
   into testata from purchase_orders p where p.id=p_po;
  select coalesce(jsonb_agg(jsonb_build_object('id',i.id,'description',i.description,'sku',i.sku,
   'quantity',i.quantity,'unit_of_measure',i.unit_of_measure,'unit_price',i.unit_price,
   'discount_percent',i.discount_percent,'vat_rate',i.vat_rate,'price_pending',i.price_pending,'riferimento',i.riferimento,
   'misure',i.misure,'colore',i.colore,'apertura',i.apertura,'misure_testo',i.misure_testo,'rfq_item_id',i.rfq_item_id)
   order by i.sort_order,i.id),'[]') into righe from purchase_order_items i where i.purchase_order_id=p_po;
 else
  select jsonb_build_object('company_id',r.company_id,'fornitore_id',r.supplier_id,'rfq_id',r.rfq_id)
   into testata from supplier_rfq_suppliers r where r.id=p_rfq;
  select coalesce(jsonb_agg(to_jsonb(i)-array['updated_at','created_at'] order by i.posizione,i.id),'[]')
   into righe from supplier_rfq_items i where i.rfq_id=(select rfq_id from supplier_rfq_suppliers where id=p_rfq);
 end if;
 if testata is null then raise exception 'Documento non trovato.' using errcode='P0002';end if;
 return jsonb_build_object('testata',testata,'righe',righe,'invio',(
  select e.payload#>'{context,documento}' from procurement_document_events e
  where e.company_id=(testata->>'company_id')::uuid and e.kind='email' and e.operation='sent'
   and e.purchase_order_id=p_po and jsonb_typeof(e.payload#>'{context,documento,righe}')='array'
  order by e.created_at desc,e.id desc limit 1));
end $$;
revoke all on function public._controllo_documento_dati(uuid,uuid) from public,anon,authenticated;

create function public.controllo_documento_base(p_po uuid default null,p_rfq uuid default null) returns jsonb
language plpgsql stable security definer set search_path=public as $$
declare dati jsonb; evento procurement_document_events%rowtype; azienda uuid;
begin
 dati:=_controllo_documento_dati(p_po,p_rfq);azienda:=(dati#>>'{testata,company_id}')::uuid;
 if auth.uid() is null or utente_bloccato() or utente_e_cliente_esterno() or not user_can_access_company(azienda)
 or not (materiali_puo('can_view_orders',azienda) or materiali_puo('can_manage_purchasing',azienda) or materiali_puo('can_edit_orders',azienda))
 then raise exception 'Non puoi leggere questo controllo.' using errcode='42501';end if;
 if p_po is not null then
  select * into evento from procurement_document_events e where e.company_id=azienda and e.purchase_order_id=p_po
   and e.kind='email' and e.operation='sent' and jsonb_typeof(e.payload#>'{context,documento,righe}')='array'
   order by e.created_at desc,e.id desc limit 1;
 end if;
 return dati||jsonb_build_object('allegato_fornitore',(select attachment_url from purchase_orders where id=p_po),'fornitore',(select jsonb_build_object('nome',s.name,'email',s.email,'partita_iva',s.vat_number) from suppliers s where s.id=(dati#>>'{testata,fornitore_id}')::uuid),
  'impronta',md5(dati::text),'documento',evento.payload#>'{context,documento}',
  'evento_id',evento.id,'inviato_il',evento.created_at,'fonte',case when evento.id is null then 'ordine_corrente' else 'invio' end);
end $$;
revoke all on function public.controllo_documento_base(uuid,uuid) from public,anon;
grant execute on function public.controllo_documento_base(uuid,uuid) to authenticated,service_role;

create function public._controllo_documento_revisionato(p_id uuid,p_versione integer)
returns public.controlli_documento_fornitore language plpgsql security definer set search_path=public as $$
declare c controlli_documento_fornitore;
begin
 select * into c from controlli_documento_fornitore where id=p_id for update;
 if not found then raise exception 'Controllo non trovato.' using errcode='P0002';end if;
 perform _controllo_documento_puo(c.company_id);
 if auth.uid() is null or utente_bloccato() or utente_e_cliente_esterno() or utente_sola_lettura(c.company_id)
 then raise exception 'Non puoi modificare questo controllo.' using errcode='42501';end if;
 if c.purchase_order_id is not null then perform id from purchase_orders where id=c.purchase_order_id for update;end if;
 if c.impronta_ordine is null or c.impronta_ordine is distinct from md5(_controllo_documento_dati(c.purchase_order_id,c.rfq_supplier_id)::text)
 then raise exception 'L’ordine è cambiato: aggiorna il confronto prima di approvare.' using errcode='PT409';end if;
 if p_versione is null or c.versione<>p_versione then raise exception 'Un collega ha aggiornato il controllo: ricaricalo.' using errcode='PT409';end if;
 if c.stato<>'letto' then raise exception 'Completa prima la lettura del documento.';end if;
 return c;
end $$;
revoke all on function public._controllo_documento_revisionato(uuid,integer) from public,anon,authenticated;

create function public.controllo_documento_decidi(p_id uuid,p_versione integer,p_chiave text,p_esito text,p_nota text default null)
returns text language plpgsql security definer set search_path=public as $$
declare c controlli_documento_fornitore; nuove jsonb; risultato text;
begin
 c:=_controllo_documento_revisionato(p_id,p_versione);
 if c.accettato_il is not null then raise exception 'Questo controllo è già approvato.';end if;
 if p_esito not in ('verde','rosso') or not exists(select 1 from jsonb_array_elements(c.righe) r where r->>'chiave'=p_chiave)
 then raise exception 'Scegli una posizione valida.';end if;
 if length(trim(coalesce(p_nota,'')))<5 then raise exception 'Descrivi la verifica manuale o la variazione concordata.';end if;
 select jsonb_agg(case when r->>'chiave'=p_chiave then r||jsonb_build_object('esito',p_esito,'deciso_da_persona',true,
  'nota_persona',trim(p_nota),'deciso_da',auth.uid(),'deciso_il',now()) else r end order by ord)
  into nuove from jsonb_array_elements(c.righe) with ordinality t(r,ord);
 risultato:=_controllo_documento_esito(nuove);
 update controlli_documento_fornitore set righe=nuove,esito=risultato,versione=versione+1,updated_at=now(),
  decisioni_storico=decisioni_storico||jsonb_build_array(jsonb_build_object('azione','verifica_posizione','chiave',p_chiave,'esito',p_esito,'nota',trim(p_nota),'utente',auth.uid(),'data',now(),'versione',c.versione)) where id=p_id;
 return risultato;
end $$;
create function public.controllo_documento_approva(p_id uuid,p_versione integer,p_motivo text default null)
returns void language plpgsql security definer set search_path=public as $$
declare c controlli_documento_fornitore;
begin
 c:=_controllo_documento_revisionato(p_id,p_versione);
 if c.accettato_il is not null then return;end if;
 if c.esito<>'verde' and length(trim(coalesce(p_motivo,'')))<5 then raise exception 'Scrivi il motivo delle differenze accettate.';end if;
 update controlli_documento_fornitore set accettato_il=now(),accettato_da=auth.uid(),accettato_motivo=nullif(trim(p_motivo),''),
  versione=versione+1,updated_at=now(),decisioni_storico=decisioni_storico||jsonb_build_array(jsonb_build_object('azione','approvazione','nota',p_motivo,'utente',auth.uid(),'data',now(),'versione',c.versione)) where id=p_id;
end $$;
revoke all on function public.controllo_documento_decidi(uuid,integer,text,text,text) from public,anon;
revoke all on function public.controllo_documento_approva(uuid,integer,text) from public,anon;
grant execute on function public.controllo_documento_decidi(uuid,integer,text,text,text),public.controllo_documento_approva(uuid,integer,text) to authenticated,service_role;

create function public.controllo_documento_applica_prezzi(p_id uuid,p_versione integer,p_righe uuid[]) returns integer
language plpgsql security definer set search_path=public as $$
declare c controlli_documento_fornitore; r jsonb; l jsonb; i purchase_order_items; prezzo numeric; indice integer; n integer:=0;
begin
 c:=_controllo_documento_revisionato(p_id,p_versione);
 if c.accettato_il is null or c.purchase_order_id is null or coalesce(cardinality(p_righe),0) not between 1 and 500
 then raise exception 'Approva prima la conferma e scegli le voci con prezzo da definire.';end if;
 if cardinality(p_righe)<>(select count(distinct x) from unnest(p_righe) x) then raise exception 'Selezione ripetuta.';end if;
 for i in select * from purchase_order_items where purchase_order_id=c.purchase_order_id and id=any(p_righe) order by id for update loop
  select x into r from jsonb_array_elements(c.righe) x where x->>'chiave'=i.id::text;
  indice:=nullif(r#>>'{indici_fornitore,0}','')::integer;l:=c.lettura->'righe'->indice;
  prezzo:=nullif(l->>'prezzo_unitario','')::numeric;
  if not coalesce(i.price_pending,false) or prezzo is null or prezzo<0 or prezzo>1000000000 or prezzo::text in ('NaN','Infinity','-Infinity')
   or jsonb_array_length(r->'indici_fornitore')<>1 or ddt_unita(i.unit_of_measure) is distinct from ddt_unita(l->>'unita')
   or ((coalesce((l->>'confidenza')::numeric,0)<60 or coalesce(l->'incerti','[]') ? 'prezzo_unitario') and not coalesce((r->>'deciso_da_persona')::boolean,false))
  then raise exception 'Controlla prezzo, unità e abbinamento della voce prima di applicare i prezzi.';end if;
  update purchase_order_items set unit_price=prezzo,discount_percent=0,price_pending=false where id=i.id;
  n:=n+1;
 end loop;
 if n<>cardinality(p_righe) then raise exception 'Una voce non appartiene a questo ordine.';end if;
 update controlli_documento_fornitore set impronta_ordine=md5(_controllo_documento_dati(c.purchase_order_id,null)::text),versione=versione+1,updated_at=now(),
  decisioni_storico=decisioni_storico||jsonb_build_array(jsonb_build_object('azione','prezzi_applicati','righe',p_righe,'utente',auth.uid(),'data',now(),'versione',c.versione)) where id=p_id;
 return n;
end $$;
revoke all on function public.controllo_documento_applica_prezzi(uuid,integer,uuid[]) from public,anon;
grant execute on function public.controllo_documento_applica_prezzi(uuid,integer,uuid[]) to authenticated,service_role;

-- Le vecchie pagine non possono approvare un risultato senza controllarne la revisione.
create or replace function public.controllo_documento_accetta(p_id uuid,p_motivo text) returns void
language plpgsql security definer set search_path=public as $$begin
 raise exception 'Apri il confronto aggiornato e ricontrolla il documento prima di approvare.' using errcode='PT409';
end $$;
create or replace function public.controllo_documento_riga_decidi(p_id uuid,p_chiave text,p_esito text,p_nota text default null) returns text
language plpgsql security definer set search_path=public as $$begin
 raise exception 'Apri il confronto aggiornato per salvare la verifica della posizione.' using errcode='PT409';
end $$;

create or replace function public.purchase_orders_blocco_conferma() returns trigger
language plpgsql security definer set search_path=public as $$declare c controlli_documento_fornitore;begin
 if new.status is distinct from 'confermato' or old.status is not distinct from 'confermato' then return new;end if;
 select * into c from controlli_documento_fornitore where purchase_order_id=new.id and tipo='conferma'
  order by created_at desc,id desc limit 1;
 if found and (c.stato<>'letto' or c.impronta_ordine is null
  or new.supplier_id is distinct from old.supplier_id or new.expected_delivery_date is distinct from old.expected_delivery_date
  or new.payment_terms is distinct from old.payment_terms or new.document_details is distinct from old.document_details
  or c.impronta_ordine is distinct from md5(_controllo_documento_dati(new.id,null)::text)
  or (c.esito<>'verde' and c.accettato_il is null))
 then raise exception 'La conferma richiede un controllo aggiornato prima di confermare l’ordine.' using errcode='DOC01';end if;
 return new;
end $$;

-- Il permesso Acquisti permette di consultare le conferme anche senza can_view_orders.
create policy controlli_documento_fornitore_acquisti on public.controlli_documento_fornitore for select to authenticated
using(not utente_bloccato() and not utente_e_cliente_esterno() and company_id=any(aziende_con_permesso('can_manage_purchasing')));
notify pgrst,'reload schema';
