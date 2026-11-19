-- Preparata e verificata localmente. Da promuovere a migrazione prima del rilascio.
-- Le registrazioni provvisorie si correggono con revisione, le definitive con storno.
SET LOCAL lock_timeout = '3s';
SET LOCAL statement_timeout = '60s';

ALTER TABLE public.contabilita_scritture ADD COLUMN IF NOT EXISTS revisione integer NOT NULL DEFAULT 1;
CREATE TABLE IF NOT EXISTS public.contabilita_revisioni (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  scrittura_id uuid NOT NULL,
  operazione text NOT NULL CHECK (operazione IN ('modifica', 'eliminazione')),
  motivo text NOT NULL CHECK (length(btrim(motivo)) > 0),
  prima jsonb NOT NULL,
  autore uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS contabilita_revisioni_azienda_scrittura ON public.contabilita_revisioni(company_id, scrittura_id, id);
ALTER TABLE public.contabilita_revisioni ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS contabilita_revisioni_leggi ON public.contabilita_revisioni;
CREATE POLICY contabilita_revisioni_leggi ON public.contabilita_revisioni FOR SELECT TO authenticated
  USING ((SELECT public.contabilita_puo_leggere(company_id)));
REVOKE ALL ON public.contabilita_revisioni FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.contabilita_revisioni TO authenticated;

-- Solo le RPC del proprietario delle tabelle possono aprire questa possibilità,
-- per una singola scrittura. Nessun GRANT di UPDATE/DELETE al client.
CREATE OR REPLACE FUNCTION public.contabilita_immutabile()
RETURNS trigger LANGUAGE plpgsql SET search_path TO 'public' AS $function$
DECLARE v_id uuid; v_company uuid; v_data date;
BEGIN
  IF TG_TABLE_NAME = 'contabilita_scritture' THEN
    v_id := OLD.id; v_company := OLD.company_id; v_data := OLD.data_registrazione;
  ELSE
    v_id := OLD.scrittura_id; v_company := OLD.company_id;
    SELECT data_registrazione INTO v_data FROM public.contabilita_scritture WHERE id = v_id;
  END IF;
  IF current_user <> (SELECT pg_get_userbyid(relowner) FROM pg_class WHERE oid = TG_RELID)
     OR coalesce(current_setting('app.contabilita_provvisoria', true), '') <> v_id::text
     OR EXISTS (SELECT 1 FROM public.contabilita_esercizi e WHERE e.company_id = v_company
                 AND e.anno = extract(year FROM v_data)::int
                 AND (e.chiuso_il IS NOT NULL OR e.stampato_fino_al >= v_data)) THEN
    RAISE EXCEPTION 'Una scrittura definitiva si corregge con uno storno. Per una provvisoria usa Modifica o Elimina.' USING ERRCODE = '42501';
  END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  IF NEW.company_id <> OLD.company_id THEN RAISE EXCEPTION 'Azienda non modificabile' USING ERRCODE = '42501'; END IF;
  RETURN NEW;
END $function$;

-- Anche il giro automatico usa le revisioni: la correzione deve valere dopo
-- un'importazione o un aggiornamento, oltre che dal pulsante di salvataggio.
CREATE OR REPLACE FUNCTION public.contabilita_rivedi_provvisoria(p_scrittura uuid,p_righe jsonb,p_motivo text)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
DECLARE s public.contabilita_scritture;
BEGIN
  SELECT * INTO s FROM public.contabilita_scritture WHERE id=p_scrittura;
  IF NOT FOUND OR s.storno_di IS NOT NULL OR EXISTS(SELECT 1 FROM public.contabilita_scritture WHERE storno_di=s.id)
     OR EXISTS(SELECT 1 FROM public.contabilita_esercizi WHERE company_id=s.company_id AND anno=s.esercizio
       AND (chiuso_il IS NOT NULL OR stampato_fino_al>=s.data_registrazione)) THEN RETURN false; END IF;
  PERFORM public.contabilita_sostituisci_provvisoria(s.id,s.revisione,to_jsonb(s),p_righe,p_motivo);
  RETURN true;
END $function$;
REVOKE ALL ON FUNCTION public.contabilita_rivedi_provvisoria(uuid,jsonb,text) FROM PUBLIC,anon,authenticated,service_role;

CREATE OR REPLACE FUNCTION public.contabilita_verifica_provvisoria(p_scrittura uuid, p_revisione integer)
RETURNS public.contabilita_scritture LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
DECLARE s public.contabilita_scritture; v_company uuid;
BEGIN
  SELECT company_id INTO v_company FROM public.contabilita_scritture WHERE id = p_scrittura;
  IF v_company IS NULL OR (coalesce(auth.role(), '') <> 'service_role' AND public.utente_bloccato()) OR (NOT public.contabilita_puo_scrivere(v_company) AND coalesce(auth.role(), '') <> 'service_role') THEN
    RAISE EXCEPTION 'Accesso negato' USING ERRCODE = '42501';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('contabilita-genera:' || v_company, 0));
  SELECT * INTO s FROM public.contabilita_scritture WHERE id = p_scrittura FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Scrittura non più presente: ricarica l’elenco' USING ERRCODE = 'PT409'; END IF;
  PERFORM 1 FROM public.contabilita_esercizi WHERE company_id = s.company_id AND anno = s.esercizio FOR UPDATE;
  IF EXISTS (SELECT 1 FROM public.contabilita_esercizi WHERE company_id = s.company_id AND anno = s.esercizio
             AND (chiuso_il IS NOT NULL OR stampato_fino_al >= s.data_registrazione)) THEN
    RAISE EXCEPTION 'Il periodo è definitivo o l’esercizio è chiuso: usa lo storno' USING ERRCODE = '22023';
  END IF;
  IF s.storno_di IS NOT NULL OR EXISTS (SELECT 1 FROM public.contabilita_scritture WHERE storno_di = s.id) THEN
    RAISE EXCEPTION 'La scrittura fa parte di uno storno: il suo storico deve restare completo' USING ERRCODE = '22023';
  END IF;
  IF p_revisione IS NOT NULL AND s.revisione <> p_revisione THEN
    RAISE EXCEPTION 'La scrittura è cambiata: ricaricala prima di correggerla' USING ERRCODE = 'PT409';
  END IF;
  RETURN s;
END $function$;

CREATE OR REPLACE FUNCTION public.contabilita_sostituisci_provvisoria(
  p_scrittura uuid, p_revisione integer, p_dati jsonb, p_righe jsonb, p_motivo text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
DECLARE s public.contabilita_scritture; r jsonb; v_prima jsonb; v_context text;
  v_data date; v_causale text; v_dare numeric; v_avere numeric; v_i integer := 0;
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
    documento_data=(p_dati->>'documento_data')::date,revisione=revisione+1 WHERE id=s.id;
  PERFORM set_config('app.contabilita_provvisoria',coalesce(v_context,''),true);
  RETURN s.id;
END $function$;

CREATE OR REPLACE FUNCTION public.contabilita_modifica_scrittura(
  p_scrittura uuid, p_revisione integer, p_data date, p_causale text, p_descrizione text,
  p_documento_numero text, p_documento_data date, p_righe jsonb)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
DECLARE s public.contabilita_scritture;
BEGIN
  IF p_revisione IS NULL THEN RAISE EXCEPTION 'Ricarica la scrittura prima di modificarla' USING ERRCODE='PT409'; END IF;
  s := public.contabilita_verifica_provvisoria(p_scrittura,p_revisione);
  IF s.origine <> 'manuale' THEN RAISE EXCEPTION 'Correggi i dati nel documento di origine: la scrittura lo seguirà' USING ERRCODE = '22023'; END IF;
  RETURN public.contabilita_sostituisci_provvisoria(s.id,p_revisione,
    jsonb_build_object('data_registrazione',p_data,'causale',p_causale,'descrizione',p_descrizione,'documento_numero',p_documento_numero,'documento_data',p_documento_data),p_righe,'Modifica della scrittura provvisoria');
END $function$;

CREATE OR REPLACE FUNCTION public.contabilita_elimina_scrittura(p_scrittura uuid, p_revisione integer, p_motivo text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
DECLARE s public.contabilita_scritture; v_context text;
BEGIN
  IF p_revisione IS NULL THEN RAISE EXCEPTION 'Ricarica la scrittura prima di eliminarla' USING ERRCODE='PT409'; END IF;
  s := public.contabilita_verifica_provvisoria(p_scrittura,p_revisione);
  IF s.origine <> 'manuale' THEN RAISE EXCEPTION 'La scrittura nasce da un documento: correggi quel documento per mantenere i saldi allineati' USING ERRCODE = '22023'; END IF;
  IF nullif(btrim(p_motivo),'') IS NULL THEN RAISE EXCEPTION 'Indica il motivo dell’eliminazione' USING ERRCODE = '22023'; END IF;
  INSERT INTO public.contabilita_revisioni(company_id,scrittura_id,operazione,motivo,prima,autore)
    VALUES(s.company_id,s.id,'eliminazione',btrim(p_motivo),to_jsonb(s) || jsonb_build_object('righe',
      (SELECT jsonb_agg(to_jsonb(x) ORDER BY riga) FROM public.contabilita_righe x WHERE scrittura_id=s.id)),auth.uid());
  v_context := current_setting('app.contabilita_provvisoria',true);
  PERFORM set_config('app.contabilita_provvisoria',s.id::text,true);
  DELETE FROM public.contabilita_righe WHERE scrittura_id=s.id;
  DELETE FROM public.contabilita_scritture WHERE id=s.id;
  PERFORM set_config('app.contabilita_provvisoria',coalesce(v_context,''),true);
  RETURN s.id;
END $function$;

REVOKE ALL ON FUNCTION public.contabilita_verifica_provvisoria(uuid,integer) FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.contabilita_sostituisci_provvisoria(uuid,integer,jsonb,jsonb,text) FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.contabilita_modifica_scrittura(uuid,integer,date,text,text,text,date,jsonb) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.contabilita_elimina_scrittura(uuid,integer,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.contabilita_modifica_scrittura(uuid,integer,date,text,text,text,date,jsonb),public.contabilita_elimina_scrittura(uuid,integer,text) TO authenticated,service_role;

CREATE OR REPLACE FUNCTION public.contabilita_salva_conti_fattura(p_fattura uuid,p_conti jsonb,p_precedenti jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path TO 'public' AS $function$
DECLARE f public.fatture_ricevute; r record; v_id uuid; v_esito jsonb;
BEGIN
  SELECT * INTO f FROM public.fatture_ricevute WHERE id=p_fattura;
  IF NOT FOUND THEN RAISE EXCEPTION 'Fattura non disponibile per questa azienda' USING ERRCODE='42501'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('contabilita-genera:'||f.company_id,0));
  SELECT * INTO f FROM public.fatture_ricevute WHERE id=p_fattura FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'La fattura non è più disponibile: ricarica' USING ERRCODE='PT409'; END IF;
  IF jsonb_typeof(p_conti) IS DISTINCT FROM 'object' OR p_precedenti IS NULL THEN
    RAISE EXCEPTION 'Conti delle righe non validi' USING ERRCODE='22023';
  END IF;
  IF f.conti_righe IS DISTINCT FROM p_precedenti THEN
    RAISE EXCEPTION 'I conti della fattura sono cambiati in un’altra sessione: ricarica prima di salvare' USING ERRCODE='PT409';
  END IF;
  FOR r IN SELECT key,value FROM jsonb_each(p_conti) LOOP
    IF jsonb_typeof(r.value) <> 'string' THEN RAISE EXCEPTION 'Conto di riga non valido' USING ERRCODE='22023'; END IF;
    IF (r.value#>>'{}') LIKE 'conto:%' AND NOT EXISTS (SELECT 1 FROM public.contabilita_conti c
      WHERE c.id=substring(r.value#>>'{}' FROM 7)::uuid AND c.company_id=f.company_id AND c.movimentabile AND c.attivo AND c.natura='costo') THEN
      RAISE EXCEPTION 'Conto di costo non disponibile per questa azienda' USING ERRCODE='22023';
    END IF;
  END LOOP;
  IF p_conti=f.conti_righe THEN RETURN jsonb_build_object('aggiornate',0,'stornate',0); END IF;
  UPDATE public.fatture_ricevute SET conti_righe=p_conti WHERE id=f.id AND company_id=f.company_id RETURNING id INTO v_id;
  IF v_id IS NULL THEN RAISE EXCEPTION 'Non hai il permesso di modificare questa fattura' USING ERRCODE='42501'; END IF;
  v_esito := public.contabilita_riregistra_documento(f.company_id,f.id,'Conti di costo della fattura aggiornati');
  RETURN v_esito;
END $function$;
REVOKE ALL ON FUNCTION public.contabilita_salva_conti_fattura(uuid,jsonb,jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.contabilita_salva_conti_fattura(uuid,jsonb,jsonb) TO authenticated,service_role;

create or replace function public.contabilita_riregistra_documento(p_company uuid, p_documento uuid, p_motivo text)
returns jsonb language plpgsql security definer set search_path to 'public' as $function$
DECLARE s record; v_anno int; v_stornate int := 0; v_esito jsonb; v_vecchia public.contabilita_scritture; v_nuova public.contabilita_scritture; v_righe jsonb; v_context text;
BEGIN
  IF coalesce(auth.role(), '') <> 'service_role' AND (auth.uid() IS NULL OR public.user_can_access_company(p_company) IS NOT TRUE) THEN
    RAISE EXCEPTION 'Accesso negato' USING ERRCODE = '42501';
  END IF;
  -- Niente in contabilità per questo documento: non c'è niente da rifare, per nessuno.
  IF NOT EXISTS (SELECT 1 FROM public.contabilita_scritture c
                  WHERE c.company_id = p_company AND c.origine_id = p_documento AND c.origine IN ('fattura_emessa', 'fattura_ricevuta')
                    AND NOT EXISTS (SELECT 1 FROM public.contabilita_scritture t WHERE t.storno_di = c.id)) THEN
    RETURN jsonb_build_object('stornate', 0, 'registrata', false);
  END IF;
  IF NOT public.contabilita_puo_scrivere(p_company) AND coalesce(auth.role(), '') <> 'service_role' THEN
    RAISE EXCEPTION 'Accesso negato' USING ERRCODE = '42501';
  END IF;
  -- Una registrazione alla volta per azienda: con il giro automatico e un'altra scheda aperta non nascono doppioni.
  PERFORM pg_advisory_xact_lock(hashtextextended('contabilita-genera:' || p_company, 0));
  -- In un periodo ancora provvisorio si conserva numero e identità della
  -- registrazione, con una revisione nello storico tecnico. Il generatore
  -- esistente resta l'unica fonte di calcolo dei conti e degli importi.
  IF (SELECT count(*) FROM public.contabilita_scritture c WHERE c.company_id=p_company AND c.origine_id=p_documento
        AND c.origine IN ('fattura_emessa','fattura_ricevuta') AND NOT EXISTS
          (SELECT 1 FROM public.contabilita_scritture t WHERE t.storno_di=c.id)) = 1 THEN
    SELECT * INTO v_vecchia FROM public.contabilita_scritture c WHERE c.company_id=p_company AND c.origine_id=p_documento
      AND c.origine IN ('fattura_emessa','fattura_ricevuta') AND NOT EXISTS
        (SELECT 1 FROM public.contabilita_scritture t WHERE t.storno_di=c.id);
    IF NOT EXISTS (SELECT 1 FROM public.contabilita_esercizi e WHERE e.company_id=p_company AND e.anno=v_vecchia.esercizio
                   AND (e.chiuso_il IS NOT NULL OR e.stampato_fino_al >= v_vecchia.data_registrazione)) THEN
      v_vecchia := public.contabilita_verifica_provvisoria(v_vecchia.id,v_vecchia.revisione);
      v_context := current_setting('app.contabilita_provvisoria',true);
      PERFORM set_config('app.contabilita_provvisoria',v_vecchia.id::text,true);
      UPDATE public.contabilita_scritture SET origine='aggiornamento_provvisorio' WHERE id=v_vecchia.id;
      v_esito := public.contabilita_genera_da_documenti(p_company,v_vecchia.esercizio,p_documento);
      IF jsonb_array_length(coalesce(v_esito->'errori','[]'::jsonb)) > 0 THEN
        RAISE EXCEPTION 'Documento non aggiornato: %',v_esito->'errori' USING ERRCODE='22023';
      END IF;
      SELECT * INTO v_nuova FROM public.contabilita_scritture c WHERE c.company_id=p_company AND c.origine_id=p_documento
        AND c.origine=v_vecchia.origine AND NOT EXISTS (SELECT 1 FROM public.contabilita_scritture t WHERE t.storno_di=c.id);
      IF v_nuova.id IS NULL THEN RAISE EXCEPTION 'Il documento è incompleto: la scrittura precedente resta invariata' USING ERRCODE='22023'; END IF;
      SELECT jsonb_agg(jsonb_build_object('conto_id',conto_id,'dare',dare,'avere',avere,'descrizione',descrizione) ORDER BY riga)
        INTO v_righe FROM public.contabilita_righe WHERE scrittura_id=v_nuova.id;
      -- La nuova registrazione è solo una validazione interna alla transazione.
      -- Non appare al client e non consuma un numero del giornale.
      PERFORM set_config('app.contabilita_provvisoria',v_nuova.id::text,true);
      DELETE FROM public.contabilita_righe WHERE scrittura_id=v_nuova.id;
      DELETE FROM public.contabilita_scritture WHERE id=v_nuova.id;
      PERFORM set_config('app.contabilita_provvisoria',v_vecchia.id::text,true);
      UPDATE public.contabilita_scritture SET origine=v_vecchia.origine WHERE id=v_vecchia.id;
      PERFORM set_config('app.contabilita_provvisoria',coalesce(v_context,''),true);
      IF NOT public.contabilita_righe_uguali(v_vecchia.id,v_righe)
         OR v_vecchia.data_registrazione IS DISTINCT FROM v_nuova.data_registrazione
         OR v_vecchia.causale IS DISTINCT FROM v_nuova.causale
         OR v_vecchia.documento_numero IS DISTINCT FROM v_nuova.documento_numero
         OR v_vecchia.documento_data IS DISTINCT FROM v_nuova.documento_data THEN
        PERFORM public.contabilita_sostituisci_provvisoria(v_vecchia.id,v_vecchia.revisione,to_jsonb(v_nuova),v_righe,
          coalesce(nullif(btrim(p_motivo),''),'Aggiornamento del documento'));
        RETURN jsonb_build_object('stornate',0,'aggiornate',1,'esito',v_esito);
      END IF;
      RETURN jsonb_build_object('stornate',0,'aggiornate',0,'esito',v_esito);
    END IF;
  END IF;
  FOR s IN
    SELECT * FROM public.contabilita_scritture c
     WHERE c.company_id = p_company AND c.origine_id = p_documento AND c.origine IN ('fattura_emessa', 'fattura_ricevuta')
       AND NOT EXISTS (SELECT 1 FROM public.contabilita_scritture t WHERE t.storno_di = c.id)
  LOOP
    v_anno := s.esercizio;
    -- Alla data della scrittura (il primo giorno libero se il giornale è stampato fin lì): storno e
    -- scrittura nuova restano nello stesso esercizio.
    PERFORM public.contabilita_inserisci_scrittura(s.company_id, public.contabilita_data_utile(s.company_id, s.data_registrazione), 'Storno n. ' || s.numero || '/' || s.esercizio,
      coalesce(nullif(btrim(p_motivo), ''), 'Documento registrato di nuovo'), s.documento_numero, s.documento_data,
      (SELECT jsonb_agg(jsonb_build_object('conto_id', conto_id, 'dare', avere, 'avere', dare, 'descrizione', descrizione) ORDER BY riga)
         FROM public.contabilita_righe WHERE scrittura_id = s.id),
      'storno', s.id, s.id);
    v_stornate := v_stornate + 1;
  END LOOP;
  IF v_anno IS NULL THEN
    RETURN jsonb_build_object('stornate', 0, 'registrata', false);
  END IF;
  v_esito := public.contabilita_genera_da_documenti(p_company, v_anno, p_documento);
  IF jsonb_array_length(coalesce(v_esito->'errori', '[]'::jsonb)) > 0
     OR coalesce((v_esito->>'fatture_emesse')::int, 0) + coalesce((v_esito->>'fatture_ricevute')::int, 0) = 0 THEN
    RAISE EXCEPTION 'Il documento non si può registrare di nuovo (%): la scrittura di prima resta com''era',
      coalesce(v_esito->'errori'->>0, 'nessuna scrittura generata') USING ERRCODE = '22023';
  END IF;
  RETURN jsonb_build_object('stornate', v_stornate, 'esito', v_esito);
END $function$;
