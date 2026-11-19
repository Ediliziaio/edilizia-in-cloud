-- Preparazione forniture atomica: 19/11/2026. Salvataggio unico e prezzi stimati separati dai documenti.
-- Riusa l'inserimento canonico e conserva separatamente input, stima e prezzo documentale.
set local lock_timeout = '3s';
set local statement_timeout = '60s';
alter table public.order_items add column if not exists preparazione_prezzo jsonb;
comment on column public.order_items.preparazione_prezzo is 'Input della stima: unitario/totale, IVA inclusa/esclusa ed eventuale ripartizione. purchase_price resta sempre unitario netto.';
create table if not exists public.preparazioni_forniture_salvataggi (
 richiesta uuid primary key, company_id uuid not null references public.companies(id) on delete cascade,
 order_id uuid not null references public.orders(id) on delete cascade, autore uuid not null,
 impronta text not null, risultato jsonb not null, created_at timestamptz not null default now()
);
alter table public.preparazioni_forniture_salvataggi enable row level security;
revoke all on public.preparazioni_forniture_salvataggi from public, anon, authenticated;
create index if not exists preparazioni_forniture_azienda on public.preparazioni_forniture_salvataggi(company_id,order_id);

create or replace function public.commessa_prepara_forniture(p_commessa uuid, p_voci jsonb, p_richiesta uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare azienda uuid; risultato jsonb; precedente public.preparazioni_forniture_salvataggi%rowtype;
 r jsonb; i integer; riga_id uuid; prezzo numeric; q numeric; aliquota numeric;
begin
 if auth.uid() is null or public.utente_bloccato() or public.utente_e_cliente_esterno() then raise exception 'Accesso negato' using errcode='42501'; end if;
 if p_richiesta is null or p_voci is null or jsonb_typeof(p_voci) <> 'array' then raise exception 'Preparazione non valida'; end if;
 if jsonb_array_length(p_voci) not between 1 and 500 then raise exception 'Prepara da una a 500 righe per volta'; end if;
 select o.company_id into azienda from public.orders o where o.id=p_commessa for update;
 if azienda is null or public.user_can_access_company(azienda) is not true then raise exception 'Accesso negato' using errcode='42501'; end if;
 if public.has_permission_for_company(auth.uid(),'can_edit_orders',azienda) is not true then raise exception 'Permesso mancante per salvare una preparazione articoli' using errcode='42501'; end if;
 if not exists(select 1 from public.orders o where o.id=p_commessa and public.can_see_order(o.id,o.assigned_to,o.destination_warehouse_id)) then raise exception 'Accesso negato' using errcode='42501'; end if;
 perform pg_advisory_xact_lock(hashtextextended(p_richiesta::text,0));
 select * into precedente from public.preparazioni_forniture_salvataggi where richiesta=p_richiesta;
 if found then
   if precedente.company_id<>azienda or precedente.order_id<>p_commessa or precedente.autore<>auth.uid() or precedente.impronta<>md5(p_voci::text) then
     raise exception 'La richiesta risulta già salvata con dati diversi: verifica gli articoli della commessa prima di continuare';
   end if;
   if exists(select 1 from jsonb_array_elements_text(precedente.risultato->'ids') x where not exists(select 1 from public.order_items oi where oi.id=x.value::uuid and oi.order_id=p_commessa)) then raise exception 'Preparazione già salvata, ma alcune righe sono state rimosse: verifica la commessa'; end if;
   return precedente.risultato;
 end if;
 for r in select value from jsonb_array_elements(p_voci) loop
   if nullif(r->>'id','') is not null or nullif(r->>'stock_item_id','') is not null then raise exception 'La preparazione inserisce nuove righe; per il magazzino usa il prelievo dedicato'; end if;
   if nullif(btrim(r->>'name'),'') is null or coalesce(r->>'status','da_ordinare')<>'da_ordinare' then raise exception 'Nome o stato della preparazione non validi'; end if;
   if nullif(r->>'supplier_id','') is not null and not exists(select 1 from public.suppliers s where s.id=(r->>'supplier_id')::uuid and s.company_id=azienda) then raise exception 'Fornitore non accessibile' using errcode='42501'; end if;
   if nullif(r->>'article_template_id','') is not null and not exists(select 1 from public.article_templates t where t.id=(r->>'article_template_id')::uuid and t.company_id=azienda) then raise exception 'Articolo non accessibile' using errcode='42501'; end if;
   if nullif(r->>'family_id','') is not null and not exists(select 1 from public.article_families f where f.id=(r->>'family_id')::uuid and f.company_id=azienda) then raise exception 'Famiglia non accessibile' using errcode='42501'; end if;
   prezzo:=nullif(r->>'purchase_price','')::numeric; q:=nullif(r->>'quantity','')::numeric; aliquota:=nullif(r->>'vat_rate','')::numeric;
   if prezzo is null or prezzo<0 or prezzo>1e9 or prezzo::text in ('NaN','Infinity','-Infinity') or q is null or q<=0 or q>1e9 or q::text in ('NaN','Infinity','-Infinity') or aliquota is null or aliquota not between 0 and 100 or aliquota::text='NaN' then raise exception 'Quantità, prezzo o IVA non validi'; end if;
   if round(q,4)<>q then raise exception 'Quantità con al massimo quattro decimali'; end if;
   if jsonb_typeof(r->'preparazione_prezzo') is distinct from 'object' or r->'preparazione_prezzo'->>'versione' is distinct from '1' or length((r->'preparazione_prezzo')::text)>8000 then raise exception 'Dati di preparazione mancanti o non validi'; end if;
   if coalesce((r->>'prezzo_da_definire')::boolean,false) and prezzo<>0 then raise exception 'Un prezzo da definire non può contenere un costo confermato'; end if;
 end loop;
 -- La funzione canonica applica gli stessi permessi, fasi, controlli e transazione.
 risultato:=public.commessa_aggiungi_voci(p_commessa,p_voci);
 if coalesce(jsonb_array_length(risultato->'ids'),0)<>jsonb_array_length(p_voci) then raise exception 'Inserimento non confermato'; end if;
 for i in 0..jsonb_array_length(p_voci)-1 loop
   r:=p_voci->i; riga_id:=(risultato->'ids'->>i)::uuid;
   update public.order_items set preparazione_prezzo=r->'preparazione_prezzo',
     costo_stimato_iniziale=case when coalesce((r->>'prezzo_da_definire')::boolean,false) then null else (r->>'purchase_price')::numeric end,
     prezzo_da_definire=coalesce((r->>'prezzo_da_definire')::boolean,false), origine_materiale='manuale'
   where id=riga_id and order_id=p_commessa;
   if not found then raise exception 'Riga appena inserita non verificabile'; end if;
 end loop;
 insert into public.preparazioni_forniture_salvataggi(richiesta,company_id,order_id,autore,impronta,risultato)
 values(p_richiesta,azienda,p_commessa,auth.uid(),md5(p_voci::text),risultato);
 return risultato;
end $$;
revoke all on function public.commessa_prepara_forniture(uuid,jsonb,uuid) from public,anon;
grant execute on function public.commessa_prepara_forniture(uuid,jsonb,uuid) to authenticated;

-- Estensione del percorso ODA canonico: conserva i prezzi ancora da confermare.
-- Il controllo sui frammenti evita di riscrivere una versione remota diversa senza revisione.
do $patch$
declare d text; prima text;
begin
 if to_regprocedure('public.crea_oda_materiali_atomica(uuid,uuid,uuid,jsonb)') is null then return; end if;
 select pg_get_functiondef('public.crea_oda_materiali_atomica(uuid,uuid,uuid,jsonb)'::regprocedure) into d;
 if position('preparazione_pending_v1' in d)>0 then return; end if;
 prima:=d;
 d:=replace(d,'unit_of_measure,sort_order)', 'unit_of_measure,sort_order,price_pending)');
 if d=prima then raise exception 'Revisionare la versione canonica della RPC ODA: elenco colonne diverso'; end if;
 prima:=d;
 d:=replace(d,$s$v_line->>'unit_of_measure',v_pos);$s$,$s$v_line->>'unit_of_measure',v_pos,coalesce((v_line->>'price_pending')::boolean,false));$s$);
 if d=prima then raise exception 'Revisionare la versione canonica della RPC ODA: valori diversi'; end if;
 prima:=d;
 d:=replace(d,$s$or coalesce((v_line->>'discount_percent')::numeric,0)<>0$s$,$s$or coalesce((v_line->>'discount_percent')::numeric,0)<>0
        -- preparazione_pending_v1: zero sconosciuto non diventa gratuito.
        or coalesce((v_line->>'price_pending')::boolean,false) is distinct from (coalesce(v_item.prezzo_da_definire,false) or (coalesce(v_item.purchase_price,0)=0 and v_item.prezzo_fonte is null))
        or round((v_line->>'quantity')::numeric,3) <> (v_line->>'quantity')::numeric
        or round((v_line->>'vat_rate')::numeric,2) <> (v_line->>'vat_rate')::numeric
        or round(round((v_line->>'unit_price')::numeric,4)*(v_line->>'quantity')::numeric,2) <> round((v_line->>'unit_price')::numeric*(v_line->>'quantity')::numeric,2)
        or round(round((v_line->>'unit_price')::numeric,4)*(v_line->>'quantity')::numeric*(v_line->>'vat_rate')::numeric/100,2) <> round((v_line->>'unit_price')::numeric*(v_line->>'quantity')::numeric*(v_line->>'vat_rate')::numeric/100,2)$s$);
 if d=prima then raise exception 'Revisionare la versione canonica della RPC ODA: controlli diversi'; end if;
 execute d;
end $patch$;

-- Un prezzo confermato dall'ODA sostituisce la stima, anche se l'importo è uguale.
-- La stima iniziale e i metadati di preparazione restano conservati.
do $patch$
declare d text; prima text;
begin
 if to_regprocedure('public.materiali_prezzo_da_ordine()') is null then return; end if;
 select pg_get_functiondef('public.materiali_prezzo_da_ordine()'::regprocedure) into d;
 if position('preparazione_prezzo_confermato_v1' in d)>0 then return; end if;
 prima:=d;
 d:=replace(d,'purchase_price = prezzo,','purchase_price = prezzo, prezzo_da_definire = false, -- preparazione_prezzo_confermato_v1' || E'\n');
 if d=prima then raise exception 'Revisionare il sincronizzatore prezzi ODA: assegnazione diversa'; end if;
 prima:=d;
 d:=replace(d,'coalesce(new.unit_price, 0) <= 0','(coalesce(new.unit_price, 0) < 0 or (coalesce(new.unit_price, 0) = 0 and coalesce(new.price_pending,true)))');
 if d=prima then raise exception 'Revisionare il sincronizzatore prezzi ODA: controllo prezzo diverso'; end if;
 prima:=d;
 d:=replace(d,'oi.purchase_price is distinct from prezzo',$s$(oi.purchase_price is distinct from prezzo or oi.prezzo_da_definire is true or coalesce(oi.prezzo_fonte,'') not in ('ordine','offerta'))$s$);
 if d=prima then raise exception 'Revisionare il sincronizzatore prezzi ODA: confronto diverso'; end if;
 prima:=d;
 d:=replace(d,'and new.order_item_id is not distinct from old.order_item_id then','and new.order_item_id is not distinct from old.order_item_id and new.price_pending is not distinct from old.price_pending then');
 if d=prima then raise exception 'Revisionare il sincronizzatore prezzi ODA: controllo aggiornamento diverso'; end if;
 if not exists(select 1 from pg_trigger where tgrelid='public.purchase_order_items'::regclass and tgname='materiali_prezzo_da_ordine' and tgfoid='public.materiali_prezzo_da_ordine()'::regprocedure and not tgisinternal) then raise exception 'Revisionare il trigger del sincronizzatore prezzi ODA'; end if;
 execute d;
 drop trigger materiali_prezzo_da_ordine on public.purchase_order_items;
 create trigger materiali_prezzo_da_ordine after insert or update of unit_price,discount_percent,order_item_id,price_pending on public.purchase_order_items for each row execute function public.materiali_prezzo_da_ordine();
end $patch$;

notify pgrst, 'reload schema';
