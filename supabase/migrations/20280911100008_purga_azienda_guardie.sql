-- Il job `purge-aziende-cancellate-30gg` (03:50 UTC) non e' mai riuscito ad
-- arrivare in fondo: `DELETE FROM companies` si fermava, e siccome il ciclo di
-- `purge_deleted_companies()` non e' tollerante per-azienda, la prima che si
-- inceppa blocca anche tutte le altre.
--
-- Procedendo a cicli — prova la purga di un'azienda vera, leggi il primo
-- errore, correggi, ripeti — sono venuti fuori otto ostacoli in fila, di
-- cinque nature diverse. Le prime due si curano qui; le altre nelle tre
-- migrazioni successive (…009 fea_audit, …010 FK di possesso, …011 RESTRICT).
--
--   1. GUARDIE CHE NON DISTINGUONO L'UTENTE DALLA PURGA. `order_statuses`,
--      `documenti_fiscali` e `silvio_audit` hanno trigger nati per impedire a
--      una PERSONA di cancellare qualcosa di prezioso ("stato usato in ordini
--      attivi", "la conservazione e' obbligatoria", "append-only"). Dentro il
--      cascade dell'azienda quella protezione non ha piu' oggetto — non c'e'
--      piu' nessun ordine attivo, non c'e' piu' l'azienda — ma il trigger non
--      lo sa e blocca lo stesso.
--
--   2. TRIGGER CHE SCRIVONO MENTRE L'AZIENDA SPARISCE. `goods_receipts` fa lo
--      storno automatico (INSERT in `warehouse_movements`) e
--      `log_company_activity` scrive il diario (INSERT in
--      `company_activity_log`): righe NUOVE che puntano all'azienda che si sta
--      cancellando, cioe' una violazione di FK a fine istruzione.
--
-- La regola, una sola per entrambe: una guardia non scatta se l'azienda
-- proprietaria della riga non esiste piu' — cioe' se siamo dentro il suo
-- cascade. Sta nella clausola WHEN del trigger, non nel corpo delle funzioni:
-- una WHEN non ammette sottoquery ma ammette chiamate a funzione, e cosi' i
-- corpi (alcuni lunghi, e in produzione riformattati rispetto ai file) non si
-- toccano affatto.

SET LOCAL lock_timeout = '3s';
SET LOCAL statement_timeout = '60s';

-- SECURITY DEFINER di proposito: `companies` ha RLS, e una guardia che non
-- vedesse la riga si spegnerebbe da sola. Sarebbe un buco, non una comodita'.
CREATE OR REPLACE FUNCTION public.azienda_ancora_esiste(p_company_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $fn$
  SELECT p_company_id IS NULL
      OR EXISTS (SELECT 1 FROM public.companies WHERE id = p_company_id);
$fn$;

REVOKE ALL ON FUNCTION public.azienda_ancora_esiste(uuid) FROM PUBLIC, anon;
-- La WHEN di un trigger viene valutata con i privilegi di chi esegue
-- l'operazione, non del proprietario: senza questo GRANT ogni cancellazione
-- fatta da un utente morirebbe con "permission denied for function".
GRANT EXECUTE ON FUNCTION public.azienda_ancora_esiste(uuid) TO authenticated, service_role;

-- Equivalente esatto di una RULE `DO INSTEAD NOTHING`: l'operazione non
-- avviene e non viene segnalato alcun errore. Serve qui e in …009.
CREATE OR REPLACE FUNCTION public.annulla_operazione_su_riga()
RETURNS trigger LANGUAGE plpgsql
AS $fn$
BEGIN
  RETURN NULL;
END;
$fn$;

-- ── 1 · le guardie si fanno da parte dentro il cascade della loro azienda ────
DROP TRIGGER IF EXISTS check_status_before_delete ON public.order_statuses;
CREATE TRIGGER check_status_before_delete
  BEFORE DELETE ON public.order_statuses
  FOR EACH ROW WHEN (public.azienda_ancora_esiste(OLD.company_id))
  EXECUTE FUNCTION public.prevent_status_deletion_if_used();

DROP TRIGGER IF EXISTS trg_documenti_fiscali_proteggi_emessi ON public.documenti_fiscali;
CREATE TRIGGER trg_documenti_fiscali_proteggi_emessi
  BEFORE DELETE OR UPDATE ON public.documenti_fiscali
  FOR EACH ROW WHEN (public.azienda_ancora_esiste(OLD.company_id))
  EXECUTE FUNCTION public.documenti_fiscali_proteggi_emessi();

DROP TRIGGER IF EXISTS trg_silvio_audit_immutable ON public.silvio_audit;
CREATE TRIGGER trg_silvio_audit_immutable
  BEFORE DELETE OR UPDATE ON public.silvio_audit
  FOR EACH ROW WHEN (public.azienda_ancora_esiste(OLD.company_id))
  EXECUTE FUNCTION public.silvio_audit_no_mutate();

-- ── 2 · e cosi' i trigger che scrivono ──────────────────────────────────────
-- Lo storno su un magazzino che non esistera' piu' non serve a nessuno, e la
-- riga che inserirebbe violerebbe la FK verso l'azienda.
DROP TRIGGER IF EXISTS trg_auto_storno_stock_delete ON public.goods_receipts;
CREATE TRIGGER trg_auto_storno_stock_delete
  BEFORE DELETE ON public.goods_receipts
  FOR EACH ROW WHEN (public.azienda_ancora_esiste(OLD.company_id))
  EXECUTE FUNCTION public.auto_storno_stock_on_receipt_delete();

-- Non blocca la purga (inghiotte le eccezioni), ma senza guardia una purga
-- accoda una chiamata a Google Calendar per ogni appuntamento cancellato.
DROP TRIGGER IF EXISTS trg_gcal_sync_appointments ON public.appointments;
CREATE TRIGGER trg_gcal_sync_appointments
  BEFORE DELETE OR UPDATE ON public.appointments
  FOR EACH ROW WHEN (public.azienda_ancora_esiste(OLD.company_id))
  EXECUTE FUNCTION public.notify_google_calendar_sync();

DROP TRIGGER IF EXISTS trg_fv_sync_family_delete ON public.article_families;
CREATE TRIGGER trg_fv_sync_family_delete
  BEFORE DELETE ON public.article_families
  FOR EACH ROW WHEN (public.azienda_ancora_esiste(OLD.company_id))
  EXECUTE FUNCTION public.fv_trg_family_delete();

-- Il diario aziendale lo scrivono piu' funzioni diverse (`log_company_activity`
-- e la famiglia `tg_activity_on_*`), su trigger che coprono anche INSERT: li'
-- una WHEN non puo' nominare OLD. Invece di inseguire ogni scrittore — e
-- quelli che verranno — la guardia sta a DESTINAZIONE: se l'azienda non c'e'
-- piu', la riga di diario si scarta in silenzio. Il diario di quell'azienda
-- sta sparendo comunque.
DROP TRIGGER IF EXISTS trg_company_activity_log_scarta_purgate ON public.company_activity_log;
CREATE TRIGGER trg_company_activity_log_scarta_purgate
  BEFORE INSERT ON public.company_activity_log
  FOR EACH ROW WHEN (NOT public.azienda_ancora_esiste(NEW.company_id))
  EXECUTE FUNCTION public.annulla_operazione_su_riga();
