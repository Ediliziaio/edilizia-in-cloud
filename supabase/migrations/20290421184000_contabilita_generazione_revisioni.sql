-- La generazione automatica e quella manuale aggiornano le provvisorie nello
-- stesso modo. Le scritture in periodi definitivi conservano storno e riemissione.
SET LOCAL lock_timeout='3s';
SET LOCAL statement_timeout='60s';

CREATE OR REPLACE FUNCTION public.contabilita_liquidita_incasso(p_company uuid,p_pagamento uuid,p_banca text,p_cassa text)
RETURNS uuid LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $function$
DECLARE v_conti uuid[];
BEGIN
  SELECT array_agg(DISTINCT coalesce(n.conto_liquidita_id,
      CASE WHEN lower(coalesce(n.account_label,'')) LIKE 'cassa%' AND nullif(p_cassa,'') IS NOT NULL THEN p_cassa::uuid ELSE nullif(p_banca,'')::uuid END))
    INTO v_conti FROM public.invoice_payments p JOIN public.prima_nota_entries n ON n.company_id=p.company_id
      AND (n.invoice_payment_id=p.id OR p.reference='prima_nota:'||n.id::text)
    WHERE p.company_id=p_company AND p.id=p_pagamento;
  IF cardinality(v_conti)=1 THEN RETURN v_conti[1]; END IF;
  RETURN nullif(p_banca,'')::uuid;
END $function$;
REVOKE ALL ON FUNCTION public.contabilita_liquidita_incasso(uuid,uuid,text,text) FROM PUBLIC,anon,authenticated,service_role;

DO $migration$
DECLARE v_def text; v_prima text; v_cerca text := '          IF public.contabilita_righe_uguali(v_viva.id, v_righe) THEN s_gia := s_gia + 1; CONTINUE; END IF;';
BEGIN
  SELECT pg_get_functiondef('public.contabilita_genera_da_documenti(uuid,integer,uuid)'::regprocedure) INTO v_prima;
  IF strpos(v_prima,'revisioni automatiche delle provvisorie')>0 THEN RETURN; END IF;
  IF (length(v_prima)-length(replace(v_prima,v_cerca,'')))/length(v_cerca)<>3 THEN
    RAISE EXCEPTION 'Generatore contabile inatteso: verificate le tre sorgenti prima del rilascio';
  END IF;
  v_def:=replace(v_prima,v_cerca,v_cerca||$body$
          -- revisioni automatiche delle provvisorie
          IF public.contabilita_rivedi_provvisoria(v_viva.id,v_righe,'Dati della fonte aggiornati: revisione della scrittura provvisoria') THEN
            n_rif:=n_rif+1; CONTINUE;
          END IF;$body$);
  v_cerca:=$old$          PERFORM public.contabilita_inserisci_scrittura(p_company, public.contabilita_data_utile(p_company, v_viva.data_registrazione),
            'Storno n. ' || v_viva.numero || '/' || v_viva.esercizio, 'Cedolini del mese cambiati', NULL, NULL,$old$;
  IF strpos(v_def,v_cerca)=0 THEN RAISE EXCEPTION 'Ramo cedolini inatteso: revisione non applicata'; END IF;
  v_def:=replace(v_def,v_cerca,$body$          IF r.n>0 AND public.contabilita_rivedi_provvisoria(v_viva.id,v_righe,'Cedolini del mese aggiornati') THEN
            n_rif:=n_rif+1; CONTINUE;
          END IF;
$body$||v_cerca);
  -- Le copie di cassa dei movimenti bancari non sono un secondo fatto contabile:
  -- il pagamento del documento resta la sorgente della relativa scrittura.
  v_cerca:='AND pn.documento_fiscale_id IS NULL AND pn.invoice_id IS NULL';
  IF strpos(v_def,v_cerca)=0 THEN RAISE EXCEPTION 'Sorgente di prima nota inattesa'; END IF;
  v_def:=replace(v_def,v_cerca,v_cerca||' AND pn.auto_source IS DISTINCT FROM ''bank_alignment''');
  v_def:=replace(v_def,$old$public.contabilita_riga(k->>'06.01', 'dare', tot, NULL)$old$,
    $new$public.contabilita_riga(public.contabilita_liquidita_incasso(p_company,e.id,k->>'06.01',k->>'06.02')::text, 'dare', tot, NULL)$new$);
  EXECUTE v_def;
END $migration$;
