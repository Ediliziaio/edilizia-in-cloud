-- Un ordine fornitore annullato rimette i materiali «da ordinare»: chi compra lo
-- deve sapere.
--
-- La riconciliazione dei materiali (20281222150000) non conta gli ODA annullati:
-- appena uno passa ad «annullato», le righe della commessa che copriva tornano
-- scoperte. Fino al 07/11/2026 succedeva in silenzio: il materiale spariva dagli
-- ordinati e ricompariva nel fabbisogno, ma nessuno veniva avvisato, e la data
-- entro cui ordinarlo poteva essere già passata.
--
-- Ora, al passaggio ad «annullato» di un ODA con righe collegate alla commessa
-- (purchase_order_items.order_item_id), una notifica a chi ha
-- can_manage_purchasing, tranne chi lo ha annullato
-- (materiali_notifica_permesso), con il link ai materiali della commessa.
-- Un ODA senza righe di commessa (magazzino, spese generali) non avvisa.

set local lock_timeout = '3s';

create or replace function public.purchase_order_annullato_avvisa()
 returns trigger
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  n_righe integer;
  codice text;
begin
  if new.status <> 'annullato' or old.status = 'annullato' or new.order_id is null then
    return new;
  end if;

  select count(*) into n_righe
    from public.purchase_order_items poi
   where poi.purchase_order_id = new.id and poi.order_item_id is not null;
  if n_righe = 0 then
    return new;
  end if;

  select o.order_code into codice from public.orders o where o.id = new.order_id;

  perform public.materiali_notifica_permesso(
    new.company_id,
    'can_manage_purchasing',
    'Ordine fornitore annullato',
    format('%s annullato: %s %s della commessa %s da ordinare di nuovo',
           coalesce(new.oda_number, 'L''ordine'),
           n_righe, case when n_righe = 1 then 'materiale' else 'materiali' end,
           coalesce(codice, '')),
    format('/azienda/ordini/%s?tab=articoli&vista_materiali=articoli', new.order_id),
    new.id);
  return new;
exception when others then
  -- L'avviso non deve mai impedire di annullare un ordine.
  raise warning 'purchase_order_annullato_avvisa: %', sqlerrm;
  return new;
end;
$function$;

revoke all on function public.purchase_order_annullato_avvisa() from public, anon, authenticated;

drop trigger if exists purchase_order_annullato_avvisa on public.purchase_orders;
create trigger purchase_order_annullato_avvisa
  after update of status on public.purchase_orders
  for each row
  when (new.status = 'annullato' and old.status is distinct from 'annullato')
  execute function public.purchase_order_annullato_avvisa();
