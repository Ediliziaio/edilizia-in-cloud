-- La riga di commessa per i beni su misura (08/11/2026), piano articoli su misura, fase 1.
--
-- Una riga per posizione, raggruppate a schermo con gruppo_id; riferimento = «Cucina», «P3».
-- Il prezzo dell'ordine torna sulla riga anche per le righe su misura e per quelle ancora
-- senza costo: prima solo per i materiali generati, e 1.363 righe su 1.366 restavano ferme.
-- Una riga a mano che ha già un costo non si tocca, come oggi.
-- Il costo precedente si conserva: se l'ordine si annulla o si cancella, torna.
-- Una posizione su misura non si ordina due volte, salvo riordino col motivo.
--
-- Solo colonne facoltative e funzioni: nessuna riga viene scritta.
set local lock_timeout = '3s';
set local statement_timeout = '60s';

alter table public.order_items
  add column if not exists gruppo_id uuid,
  add column if not exists riferimento text,
  add column if not exists prezzo_prima_ordine jsonb;

alter table public.purchase_order_items
  add column if not exists riordino_motivo text;

comment on column public.order_items.gruppo_id is 'Posizioni dello stesso bene su misura, mostrate come una voce sola. Vuoto per gli articoli normali.';
comment on column public.order_items.riferimento is 'Come si chiama la posizione in cantiere: Cucina, P3.';
comment on column public.order_items.prezzo_prima_ordine is 'Costo e fonte prima che un ordine li riscrivesse: tornano se l''ordine si annulla.';
comment on column public.purchase_order_items.riordino_motivo is 'Riga che rifà un pezzo già ordinato (sbagliato, rotto): il motivo la distingue da un doppione.';

create index if not exists order_items_gruppo_idx on public.order_items (gruppo_id) where gruppo_id is not null;

create or replace function public.materiali_prezzo_da_ordine()
 returns trigger
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  prezzo numeric;
begin
  -- Un riordino non cambia il costo: lo stesso pezzo, rifatto.
  if new.order_item_id is null or coalesce(new.unit_price, 0) <= 0 or new.riordino_motivo is not null then
    return null;
  end if;
  if tg_op = 'UPDATE'
     and new.unit_price is not distinct from old.unit_price
     and new.discount_percent is not distinct from old.discount_percent
     and new.order_item_id is not distinct from old.order_item_id then
    return null;
  end if;
  if exists (select 1 from public.purchase_orders po
              where po.id = new.purchase_order_id and po.status = 'annullato') then
    return null;
  end if;
  prezzo := round(new.unit_price * (1 - coalesce(new.discount_percent, 0) / 100), 4);
  update public.order_items oi
     set prezzo_prima_ordine = case
           when oi.prezzo_fonte in ('ordine', 'offerta') then oi.prezzo_prima_ordine
           else jsonb_build_object('prezzo', oi.purchase_price, 'fonte', oi.prezzo_fonte)
         end,
         purchase_price = prezzo,
         prezzo_fonte = case when oi.supplier_rfq_item_id is not null then 'offerta' else 'ordine' end,
         prezzo_aggiornato_il = now()
   where oi.id = new.order_item_id
     and exists (select 1 from public.orders o
                  where o.id = oi.order_id and o.company_id = new.company_id)
     and (oi.origine_materiale is not null
          or oi.gruppo_id is not null
          or coalesce(oi.purchase_price, 0) = 0)
     and oi.purchase_price is distinct from prezzo;
  return null;
end;
$function$;

-- Il costo torna a com'era se nessun altro ordine attivo copre la riga.
create or replace function public.materiali_prezzo_ripristina(p_order_item uuid)
 returns void
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
begin
  update public.order_items oi
     set purchase_price = coalesce((oi.prezzo_prima_ordine->>'prezzo')::numeric, 0),
         prezzo_fonte = oi.prezzo_prima_ordine->>'fonte',
         prezzo_aggiornato_il = now(),
         prezzo_prima_ordine = null
   where oi.id = p_order_item
     and oi.prezzo_prima_ordine is not null
     and oi.prezzo_fonte in ('ordine', 'offerta')
     and not exists (
       select 1 from public.purchase_order_items p
         join public.purchase_orders po on po.id = p.purchase_order_id
        where p.order_item_id = oi.id
          and po.status <> 'annullato'
          and coalesce(p.unit_price, 0) > 0
          and p.riordino_motivo is null
     );
end;
$function$;

create or replace function public.materiali_prezzo_ordine_annullato()
 returns trigger
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  riga uuid;
begin
  if new.status = 'annullato' and old.status is distinct from 'annullato' then
    for riga in select distinct p.order_item_id from public.purchase_order_items p
                 where p.purchase_order_id = new.id and p.order_item_id is not null loop
      perform public.materiali_prezzo_ripristina(riga);
    end loop;
  end if;
  return null;
end;
$function$;

create or replace function public.materiali_prezzo_riga_ordine_tolta()
 returns trigger
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
begin
  if old.order_item_id is not null then
    perform public.materiali_prezzo_ripristina(old.order_item_id);
  end if;
  return null;
end;
$function$;

-- Una posizione su misura non si ordina due volte. Blocca la riga: due schede o un
-- doppio clic passano uno alla volta, e il secondo trova la posizione già coperta.
create or replace function public.purchase_order_items_su_misura_una_volta()
 returns trigger
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_gruppo uuid;
  v_quantita numeric;
  v_nome text;
  v_coperta numeric;
begin
  if new.order_item_id is null or nullif(btrim(new.riordino_motivo), '') is not null then
    return new;
  end if;
  select oi.gruppo_id, oi.quantity, oi.name into v_gruppo, v_quantita, v_nome
    from public.order_items oi where oi.id = new.order_item_id for update;
  if v_gruppo is null then
    return new;
  end if;
  if exists (select 1 from public.purchase_orders po
              where po.id = new.purchase_order_id and po.status = 'annullato') then
    return new;
  end if;
  select coalesce(sum(p.quantity), 0) into v_coperta
    from public.purchase_order_items p
    join public.purchase_orders po on po.id = p.purchase_order_id
   where p.order_item_id = new.order_item_id
     and p.id is distinct from new.id
     and po.status <> 'annullato'
     and p.riordino_motivo is null;
  if v_coperta + coalesce(new.quantity, 0) > coalesce(v_quantita, 0) + 0.0001 then
    raise exception 'La posizione «%» è già in un ordine. Per rifarla, indica il motivo del riordino.', v_nome
      using errcode = '23505';
  end if;
  return new;
end;
$function$;

revoke all on function public.materiali_prezzo_ripristina(uuid) from public, anon, authenticated;
revoke all on function public.materiali_prezzo_ordine_annullato() from public, anon, authenticated;
revoke all on function public.materiali_prezzo_riga_ordine_tolta() from public, anon, authenticated;
revoke all on function public.purchase_order_items_su_misura_una_volta() from public, anon, authenticated;

drop trigger if exists materiali_prezzo_ordine_annullato on public.purchase_orders;
create trigger materiali_prezzo_ordine_annullato
  after update of status on public.purchase_orders
  for each row execute function public.materiali_prezzo_ordine_annullato();

drop trigger if exists materiali_prezzo_riga_ordine_tolta on public.purchase_order_items;
create trigger materiali_prezzo_riga_ordine_tolta
  after delete on public.purchase_order_items
  for each row execute function public.materiali_prezzo_riga_ordine_tolta();

drop trigger if exists purchase_order_items_su_misura_una_volta on public.purchase_order_items;
create trigger purchase_order_items_su_misura_una_volta
  before insert or update of order_item_id, quantity on public.purchase_order_items
  for each row execute function public.purchase_order_items_su_misura_una_volta();
