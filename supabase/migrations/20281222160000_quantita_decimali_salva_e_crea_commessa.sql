-- Quantità decimali: salvare, creare e duplicare una commessa.
--
-- Dopo 20281222140000_materiali_quantita_decimali le righe della commessa
-- possono valere 12,4 (kg, m², m³). Tre funzioni convertivano ancora la
-- quantità ricevuta in intero:
--   * commessa_salva — «(v.dati->>'quantity')::int», quattro volte: salvando
--     una commessa con un materiale da 12,4 kg il cast falliva («invalid input
--     syntax for type integer») e il salvataggio intero si fermava;
--   * create_order_atomic — «v_qty INTEGER» e «::integer»: nessuna riga
--     decimale poteva entrare in una commessa nuova;
--   * duplica_lavoro_atomic — «(i->>'quantity')::integer»: duplicare una
--     commessa con un materiale decimale si fermava allo stesso modo.
--
-- Le tre funzioni sono lunghe (20 000, 10 000 e 11 000 caratteri) e il resto
-- non cambia: invece di ricopiarle, si sostituiscono solo quei punti nella
-- definizione attuale. Se un punto non c'è, o ce n'è un numero diverso da
-- quello atteso, la migrazione si ferma senza toccare niente. Permessi,
-- SECURITY DEFINER e search_path restano quelli di prima (CREATE OR REPLACE).
--
-- Rieseguirla è innocuo: a funzioni già corrette non trova niente da
-- sostituire e non fa nulla.

do $migrazione$
declare
  def text;
  nuova text;
  quanti integer;
begin
  -- commessa_salva: quattro cast della quantità
  def := pg_get_functiondef('public.commessa_salva(uuid,jsonb,jsonb,jsonb,jsonb,jsonb,integer)'::regprocedure);
  select count(*) into quanti from regexp_matches(def, '\(v\.dati->>''quantity''\)::int\M', 'g');
  if quanti not in (0, 4) then
    raise exception 'commessa_salva: attesi 4 cast della quantità, trovati %', quanti;
  end if;
  if quanti = 4 then
    nuova := regexp_replace(def, '\(v\.dati->>''quantity''\)::int\M', '(v.dati->>''quantity'')::numeric', 'g');
    execute nuova;
  end if;

  -- create_order_atomic: la variabile e il cast
  def := pg_get_functiondef('public.create_order_atomic(jsonb,jsonb,jsonb,uuid,jsonb)'::regprocedure);
  select count(*) into quanti from regexp_matches(def, '\mv_qty\s+INTEGER\M', 'gi');
  if quanti > 1 then
    raise exception 'create_order_atomic: attesa una dichiarazione di v_qty, trovate %', quanti;
  end if;
  nuova := regexp_replace(def, '\m(v_qty\s+)INTEGER\M', '\1NUMERIC', 'i');
  select count(*) into quanti from regexp_matches(nuova, '\(v_item->>''quantity''\)::integer\M', 'gi');
  if quanti > 1 then
    raise exception 'create_order_atomic: atteso un cast della quantità, trovati %', quanti;
  end if;
  nuova := regexp_replace(nuova, '\(v_item->>''quantity''\)::integer\M', '(v_item->>''quantity'')::numeric', 'i');
  if nuova <> def then
    execute nuova;
  end if;

  -- duplica_lavoro_atomic: il cast nella copia delle righe
  def := pg_get_functiondef('public.duplica_lavoro_atomic(text,uuid,boolean,boolean,text,uuid)'::regprocedure);
  select count(*) into quanti from regexp_matches(def, '\(i->>''quantity''\)::integer\M', 'g');
  if quanti > 1 then
    raise exception 'duplica_lavoro_atomic: atteso un cast della quantità, trovati %', quanti;
  end if;
  if quanti = 1 then
    nuova := replace(def, '(i->>''quantity'')::integer', '(i->>''quantity'')::numeric');
    execute nuova;
  end if;

  -- Nessuno dei tre deve restare con la quantità intera.
  if exists (
    select 1 from pg_proc p
     where p.oid in ('public.commessa_salva(uuid,jsonb,jsonb,jsonb,jsonb,jsonb,integer)'::regprocedure,
                     'public.create_order_atomic(jsonb,jsonb,jsonb,uuid,jsonb)'::regprocedure,
                     'public.duplica_lavoro_atomic(text,uuid,boolean,boolean,text,uuid)'::regprocedure)
       and (p.prosrc ~* '''quantity''\)::int(eger)?\M' or p.prosrc ~* '\mv_qty\s+integer\M')
  ) then
    raise exception 'Resta una quantità convertita in intero';
  end if;
end
$migrazione$;

-- ─── Un articolo di magazzino si scarica a pezzi interi ─────────────────────
--
-- Il magazzino (warehouse_stock, warehouse_movements) conta interi. Una riga
-- della commessa collegata a un articolo di magazzino con 12,4 verrebbe
-- arrotondata in silenzio da ogni scarico e rientro, e lo scarico a
-- installazione la rifiuta già (trg_auto_deduct_stock). Meglio dirlo subito,
-- quando la si scrive, con un messaggio che si capisce.

create or replace function public.order_items_magazzino_pezzi_interi()
 returns trigger
 language plpgsql
 set search_path to 'public'
as $function$
begin
  if new.stock_item_id is not null and new.quantity is not null and new.quantity <> trunc(new.quantity) then
    raise exception '«%» è un articolo di magazzino: si scarica a pezzi interi, non %.',
      coalesce(new.name, 'Questa riga'), replace(trim(trailing '.' from trim(trailing '0' from new.quantity::text)), '.', ',')
      using errcode = '22023';
  end if;
  return new;
end;
$function$;

revoke all on function public.order_items_magazzino_pezzi_interi() from public, anon, authenticated;

drop trigger if exists order_items_magazzino_pezzi_interi on public.order_items;
create trigger order_items_magazzino_pezzi_interi
  before insert or update of quantity, stock_item_id on public.order_items
  for each row execute function public.order_items_magazzino_pezzi_interi();
