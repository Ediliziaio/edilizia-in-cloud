-- ============================================================================
-- OUTREACH — LOCK MULTI-BRAND, THROTTLING MX, AUDIT AI
--
-- ⚠️ GIÀ APPLICATA IN PRODUZIONE il 26/07/2026 via execute_sql.
--    Questo file è il record sorgente, scritto idempotente (IF NOT EXISTS /
--    CREATE OR REPLACE) così rieseguirlo non fa danni.
--
-- Contesto: il sistema di outreach super_admin esisteva già (11 tabelle,
-- 15 edge function, 3 cron, 40 componenti React) ma NON aveva alcun controllo
-- che impedisse a due brand AEDIX di contattare la stessa impresa. Questa
-- migration aggiunge solo il pezzo mancante, senza duplicare nulla:
--   • outreach_prospect_companies — l'azienda-prospect, unità di lock
--   • outreach_prospect_contacts  — stato outreach del contatto (i dati
--                                   anagrafici restano in marketing_contacts)
--   • outreach_suppression        — scope company/domain (email resta su
--                                   email_suppressions, già collegata all'ESP)
--   • outreach_mx_map/_throttle   — invii per MX host, non per dominio
--   • outreach_ai_generations     — audit delle aperture generate
--
-- NOME: "prospect_companies" e non "companies" perché in questo DB `companies`
-- sono i TENANT di EiC. Chiamare companies i prospect avrebbe reso illeggibile
-- ogni join futura.
-- ============================================================================

-- ── whitelist domini generici ───────────────────────────────────────────────
-- Sui dati reali il 53% delle email valide sta su gmail/libero/virgilio: senza
-- questa lista il Company Lock sul dominio bloccherebbe interi provider.
CREATE TABLE IF NOT EXISTS outreach_generic_domains (domain text PRIMARY KEY);
INSERT INTO outreach_generic_domains(domain) VALUES
  ('gmail.com'),('googlemail.com'),('gmail.it'),('libero.it'),('virgilio.it'),
  ('alice.it'),('tin.it'),('tiscali.it'),('fastwebnet.it'),('hotmail.it'),
  ('hotmail.com'),('outlook.it'),('outlook.com'),('live.it'),('live.com'),
  ('msn.com'),('yahoo.it'),('yahoo.com'),('icloud.com'),('me.com'),
  ('inwind.it'),('iol.it'),('email.it'),('teletu.it'),('vodafone.it'),
  ('tim.it'),('poste.it'),('aruba.it'),('pec.it')
ON CONFLICT (domain) DO NOTHING;

-- ── azienda-prospect (L2 + L3) ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS outreach_prospect_companies (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id             uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  p_iva                 text,
  ragione_sociale       text NOT NULL,
  rag_soc_norm          text NOT NULL,
  email_domain          text,
  company_key           text NOT NULL,
  ateco                 text,
  dipendenti            int,
  dipendenti_range      text,
  fatturato             numeric,
  provincia             text,
  regione               text,
  citta                 text,
  ha_sito               boolean,
  segmento              text,
  brand_eleggibili      uuid[] NOT NULL DEFAULT '{}',
  brand_lock            uuid REFERENCES outreach_brands(id) ON DELETE SET NULL,
  lock_acquired_at      timestamptz,
  lock_expires_at       timestamptz,
  global_cooldown_until timestamptz,
  brand_history         jsonb NOT NULL DEFAULT '[]'::jsonb,
  segnali_usati         jsonb NOT NULL DEFAULT '[]'::jsonb,
  fonte_dato            text NOT NULL DEFAULT 'crm_platform_admin',
  data_acquisizione     timestamptz NOT NULL DEFAULT now(),
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_opc_key  ON outreach_prospect_companies(tenant_id, company_key);
CREATE INDEX IF NOT EXISTS idx_opc_lock ON outreach_prospect_companies(brand_lock, lock_expires_at);
CREATE INDEX IF NOT EXISTS idx_opc_cool ON outreach_prospect_companies(global_cooldown_until);
CREATE INDEX IF NOT EXISTS idx_opc_segm ON outreach_prospect_companies(segmento, provincia);
CREATE INDEX IF NOT EXISTS idx_opc_piva ON outreach_prospect_companies(p_iva) WHERE p_iva IS NOT NULL;

-- ── contatto-prospect (L1) ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS outreach_prospect_contacts (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contact_id          uuid NOT NULL UNIQUE REFERENCES marketing_contacts(id) ON DELETE CASCADE,
  prospect_company_id uuid NOT NULL REFERENCES outreach_prospect_companies(id) ON DELETE CASCADE,
  email_norm          text NOT NULL,
  email_domain        text,
  is_role_based       boolean NOT NULL DEFAULT false,
  is_pec              boolean NOT NULL DEFAULT false,
  is_generic_domain   boolean NOT NULL DEFAULT false,
  verifica_stato      text,
  verifica_data       timestamptz,
  stato               text NOT NULL DEFAULT 'new',
  brand_corrente      uuid REFERENCES outreach_brands(id) ON DELETE SET NULL,
  touch_inviati       int NOT NULL DEFAULT 0,
  primo_invio         timestamptz,
  ultimo_invio        timestamptz,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_opct_company ON outreach_prospect_contacts(prospect_company_id);
CREATE INDEX IF NOT EXISTS idx_opct_stato   ON outreach_prospect_contacts(stato, brand_corrente);
CREATE INDEX IF NOT EXISTS idx_opct_email   ON outreach_prospect_contacts(email_norm);

-- ── suppression per azienda/dominio (L4) ────────────────────────────────────
CREATE TABLE IF NOT EXISTS outreach_suppression (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  scope         text NOT NULL CHECK (scope IN ('company','domain')),
  value         text NOT NULL,
  motivo        text NOT NULL,
  brand_origine uuid REFERENCES outreach_brands(id) ON DELETE SET NULL,
  note          text,
  created_at    timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_outreach_suppr ON outreach_suppression(scope, value);

-- Guardia: un opt-out @libero.it non deve poter sopprimere tutto Libero.
CREATE OR REPLACE FUNCTION outreach_suppression_guard() RETURNS trigger
LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.scope = 'domain'
     AND EXISTS (SELECT 1 FROM outreach_generic_domains WHERE domain = lower(NEW.value)) THEN
    RAISE EXCEPTION 'Rifiutata suppression su dominio generico "%": bloccherebbe tutti i contatti su quel provider', NEW.value;
  END IF;
  NEW.value := lower(btrim(NEW.value));
  RETURN NEW;
END; $$;
DROP TRIGGER IF EXISTS trg_outreach_suppression_guard ON outreach_suppression;
CREATE TRIGGER trg_outreach_suppression_guard
  BEFORE INSERT OR UPDATE ON outreach_suppression
  FOR EACH ROW EXECUTE FUNCTION outreach_suppression_guard();

-- ── MX map + throttling orario ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS outreach_mx_map (
  email_domain text PRIMARY KEY,
  mx_host      text,
  mx_group     text NOT NULL DEFAULT 'altro',
  risolto_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_mx_group ON outreach_mx_map(mx_group);
CREATE INDEX IF NOT EXISTS idx_mx_stale ON outreach_mx_map(risolto_at);

-- `finestra` è troncata all'ora. Nel master prompt di riferimento era `now()`
-- grezzo dentro la PK: ogni insert creava una riga nuova e il contatore non
-- accumulava mai, quindi il throttle non sarebbe scattato mai.
CREATE TABLE IF NOT EXISTS outreach_mx_throttle (
  mx_group   text NOT NULL,
  sender_key text NOT NULL,
  finestra   timestamptz NOT NULL,
  conteggio  int NOT NULL DEFAULT 0,
  PRIMARY KEY (mx_group, sender_key, finestra)
);

CREATE OR REPLACE FUNCTION outreach_mx_try_consume(p_mx_group text, p_sender_key text, p_max_ora int DEFAULT 4)
RETURNS boolean LANGUAGE plpgsql SET search_path = public AS $$
DECLARE v_n int;
BEGIN
  INSERT INTO outreach_mx_throttle(mx_group, sender_key, finestra, conteggio)
  VALUES (p_mx_group, p_sender_key, date_trunc('hour', now()), 1)
  ON CONFLICT (mx_group, sender_key, finestra) DO UPDATE SET conteggio = outreach_mx_throttle.conteggio + 1
  RETURNING conteggio INTO v_n;
  IF v_n > p_max_ora THEN
    UPDATE outreach_mx_throttle SET conteggio = conteggio - 1
     WHERE mx_group=p_mx_group AND sender_key=p_sender_key AND finestra=date_trunc('hour', now());
    RETURN false;
  END IF;
  RETURN true;
END; $$;

CREATE OR REPLACE FUNCTION outreach_mx_group_of(p_host text) RETURNS text
LANGUAGE sql IMMUTABLE SET search_path = public AS $$
  SELECT CASE
    WHEN p_host IS NULL THEN 'altro'
    WHEN p_host ~* '(aruba|arubapec)\.' THEN 'aruba'
    WHEN p_host ~* 'register\.it' THEN 'register'
    WHEN p_host ~* '(google|googlemail)\.com' THEN 'google'
    WHEN p_host ~* '(outlook|protection\.outlook|hotmail)\.com' THEN 'microsoft'
    WHEN p_host ~* '(iol|libero|virgilio)\.it' THEN 'iol'
    WHEN p_host ~* '(telecomitalia|tim)\.it' THEN 'tim'
    ELSE 'altro' END;
$$;

-- ── audit generazioni AI ────────────────────────────────────────────────────
-- scade_at è colonna normale con DEFAULT, NON generated: in Postgres
-- `timestamptz + interval` è STABLE (non IMMUTABLE) e una generated column
-- STORED con quell'espressione non si crea proprio.
CREATE TABLE IF NOT EXISTS outreach_ai_generations (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contact_id          uuid REFERENCES marketing_contacts(id) ON DELETE SET NULL,
  prospect_company_id uuid REFERENCES outreach_prospect_companies(id) ON DELETE CASCADE,
  brand_id            uuid REFERENCES outreach_brands(id) ON DELETE SET NULL,
  touch_num           int,
  segnale_usato       jsonb NOT NULL DEFAULT '{}'::jsonb,
  segnale_hash        text,
  apertura            text,
  adattamento         text,
  qg_score            numeric(3,1),
  qg_dettaglio        jsonb,
  fallback            boolean NOT NULL DEFAULT false,
  modello             text,
  generato_at         timestamptz NOT NULL DEFAULT now(),
  scade_at            timestamptz NOT NULL DEFAULT (now() + interval '180 days')
);
CREATE INDEX IF NOT EXISTS idx_aigen_company ON outreach_ai_generations(prospect_company_id);
CREATE INDEX IF NOT EXISTS idx_aigen_hash    ON outreach_ai_generations(segnale_hash);

-- ── RLS: stesso schema delle altre outreach_* (service_role + super_admin) ──
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['outreach_generic_domains','outreach_prospect_companies',
                           'outreach_prospect_contacts','outreach_suppression',
                           'outreach_mx_map','outreach_mx_throttle','outreach_ai_generations'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I', t||'_service', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I', t||'_super', t);
    EXECUTE format('CREATE POLICY %I ON %I FOR ALL TO service_role USING (true) WITH CHECK (true)', t||'_service', t);
    EXECUTE format('CREATE POLICY %I ON %I FOR ALL TO authenticated USING (is_super_admin()) WITH CHECK (is_super_admin())', t||'_super', t);
  END LOOP;
END $$;

-- ── chiave azienda ──────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION outreach_norm_rag_soc(p_nome text) RETURNS text
LANGUAGE sql IMMUTABLE SET search_path = public AS $$
  SELECT nullif(regexp_replace(
    regexp_replace(lower(coalesce(p_nome,'')),
      '\y(s\.?r\.?l\.?s?|s\.?p\.?a\.?|s\.?n\.?c\.?|s\.?a\.?s\.?|s\.?c\.?|soc(ieta)?|coop(erativa)?|scarl|s\.?s\.?|impresa|edile|costruzioni|di|e|&)\y','', 'g'),
    '[^a-z0-9]','', 'g'), '');
$$;

CREATE OR REPLACE FUNCTION outreach_calc_company_key(p_p_iva text, p_email_domain text, p_rag_soc text, p_provincia text)
RETURNS text LANGUAGE plpgsql IMMUTABLE SET search_path = public AS $$
DECLARE v_norm text;
BEGIN
  IF p_p_iva IS NOT NULL AND length(regexp_replace(p_p_iva,'[^0-9]','','g')) >= 11 THEN
    RETURN 'piva:' || regexp_replace(p_p_iva,'[^0-9]','','g');
  END IF;
  IF p_email_domain IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM outreach_generic_domains WHERE domain = lower(p_email_domain)) THEN
    RETURN 'dom:' || lower(p_email_domain);
  END IF;
  v_norm := outreach_norm_rag_soc(p_rag_soc);
  IF v_norm IS NULL THEN
    RETURN 'anon:' || md5(coalesce(p_email_domain,'') || coalesce(p_rag_soc,'') || coalesce(p_provincia,''));
  END IF;
  RETURN 'rs:' || v_norm || ':' || coalesce(lower(p_provincia),'xx');
END; $$;

-- ── acquisizione lock (L1+L2+L3+L4) ─────────────────────────────────────────
CREATE OR REPLACE FUNCTION outreach_acquire_brand_lock(p_prospect_company_id uuid, p_brand_id uuid, p_durata_gg int DEFAULT 25)
RETURNS TABLE(ok boolean, motivo text) LANGUAGE plpgsql SET search_path = public AS $$
DECLARE v_c outreach_prospect_companies%ROWTYPE;
BEGIN
  SELECT * INTO v_c FROM outreach_prospect_companies WHERE id = p_prospect_company_id FOR UPDATE;
  IF NOT FOUND THEN RETURN QUERY SELECT false, 'azienda_inesistente'; RETURN; END IF;

  IF EXISTS (SELECT 1 FROM outreach_suppression s
              WHERE (s.scope='company' AND s.value = v_c.company_key)
                 OR (s.scope='domain'  AND v_c.email_domain IS NOT NULL AND s.value = lower(v_c.email_domain))) THEN
    RETURN QUERY SELECT false, 'suppression_globale'; RETURN;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM outreach_prospect_contacts pc
                  WHERE pc.prospect_company_id = v_c.id
                    AND NOT EXISTS (SELECT 1 FROM email_suppressions es WHERE lower(es.email) = pc.email_norm)
                    AND pc.stato NOT IN ('unsubscribed','bounced','negative')) THEN
    RETURN QUERY SELECT false, 'nessun_contatto_contattabile'; RETURN;
  END IF;

  IF v_c.global_cooldown_until IS NOT NULL AND v_c.global_cooldown_until > now() THEN
    RETURN QUERY SELECT false, 'cooldown_attivo_fino_' || to_char(v_c.global_cooldown_until,'YYYY-MM-DD'); RETURN;
  END IF;

  IF v_c.brand_lock IS NOT NULL AND v_c.brand_lock <> p_brand_id
     AND v_c.lock_expires_at IS NOT NULL AND v_c.lock_expires_at > now() THEN
    RETURN QUERY SELECT false, 'lock_altro_brand:' || v_c.brand_lock::text; RETURN;
  END IF;

  IF EXISTS (SELECT 1 FROM outreach_prospect_contacts pc
              WHERE pc.prospect_company_id = v_c.id AND pc.stato = 'in_sequence'
                AND pc.brand_corrente IS NOT NULL AND pc.brand_corrente <> p_brand_id) THEN
    RETURN QUERY SELECT false, 'contatto_gia_in_sequenza_altro_brand'; RETURN;
  END IF;

  IF array_length(v_c.brand_eleggibili,1) IS NOT NULL AND NOT (p_brand_id = ANY(v_c.brand_eleggibili)) THEN
    RETURN QUERY SELECT false, 'brand_non_eleggibile'; RETURN;
  END IF;

  IF v_c.brand_history @> jsonb_build_array(jsonb_build_object('brand_id', p_brand_id::text)) THEN
    RETURN QUERY SELECT false, 'brand_gia_utilizzato'; RETURN;
  END IF;

  UPDATE outreach_prospect_companies
     SET brand_lock=p_brand_id, lock_acquired_at=now(),
         lock_expires_at=now() + make_interval(days => p_durata_gg), updated_at=now()
   WHERE id = p_prospect_company_id;
  RETURN QUERY SELECT true, 'ok';
END; $$;

-- ── rilascio lock ───────────────────────────────────────────────────────────
-- "risposta_negativa" NON è un opt-out: nel documento di riferimento produceva
-- 10 anni di blocco + suppression su tutti i brand. Un "non mi interessa" di un
-- impiegato bruciava l'azienda per sempre. Qui: opt-out permanente (GDPR),
-- disinteresse 24 mesi e nessuna scrittura in suppression.
CREATE OR REPLACE FUNCTION outreach_release_brand_lock(p_prospect_company_id uuid, p_brand_id uuid, p_esito text, p_cooldown_gg int DEFAULT 90)
RETURNS void LANGUAGE plpgsql SET search_path = public AS $$
DECLARE v_key text;
BEGIN
  UPDATE outreach_prospect_companies SET
    brand_lock=NULL, lock_acquired_at=NULL, lock_expires_at=NULL,
    global_cooldown_until = CASE
        WHEN p_esito='opt_out'           THEN now() + interval '10 years'
        WHEN p_esito='risposta_negativa' THEN now() + interval '24 months'
        WHEN p_esito='risposta_positiva' THEN now() + interval '12 months'
        WHEN p_esito='bounce'            THEN now() + interval '12 months'
        ELSE now() + make_interval(days => p_cooldown_gg) END,
    brand_history = brand_history || jsonb_build_array(jsonb_build_object(
      'brand_id', p_brand_id::text, 'esito', p_esito, 'chiusa_il', now())),
    updated_at = now()
  WHERE id = p_prospect_company_id
  RETURNING company_key INTO v_key;

  IF p_esito = 'opt_out' AND v_key IS NOT NULL THEN
    INSERT INTO outreach_suppression(scope, value, motivo, brand_origine)
    VALUES ('company', v_key, 'opt_out', p_brand_id) ON CONFLICT (scope, value) DO NOTHING;
  END IF;

  UPDATE outreach_prospect_contacts
     SET stato = CASE p_esito WHEN 'opt_out' THEN 'unsubscribed'
                              WHEN 'risposta_negativa' THEN 'negative'
                              WHEN 'risposta_positiva' THEN 'positive'
                              WHEN 'bounce' THEN 'bounced' ELSE 'cooldown' END,
         brand_corrente = NULL, updated_at = now()
   WHERE prospect_company_id = p_prospect_company_id AND stato IN ('locked','in_sequence');
END; $$;

-- ── vista unica degli inviabili: nessun job interroga altro ─────────────────
CREATE OR REPLACE VIEW v_outreach_inviabili WITH (security_invoker = true) AS
SELECT pc.contact_id, pc.email_norm, pc.email_domain, pc.is_generic_domain,
       mc.first_name, mc.last_name, mc.phone,
       c.id AS prospect_company_id, c.company_key, c.ragione_sociale,
       c.segmento, c.provincia, c.dipendenti, c.ateco,
       c.brand_lock AS brand_id, coalesce(m.mx_group,'sconosciuto') AS mx_group
FROM outreach_prospect_contacts pc
JOIN outreach_prospect_companies c ON c.id = pc.prospect_company_id
JOIN marketing_contacts mc ON mc.id = pc.contact_id
LEFT JOIN outreach_mx_map m ON m.email_domain = pc.email_domain
WHERE pc.stato IN ('new','locked','in_sequence')
  AND pc.is_role_based = false AND pc.is_pec = false
  AND coalesce(pc.verifica_stato,'valid') IN ('valid','catch_all')
  AND c.brand_lock IS NOT NULL AND c.lock_expires_at > now()
  AND (c.global_cooldown_until IS NULL OR c.global_cooldown_until <= now())
  AND mc.deleted_at IS NULL
  AND NOT coalesce(mc.unsubscribed,false) AND NOT coalesce(mc.opt_out,false)
  AND NOT coalesce(mc.optout_email,false)
  AND NOT EXISTS (SELECT 1 FROM email_suppressions es WHERE lower(es.email) = pc.email_norm)
  AND NOT EXISTS (SELECT 1 FROM outreach_suppression s
                   WHERE (s.scope='company' AND s.value = c.company_key)
                      OR (s.scope='domain'  AND pc.email_domain IS NOT NULL AND s.value = pc.email_domain));

-- ── manutenzione notturna (cron 03:40) ──────────────────────────────────────
CREATE OR REPLACE FUNCTION outreach_lock_maintenance()
RETURNS TABLE(azione text, righe int) LANGUAGE plpgsql SET search_path = public AS $$
DECLARE n int;
BEGIN
  WITH scaduti AS (
    SELECT id, brand_lock FROM outreach_prospect_companies
     WHERE brand_lock IS NOT NULL AND lock_expires_at < now()
  ), upd AS (
    UPDATE outreach_prospect_companies c SET
      brand_lock=NULL, lock_acquired_at=NULL, lock_expires_at=NULL,
      global_cooldown_until = now() + interval '90 days',
      brand_history = c.brand_history || jsonb_build_array(jsonb_build_object(
        'brand_id', s.brand_lock::text, 'esito','scaduta','chiusa_il', now())),
      updated_at = now()
    FROM scaduti s WHERE c.id = s.id RETURNING 1
  ) SELECT count(*)::int INTO n FROM upd;
  azione := 'lock_scaduti_rilasciati'; righe := n; RETURN NEXT;

  UPDATE outreach_prospect_contacts SET stato='cooldown', brand_corrente=NULL, updated_at=now()
   WHERE stato='in_sequence' AND ultimo_invio < now() - interval '30 days';
  GET DIAGNOSTICS n = ROW_COUNT;
  azione := 'contatti_arenati_chiusi'; righe := n; RETURN NEXT;

  UPDATE outreach_prospect_companies c
     SET company_key = outreach_calc_company_key(c.p_iva, c.email_domain, c.ragione_sociale, c.provincia),
         updated_at = now()
   WHERE c.p_iva IS NOT NULL AND c.company_key NOT LIKE 'piva:%'
     AND NOT EXISTS (SELECT 1 FROM outreach_prospect_companies d
                      WHERE d.tenant_id=c.tenant_id AND d.id<>c.id
                        AND d.company_key = outreach_calc_company_key(c.p_iva, c.email_domain, c.ragione_sociale, c.provincia));
  GET DIAGNOSTICS n = ROW_COUNT;
  azione := 'company_key_ricalcolate'; righe := n; RETURN NEXT;

  DELETE FROM outreach_mx_throttle WHERE finestra < now() - interval '2 days';
  GET DIAGNOSTICS n = ROW_COUNT;
  azione := 'finestre_throttle_pulite'; righe := n; RETURN NEXT;

  SELECT count(*)::int INTO n FROM outreach_mx_map WHERE risolto_at < now() - interval '90 days';
  azione := 'mx_da_ririsolvere'; righe := n; RETURN NEXT;

  SELECT count(*)::int INTO n FROM outreach_prospect_companies
   WHERE brand_lock IS NOT NULL OR (global_cooldown_until IS NOT NULL AND global_cooldown_until > now());
  azione := 'aziende_non_disponibili_totali'; righe := n; RETURN NEXT;
END; $$;

-- cron già schedulato in produzione:
--   SELECT cron.schedule('outreach-lock-maintenance','40 3 * * *',
--                        $c$SELECT public.outreach_lock_maintenance();$c$);
