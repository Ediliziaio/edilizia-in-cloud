-- Correggere il giornale anche quando la scrittura nasce da un documento (25/11/2026).
-- Prima: una scrittura da fattura, incasso o cedolino non si poteva né modificare né
-- eliminare («correggi il documento di origine»), e l'unica via era rifare il documento.
-- Adesso, finché il periodo è provvisorio (esercizio aperto e non stampato):
--   · «Modifica» riscrive la scrittura e la segna «a mano»: la generazione automatica
--     non la tocca più, finché non si chiede di riallinearla al documento;
--   · «Elimina» la toglie dal giornale e tiene quel documento fuori (contabilita_escluse)
--     finché non lo si riprende: senza questo, la generazione successiva lo riscriverebbe.
-- Periodo stampato o esercizio chiuso: resta lo storno, come prima.
SET LOCAL lock_timeout = '3s';
SET LOCAL statement_timeout = '60s';

ALTER TABLE public.contabilita_scritture ADD COLUMN IF NOT EXISTS a_mano boolean NOT NULL DEFAULT false;
COMMENT ON COLUMN public.contabilita_scritture.a_mano IS
  'Scrittura nata da un documento e corretta a mano: la generazione automatica la lascia stare.';

CREATE TABLE IF NOT EXISTS public.contabilita_escluse (
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  origine text NOT NULL CHECK (origine <> 'manuale' AND length(btrim(origine)) > 0),
  origine_id uuid NOT NULL,
  esercizio integer,
  documento_numero text,
  descrizione text,
  motivo text NOT NULL CHECK (length(btrim(motivo)) > 0),
  autore uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (company_id, origine, origine_id)
);
COMMENT ON TABLE public.contabilita_escluse IS
  'Documenti tenuti fuori dal giornale dopo l''eliminazione della loro scrittura provvisoria.';
ALTER TABLE public.contabilita_escluse ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS contabilita_escluse_leggi ON public.contabilita_escluse;
CREATE POLICY contabilita_escluse_leggi ON public.contabilita_escluse FOR SELECT TO authenticated
  USING ((SELECT public.contabilita_puo_leggere(company_id)));
REVOKE ALL ON public.contabilita_escluse FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.contabilita_escluse TO authenticated;

-- La generazione passa tutta di qui: un documento escluso non torna nel giornale.
-- Vale solo per le scritture automatiche con un documento dietro (origine_id), mai
-- per le manuali e mai per gli storni.
CREATE OR REPLACE FUNCTION public.contabilita_inserisci_scrittura(p_company uuid, p_data date, p_causale text, p_descrizione text, p_documento_numero text, p_documento_data date, p_righe jsonb, p_origine text, p_origine_id uuid, p_storno_di uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
 SET lock_timeout TO '3s'
AS $function$
DECLARE v_id uuid; v_num integer; v_es integer; r jsonb; i integer := 0; v_dare numeric; v_avere numeric;
BEGIN
  IF p_data IS NULL OR btrim(coalesce(p_causale, '')) = '' THEN
    RAISE EXCEPTION 'Data e causale sono obbligatorie' USING ERRCODE = '22023';
  END IF;
  IF coalesce(p_origine, 'manuale') <> 'manuale' AND p_origine_id IS NOT NULL AND p_storno_di IS NULL
     AND EXISTS (SELECT 1 FROM public.contabilita_escluse x
                  WHERE x.company_id = p_company AND x.origine = p_origine AND x.origine_id = p_origine_id) THEN
    RETURN NULL;
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
END $function$;

-- Eliminare una scrittura provvisoria: se nasce da un documento, quel documento resta
-- fuori dal giornale (col motivo) finché non lo si riprende.
CREATE OR REPLACE FUNCTION public.contabilita_elimina_scrittura(p_scrittura uuid, p_revisione integer, p_motivo text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE s public.contabilita_scritture; v_context text;
BEGIN
  IF p_revisione IS NULL THEN RAISE EXCEPTION 'Ricarica la scrittura prima di eliminarla' USING ERRCODE='PT409'; END IF;
  s := public.contabilita_verifica_provvisoria(p_scrittura,p_revisione);
  IF nullif(btrim(p_motivo),'') IS NULL THEN RAISE EXCEPTION 'Indica il motivo dell’eliminazione' USING ERRCODE = '22023'; END IF;
  IF s.origine = 'storno' THEN RAISE EXCEPTION 'Uno storno non si elimina' USING ERRCODE = '22023'; END IF;
  INSERT INTO public.contabilita_revisioni(company_id,scrittura_id,operazione,motivo,prima,autore)
    VALUES(s.company_id,s.id,'eliminazione',btrim(p_motivo),to_jsonb(s) || jsonb_build_object('righe',
      (SELECT jsonb_agg(to_jsonb(x) ORDER BY riga) FROM public.contabilita_righe x WHERE scrittura_id=s.id)),auth.uid());
  IF s.origine <> 'manuale' AND s.origine_id IS NOT NULL THEN
    INSERT INTO public.contabilita_escluse(company_id,origine,origine_id,esercizio,documento_numero,descrizione,motivo,autore)
      VALUES(s.company_id,s.origine,s.origine_id,s.esercizio,s.documento_numero,s.descrizione,btrim(p_motivo),auth.uid())
      ON CONFLICT (company_id,origine,origine_id) DO UPDATE
        SET motivo = excluded.motivo, autore = excluded.autore, created_at = now();
  END IF;
  v_context := current_setting('app.contabilita_provvisoria',true);
  PERFORM set_config('app.contabilita_provvisoria',s.id::text,true);
  DELETE FROM public.contabilita_righe WHERE scrittura_id=s.id;
  DELETE FROM public.contabilita_scritture WHERE id=s.id;
  PERFORM set_config('app.contabilita_provvisoria',coalesce(v_context,''),true);
  RETURN s.id;
END $function$;

-- Una scrittura da documento corretta a mano resta com'è: la generazione la salta.
CREATE OR REPLACE FUNCTION public.contabilita_rivedi_provvisoria(p_scrittura uuid,p_righe jsonb,p_motivo text)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
DECLARE s public.contabilita_scritture; v_context text;
BEGIN
  SELECT * INTO s FROM public.contabilita_scritture WHERE id=p_scrittura;
  IF NOT FOUND OR s.storno_di IS NOT NULL OR EXISTS(SELECT 1 FROM public.contabilita_scritture WHERE storno_di=s.id)
     OR EXISTS(SELECT 1 FROM public.contabilita_esercizi WHERE company_id=s.company_id AND anno=s.esercizio
       AND (chiuso_il IS NOT NULL OR stampato_fino_al>=s.data_registrazione)) THEN RETURN false; END IF;
  IF s.a_mano THEN RETURN true; END IF;
  -- Questa revisione la chiede la generazione, non una persona: la scrittura resta automatica.
  v_context := current_setting('app.contabilita_revisione_automatica', true);
  PERFORM set_config('app.contabilita_revisione_automatica', s.id::text, true);
  PERFORM public.contabilita_sostituisci_provvisoria(s.id,s.revisione,to_jsonb(s),p_righe,p_motivo);
  PERFORM set_config('app.contabilita_revisione_automatica', coalesce(v_context,''), true);
  RETURN true;
END $function$;

-- Modifica a mano: se la scrittura nasce da un documento, da qui in poi è sua.
CREATE OR REPLACE FUNCTION public.contabilita_sostituisci_provvisoria(p_scrittura uuid, p_revisione integer, p_dati jsonb, p_righe jsonb, p_motivo text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE s public.contabilita_scritture; r jsonb; v_prima jsonb; v_context text;
  v_data date; v_causale text; v_dare numeric; v_avere numeric; v_i integer := 0; v_a_mano boolean;
BEGIN
  s := public.contabilita_verifica_provvisoria(p_scrittura, p_revisione);
  IF nullif(btrim(p_motivo), '') IS NULL THEN RAISE EXCEPTION 'Indica il motivo della correzione' USING ERRCODE = '22023'; END IF;
  v_data := (p_dati->>'data_registrazione')::date;
  v_causale := nullif(btrim(p_dati->>'causale'), '');
  IF v_data IS NULL OR extract(year FROM v_data)::int <> s.esercizio OR v_causale IS NULL THEN
    RAISE EXCEPTION 'Indica data nello stesso esercizio e causale' USING ERRCODE = '22023';
  END IF;
  IF EXISTS (SELECT 1 FROM public.contabilita_esercizi WHERE company_id = s.company_id AND anno = s.esercizio AND stampato_fino_al >= v_data) THEN
    RAISE EXCEPTION 'La nuova data è in un periodo definitivo' USING ERRCODE = '22023';
  END IF;
  IF jsonb_typeof(p_righe) IS DISTINCT FROM 'array' OR jsonb_array_length(p_righe) < 2 THEN
    RAISE EXCEPTION 'Servono almeno due righe in Dare/Avere' USING ERRCODE = '22023';
  END IF;
  FOR r IN SELECT value FROM jsonb_array_elements(p_righe) LOOP
    IF NOT EXISTS (SELECT 1 FROM public.contabilita_conti WHERE id = (r->>'conto_id')::uuid AND company_id = s.company_id AND movimentabile AND attivo) THEN
      RAISE EXCEPTION 'Conto non valido per questa azienda' USING ERRCODE = '22023';
    END IF;
    v_dare := coalesce((r->>'dare')::numeric, 0); v_avere := coalesce((r->>'avere')::numeric, 0);
    IF v_dare::text IN ('NaN','Infinity','-Infinity') OR v_avere::text IN ('NaN','Infinity','-Infinity')
       OR v_dare < 0 OR v_avere < 0 OR (v_dare > 0) = (v_avere > 0)
       OR round(v_dare, 2) <> v_dare OR round(v_avere, 2) <> v_avere THEN
      RAISE EXCEPTION 'Ogni riga richiede un importo valido in Dare oppure in Avere' USING ERRCODE = '22023';
    END IF;
  END LOOP;
  SELECT sum(coalesce((x->>'dare')::numeric,0)), sum(coalesce((x->>'avere')::numeric,0))
    INTO v_dare,v_avere FROM jsonb_array_elements(p_righe) x;
  IF v_dare <> v_avere THEN RAISE EXCEPTION 'La scrittura non quadra' USING ERRCODE = '23514'; END IF;
  -- La revisione automatica passa di qui: non è una correzione a mano.
  v_a_mano := s.a_mano OR (s.origine <> 'manuale'
    AND coalesce(current_setting('app.contabilita_revisione_automatica', true), '') <> s.id::text);
  v_prima := to_jsonb(s) || jsonb_build_object('righe', (SELECT jsonb_agg(to_jsonb(x) ORDER BY riga) FROM public.contabilita_righe x WHERE scrittura_id=s.id));
  INSERT INTO public.contabilita_revisioni(company_id,scrittura_id,operazione,motivo,prima,autore)
    VALUES(s.company_id,s.id,'modifica',btrim(p_motivo),v_prima,auth.uid());
  v_context := current_setting('app.contabilita_provvisoria',true);
  PERFORM set_config('app.contabilita_provvisoria',s.id::text,true);
  DELETE FROM public.contabilita_righe WHERE scrittura_id=s.id;
  FOR r IN SELECT value FROM jsonb_array_elements(p_righe) LOOP
    v_i := v_i+1;
    INSERT INTO public.contabilita_righe(scrittura_id,company_id,riga,conto_id,dare,avere,descrizione)
      VALUES(s.id,s.company_id,v_i,(r->>'conto_id')::uuid,coalesce((r->>'dare')::numeric,0),coalesce((r->>'avere')::numeric,0),nullif(btrim(r->>'descrizione'),''));
  END LOOP;
  UPDATE public.contabilita_scritture SET data_registrazione=v_data,causale=v_causale,
    descrizione=nullif(btrim(p_dati->>'descrizione'),''),documento_numero=nullif(btrim(p_dati->>'documento_numero'),''),
    documento_data=(p_dati->>'documento_data')::date,revisione=revisione+1,a_mano=v_a_mano WHERE id=s.id;
  PERFORM set_config('app.contabilita_provvisoria',coalesce(v_context,''),true);
  RETURN s.id;
END $function$;

-- Riallineare al documento: la prossima generazione riscrive la scrittura.
CREATE OR REPLACE FUNCTION public.contabilita_riallinea_scrittura(p_scrittura uuid)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
DECLARE s public.contabilita_scritture; v_context text;
BEGIN
  SELECT * INTO s FROM public.contabilita_scritture WHERE id = p_scrittura;
  IF NOT FOUND THEN RETURN false; END IF;
  IF public.utente_bloccato() OR NOT public.contabilita_puo_scrivere(s.company_id) THEN
    RAISE EXCEPTION 'Accesso negato' USING ERRCODE = '42501';
  END IF;
  -- Il giornale è immutabile: l'unica via è il varco delle provvisorie.
  v_context := current_setting('app.contabilita_provvisoria', true);
  PERFORM set_config('app.contabilita_provvisoria', s.id::text, true);
  UPDATE public.contabilita_scritture SET a_mano = false WHERE id = s.id;
  PERFORM set_config('app.contabilita_provvisoria', coalesce(v_context,''), true);
  RETURN true;
END $function$;

-- Riprendere un documento tenuto fuori: la prossima generazione lo registra di nuovo.
CREATE OR REPLACE FUNCTION public.contabilita_riprendi_documento(p_company uuid, p_origine text, p_origine_id uuid)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
BEGIN
  IF public.utente_bloccato() OR NOT public.contabilita_puo_scrivere(p_company) THEN
    RAISE EXCEPTION 'Accesso negato' USING ERRCODE = '42501';
  END IF;
  DELETE FROM public.contabilita_escluse
   WHERE company_id = p_company AND origine = p_origine AND origine_id = p_origine_id;
  RETURN FOUND;
END $function$;

REVOKE ALL ON FUNCTION public.contabilita_riallinea_scrittura(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.contabilita_riallinea_scrittura(uuid) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.contabilita_riprendi_documento(uuid, text, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.contabilita_riprendi_documento(uuid, text, uuid) TO authenticated, service_role;

-- Un accredito POS tenuto fuori dal giornale non si contabilizza in silenzio:
-- contabilita_inserisci_scrittura torna NULL e questa funzione lo deve dire.
CREATE OR REPLACE FUNCTION public.cassa_in_cloud_contabilizza_pos(p_company_id uuid, p_id uuid, p_banca uuid, p_commissioni_conto uuid DEFAULT NULL::uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  a public.cassa_in_cloud_accrediti_pos;
  t public.bank_transactions;
  v_id uuid;
  v_accreditato numeric;
  v_righe jsonb;
  v_pos jsonb;
BEGIN
  PERFORM private.bank_operativa_access(p_company_id,true);
  IF public.contabilita_puo_scrivere(p_company_id) IS NOT TRUE OR NOT EXISTS(
      SELECT 1 FROM public.companies c WHERE c.id=p_company_id AND c.deleted_at IS NULL AND c.contabilita_generale_attiva
  ) THEN RAISE EXCEPTION 'Serve il permesso di registrare in Contabilità generale.' USING ERRCODE = '42501'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(p_company_id::text,2810));
  PERFORM pg_advisory_xact_lock(hashtextextended('contabilita-genera:' || p_company_id,0));
  SELECT * INTO a FROM public.cassa_in_cloud_accrediti_pos WHERE id=p_id AND company_id=p_company_id AND scollegato_il IS NULL FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Accredito non disponibile.' USING ERRCODE = '22023'; END IF;
  IF a.scrittura_id IS NOT NULL THEN RETURN a.scrittura_id; END IF;

  SELECT * INTO t FROM public.bank_transactions WHERE id=a.bank_transaction_id AND company_id=p_company_id FOR UPDATE;
  IF NOT FOUND OR t.reconciliation_status IS DISTINCT FROM 'reconciled' OR t.chiuso_senza_documento IS DISTINCT FROM 'nessun_costo' THEN
    RAISE EXCEPTION 'L’abbinamento bancario è cambiato.' USING ERRCODE = '22023';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.contabilita_conti c WHERE c.id=p_banca AND c.company_id=p_company_id
      AND c.natura='attivo' AND c.movimentabile AND c.attivo) OR (a.commissioni>0 AND NOT EXISTS(
    SELECT 1 FROM public.contabilita_conti c WHERE c.id=p_commissioni_conto AND c.company_id=p_company_id
      AND c.natura='costo' AND c.movimentabile AND c.attivo
  )) THEN RAISE EXCEPTION 'Scegli il conto bancario e il conto per le commissioni.' USING ERRCODE = '22023'; END IF;

  WITH quote AS (
    SELECT q.pos, (
      SELECT r.conto_id FROM public.cassa_in_cloud_scritture l
        JOIN public.contabilita_righe r ON r.scrittura_id=l.scrittura_id AND r.company_id=l.company_id
        WHERE l.company_id=q.company_id AND l.punto_vendita_id=q.punto_vendita_id AND l.cassa_id=q.cassa_id AND l.giorno=q.giorno
          AND l.versione=q.versione AND r.descrizione='POS da accreditare' AND r.dare=q.pos AND r.avere=0
          AND NOT EXISTS(SELECT 1 FROM public.contabilita_scritture rev WHERE rev.storno_di=l.scrittura_id)
    ) conto
    FROM public.cassa_in_cloud_chiusure_pos q WHERE q.accredito_id=a.id AND q.company_id=p_company_id
  ), saldi AS (
    SELECT conto,sum(pos) importo FROM quote WHERE conto IS NOT NULL AND conto <> p_banca GROUP BY conto
  )
  SELECT coalesce(sum(importo),0), jsonb_agg(jsonb_build_object(
    'conto_id',conto,'dare',0,'avere',importo,'descrizione','Chiusura POS da accreditare') ORDER BY conto)
    INTO v_accreditato,v_pos FROM saldi;
  IF v_accreditato<>a.lordo THEN
    RAISE EXCEPTION 'Registra le scritture delle chiusure con conti POS distinti dal conto bancario e verifica le versioni.' USING ERRCODE = '22023';
  END IF;

  v_righe := jsonb_build_array(jsonb_build_object('conto_id',p_banca,'dare',a.netto,'avere',0,'descrizione','Accredito netto POS'));
  IF a.commissioni>0 THEN
    v_righe := v_righe || jsonb_build_array(jsonb_build_object(
      'conto_id',p_commissioni_conto,'dare',a.commissioni,'avere',0,'descrizione','Commissioni POS'));
  END IF;
  v_id := public.contabilita_inserisci_scrittura(p_company_id,coalesce(t.booking_date,t.value_date),'Accredito POS',
      t.description,null,coalesce(t.booking_date,t.value_date),v_righe||v_pos,'accredito_pos',a.id,null);
  IF v_id IS NULL THEN
    RAISE EXCEPTION 'Questo accredito è tenuto fuori dal giornale: riprendilo dalla Contabilità generale prima di registrarlo.' USING ERRCODE = '22023';
  END IF;
  UPDATE public.cassa_in_cloud_accrediti_pos SET scrittura_id=v_id WHERE id=a.id;
  RETURN v_id;
END $function$;

-- La modifica dalla pagina passa di qui: non rifiuta più le scritture da documento.
-- Se il periodo è provvisorio la scrittura si corregge e resta «a mano».
CREATE OR REPLACE FUNCTION public.contabilita_modifica_scrittura(p_scrittura uuid, p_revisione integer, p_data date, p_causale text, p_descrizione text, p_documento_numero text, p_documento_data date, p_righe jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE s public.contabilita_scritture;
BEGIN
  IF p_revisione IS NULL THEN RAISE EXCEPTION 'Ricarica la scrittura prima di modificarla' USING ERRCODE='PT409'; END IF;
  s := public.contabilita_verifica_provvisoria(p_scrittura,p_revisione);
  IF s.origine = 'storno' THEN RAISE EXCEPTION 'Uno storno non si modifica' USING ERRCODE = '22023'; END IF;
  RETURN public.contabilita_sostituisci_provvisoria(s.id,p_revisione,
    jsonb_build_object('data_registrazione',p_data,'causale',p_causale,'descrizione',p_descrizione,'documento_numero',p_documento_numero,'documento_data',p_documento_data),p_righe,
    CASE WHEN s.origine = 'manuale' THEN 'Modifica della scrittura provvisoria' ELSE 'Correzione a mano di una scrittura da documento' END);
END $function$;
