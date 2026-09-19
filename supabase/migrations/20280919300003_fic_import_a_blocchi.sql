-- Import da Fatture in Cloud a blocchi, e scadenze giuste per le fatture importate.
--
-- 1. billing-import scaricava tutto lo storico FIC in una volta: con Best Infissi
--    (2.079 fatture, 124 note di credito, 6.980 ricevute) andava oltre i limiti
--    (546) due volte al giorno dal 09/09 e salvava solo un pezzo, senza mai
--    aggiornare lo stato. Ora lavora a giri con un cursore
--    (billing_integrations.import_stato, vedi _shared/importFicStato.ts) e un
--    solo import alla volta per integrazione (import_in_corso_da).
--    billing_import_riprendi() prosegue ogni 2 minuti i giri rimasti a metà; i
--    giri nuovi li avviano solo il cron di mattina e pomeriggio e il pulsante.
--
-- 2. auto_create_scadenza_from_invoice creava la scadenza sempre «da pagare»:
--    le fatture importate già incassate su FIC finivano nello scadenzario come
--    incassi da ricevere (983 su Best Infissi, dal 2024). E se la scadenza era
--    già pagata, un cambio di stato della fattura ne creava una seconda. Ora:
--    per le fatture importate la scadenza nasce e segue lo stato del gestionale
--    esterno; per tutte, niente doppioni.

SET lock_timeout = '3s';
SET statement_timeout = '60s';

-- ── 1. Stato dell'import a blocchi ─────────────────────────────────────────
ALTER TABLE public.billing_integrations
  ADD COLUMN IF NOT EXISTS import_stato jsonb,
  ADD COLUMN IF NOT EXISTS import_in_corso_da timestamptz;

COMMENT ON COLUMN public.billing_integrations.import_stato IS
  'Solo fattureincloud: giro di import in corso o ultimo finito (cursore per flusso, avanzamento, base del prossimo aggiornamento). Formato in supabase/functions/_shared/importFicStato.ts.';
COMMENT ON COLUMN public.billing_integrations.import_in_corso_da IS
  'Un import alla volta: valorizzato da billing-import quando parte, azzerato quando finisce. Oltre 4 minuti si considera morto.';

CREATE OR REPLACE FUNCTION public.billing_import_riprendi()
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  r record;
  n integer := 0;
  v_chiave text := (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'silvio_internal_cron_secret');
BEGIN
  IF v_chiave IS NULL THEN RETURN 0; END IF;
  FOR r IN
    SELECT company_id, provider
      FROM public.billing_integrations
     WHERE is_active = true
       AND coalesce(auto_sync, true) = true
       AND (import_stato ->> 'in_corso') = 'true'
       AND (import_in_corso_da IS NULL OR import_in_corso_da < now() - interval '4 minutes')
       AND ((import_stato ->> 'sospeso_fino_a') IS NULL OR (import_stato ->> 'sospeso_fino_a')::timestamptz < now())
  LOOP
    PERFORM net.http_post(
      url := 'https://rsbrguhkodgnqfomrevo.supabase.co/functions/v1/billing-import',
      headers := jsonb_build_object('Content-Type', 'application/json', 'x-cron-secret', v_chiave),
      body := jsonb_build_object('company_id', r.company_id, 'provider', r.provider, 'source', 'pg_cron_recupero'),
      timeout_milliseconds := 150000
    );
    n := n + 1;
  END LOOP;
  RETURN n;
END
$function$;

REVOKE ALL ON FUNCTION public.billing_import_riprendi() FROM PUBLIC, anon, authenticated;

SELECT cron.unschedule(jobid) FROM cron.job WHERE jobname = 'billing-import-recupero';
SELECT cron.schedule('billing-import-recupero', '*/2 * * * *', $cron$ select public.billing_import_riprendi(); $cron$);

-- ── 2. Scadenze delle fatture ──────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.auto_create_scadenza_from_invoice()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_tipo TEXT;
  v_description TEXT;
  v_importata boolean := NEW.external_provider IS NOT NULL;
  v_pagata boolean;
  v_stato text;
BEGIN
  IF NEW.due_date IS NULL OR COALESCE(NEW.total, 0) <= 0 THEN
    RETURN NEW;
  END IF;

  -- Per le fatture importate lo stato del pagamento arriva dal gestionale
  -- esterno (FIC, Aruba…): la scadenza lo segue. Le native passano dagli
  -- incassi registrati in app, come prima.
  v_pagata := v_importata AND (NEW.status = 'paid' OR COALESCE(NEW.paid_amount, 0) >= COALESCE(NEW.total, 0) - 0.01);
  v_stato := CASE
    WHEN v_pagata THEN 'pagata'
    WHEN v_importata AND COALESCE(NEW.paid_amount, 0) > 0 THEN 'parziale'
    ELSE 'da_pagare'
  END;

  -- Una scadenza per fattura. Prima si guardavano solo quelle aperte: con la
  -- scadenza già pagata, un cambio di stato della fattura ne creava una nuova.
  IF EXISTS (SELECT 1 FROM scadenze WHERE invoice_id = NEW.id) THEN
    IF TG_OP = 'UPDATE' THEN
      IF OLD.total IS DISTINCT FROM NEW.total OR OLD.due_date IS DISTINCT FROM NEW.due_date THEN
        UPDATE scadenze SET
          amount = COALESCE(NEW.total, 0),
          due_date = NEW.due_date,
          description = CASE
            WHEN NEW.document_type IN ('nota_credito', 'credit_note') THEN 'Nota credito ' || COALESCE(NEW.invoice_number, '')
            ELSE 'Fattura ' || COALESCE(NEW.invoice_number, '') || ' - ' || COALESCE(NEW.client_company_name, '')
          END,
          updated_at = now()
        WHERE invoice_id = NEW.id AND status IN ('da_pagare', 'parziale');
      END IF;
      IF v_importata AND v_stato <> 'da_pagare' THEN
        UPDATE scadenze SET
          status = v_stato,
          paid_amount = CASE WHEN v_pagata THEN amount ELSE LEAST(COALESCE(NEW.paid_amount, 0), amount) END,
          updated_at = now()
        WHERE invoice_id = NEW.id
          AND auto_source = 'invoice'
          AND status IN ('da_pagare', 'parziale')
          AND status IS DISTINCT FROM v_stato;
      END IF;
    END IF;
    RETURN NEW;
  END IF;

  IF NEW.document_type IN ('fattura', 'fattura_accompagnatoria', 'parcella', 'invoice') THEN
    v_tipo := 'incasso_cliente';
    v_description := 'Fattura ' || COALESCE(NEW.invoice_number, '') || ' - ' || COALESCE(NEW.client_company_name, '');
  ELSIF NEW.document_type IN ('nota_credito', 'credit_note') THEN
    v_tipo := 'pagamento_fornitore';
    v_description := 'Nota credito ' || COALESCE(NEW.invoice_number, '') || ' - ' || COALESCE(NEW.client_company_name, '');
  ELSE
    RETURN NEW;
  END IF;

  -- NB: NON inserire "direction": è una colonna GENERATED ALWAYS (calcolata da tipo).
  INSERT INTO scadenze (
    company_id, tipo, description, amount, due_date,
    invoice_id, order_id, status, paid_amount, is_auto_generated, auto_source,
    alert_days_before, created_by
  ) VALUES (
    NEW.company_id, v_tipo, v_description,
    COALESCE(NEW.total, 0), NEW.due_date,
    NEW.id, NEW.order_id, v_stato,
    CASE WHEN v_pagata THEN COALESCE(NEW.total, 0) WHEN v_stato = 'parziale' THEN NEW.paid_amount ELSE 0 END,
    true, 'invoice',
    7, NEW.created_by
  );

  RETURN NEW;
END;
$function$;

REVOKE ALL ON FUNCTION public.auto_create_scadenza_from_invoice() FROM PUBLIC, anon, authenticated;

-- ── 3. Scadenze già create «da pagare» per fatture importate già incassate ──
-- 983 su Best Infissi al 19/09/2026; una UPDATE sola, limitata alle scadenze
-- generate da fatture importate.
UPDATE scadenze s SET
  status = 'pagata',
  paid_amount = s.amount,
  updated_at = now()
FROM invoices i
WHERE i.id = s.invoice_id
  AND i.external_provider IS NOT NULL
  AND i.status = 'paid'
  AND s.auto_source = 'invoice'
  AND s.status IN ('da_pagare', 'parziale');

-- ── 4. Doppioni lasciati dal vecchio trigger ─────────────────────────────────
-- Una fattura con la scadenza già pagata, a ogni cambio di stato, ne riceveva
-- un'altra: 11 fatture su Best Infissi e 1 su Demo Azienda al 19/09/2026. Si
-- tiene quella che corrisponde alla fattura com'è adesso (importo e stato
-- pagato/non pagato), a parità la più vecchia; le altre si annullano con una
-- nota, senza cancellarle. Solo scadenze automatiche e non registrate in prima nota.
WITH candidate AS (
  SELECT s.id,
         row_number() OVER (
           PARTITION BY s.invoice_id
           ORDER BY (s.amount = i.total) DESC,
                    ((s.status = 'pagata') = (i.status = 'paid')) DESC,
                    s.created_at ASC
         ) AS posto
    FROM scadenze s
    JOIN invoices i ON i.id = s.invoice_id
   WHERE s.auto_source = 'invoice'
     AND s.is_auto_generated = true
     AND s.prima_nota_entry_id IS NULL
     AND s.status <> 'annullata'
     AND s.invoice_id IN (
       SELECT invoice_id FROM scadenze
        WHERE invoice_id IS NOT NULL AND status <> 'annullata'
        GROUP BY invoice_id HAVING count(*) > 1
     )
)
UPDATE scadenze s SET
  status = 'annullata',
  notes = concat_ws(' · ', nullif(s.notes, ''), 'Doppione creato dal vecchio trigger delle scadenze, annullato il 19/09/2026'),
  updated_at = now()
FROM candidate c
WHERE c.id = s.id AND c.posto > 1;
