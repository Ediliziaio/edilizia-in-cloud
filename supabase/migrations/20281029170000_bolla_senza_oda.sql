-- ════════════════════════════════════════════════════════════════════════════
-- La bolla si carica sempre: l'ordine d'acquisto diventa facoltativo
-- ════════════════════════════════════════════════════════════════════════════
-- Fase 1 del piano in docs/piano-ddt-bolle-fatture.md.
--
-- Finora `ddt_ricezione.purchase_order_id` era NOT NULL, e la maschera diceva
-- «Nessun ODA disponibile. Crea prima un Ordine d'Acquisto». In cantiere la
-- merce arriva anche senza ODA: il muratore fotografa la bolla del fornitore e
-- non ha nessun ordine da selezionare. Risultato: la bolla non si caricava
-- proprio, ne' dal campo ne' dall'ufficio.
--
-- Da qui una bolla puo' nascere in tre modi:
--   da ODA        come prima: commessa e fornitore si deducono dall'ordine;
--   da commessa   l'ufficio sa su quale cantiere va la merce, l'ODA non c'e';
--   da sola       la foto e il fornitore, e basta: si aggancia dopo.
--
-- Perche' `order_id` e `supplier_id` in chiaro sulla bolla e non solo
-- attraverso l'ODA: senza di loro una bolla senza ordine non sa su che cantiere
-- sta, e tutto il resto del piano (la fattura di fine mese ripartita per
-- cantiere, i pagamenti per commessa) non ha su cosa appoggiarsi.
--
-- IL COLLEGAMENTO LO DEDUCE IL DATABASE. Il trigger riempie commessa e
-- fornitore dall'ODA quando non sono scritti, e rifiuta una commessa o un
-- fornitore di un'altra azienda: il browser non e' l'unico guardiano.
--
-- La bonifica delle 232 bolle esistenti e' un UPDATE su una tabella piccola,
-- comunque sotto lock_timeout: se si blocca, fallisce invece di fermare la
-- produzione. `registra_azione_utente` non scrive nulla (auth.uid() e' null
-- dentro una migrazione), quindi il registro delle azioni non si riempie di
-- 232 righe che non ha fatto nessuno.
--
-- Idempotente.
-- ════════════════════════════════════════════════════════════════════════════

set local lock_timeout = '3s';
set local statement_timeout = '60s';

-- ── 1. L'ODA diventa facoltativo ────────────────────────────────────────────

alter table public.ddt_ricezione alter column purchase_order_id drop not null;

comment on column public.ddt_ricezione.purchase_order_id is
  'L''ordine d''acquisto, se c''e''. NULL per le bolle nate da commessa (ufficio) o dalla sola foto (cantiere).';

-- ── 2. Commessa e fornitore in chiaro sulla bolla ───────────────────────────

alter table public.ddt_ricezione
  add column if not exists order_id uuid references public.orders(id) on delete set null;
alter table public.ddt_ricezione
  add column if not exists supplier_id uuid references public.suppliers(id) on delete set null;

comment on column public.ddt_ricezione.order_id is
  'La commessa su cui va la merce. Dedotta dall''ODA quando c''e'', scelta a mano quando l''ODA non c''e''.';
comment on column public.ddt_ricezione.supplier_id is
  'Chi ha consegnato. Dedotto dall''ODA quando c''e''; sulla bolla da foto lo si sceglie (o lo propone la lettura AI).';

create index if not exists ddt_ricezione_order_idx
  on public.ddt_ricezione(company_id, order_id) where order_id is not null;
create index if not exists ddt_ricezione_supplier_idx
  on public.ddt_ricezione(company_id, supplier_id) where supplier_id is not null;
-- Le bolle ancora da agganciare a un ordine: la coda di lavoro dell'ufficio.
create index if not exists ddt_ricezione_senza_oda_idx
  on public.ddt_ricezione(company_id, data_ricezione desc) where purchase_order_id is null;

-- ── 3. Il collegamento lo deduce il database ────────────────────────────────

create or replace function public.ddt_deduce_commessa_e_fornitore()
returns trigger language plpgsql security definer set search_path = '' as $fn$
declare
  v_po_company uuid;
  v_po_order uuid;
  v_po_supplier uuid;
  v_company uuid;
  v_viva boolean;
begin
  if new.purchase_order_id is not null then
    select po.company_id, po.order_id, po.supplier_id
      into v_po_company, v_po_order, v_po_supplier
      from public.purchase_orders po
     where po.id = new.purchase_order_id;
    if not found then
      raise exception 'Ordine d''acquisto inesistente' using errcode = '23514';
    end if;
    if v_po_company is distinct from new.company_id then
      raise exception 'L''ordine d''acquisto e'' di un''altra azienda' using errcode = '23514';
    end if;
    -- Si riempie solo il vuoto: una commessa scelta a mano resta quella che e''.
    new.order_id := coalesce(new.order_id, v_po_order);
    new.supplier_id := coalesce(new.supplier_id, v_po_supplier);
  end if;

  -- Si controlla solo quello che cambia davvero: una bolla del 2024 su una
  -- commessa poi archiviata deve restare modificabile (corriere, note, stato),
  -- altrimenti il controllo diventa un muro su dati vecchi.
  if new.order_id is not null
     and (tg_op = 'INSERT' or new.order_id is distinct from old.order_id) then
    select o.company_id, o.deleted_at is null
      into v_company, v_viva
      from public.orders o
     where o.id = new.order_id;
    if not found then
      raise exception 'Commessa inesistente' using errcode = '23514';
    end if;
    if v_company is distinct from new.company_id then
      raise exception 'La commessa e'' di un''altra azienda' using errcode = '23514';
    end if;
    -- Una bolla NUOVA non si attacca a un cantiere cancellato; il collegamento
    -- di una bolla vecchia resta, perche' la merce lassu' e' arrivata davvero.
    if tg_op = 'INSERT' and not v_viva then
      raise exception 'La commessa e'' stata cancellata' using errcode = '23514';
    end if;
  end if;

  if new.supplier_id is not null
     and (tg_op = 'INSERT' or new.supplier_id is distinct from old.supplier_id) then
    select s.company_id into v_company
      from public.suppliers s where s.id = new.supplier_id;
    if not found then
      raise exception 'Fornitore inesistente' using errcode = '23514';
    end if;
    if v_company is distinct from new.company_id then
      raise exception 'Il fornitore e'' di un''altra azienda' using errcode = '23514';
    end if;
  end if;

  return new;
end;
$fn$;
revoke all on function public.ddt_deduce_commessa_e_fornitore() from public, anon, authenticated;

drop trigger if exists trg_ddt_deduce_commessa_e_fornitore on public.ddt_ricezione;
create trigger trg_ddt_deduce_commessa_e_fornitore
  before insert or update of purchase_order_id, order_id, supplier_id, company_id
  on public.ddt_ricezione
  for each row execute function public.ddt_deduce_commessa_e_fornitore();

-- ── 4. Le bolle che c'erano prima ───────────────────────────────────────────
-- 232 righe: l'ODA ce l'hanno tutte, quindi commessa e fornitore si ricavano.

update public.ddt_ricezione d
   set order_id = coalesce(d.order_id, po.order_id),
       supplier_id = coalesce(d.supplier_id, po.supplier_id)
  from public.purchase_orders po
 where po.id = d.purchase_order_id
   and (d.order_id is null or d.supplier_id is null)
   and (po.order_id is not null or po.supplier_id is not null);

-- ── 5. Controllo ────────────────────────────────────────────────────────────
-- Se qualcosa non ha funzionato lo si sa subito, non fra tre mesi.

do $$
declare v_senza integer;
begin
  select count(*) into v_senza
    from public.ddt_ricezione d
    join public.purchase_orders po on po.id = d.purchase_order_id
   where po.order_id is not null and d.order_id is null;
  if v_senza > 0 then
    raise exception 'Bonifica incompleta: % bolle con ODA su commessa ma senza order_id', v_senza;
  end if;
end $$;
