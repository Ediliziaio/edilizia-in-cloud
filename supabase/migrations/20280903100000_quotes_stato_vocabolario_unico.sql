-- Stati preventivo: un solo vocabolario.
--
-- Il flusso applicativo (invio, firma FEA, accettazione dal link, conversione
-- in cantiere, cron di scadenza, reminder, pagina dettaglio, hub firma) usa il
-- FEMMINILE: bozza | inviata | accettata | rifiutata | scaduta | convertita |
-- annullata. Seed demo, Silvio, builder automazioni ed emitter dei trigger
-- scrivevano o leggevano il MASCHILE (inviato / accettato / visto / firmato).
-- In produzione il 2026-09-02 TUTTI i 50 preventivi erano al maschile: il
-- bottone "Converti in Cantiere" non compariva mai, il cron non marcava gli
-- scaduti, il reminder non trovava nulla, le automazioni non scattavano.
--
-- Qui:
-- 1) funzione di normalizzazione (maschile, inglese e varianti → canonico);
-- 2) dati riallineati con i trigger utente spenti, così sul riallineamento
--    dei demo non partono automazioni, notifiche WhatsApp o attività CRM;
-- 3) trigger BEFORE che normalizza ogni scrittura futura ("visto" diventa
--    inviata + viewed_at, "firmato" diventa accettata + signed_at);
-- 4) CHECK sul vocabolario canonico;
-- 5) le funzioni SQL che elencavano solo il maschile accettano anche il
--    femminile (estensione testuale delle liste IN, idempotente);
-- 6) le automazioni salvate con condizioni al maschile vengono riallineate.
-- Idempotente.

-- ── 1) Normalizzazione ──
CREATE OR REPLACE FUNCTION public.normalizza_stato_preventivo(p_stato text)
RETURNS text
LANGUAGE sql
IMMUTABLE
STRICT
AS $$
  SELECT CASE lower(btrim(p_stato))
    WHEN 'bozza' THEN 'bozza'
    WHEN 'draft' THEN 'bozza'
    WHEN 'inviata' THEN 'inviata'
    WHEN 'inviato' THEN 'inviata'
    WHEN 'sent' THEN 'inviata'
    WHEN 'sent_to_client' THEN 'inviata'
    WHEN 'pending' THEN 'inviata'
    WHEN 'aperto' THEN 'inviata'
    WHEN 'aperta' THEN 'inviata'
    WHEN 'visto' THEN 'inviata'
    WHEN 'vista' THEN 'inviata'
    WHEN 'viewed' THEN 'inviata'
    WHEN 'visualizzata' THEN 'inviata'
    WHEN 'visualizzato' THEN 'inviata'
    WHEN 'accettata' THEN 'accettata'
    WHEN 'accettato' THEN 'accettata'
    WHEN 'accepted' THEN 'accettata'
    WHEN 'firmata' THEN 'accettata'
    WHEN 'firmato' THEN 'accettata'
    WHEN 'signed' THEN 'accettata'
    WHEN 'approvata' THEN 'accettata'
    WHEN 'approvato' THEN 'accettata'
    WHEN 'approved' THEN 'accettata'
    WHEN 'vinta' THEN 'accettata'
    WHEN 'vinto' THEN 'accettata'
    WHEN 'won' THEN 'accettata'
    WHEN 'rifiutata' THEN 'rifiutata'
    WHEN 'rifiutato' THEN 'rifiutata'
    WHEN 'rejected' THEN 'rifiutata'
    WHEN 'refused' THEN 'rifiutata'
    WHEN 'declined' THEN 'rifiutata'
    WHEN 'persa' THEN 'rifiutata'
    WHEN 'perso' THEN 'rifiutata'
    WHEN 'lost' THEN 'rifiutata'
    WHEN 'scaduta' THEN 'scaduta'
    WHEN 'scaduto' THEN 'scaduta'
    WHEN 'expired' THEN 'scaduta'
    WHEN 'convertita' THEN 'convertita'
    WHEN 'convertito' THEN 'convertita'
    WHEN 'converted' THEN 'convertita'
    WHEN 'annullata' THEN 'annullata'
    WHEN 'annullato' THEN 'annullata'
    WHEN 'cancelled' THEN 'annullata'
    WHEN 'canceled' THEN 'annullata'
    ELSE lower(btrim(p_stato))
  END;
$$;

-- ── 2) Riallineamento dei dati esistenti, a trigger utente spenti ──
ALTER TABLE public.quotes DISABLE TRIGGER USER;

UPDATE public.quotes
   SET viewed_at = coalesce(viewed_at, updated_at, created_at)
 WHERE lower(coalesce(status, '')) IN ('visto', 'vista', 'viewed', 'visualizzata', 'visualizzato');

UPDATE public.quotes
   SET signed_at = coalesce(signed_at, updated_at, created_at)
 WHERE lower(coalesce(status, '')) IN ('firmato', 'firmata', 'signed');

UPDATE public.quotes
   SET status = public.normalizza_stato_preventivo(status)
 WHERE status IS NOT NULL
   AND status IS DISTINCT FROM public.normalizza_stato_preventivo(status);

ALTER TABLE public.quotes ENABLE TRIGGER USER;

-- ── 3) Ogni scrittura futura passa dalla normalizzazione ──
-- Nome con prefisso "aa_" perché i trigger BEFORE girano in ordine alfabetico:
-- deve precedere set_quote_expires_at, che ragiona sullo stato già canonico.
CREATE OR REPLACE FUNCTION public.tg_quotes_normalizza_stato()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_raw text := lower(btrim(coalesce(NEW.status, '')));
BEGIN
  IF NEW.status IS NULL THEN RETURN NEW; END IF;
  IF v_raw IN ('visto', 'vista', 'viewed', 'visualizzata', 'visualizzato') AND NEW.viewed_at IS NULL THEN
    NEW.viewed_at := now();
  END IF;
  IF v_raw IN ('firmato', 'firmata', 'signed') AND NEW.signed_at IS NULL THEN
    NEW.signed_at := now();
  END IF;
  NEW.status := public.normalizza_stato_preventivo(NEW.status);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS aa_quotes_normalizza_stato ON public.quotes;
CREATE TRIGGER aa_quotes_normalizza_stato
  BEFORE INSERT OR UPDATE OF status ON public.quotes
  FOR EACH ROW
  EXECUTE FUNCTION public.tg_quotes_normalizza_stato();

-- ── 4) Vocabolario chiuso ──
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.quotes'::regclass AND conname = 'quotes_status_vocabolario'
  ) THEN
    ALTER TABLE public.quotes
      ADD CONSTRAINT quotes_status_vocabolario
      CHECK (status IS NULL OR status IN ('bozza', 'inviata', 'accettata', 'rifiutata', 'scaduta', 'convertita', 'annullata'));
  END IF;
END $$;

-- ── 5) Funzioni SQL che elencavano solo il maschile ──
-- Tutte le occorrenze sono liste IN (...): si aggiunge la forma femminile
-- accanto a quella maschile. Ricreare la funzione dal suo sorgente conserva
-- SECURITY DEFINER, search_path e firma.
DO $$
DECLARE
  r record;
  v_src text;
  v_new text;
BEGIN
  FOR r IN
    SELECT p.oid, p.proname
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname IN ('fire_quote_automation', 'fn_enqueue_preventivo_inviato',
                        'silvio_detect_alerts', 'silvio_tool_company_kpi', 'silvio_tool_quotes_summary')
  LOOP
    v_src := pg_get_functiondef(r.oid);
    v_new := v_src;
    IF position('''inviata''' IN v_new) = 0 THEN
      v_new := replace(v_new, '''inviato''', '''inviato'', ''inviata''');
    END IF;
    IF position('''accettata''' IN v_new) = 0 THEN
      v_new := replace(v_new, '''accettato''', '''accettato'', ''accettata''');
    END IF;
    IF position('''rifiutata''' IN v_new) = 0 THEN
      v_new := replace(v_new, '''rifiutato''', '''rifiutato'', ''rifiutata''');
    END IF;
    IF position('''scaduta''' IN v_new) = 0 THEN
      v_new := replace(v_new, '''scaduto''', '''scaduto'', ''scaduta''');
    END IF;
    IF position('''firmata''' IN v_new) = 0 THEN
      v_new := replace(v_new, '''firmato''', '''firmato'', ''firmata''');
    END IF;
    IF v_new <> v_src THEN
      EXECUTE v_new;
      RAISE NOTICE 'stati preventivo: estesa al femminile %', r.proname;
    END IF;
  END LOOP;
END $$;
