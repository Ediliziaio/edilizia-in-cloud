-- ════════════════════════════════════════════════════════════════════════════
-- La commessa dedotta dall'ordine non si rifiuta: è un fatto, non una scelta
-- ════════════════════════════════════════════════════════════════════════════
-- Seconda correzione di un guasto introdotto oggi, 29/10/2026, dalla fase 1 di
-- docs/piano-ddt-bolle-fatture.md. Trovato provando il flusso della conferma
-- dei carichi, non da un errore in produzione.
--
-- `ddt_deduce_commessa_e_fornitore` fa due cose: riempie commessa e fornitore
-- dall'ordine d'acquisto quando non sono scritti, e controlla che non vengano
-- da un'altra azienda. In più rifiuta, in INSERT, una commessa cancellata:
--
--     «Una bolla NUOVA non si attacca a un cantiere cancellato»
--
-- L'intenzione era giusta — impedire a una persona di agganciare una bolla
-- nuova a un cantiere archiviato — ma la regola colpiva anche la commessa che
-- NESSUNO ha scelto: quella che il trigger stesso deduce dall'ordine. E lì non
-- è una scelta, è un fatto: se l'ordine appartiene a quel cantiere, la merce di
-- quell'ordine appartiene a quel cantiere, archiviato o no.
--
-- Conseguenza misurata: ogni arrivo registrato su un ODA di una commessa
-- archiviata veniva rifiutato con «La commessa e' stata cancellata». Sulla Demo
-- 2, 45 bolle su 232 (il 19%) hanno l'ODA su una commessa cancellata: lì la
-- conferma di un carico da posta o da WhatsApp sarebbe morta. Non era un
-- doppione né un dato sbagliato: era lavoro vero che non passava.
--
-- La regola resta, ma solo su quello che è davvero una scelta: la commessa
-- scritta da chi inserisce. Quella dedotta dall'ordine passa sempre.
--
-- Idempotente. Nessuna riga toccata.
-- ════════════════════════════════════════════════════════════════════════════

set local lock_timeout = '3s';
set local statement_timeout = '60s';

create or replace function public.ddt_deduce_commessa_e_fornitore()
returns trigger language plpgsql security definer set search_path = '' as $fn$
declare
  v_po_company uuid;
  v_po_order uuid;
  v_po_supplier uuid;
  v_company uuid;
  v_viva boolean;
  -- La commessa l'ha scelta una persona, o l'ha dedotta il trigger dall'ordine?
  -- Solo nel primo caso un cantiere cancellato è un errore da fermare.
  v_commessa_scelta boolean := new.order_id is not null;
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
    -- Una bolla NUOVA non si attacca a un cantiere cancellato SCELTO da una
    -- persona. Se la commessa arriva dall'ordine d'acquisto non è una scelta,
    -- è un fatto: la merce di quell'ordine va su quel cantiere, archiviato o
    -- no — e rifiutarla fermava gli arrivi sui lavori chiusi.
    if tg_op = 'INSERT' and v_commessa_scelta and not v_viva then
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
