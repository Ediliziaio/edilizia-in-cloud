-- Una fattura, più rate: quote del documento, mai copie della fattura o nuovi movimenti.
-- La versione CLI è stata collocata dopo le dipendenze già presenti nel repository.
ALTER TABLE public.order_installments
 ADD COLUMN documento_quota_lorda numeric(14,2),
 ADD COLUMN documento_quota_offset numeric(14,2),
 ADD CONSTRAINT order_installments_quota_fattura_check CHECK (
  (documento_quota_lorda IS NULL AND documento_quota_offset IS NULL) OR
  (documento_fiscale_id IS NOT NULL AND documento_quota_lorda > 0 AND documento_quota_offset >= 0));
DROP INDEX public.uq_order_installments_documento_fiscale;
CREATE UNIQUE INDEX uq_order_installments_documento_fiscale ON public.order_installments(documento_fiscale_id)
 WHERE documento_fiscale_id IS NOT NULL AND documento_quota_lorda IS NULL;
CREATE INDEX order_installments_quote_fattura_idx ON public.order_installments(documento_fiscale_id)
 WHERE documento_quota_lorda IS NOT NULL;

-- Arrotondamento degli estremi: le quote sommano al dovuto anche con centesimi e trattenute.
CREATE OR REPLACE FUNCTION private.quote_fattura_rate(p_documento uuid)
RETURNS TABLE(rata_id uuid, order_id uuid, documento_id uuid, quota_lorda numeric,
 quota_esigibile numeric, incassato numeric, residuo numeric, non_esigibile numeric,
 inizio numeric, fine numeric, incassata_il date)
LANGUAGE sql STABLE SET search_path='' AS $$
 WITH b AS (
  SELECT i.id,i.order_id,d.id AS doc,i.documento_quota_lorda AS quota,
   round(i.documento_quota_offset * greatest(0,d.totale_da_pagare-public.documento_stornato_totale(d.id))/nullif(d.totale_documento,0),2) AS a,
   round((i.documento_quota_offset+i.documento_quota_lorda) * greatest(0,d.totale_da_pagare-public.documento_stornato_totale(d.id))/nullif(d.totale_documento,0),2) AS z,
   CASE WHEN d.stato IN ('bozza','annullata','stornata') OR d.deleted_at IS NOT NULL THEN 0 ELSE greatest(0,coalesce(d.importo_pagato,0)) END AS pagato
  FROM public.order_installments i JOIN public.documenti_fiscali d ON d.id=i.documento_fiscale_id
  WHERE d.id=p_documento AND i.documento_quota_lorda IS NOT NULL
 ) SELECT id,order_id,doc,quota,z-a,least(z-a,greatest(0,pagato-a)),
 greatest(0,(z-a)-least(z-a,greatest(0,pagato-a))),greatest(0,quota-(z-a)),a,z,
 CASE WHEN pagato>=z AND z>a THEN (SELECT min(m.data_movimento) FROM (
 SELECT mm.data_movimento,sum(mm.importo) OVER(ORDER BY mm.data_movimento,mm.created_at,mm.id) AS cumulato
 FROM public.movimenti_cassa_native mm WHERE mm.documento_id=doc AND mm.tipo='incasso') m WHERE m.cumulato>=z) END FROM b;
$$;
REVOKE ALL ON FUNCTION private.quote_fattura_rate(uuid) FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION private.sincronizza_quote_fattura(p_documento uuid)
RETURNS void LANGUAGE plpgsql SET search_path='' AS $$
BEGIN
 UPDATE public.order_installments i SET
 is_paid=(q.residuo=0 AND q.quota_esigibile>0),paid_date=CASE WHEN q.residuo=0 THEN
 q.incassata_il END
 FROM private.quote_fattura_rate(p_documento) q
 WHERE i.id=q.rata_id AND (i.is_paid IS DISTINCT FROM (q.residuo=0 AND q.quota_esigibile>0) OR
  (i.paid_date IS DISTINCT FROM (CASE WHEN q.residuo=0 THEN q.incassata_il END)));
END $$;
REVOKE ALL ON FUNCTION private.sincronizza_quote_fattura(uuid) FROM PUBLIC,anon,authenticated;

-- Anche gli aggiornamenti diretti restano entro azienda, permessi, importo e intervalli del documento.
CREATE OR REPLACE FUNCTION private.controlla_quota_fattura()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE d record; c uuid;
BEGIN
 IF NEW.documento_quota_lorda IS NULL AND (TG_OP='INSERT' OR OLD.documento_quota_lorda IS NULL) THEN
  IF NEW.documento_fiscale_id IS NOT NULL THEN
   -- Lo stesso blocco della RPC multipla: anche un vecchio collegamento concorrente deve attendere.
   SELECT * INTO d FROM public.documenti_fiscali WHERE id=NEW.documento_fiscale_id FOR UPDATE;
   SELECT company_id INTO c FROM public.orders WHERE id=NEW.order_id;
   IF d.company_id IS DISTINCT FROM c OR (d.ordine_id IS NOT NULL AND d.ordine_id<>NEW.order_id) THEN
    RAISE EXCEPTION 'Fattura e rata appartengono a commesse o aziende diverse.' USING ERRCODE='23514'; END IF;
   IF EXISTS(SELECT 1 FROM public.order_installments i
    WHERE i.documento_fiscale_id=NEW.documento_fiscale_id AND i.id<>NEW.id AND i.documento_quota_lorda IS NOT NULL) THEN
    RAISE EXCEPTION 'Questa fattura è ripartita: usa Gestisci rate della fattura.' USING ERRCODE='23514';
   END IF;
  END IF;
  RETURN NEW;
 END IF;
 IF TG_OP='UPDATE' AND OLD.documento_quota_lorda IS NOT NULL AND NEW.documento_quota_lorda IS NOT NULL AND (NEW.amount IS DISTINCT FROM OLD.amount OR NEW.position IS DISTINCT FROM OLD.position) THEN
 RAISE EXCEPTION 'Scollega la fattura prima di cambiare importi o ordine delle rate ripartite.' USING ERRCODE='23514'; END IF;
 IF TG_OP='UPDATE' AND NEW.documento_quota_lorda IS NOT DISTINCT FROM OLD.documento_quota_lorda
  AND NEW.documento_quota_offset IS NOT DISTINCT FROM OLD.documento_quota_offset
  AND NEW.documento_fiscale_id IS NOT DISTINCT FROM OLD.documento_fiscale_id THEN RETURN NEW; END IF;
 SELECT company_id INTO c FROM public.orders WHERE id=NEW.order_id;
 IF auth.uid() IS NOT NULL AND (public.user_can_access_company(c) IS NOT TRUE OR
  NOT public.puo_gestire_documento_fiscale(c,'fattura')) THEN RAISE EXCEPTION 'Accesso negato' USING ERRCODE='42501'; END IF;
 IF NEW.documento_quota_lorda IS NULL THEN RETURN NEW; END IF;
 SELECT * INTO d FROM public.documenti_fiscali WHERE id=NEW.documento_fiscale_id FOR UPDATE;
 IF d.company_id IS DISTINCT FROM c OR d.ordine_id IS DISTINCT FROM NEW.order_id THEN
  RAISE EXCEPTION 'Fattura e rata devono appartenere alla stessa commessa e azienda.' USING ERRCODE='23514'; END IF;
 IF NEW.documento_quota_offset+NEW.documento_quota_lorda>d.totale_documento OR EXISTS(
  SELECT 1 FROM public.order_installments i WHERE i.documento_fiscale_id=d.id AND i.id<>NEW.id AND
   (i.documento_quota_lorda IS NULL OR (i.documento_quota_offset < NEW.documento_quota_offset+NEW.documento_quota_lorda
    AND NEW.documento_quota_offset < i.documento_quota_offset+i.documento_quota_lorda))) THEN
  RAISE EXCEPTION 'Quote sovrapposte o superiori alla fattura.' USING ERRCODE='23514'; END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION private.controlla_quota_fattura() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER controlla_quota_fattura BEFORE INSERT OR UPDATE ON public.order_installments
 FOR EACH ROW EXECUTE FUNCTION private.controlla_quota_fattura();

CREATE OR REPLACE FUNCTION public.rate_fattura_quote(p_order_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE r jsonb; result jsonb;
BEGIN
 r:=private.office_order_rights(p_order_id);
 IF NOT private.office_visible_order(p_order_id) OR NOT coalesce((r->>'amounts')::boolean,false) THEN
  RAISE EXCEPTION 'Commessa non disponibile' USING ERRCODE='42501'; END IF;
 SELECT coalesce(jsonb_agg(to_jsonb(q)),'[]') INTO result FROM (
  SELECT a.* FROM (SELECT DISTINCT documento_fiscale_id FROM public.order_installments
   WHERE order_id=p_order_id AND documento_quota_lorda IS NOT NULL) d
  CROSS JOIN LATERAL private.quote_fattura_rate(d.documento_fiscale_id) a
  WHERE a.order_id=p_order_id
 ) q;
 RETURN result;
END $$;
REVOKE ALL ON FUNCTION public.rate_fattura_quote(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.rate_fattura_quote(uuid) TO authenticated,service_role;

CREATE OR REPLACE FUNCTION public.collega_fattura_rate(p_order_id uuid,p_documento_id uuid,p_rate uuid[])
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE d record; c uuid; n integer; totale numeric; r record; offset_quota numeric:=0;
BEGIN
 SELECT company_id INTO c FROM public.orders WHERE id=p_order_id AND deleted_at IS NULL FOR UPDATE;
 IF c IS NULL OR public.user_can_access_company(c) IS NOT TRUE OR
  NOT public.puo_gestire_documento_fiscale(c,'fattura') THEN RAISE EXCEPTION 'Accesso negato' USING ERRCODE='42501'; END IF;
 SELECT * INTO d FROM public.documenti_fiscali WHERE id=p_documento_id FOR UPDATE;
 IF d.id IS NULL OR d.company_id<>c OR d.deleted_at IS NOT NULL OR d.stato IN ('annullata','stornata','in_invio')
  OR d.tipo NOT IN ('fattura','fattura_pa','parcella','fattura_accompagnatoria','acconto_fattura','acconto_parcella','fattura_differita_b','fattura_riepilogativa')
  OR (d.ordine_id IS NOT NULL AND d.ordine_id<>p_order_id) THEN
  RAISE EXCEPTION 'Fattura non disponibile per questa commessa.' USING ERRCODE='22023'; END IF;
 IF d.ordine_id IS NULL AND NOT EXISTS(SELECT 1 FROM public.fattura_ordine f WHERE f.fattura_id=d.id AND f.ordine_id=p_order_id) THEN
  RAISE EXCEPTION 'Collega prima la fattura alla commessa.' USING ERRCODE='23514'; END IF;
 IF abs(coalesce(d.importo_pagato,0)-coalesce((SELECT sum(m.importo) FROM public.movimenti_cassa_native m WHERE m.documento_id=d.id AND m.tipo='incasso'),0))>0.011 THEN
  RAISE EXCEPTION 'Gli incassi della fattura sono da riconciliare prima di ripartirla.' USING ERRCODE='23514'; END IF;
 IF EXISTS(SELECT 1 FROM public.fattura_ordine f WHERE f.fattura_id=d.id AND
   (f.ordine_id<>p_order_id OR (f.importo_associato IS NOT NULL AND round(f.importo_associato,2)<>round(d.totale_documento,2)))) THEN
  RAISE EXCEPTION 'La fattura è divisa tra commesse: verifica prima le quote.' USING ERRCODE='23514'; END IF;
 SELECT count(DISTINCT id),sum(amount) INTO n,totale FROM public.order_installments
  WHERE id=ANY(p_rate) AND order_id=p_order_id;
 IF coalesce(n,0)=0 OR n<>cardinality(p_rate) OR round(totale,2)<>round(d.totale_documento,2) THEN
  RAISE EXCEPTION 'Seleziona rate della commessa che coprano esattamente il totale della fattura.' USING ERRCODE='23514'; END IF;
 PERFORM id FROM public.order_installments WHERE order_id=p_order_id ORDER BY id FOR UPDATE;
 IF EXISTS(SELECT 1 FROM public.order_installments i WHERE i.id=ANY(p_rate) AND
   (i.type='financing' OR i.invoice_id IS NOT NULL OR (i.documento_fiscale_id IS NOT NULL AND i.documento_fiscale_id<>d.id)
    OR (i.is_paid AND i.documento_fiscale_id IS NULL) OR i.amount<=0)) THEN
  RAISE EXCEPTION 'Una rata è già incassata, finanziata o collegata a un altro documento: verifica il piano.' USING ERRCODE='23514'; END IF;
 IF EXISTS(SELECT 1 FROM public.prima_nota_entries p WHERE p.installment_id=ANY(p_rate) AND
  p.reversal_of IS NULL AND NOT EXISTS(SELECT 1 FROM public.prima_nota_entries x WHERE x.reversal_of=p.id)) THEN
  RAISE EXCEPTION 'Esiste un incasso separato sulla rata: riconcilialo prima, senza duplicarlo.' USING ERRCODE='23514'; END IF;
 -- Il saldo può essere calcolato per differenza: usiamo il piano definitivo, non importi stimati.
 IF EXISTS(SELECT 1 FROM public.rate_importi(c) x JOIN public.order_installments i ON i.id=x.installment_id
  WHERE i.id=ANY(p_rate) AND abs(x.importo-i.amount)>0.01) THEN
  RAISE EXCEPTION 'Gli importi del piano sono cambiati: salva prima il piano aggiornato.' USING ERRCODE='23514'; END IF;
 -- Rimuove solo i collegamenti della fattura, non tocca movimenti, date delle rate o documenti.
 UPDATE public.order_installments SET documento_fiscale_id=NULL,documento_quota_lorda=NULL,
  documento_quota_offset=NULL,is_paid=false,paid_date=NULL WHERE documento_fiscale_id=d.id;
 UPDATE public.documenti_fiscali SET ordine_id=p_order_id WHERE id=d.id AND ordine_id IS NULL;
 FOR r IN SELECT id,amount FROM public.order_installments WHERE id=ANY(p_rate) ORDER BY position,id LOOP
  UPDATE public.order_installments SET documento_fiscale_id=d.id,documento_quota_lorda=r.amount,
   documento_quota_offset=offset_quota WHERE id=r.id;
  offset_quota:=offset_quota+r.amount;
 END LOOP;
 PERFORM private.sincronizza_quote_fattura(d.id);
END $$;
REVOKE ALL ON FUNCTION public.collega_fattura_rate(uuid,uuid,uuid[]) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.collega_fattura_rate(uuid,uuid,uuid[]) TO authenticated,service_role;

-- I vecchi collegamenti rimangono identici; il ramo nuovo non crea o annulla incassi.
DO $patch$
DECLARE d text; n text;
BEGIN
 d:=pg_get_functiondef('public.allinea_fattura_da_rata()'::regprocedure);
 n:=replace(d,'BEGIN','BEGIN
  IF NEW.documento_quota_lorda IS NOT NULL THEN
    PERFORM private.sincronizza_quote_fattura(NEW.documento_fiscale_id); RETURN NEW;
  ELSIF OLD.documento_quota_lorda IS NOT NULL THEN RETURN NEW; END IF;');
 IF n=d THEN RAISE EXCEPTION 'allinea_fattura_da_rata cambiata'; END IF; EXECUTE n;
 d:=pg_get_functiondef('public.allinea_rata_da_fattura()'::regprocedure);
 n:=replace(d,'BEGIN','BEGIN
  IF EXISTS(SELECT 1 FROM public.order_installments i WHERE i.documento_fiscale_id=NEW.id AND i.documento_quota_lorda IS NOT NULL) THEN
    IF NEW.stato IN (''annullata'',''stornata'') OR NEW.deleted_at IS NOT NULL THEN
      UPDATE public.order_installments SET documento_fiscale_id=NULL,documento_quota_lorda=NULL,documento_quota_offset=NULL,is_paid=false,paid_date=NULL WHERE documento_fiscale_id=NEW.id;
    ELSE PERFORM private.sincronizza_quote_fattura(NEW.id); END IF;
    RETURN NEW;
  END IF;');
 IF n=d THEN RAISE EXCEPTION 'allinea_rata_da_fattura cambiata'; END IF; EXECUTE n;
 d:=pg_get_functiondef('public.scollega_rata_fattura(uuid)'::regprocedure);
 n:=replace(d,'SET documento_fiscale_id = NULL','SET is_paid=CASE WHEN documento_quota_lorda IS NOT NULL THEN false ELSE is_paid END, paid_date=CASE WHEN documento_quota_lorda IS NOT NULL THEN NULL ELSE paid_date END, documento_quota_lorda=NULL,documento_quota_offset=NULL,documento_fiscale_id = NULL');
 IF n=d THEN RAISE EXCEPTION 'scollega_rata_fattura cambiata'; END IF; EXECUTE n;
END $patch$;

-- I registri e il previsionale leggono le stesse quote della scheda.
DO $patch$
DECLARE d text; n text;
BEGIN
 d:=pg_get_functiondef('public.rate_incassi(uuid)'::regprocedure);
 n:=d;
 -- Esclude solo le quote nuove dal percorso storico (che altrimenti replicherebbe ogni incasso per N rate).
 n:=replace(n,'where not (o.order_type=', 'where not exists(select 1 from public.order_installments qi where qi.id=x.installment_id and qi.documento_quota_lorda is not null) and not (o.order_type=');
 n:=replace(n,'  union all
  select d.order_id', '  union all
  select q.order_id,q.rata_id,m.data_movimento,
    greatest(0,least(q.fine,m.cumulato)-greatest(q.inizio,m.cumulato-m.importo))
  from (select mm.*,sum(mm.importo) over(partition by mm.documento_id order by mm.data_movimento,mm.created_at,mm.id) as cumulato
    from public.movimenti_cassa_native mm where mm.company_id=p_company and mm.tipo=''incasso'') m
  cross join lateral private.quote_fattura_rate(m.documento_id) q
  where greatest(0,least(q.fine,m.cumulato)-greatest(q.inizio,m.cumulato-m.importo))>0
  union all
  select d.order_id');
 n:=replace(n,'  union all
  select d.order_id', '  union all
  select o.id,m.documento_id,m.data_movimento,m.importo-coalesce((select sum(greatest(0,least(q.fine,m.cumulato)-greatest(q.inizio,m.cumulato-m.importo))) from private.quote_fattura_rate(m.documento_id) q),0)
  from (select mm.*,sum(mm.importo) over(partition by mm.documento_id order by mm.data_movimento,mm.created_at,mm.id) as cumulato
    from public.movimenti_cassa_native mm where mm.company_id=p_company and mm.tipo=''incasso'') m
  join public.documenti_fiscali df on df.id=m.documento_id join public.orders o on o.id=df.ordine_id
  where o.company_id=p_company and o.deleted_at is null and not (o.order_type=''appaltatore_lavoro'' and o.valorizzazione=''a_misura'')
    and not exists(select 1 from public.unita_immobiliari u where u.order_id=o.id)
    and not exists(select 1 from public.order_installments i where i.documento_fiscale_id=df.id and i.documento_quota_lorda is null)
  union all
  select d.order_id');
 IF n=d OR position('private.quote_fattura_rate' in n)=0 THEN RAISE EXCEPTION 'rate_incassi cambiata'; END IF; EXECUTE n;
 d:=pg_get_functiondef('public.rate_da_incassare(uuid)'::regprocedure);
 n:=replace(d,'greatest(0, r.importo - coalesce(d.importo_pagato, 0)',
 'greatest(0, r.importo - coalesce((select q.incassato+q.non_esigibile from private.quote_fattura_rate(d.id) q where q.rata_id=r.installment_id),d.importo_pagato,0)');
 IF n=d THEN RAISE EXCEPTION 'rate_da_incassare cambiata'; END IF; EXECUTE n;
 d:=pg_get_functiondef('private.office_quadro_pagamenti_raw(uuid)'::regprocedure);
 n:=replace(d,'coalesce(inv.invoice_number, df.numero) AS fattura,',
 'coalesce(inv.invoice_number, df.numero) AS fattura,
  coalesce((select q.incassato from private.quote_fattura_rate(df.id) q where q.rata_id=i.id), df.importo_pagato,case when i.is_paid then i.amount else 0 end) AS incassato,
  coalesce((select q.residuo from private.quote_fattura_rate(df.id) q where q.rata_id=i.id),greatest(0,i.amount-coalesce(df.importo_pagato,case when i.is_paid then i.amount else 0 end))) AS residuo,');
 IF n=d THEN RAISE EXCEPTION 'office_quadro_pagamenti_raw cambiata'; END IF; EXECUTE n;
END $patch$;

-- Copie migrate con UUID invariato e numero rinominato: una sola IVA, senza fondere documenti diversi.
DO $patch$
DECLARE d text; n text;
BEGIN
 d:=pg_get_functiondef('public.commessa_iva(uuid)'::regprocedure);
 n:=replace(d,'df.numero = i.invoice_number and df.deleted_at is null',
 '(df.numero = i.invoice_number OR (df.id=i.id AND df.data_emissione=i.issue_date
 AND round(df.totale_documento,2)=round(i.total,2) AND round(df.imponibile_totale,2)=round(i.subtotal,2))) and df.deleted_at is null');
 IF n=d THEN RAISE EXCEPTION 'commessa_iva cambiata'; END IF; EXECUTE n;
END $patch$;
-- Ricalcola anche se si modificano netto/esigibilità o si elimina logicamente il documento.
DROP TRIGGER trg_sync_rata_da_fattura ON public.documenti_fiscali;
CREATE TRIGGER trg_sync_rata_da_fattura AFTER UPDATE OF stato,importo_pagato,totale_da_pagare,totale_documento,deleted_at
 ON public.documenti_fiscali FOR EACH ROW EXECUTE FUNCTION public.allinea_rata_da_fattura();

-- Il salvataggio storico senza identificativi ricreava le rate: sulle quote è ambiguo, quindi si rifiuta.
DO $guard$
DECLARE d text;n text;
BEGIN
 IF to_regprocedure('public.order_rate_sostituisci(uuid,jsonb)') IS NOT NULL THEN
 d:=pg_get_functiondef('public.order_rate_sostituisci(uuid,jsonb)'::regprocedure);
 n:=replace(d,'  IF v_con_id THEN','  IF NOT v_con_id AND EXISTS(SELECT 1 FROM public.order_installments WHERE order_id=p_order_id AND documento_quota_lorda IS NOT NULL) THEN
  RAISE EXCEPTION ''Il piano contiene quote di fattura: conserva gli identificativi delle rate oppure scollega prima le quote.'' USING ERRCODE=''23514''; END IF;
  IF v_con_id THEN');
 IF n=d THEN RAISE EXCEPTION 'order_rate_sostituisci cambiata';END IF;EXECUTE n;
 END IF;
END $guard$;
NOTIFY pgrst,'reload schema';

-- I contratti a misura e le unità in vendita hanno già il proprio registro incassi.
DO $scope$
DECLARE d text; n text;
BEGIN
 d:=pg_get_functiondef('public.collega_fattura_rate(uuid,uuid,uuid[])'::regprocedure);
 n:=replace(d,' SELECT * INTO d FROM public.documenti_fiscali WHERE id=p_documento_id FOR UPDATE;',
 ' IF EXISTS(SELECT 1 FROM public.orders o WHERE o.id=p_order_id AND o.order_type=''appaltatore_lavoro'' AND o.valorizzazione=''a_misura'')
 OR EXISTS(SELECT 1 FROM public.unita_immobiliari u WHERE u.order_id=p_order_id) THEN
 RAISE EXCEPTION ''Usa il registro incassi dedicato al contratto a misura o alle unità in vendita.'' USING ERRCODE=''23514''; END IF;
 SELECT * INTO d FROM public.documenti_fiscali WHERE id=p_documento_id FOR UPDATE;');
 IF n=d THEN RAISE EXCEPTION 'collega_fattura_rate cambiata';END IF;EXECUTE n;
END $scope$;
