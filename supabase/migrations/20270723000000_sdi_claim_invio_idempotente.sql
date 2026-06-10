-- ============================================================================
-- Fix P1 fatturazione elettronica / SDI — idempotenza invio (anti doppio invio)
--
-- Bug #1 (doppio invio): la Edge Function `invia-sdi` leggeva lo stato e lo
-- scriveva solo a fine flusso. Due chiamate concorrenti (doppio click, retry,
-- due tab) superavano entrambe il check e facevano DUE POST allo SDI con due
-- ProgressivoInvio diversi = doppia trasmissione fiscale.
--
-- Soluzione: nuovo stato transitorio 'in_invio' + RPC `claim_documento_per_invio`
-- che esegue un claim ATOMICO (SELECT ... FOR UPDATE) portando il documento da
-- uno stato inviabile a 'in_invio'. Solo il claim vincente procede alla POST;
-- in caso di errore la Edge Function ripristina lo stato precedente.
-- ============================================================================

-- 1. Consenti il nuovo stato transitorio 'in_invio' nella CHECK constraint.
ALTER TABLE public.documenti_fiscali
  DROP CONSTRAINT IF EXISTS documenti_fiscali_stato_check;

ALTER TABLE public.documenti_fiscali
  ADD CONSTRAINT documenti_fiscali_stato_check CHECK (stato IN (
    'bozza','emessa','in_invio','inviata_sdi','consegnata','accettata',
    'rifiutata','scaduta','pagata','parzialmente_pagata','stornata','annullata'
  ));

-- 2. Claim atomico per l'invio a SDI.
--    Ritorna una riga (claimed, previous_stato, current_stato):
--      claimed=true  → il chiamante ha ottenuto il claim, può procedere all'invio
--                      (previous_stato = lo stato da ripristinare in caso di errore)
--      claimed=false → claim negato (documento inesistente, già 'in_invio', oppure
--                      in uno stato non inviabile: inviata_sdi/consegnata/accettata/...)
--
--    Stati inviabili: 'emessa' (primo invio) e 'rifiutata'/'scartata' (reinvio
--    dopo scarto SDI — bug #2). Il SELECT ... FOR UPDATE serializza le richieste
--    concorrenti sullo stesso documento: ne passa una sola.
CREATE OR REPLACE FUNCTION public.claim_documento_per_invio(p_documento_id uuid)
RETURNS TABLE(claimed boolean, previous_stato text, current_stato text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_stato text;
BEGIN
  -- Row lock: due chiamate concorrenti si serializzano qui; la seconda rilegge
  -- lo stato aggiornato ('in_invio') dopo il commit della prima.
  SELECT d.stato INTO v_stato
    FROM public.documenti_fiscali d
   WHERE d.id = p_documento_id
     AND d.deleted_at IS NULL
   FOR UPDATE;

  IF NOT FOUND THEN
    RETURN QUERY SELECT false, NULL::text, NULL::text;
    RETURN;
  END IF;

  IF v_stato IN ('emessa', 'rifiutata', 'scartata') THEN
    UPDATE public.documenti_fiscali
       SET stato = 'in_invio',
           updated_at = now()
     WHERE id = p_documento_id;
    RETURN QUERY SELECT true, v_stato, 'in_invio'::text;
  ELSE
    -- Già 'in_invio' (claim concorrente in corso) o stato non inviabile.
    RETURN QUERY SELECT false, v_stato, v_stato;
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.claim_documento_per_invio(uuid) TO authenticated, service_role;

COMMENT ON FUNCTION public.claim_documento_per_invio(uuid) IS
  'Claim atomico (FOR UPDATE) per l''invio a SDI: porta il documento da uno stato '
  'inviabile (emessa/rifiutata/scartata) a in_invio. Impedisce il doppio invio '
  'fiscale di chiamate concorrenti a invia-sdi.';

-- 3. Prima nota: NON ricreare la registrazione quando si RIPRISTINA lo stato da
--    'in_invio' a 'emessa' dopo un invio fallito. Senza questa guardia il
--    ripristino (in_invio → emessa) ri-attiverebbe il trigger (OLD.stato è
--    DISTINCT da 'emessa') generando una prima nota DUPLICATA, perché non esiste
--    un vincolo univoco su prima_nota_entries che la `ON CONFLICT DO NOTHING`
--    possa intercettare. La prima nota è già stata creata all'emissione iniziale
--    (bozza → emessa), quindi un ritorno da 'in_invio' non deve ricrearla.
CREATE OR REPLACE FUNCTION public.auto_prima_nota_fattura_emessa()
RETURNS TRIGGER AS $$
BEGIN
  -- Only fire when stato changes TO 'emessa' from a non-emessa state,
  -- escludendo il ripristino dallo stato transitorio 'in_invio'.
  IF NEW.stato = 'emessa'
     AND (OLD.stato IS DISTINCT FROM 'emessa')
     AND (OLD.stato IS DISTINCT FROM 'in_invio')
     AND NEW.tipo IN ('fattura', 'fattura_pa', 'fattura_accompagnatoria', 'autofattura')
  THEN
    INSERT INTO public.prima_nota_entries (
      company_id, direction, category, description, amount,
      entry_date, invoice_id, is_auto, auto_source, account_label
    ) VALUES (
      NEW.company_id,
      'entrata',
      'incasso',
      'Fattura n. ' || NEW.numero || ' emessa',
      NEW.totale_da_pagare,
      NEW.data_emissione,
      NEW.id,
      true,
      'fattura_emessa',
      'crediti_clienti'
    )
    ON CONFLICT DO NOTHING;
  END IF;

  -- Nota di credito emessa → storno (stessa guardia su 'in_invio')
  IF NEW.stato = 'emessa'
     AND (OLD.stato IS DISTINCT FROM 'emessa')
     AND (OLD.stato IS DISTINCT FROM 'in_invio')
     AND NEW.tipo = 'nota_credito'
  THEN
    INSERT INTO public.prima_nota_entries (
      company_id, direction, category, description, amount,
      entry_date, invoice_id, is_auto, auto_source, account_label
    ) VALUES (
      NEW.company_id,
      'uscita',
      'incasso',
      'Nota di credito n. ' || NEW.numero || ' — storno',
      NEW.totale_da_pagare,
      NEW.data_emissione,
      NEW.id,
      true,
      'nota_credito',
      'crediti_clienti'
    )
    ON CONFLICT DO NOTHING;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

ALTER FUNCTION public.auto_prima_nota_fattura_emessa() SET search_path = public;
