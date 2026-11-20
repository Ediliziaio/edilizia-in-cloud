SET LOCAL lock_timeout = '3s';
SET LOCAL statement_timeout = '60s';

CREATE TABLE IF NOT EXISTS private.cg_rimanenze_lavori_mensili (
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  fine date NOT NULL CHECK (fine = (date_trunc('month',fine::timestamp) + interval '1 month - 1 day')::date
    AND extract(month FROM fine) < 12),
  importo numeric(14,2) NOT NULL CHECK (importo >= 0),
  note text,
  aggiornato_da uuid,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (company_id,fine)
);
ALTER TABLE private.cg_rimanenze_lavori_mensili ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON private.cg_rimanenze_lavori_mensili FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION private.cg_rimanenza_lavori_al(p_company uuid,p_al date)
RETURNS TABLE(fine date, importo numeric) LANGUAGE sql STABLE SET search_path TO '' AS $$
  SELECT z.fine,z.importo
  FROM (
    SELECT m.fine,m.importo FROM private.cg_rimanenze_lavori_mensili m WHERE m.company_id=$1 AND m.fine<=$2
    UNION ALL
    SELECT make_date(a.esercizio,12,31),a.importo FROM public.cg_rimanenze_lavori a
      WHERE a.company_id=$1 AND a.esercizio<=extract(year FROM $2)::int AND make_date(a.esercizio,12,31)<=$2
  ) z ORDER BY z.fine DESC LIMIT 1
$$;

CREATE OR REPLACE FUNCTION private.cg_variazione_lavori_progressiva(p_company uuid,p_anno int,p_mese int)
RETURNS numeric LANGUAGE sql STABLE SET search_path TO '' AS $$
  SELECT coalesce((
    SELECT f.importo-i.importo FROM public.cg_rimanenze_lavori i
    JOIN LATERAL private.cg_rimanenza_lavori_al($1,(make_date($2,$3,1)+interval '1 month - 1 day')::date) f ON true
    WHERE i.company_id=$1 AND i.esercizio=$2-1
  ),0)
$$;

CREATE OR REPLACE FUNCTION public.cg_variazione_lavori_in_corso(p_company_id uuid, p_anno integer)
RETURNS numeric LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO '' AS $$
  SELECT private.cg_variazione_lavori_progressiva($1,$2,12)
$$;

CREATE OR REPLACE FUNCTION public.cg_registra_rimanenza_lavori_mese(p_esercizio integer,p_mese integer,p_importo numeric,p_note text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO '' AS $$
DECLARE
  v_company uuid := public.get_my_company_id();
  v_fine date;
BEGIN
  PERFORM public._cg_assert_lettura(v_company);
  IF auth.uid() IS NULL OR v_company IS NULL OR public.utente_sola_lettura(v_company) OR NOT (
        coalesce(public.e_amministratore_di(v_company),false)
     OR coalesce(public.has_permission_for_company(auth.uid(),'can_view_controllo_gestione',v_company),false)
     OR coalesce(public.user_can_write_accountant_company(v_company),false)
  ) THEN RAISE EXCEPTION 'Accesso negato' USING ERRCODE = '42501'; END IF;
  IF p_esercizio IS NULL OR p_esercizio NOT BETWEEN 2000 AND 2100 OR p_mese IS NULL OR p_mese NOT BETWEEN 1 AND 12 THEN
    RAISE EXCEPTION 'Periodo non valido' USING ERRCODE = '22023';
  END IF;
  v_fine := (make_date(p_esercizio,p_mese,1) + interval '1 month - 1 day')::date;
  IF v_fine >= (now() AT TIME ZONE 'Europe/Rome')::date THEN
    RAISE EXCEPTION 'La rimanenza si registra a periodo concluso.' USING ERRCODE = '22023';
  END IF;
  IF p_importo IS NULL OR p_importo < 0 OR p_importo >= 1000000000000 OR p_importo <> round(p_importo,2) THEN
    RAISE EXCEPTION 'Indica la rimanenza alla data di chiusura. Usa 0 se la rimanenza è nulla.' USING ERRCODE = '22023';
  END IF;

  IF p_mese=12 THEN
    INSERT INTO public.cg_rimanenze_lavori(company_id,esercizio,importo,fonte,note,created_by)
    VALUES(v_company,p_esercizio,p_importo,'manuale',nullif(trim(p_note),''),auth.uid())
    ON CONFLICT (company_id,esercizio) DO UPDATE SET importo=excluded.importo,fonte=excluded.fonte,
      note=excluded.note,updated_at=now();
  ELSE
    INSERT INTO private.cg_rimanenze_lavori_mensili(company_id,fine,importo,note,aggiornato_da)
    VALUES(v_company,v_fine,p_importo,nullif(trim(p_note),''),auth.uid())
    ON CONFLICT (company_id,fine) DO UPDATE SET importo=excluded.importo,note=excluded.note,
      aggiornato_da=excluded.aggiornato_da,updated_at=now();
  END IF;
  RETURN jsonb_build_object('esercizio',p_esercizio,'mese',p_mese,'fine',v_fine,'importo',p_importo,'fonte','manuale');
END $$;

CREATE OR REPLACE FUNCTION public.cg_registra_rimanenza_lavori(p_esercizio integer,p_importo numeric DEFAULT NULL,p_note text DEFAULT NULL)
RETURNS jsonb LANGUAGE sql SECURITY DEFINER SET search_path TO '' AS $$
  SELECT public.cg_registra_rimanenza_lavori_mese($1,12,$2,$3)
$$;

CREATE OR REPLACE FUNCTION public.cg_lavori_in_corso(p_company_id uuid DEFAULT NULL::uuid, p_anno integer DEFAULT (EXTRACT(year FROM CURRENT_DATE))::integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_company_id uuid;
  v_con_base integer := 0;
  v_maturato numeric(14,2) := 0;
  v_fatturato numeric(14,2) := 0;
  v_lavori numeric(14,2) := 0;
  v_anticipi numeric(14,2) := 0;
  v_senza_base integer := 0;
  v_valore_senza_base numeric(14,2) := 0;
  v_rim_anno numeric(14,2);
  v_rim_prec numeric(14,2);
begin
  perform public._cg_assert_lettura(p_company_id);
  v_company_id := coalesce(p_company_id, public.get_my_company_id());
  if v_company_id is null then
    raise exception 'company_id non risolvibile';
  end if;
  if v_company_id is distinct from public.get_my_company_id()
     and not public.has_role(auth.uid(), 'super_admin'::public.app_role) then
    raise exception 'Accesso negato: company_id non autorizzato';
  end if;

  select count(*), coalesce(sum(maturato), 0), coalesce(sum(fatturato), 0),
         coalesce(sum(lavori_in_corso), 0), coalesce(sum(anticipi), 0)
    into v_con_base, v_maturato, v_fatturato, v_lavori, v_anticipi
    from public.v_cg_lavori_in_corso
   where company_id = v_company_id;

  select count(*), coalesce(sum(coalesce(o.total_amount, 0)), 0)
    into v_senza_base, v_valore_senza_base
    from orders o
   where o.company_id = v_company_id
     and o.deleted_at is null
     and coalesce(o.status, '') <> 'bozza'
     and coalesce(o.total_amount, 0) > 0
     and not exists (
       select 1 from public.v_cg_lavori_in_corso l where l.order_id = o.id
     );

  select importo into v_rim_anno
    from cg_rimanenze_lavori
   where company_id = v_company_id and esercizio = p_anno;

  select importo into v_rim_prec
    from cg_rimanenze_lavori
   where company_id = v_company_id and esercizio = p_anno - 1;

  return jsonb_build_object(
    'anno', p_anno,
    'commesse_misurate', v_con_base,
    'maturato', v_maturato,
    'fatturato', v_fatturato,
    'lavori_in_corso', v_lavori,
    'anticipi', v_anticipi,
    'commesse_senza_avanzamento', v_senza_base,
    'valore_senza_avanzamento', v_valore_senza_base,
    'rimanenza_registrata', v_rim_anno,
    'rimanenza_iniziale', v_rim_prec,
    'ultime_rimanenze', coalesce((
      SELECT jsonb_agg(jsonb_build_object('mese',extract(month FROM r.fine)::int,'importo',r.importo) ORDER BY r.fine)
      FROM private.cg_rimanenze_lavori_mensili r
      WHERE r.company_id=v_company_id AND r.fine>=make_date(p_anno,1,1) AND r.fine<make_date(p_anno,12,1)
    ),'[]'::jsonb),
    'variazione_nel_ce', public.cg_variazione_lavori_in_corso(v_company_id, p_anno)
  );
end;
$function$;

-- Le uscite classificate restano utilizzabili nei mesi senza cedolini emessi.
CREATE OR REPLACE VIEW public.v_cg_costi_classificati WITH (security_invoker = true) AS
WITH costi_company AS (
         SELECT cc.company_id,
            COALESCE(cc.mese_competenza, cc.documento_data, fr.data_fattura, cc.due_date, cc.paid_date) AS data,
            pc.importo,
            pc.categoria AS source_value,
            'company_costs'::text AS source_table,
            NULL::text AS macro_cassa,
            NULL::text AS macro_testo,
            cc.id::text AS row_id,
            cc.name AS descrizione,
            sup.name AS controparte
           FROM company_costs cc
             LEFT JOIN fatture_ricevute fr ON fr.company_cost_id = cc.id
             LEFT JOIN suppliers sup ON sup.id = cc.supplier_id
             CROSS JOIN LATERAL costo_parti_categoria(cc.category, cc.amount, cc.ripartizione_categorie) pc(categoria, importo)
          WHERE cc.amount IS NOT NULL
        ), movimenti_bancari AS (
         SELECT bt.company_id,
            COALESCE(bt.value_date, bt.booking_date) AS data,
            q.importo,
            COALESCE(v.nome, bt.category) AS source_value,
            'bank_transactions'::text AS source_table,
            private.cassa_macro_ce(v.codice) AS macro_cassa,
            private.cassa_macro_ce(vt.codice) AS macro_testo,
            bt.id::text AS row_id,
            COALESCE(bt.description, bt.reference, '— movimento bancario —'::text) AS descrizione,
            COALESCE(NULLIF(bt.counterparty_name, ''::text), bt.merchant_name, bt.creditor_name) AS controparte
           FROM bank_transactions bt
             CROSS JOIN LATERAL ( SELECT
                        CASE
                            WHEN bt.cassa_voce_origine = 'proposta'::text THEN NULL::uuid
                            ELSE (x.value ->> 'voce_id'::text)::uuid
                        END AS voce_id,
                        CASE
                            WHEN bt.cassa_ripartizione IS NULL THEN abs(bt.amount)
                            ELSE ((x.value ->> 'cents'::text)::numeric) / 100::numeric
                        END AS importo
                   FROM jsonb_array_elements(COALESCE(bt.cassa_ripartizione, jsonb_build_array(jsonb_build_object('voce_id', bt.cassa_voce_id)))) x(value)) q
             LEFT JOIN cassa_voci v ON v.id = q.voce_id AND v.company_id = bt.company_id
             LEFT JOIN cassa_voci vt ON v.id IS NULL AND vt.company_id = bt.company_id AND vt.codice = private.cassa_codice_da_testo(bt.category)
          WHERE bt.amount < 0::numeric AND COALESCE(bt.status, 'booked'::text) = 'booked'::text AND bt.linked_scadenza_id IS NULL AND bt.linked_cost_id IS NULL AND NOT (EXISTS ( SELECT 1
                   FROM bank_reconciliations br
                  WHERE br.transaction_id = bt.id AND br.unmatched_at IS NULL)) AND NOT (EXISTS ( SELECT 1
                   FROM bank_reconciliations br
                  WHERE br.transaction_id = bt.id AND (br.invoice_id IS NOT NULL OR br.scadenza_id IS NOT NULL))) AND NOT (EXISTS ( SELECT 1
                   FROM prima_nota_entries p
                  WHERE p.bank_transaction_id = bt.id AND p.cost_id IS NOT NULL)) AND COALESCE(lower(bt.category), ''::text) !~~ 'girocont%'::text AND NOT private.cg_paga_fornitore_con_fatture(bt.company_id, COALESCE(NULLIF(bt.counterparty_name, ''::text), bt.creditor_name), COALESCE(NULLIF(bt.counterparty_iban, ''::text), bt.creditor_iban)) AND (COALESCE(v.id, vt.id) IS NULL OR COALESCE(v.sezione, vt.sezione) = 'operativa'::text AND ("left"(COALESCE(v.codice, vt.codice), 2) <> ALL (ARRAY['02'::text, '12'::text, '21'::text, '23'::text, '24'::text, '25'::text])) AND NOT (("left"(COALESCE(v.codice, vt.codice), 2) = ANY (ARRAY['06'::text, '07'::text])) AND (EXISTS ( SELECT 1
                   FROM cedolini ce
                  WHERE ce.company_id = bt.company_id AND ce.anno = EXTRACT(year FROM COALESCE(bt.value_date, bt.booking_date))::integer
                    AND ce.mese = EXTRACT(month FROM coalesce(bt.value_date,bt.booking_date))::integer
                    AND ce.stato IN ('emesso','pagato') AND coalesce(ce.lordo,0)+coalesce(ce.contributi_datore,0)>0))))
        )
 SELECT u.company_id,
    u.data,
    u.importo,
    u.source_table,
    u.source_value,
    cl.voce_chiave,
    COALESCE(u.macro_cassa, cl.macro_voce, u.macro_testo) AS macro_voce,
    COALESCE(cl.tipo,
        CASE
            WHEN COALESCE(u.macro_cassa, u.macro_testo) = ANY (ARRAY['acquisti_materie'::text, 'costi_produttivi'::text]) THEN 'V'::text
            WHEN COALESCE(u.macro_cassa, u.macro_testo) IS NOT NULL THEN 'F'::text
            ELSE NULL::text
        END) AS tipo,
    EXTRACT(year FROM u.data)::integer AS anno,
    EXTRACT(month FROM u.data)::integer AS mese,
    u.row_id,
    u.descrizione,
    u.controparte
   FROM ( SELECT costi_company.company_id,
            costi_company.data,
            costi_company.importo,
            costi_company.source_value,
            costi_company.source_table,
            costi_company.macro_cassa,
            costi_company.macro_testo,
            costi_company.row_id,
            costi_company.descrizione,
            costi_company.controparte
           FROM costi_company
        UNION ALL
         SELECT movimenti_bancari.company_id,
            movimenti_bancari.data,
            movimenti_bancari.importo,
            movimenti_bancari.source_value,
            movimenti_bancari.source_table,
            movimenti_bancari.macro_cassa,
            movimenti_bancari.macro_testo,
            movimenti_bancari.row_id,
            movimenti_bancari.descrizione,
            movimenti_bancari.controparte
           FROM movimenti_bancari) u
     LEFT JOIN LATERAL ( SELECT c.voce_chiave,
            c.macro_voce,
            c.tipo
           FROM cg_classificazione_voci c
          WHERE c.company_id = u.company_id AND c.source_table = u.source_table AND c.is_active AND cg_norm_voce(c.source_value) = cg_norm_voce(u.source_value)
          ORDER BY (c.source_value = u.source_value) DESC, c.voce_chiave
         LIMIT 1) cl ON true;

CREATE OR REPLACE FUNCTION private.cg_personale_da_cedolini(p_company uuid,p_anno int,p_da int,p_al int)
RETURNS TABLE(mese integer, importo numeric) LANGUAGE sql STABLE SET search_path TO '' AS $$
  SELECT c.mese::int,
    sum(coalesce(c.lordo,0)+coalesce(c.contributi_datore,0)+round(coalesce(c.lordo,0)/13.5,2))
      + private.cg_tfr_rivalutazione_mesi($1,$2,c.mese,c.mese)
  FROM public.cedolini c
  WHERE c.company_id=$1 AND c.anno=$2 AND c.mese BETWEEN $3 AND $4 AND c.stato IN ('emesso','pagato')
  GROUP BY c.mese
  HAVING sum(coalesce(c.lordo,0)+coalesce(c.contributi_datore,0))>0
$$;

DO $patch$
DECLARE
  ce text := pg_get_functiondef('public.cg_get_conto_economico_riclassificato(uuid,integer,integer,integer,text)'::regprocedure);
  sp text := pg_get_functiondef('public.cg_get_stato_patrimoniale_riclassificato(uuid,integer,date)'::regprocedure);
  p1 int; p2 int;
BEGIN
  IF strpos(ce,'private.cg_personale_da_cedolini') = 0 THEN
    p1 := strpos(ce, $prima$  SELECT EXISTS(SELECT 1 FROM public.cedolini WHERE company_id = v_company_id AND anno = p_anno) INTO v_has_cedolini;$prima$);
    p2 := strpos(ce, $fine$  -- Fondo alla fine del periodo$fine$);
    IF p1 = 0 OR p2 <= p1 OR strpos(ce,'public.cg_variazione_lavori_in_corso(v_company_id, p_anno)') = 0 THEN
      RAISE EXCEPTION 'Definizione del conto economico inattesa';
    END IF;
    ce := left(ce,p1-1) || $nuovo$  -- Ogni mese usa i cedolini emessi se presenti, altrimenti conserva i costi classificati.
  -- Le rettifiche manuali del CE sono già nella base e si mantengono.
  SELECT coalesce(sum(c.importo - coalesce(b.importo,0)),0), count(*) > 0
    INTO v_costo_pers_cedolini, v_has_cedolini
  FROM private.cg_personale_da_cedolini(v_company_id,p_anno,p_mese_da,p_mese_a) c
  LEFT JOIN LATERAL (
    SELECT sum(v.importo) importo FROM public.v_cg_costi_classificati v
     WHERE v.company_id=v_company_id AND v.anno=p_anno AND v.mese=c.mese AND v.macro_voce='costo_personale'
  ) b ON true;
  v_costo_pers := v_costo_pers + v_costo_pers_cedolini;

$nuovo$ || substr(ce,p2);
    ce := replace(ce,'public.cg_variazione_lavori_in_corso(v_company_id, p_anno)','private.cg_variazione_lavori_progressiva(v_company_id, p_anno, p_mese_a)');
    EXECUTE ce;
  END IF;
  IF strpos(sp,'private.cg_rimanenza_lavori_al') = 0 THEN
    IF strpos(sp,$prima$  SELECT COALESCE(r.importo + public.cg_variazione_lavori_in_corso(v_company_id, p_anno), 0)
    INTO v_lavori_corso
    FROM public.cg_rimanenze_lavori r
   WHERE r.company_id = v_company_id AND r.esercizio = p_anno - 1;
  v_lavori_corso := COALESCE(v_lavori_corso, 0);$prima$) = 0 THEN RAISE EXCEPTION 'Definizione dello stato patrimoniale inattesa'; END IF;
    sp := replace(sp,$prima$  SELECT COALESCE(r.importo + public.cg_variazione_lavori_in_corso(v_company_id, p_anno), 0)
    INTO v_lavori_corso
    FROM public.cg_rimanenze_lavori r
   WHERE r.company_id = v_company_id AND r.esercizio = p_anno - 1;
  v_lavori_corso := COALESCE(v_lavori_corso, 0);$prima$,
$nuovo$  SELECT coalesce((SELECT r.importo FROM private.cg_rimanenza_lavori_al(v_company_id,v_rif) r),0)
    INTO v_lavori_corso;$nuovo$);
    EXECUTE sp;
  END IF;
END $patch$;

REVOKE ALL ON FUNCTION private.cg_rimanenza_lavori_al(uuid,date),
  private.cg_variazione_lavori_progressiva(uuid,integer,integer),
  private.cg_personale_da_cedolini(uuid,integer,integer,integer),
  public.cg_variazione_lavori_in_corso(uuid,integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.cg_registra_rimanenza_lavori_mese(integer,integer,numeric,text),
  public.cg_registra_rimanenza_lavori(integer,numeric,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.cg_registra_rimanenza_lavori_mese(integer,integer,numeric,text),
  public.cg_registra_rimanenza_lavori(integer,numeric,text) TO authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.cg_rimanenze_lavori FROM authenticated;
