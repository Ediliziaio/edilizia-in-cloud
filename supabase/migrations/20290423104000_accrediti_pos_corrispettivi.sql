SET LOCAL lock_timeout = '3s';
SET LOCAL statement_timeout = '60s';

ALTER TABLE public.cassa_in_cloud_accrediti_pos ADD COLUMN IF NOT EXISTS scrittura_id uuid
  REFERENCES public.contabilita_scritture(id) ON DELETE RESTRICT;
CREATE UNIQUE INDEX IF NOT EXISTS cassa_in_cloud_pos_scrittura ON public.cassa_in_cloud_accrediti_pos(scrittura_id)
  WHERE scrittura_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.cassa_in_cloud_contabilizza_pos(
  p_company_id uuid,p_id uuid,p_banca uuid,p_commissioni_conto uuid DEFAULT NULL
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO '' AS $$
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
  UPDATE public.cassa_in_cloud_accrediti_pos SET scrittura_id=v_id WHERE id=a.id;
  RETURN v_id;
END $$;

CREATE OR REPLACE FUNCTION public.cassa_in_cloud_abbina_e_contabilizza_pos(
  p_company_id uuid,p_tx uuid,p_chiusure jsonb,p_commissioni numeric,p_banca uuid,p_commissioni_conto uuid DEFAULT NULL
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO '' AS $$
DECLARE v_id uuid;
BEGIN
  v_id := public.cassa_in_cloud_abbina_pos(p_company_id,p_tx,p_chiusure,p_commissioni);
  PERFORM public.cassa_in_cloud_contabilizza_pos(p_company_id,v_id,p_banca,p_commissioni_conto);
  RETURN v_id;
END $$;

CREATE OR REPLACE FUNCTION public.cassa_in_cloud_scollega_pos(p_company_id uuid, p_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_tx uuid; v_scrittura uuid;
begin
  perform private.bank_operativa_access(p_company_id,true);
  perform pg_advisory_xact_lock(hashtextextended(p_company_id::text,2810));
  update public.cassa_in_cloud_accrediti_pos set scollegato_il = now(), scollegato_da = auth.uid()
   where company_id = p_company_id and id = p_id and scollegato_il is null returning bank_transaction_id, scrittura_id into v_tx,v_scrittura;
  if v_tx is not null then
    if v_scrittura is not null and not exists(select 1 from public.contabilita_scritture x where x.storno_di=v_scrittura) then
      perform public.contabilita_storna_scrittura(v_scrittura,(now() AT TIME ZONE 'Europe/Rome')::date,'Scollegamento accredito POS');
    end if;
    update public.bank_transactions set reconciliation_status = 'pending', reconciled_at = null, chiuso_senza_documento = null
     where id = v_tx and company_id = p_company_id;
  end if;
end $function$;
CREATE OR REPLACE FUNCTION public.cassa_in_cloud_accredito_pos(p_company_id uuid, p_id uuid, p_tx uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_esito jsonb;
begin
  perform private.bank_operativa_access(p_company_id,false);
  select jsonb_build_object('id',a.id,'bank_transaction_id',t.id,'giorno',coalesce(t.booking_date,t.value_date),
    'conto',coalesce(b.display_name,b.account_name,'Conto corrente'),'lordo',a.lordo,'netto',a.netto,'commissioni',a.commissioni,
    'scrittura_id', case when public.contabilita_puo_leggere(p_company_id) then a.scrittura_id end,
    'puo_contabilizzare', a.scrittura_id is null and public.contabilita_puo_scrivere(p_company_id) and exists(
      select 1 from public.companies c where c.id=p_company_id and c.contabilita_generale_attiva),
    'chiusure',x.numero,'dal_chiusure',x.dal,'al_chiusure',x.al) into v_esito
  from public.cassa_in_cloud_accrediti_pos a join public.bank_transactions t on t.id = a.bank_transaction_id and t.company_id = p_company_id
  join public.bank_accounts_operativi b on b.id = t.account_id and b.company_id = p_company_id
  cross join lateral (select count(*) numero,min(r.giorno) dal,max(r.giorno) al
     from public.cassa_in_cloud_chiusure_pos r where r.accredito_id = a.id) x
  where a.company_id = p_company_id and a.scollegato_il is null and (a.id = p_id or a.bank_transaction_id = p_tx);
  return v_esito;
end $function$;

CREATE OR REPLACE FUNCTION private.cassa_pos_proteggi_storno()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO '' AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.cassa_in_cloud_accrediti_pos a
    WHERE a.company_id=NEW.company_id AND a.scollegato_il IS NULL AND (
      a.scrittura_id=NEW.storno_di OR EXISTS (
        SELECT 1 FROM public.cassa_in_cloud_chiusure_pos q
        JOIN public.cassa_in_cloud_scritture s ON s.company_id=q.company_id AND s.punto_vendita_id=q.punto_vendita_id
          AND s.cassa_id=q.cassa_id AND s.giorno=q.giorno
        WHERE q.accredito_id=a.id AND a.scrittura_id IS NOT NULL AND s.scrittura_id=NEW.storno_di
      )
    )) THEN RAISE EXCEPTION 'Scollega prima l’accredito POS dalla scheda Cassa in Cloud.' USING ERRCODE = '23514'; END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS proteggi_storno_pos ON public.contabilita_scritture;
CREATE TRIGGER proteggi_storno_pos BEFORE INSERT ON public.contabilita_scritture
  FOR EACH ROW WHEN (NEW.storno_di IS NOT NULL) EXECUTE FUNCTION private.cassa_pos_proteggi_storno();

-- Le chiusure già registrate entrano nel calcolo automatico se tutte le
-- operazioni del periodo hanno aliquote positive, importi e incassi quadrati.
CREATE OR REPLACE FUNCTION private.lipe_corrispettivi_cassa(p_company uuid,p_dal date,p_al date)
RETURNS jsonb LANGUAGE plpgsql STABLE SET search_path TO '' AS $$
DECLARE
  r record;
  v_proposta jsonb;
  v_n integer := 0;
  v_imponibile numeric := 0;
  v_iva numeric := 0;
BEGIN
  FOR r IN SELECT s.punto_vendita_id punto,s.cassa_id cassa,s.data giorno
      FROM public.cassa_in_cloud_scontrini s WHERE s.company_id=p_company AND s.data BETWEEN p_dal AND p_al AND s.presente_in_cassa
    UNION SELECT c.punto_vendita_id,c.cassa_id,c.giorno FROM public.cassa_in_cloud_chiusure c
      WHERE c.company_id=p_company AND c.giorno BETWEEN p_dal AND p_al AND c.presente_in_cassa
  LOOP
    v_n:=v_n+1;
    v_proposta:=private.cassa_in_cloud_scrittura_dati(p_company,r.punto,r.cassa,r.giorno);
    IF v_proposta IS NULL OR EXISTS (
      SELECT 1 FROM public.cassa_in_cloud_chiusure c
        CROSS JOIN LATERAL jsonb_array_elements(c.dati->'iva') i
      WHERE c.company_id=p_company AND c.punto_vendita_id=r.punto AND c.cassa_id=r.cassa AND c.giorno=r.giorno
        AND c.presente_in_cassa AND coalesce((i->>'aliquota')::numeric,0)<=0
    ) OR NOT EXISTS (
      SELECT 1 FROM public.cassa_in_cloud_scritture s
      WHERE s.company_id=p_company AND s.punto_vendita_id=r.punto AND s.cassa_id=r.cassa AND s.giorno=r.giorno
        AND s.scrittura_id IS NOT NULL AND s.versione=v_proposta->>'versione'
        AND NOT EXISTS(SELECT 1 FROM public.contabilita_scritture x WHERE x.storno_di=s.scrittura_id)
    ) THEN RETURN '{"presente":true,"completa":false}'::jsonb; END IF;
    v_imponibile:=v_imponibile+(v_proposta->>'ricavi')::numeric;
    v_iva:=v_iva+(v_proposta->>'iva')::numeric;
  END LOOP;
  RETURN jsonb_build_object('presente',v_n>0,'completa',true,'imponibile',v_imponibile,'iva',v_iva);
END $$;

DO $patch$
DECLARE d text := pg_get_functiondef('public.liquidazione_iva_righi(uuid,integer,integer,jsonb)'::regprocedure);
  a int; b int;
BEGIN
  IF strpos(d,'private.lipe_corrispettivi_cassa')>0 THEN RETURN; END IF;
  a:=strpos(d,'    WHEN EXISTS (SELECT 1 FROM public.cassa_in_cloud_scontrini s');
  b:=strpos(d,'    WHEN coalesce((b #>> ''{documenti,reverse_charge_aliquota_presunta}'')');
  IF a=0 OR b<=a THEN RAISE EXCEPTION 'Controllo corrispettivi LIPE inatteso'; END IF;
  d:=left(d,a-1) || $nuovo$    WHEN (v_cassa->>'presente')::boolean AND NOT (v_cassa->>'completa')::boolean
      THEN 'Verifica e registra le chiusure di Cassa in Cloud o riporta i totali del Registro IVA.'
$nuovo$ || substr(d,b);
  d:=replace(d,'  v_motivo_registro text;','  v_cassa jsonb; v_motivo_registro text;');
  d:=replace(d,'  v_motivo_registro := CASE','  v_cassa := private.lipe_corrispettivi_cassa(p_company,v_dal,v_al);
  v_motivo_registro := CASE');
  d:=replace(d,$prima$    WHEN coalesce((b ->> 'calcolabile')::boolean, false) IS NOT TRUE THEN$prima$,
$nuovo$    WHEN coalesce((b ->> 'calcolabile')::boolean, false) IS NOT TRUE AND NOT (
      (v_cassa->>'presente')::boolean AND (v_cassa->>'completa')::boolean
      AND coalesce((b#>>'{documenti,vendite}')::int,-1)=0 AND coalesce((b#>>'{documenti,acquisti}')::int,-1)=0
    ) THEN$nuovo$);
  d:=replace(d,$prima$    vp4 := (b ->> 'iva_vendite')::numeric;$prima$,
$nuovo$    vp2 := vp2 + coalesce((v_cassa->>'imponibile')::numeric,0);
    vp4 := (b ->> 'iva_vendite')::numeric + coalesce((v_cassa->>'iva')::numeric,0);
    IF (v_cassa->>'presente')::boolean THEN
      v_avvisi:=v_avvisi||jsonb_build_array('Incluse le chiusure registrate di Cassa in Cloud.');
    END IF;$nuovo$);
  EXECUTE d;
END $patch$;

REVOKE ALL ON FUNCTION private.cassa_pos_proteggi_storno(), private.lipe_corrispettivi_cassa(uuid,date,date) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.cassa_in_cloud_contabilizza_pos(uuid,uuid,uuid,uuid),
  public.cassa_in_cloud_abbina_e_contabilizza_pos(uuid,uuid,jsonb,numeric,uuid,uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.cassa_in_cloud_contabilizza_pos(uuid,uuid,uuid,uuid),
  public.cassa_in_cloud_abbina_e_contabilizza_pos(uuid,uuid,jsonb,numeric,uuid,uuid) TO authenticated;
