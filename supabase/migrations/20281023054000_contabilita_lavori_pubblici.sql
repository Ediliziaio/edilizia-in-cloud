-- ════════════════════════════════════════════════════════════════════════════
-- Contabilità dei lavori pubblici sul computo contrattuale della commessa
-- ════════════════════════════════════════════════════════════════════════════
-- D.Lgs. 36/2023, allegato II.14. Tutto per commessa:
--   lp_contabilita            impostazioni: ritenuta di garanzia (0,50%),
--                             anticipazione %, aliquota IVA, split payment,
--                             sicurezza a misura o in proporzione, DL, RUP, contratto
--   lp_libretto               libretto delle misure: una registrazione = data,
--                             voce del computo contrattuale, righe di misura
--                             (par.ug., lung., larg., H/peso), annotazioni,
--                             foto (bucket foto-cantiere), firma del DL
--   lp_sal / lp_sal_voci      stato d'avanzamento lavori: importi progressivi e
--                             fotografia delle quantità voce per voce
--   lp_certificati_pagamento  certificato di pagamento dal SAL approvato
-- Il registro di contabilità si calcola dal libretto (non si salva).
--
-- Regole nel database:
--   - si registra solo su voci del computo contrattuale della stessa commessa;
--   - la quantità della registrazione è la somma delle righe di misura;
--   - numero progressivo per commessa (libretto, SAL, certificati);
--   - una registrazione entrata in un SAL non si modifica né si cancella; si
--     libera solo cancellando il SAL ancora in bozza;
--   - un SAL approvato (firmato) non si modifica né si cancella; l'approvazione
--     registra chi e quando;
--   - un certificato di pagamento non si modifica né si cancella;
--   - le guardie si fanno da parte nella purga dell'azienda (azienda_ancora_esiste)
--     e nel ripristino (session_replication_role = replica).
-- Accessi: legge chi vede la commessa (can_view_orders + «Solo i propri»), scrive
-- chi la modifica (puo_modificare_commessa, 20281023100000); niente anon, niente
-- clienti esterni, RESTRICTIVE blocco_utente_bloccato.
-- Nessuna riga scritta. Idempotente.
-- ════════════════════════════════════════════════════════════════════════════

SET LOCAL lock_timeout = '3s';
SET LOCAL statement_timeout = '60s';

-- Chi vede la commessa: «Ordini e Commesse» in lettura nell'azienda della
-- commessa e commessa fra quelle che vede. Definer: legge orders senza RLS.
CREATE OR REPLACE FUNCTION public.puo_vedere_commessa(p_order_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = ''
AS $fn$
  SELECT coalesce((
           SELECT (public.has_permission_for_company((SELECT auth.uid()), 'can_view_orders', o.company_id)
                   OR public.has_permission_for_company((SELECT auth.uid()), 'can_edit_orders', o.company_id))
              AND public.can_see_order(o.id, o.assigned_to, o.destination_warehouse_id)
             FROM public.orders o
            WHERE o.id = p_order_id
         ), false)
     AND NOT (SELECT public.utente_bloccato())
     AND NOT (SELECT public.utente_e_cliente_esterno());
$fn$;
REVOKE ALL ON FUNCTION public.puo_vedere_commessa(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.puo_vedere_commessa(uuid) TO authenticated, service_role;

-- ── tabelle ─────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.lp_contabilita (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  order_id uuid NOT NULL UNIQUE REFERENCES public.orders(id) ON DELETE CASCADE,
  ritenuta_percentuale numeric(6,3) NOT NULL DEFAULT 0.5 CHECK (ritenuta_percentuale >= 0 AND ritenuta_percentuale <= 100),
  anticipazione_percentuale numeric(6,3) NOT NULL DEFAULT 0 CHECK (anticipazione_percentuale >= 0 AND anticipazione_percentuale <= 100),
  aliquota_iva numeric(5,2) NOT NULL DEFAULT 10 CHECK (aliquota_iva >= 0 AND aliquota_iva <= 100),
  split_payment boolean NOT NULL DEFAULT true,
  sicurezza_modo text NOT NULL DEFAULT 'proporzionale' CHECK (sicurezza_modo IN ('a_misura', 'proporzionale')),
  direttore_lavori text,
  rup text,
  impresa text,
  contratto_estremi text,
  contratto_data date,
  consegna_lavori date,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
COMMENT ON TABLE public.lp_contabilita IS 'Impostazioni della contabilità dei lavori pubblici di una commessa (ritenuta, anticipazione, IVA, split payment, sicurezza, DL, RUP).';

CREATE TABLE IF NOT EXISTS public.lp_sal (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  order_id uuid NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  computo_upload_id uuid NOT NULL REFERENCES public.computo_uploads(id),
  numero integer NOT NULL,
  data date NOT NULL DEFAULT current_date,
  lavori_a_tutto date NOT NULL,
  stato text NOT NULL DEFAULT 'bozza' CHECK (stato IN ('bozza', 'approvato')),
  ribasso_percentuale numeric(7,4) NOT NULL DEFAULT 0,
  ritenuta_percentuale numeric(6,3) NOT NULL,
  anticipazione_percentuale numeric(6,3) NOT NULL DEFAULT 0,
  sicurezza_modo text NOT NULL CHECK (sicurezza_modo IN ('a_misura', 'proporzionale')),
  lavori_lordo numeric(14,2) NOT NULL,
  ribasso numeric(14,2) NOT NULL,
  lavori_netti numeric(14,2) NOT NULL,
  sicurezza numeric(14,2) NOT NULL,
  totale_a_oggi numeric(14,2) NOT NULL,
  ritenuta numeric(14,2) NOT NULL,
  anticipazione numeric(14,2) NOT NULL DEFAULT 0,
  recupero_anticipazione numeric(14,2) NOT NULL DEFAULT 0,
  netto_a_oggi numeric(14,2) NOT NULL,
  sal_precedenti numeric(14,2) NOT NULL DEFAULT 0,
  importo_sal numeric(14,2) NOT NULL,
  note text,
  created_by uuid DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  approvato_da uuid,
  approvato_at timestamptz,
  UNIQUE (order_id, numero)
);
COMMENT ON TABLE public.lp_sal IS 'Stato d''avanzamento lavori (lavori pubblici): importi progressivi a una data, ritenuta di garanzia, recupero dell''anticipazione, detrazione dei SAL precedenti.';
CREATE INDEX IF NOT EXISTS lp_sal_company_idx ON public.lp_sal (company_id);
CREATE INDEX IF NOT EXISTS lp_sal_computo_idx ON public.lp_sal (computo_upload_id);

CREATE TABLE IF NOT EXISTS public.lp_sal_voci (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  order_id uuid NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  sal_id uuid NOT NULL REFERENCES public.lp_sal(id) ON DELETE CASCADE,
  voce_radice uuid NOT NULL,
  ordine integer NOT NULL DEFAULT 0,
  numero text,
  tariffa text,
  descrizione text,
  unita_misura text,
  is_sicurezza boolean NOT NULL DEFAULT false,
  prezzo numeric(14,4) NOT NULL DEFAULT 0,
  prezzo_ribassato numeric(14,4) NOT NULL DEFAULT 0,
  quantita_contratto numeric(18,4) NOT NULL DEFAULT 0,
  quantita_precedente numeric(18,4) NOT NULL DEFAULT 0,
  quantita_a_oggi numeric(18,4) NOT NULL DEFAULT 0,
  importo_a_oggi numeric(14,2) NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS lp_sal_voci_sal_idx ON public.lp_sal_voci (sal_id, ordine);
CREATE INDEX IF NOT EXISTS lp_sal_voci_company_idx ON public.lp_sal_voci (company_id);
CREATE INDEX IF NOT EXISTS lp_sal_voci_order_idx ON public.lp_sal_voci (order_id);

CREATE TABLE IF NOT EXISTS public.lp_libretto (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  order_id uuid NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  computo_upload_id uuid NOT NULL REFERENCES public.computo_uploads(id),
  voce_id uuid NOT NULL REFERENCES public.computo_voci_estratte(id),
  voce_radice uuid NOT NULL,
  numero integer NOT NULL,
  data date NOT NULL DEFAULT current_date,
  righe jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(righe) = 'array'),
  quantita numeric(18,4) NOT NULL DEFAULT 0,
  annotazioni text,
  allegati jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(allegati) = 'array'),
  firmatario text,
  firmato_da uuid,
  firmato_at timestamptz,
  sal_id uuid REFERENCES public.lp_sal(id) ON DELETE SET NULL,
  created_by uuid DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (order_id, numero)
);
COMMENT ON TABLE public.lp_libretto IS 'Libretto delle misure: registrazioni di cantiere sulle voci del computo contrattuale. quantita = somma delle righe di misura.';
COMMENT ON COLUMN public.lp_libretto.voce_radice IS 'Voce del contratto originario (computo_voci_estratte.voce_origine_id o id): tiene insieme le quantità fra contratto e varianti.';
COMMENT ON COLUMN public.lp_libretto.allegati IS 'Foto e allegati: [{path, nome}] nel bucket foto-cantiere (<azienda>/<commessa>/libretto/...).';
CREATE INDEX IF NOT EXISTS lp_libretto_order_idx ON public.lp_libretto (order_id, data, numero);
CREATE INDEX IF NOT EXISTS lp_libretto_company_idx ON public.lp_libretto (company_id);
CREATE INDEX IF NOT EXISTS lp_libretto_voce_idx ON public.lp_libretto (voce_id);
CREATE INDEX IF NOT EXISTS lp_libretto_computo_idx ON public.lp_libretto (computo_upload_id);
CREATE INDEX IF NOT EXISTS lp_libretto_sal_idx ON public.lp_libretto (sal_id) WHERE sal_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.lp_certificati_pagamento (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  order_id uuid NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  sal_id uuid NOT NULL UNIQUE REFERENCES public.lp_sal(id),
  numero integer NOT NULL,
  data date NOT NULL DEFAULT current_date,
  imponibile numeric(14,2) NOT NULL,
  aliquota_iva numeric(5,2) NOT NULL,
  iva numeric(14,2) NOT NULL,
  totale numeric(14,2) NOT NULL,
  split_payment boolean NOT NULL,
  da_pagare_impresa numeric(14,2) NOT NULL,
  note text,
  created_by uuid DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (order_id, numero)
);
CREATE INDEX IF NOT EXISTS lp_certificati_company_idx ON public.lp_certificati_pagamento (company_id);

-- ── regole ──────────────────────────────────────────────────────────────────

-- Quantità di una riga di misura: la quantità scritta, altrimenti par.ug. × lung. × larg. × H/peso
-- (i fattori presenti). Uguale a quantitaRiga() dell'app.
CREATE OR REPLACE FUNCTION public.lp_quantita_riga(r jsonb)
RETURNS numeric LANGUAGE plpgsql IMMUTABLE SET search_path = ''
AS $fn$
DECLARE
  k text;
  v_q numeric := 1;
  v_n integer := 0;
BEGIN
  IF jsonb_typeof(r) IS DISTINCT FROM 'object' THEN RETURN 0; END IF;
  IF jsonb_typeof(r->'quantita') = 'number' THEN RETURN round((r->>'quantita')::numeric, 4); END IF;
  FOREACH k IN ARRAY ARRAY['parti_uguali', 'lunghezza', 'larghezza', 'altezza_peso'] LOOP
    IF jsonb_typeof(r->k) = 'number' THEN v_q := v_q * (r->>k)::numeric; v_n := v_n + 1; END IF;
  END LOOP;
  RETURN CASE WHEN v_n = 0 THEN 0 ELSE round(v_q, 4) END;
END;
$fn$;
REVOKE ALL ON FUNCTION public.lp_quantita_riga(jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.lp_quantita_riga(jsonb) TO authenticated, service_role;

-- Libretto, prima di scrivere: voce del computo contrattuale della commessa,
-- radice, quantità dalle righe, numero progressivo; contabilizzata = intoccabile.
CREATE OR REPLACE FUNCTION public.lp_libretto_regole()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $fn$
DECLARE
  v_voce record;
BEGIN
  IF TG_OP IN ('UPDATE', 'DELETE') AND OLD.sal_id IS NOT NULL
     AND EXISTS (SELECT 1 FROM public.lp_sal s WHERE s.id = OLD.sal_id) THEN
    RAISE EXCEPTION 'Registrazione già contabilizzata nel SAL: per cambiarla elimina il SAL in bozza (se approvato non si può).' USING ERRCODE = 'P0001';
  END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  -- Sgancio dal SAL cancellato (ON DELETE SET NULL): nient'altro da controllare.
  IF TG_OP = 'UPDATE' AND OLD.sal_id IS NOT NULL AND NEW.sal_id IS NULL
     AND (to_jsonb(NEW) - 'sal_id') = (to_jsonb(OLD) - 'sal_id') THEN
    RETURN NEW;
  END IF;

  SELECT ve.id, ve.computo_upload_id, coalesce(ve.voce_origine_id, ve.id) AS radice, u.order_id, u.company_id, u.stato
    INTO v_voce
    FROM public.computo_voci_estratte ve JOIN public.computo_uploads u ON u.id = ve.computo_upload_id
   WHERE ve.id = NEW.voce_id;
  IF NOT FOUND OR v_voce.order_id IS DISTINCT FROM NEW.order_id OR v_voce.company_id IS DISTINCT FROM NEW.company_id THEN
    RAISE EXCEPTION 'La voce non appartiene al computo di questa commessa.' USING ERRCODE = 'P0001';
  END IF;
  IF TG_OP = 'INSERT' OR NEW.voce_id IS DISTINCT FROM OLD.voce_id THEN
    IF v_voce.stato <> 'contrattuale' THEN
      RAISE EXCEPTION 'Si registra solo sulle voci del computo contrattuale.' USING ERRCODE = 'P0001';
    END IF;
  END IF;
  NEW.computo_upload_id := v_voce.computo_upload_id;
  NEW.voce_radice := v_voce.radice;
  NEW.quantita := coalesce((SELECT sum(public.lp_quantita_riga(r)) FROM jsonb_array_elements(NEW.righe) r), 0);
  NEW.quantita := round(NEW.quantita, 4);
  IF TG_OP = 'INSERT' THEN
    PERFORM pg_advisory_xact_lock(hashtextextended('lp_libretto:' || NEW.order_id::text, 0));
    SELECT coalesce(max(l.numero), 0) + 1 INTO NEW.numero FROM public.lp_libretto l WHERE l.order_id = NEW.order_id;
    NEW.created_by := auth.uid();
    NEW.sal_id := NULL;
  ELSE
    NEW.numero := OLD.numero;
    NEW.created_by := OLD.created_by;
    IF NEW.sal_id IS DISTINCT FROM OLD.sal_id AND coalesce(current_setting('eic.lp_contabilizza', true), '') <> 'on' THEN
      RAISE EXCEPTION 'Una registrazione entra in un SAL solo emettendo il SAL.' USING ERRCODE = 'P0001';
    END IF;
  END IF;
  -- Firma del DL: chi e quando, dal server.
  IF NEW.firmato_at IS NOT NULL AND (TG_OP = 'INSERT' OR OLD.firmato_at IS NULL) THEN
    NEW.firmato_at := now();
    NEW.firmato_da := auth.uid();
  ELSIF TG_OP = 'UPDATE' THEN
    NEW.firmato_at := OLD.firmato_at;
    NEW.firmato_da := OLD.firmato_da;
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END;
$fn$;

DROP TRIGGER IF EXISTS trg_lp_libretto_regole ON public.lp_libretto;
CREATE TRIGGER trg_lp_libretto_regole
  BEFORE UPDATE OR DELETE ON public.lp_libretto
  FOR EACH ROW WHEN (public.azienda_ancora_esiste(OLD.company_id))
  EXECUTE FUNCTION public.lp_libretto_regole();
DROP TRIGGER IF EXISTS trg_lp_libretto_regole_ins ON public.lp_libretto;
CREATE TRIGGER trg_lp_libretto_regole_ins
  BEFORE INSERT ON public.lp_libretto
  FOR EACH ROW EXECUTE FUNCTION public.lp_libretto_regole();

-- SAL: approvato = firmato, intoccabile; l'approvazione registra chi e quando.
CREATE OR REPLACE FUNCTION public.lp_sal_regole()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $fn$
BEGIN
  IF OLD.stato = 'approvato' THEN
    RAISE EXCEPTION 'SAL n. % approvato: non si modifica né si cancella.', OLD.numero USING ERRCODE = 'P0001';
  END IF;
  IF TG_OP = 'DELETE' THEN
    IF EXISTS (SELECT 1 FROM public.lp_sal s WHERE s.order_id = OLD.order_id AND s.numero > OLD.numero) THEN
      RAISE EXCEPTION 'Si elimina solo l''ultimo SAL.' USING ERRCODE = 'P0001';
    END IF;
    RETURN OLD;
  END IF;
  -- In bozza si cambiano solo stato, note e data; gli importi li scrive lp_sal_emetti.
  IF (to_jsonb(NEW) - ARRAY['stato','note','data','approvato_da','approvato_at'])
     IS DISTINCT FROM (to_jsonb(OLD) - ARRAY['stato','note','data','approvato_da','approvato_at']) THEN
    RAISE EXCEPTION 'Gli importi del SAL non si correggono a mano: elimina la bozza e ricalcolala.' USING ERRCODE = 'P0001';
  END IF;
  IF NEW.stato = 'approvato' THEN
    IF NOT public.puo_modificare_commessa(NEW.order_id) THEN
      RAISE EXCEPTION 'Approva il SAL chi ha «Ordini e Commesse» o l''amministratore.' USING ERRCODE = '42501';
    END IF;
    IF EXISTS (SELECT 1 FROM public.lp_sal s WHERE s.order_id = NEW.order_id AND s.numero < NEW.numero AND s.stato <> 'approvato') THEN
      RAISE EXCEPTION 'Prima vanno approvati i SAL precedenti.' USING ERRCODE = 'P0001';
    END IF;
    NEW.approvato_da := auth.uid();
    NEW.approvato_at := now();
  ELSE
    NEW.approvato_da := NULL;
    NEW.approvato_at := NULL;
  END IF;
  RETURN NEW;
END;
$fn$;

DROP TRIGGER IF EXISTS trg_lp_sal_regole ON public.lp_sal;
CREATE TRIGGER trg_lp_sal_regole
  BEFORE UPDATE OR DELETE ON public.lp_sal
  FOR EACH ROW WHEN (public.azienda_ancora_esiste(OLD.company_id))
  EXECUTE FUNCTION public.lp_sal_regole();

-- Voci del SAL: le scrive solo lp_sal_emetti; non cambiano dopo.
CREATE OR REPLACE FUNCTION public.lp_sal_voci_regole()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $fn$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF EXISTS (SELECT 1 FROM public.lp_sal s WHERE s.id = OLD.sal_id AND s.stato = 'approvato') THEN
      RAISE EXCEPTION 'SAL approvato: le voci non si cancellano.' USING ERRCODE = 'P0001';
    END IF;
    RETURN OLD;
  END IF;
  IF TG_OP = 'INSERT' AND coalesce(current_setting('eic.lp_contabilizza', true), '') = 'on' THEN
    RETURN NEW;
  END IF;
  RAISE EXCEPTION 'Le voci del SAL le scrive l''emissione del SAL.' USING ERRCODE = 'P0001';
END;
$fn$;

DROP TRIGGER IF EXISTS trg_lp_sal_voci_regole ON public.lp_sal_voci;
CREATE TRIGGER trg_lp_sal_voci_regole
  BEFORE UPDATE OR DELETE ON public.lp_sal_voci
  FOR EACH ROW WHEN (public.azienda_ancora_esiste(OLD.company_id))
  EXECUTE FUNCTION public.lp_sal_voci_regole();
DROP TRIGGER IF EXISTS trg_lp_sal_voci_regole_ins ON public.lp_sal_voci;
CREATE TRIGGER trg_lp_sal_voci_regole_ins
  BEFORE INSERT ON public.lp_sal_voci
  FOR EACH ROW EXECUTE FUNCTION public.lp_sal_voci_regole();

-- Certificato: solo da SAL approvato, numero progressivo, poi intoccabile.
CREATE OR REPLACE FUNCTION public.lp_certificato_regole()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $fn$
DECLARE
  v_sal public.lp_sal%rowtype;
BEGIN
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
  PERFORM pg_advisory_xact_lock(hashtextextended('lp_certificato:' || NEW.order_id::text, 0));
  SELECT coalesce(max(c.numero), 0) + 1 INTO NEW.numero FROM public.lp_certificati_pagamento c WHERE c.order_id = NEW.order_id;
  NEW.created_by := auth.uid();
  RETURN NEW;
END;
$fn$;

DROP TRIGGER IF EXISTS trg_lp_certificato_regole ON public.lp_certificati_pagamento;
CREATE TRIGGER trg_lp_certificato_regole
  BEFORE UPDATE OR DELETE ON public.lp_certificati_pagamento
  FOR EACH ROW WHEN (public.azienda_ancora_esiste(OLD.company_id))
  EXECUTE FUNCTION public.lp_certificato_regole();
DROP TRIGGER IF EXISTS trg_lp_certificato_regole_ins ON public.lp_certificati_pagamento;
CREATE TRIGGER trg_lp_certificato_regole_ins
  BEFORE INSERT ON public.lp_certificati_pagamento
  FOR EACH ROW EXECUTE FUNCTION public.lp_certificato_regole();

REVOKE ALL ON FUNCTION public.lp_libretto_regole() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.lp_sal_regole() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.lp_sal_voci_regole() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.lp_certificato_regole() FROM PUBLIC, anon, authenticated;

-- Emissione del SAL: tutto o niente. I calcoli li fa l'app (src/lib/computo/
-- contabilitaLavori.ts, provati coi numeri); qui si controllano la coerenza
-- degli importi, la sequenza dei SAL e si contabilizzano le registrazioni.
-- SECURITY INVOKER: passa dalla RLS di chi emette.
CREATE OR REPLACE FUNCTION public.lp_sal_emetti(p_order_id uuid, p_sal jsonb, p_voci jsonb)
RETURNS uuid LANGUAGE plpgsql SECURITY INVOKER SET search_path = ''
AS $fn$
DECLARE
  v_computo public.computo_uploads%rowtype;
  v_numero integer;
  v_precedenti numeric;
  v_id uuid;
  v_al date := (p_sal->>'lavori_a_tutto')::date;
  v_n numeric(14,2);
BEGIN
  IF NOT public.puo_modificare_commessa(p_order_id) THEN
    RAISE EXCEPTION 'Per emettere un SAL serve «Ordini e Commesse» sulla commessa.' USING ERRCODE = '42501';
  END IF;
  IF jsonb_typeof(p_sal) IS DISTINCT FROM 'object' OR jsonb_typeof(p_voci) IS DISTINCT FROM 'array' OR v_al IS NULL THEN
    RAISE EXCEPTION 'Dati del SAL non validi.' USING ERRCODE = 'P0001';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('lp_sal:' || p_order_id::text, 0));
  SELECT * INTO v_computo FROM public.computo_uploads
   WHERE order_id = p_order_id AND stato = 'contrattuale' ORDER BY contrattuale_dal DESC NULLS LAST LIMIT 1;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'La commessa non ha un computo contrattuale.' USING ERRCODE = 'P0001';
  END IF;
  IF EXISTS (SELECT 1 FROM public.lp_sal s WHERE s.order_id = p_order_id AND s.stato = 'bozza') THEN
    RAISE EXCEPTION 'C''è già un SAL in bozza: approvalo o eliminalo.' USING ERRCODE = 'P0001';
  END IF;
  IF EXISTS (SELECT 1 FROM public.lp_sal s WHERE s.order_id = p_order_id AND s.lavori_a_tutto >= v_al) THEN
    RAISE EXCEPTION 'La data «lavori a tutto il» deve essere successiva a quella dell''ultimo SAL.' USING ERRCODE = 'P0001';
  END IF;
  SELECT coalesce(max(numero), 0) + 1, coalesce(sum(importo_sal), 0) INTO v_numero, v_precedenti
    FROM public.lp_sal WHERE order_id = p_order_id;
  IF round((p_sal->>'sal_precedenti')::numeric, 2) <> v_precedenti THEN
    RAISE EXCEPTION 'I SAL precedenti sono cambiati (% €): ricalcola.', v_precedenti USING ERRCODE = 'P0001';
  END IF;
  v_n := round((p_sal->>'totale_a_oggi')::numeric - (p_sal->>'ritenuta')::numeric - (p_sal->>'recupero_anticipazione')::numeric, 2);
  IF v_n <> round((p_sal->>'netto_a_oggi')::numeric, 2)
     OR round((p_sal->>'importo_sal')::numeric, 2) <> v_n - v_precedenti
     OR round((p_sal->>'totale_a_oggi')::numeric, 2) <> round((p_sal->>'lavori_netti')::numeric + (p_sal->>'sicurezza')::numeric, 2) THEN
    RAISE EXCEPTION 'Importi del SAL non coerenti.' USING ERRCODE = 'P0001';
  END IF;

  INSERT INTO public.lp_sal (company_id, order_id, computo_upload_id, numero, data, lavori_a_tutto, ribasso_percentuale,
    ritenuta_percentuale, anticipazione_percentuale, sicurezza_modo, lavori_lordo, ribasso, lavori_netti, sicurezza,
    totale_a_oggi, ritenuta, anticipazione, recupero_anticipazione, netto_a_oggi, sal_precedenti, importo_sal, note)
  VALUES (v_computo.company_id, p_order_id, v_computo.id, v_numero, coalesce((p_sal->>'data')::date, current_date), v_al,
    coalesce(v_computo.ribasso_percentuale, 0), (p_sal->>'ritenuta_percentuale')::numeric,
    coalesce((p_sal->>'anticipazione_percentuale')::numeric, 0), p_sal->>'sicurezza_modo',
    (p_sal->>'lavori_lordo')::numeric, (p_sal->>'ribasso')::numeric, (p_sal->>'lavori_netti')::numeric,
    (p_sal->>'sicurezza')::numeric, (p_sal->>'totale_a_oggi')::numeric, (p_sal->>'ritenuta')::numeric,
    coalesce((p_sal->>'anticipazione')::numeric, 0), coalesce((p_sal->>'recupero_anticipazione')::numeric, 0),
    (p_sal->>'netto_a_oggi')::numeric, v_precedenti, (p_sal->>'importo_sal')::numeric, nullif(p_sal->>'note', ''))
  RETURNING id INTO v_id;

  PERFORM set_config('eic.lp_contabilizza', 'on', true);
  INSERT INTO public.lp_sal_voci (company_id, order_id, sal_id, voce_radice, ordine, numero, tariffa, descrizione, unita_misura,
    is_sicurezza, prezzo, prezzo_ribassato, quantita_contratto, quantita_precedente, quantita_a_oggi, importo_a_oggi)
  SELECT v_computo.company_id, p_order_id, v_id, x.voce_radice, x.ordine, x.numero, x.tariffa, x.descrizione, x.unita_misura,
    coalesce(x.is_sicurezza, false), coalesce(x.prezzo, 0), coalesce(x.prezzo_ribassato, 0), coalesce(x.quantita_contratto, 0),
    coalesce(x.quantita_precedente, 0), coalesce(x.quantita_a_oggi, 0), coalesce(x.importo_a_oggi, 0)
  FROM jsonb_to_recordset(p_voci) AS x(voce_radice uuid, ordine integer, numero text, tariffa text, descrizione text,
    unita_misura text, is_sicurezza boolean, prezzo numeric, prezzo_ribassato numeric, quantita_contratto numeric,
    quantita_precedente numeric, quantita_a_oggi numeric, importo_a_oggi numeric);
  UPDATE public.lp_libretto SET sal_id = v_id
   WHERE order_id = p_order_id AND sal_id IS NULL AND data <= v_al;
  PERFORM set_config('eic.lp_contabilizza', '', true);
  RETURN v_id;
END;
$fn$;
REVOKE ALL ON FUNCTION public.lp_sal_emetti(uuid, jsonb, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.lp_sal_emetti(uuid, jsonb, jsonb) TO authenticated, service_role;

-- ── accessi ─────────────────────────────────────────────────────────────────
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['lp_contabilita', 'lp_libretto', 'lp_sal', 'lp_sal_voci', 'lp_certificati_pagamento'] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t || '_select', t);
    EXECUTE format($p$CREATE POLICY %I ON public.%I FOR SELECT TO authenticated
      USING (company_id IN (SELECT p.company_id FROM public.profiles p WHERE p.id = (SELECT auth.uid()))
             AND public.puo_vedere_commessa(order_id))$p$, t || '_select', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t || '_insert', t);
    EXECUTE format($p$CREATE POLICY %I ON public.%I FOR INSERT TO authenticated
      WITH CHECK (company_id = public.get_order_company_id(order_id)
                  AND company_id IN (SELECT p.company_id FROM public.profiles p WHERE p.id = (SELECT auth.uid()))
                  AND public.puo_modificare_commessa(order_id))$p$, t || '_insert', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t || '_update', t);
    EXECUTE format($p$CREATE POLICY %I ON public.%I FOR UPDATE TO authenticated
      USING (company_id IN (SELECT p.company_id FROM public.profiles p WHERE p.id = (SELECT auth.uid()))
             AND public.puo_modificare_commessa(order_id))
      WITH CHECK (company_id = public.get_order_company_id(order_id) AND public.puo_modificare_commessa(order_id))$p$, t || '_update', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t || '_delete', t);
    EXECUTE format($p$CREATE POLICY %I ON public.%I FOR DELETE TO authenticated
      USING (company_id IN (SELECT p.company_id FROM public.profiles p WHERE p.id = (SELECT auth.uid()))
             AND public.puo_modificare_commessa(order_id))$p$, t || '_delete', t);
    EXECUTE format('DROP POLICY IF EXISTS blocco_utente_bloccato ON public.%I', t);
    EXECUTE format($p$CREATE POLICY blocco_utente_bloccato ON public.%I AS RESTRICTIVE FOR ALL TO authenticated
      USING (NOT (SELECT public.utente_bloccato())) WITH CHECK (NOT (SELECT public.utente_bloccato()))$p$, t);
    EXECUTE format('REVOKE ALL ON public.%I FROM anon', t);
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON public.%I TO authenticated', t);
    EXECUTE format('GRANT ALL ON public.%I TO service_role', t);
  END LOOP;
END $$;
