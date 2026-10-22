-- ════════════════════════════════════════════════════════════════════════════
-- Contabilità dei lavori pubblici: storico delle modifiche del libretto e
-- fattura collegata al certificato di pagamento
-- ════════════════════════════════════════════════════════════════════════════
--   1. lp_libretto_modifiche: ogni modifica o cancellazione di una
--      registrazione del libretto lascia una riga (chi, quando, prima/dopo).
--      La scrive solo il trigger; si legge come il libretto; non si cambia.
--      Le regole del libretto restano quelle di 20281023054000: una
--      registrazione entrata in un SAL non si modifica né si cancella.
--   2. lp_certificati_pagamento.documento_fiscale_id: la fattura emessa per il
--      certificato. Il certificato resta intoccabile: si può solo collegare (o
--      cambiare) la fattura, che deve essere una fattura dell'azienda.
-- Solo schema: nessuna riga esistente viene toccata. Idempotente. Niente anon.
-- ════════════════════════════════════════════════════════════════════════════

SET LOCAL lock_timeout = '3s';
SET LOCAL statement_timeout = '60s';

-- ─── 1. Storico del libretto ───────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.lp_libretto_modifiche (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  order_id uuid NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  -- Niente chiave esterna: lo storico di una registrazione cancellata resta.
  libretto_id uuid NOT NULL,
  numero integer NOT NULL,
  operazione text NOT NULL CHECK (operazione IN ('modifica', 'eliminazione')),
  prima jsonb NOT NULL,
  dopo jsonb,
  modificato_da uuid,
  modificato_at timestamptz NOT NULL DEFAULT now()
);
COMMENT ON TABLE public.lp_libretto_modifiche IS
  'Storico del libretto delle misure: per ogni modifica o cancellazione di una registrazione, chi, quando e i valori prima e dopo. Lo scrive solo il trigger.';
CREATE INDEX IF NOT EXISTS lp_libretto_modifiche_libretto_idx ON public.lp_libretto_modifiche (libretto_id, modificato_at);
CREATE INDEX IF NOT EXISTS lp_libretto_modifiche_order_idx ON public.lp_libretto_modifiche (order_id);
CREATE INDEX IF NOT EXISTS lp_libretto_modifiche_company_idx ON public.lp_libretto_modifiche (company_id);

-- I campi che contano per chi controlla il libretto (non sal_id: entrare in un
-- SAL non è una modifica della misura).
CREATE OR REPLACE FUNCTION public.lp_libretto_traccia()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $fn$
DECLARE
  v_prima jsonb;
  v_dopo jsonb;
BEGIN
  -- Commessa in cancellazione (cascata): lo storico se ne va con lei.
  IF NOT EXISTS (SELECT 1 FROM public.orders o WHERE o.id = OLD.order_id) THEN
    RETURN NULL;
  END IF;
  v_prima := jsonb_build_object('data', OLD.data, 'voce_id', OLD.voce_id, 'quantita', OLD.quantita, 'righe', OLD.righe,
    'annotazioni', OLD.annotazioni, 'firmatario', OLD.firmatario, 'firmato_at', OLD.firmato_at, 'allegati', OLD.allegati);
  IF TG_OP = 'UPDATE' THEN
    v_dopo := jsonb_build_object('data', NEW.data, 'voce_id', NEW.voce_id, 'quantita', NEW.quantita, 'righe', NEW.righe,
      'annotazioni', NEW.annotazioni, 'firmatario', NEW.firmatario, 'firmato_at', NEW.firmato_at, 'allegati', NEW.allegati);
    IF v_dopo = v_prima THEN RETURN NULL; END IF;
  END IF;
  INSERT INTO public.lp_libretto_modifiche (company_id, order_id, libretto_id, numero, operazione, prima, dopo, modificato_da)
  VALUES (OLD.company_id, OLD.order_id, OLD.id, OLD.numero,
          CASE WHEN TG_OP = 'UPDATE' THEN 'modifica' ELSE 'eliminazione' END, v_prima, v_dopo, auth.uid());
  RETURN NULL;
END;
$fn$;
-- Le funzioni di trigger non hanno bisogno di EXECUTE.
REVOKE ALL ON FUNCTION public.lp_libretto_traccia() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_lp_libretto_traccia ON public.lp_libretto;
CREATE TRIGGER trg_lp_libretto_traccia
  AFTER UPDATE OR DELETE ON public.lp_libretto
  FOR EACH ROW WHEN (public.azienda_ancora_esiste(OLD.company_id))
  EXECUTE FUNCTION public.lp_libretto_traccia();

-- Si legge come il libretto; nessuno scrive a mano (né insert, né update, né delete).
ALTER TABLE public.lp_libretto_modifiche ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS lp_libretto_modifiche_select ON public.lp_libretto_modifiche;
CREATE POLICY lp_libretto_modifiche_select ON public.lp_libretto_modifiche FOR SELECT TO authenticated
  USING (company_id IN (SELECT p.company_id FROM public.profiles p WHERE p.id = (SELECT auth.uid()))
         AND public.puo_vedere_commessa(order_id));
DROP POLICY IF EXISTS blocco_utente_bloccato ON public.lp_libretto_modifiche;
CREATE POLICY blocco_utente_bloccato ON public.lp_libretto_modifiche AS RESTRICTIVE FOR ALL TO authenticated
  USING (NOT (SELECT public.utente_bloccato())) WITH CHECK (NOT (SELECT public.utente_bloccato()));
REVOKE ALL ON public.lp_libretto_modifiche FROM anon, authenticated;
GRANT SELECT ON public.lp_libretto_modifiche TO authenticated;
GRANT ALL ON public.lp_libretto_modifiche TO service_role;

-- ─── 2. Fattura del certificato di pagamento ───────────────────────────────

ALTER TABLE public.lp_certificati_pagamento
  ADD COLUMN IF NOT EXISTS documento_fiscale_id uuid REFERENCES public.documenti_fiscali(id) ON DELETE SET NULL;
COMMENT ON COLUMN public.lp_certificati_pagamento.documento_fiscale_id IS
  'La fattura emessa per il certificato (documenti_fiscali). È l''unica cosa che cambia dopo l''emissione del certificato.';
CREATE INDEX IF NOT EXISTS lp_certificati_documento_idx ON public.lp_certificati_pagamento (documento_fiscale_id)
  WHERE documento_fiscale_id IS NOT NULL;

-- Come in 20281023054000, più il collegamento della fattura.
CREATE OR REPLACE FUNCTION public.lp_certificato_regole()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $fn$
DECLARE
  v_sal public.lp_sal%rowtype;
BEGIN
  IF TG_OP = 'UPDATE'
     AND (to_jsonb(NEW) - 'documento_fiscale_id') = (to_jsonb(OLD) - 'documento_fiscale_id') THEN
    IF NEW.documento_fiscale_id IS NOT NULL AND NOT EXISTS (
         SELECT 1 FROM public.documenti_fiscali d
          WHERE d.id = NEW.documento_fiscale_id AND d.company_id = NEW.company_id AND d.deleted_at IS NULL
            AND d.tipo IN ('fattura', 'fattura_pa', 'acconto_fattura')) THEN
      RAISE EXCEPTION 'Si collega una fattura dell''azienda, non annullata.' USING ERRCODE = 'P0001';
    END IF;
    RETURN NEW;
  END IF;
  IF TG_OP <> 'INSERT' THEN
    RAISE EXCEPTION 'Il certificato di pagamento emesso non si modifica né si cancella.' USING ERRCODE = 'P0001';
  END IF;
  SELECT * INTO v_sal FROM public.lp_sal WHERE id = NEW.sal_id;
  IF NOT FOUND OR v_sal.stato <> 'approvato' OR v_sal.order_id <> NEW.order_id OR v_sal.company_id <> NEW.company_id THEN
    RAISE EXCEPTION 'Il certificato di pagamento si emette da un SAL approvato della commessa.' USING ERRCODE = 'P0001';
  END IF;
  IF NEW.imponibile <> v_sal.importo_sal THEN
    RAISE EXCEPTION 'L''imponibile del certificato deve essere l''importo del SAL (% €).', v_sal.importo_sal USING ERRCODE = 'P0001';
  END IF;
  IF NEW.iva <> round(NEW.imponibile * NEW.aliquota_iva / 100, 2) OR NEW.totale <> NEW.imponibile + NEW.iva
     OR NEW.da_pagare_impresa <> (CASE WHEN NEW.split_payment THEN NEW.imponibile ELSE NEW.totale END) THEN
    RAISE EXCEPTION 'Importi del certificato non coerenti.' USING ERRCODE = 'P0001';
  END IF;
  -- La fattura si collega dopo, non all'emissione.
  NEW.documento_fiscale_id := NULL;
  PERFORM pg_advisory_xact_lock(hashtextextended('lp_certificato:' || NEW.order_id::text, 0));
  SELECT coalesce(max(c.numero), 0) + 1 INTO NEW.numero FROM public.lp_certificati_pagamento c WHERE c.order_id = NEW.order_id;
  NEW.created_by := auth.uid();
  RETURN NEW;
END;
$fn$;
REVOKE ALL ON FUNCTION public.lp_certificato_regole() FROM PUBLIC, anon, authenticated;
