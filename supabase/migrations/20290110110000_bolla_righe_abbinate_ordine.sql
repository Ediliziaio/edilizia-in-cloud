-- La merce sulla bolla si abbina alle righe dell'ordine (08/11/2026).
--
-- `ddt_righe.order_item_id` esisteva ma nessuno lo scriveva (0 righe su 13): la bolla non
-- sapeva quale riga dell'ordine stava consegnando. Ora ogni riga può puntare a una riga
-- dell'ordine a cui la bolla è collegata: la propone il sistema, la corregge una persona.
-- `abbinamento`: 'auto' lo ha fatto il sistema; 'manuale' lo ha deciso una persona, anche
-- quando ha detto «non è dell'ordine» (riga vuota): il sistema non lo rifà più.
--
-- Effetto a cascata voluto: la riga eredita order_item_id, e `bolla_carica_magazzino`
-- riconosce così la merce su misura e non la carica in giacenza.
--
-- Nessuna riga viene scritta. Rieseguirla non fa niente.
set local lock_timeout = '3s';
set local statement_timeout = '60s';

alter table public.ddt_righe
  add column if not exists purchase_order_item_id uuid references public.purchase_order_items(id) on delete set null,
  add column if not exists abbinamento text;

alter table public.ddt_righe drop constraint if exists ddt_righe_abbinamento_valido;
alter table public.ddt_righe add constraint ddt_righe_abbinamento_valido
  check (abbinamento is null or abbinamento in ('auto', 'manuale'));

create index if not exists ddt_righe_riga_ordine_idx
  on public.ddt_righe (purchase_order_item_id) where purchase_order_item_id is not null;

create or replace function public.ddt_riga_prepara()
returns trigger
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_company uuid;
  v_oi_company uuid;
  v_order_item uuid;
begin
  select d.company_id into v_company
    from public.ddt_ricezione d where d.id = new.ddt_ricezione_id;
  if not found then
    raise exception 'Bolla inesistente' using errcode = '23514';
  end if;
  new.company_id := v_company;

  -- La riga dell'ordine deve stare nell'ordine di QUESTA bolla; da lì arriva la riga di commessa.
  if new.purchase_order_item_id is not null then
    select p.order_item_id into v_order_item
      from public.purchase_order_items p
      join public.ddt_ricezione d on d.purchase_order_id = p.purchase_order_id
     where p.id = new.purchase_order_item_id and d.id = new.ddt_ricezione_id;
    if not found then
      raise exception 'Questa riga non appartiene all''ordine della bolla' using errcode = '23514';
    end if;
    new.order_item_id := v_order_item;
  elsif tg_op = 'UPDATE' and old.purchase_order_item_id is not null then
    new.order_item_id := null;
  end if;

  if new.order_item_id is not null then
    select o.company_id into v_oi_company
      from public.order_items oi
      join public.orders o on o.id = oi.order_id
     where oi.id = new.order_item_id;
    if v_oi_company is distinct from v_company then
      raise exception 'La riga di commessa e'' di un''altra azienda' using errcode = '23514';
    end if;
  end if;

  if coalesce(btrim(new.descrizione), '') = '' then
    new.descrizione := coalesce(nullif(btrim(coalesce(new.testo_grezzo, '')), ''), 'Riga non riconosciuta');
  end if;

  if new.importo is null and new.quantita is not null and new.prezzo_unitario is not null then
    new.importo := round(new.quantita * new.prezzo_unitario, 2);
  end if;

  new.updated_at := now();
  return new;
end;
$function$;
revoke all on function public.ddt_riga_prepara() from public, anon, authenticated;
