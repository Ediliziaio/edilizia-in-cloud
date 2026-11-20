SET LOCAL lock_timeout = '3s';
SET LOCAL statement_timeout = '60s';

-- L'inclusione è esplicita per le scritture di assestamento: fatture e costi
-- già acquisiti dal gestionale conservano la loro fonte.
CREATE TABLE IF NOT EXISTS private.cg_scritture_assestamento (
  scrittura_id uuid PRIMARY KEY REFERENCES public.contabilita_scritture(id) ON DELETE CASCADE,
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  autore uuid NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE private.cg_scritture_assestamento ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON private.cg_scritture_assestamento FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.contabilita_raccordo_cdg(p_company uuid,p_scrittura uuid,p_includi boolean DEFAULT NULL)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path TO '' AS $$
BEGIN
  IF public.contabilita_puo_leggere(p_company) IS NOT TRUE OR NOT EXISTS (
      SELECT 1 FROM public.contabilita_scritture s WHERE s.id=p_scrittura AND s.company_id=p_company
        AND s.origine='manuale' AND s.storno_di IS NULL
  ) THEN RAISE EXCEPTION 'Scrittura non disponibile' USING ERRCODE = '42501'; END IF;
  IF p_includi IS NOT NULL THEN
    IF public.contabilita_puo_scrivere(p_company) IS NOT TRUE THEN RAISE EXCEPTION 'Accesso in sola lettura' USING ERRCODE = '42501'; END IF;
    IF p_includi THEN
      INSERT INTO private.cg_scritture_assestamento(scrittura_id,company_id,autore) VALUES(p_scrittura,p_company,auth.uid())
        ON CONFLICT(scrittura_id) DO NOTHING;
    ELSE
      DELETE FROM private.cg_scritture_assestamento a WHERE a.scrittura_id=p_scrittura AND a.company_id=p_company;
    END IF;
  END IF;
  RETURN EXISTS (SELECT 1 FROM private.cg_scritture_assestamento a WHERE a.scrittura_id=p_scrittura AND a.company_id=p_company);
END $$;

CREATE OR REPLACE FUNCTION private.cg_righe_da_contabilita(p_company uuid,p_anno int,p_da int,p_al int)
RETURNS TABLE(id uuid, data date, codice text, descrizione text, importo numeric)
LANGUAGE sql STABLE SET search_path TO '' AS $$
  WITH righe AS (
    SELECT r.id,s.data_registrazione data,coalesce(r.descrizione,c.descrizione) descrizione,
      CASE
        WHEN coalesce(origine.origine,s.origine)='accredito_pos' AND r.descrizione='Commissioni POS' THEN '11'
        WHEN coalesce(origine.causale,s.causale)='Corrispettivi Cassa in Cloud' AND r.descrizione='Ricavi da corrispettivi' THEN '01'
        WHEN c.voce_cee='A.1' THEN '01'
        WHEN c.voce_cee='A.3' THEN '02'
        WHEN c.voce_cee='A.5' THEN '13'
        WHEN c.voce_cee='B.6' THEN '03'
        WHEN c.voce_cee='B.11' THEN '04'
        WHEN c.voce_cee IN ('B.7','B.8') THEN '05'
        WHEN c.voce_cee LIKE 'B.9%' THEN '06'
        WHEN c.voce_cee LIKE 'B.10%' THEN '09'
        WHEN c.voce_cee='B.14' THEN '08'
        WHEN c.voce_cee LIKE 'C.16%' THEN '12'
        WHEN c.voce_cee LIKE 'C.17%' THEN '11'
      END codice,
      CASE c.natura WHEN 'ricavo' THEN r.avere-r.dare ELSE r.dare-r.avere END importo
    FROM public.contabilita_scritture s
    JOIN public.contabilita_righe r ON r.scrittura_id=s.id AND r.company_id=s.company_id
    JOIN public.contabilita_conti c ON c.id=r.conto_id AND c.company_id=s.company_id AND c.natura IN ('costo','ricavo')
    LEFT JOIN public.contabilita_scritture origine ON origine.id=s.storno_di AND origine.company_id=s.company_id
    WHERE s.company_id=$1 AND s.data_registrazione>=make_date($2,$3,1)
      AND s.data_registrazione<(make_date($2,$4,1)+interval '1 month')::date
      AND (EXISTS(SELECT 1 FROM private.cg_scritture_assestamento a
        WHERE a.company_id=$1 AND a.scrittura_id=coalesce(s.storno_di,s.id))
        OR coalesce(origine.origine,s.origine)='accredito_pos'
        OR (coalesce(origine.causale,s.causale)='Corrispettivi Cassa in Cloud'
           AND coalesce(origine.documento_numero,s.documento_numero) LIKE 'Chiusura %'
           AND r.descrizione='Ricavi da corrispettivi'))
  )
  SELECT id,data,codice,descrizione,importo FROM righe WHERE codice IS NOT NULL
$$;

CREATE OR REPLACE FUNCTION private.cg_saldo_cassa_contanti(p_company uuid,p_al date)
RETURNS numeric LANGUAGE sql STABLE SET search_path TO '' AS $$
  SELECT coalesce((
    SELECT sum(r.dare-r.avere)
    FROM public.contabilita_righe r JOIN public.contabilita_scritture s ON s.id=r.scrittura_id AND s.company_id=r.company_id
    JOIN public.contabilita_conti c ON c.id=r.conto_id AND c.company_id=r.company_id
    WHERE r.company_id=$1 AND c.voce_cee='C.IV.3' AND c.natura='attivo' AND s.data_registrazione<=$2
  ),(
    SELECT sum(CASE WHEN p.direction='entrata' THEN p.amount ELSE -p.amount END)
    FROM public.prima_nota_entries p
    LEFT JOIN public.contabilita_conti c ON c.id=p.conto_liquidita_id AND c.company_id=p.company_id
    WHERE p.company_id=$1 AND p.entry_date<=$2 AND p.bank_account_id IS NULL AND p.bank_transaction_id IS NULL
      AND (c.voce_cee='C.IV.3' OR lower(trim(p.account_label)) IN ('cassa','contanti','cassa contanti'))
  ),0)
$$;

CREATE OR REPLACE FUNCTION private.contabilita_conto_anticipi(p_conto public.contabilita_conti)
RETURNS boolean LANGUAGE sql IMMUTABLE SET search_path TO '' AS $$
  SELECT ($1).natura='attivo' AND (($1).codice='05.21' OR ($1).voce_cee='C.I.5'
    OR lower(($1).descrizione) ~ '(anticipi|acconti).*(fornitor)')
$$;

CREATE OR REPLACE FUNCTION private.cg_anticipi_fornitori_al(p_company uuid,p_al date)
RETURNS numeric LANGUAGE sql STABLE SET search_path TO '' AS $$
  SELECT coalesce(sum(r.dare-r.avere),0)
  FROM public.contabilita_righe r JOIN public.contabilita_scritture s ON s.id=r.scrittura_id AND s.company_id=r.company_id
  JOIN public.contabilita_conti c ON c.id=r.conto_id AND c.company_id=r.company_id
  WHERE r.company_id=$1 AND s.data_registrazione<=$2 AND private.contabilita_conto_anticipi(c)
$$;

DO $patch$
DECLARE
  ce text := pg_get_functiondef('public.cg_get_conto_economico_riclassificato(uuid,integer,integer,integer,text)'::regprocedure);
  sp text := pg_get_functiondef('public.cg_get_stato_patrimoniale_riclassificato(uuid,integer,date)'::regprocedure);
  pfn text := pg_get_functiondef('public.cg_get_pfn(uuid,integer)'::regprocedure);
  voce text := pg_get_functiondef('public.cg_get_dettaglio_voce_mese(uuid,integer,integer,text)'::regprocedure);
  prima text;
BEGIN
  IF strpos(ce,'private.cg_righe_da_contabilita')=0 THEN
    ce:=replace(ce,'  v_company_id uuid;','  v_company_id uuid; v_raccordo jsonb;');
    prima:=ce;
    ce:=replace(ce,'  v_pil := v_ricavi + v_var_rim_lic;',
$nuovo$  SELECT coalesce(jsonb_object_agg(q.codice,q.importo),'{}'::jsonb) INTO v_raccordo
  FROM (SELECT r.codice,sum(r.importo) importo FROM private.cg_righe_da_contabilita(v_company_id,p_anno,p_mese_da,p_mese_a) r GROUP BY r.codice) q;
  v_ricavi := v_ricavi + coalesce((v_raccordo->>'01')::numeric,0);
  v_var_rim_lic := v_var_rim_lic + coalesce((v_raccordo->>'02')::numeric,0);
  v_pil := v_ricavi + v_var_rim_lic;$nuovo$);
    IF ce=prima THEN RAISE EXCEPTION 'Calcolo ricavi gestionale inatteso'; END IF;
    prima:=ce;
    ce:=replace(ce,'  v_costo_mp   :=',
$nuovo$  v_acquisti := v_acquisti + coalesce((v_raccordo->>'03')::numeric,0);
  v_var_rim_mag := coalesce(v_var_rim_mag,0) + coalesce((v_raccordo->>'04')::numeric,0);
  v_costi_prod := v_costi_prod + coalesce((v_raccordo->>'05')::numeric,0);
  v_costo_pers := v_costo_pers + coalesce((v_raccordo->>'06')::numeric,0);
  v_costi_amm := v_costi_amm + coalesce((v_raccordo->>'08')::numeric,0);
  v_amm := v_amm + coalesce((v_raccordo->>'09')::numeric,0);
  v_oneri_fin := v_oneri_fin + coalesce((v_raccordo->>'11')::numeric,0);
  v_prov_fin := v_prov_fin + coalesce((v_raccordo->>'12')::numeric,0);
  v_ricavi_ex := v_ricavi_ex + coalesce((v_raccordo->>'13')::numeric,0);
  v_costo_mp   :=$nuovo$);
    IF ce=prima THEN RAISE EXCEPTION 'Calcolo costi gestionale inatteso'; END IF;
    EXECUTE ce;
  END IF;

  IF strpos(sp,'private.cg_saldo_cassa_contanti')=0 THEN
    prima:=sp;
    sp:=replace(sp,'v_cassa := 0;  -- nessuna fonte per la cassa contanti','v_cassa := private.cg_saldo_cassa_contanti(v_company_id,v_rif);');
    sp:=replace(sp,'v_anticipi_forn := 0;','v_anticipi_forn := private.cg_anticipi_fornitori_al(v_company_id,v_rif);');
    sp:=replace(sp,$prima$THEN jsonb_build_array('anticipi_fornitori', 'cassa')$prima$,$nuovo$THEN '[]'::jsonb$nuovo$);
    sp:=replace(sp,$prima$jsonb_build_array('crediti_tributari', 'anticipi_fornitori', 'cassa')$prima$,$nuovo$jsonb_build_array('crediti_tributari')$nuovo$);
    IF sp=prima OR strpos(sp,'private.cg_anticipi_fornitori_al')=0 THEN RAISE EXCEPTION 'Liquidità patrimoniale inattesa'; END IF;
    EXECUTE sp;
  END IF;
  IF strpos(pfn,'private.cg_saldo_cassa_contanti')=0 THEN
    prima:=pfn;
    pfn:=replace(pfn,'v_cassa := 0;','v_cassa := private.cg_saldo_cassa_contanti(v_company_id,v_rif);');
    IF pfn=prima THEN RAISE EXCEPTION 'Liquidità PFN inattesa'; END IF;
    EXECUTE pfn;
  END IF;

  IF strpos(voce,'private.cg_righe_da_contabilita')=0 THEN
    voce:=replace(voce,'  v_company_id uuid;','  v_company_id uuid; v_extra jsonb; v_somma numeric; v_numero int;');
    voce:=replace(voce,$prima$    IF v_has_cedolini THEN
      SELECT jsonb_agg$prima$,
$nuovo$    v_has_cedolini := EXISTS (SELECT 1 FROM private.cg_personale_da_cedolini(
      v_company_id,p_anno,coalesce(p_mese,1),coalesce(p_mese,12)));
    IF v_has_cedolini THEN
      SELECT jsonb_agg$nuovo$);
    voce:=replace(voce,$prima$AND cd.stato IN ('emesso','pagato')$prima$,
$nuovo$AND cd.stato IN ('emesso','pagato') AND EXISTS (
          SELECT 1 FROM private.cg_personale_da_cedolini(v_company_id,p_anno,cd.mese,cd.mese)
        )$nuovo$);
    voce:=replace(voce,$prima$      v_riv_tfr := private.cg_tfr_rivalutazione_mesi(v_company_id, p_anno, COALESCE(p_mese, 1), COALESCE(p_mese, 12));$prima$,
$nuovo$      SELECT coalesce(sum(private.cg_tfr_rivalutazione_mesi(v_company_id,p_anno,p.mese,p.mese)),0)
        INTO v_riv_tfr FROM private.cg_personale_da_cedolini(v_company_id,p_anno,coalesce(p_mese,1),coalesce(p_mese,12)) p;$nuovo$);
    prima:=voce;
    voce:=replace(voce,$prima$  RETURN jsonb_build_object(
    'meta', jsonb_build_object($prima$,
$nuovo$  IF p_codice='06' AND v_has_cedolini THEN
    SELECT jsonb_agg(jsonb_build_object('id',v.row_id,'source_table',v.source_table,'data',v.data,
        'descrizione',v.descrizione,'controparte',v.controparte,'importo',v.importo) ORDER BY v.data,v.row_id),
        coalesce(sum(v.importo),0),count(*)
    INTO v_extra,v_somma,v_numero
    FROM public.v_cg_costi_classificati v WHERE v.company_id=v_company_id AND v.anno=p_anno
      AND (p_mese IS NULL OR v.mese=p_mese) AND v.macro_voce='costo_personale'
      AND NOT EXISTS(SELECT 1 FROM private.cg_personale_da_cedolini(v_company_id,p_anno,v.mese,v.mese));
    IF v_numero>0 THEN
      v_righe:=coalesce(v_righe,'[]'::jsonb)||v_extra;
      v_totale:=v_totale+v_somma;
      v_raggr:=coalesce(v_raggr,'[]'::jsonb)||jsonb_build_array(
        jsonb_build_object('etichetta','Mesi senza cedolini','totale',v_somma,'count',v_numero));
    END IF;
  END IF;
  SELECT jsonb_agg(jsonb_build_object('id',r.id,'source_table','contabilita_righe','data',r.data,
        'descrizione',r.descrizione,'importo',r.importo) ORDER BY r.data,r.id),
      coalesce(sum(r.importo),0),count(*)
    INTO v_extra,v_somma,v_numero
    FROM private.cg_righe_da_contabilita(v_company_id,p_anno,coalesce(p_mese,1),coalesce(p_mese,12)) r WHERE r.codice=p_codice;
  IF v_numero>0 THEN
    v_righe:=coalesce(v_righe,'[]'::jsonb)||v_extra;
    v_totale:=v_totale+v_somma;
    v_raggr:=coalesce(v_raggr,'[]'::jsonb)||jsonb_build_array(
      jsonb_build_object('etichetta','Contabilità generale','totale',v_somma,'count',v_numero));
  END IF;
  RETURN jsonb_build_object(
    'meta', jsonb_build_object($nuovo$);
    IF voce=prima THEN RAISE EXCEPTION 'Dettaglio gestionale inatteso'; END IF;
    EXECUTE voce;
  END IF;
END $patch$;

REVOKE ALL ON FUNCTION private.cg_righe_da_contabilita(uuid,integer,integer,integer),
  private.cg_saldo_cassa_contanti(uuid,date), private.contabilita_conto_anticipi(public.contabilita_conti),
  private.cg_anticipi_fornitori_al(uuid,date) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.contabilita_raccordo_cdg(uuid,uuid,boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.contabilita_raccordo_cdg(uuid,uuid,boolean) TO authenticated;
