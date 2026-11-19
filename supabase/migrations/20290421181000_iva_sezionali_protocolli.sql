-- Sezionali e protocolli aziendali. Nessuna numerazione dello storico implicita.
SET LOCAL lock_timeout = '3s';
SET LOCAL statement_timeout = '60s';
CREATE TABLE IF NOT EXISTS public.iva_sezionali (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  lato text NOT NULL CHECK(lato IN ('vendite','acquisti')),
  codice text NOT NULL CHECK(length(btrim(codice)) BETWEEN 1 AND 20),
  nome text NOT NULL CHECK(length(btrim(nome)) BETWEEN 1 AND 120),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(company_id,lato,codice), UNIQUE(company_id,id)
);
CREATE TABLE IF NOT EXISTS public.iva_protocolli (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  sezionale_id uuid NOT NULL,
  documento_id uuid NOT NULL,
  lato text NOT NULL CHECK(lato IN ('vendite','acquisti')),
  anno integer NOT NULL CHECK(anno BETWEEN 2000 AND 2100),
  numero integer NOT NULL CHECK(numero > 0),
  data_registrazione date NOT NULL CHECK(extract(year FROM data_registrazione)::int=anno),
  creato_da uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  annullato_il timestamptz,
  annullato_da uuid,
  annullato_motivo text,
  FOREIGN KEY(company_id,sezionale_id) REFERENCES public.iva_sezionali(company_id,id),
  UNIQUE(sezionale_id,anno,numero)
);
CREATE UNIQUE INDEX IF NOT EXISTS iva_protocollo_documento_attivo ON public.iva_protocolli(company_id,lato,documento_id) WHERE annullato_il IS NULL;
CREATE INDEX IF NOT EXISTS iva_protocolli_azienda ON public.iva_protocolli(company_id,data_registrazione);
ALTER TABLE public.iva_sezionali ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.iva_protocolli ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS iva_sezionali_leggi ON public.iva_sezionali;
CREATE POLICY iva_sezionali_leggi ON public.iva_sezionali FOR SELECT TO authenticated USING((SELECT public.contabilita_puo_leggere(company_id)));
DROP POLICY IF EXISTS iva_protocolli_leggi ON public.iva_protocolli;
CREATE POLICY iva_protocolli_leggi ON public.iva_protocolli FOR SELECT TO authenticated USING((SELECT public.contabilita_puo_leggere(company_id)));
REVOKE ALL ON public.iva_sezionali,public.iva_protocolli FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.iva_sezionali,public.iva_protocolli TO authenticated;

CREATE OR REPLACE FUNCTION public.iva_crea_sezionale(p_company uuid,p_lato text,p_codice text,p_nome text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
DECLARE v_id uuid;
BEGIN
  IF public.utente_bloccato() OR NOT public.contabilita_puo_scrivere(p_company) THEN RAISE EXCEPTION 'Non hai il permesso di gestire i registri IVA' USING ERRCODE='42501'; END IF;
  INSERT INTO public.iva_sezionali(company_id,lato,codice,nome) VALUES(p_company,p_lato,upper(btrim(p_codice)),btrim(p_nome)) RETURNING id INTO v_id;
  RETURN v_id;
END $function$;

CREATE OR REPLACE FUNCTION public.iva_assegna_protocollo(p_sezionale uuid,p_documento uuid,p_data date,p_numero integer DEFAULT NULL)
RETURNS public.iva_protocolli LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
DECLARE s public.iva_sezionali; p public.iva_protocolli; v_anno integer; v_numero integer;
BEGIN
  SELECT * INTO s FROM public.iva_sezionali WHERE id=p_sezionale;
  IF NOT FOUND OR public.utente_bloccato() OR NOT public.contabilita_puo_scrivere(s.company_id) THEN RAISE EXCEPTION 'Non hai il permesso di protocollare questa fattura' USING ERRCODE='42501'; END IF;
  v_anno:=extract(year FROM p_data)::int;
  IF p_data IS NULL OR v_anno NOT BETWEEN 2000 AND 2100 OR (p_numero IS NOT NULL AND p_numero<=0) THEN RAISE EXCEPTION 'Data o numero di protocollo non validi' USING ERRCODE='22023'; END IF;
  -- Stesso ordine di lock della generazione e delle chiusure contabili.
  PERFORM pg_advisory_xact_lock(hashtextextended('contabilita-genera:'||s.company_id,0));
  PERFORM 1 FROM public.iva_sezionali WHERE id=s.id FOR UPDATE;
  IF EXISTS(SELECT 1 FROM public.contabilita_esercizi e WHERE e.company_id=s.company_id AND e.anno=v_anno AND (e.chiuso_il IS NOT NULL OR e.stampato_fino_al>=p_data)) THEN
    RAISE EXCEPTION 'Il periodo è definitivo: non è possibile assegnare un nuovo protocollo' USING ERRCODE='22023';
  END IF;
  IF s.lato='acquisti' THEN
    IF NOT EXISTS(SELECT 1 FROM public.fatture_ricevute f WHERE f.id=p_documento AND f.company_id=s.company_id AND f.stato<>'rifiutata') THEN
      RAISE EXCEPTION 'Fattura d’acquisto non disponibile per questa azienda' USING ERRCODE='22023';
    END IF;
  ELSE
    IF NOT EXISTS(SELECT 1 FROM public.fatture_vendite_iva f WHERE f.id=p_documento AND f.company_id=s.company_id AND f.deleted_at IS NULL
                  AND f.stato NOT IN ('bozza','annullata','scartata','rifiutata')
                  AND f.tipo IN ('fattura','fattura_pa','nota_credito','nota_debito','autofattura','fattura_riepilogativa','parcella','fattura_accompagnatoria','reverse_charge_interno','integrazione_servizi_estero','integrazione_beni_ue','integrazione_beni_extra_ue'))
       OR EXISTS(SELECT 1 FROM public.documenti_fiscali d WHERE d.id=p_documento AND d.company_id=s.company_id AND d.sdi_stato='NS') THEN
      RAISE EXCEPTION 'Documento di vendita non disponibile per questa azienda' USING ERRCODE='22023';
    END IF;
  END IF;
  SELECT * INTO p FROM public.iva_protocolli WHERE company_id=s.company_id AND lato=s.lato AND documento_id=p_documento AND annullato_il IS NULL;
  IF FOUND THEN
    IF p.sezionale_id<>s.id OR p.data_registrazione<>p_data OR (p_numero IS NOT NULL AND p.numero<>p_numero) THEN
      RAISE EXCEPTION 'Il documento ha già un protocollo: annulla prima l’assegnazione precedente indicando il motivo' USING ERRCODE='22023';
    END IF;
    RETURN p;
  END IF;
  SELECT coalesce(p_numero,coalesce(max(numero),0)+1) INTO v_numero FROM public.iva_protocolli WHERE sezionale_id=s.id AND anno=v_anno;
  INSERT INTO public.iva_protocolli(company_id,sezionale_id,documento_id,lato,anno,numero,data_registrazione,creato_da)
    VALUES(s.company_id,s.id,p_documento,s.lato,v_anno,v_numero,p_data,auth.uid()) RETURNING * INTO p;
  RETURN p;
END $function$;

CREATE OR REPLACE FUNCTION public.iva_annulla_protocollo(p_protocollo uuid,p_motivo text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
DECLARE p public.iva_protocolli;
BEGIN
  SELECT * INTO p FROM public.iva_protocolli WHERE id=p_protocollo;
  IF NOT FOUND OR public.utente_bloccato() OR NOT public.contabilita_puo_scrivere(p.company_id) THEN RAISE EXCEPTION 'Accesso negato' USING ERRCODE='42501'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('contabilita-genera:'||p.company_id,0));
  SELECT * INTO p FROM public.iva_protocolli WHERE id=p_protocollo FOR UPDATE;
  IF nullif(btrim(p_motivo),'') IS NULL THEN RAISE EXCEPTION 'Indica il motivo dell’annullamento' USING ERRCODE='22023'; END IF;
  IF EXISTS(SELECT 1 FROM public.contabilita_esercizi e WHERE e.company_id=p.company_id AND e.anno=p.anno AND (e.chiuso_il IS NOT NULL OR e.stampato_fino_al>=p.data_registrazione)) THEN
    RAISE EXCEPTION 'Il periodo è definitivo: il protocollo non si annulla' USING ERRCODE='22023';
  END IF;
  UPDATE public.iva_protocolli SET annullato_il=now(),annullato_da=auth.uid(),annullato_motivo=btrim(p_motivo) WHERE id=p.id AND annullato_il IS NULL;
  RETURN p.id;
END $function$;
REVOKE ALL ON FUNCTION public.iva_crea_sezionale(uuid,text,text,text),public.iva_assegna_protocollo(uuid,uuid,date,integer),public.iva_annulla_protocollo(uuid,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.iva_crea_sezionale(uuid,text,text,text),public.iva_assegna_protocollo(uuid,uuid,date,integer),public.iva_annulla_protocollo(uuid,text) TO authenticated,service_role;
