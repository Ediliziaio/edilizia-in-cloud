-- ════════════════════════════════════════════════════════════════════════════
-- Dove va la merce di questa bolla, e perché non può essere contata due volte
-- ════════════════════════════════════════════════════════════════════════════
-- Fase 2-bis del piano in docs/piano-ddt-bolle-fatture.md.
--
-- Sulla bolla ci sono prodotti comprati. Possono andare in due posti, e sono
-- due cose diverse:
--
--   MAGAZZINO   la merce entra in giacenza e ci resta finché qualcuno la scarica
--               su un cantiere. Oggi lo fa `goods_receipts` → il trigger
--               `auto_carico_stock_on_receipt` scrive `warehouse_stock` e un
--               movimento di «carico»; andare in cantiere è un secondo
--               movimento, di «scarico», con la commessa (14.505 in archivio).
--   CANTIERE    la merce NON passa dal magazzino: scende dal camion e viene
--               posata. In giacenza non deve entrare mai, altrimenti il
--               magazzino risulta pieno di roba che è già murata.
--
-- IL PUNTO È NON CONTARLA DUE VOLTE. Il costo di un acquisto può arrivare in
-- commessa da due strade, e una sola deve essere aperta per volta. La regola
-- esiste già in produzione, dentro `campo_acquisto_verifica`, e dice:
--
--     «Collegata all'ordine d'acquisto: il costo è già lì.»
--
-- cioè: se c'è un ODA, il costo del materiale è il `company_costs` dell'ODA
-- (ed è anche il motivo per cui esiste la vista `v_articoli_gia_a_costo`); se
-- l'ODA non c'è, il costo nasce dalla bolla, UNA volta sola. Qui quella regola
-- smette di essere un commento in una funzione e diventa un vincolo:
--
--   1. `destinazione = 'cantiere'` esige una commessa: «in cantiere» senza
--      dire quale non vuol dire niente.
--   2. Una bolla con ODA non porta mai un costo suo (`company_cost_id` nullo):
--      il costo è sull'ordine.
--   3. Una bolla destinata al cantiere non si carica mai a magazzino
--      (`caricata_a_magazzino_at` nullo): la merce lì non è passata.
--
-- Tre vincoli, non tre convenzioni: un domani un'altra pagina, un import o
-- Silvio non possono dimenticarseli.
--
-- `company_cost_id` e `caricata_a_magazzino_at` sono anche le due prove che
-- l'operazione è già stata fatta: è così che «registra il costo» e «carica a
-- magazzino» restano azioni che si possono premere due volte senza
-- raddoppiare niente.
--
-- Le 232 bolle che c'erano passavano tutte da un ODA e dal magazzino: restano
-- 'magazzino', e dove hanno delle ricezioni si segna quando sono state caricate.
--
-- Idempotente.
-- ════════════════════════════════════════════════════════════════════════════

set local lock_timeout = '3s';
set local statement_timeout = '60s';

-- ── 1. Dove va la merce ─────────────────────────────────────────────────────

alter table public.ddt_ricezione
  add column if not exists destinazione text not null default 'magazzino';

do $$
begin
  if not exists (
    select 1 from pg_constraint
     where conrelid = 'public.ddt_ricezione'::regclass
       and conname = 'ddt_ricezione_destinazione_valida'
  ) then
    alter table public.ddt_ricezione
      add constraint ddt_ricezione_destinazione_valida
      check (destinazione in ('magazzino', 'cantiere'));
  end if;
end $$;

comment on column public.ddt_ricezione.destinazione is
  '"magazzino" = la merce entra in giacenza e uscirà con uno scarico su commessa. "cantiere" = scende dal camion e si posa: in giacenza non entra mai.';

-- ── 2. Le due prove, e i tre vincoli ────────────────────────────────────────

alter table public.ddt_ricezione
  add column if not exists company_cost_id uuid references public.company_costs(id) on delete set null;
alter table public.ddt_ricezione
  add column if not exists caricata_a_magazzino_at timestamptz;

comment on column public.ddt_ricezione.company_cost_id is
  'Il costo nato DA QUESTA BOLLA, quando non c''è un ordine d''acquisto. Con l''ODA resta NULL: il costo è sull''ordine, e contarlo anche qui lo raddoppierebbe. È anche la prova che il costo è già stato registrato.';
comment on column public.ddt_ricezione.caricata_a_magazzino_at is
  'Quando la merce di questa bolla è entrata in giacenza. NULL = non ancora (o destinata al cantiere, dove non ci entra mai). È la prova che il carico è già stato fatto.';

-- Le bolle vecchie: tutte da ODA, tutte passate dal magazzino.
update public.ddt_ricezione d
   set caricata_a_magazzino_at = g.primo
  from (
    select ddt_ricezione_id, min(created_at) as primo
      from public.goods_receipts
     where ddt_ricezione_id is not null
     group by ddt_ricezione_id
  ) g
 where g.ddt_ricezione_id = d.id
   and d.caricata_a_magazzino_at is null;

do $$
begin
  -- 1. «In cantiere» senza dire quale non vuol dire niente.
  if not exists (
    select 1 from pg_constraint
     where conrelid = 'public.ddt_ricezione'::regclass
       and conname = 'ddt_ricezione_cantiere_ha_commessa'
  ) then
    alter table public.ddt_ricezione
      add constraint ddt_ricezione_cantiere_ha_commessa
      check (destinazione <> 'cantiere' or order_id is not null);
  end if;

  -- 2. Con l'ODA il costo è sull'ordine: la bolla non ne porta un altro.
  if not exists (
    select 1 from pg_constraint
     where conrelid = 'public.ddt_ricezione'::regclass
       and conname = 'ddt_ricezione_costo_una_volta_sola'
  ) then
    alter table public.ddt_ricezione
      add constraint ddt_ricezione_costo_una_volta_sola
      check (purchase_order_id is null or company_cost_id is null);
  end if;

  -- 3. La merce posata in cantiere non è mai entrata in giacenza.
  if not exists (
    select 1 from pg_constraint
     where conrelid = 'public.ddt_ricezione'::regclass
       and conname = 'ddt_ricezione_cantiere_non_carica_magazzino'
  ) then
    alter table public.ddt_ricezione
      add constraint ddt_ricezione_cantiere_non_carica_magazzino
      check (destinazione <> 'cantiere' or caricata_a_magazzino_at is null);
  end if;
end $$;

-- Un costo non si aggancia a due bolle diverse.
create unique index if not exists ddt_ricezione_un_costo_una_bolla
  on public.ddt_ricezione(company_cost_id) where company_cost_id is not null;

-- La coda di lavoro: bolle arrivate in cantiere di cui il costo non è ancora
-- registrato. Oggi non la guarda nessuna pagina; la Fase 5 parte da qui.
create index if not exists ddt_ricezione_costo_da_registrare_idx
  on public.ddt_ricezione(company_id, data_ricezione desc)
  where purchase_order_id is null and company_cost_id is null;
