-- Bollette, mappa e scenari FV. Applicata via MCP e riallineata al registro del repository.
-- Bozze FV: bollette verificate e posizione del tetto, senza modificare i progetti esistenti.
SET LOCAL lock_timeout='3s';
SET LOCAL statement_timeout='60s';
ALTER TABLE public.fv_progetti ADD COLUMN IF NOT EXISTS analisi_consumi jsonb;
ALTER TABLE public.fv_progetti ADD COLUMN IF NOT EXISTS riferimento_tetto jsonb;
COMMENT ON COLUMN public.fv_progetti.analisi_consumi IS 'Documenti bolletta, dati estratti e corretti, POD, ipotesi orarie e scenario confermato. Privato, escluso dagli identificativi pubblici del PDF.';
COMMENT ON COLUMN public.fv_progetti.riferimento_tetto IS 'Posizione del tetto confermata dall’operatore, separata dall’indirizzo e dalle coordinate della ricerca.';
INSERT INTO storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
VALUES('fv-bollette','fv-bollette',false,20971520,ARRAY['application/pdf','image/jpeg','image/png','image/webp'])
ON CONFLICT(id) DO UPDATE SET public=false,file_size_limit=EXCLUDED.file_size_limit,allowed_mime_types=EXCLUDED.allowed_mime_types;

CREATE OR REPLACE FUNCTION public.fv_bollette_accesso(nome text, modifica boolean DEFAULT false)
RETURNS boolean LANGUAGE sql STABLE SECURITY INVOKER SET search_path=public,pg_temp AS $$
 SELECT CASE WHEN auth.uid() IS NULL OR nome !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[a-f0-9]{64}\.(pdf|png|jpg|webp)$' THEN false ELSE
 NOT (SELECT utente_bloccato()) AND NOT (SELECT utente_e_cliente_esterno())
 AND (split_part(nome,'/',1)::uuid=ANY(aziende_con_permesso(CASE WHEN modifica THEN 'can_edit_preventivi' ELSE 'can_view_preventivi' END)) OR (SELECT has_role(auth.uid(),'super_admin'::app_role)))
 AND EXISTS(SELECT 1 FROM public.fv_progetti p WHERE p.company_id=split_part(nome,'/',1)::uuid AND p.deleted_at IS NULL
   AND (p.id=split_part(nome,'/',2)::uuid OR (NOT modifica AND p.analisi_consumi->'documenti' @> jsonb_build_array(jsonb_build_object('path',nome))))
   AND (NOT modifica OR p.stato::text IN ('bozza','configurato')))
 END
$$;
REVOKE ALL ON FUNCTION public.fv_bollette_accesso(text,boolean) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.fv_bollette_accesso(text,boolean) TO authenticated,service_role;

CREATE OR REPLACE FUNCTION public.fv_consumi_proteggi()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path=public,pg_temp AS $$
DECLARE d jsonb; originale jsonb; cambiato boolean;
BEGIN
  cambiato:=TG_OP='INSERT' OR NEW.analisi_consumi IS DISTINCT FROM OLD.analisi_consumi OR NEW.riferimento_tetto IS DISTINCT FROM OLD.riferimento_tetto;
  IF NOT cambiato THEN RETURN NEW; END IF;
  IF TG_OP='UPDATE' AND OLD.stato::text NOT IN ('bozza','configurato') THEN
    RAISE EXCEPTION 'Le ipotesi del preventivo emesso sono conservate: crea una copia per modificarle' USING ERRCODE='42501';
  END IF;
  IF auth.uid() IS NOT NULL AND (TG_OP='UPDATE' OR NEW.analisi_consumi IS NOT NULL OR NEW.riferimento_tetto IS NOT NULL) AND
    (utente_bloccato() OR utente_e_cliente_esterno() OR NOT (NEW.company_id=ANY(aziende_con_permesso('can_edit_preventivi')) OR has_role(auth.uid(),'super_admin'::app_role))) THEN
    RAISE EXCEPTION 'Non puoi modificare i dati della fornitura di questo preventivo' USING ERRCODE='42501';
  END IF;
  IF NEW.analisi_consumi IS NOT NULL THEN
    IF jsonb_typeof(NEW.analisi_consumi) IS DISTINCT FROM 'object' OR NEW.analisi_consumi->>'versione' IS DISTINCT FROM '1'
      OR jsonb_typeof(NEW.analisi_consumi->'documenti') IS DISTINCT FROM 'array' OR jsonb_array_length(NEW.analisi_consumi->'documenti')>60
      OR pg_column_size(NEW.analisi_consumi)>1000000 THEN RAISE EXCEPTION 'Dati delle bollette non validi' USING ERRCODE='22023'; END IF;
    FOR d IN SELECT value FROM jsonb_array_elements(NEW.analisi_consumi->'documenti') LOOP
      IF d->>'path' IS NULL OR d->>'hash' IS NULL OR d->>'hash' !~ '^[a-f0-9]{64}$' THEN
        RAISE EXCEPTION 'Identità del documento non valida' USING ERRCODE='22023';
      END IF;
      IF d->>'path' !~ ('^'||NEW.company_id::text||'/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/'||(d->>'hash')||'\.(pdf|png|jpg|webp)$') THEN
        RAISE EXCEPTION 'Documento estraneo all’azienda o percorso non valido' USING ERRCODE='42501';
      END IF;
      -- Le copie legittime conservano l'originale. Una nuova referenza richiede accesso al progetto sorgente.
      IF split_part(d->>'path','/',2)<>NEW.id::text AND auth.uid() IS NOT NULL THEN
        IF TG_OP='UPDATE' THEN originale:=OLD.analisi_consumi->'documenti'; ELSE originale:='[]'::jsonb; END IF;
        IF NOT coalesce(originale @> jsonb_build_array(jsonb_build_object('path',d->>'path')),false)
          AND NOT EXISTS(SELECT 1 FROM public.fv_progetti s WHERE s.id=split_part(d->>'path','/',2)::uuid AND s.company_id=NEW.company_id
            AND s.deleted_at IS NULL AND s.analisi_consumi->'documenti' @> jsonb_build_array(jsonb_build_object('path',d->>'path'))) THEN
          RAISE EXCEPTION 'La bolletta non appartiene a un progetto accessibile' USING ERRCODE='42501';
        END IF;
      END IF;
    END LOOP;
  END IF;
  IF NEW.riferimento_tetto IS NOT NULL AND NOT coalesce(
    jsonb_typeof(NEW.riferimento_tetto->'posizione'->'lat')='number' AND abs((NEW.riferimento_tetto->'posizione'->>'lat')::numeric)<=80
    AND jsonb_typeof(NEW.riferimento_tetto->'posizione'->'lng')='number' AND abs((NEW.riferimento_tetto->'posizione'->>'lng')::numeric)<=180
    AND jsonb_typeof(NEW.riferimento_tetto->'ricerca'->'indirizzo')='string' AND length(NEW.riferimento_tetto->'ricerca'->>'indirizzo')<=500,false) THEN
    RAISE EXCEPTION 'Posizione del tetto non valida' USING ERRCODE='22023';
  END IF;
  IF TG_OP='UPDATE' THEN
    DELETE FROM public.fv_calcolo_finanziario WHERE progetto_id=NEW.id;
    NEW.produzione_annua_kwh:=NULL; NEW.autoconsumo_pct:=NULL; NEW.payback_anni:=NULL;
    NEW.npv_25_anni:=NULL; NEW.risparmio_anno1:=NULL;
    NEW.pdf_vendita_url:=NULL; NEW.pdf_tecnico_url:=NULL; NEW.pdf_mobile_url:=NULL;
  END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.fv_consumi_proteggi() FROM PUBLIC,anon,authenticated;
DROP TRIGGER IF EXISTS fv_consumi_proteggi ON public.fv_progetti;
CREATE TRIGGER fv_consumi_proteggi BEFORE INSERT OR UPDATE OF analisi_consumi,riferimento_tetto ON public.fv_progetti
FOR EACH ROW EXECUTE FUNCTION public.fv_consumi_proteggi();

DROP POLICY IF EXISTS fv_bollette_read ON storage.objects;
CREATE POLICY fv_bollette_read ON storage.objects FOR SELECT TO authenticated USING(bucket_id='fv-bollette' AND fv_bollette_accesso(name,false));
DROP POLICY IF EXISTS fv_bollette_insert ON storage.objects;
CREATE POLICY fv_bollette_insert ON storage.objects FOR INSERT TO authenticated WITH CHECK(bucket_id='fv-bollette' AND fv_bollette_accesso(name,true));
DROP POLICY IF EXISTS fv_bollette_read_guard ON storage.objects;
CREATE POLICY fv_bollette_read_guard ON storage.objects AS RESTRICTIVE FOR SELECT TO authenticated USING(bucket_id<>'fv-bollette' OR fv_bollette_accesso(name,false));
DROP POLICY IF EXISTS fv_bollette_insert_guard ON storage.objects;
CREATE POLICY fv_bollette_insert_guard ON storage.objects AS RESTRICTIVE FOR INSERT TO authenticated WITH CHECK(bucket_id<>'fv-bollette' OR fv_bollette_accesso(name,true));
DROP POLICY IF EXISTS fv_bollette_anon_guard ON storage.objects;
CREATE POLICY fv_bollette_anon_guard ON storage.objects AS RESTRICTIVE FOR ALL TO anon USING(bucket_id<>'fv-bollette') WITH CHECK(bucket_id<>'fv-bollette');
DROP POLICY IF EXISTS fv_bollette_immutable ON storage.objects;
CREATE POLICY fv_bollette_immutable ON storage.objects AS RESTRICTIVE FOR UPDATE TO anon,authenticated USING(bucket_id<>'fv-bollette') WITH CHECK(bucket_id<>'fv-bollette');
DROP POLICY IF EXISTS fv_bollette_preserve ON storage.objects;
CREATE POLICY fv_bollette_preserve ON storage.objects AS RESTRICTIVE FOR DELETE TO anon,authenticated USING(bucket_id<>'fv-bollette');

-- I nuovi preventivi conservano anche la configurazione tecnica e i prezzi emessi.
CREATE OR REPLACE FUNCTION public.fv_tecnico_emesso_proteggi()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path=public,pg_temp AS $$
BEGIN
 IF OLD.stato::text IN ('emesso','firmato','annullato') AND (OLD.analisi_consumi IS NOT NULL OR OLD.layout_overlay ? 'mappa')
   AND EXISTS(SELECT 1 FROM unnest(ARRAY['analisi_consumi','riferimento_tetto','consumo_annuo_kwh','costo_kwh_attuale','profilo_consumo','layout_overlay','layout_tetto','ore_sole_annue','fonte_dati_tetto','perdita_ombreggiamento_pct','numero_pannelli_scelti','potenza_kwp','pannello_id','inverter_id','con_accumulo','capacita_accumulo_kwh','con_wallbox','con_ottimizzatori','kit_bundle_id','kit_nome','kit_prezzo','prezzo_vendita_manuale','iva_aliquota','prezzo_vendita_iva_inclusa','sconto_tipo','sconto_valore','sconto_eur_applicato','economia_azienda','produzione_annua_kwh','autoconsumo_pct','risparmio_anno1','payback_anni','npv_25_anni']) k
     WHERE (to_jsonb(NEW)->k) IS DISTINCT FROM (to_jsonb(OLD)->k)) THEN
   RAISE EXCEPTION 'Il preventivo emesso conserva configurazione e risultati: crea una copia per modificarlo' USING ERRCODE='42501';
 END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.fv_tecnico_emesso_proteggi() FROM PUBLIC,anon,authenticated;
DROP TRIGGER IF EXISTS fv_tecnico_emesso_proteggi ON public.fv_progetti;
CREATE TRIGGER fv_tecnico_emesso_proteggi BEFORE UPDATE ON public.fv_progetti FOR EACH ROW EXECUTE FUNCTION public.fv_tecnico_emesso_proteggi();
CREATE OR REPLACE FUNCTION public.fv_riga_emessa_proteggi()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path=public,pg_temp AS $$
DECLARE progetto uuid;
BEGIN
 progetto:=CASE WHEN TG_OP='INSERT' THEN NEW.progetto_id ELSE OLD.progetto_id END;
 IF EXISTS(SELECT 1 FROM public.fv_progetti p WHERE p.id=progetto AND p.stato::text IN ('emesso','firmato','annullato')
   AND (p.analisi_consumi IS NOT NULL OR p.layout_overlay ? 'mappa')) THEN
   RAISE EXCEPTION 'Le voci del preventivo emesso sono conservate: crea una copia' USING ERRCODE='42501';
 END IF;
 IF TG_OP='UPDATE' AND NEW.progetto_id IS DISTINCT FROM OLD.progetto_id AND EXISTS(SELECT 1 FROM public.fv_progetti p WHERE p.id=NEW.progetto_id AND p.stato::text IN ('emesso','firmato','annullato') AND (p.analisi_consumi IS NOT NULL OR p.layout_overlay ? 'mappa')) THEN
   RAISE EXCEPTION 'Non puoi aggiungere voci a un preventivo emesso' USING ERRCODE='42501';
 END IF;
 IF TG_OP='DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
END $$;
REVOKE ALL ON FUNCTION public.fv_riga_emessa_proteggi() FROM PUBLIC,anon,authenticated;
DO $$DECLARE t text; BEGIN
 FOREACH t IN ARRAY ARRAY['fv_componenti_progetto','fv_manodopera_progetto','fv_servizi_progetto'] LOOP
   EXECUTE format('DROP TRIGGER IF EXISTS fv_riga_emessa_proteggi ON public.%I',t);
   EXECUTE format('CREATE TRIGGER fv_riga_emessa_proteggi BEFORE INSERT OR UPDATE OR DELETE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.fv_riga_emessa_proteggi()',t);
 END LOOP;
END $$;

-- Contratto compatibile con i client precedenti: i quattro campi aggiunti sono opzionali.
create or replace function public.fv_save_configuration_atomic(
  p_project_id uuid, p_company_id uuid, p_expected_updated_at timestamptz,
  p_project jsonb, p_components jsonb, p_labour jsonb, p_services jsonb
) returns jsonb language plpgsql security invoker set search_path = '' as $$
declare
  project_row record;
  entry jsonb;
  spec record;
  current_rows jsonb;
  target_rows jsonb;
  same_configuration boolean := true;
  keys text[];
  reset_sql text;
begin
  if auth.uid() is null or p_company_id is distinct from public.get_effective_company_id()
    or (public.has_permission_for_company(auth.uid(), 'can_edit_marketing_opportunities', p_company_id)
      or public.has_permission_for_company(auth.uid(), 'can_edit_marketing', p_company_id)) is not true then
    raise exception 'Operazione non autorizzata' using errcode = '42501';
  end if;
  select * into project_row from public.fv_progetti
    where id = p_project_id and company_id = p_company_id for update;
  if not found then raise exception 'Progetto non accessibile' using errcode = '42501'; end if;
  if coalesce(project_row.stato::text not in ('bozza','configurato'),true) then
    raise exception 'Crea una revisione prima di modificare un preventivo non in bozza' using errcode = '55000';
  end if;
  perform 1 from public.fv_componenti_progetto where progetto_id=p_project_id order by id for update;
  perform 1 from public.fv_manodopera_progetto where progetto_id=p_project_id order by id for update;
  perform 1 from public.fv_servizi_progetto where progetto_id=p_project_id order by id for update;
  if p_expected_updated_at is null or jsonb_typeof(p_project) is distinct from 'object'
    or pg_column_size(p_project) > 2000000 then raise exception 'Configurazione non valida' using errcode = '22023'; end if;
  keys := array['numero_pannelli_scelti','potenza_kwp','con_accumulo','capacita_accumulo_kwh',
    'con_wallbox','con_ottimizzatori','kit_bundle_id','kit_nome','kit_prezzo',
    'prezzo_vendita_manuale','iva_aliquota','layout_overlay'];
  if exists(select 1 from jsonb_object_keys(p_project) k where not k = any(keys || array['analisi_consumi','riferimento_tetto','consumo_annuo_kwh','costo_kwh_attuale']))
    or not (p_project ?& keys) then raise exception 'Campi progetto non consentiti o incompleti' using errcode = '22023'; end if;
  if not coalesce((p_project->>'potenza_kwp')::numeric > 0 and (p_project->>'potenza_kwp')::numeric <= 100000
    and (p_project->>'iva_aliquota')::numeric between 0 and 1
    and (p_project->>'numero_pannelli_scelti')::numeric between 1 and 100000
    and trunc((p_project->>'numero_pannelli_scelti')::numeric) = (p_project->>'numero_pannelli_scelti')::numeric, false)
    or (p_project->>'prezzo_vendita_manuale')::numeric < 0
    or (p_project->>'kit_prezzo')::numeric < 0 then
    raise exception 'Potenza, quantità, prezzi o IVA non validi' using errcode = '22023';
  end if;
  if (p_project->>'kit_bundle_id') is not null and not exists(
    select 1 from public.bundle_prodotti b where b.id = (p_project->>'kit_bundle_id')::uuid and b.company_id = p_company_id
  ) then raise exception 'Kit estraneo all’azienda' using errcode = '42501'; end if;
  if jsonb_typeof(p_project->'con_accumulo') is distinct from 'boolean'
    or jsonb_typeof(p_project->'con_wallbox') is distinct from 'boolean'
    or jsonb_typeof(p_project->'con_ottimizzatori') is distinct from 'boolean'
    or not coalesce((p_project->>'capacita_accumulo_kwh')::numeric between 0 and 100000,false)
    or ((p_project->>'con_accumulo')::boolean and not ((p_project->>'capacita_accumulo_kwh')::numeric>0))
    or (p_project->>'kit_bundle_id' is not null and not coalesce((p_project->>'kit_prezzo')::numeric>0,false)) then
    raise exception 'Flag, capacità o prezzo kit non validi' using errcode='22023';
  end if;
  same_configuration := not exists(select 1 from jsonb_each(p_project) x where (to_jsonb(project_row)->x.key) is distinct from x.value);
  for spec in select * from (values
    ('fv_componenti_progetto', p_components, array['articolo_id','categoria','descrizione','marca','modello','quantita','unita_misura','prezzo_unitario_netto','prezzo_unitario_vendita','margine_pct','potenza_unitaria_w','potenza_unitaria_kw','capacita_kwh','garanzia_anni','ordinamento']),
    ('fv_manodopera_progetto', p_labour, array['tariffa_id','descrizione','ore','tariffa_oraria_netta','tariffa_oraria_vendita','margine_pct','ordinamento']),
    ('fv_servizi_progetto', p_services, array['tipo','descrizione','quantita','prezzo_netto','prezzo_vendita','ordinamento','note_operative'])
  ) as specs(tab, rows, allowed)
  loop
    if jsonb_typeof(spec.rows) is distinct from 'array' or jsonb_array_length(spec.rows) > 300 or pg_column_size(spec.rows) > 250000 then
      raise exception 'Righe configurazione non valide' using errcode = '22023'; end if;
    for entry in select * from jsonb_array_elements(spec.rows) loop
      if jsonb_typeof(entry) is distinct from 'object' or exists(select 1 from jsonb_object_keys(entry) k where not k = any(spec.allowed))
        or not coalesce(length(btrim(entry->>'descrizione')) between 1 and 4000, false) then
        raise exception 'Campi riga non validi' using errcode = '22023'; end if;
      if spec.tab = 'fv_componenti_progetto' then
        if not coalesce((entry->>'quantita')::numeric > 0 and (entry->>'quantita')::numeric <= 1000000
          and (entry->>'prezzo_unitario_netto')::numeric between 0 and 10000000
          and (entry->>'prezzo_unitario_vendita')::numeric between 0 and 10000000
          and entry->>'categoria' in ('pannello','inverter','accumulo','wallbox','ottimizzatore','struttura','cavi','altro'), false) then
          raise exception 'Componente non valido' using errcode = '22023'; end if;
        if entry->>'articolo_id' is not null and not exists(select 1 from public.articoli_native a
          where a.id = (entry->>'articolo_id')::uuid and a.company_id = p_company_id) then
          raise exception 'Articolo estraneo all’azienda' using errcode = '42501'; end if;
      elsif spec.tab = 'fv_manodopera_progetto' then
        if not coalesce((entry->>'ore')::numeric > 0 and (entry->>'ore')::numeric <= 1000000
          and (entry->>'tariffa_oraria_netta')::numeric between 0 and 10000000
          and (entry->>'tariffa_oraria_vendita')::numeric between 0 and 10000000, false) then
          raise exception 'Manodopera non valida' using errcode = '22023'; end if;
        if entry->>'tariffa_id' is not null and not exists(select 1 from public.tariffe_aziendali t
          where t.id = (entry->>'tariffa_id')::uuid and t.company_id = p_company_id) then
          raise exception 'Tariffa estranea all’azienda' using errcode = '42501'; end if;
      else
        if not coalesce((entry->>'quantita')::numeric > 0 and (entry->>'quantita')::numeric <= 1000000
          and (entry->>'prezzo_netto')::numeric between 0 and 10000000
          and (entry->>'prezzo_vendita')::numeric between 0 and 10000000
          and entry->>'tipo' in ('pratica_gse','allaccio_e_distribuzione','asseverazione','smaltimento_amianto','opere_edili_accessorie','smaltimento_imballaggi','oneri_sicurezza','altro'), false) then
          raise exception 'Servizio non valido' using errcode = '22023'; end if;
      end if;
    end loop;
    -- Canonical comparison omits regenerated DB IDs/timestamps. A retry of an
    -- identical successful request is a no-op even if its HTTP response was lost.
    execute format('select coalesce(jsonb_agg(to_jsonb(r)-''id''-''progetto_id''-''created_at'' order by ordinamento, descrizione), ''[]''::jsonb) from public.%I r where progetto_id=$1', spec.tab)
      into current_rows using p_project_id;
    execute format('select coalesce(jsonb_agg(to_jsonb(r)-''id''-''progetto_id''-''created_at'' order by ordinamento, descrizione), ''[]''::jsonb) from jsonb_populate_recordset(null::public.%I, $1) r', spec.tab)
      into target_rows using spec.rows;
    same_configuration := same_configuration and current_rows = target_rows;
  end loop;
  if jsonb_array_length(p_components) = 0 then raise exception 'Configura almeno un componente' using errcode = '22023'; end if;
  if same_configuration then return jsonb_build_object('projectId', p_project_id, 'updatedAt', project_row.updated_at, 'replayed', true); end if;
  if project_row.updated_at is distinct from p_expected_updated_at then
    raise exception 'Il preventivo è stato modificato: ricarica prima di salvare' using errcode = 'PT409'; end if;
  -- No exception handler: any constraint, trigger or RLS failure rolls back ALL
  -- deletes/inserts AND the project patch in the caller's single RPC transaction.
  delete from public.fv_componenti_progetto where progetto_id = p_project_id;
  if exists(select 1 from public.fv_componenti_progetto where progetto_id=p_project_id) then raise exception 'Rimozione componenti negata' using errcode='42501'; end if;
  insert into public.fv_componenti_progetto select
    (jsonb_populate_record(null::public.fv_componenti_progetto, x || jsonb_build_object('id', gen_random_uuid(), 'progetto_id', p_project_id, 'created_at', now()))).*
    from jsonb_array_elements(p_components) x;
  delete from public.fv_manodopera_progetto where progetto_id = p_project_id;
  if exists(select 1 from public.fv_manodopera_progetto where progetto_id=p_project_id) then raise exception 'Rimozione manodopera negata' using errcode='42501'; end if;
  insert into public.fv_manodopera_progetto select
    (jsonb_populate_record(null::public.fv_manodopera_progetto, x || jsonb_build_object('id', gen_random_uuid(), 'progetto_id', p_project_id, 'created_at', now()))).*
    from jsonb_array_elements(p_labour) x;
  delete from public.fv_servizi_progetto where progetto_id = p_project_id;
  if exists(select 1 from public.fv_servizi_progetto where progetto_id=p_project_id) then raise exception 'Rimozione servizi negata' using errcode='42501'; end if;
  insert into public.fv_servizi_progetto select
    (jsonb_populate_record(null::public.fv_servizi_progetto, x || jsonb_build_object('id', gen_random_uuid(), 'progetto_id', p_project_id, 'created_at', now()))).*
    from jsonb_array_elements(p_services) x;
  -- A changed configuration invalidates derived calculations and generated
  -- document pointers in the SAME transaction, never the stored model/terms.
  if pg_catalog.to_regclass('public.fv_calcolo_finanziario') is not null then
    execute 'delete from public.fv_calcolo_finanziario where progetto_id=$1' using p_project_id;
    execute 'select exists(select 1 from public.fv_calcolo_finanziario where progetto_id=$1)' into same_configuration using p_project_id;
    if same_configuration then raise exception 'Invalidazione calcolo negata' using errcode='42501'; end if;
  end if;
  select string_agg(format('%I=null',a.attname),',') into reset_sql
    from pg_catalog.pg_attribute a where a.attrelid='public.fv_progetti'::regclass and a.attnum>0 and not a.attisdropped
    and a.attname=any(array['produzione_annua_kwh','autoconsumo_pct','costo_totale_netto','prezzo_vendita_iva_inclusa','margine_eur','margine_pct','incentivi_applicati','risparmio_anno1','payback_anni','npv_25_anni','irr_pct','co2_evitata_25_anni_kg','pdf_vendita_url','pdf_tecnico_url','pdf_mobile_url','finanziamento_rata_eur','finanziamento_totale_dovuto_eur']);
  if reset_sql is not null then execute 'update public.fv_progetti set '||reset_sql||' where id=$1 and company_id=$2' using p_project_id,p_company_id; end if;
  update public.fv_progetti set numero_pannelli_scelti=(p_project->>'numero_pannelli_scelti')::integer,
    potenza_kwp=(p_project->>'potenza_kwp')::numeric, con_accumulo=(p_project->>'con_accumulo')::boolean,
    capacita_accumulo_kwh=(p_project->>'capacita_accumulo_kwh')::numeric, con_wallbox=(p_project->>'con_wallbox')::boolean,
    con_ottimizzatori=(p_project->>'con_ottimizzatori')::boolean, kit_bundle_id=(p_project->>'kit_bundle_id')::uuid,
    kit_nome=p_project->>'kit_nome', kit_prezzo=(p_project->>'kit_prezzo')::numeric,
    prezzo_vendita_manuale=(p_project->>'prezzo_vendita_manuale')::numeric, iva_aliquota=(p_project->>'iva_aliquota')::numeric,
    analisi_consumi=case when p_project ? 'analisi_consumi' then nullif(p_project->'analisi_consumi','null'::jsonb) else analisi_consumi end,
    riferimento_tetto=case when p_project ? 'riferimento_tetto' then nullif(p_project->'riferimento_tetto','null'::jsonb) else riferimento_tetto end,
    consumo_annuo_kwh=case when p_project ? 'consumo_annuo_kwh' then (p_project->>'consumo_annuo_kwh')::numeric else consumo_annuo_kwh end,
    costo_kwh_attuale=case when p_project ? 'costo_kwh_attuale' then (p_project->>'costo_kwh_attuale')::numeric else costo_kwh_attuale end,
    layout_overlay=nullif(p_project->'layout_overlay','null'::jsonb), updated_at=clock_timestamp()
    where id=p_project_id and company_id=p_company_id;
  if not found then raise exception 'Aggiornamento progetto negato' using errcode='42501'; end if;
  select updated_at into project_row from public.fv_progetti where id=p_project_id;
  return jsonb_build_object('projectId',p_project_id,'updatedAt',project_row.updated_at,'replayed',false);
end;
$$;
revoke all on function public.fv_save_configuration_atomic(uuid,uuid,timestamptz,jsonb,jsonb,jsonb,jsonb) from public, anon;
grant execute on function public.fv_save_configuration_atomic(uuid,uuid,timestamptz,jsonb,jsonb,jsonb,jsonb) to authenticated;
