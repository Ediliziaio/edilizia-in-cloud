-- Contabilità generale in partita doppia, fase A (10/11/2026). Vedi il file 20290210100000_contabilita_partita_doppia.sql.
SET LOCAL lock_timeout = '3s';
SET LOCAL statement_timeout = '60s';

CREATE TABLE IF NOT EXISTS public.contabilita_conti (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  codice text NOT NULL,
  descrizione text NOT NULL,
  natura text NOT NULL CHECK (natura IN ('attivo', 'passivo', 'costo', 'ricavo')),
  sezione_cee text CHECK (sezione_cee IS NULL OR sezione_cee IN ('SPA', 'SPP', 'CE')),
  voce_cee text,
  mastro_id uuid REFERENCES public.contabilita_conti(id),
  movimentabile boolean NOT NULL DEFAULT true,
  attivo boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company_id, codice)
);
CREATE INDEX IF NOT EXISTS contabilita_conti_mastro_idx ON public.contabilita_conti(mastro_id);

CREATE TABLE IF NOT EXISTS public.contabilita_scritture (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  esercizio integer NOT NULL CHECK (esercizio BETWEEN 2000 AND 2100),
  numero integer NOT NULL CHECK (numero > 0),
  data_registrazione date NOT NULL,
  causale text NOT NULL,
  descrizione text,
  documento_numero text,
  documento_data date,
  origine text NOT NULL DEFAULT 'manuale',
  origine_id uuid,
  storno_di uuid REFERENCES public.contabilita_scritture(id),
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company_id, esercizio, numero)
);
CREATE INDEX IF NOT EXISTS contabilita_scritture_data_idx ON public.contabilita_scritture(company_id, data_registrazione, numero);
CREATE UNIQUE INDEX IF NOT EXISTS contabilita_scritture_storno_unico ON public.contabilita_scritture(storno_di) WHERE storno_di IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.contabilita_righe (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  scrittura_id uuid NOT NULL REFERENCES public.contabilita_scritture(id),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  riga integer NOT NULL,
  conto_id uuid NOT NULL REFERENCES public.contabilita_conti(id),
  dare numeric(14,2) NOT NULL DEFAULT 0,
  avere numeric(14,2) NOT NULL DEFAULT 0,
  descrizione text,
  CHECK (dare >= 0 AND avere >= 0 AND (dare > 0) <> (avere > 0)),
  UNIQUE (scrittura_id, riga)
);
CREATE INDEX IF NOT EXISTS contabilita_righe_conto_idx ON public.contabilita_righe(company_id, conto_id);

CREATE OR REPLACE FUNCTION public.contabilita_controlla_quadratura()
RETURNS trigger LANGUAGE plpgsql SET search_path TO 'public' AS $$
DECLARE v_id uuid := coalesce(NEW.scrittura_id, OLD.scrittura_id); v_dare numeric; v_avere numeric; v_n int;
BEGIN
  SELECT coalesce(sum(dare), 0), coalesce(sum(avere), 0), count(*) INTO v_dare, v_avere, v_n
    FROM public.contabilita_righe WHERE scrittura_id = v_id;
  IF v_n > 0 AND (v_n < 2 OR v_dare <> v_avere) THEN
    RAISE EXCEPTION 'La scrittura non quadra: dare % e avere %', v_dare, v_avere USING ERRCODE = '23514';
  END IF;
  RETURN NULL;
END $$;
DROP TRIGGER IF EXISTS contabilita_quadratura ON public.contabilita_righe;
CREATE CONSTRAINT TRIGGER contabilita_quadratura
  AFTER INSERT OR UPDATE OR DELETE ON public.contabilita_righe
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION public.contabilita_controlla_quadratura();

CREATE OR REPLACE FUNCTION public.contabilita_immutabile()
RETURNS trigger LANGUAGE plpgsql SET search_path TO 'public' AS $$
BEGIN
  RAISE EXCEPTION 'Una registrazione contabile non si modifica né si cancella: si storna' USING ERRCODE = '42501';
END $$;
DROP TRIGGER IF EXISTS contabilita_scritture_immutabili ON public.contabilita_scritture;
CREATE TRIGGER contabilita_scritture_immutabili BEFORE UPDATE OR DELETE ON public.contabilita_scritture
  FOR EACH ROW WHEN (public.azienda_ancora_esiste(OLD.company_id)) EXECUTE FUNCTION public.contabilita_immutabile();
DROP TRIGGER IF EXISTS contabilita_righe_immutabili ON public.contabilita_righe;
CREATE TRIGGER contabilita_righe_immutabili BEFORE UPDATE OR DELETE ON public.contabilita_righe
  FOR EACH ROW WHEN (public.azienda_ancora_esiste(OLD.company_id)) EXECUTE FUNCTION public.contabilita_immutabile();

CREATE OR REPLACE FUNCTION public.contabilita_puo_leggere(p_company uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT auth.uid() IS NOT NULL AND public.user_can_access_company(p_company) IS TRUE
     AND (public.e_amministratore_di(p_company) OR public.has_role(auth.uid(), 'super_admin')
          OR public.user_can_write_accountant_company(p_company)
          OR p_company = ANY (public.aziende_con_permesso('can_view_prima_nota')));
$$;
CREATE OR REPLACE FUNCTION public.contabilita_puo_scrivere(p_company uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT auth.uid() IS NOT NULL AND public.user_can_access_company(p_company) IS TRUE
     AND NOT public.utente_sola_lettura(p_company)
     AND (public.e_amministratore_di(p_company) OR public.has_role(auth.uid(), 'super_admin')
          OR public.user_can_write_accountant_company(p_company));
$$;
REVOKE ALL ON FUNCTION public.contabilita_puo_leggere(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.contabilita_puo_scrivere(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.contabilita_puo_leggere(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.contabilita_puo_scrivere(uuid) TO authenticated, service_role;

ALTER TABLE public.contabilita_conti ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.contabilita_scritture ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.contabilita_righe ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS contabilita_conti_leggi ON public.contabilita_conti;
CREATE POLICY contabilita_conti_leggi ON public.contabilita_conti FOR SELECT TO authenticated
  USING ((SELECT public.contabilita_puo_leggere(company_id)));
DROP POLICY IF EXISTS contabilita_scritture_leggi ON public.contabilita_scritture;
CREATE POLICY contabilita_scritture_leggi ON public.contabilita_scritture FOR SELECT TO authenticated
  USING ((SELECT public.contabilita_puo_leggere(company_id)));
DROP POLICY IF EXISTS contabilita_righe_leggi ON public.contabilita_righe;
CREATE POLICY contabilita_righe_leggi ON public.contabilita_righe FOR SELECT TO authenticated
  USING ((SELECT public.contabilita_puo_leggere(company_id)));
REVOKE ALL ON public.contabilita_conti, public.contabilita_scritture, public.contabilita_righe FROM anon;
REVOKE INSERT, UPDATE, DELETE ON public.contabilita_conti, public.contabilita_scritture, public.contabilita_righe FROM authenticated;
GRANT SELECT ON public.contabilita_conti, public.contabilita_scritture, public.contabilita_righe TO authenticated;

CREATE OR REPLACE FUNCTION public.contabilita_piano_standard(p_company uuid)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_n integer;
BEGIN
  IF NOT public.contabilita_puo_scrivere(p_company) AND coalesce(auth.role(), '') <> 'service_role' THEN
    RAISE EXCEPTION 'Accesso negato' USING ERRCODE = '42501';
  END IF;
  WITH p(codice, descrizione, natura, sezione, voce, mastro) AS (VALUES
    ('01', 'Immobilizzazioni immateriali', 'attivo', 'SPA', 'B.I', NULL),
    ('01.01', 'Software e licenze', 'attivo', 'SPA', 'B.I.3', '01'),
    ('01.02', 'Altre immobilizzazioni immateriali', 'attivo', 'SPA', 'B.I.7', '01'),
    ('02', 'Immobilizzazioni materiali', 'attivo', 'SPA', 'B.II', NULL),
    ('02.01', 'Terreni e fabbricati', 'attivo', 'SPA', 'B.II.1', '02'),
    ('02.02', 'Impianti e macchinari', 'attivo', 'SPA', 'B.II.2', '02'),
    ('02.03', 'Attrezzature di cantiere', 'attivo', 'SPA', 'B.II.3', '02'),
    ('02.04', 'Automezzi', 'attivo', 'SPA', 'B.II.4', '02'),
    ('02.05', 'Mobili e macchine d''ufficio', 'attivo', 'SPA', 'B.II.4', '02'),
    ('02.90', 'Fondo ammortamento fabbricati', 'attivo', 'SPA', 'B.II.1', '02'),
    ('02.91', 'Fondo ammortamento impianti e macchinari', 'attivo', 'SPA', 'B.II.2', '02'),
    ('02.92', 'Fondo ammortamento attrezzature', 'attivo', 'SPA', 'B.II.3', '02'),
    ('02.93', 'Fondo ammortamento altri beni', 'attivo', 'SPA', 'B.II.4', '02'),
    ('03', 'Immobilizzazioni finanziarie', 'attivo', 'SPA', 'B.III', NULL),
    ('03.01', 'Partecipazioni', 'attivo', 'SPA', 'B.III.1', '03'),
    ('04', 'Rimanenze', 'attivo', 'SPA', 'C.I', NULL),
    ('04.01', 'Materie prime e materiali', 'attivo', 'SPA', 'C.I.1', '04'),
    ('04.02', 'Lavori in corso su ordinazione', 'attivo', 'SPA', 'C.I.3', '04'),
    ('05', 'Crediti', 'attivo', 'SPA', 'C.II', NULL),
    ('05.01', 'Crediti verso clienti', 'attivo', 'SPA', 'C.II.1', '05'),
    ('05.02', 'Fatture da emettere', 'attivo', 'SPA', 'C.II.1', '05'),
    ('05.03', 'Ritenute a garanzia da incassare', 'attivo', 'SPA', 'C.II.1', '05'),
    ('05.10', 'IVA su acquisti', 'attivo', 'SPA', 'C.II.5-bis', '05'),
    ('05.11', 'Erario c/IVA a credito', 'attivo', 'SPA', 'C.II.5-bis', '05'),
    ('05.12', 'Crediti d''imposta e acconti', 'attivo', 'SPA', 'C.II.5-bis', '05'),
    ('05.20', 'Crediti diversi', 'attivo', 'SPA', 'C.II.5-quater', '05'),
    ('05.21', 'Anticipi a fornitori', 'attivo', 'SPA', 'C.II.5-quater', '05'),
    ('06', 'Disponibilità liquide', 'attivo', 'SPA', 'C.IV', NULL),
    ('06.01', 'Banca c/c', 'attivo', 'SPA', 'C.IV.1', '06'),
    ('06.02', 'Cassa', 'attivo', 'SPA', 'C.IV.3', '06'),
    ('07', 'Ratei e risconti attivi', 'attivo', 'SPA', 'D', NULL),
    ('07.01', 'Ratei attivi', 'attivo', 'SPA', 'D', '07'),
    ('07.02', 'Risconti attivi', 'attivo', 'SPA', 'D', '07'),
    ('10', 'Patrimonio netto', 'passivo', 'SPP', 'A', NULL),
    ('10.01', 'Capitale sociale', 'passivo', 'SPP', 'A.I', '10'),
    ('10.02', 'Riserva legale', 'passivo', 'SPP', 'A.IV', '10'),
    ('10.03', 'Altre riserve', 'passivo', 'SPP', 'A.VI', '10'),
    ('10.04', 'Utili (perdite) portati a nuovo', 'passivo', 'SPP', 'A.VIII', '10'),
    ('10.05', 'Utile (perdita) dell''esercizio', 'passivo', 'SPP', 'A.IX', '10'),
    ('11', 'Fondi per rischi e oneri', 'passivo', 'SPP', 'B', NULL),
    ('11.01', 'Fondo rischi', 'passivo', 'SPP', 'B.4', '11'),
    ('12', 'Trattamento di fine rapporto', 'passivo', 'SPP', 'C', NULL),
    ('12.01', 'Fondo TFR', 'passivo', 'SPP', 'C', '12'),
    ('13', 'Debiti', 'passivo', 'SPP', 'D', NULL),
    ('13.01', 'Debiti verso banche', 'passivo', 'SPP', 'D.4', '13'),
    ('13.02', 'Finanziamenti', 'passivo', 'SPP', 'D.4', '13'),
    ('13.03', 'Acconti da clienti', 'passivo', 'SPP', 'D.6', '13'),
    ('13.04', 'Debiti verso fornitori', 'passivo', 'SPP', 'D.7', '13'),
    ('13.05', 'Fatture da ricevere', 'passivo', 'SPP', 'D.7', '13'),
    ('13.06', 'Ritenute a garanzia verso subappaltatori', 'passivo', 'SPP', 'D.7', '13'),
    ('13.10', 'IVA su vendite', 'passivo', 'SPP', 'D.12', '13'),
    ('13.11', 'Erario c/IVA a debito', 'passivo', 'SPP', 'D.12', '13'),
    ('13.12', 'Erario c/ritenute', 'passivo', 'SPP', 'D.12', '13'),
    ('13.13', 'Debiti per imposte', 'passivo', 'SPP', 'D.12', '13'),
    ('13.20', 'Debiti verso istituti previdenziali', 'passivo', 'SPP', 'D.13', '13'),
    ('13.30', 'Debiti verso dipendenti', 'passivo', 'SPP', 'D.14', '13'),
    ('13.31', 'Debiti diversi', 'passivo', 'SPP', 'D.14', '13'),
    ('14', 'Ratei e risconti passivi', 'passivo', 'SPP', 'E', NULL),
    ('14.01', 'Ratei passivi', 'passivo', 'SPP', 'E', '14'),
    ('14.02', 'Risconti passivi', 'passivo', 'SPP', 'E', '14'),
    ('20', 'Valore della produzione', 'ricavo', 'CE', 'A', NULL),
    ('20.01', 'Ricavi da lavori e prestazioni', 'ricavo', 'CE', 'A.1', '20'),
    ('20.02', 'Ricavi da vendite', 'ricavo', 'CE', 'A.1', '20'),
    ('20.03', 'Variazione lavori in corso su ordinazione', 'ricavo', 'CE', 'A.3', '20'),
    ('20.04', 'Altri ricavi e proventi', 'ricavo', 'CE', 'A.5', '20'),
    ('20.05', 'Contributi in conto esercizio', 'ricavo', 'CE', 'A.5', '20'),
    ('30', 'Costi della produzione', 'costo', 'CE', 'B', NULL),
    ('30.01', 'Acquisto materiali', 'costo', 'CE', 'B.6', '30'),
    ('30.02', 'Subappalti', 'costo', 'CE', 'B.7', '30'),
    ('30.03', 'Servizi e consulenze', 'costo', 'CE', 'B.7', '30'),
    ('30.04', 'Utenze', 'costo', 'CE', 'B.7', '30'),
    ('30.05', 'Carburanti e trasporti', 'costo', 'CE', 'B.7', '30'),
    ('30.06', 'Noli e godimento beni di terzi', 'costo', 'CE', 'B.8', '30'),
    ('30.07', 'Affitti passivi', 'costo', 'CE', 'B.8', '30'),
    ('30.10', 'Salari e stipendi', 'costo', 'CE', 'B.9.a', '30'),
    ('30.11', 'Oneri sociali', 'costo', 'CE', 'B.9.b', '30'),
    ('30.12', 'Accantonamento TFR', 'costo', 'CE', 'B.9.c', '30'),
    ('30.20', 'Ammortamento immobilizzazioni immateriali', 'costo', 'CE', 'B.10.a', '30'),
    ('30.21', 'Ammortamento immobilizzazioni materiali', 'costo', 'CE', 'B.10.b', '30'),
    ('30.30', 'Variazione delle rimanenze di materiali', 'costo', 'CE', 'B.11', '30'),
    ('30.40', 'Oneri diversi di gestione', 'costo', 'CE', 'B.14', '30'),
    ('40', 'Proventi e oneri finanziari', 'costo', 'CE', 'C', NULL),
    ('40.01', 'Interessi attivi e proventi finanziari', 'ricavo', 'CE', 'C.16', '40'),
    ('40.02', 'Interessi passivi e oneri bancari', 'costo', 'CE', 'C.17', '40'),
    ('50', 'Imposte', 'costo', 'CE', '20', NULL),
    ('50.01', 'Imposte sul reddito dell''esercizio', 'costo', 'CE', '20', '50')
  ), ins AS (
    INSERT INTO public.contabilita_conti (company_id, codice, descrizione, natura, sezione_cee, voce_cee, movimentabile)
    SELECT p_company, codice, descrizione, natura, sezione, voce, mastro IS NOT NULL FROM p
    ON CONFLICT (company_id, codice) DO NOTHING
    RETURNING id
  )
  SELECT count(*) INTO v_n FROM ins;
  UPDATE public.contabilita_conti c SET mastro_id = m.id
    FROM public.contabilita_conti m
   WHERE c.company_id = p_company AND m.company_id = p_company AND c.mastro_id IS NULL
     AND c.codice LIKE '%.%' AND m.codice = split_part(c.codice, '.', 1);
  RETURN v_n;
END $$;

CREATE OR REPLACE FUNCTION public.contabilita_crea_conto(
  p_company uuid, p_codice text, p_descrizione text, p_natura text, p_sezione_cee text, p_voce_cee text, p_mastro uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_id uuid;
BEGIN
  IF NOT public.contabilita_puo_scrivere(p_company) THEN RAISE EXCEPTION 'Accesso negato' USING ERRCODE = '42501'; END IF;
  IF btrim(coalesce(p_codice, '')) = '' OR btrim(coalesce(p_descrizione, '')) = '' THEN
    RAISE EXCEPTION 'Codice e descrizione sono obbligatori' USING ERRCODE = '22023';
  END IF;
  IF p_mastro IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.contabilita_conti WHERE id = p_mastro AND company_id = p_company) THEN
    RAISE EXCEPTION 'Mastro di un''altra azienda' USING ERRCODE = '42501';
  END IF;
  INSERT INTO public.contabilita_conti (company_id, codice, descrizione, natura, sezione_cee, voce_cee, mastro_id)
  VALUES (p_company, btrim(p_codice), btrim(p_descrizione), p_natura, nullif(p_sezione_cee, ''), nullif(btrim(coalesce(p_voce_cee, '')), ''), p_mastro)
  RETURNING id INTO v_id;
  RETURN v_id;
END $$;

CREATE OR REPLACE FUNCTION public.contabilita_inserisci_scrittura(
  p_company uuid, p_data date, p_causale text, p_descrizione text,
  p_documento_numero text, p_documento_data date, p_righe jsonb,
  p_origine text, p_origine_id uuid, p_storno_di uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' SET lock_timeout TO '3s' AS $$
DECLARE v_id uuid; v_num integer; v_es integer; r jsonb; i integer := 0; v_dare numeric; v_avere numeric;
BEGIN
  IF p_data IS NULL OR btrim(coalesce(p_causale, '')) = '' THEN
    RAISE EXCEPTION 'Data e causale sono obbligatorie' USING ERRCODE = '22023';
  END IF;
  IF jsonb_typeof(p_righe) <> 'array' OR jsonb_array_length(p_righe) < 2 THEN
    RAISE EXCEPTION 'Servono almeno due righe' USING ERRCODE = '22023';
  END IF;
  v_es := extract(year FROM p_data)::int;
  PERFORM pg_advisory_xact_lock(hashtextextended('contabilita-numero:' || p_company || ':' || v_es, 0));
  SELECT coalesce(max(numero), 0) + 1 INTO v_num FROM public.contabilita_scritture WHERE company_id = p_company AND esercizio = v_es;
  INSERT INTO public.contabilita_scritture (company_id, esercizio, numero, data_registrazione, causale, descrizione,
                                            documento_numero, documento_data, origine, origine_id, storno_di, created_by)
  VALUES (p_company, v_es, v_num, p_data, btrim(p_causale), nullif(btrim(coalesce(p_descrizione, '')), ''),
          nullif(btrim(coalesce(p_documento_numero, '')), ''), p_documento_data,
          coalesce(p_origine, 'manuale'), p_origine_id, p_storno_di, auth.uid())
  RETURNING id INTO v_id;
  FOR r IN SELECT value FROM jsonb_array_elements(p_righe) LOOP
    i := i + 1;
    v_dare := round(coalesce((r->>'dare')::numeric, 0), 2);
    v_avere := round(coalesce((r->>'avere')::numeric, 0), 2);
    IF NOT EXISTS (SELECT 1 FROM public.contabilita_conti WHERE id = (r->>'conto_id')::uuid AND company_id = p_company AND movimentabile AND attivo) THEN
      RAISE EXCEPTION 'Riga %: conto non valido (va scelto un conto, non un mastro)', i USING ERRCODE = '22023';
    END IF;
    IF (v_dare > 0) = (v_avere > 0) THEN
      RAISE EXCEPTION 'Riga %: indica un importo in dare oppure in avere', i USING ERRCODE = '22023';
    END IF;
    INSERT INTO public.contabilita_righe (scrittura_id, company_id, riga, conto_id, dare, avere, descrizione)
    VALUES (v_id, p_company, i, (r->>'conto_id')::uuid, v_dare, v_avere, nullif(btrim(coalesce(r->>'descrizione', '')), ''));
  END LOOP;
  SELECT sum(dare), sum(avere) INTO v_dare, v_avere FROM public.contabilita_righe WHERE scrittura_id = v_id;
  IF v_dare <> v_avere THEN
    RAISE EXCEPTION 'La scrittura non quadra: dare % e avere %', v_dare, v_avere USING ERRCODE = '23514';
  END IF;
  RETURN v_id;
END $$;

CREATE OR REPLACE FUNCTION public.contabilita_registra_scrittura(
  p_company uuid, p_data date, p_causale text, p_descrizione text,
  p_documento_numero text, p_documento_data date, p_righe jsonb)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  IF NOT public.contabilita_puo_scrivere(p_company) THEN RAISE EXCEPTION 'Accesso negato' USING ERRCODE = '42501'; END IF;
  RETURN public.contabilita_inserisci_scrittura(p_company, p_data, p_causale, p_descrizione,
    p_documento_numero, p_documento_data, p_righe, 'manuale', NULL, NULL);
END $$;

CREATE OR REPLACE FUNCTION public.contabilita_storna_scrittura(p_scrittura uuid, p_data date, p_motivo text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE s public.contabilita_scritture; v_righe jsonb;
BEGIN
  SELECT * INTO s FROM public.contabilita_scritture WHERE id = p_scrittura;
  IF NOT FOUND OR NOT public.contabilita_puo_scrivere(s.company_id) THEN RAISE EXCEPTION 'Accesso negato' USING ERRCODE = '42501'; END IF;
  IF s.storno_di IS NOT NULL THEN RAISE EXCEPTION 'Uno storno non si storna: registra di nuovo la scrittura giusta' USING ERRCODE = '22023'; END IF;
  IF EXISTS (SELECT 1 FROM public.contabilita_scritture WHERE storno_di = p_scrittura) THEN
    RAISE EXCEPTION 'Scrittura già stornata' USING ERRCODE = '22023';
  END IF;
  IF btrim(coalesce(p_motivo, '')) = '' THEN RAISE EXCEPTION 'Serve il motivo dello storno' USING ERRCODE = '22023'; END IF;
  SELECT jsonb_agg(jsonb_build_object('conto_id', conto_id, 'dare', avere, 'avere', dare, 'descrizione', descrizione) ORDER BY riga)
    INTO v_righe FROM public.contabilita_righe WHERE scrittura_id = p_scrittura;
  RETURN public.contabilita_inserisci_scrittura(s.company_id, coalesce(p_data, current_date),
    'Storno n. ' || s.numero || '/' || s.esercizio, btrim(p_motivo), s.documento_numero, s.documento_data,
    v_righe, 'storno', s.id, s.id);
END $$;

REVOKE ALL ON FUNCTION public.contabilita_inserisci_scrittura(uuid, date, text, text, text, date, jsonb, text, uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.contabilita_inserisci_scrittura(uuid, date, text, text, text, date, jsonb, text, uuid, uuid) TO service_role;

REVOKE ALL ON FUNCTION public.contabilita_piano_standard(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.contabilita_crea_conto(uuid, text, text, text, text, text, uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.contabilita_registra_scrittura(uuid, date, text, text, text, date, jsonb) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.contabilita_storna_scrittura(uuid, date, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.contabilita_controlla_quadratura() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.contabilita_immutabile() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.contabilita_piano_standard(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.contabilita_crea_conto(uuid, text, text, text, text, text, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.contabilita_registra_scrittura(uuid, date, text, text, text, date, jsonb) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.contabilita_storna_scrittura(uuid, date, text) TO authenticated, service_role;
