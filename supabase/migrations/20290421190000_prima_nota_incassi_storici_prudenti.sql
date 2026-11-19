-- Un saldo importato non prova che una riga manuale senza collegamento sia un
-- incasso diverso. I possibili doppioni richiedono un abbinamento esplicito.
SET LOCAL lock_timeout='3s';
SET LOCAL statement_timeout='60s';
DO $migration$
DECLARE v_def text;v_cerca text;
BEGIN
  SELECT pg_get_functiondef('public.prima_nota_allinea_fonti(uuid,boolean,text)'::regprocedure) INTO v_def;
  IF strpos(v_def,'Incasso storico possibile già in una registrazione manuale')>0 THEN RETURN; END IF;
  v_cerca:='      IF NOT p_anteprima THEN
        PERFORM pg_advisory_xact_lock(hashtextextended(p_company::text,2810));';
  IF strpos(v_def,v_cerca)=0 THEN RAISE EXCEPTION 'Sorgente degli incassi storici inattesa';END IF;
  EXECUTE replace(v_def,v_cerca,$body$      IF EXISTS(SELECT 1 FROM public.prima_nota_entries n WHERE n.company_id=p_company AND NOT n.is_auto
          AND n.invoice_id IS NULL AND n.documento_fiscale_id IS NULL AND n.cost_id IS NULL AND n.reversal_of IS NULL
          AND abs(n.amount-x.paid_amount)<0.005 AND abs(n.entry_date-x.payment_date)<=3
          AND n.direction=CASE WHEN x.document_type IN('credit_note','TD04','TD08') THEN 'uscita' ELSE 'entrata' END
          AND NOT EXISTS(SELECT 1 FROM public.prima_nota_entries r WHERE r.company_id=p_company AND r.reversal_of=n.id)) THEN
        v_casi:=v_casi||jsonb_build_object('esito','da_verificare','id',x.id,'origine','fattura','invoice_id',x.id,
          'motivo','Incasso storico possibile già in una registrazione manuale: abbina il documento prima di aggiungere denaro');
        CONTINUE;
      END IF;
$body$||v_cerca);
END $migration$;
