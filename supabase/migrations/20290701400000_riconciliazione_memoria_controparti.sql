-- Riconciliazione, lotto D (28/11/2026): il sistema impara dalle scelte fatte a mano.
--
-- Misurato in produzione il 28/11/2026: negli ultimi 120 giorni 482 riconciliazioni manuali e 19
-- confermate da regole. Le stesse controparti tornano ogni mese, ma nessuno se ne ricordava.
--
-- Perché una tabella nuova e non `tesoreria_iban_verificati` / `tesoreria_paganti_autorizzati` /
-- `fornitori_iban_storico` (verificato il 28/11/2026, tutte e tre lette da private.tes_classifica):
-- * sono GARANZIE dichiarate da una persona, con revoca: il motore le tratta come prove certe.
--   Riempirle in automatico da ogni abbinamento farebbe passare per «verificato» ciò che è solo
--   «visto fare una volta», e il motore degli esiti cambierebbe comportamento senza saperlo;
-- * non hanno contatori: un abbinamento annullato non può indebolirle, solo revocarle;
-- * chiedono un IBAN (NOT NULL) o la chiave fiscale del cliente. Nei movimenti abbinati a mano
--   nessuna delle due aziende reali riceve dalla banca IBAN o nome della controparte (0 su 1.357
--   righe): l'unica traccia è la causale («BONIFICO o/c: … a favore di …»).
-- Qui invece ogni riga è «questa chiave del movimento → questo soggetto», con conferme e smentite.
--
-- Chiavi del movimento (private.tes_chiavi_movimento):
--   iban    — IBAN della controparte, se la banca lo dà;
--   nome    — nome della controparte dato dalla banca (non banche o circuiti di pagamento);
--   causale — la «firma» della causale: le prime 12 parole senza cifre. Stessa firma ogni mese
--             per lo stesso pagante; le causali generiche («Accrediti effetti … distinta») finiscono
--             su più soggetti e per questo non valgono (vedi tes_memoria_soggetto).
-- Soggetto (private.tes_soggetto_di): 'forn:<id fornitore>', 'cf:<partita IVA o CF>' o
-- 'nome:<nome normalizzato>' per i clienti senza dati fiscali.
--
-- Quando conta (private.tes_memoria_soggetto): una chiave vale se porta a UN solo soggetto con
-- più conferme che smentite; il soggetto è forte se conferme − 2×smentite ≥ 1 (≥ 2 per la firma della
-- causale: un abbinamento solo non basta) e l'ultima parola è una conferma. Se due chiavi dello stesso movimento portano a soggetti diversi, niente memoria.
--
-- Chi scrive: solo i trigger, mai il browser.
--   * riconciliazione nuova fatta da una persona (matched_by valorizzato, non 'storico'): conferma;
--     più quote dello stesso movimento sullo stesso soggetto contano una volta; ed è una smentita per
--     gli ALTRI soggetti che le stesse chiavi ricordavano (la persona ha scelto diversamente), salvo
--     quelli confermati sullo stesso movimento (un bonifico diviso fra due soggetti);
--   * riconciliazione annullata (unmatched_at da NULL a valorizzato): smentita;
--   * proposta del motore scartata (bank_transactions.proposta_rifiutata_at): smentita per i
--     soggetti dei documenti suggeriti.
--   Un errore della memoria non deve mai fermare una riconciliazione: i trigger lo ingoiano con un
--   WARNING, timeout compresi (query_canceled).
SET LOCAL lock_timeout = '3s';
SET LOCAL statement_timeout = '60s';

CREATE TABLE IF NOT EXISTS public.tesoreria_controparti_apprese (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  direzione text NOT NULL CHECK (direzione IN ('credit','debit')),
  tipo_chiave text NOT NULL CHECK (tipo_chiave IN ('iban','nome','causale')),
  chiave text NOT NULL CHECK (length(chiave) >= 4),
  soggetto text NOT NULL CHECK (soggetto ~ '^(forn|cf|nome):.+'),
  soggetto_nome text,
  conferme integer NOT NULL DEFAULT 0 CHECK (conferme >= 0),
  smentite integer NOT NULL DEFAULT 0 CHECK (smentite >= 0),
  ultima_conferma_at timestamptz,
  ultima_smentita_at timestamptz,
  ultimo_movimento_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS tesoreria_controparti_apprese_unica
  ON public.tesoreria_controparti_apprese (company_id, direzione, tipo_chiave, chiave, soggetto);
ALTER TABLE public.tesoreria_controparti_apprese ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.tesoreria_controparti_apprese FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.tesoreria_controparti_apprese TO service_role;
COMMENT ON TABLE public.tesoreria_controparti_apprese IS
  'Memoria delle riconciliazioni fatte a mano: chiave del movimento (IBAN, nome, firma della causale) → soggetto, con conferme e smentite. Scritta solo dai trigger. Lotto D, 28/11/2026.';

-- Firma della causale: parole senza cifre, almeno due lettere, le prime 12. NULL se troppo povera.
CREATE OR REPLACE FUNCTION private.tes_firma_causale(p text)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO ''
AS $function$
  WITH w AS (
    SELECT x, o FROM regexp_split_to_table(private.tes_norm(p), ' ') WITH ORDINALITY s(x, o)
    WHERE length(x) >= 2 AND x !~ '[0-9]'
  ), f AS (SELECT x FROM w ORDER BY o LIMIT 12)
  SELECT CASE WHEN count(*) >= 3 AND sum(length(x)) >= 12 THEN string_agg(x, ' ') END FROM (SELECT x FROM f) z
$function$;
REVOKE ALL ON FUNCTION private.tes_firma_causale(text) FROM PUBLIC, anon, authenticated;

-- Le chiavi con cui un movimento si riconosce.
CREATE OR REPLACE FUNCTION private.tes_chiavi_movimento(t public.bank_transactions)
 RETURNS TABLE(tipo_chiave text, chiave text)
 LANGUAGE sql
 STABLE
 SET search_path TO ''
AS $function$
  WITH v AS (
    SELECT coalesce(private.tes_iban(CASE WHEN t.transaction_type = 'credit' THEN t.debtor_iban ELSE t.creditor_iban END),
                    private.tes_iban(t.counterparty_iban)) iban,
           coalesce(nullif(btrim(CASE WHEN t.transaction_type = 'credit' THEN t.debtor_name ELSE t.creditor_name END), ''),
                    nullif(btrim(t.counterparty_name), '')) nome
  )
  SELECT 'iban', v.iban FROM v WHERE v.iban IS NOT NULL
  UNION ALL
  -- Una banca o un circuito al posto del pagante non identifica nessuno (stessa lista di tes_classifica).
  SELECT 'nome', private.tes_chiave_nome(v.nome) FROM v
   WHERE length(coalesce(private.tes_chiave_nome(v.nome), '')) >= 4
     AND private.tes_norm(v.nome) !~ '^(banca|banco) |\m(bank|bancaria|poste italiane|bancoposta|qonto|unicredit|intesa sanpaolo|bnl|bper|credem|fineco|mediolanum|paypal|stripe|satispay|nexi|sumup|revolut|n26)\M'
  UNION ALL
  SELECT 'causale', private.tes_firma_causale(t.description) WHERE private.tes_firma_causale(t.description) IS NOT NULL
$function$;
REVOKE ALL ON FUNCTION private.tes_chiavi_movimento(public.bank_transactions) FROM PUBLIC, anon, authenticated;

-- Chiave di un cliente da un documento (fattura nativa o importata).
CREATE OR REPLACE FUNCTION private.tes_soggetto_cliente(p_company uuid, p_documento uuid)
 RETURNS TABLE(soggetto text, nome text)
 LANGUAGE sql
 STABLE
 SET search_path TO ''
AS $function$
  SELECT CASE WHEN length(x.cf) >= 8 THEN 'cf:' || x.cf
              WHEN length(coalesce(private.tes_chiave_nome(x.nome), '')) >= 4 THEN 'nome:' || private.tes_chiave_nome(x.nome) END,
         x.nome
  FROM (
    SELECT public.partner_tax_key(coalesce(nullif(d.cliente_snapshot->>'partita_iva', ''), nullif(d.cliente_snapshot->>'codice_fiscale', ''))) cf,
           coalesce(nullif(d.cliente_snapshot->>'ragione_sociale', ''), nullif(d.cliente_snapshot->>'company_name', ''),
                    nullif(btrim(concat_ws(' ', d.cliente_snapshot->>'nome', d.cliente_snapshot->>'cognome')), '')) nome
    FROM public.documenti_fiscali_elenco_operativo d
    WHERE d.id = p_documento AND d.company_id = p_company
    LIMIT 1
  ) x
$function$;
REVOKE ALL ON FUNCTION private.tes_soggetto_cliente(uuid, uuid) FROM PUBLIC, anon, authenticated;

-- Il soggetto di un candidato della riconciliazione (stessi tipi di bank_candidati_movimento).
CREATE OR REPLACE FUNCTION private.tes_soggetto_di(p_company uuid, p_tipo text, p_id uuid)
 RETURNS TABLE(soggetto text, nome text)
 LANGUAGE plpgsql
 STABLE
 SET search_path TO ''
 SET plan_cache_mode TO 'force_custom_plan'
AS $function$
DECLARE v_forn uuid; v_nome text; v_cf text; v_doc uuid;
BEGIN
  IF p_id IS NULL THEN RETURN; END IF;
  IF p_tipo IN ('documento', 'invoice') THEN
    RETURN QUERY SELECT * FROM private.tes_soggetto_cliente(p_company, p_id);
    RETURN;
  ELSIF p_tipo = 'scadenza' THEN
    SELECT coalesce(s.supplier_id, cc.supplier_id), s.invoice_id INTO v_forn, v_doc
      FROM public.scadenze s LEFT JOIN public.company_costs cc ON cc.id = s.cost_id AND cc.company_id = s.company_id
     WHERE s.id = p_id AND s.company_id = p_company;
    IF v_forn IS NULL AND v_doc IS NOT NULL THEN
      RETURN QUERY SELECT * FROM private.tes_soggetto_cliente(p_company, v_doc);
      RETURN;
    END IF;
  ELSIF p_tipo = 'rata_fornitore' THEN
    SELECT coalesce(c.supplier_id, f.fornitore_id), f.cedente_ragione_sociale,
           public.partner_tax_key(coalesce(nullif(f.cedente_piva, ''), nullif(f.cedente_cf, '')))
      INTO v_forn, v_nome, v_cf
      FROM public.rate_fornitori r
      LEFT JOIN public.company_costs c ON c.id = r.company_cost_id AND c.company_id = r.company_id
      LEFT JOIN public.fatture_ricevute f ON f.id = r.fattura_ricevuta_id AND f.company_id = r.company_id
     WHERE r.id = p_id AND r.company_id = p_company;
  ELSIF p_tipo = 'ricevuta' THEN
    SELECT coalesce(f.fornitore_id, c.supplier_id), f.cedente_ragione_sociale,
           public.partner_tax_key(coalesce(nullif(f.cedente_piva, ''), nullif(f.cedente_cf, '')))
      INTO v_forn, v_nome, v_cf
      FROM public.fatture_ricevute f
      LEFT JOIN public.company_costs c ON c.id = f.company_cost_id AND c.company_id = f.company_id
     WHERE f.id = p_id AND f.company_id = p_company;
  ELSE
    RETURN;
  END IF;
  IF v_forn IS NOT NULL THEN
    SELECT coalesce(nullif(btrim(s.name), ''), v_nome) INTO v_nome FROM public.suppliers s WHERE s.id = v_forn AND s.company_id = p_company;
    soggetto := 'forn:' || v_forn; nome := v_nome; RETURN NEXT;
  ELSIF length(coalesce(v_cf, '')) >= 8 THEN
    soggetto := 'cf:' || v_cf; nome := v_nome; RETURN NEXT;
  END IF;
END $function$;
REVOKE ALL ON FUNCTION private.tes_soggetto_di(uuid, text, uuid) FROM PUBLIC, anon, authenticated;

-- Il soggetto di una riga di bank_reconciliations (NULL se è un pagamento già registrato o altro).
CREATE OR REPLACE FUNCTION private.tes_soggetto_riconciliazione(r public.bank_reconciliations)
 RETURNS TABLE(soggetto text, nome text)
 LANGUAGE sql
 STABLE
 SET search_path TO ''
AS $function$
  SELECT s.* FROM (
    SELECT CASE WHEN coalesce(r.documento_id, r.invoice_id, m.documento_id) IS NOT NULL THEN 'documento'
                WHEN r.rata_fornitore_id IS NOT NULL THEN 'rata_fornitore'
                WHEN r.fattura_ricevuta_id IS NOT NULL THEN 'ricevuta'
                WHEN r.scadenza_id IS NOT NULL THEN 'scadenza' END tipo,
           coalesce(r.documento_id, r.invoice_id, m.documento_id, r.rata_fornitore_id, r.fattura_ricevuta_id, r.scadenza_id) id
    FROM (SELECT 1) one
    LEFT JOIN public.movimenti_cassa_native m ON m.id = r.movimento_id AND m.company_id = r.company_id
  ) x, LATERAL private.tes_soggetto_di(r.company_id, x.tipo, x.id) s
  WHERE x.tipo IS NOT NULL AND s.soggetto IS NOT NULL
$function$;
REVOKE ALL ON FUNCTION private.tes_soggetto_riconciliazione(public.bank_reconciliations) FROM PUBLIC, anon, authenticated;

-- Una conferma o una smentita per tutte le chiavi del movimento verso un soggetto.
-- La smentita tocca solo le coppie già imparate: non serve ricordare ciò che non si è mai saputo.
-- p_quando: l'istante dell'evento (lo storico lo passa); di norma clock_timestamp(), non now(), che è
-- fisso nella transazione: un annullo e un nuovo abbinamento nella stessa transazione devono restare in ordine.
CREATE OR REPLACE FUNCTION private.tes_memoria_registra(p_tx uuid, p_soggetto text, p_nome text, p_conferma boolean, p_quando timestamptz DEFAULT NULL)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
 SET plan_cache_mode TO 'force_custom_plan'
AS $function$
DECLARE t public.bank_transactions; v_quando timestamptz := coalesce(p_quando, clock_timestamp());
BEGIN
  IF p_soggetto IS NULL THEN RETURN; END IF;
  SELECT * INTO t FROM public.bank_transactions WHERE id = p_tx;
  IF NOT FOUND OR t.transaction_type NOT IN ('credit', 'debit') THEN RETURN; END IF;
  IF p_conferma THEN
    INSERT INTO public.tesoreria_controparti_apprese AS a
      (company_id, direzione, tipo_chiave, chiave, soggetto, soggetto_nome, conferme, ultima_conferma_at, ultimo_movimento_id)
    SELECT t.company_id, t.transaction_type, k.tipo_chiave, k.chiave, p_soggetto, p_nome, 1, v_quando, t.id
      FROM private.tes_chiavi_movimento(t) k
    ON CONFLICT (company_id, direzione, tipo_chiave, chiave, soggetto) DO UPDATE
      SET conferme = a.conferme + CASE WHEN a.ultimo_movimento_id = excluded.ultimo_movimento_id
                                        AND a.ultima_conferma_at IS NOT NULL
                                        AND (a.ultima_smentita_at IS NULL OR a.ultima_conferma_at > a.ultima_smentita_at)
                                       THEN 0 ELSE 1 END,
          ultima_conferma_at = greatest(a.ultima_conferma_at, v_quando),
          ultimo_movimento_id = excluded.ultimo_movimento_id,
          soggetto_nome = coalesce(excluded.soggetto_nome, a.soggetto_nome),
          updated_at = clock_timestamp();
    -- Stesse chiavi, soggetto diverso: la persona ha smentito ciò che la memoria avrebbe proposto.
    UPDATE public.tesoreria_controparti_apprese a
       SET smentite = a.smentite + 1, ultima_smentita_at = greatest(a.ultima_smentita_at, v_quando), updated_at = clock_timestamp()
      FROM private.tes_chiavi_movimento(t) k
     WHERE a.company_id = t.company_id AND a.direzione = t.transaction_type
       AND a.tipo_chiave = k.tipo_chiave AND a.chiave = k.chiave AND a.soggetto <> p_soggetto
       AND a.ultimo_movimento_id IS DISTINCT FROM t.id;
  ELSE
    UPDATE public.tesoreria_controparti_apprese a
       SET smentite = a.smentite + 1, ultima_smentita_at = greatest(a.ultima_smentita_at, v_quando), updated_at = clock_timestamp()
      FROM private.tes_chiavi_movimento(t) k
     WHERE a.company_id = t.company_id AND a.direzione = t.transaction_type
       AND a.tipo_chiave = k.tipo_chiave AND a.chiave = k.chiave AND a.soggetto = p_soggetto;
  END IF;
END $function$;
REVOKE ALL ON FUNCTION private.tes_memoria_registra(uuid, text, text, boolean, timestamptz) FROM PUBLIC, anon, authenticated;

-- Il soggetto che la memoria riconosce per questo movimento, se uno solo e non smentito.
CREATE OR REPLACE FUNCTION private.tes_memoria_soggetto(p_company uuid, t public.bank_transactions)
 RETURNS jsonb
 LANGUAGE sql
 STABLE
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
  WITH k AS (SELECT * FROM private.tes_chiavi_movimento(t)),
  m AS (
    SELECT a.* FROM public.tesoreria_controparti_apprese a
    JOIN k ON k.tipo_chiave = a.tipo_chiave AND k.chiave = a.chiave
    WHERE a.company_id = p_company AND a.direzione = t.transaction_type AND a.conferme > a.smentite
  ),
  -- Una chiave che porta a più soggetti non identifica nessuno.
  univoche AS (SELECT tipo_chiave, chiave FROM m GROUP BY 1, 2 HAVING count(*) = 1),
  forti AS (
    SELECT m.* FROM m JOIN univoche u USING (tipo_chiave, chiave)
    -- La firma della causale è la chiave più debole: servono due conferme (due movimenti diversi).
    -- IBAN e nome dati dalla banca identificano già con una.
    WHERE m.conferme - 2 * m.smentite >= CASE WHEN m.tipo_chiave = 'causale' THEN 2 ELSE 1 END
      AND (m.ultima_smentita_at IS NULL OR m.ultima_conferma_at > m.ultima_smentita_at)
  )
  SELECT CASE WHEN count(DISTINCT soggetto) = 1 THEN jsonb_build_object(
           'soggetto', min(soggetto), 'nome', min(soggetto_nome),
           'conferme', max(conferme), 'chiavi', jsonb_agg(DISTINCT tipo_chiave)) END
  FROM forti
$function$;
REVOKE ALL ON FUNCTION private.tes_memoria_soggetto(uuid, public.bank_transactions) FROM PUBLIC, anon, authenticated;

-- Trigger: conferma alla riconciliazione nuova fatta da una persona, smentita all'annullamento.
CREATE OR REPLACE FUNCTION private.tes_memoria_da_riconciliazione()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE s record;
BEGIN
  BEGIN
    IF TG_OP = 'INSERT' THEN
      IF NEW.unmatched_at IS NULL AND NEW.matched_by IS NOT NULL AND NEW.match_type IS DISTINCT FROM 'storico' THEN
        FOR s IN SELECT * FROM private.tes_soggetto_riconciliazione(NEW) LOOP
          PERFORM private.tes_memoria_registra(NEW.transaction_id, s.soggetto, s.nome, true);
        END LOOP;
      END IF;
    ELSIF OLD.unmatched_at IS NULL AND NEW.unmatched_at IS NOT NULL THEN
      FOR s IN SELECT * FROM private.tes_soggetto_riconciliazione(NEW) LOOP
        PERFORM private.tes_memoria_registra(NEW.transaction_id, s.soggetto, s.nome, false);
      END LOOP;
    END IF;
  -- query_canceled non è dentro OTHERS: senza, un timeout della memoria annullerebbe la conferma.
  EXCEPTION WHEN OTHERS OR query_canceled THEN
    RAISE WARNING 'Memoria della riconciliazione non aggiornata: %', SQLERRM;
  END;
  RETURN NULL;
END $function$;
REVOKE ALL ON FUNCTION private.tes_memoria_da_riconciliazione() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS tes_memoria_conferma ON public.bank_reconciliations;
CREATE TRIGGER tes_memoria_conferma AFTER INSERT ON public.bank_reconciliations
  FOR EACH ROW EXECUTE FUNCTION private.tes_memoria_da_riconciliazione();
DROP TRIGGER IF EXISTS tes_memoria_annullo ON public.bank_reconciliations;
CREATE TRIGGER tes_memoria_annullo AFTER UPDATE OF unmatched_at ON public.bank_reconciliations
  FOR EACH ROW WHEN (OLD.unmatched_at IS NULL AND NEW.unmatched_at IS NOT NULL)
  EXECUTE FUNCTION private.tes_memoria_da_riconciliazione();

-- Trigger: la proposta del motore scartata smentisce i soggetti dei documenti suggeriti.
-- bank_scarta_suggerimento azzera reconciliation_suggestions nella stessa UPDATE: si leggono da OLD.
CREATE OR REPLACE FUNCTION private.tes_memoria_da_proposta_scartata()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE v_id uuid; s record; v_visti text[] := '{}';
BEGIN
  BEGIN
    FOREACH v_id IN ARRAY coalesce(OLD.reconciliation_suggestions, ARRAY[]::uuid[]) LOOP
      FOR s IN
        SELECT x.* FROM unnest(ARRAY['documento', 'scadenza', 'rata_fornitore', 'ricevuta']) tipo,
               LATERAL private.tes_soggetto_di(NEW.company_id, tipo, v_id) x
        WHERE x.soggetto IS NOT NULL
      LOOP
        IF NOT s.soggetto = ANY(v_visti) THEN
          v_visti := v_visti || s.soggetto;
          PERFORM private.tes_memoria_registra(NEW.id, s.soggetto, s.nome, false);
        END IF;
      END LOOP;
    END LOOP;
  -- query_canceled non è dentro OTHERS: senza, un timeout della memoria annullerebbe la conferma.
  EXCEPTION WHEN OTHERS OR query_canceled THEN
    RAISE WARNING 'Memoria della riconciliazione non aggiornata: %', SQLERRM;
  END;
  RETURN NULL;
END $function$;
REVOKE ALL ON FUNCTION private.tes_memoria_da_proposta_scartata() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS tes_memoria_proposta_scartata ON public.bank_transactions;
CREATE TRIGGER tes_memoria_proposta_scartata AFTER UPDATE OF proposta_rifiutata_at ON public.bank_transactions
  FOR EACH ROW WHEN (OLD.proposta_rifiutata_at IS NULL AND NEW.proposta_rifiutata_at IS NOT NULL
                     AND OLD.reconciliation_suggestions IS NOT NULL)
  EXECUTE FUNCTION private.tes_memoria_da_proposta_scartata();
