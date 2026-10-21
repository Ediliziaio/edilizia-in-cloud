-- Controllo di Gestione · Health-check: mesi contati bene, link giusti, testi
-- per il titolare.
--
-- Cosa non andava (Demo 2, 22/10/2026):
--  * «Movimenti distribuiti per mese: 11 su 10 mesi trascorsi»: il conteggio
--    usava la data di pagamento O la scadenza dei costi, quindi anche i costi
--    ancora da pagare con scadenza a novembre/dicembre. Ora per l'anno in
--    corso contano solo i mesi già iniziati.
--  * «Cedolini caricati: target 12» anche a ottobre: ora il target sono i
--    mesi trascorsi.
--  * il link «Costi senza categoria» portava a /azienda/costi-aziendali, che
--    non esiste: ora /azienda/costi.
--  * testi tecnici («macro_voce», «MLT», «CE»); i valori in euro (patrimonio,
--    quadratura) non dicevano di essere euro: ora ogni controllo ha 'unita'
--    ('euro' o 'numero') e la pagina li formatta.

SET LOCAL lock_timeout = '3s';
SET LOCAL statement_timeout = '60s';

CREATE OR REPLACE FUNCTION public.cg_get_health_check(p_company_id uuid DEFAULT NULL::uuid, p_anno integer DEFAULT (EXTRACT(year FROM CURRENT_DATE))::integer)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_company_id uuid;
  v_mesi_attesi int;
  v_ultimo_mese int;
  v_n_mesi_movimenti int := 0;
  v_n_costi_no_categoria int := 0;
  v_n_cespiti int := 0;
  v_n_loans int := 0;
  v_n_classificazioni int := 0;
  v_n_voci_no_macro int := 0;
  v_n_invoices int := 0;
  v_n_mesi_cedolini int := 0;
  v_n_scadenze_open int := 0;
  v_pn_capitale numeric := 0;
  v_sp jsonb;
  v_checks jsonb;
  v_score numeric; v_max int; v_ready boolean;
BEGIN
  v_company_id := COALESCE(p_company_id, public.get_my_company_id());
  IF v_company_id IS NULL THEN RAISE EXCEPTION 'company_id non risolvibile'; END IF;
  IF v_company_id IS DISTINCT FROM public.get_my_company_id()
     AND NOT public.has_role(auth.uid(), 'super_admin'::public.app_role) THEN
    RAISE EXCEPTION 'Accesso negato';
  END IF;

  v_mesi_attesi := CASE
    WHEN p_anno < extract(year FROM current_date) THEN 12
    WHEN p_anno = extract(year FROM current_date) THEN extract(month FROM current_date)::int
    ELSE 0 END;
  v_ultimo_mese := GREATEST(v_mesi_attesi, 1);

  SELECT count(DISTINCT extract(month FROM COALESCE(cc.paid_date, cc.due_date)))::int
    INTO v_n_mesi_movimenti
  FROM public.company_costs cc
  WHERE cc.company_id = v_company_id
    AND extract(year FROM COALESCE(cc.paid_date, cc.due_date))::int = p_anno
    AND extract(month FROM COALESCE(cc.paid_date, cc.due_date))::int <= v_ultimo_mese;

  SELECT count(*) INTO v_n_costi_no_categoria
  FROM public.company_costs cc
  WHERE cc.company_id = v_company_id
    AND extract(year FROM COALESCE(cc.paid_date, cc.due_date))::int = p_anno
    AND (cc.category IS NULL OR cc.category = '');

  SELECT count(*) INTO v_n_cespiti FROM public.cespiti WHERE company_id = v_company_id AND is_active;
  SELECT count(*) INTO v_n_loans FROM public.cg_loans WHERE company_id = v_company_id AND is_active;
  SELECT count(*) INTO v_n_classificazioni FROM public.cg_classificazione_voci WHERE company_id = v_company_id AND is_active;
  SELECT count(*) INTO v_n_voci_no_macro FROM public.cg_classificazione_voci
   WHERE company_id = v_company_id AND is_active AND (macro_voce IS NULL OR macro_voce = '');

  SELECT count(*) INTO v_n_invoices FROM public.invoices
   WHERE company_id = v_company_id AND extract(year FROM issue_date)::int = p_anno
     AND status NOT IN ('cancelled','draft','annullata','bozza');

  SELECT count(DISTINCT mese) INTO v_n_mesi_cedolini FROM public.cedolini
   WHERE company_id = v_company_id AND anno = p_anno AND mese <= v_ultimo_mese;

  SELECT count(*) INTO v_n_scadenze_open FROM public.scadenze
   WHERE company_id = v_company_id
     AND lower(COALESCE(status::text,'')) IN ('da_pagare','parziale','pending','partial','unpaid','overdue')
     AND amount > COALESCE(paid_amount, 0);

  SELECT COALESCE(sum(capitale_sociale), 0) INTO v_pn_capitale
  FROM public.patrimonio_netto WHERE company_id = v_company_id AND esercizio = p_anno;

  v_sp := public.cg_get_stato_patrimoniale_riclassificato(v_company_id, p_anno);

  v_checks := jsonb_build_array(
    jsonb_build_object('codice','mesi_movimenti','unita','numero',
      'label','Mesi con costi registrati',
      'valore', v_n_mesi_movimenti,
      'target', CASE WHEN v_mesi_attesi = 0 THEN 'anno non iniziato' ELSE v_mesi_attesi::text || ' mesi trascorsi' END,
      'status', CASE WHEN v_mesi_attesi = 0 THEN 'warn' WHEN v_n_mesi_movimenti >= v_mesi_attesi THEN 'ok'
                     WHEN v_n_mesi_movimenti > 0 THEN 'warn' ELSE 'critical' END,
      'descrizione','Servono costi registrati in ogni mese trascorso, altrimenti il conto economico mensile ha dei buchi.',
      'azione_url','/azienda/costi'),
    jsonb_build_object('codice','costi_no_categoria','unita','numero',
      'label','Costi senza categoria',
      'valore', v_n_costi_no_categoria, 'target','0',
      'status', CASE WHEN v_n_costi_no_categoria = 0 THEN 'ok' WHEN v_n_costi_no_categoria <= 5 THEN 'warn' ELSE 'critical' END,
      'descrizione','Un costo senza categoria non finisce nella riga giusta del conto economico.',
      'azione_url','/azienda/costi'),
    jsonb_build_object('codice','cespiti','unita','numero',
      'label','Beni dell''azienda (cespiti) caricati',
      'valore', v_n_cespiti, 'target','almeno 1',
      'status', CASE WHEN v_n_cespiti > 0 THEN 'ok' ELSE 'critical' END,
      'descrizione','Mezzi, attrezzature, immobili: senza, gli ammortamenti sono zero e il risultato operativo è gonfiato.',
      'azione_url','/azienda/controllo-gestione/health#cespiti'),
    jsonb_build_object('codice','loans','unita','numero',
      'label','Mutui e finanziamenti registrati',
      'valore', v_n_loans, 'target','tutti quelli in corso',
      'status', CASE WHEN v_n_loans > 0 THEN 'ok' ELSE 'warn' END,
      'descrizione','Servono per debiti, cassa futura e copertura delle rate (DSCR). Se non hai mutui, ignora.',
      'azione_url','/azienda/controllo-gestione/pfn-debiti'),
    jsonb_build_object('codice','classificazioni','unita','numero',
      'label','Voci di classificazione attive',
      'valore', v_n_classificazioni, 'target','almeno 20',
      'status', CASE WHEN v_n_classificazioni >= 20 THEN 'ok' WHEN v_n_classificazioni >= 5 THEN 'warn' ELSE 'critical' END,
      'descrizione','Dicono in quale riga del conto economico va ogni tipo di costo. Carica le voci predefinite dalla Configurazione.',
      'azione_url','/azienda/controllo-gestione/configurazione'),
    jsonb_build_object('codice','voci_no_macro','unita','numero',
      'label','Voci senza riga del conto economico',
      'valore', v_n_voci_no_macro, 'target','0',
      'status', CASE WHEN v_n_voci_no_macro = 0 THEN 'ok' ELSE 'warn' END,
      'descrizione','Voci attive a cui non è assegnata una riga: i loro importi finiscono in «Costi non classificati».',
      'azione_url','/azienda/controllo-gestione/configurazione'),
    jsonb_build_object('codice','patrimonio_netto','unita','euro',
      'label','Capitale sociale dell''anno',
      'valore', v_pn_capitale, 'target','maggiore di 0',
      'status', CASE WHEN v_pn_capitale > 0 THEN 'ok' ELSE 'critical' END,
      'descrizione','Capitale, riserve e utili portati a nuovo dell''anno: senza, lo Stato patrimoniale non quadra.',
      'azione_url','/azienda/controllo-gestione/health#patrimonio'),
    jsonb_build_object('codice','invoices','unita','numero',
      'label','Fatture emesse nell''anno',
      'valore', v_n_invoices, 'target','almeno 1',
      'status', CASE WHEN v_n_invoices > 0 THEN 'ok' ELSE 'critical' END,
      'descrizione','I ricavi del conto economico arrivano dalle fatture emesse.'),
    jsonb_build_object('codice','cedolini','unita','numero',
      'label','Mesi con buste paga caricate',
      'valore', v_n_mesi_cedolini,
      'target', CASE WHEN v_mesi_attesi = 0 THEN 'anno non iniziato' ELSE v_mesi_attesi::text || ' mesi trascorsi' END,
      'status', CASE WHEN v_mesi_attesi > 0 AND v_n_mesi_cedolini >= v_mesi_attesi THEN 'ok' ELSE 'warn' END,
      'descrizione','Con le buste paga il costo del personale è quello vero; senza, si stima dai costi registrati.'),
    jsonb_build_object('codice','scadenze_open','unita','numero',
      'label','Scadenze aperte da incassare o pagare',
      'valore', v_n_scadenze_open, 'target','almeno 1',
      'status', CASE WHEN v_n_scadenze_open > 0 THEN 'ok' ELSE 'warn' END,
      'descrizione','Senza scadenze aperte la cassa futura non ha entrate né uscite previste.',
      'azione_url','/azienda/scadenzario'),
    jsonb_build_object('codice','quadratura_sp','unita','euro',
      'label','Quadratura dello Stato patrimoniale',
      'valore', COALESCE((v_sp->'quadratura'->>'differenza')::numeric, 0), 'target','differenza entro 1 €',
      'status', CASE WHEN COALESCE((v_sp->'quadratura'->>'quadrato')::boolean, false) THEN 'ok' ELSE 'critical' END,
      'descrizione','Attivo e passivo devono coincidere: finché non quadrano, rating, Z-score e pacchetto banca sono provvisori.',
      'azione_url','/azienda/controllo-gestione/sp')
  );

  SELECT sum(CASE c->>'status' WHEN 'ok' THEN 1 WHEN 'warn' THEN 0.5 ELSE 0 END), count(*),
         bool_and(c->>'status' = 'ok' OR c->>'codice' IN ('loans','cedolini'))
    INTO v_score, v_max, v_ready
  FROM jsonb_array_elements(v_checks) c;

  RETURN jsonb_build_object(
    'meta', jsonb_build_object('company_id', v_company_id, 'anno', p_anno, 'generato_il', now(),
                               'mesi_attesi', v_mesi_attesi),
    'score', v_score,
    'max_score', v_max,
    'percentuale', round(v_score / NULLIF(v_max, 0) * 100, 1),
    'report_ready', v_ready,
    'checks', v_checks
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.cg_get_health_check(uuid, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.cg_get_health_check(uuid, integer) TO authenticated, service_role;
