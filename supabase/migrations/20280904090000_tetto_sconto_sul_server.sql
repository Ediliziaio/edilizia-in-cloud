-- Ondata 2.4 — il tetto allo sconto vive sul database
--
-- La traccia interfaccia ha portato il controllo delle regole in tutti e dieci i
-- verticali (prima valeva in due), ma `sconto_pct` sulle tabelle *_progetti
-- resta un numero libero: chi scrive via API mette quello che vuole, e il lavoro
-- lato interfaccia resta cosmetico (cancello C3).
--
-- ── Cosa NON fa questo vincolo, e perché ────────────────────────────────────
-- L'interfaccia, quando l'azienda non ha configurato regole, usa 10% come
-- valore di ripiego. Qui NO: `discount_rules` è vuota (0 righe su tutta la
-- piattaforma), quindi imporre 10% significherebbe inventare una politica che
-- nessuna azienda ha scelto, e bloccare uno sconto del 15% legittimo. Il
-- briefing dice «oltre la soglia configurata dall'azienda»: dove la soglia non
-- è configurata, non c'è soglia da far rispettare.
--
-- Quello che il database impone sempre, perché non è una politica ma
-- un'assurdità: uno sconto negativo o superiore al 100%.
--
-- Quando invece la soglia c'è, il tetto è il minimo `sconto_max_pct` fra le
-- regole globali attive dell'azienda — la stessa fonte che usa
-- compute_max_discount per i preventivi. Chi ha `can_approve_discounts`
-- (compresi gli amministratori d'azienda) può superarlo: è il percorso di
-- approvazione che l'interfaccia già propone, non un'eccezione nuova.
--
-- Idempotente.

CREATE OR REPLACE FUNCTION public.sconto_max_azienda(p_company_id uuid)
RETURNS numeric
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  -- NULL = nessuna soglia configurata (≠ soglia zero).
  SELECT min(dr.sconto_max_pct)
  FROM public.discount_rules dr
  WHERE dr.company_id = p_company_id
    AND dr.is_active = true
    AND dr.scope = 'globale'
    AND dr.sconto_max_pct IS NOT NULL;
$function$;

COMMENT ON FUNCTION public.sconto_max_azienda(uuid) IS
  'Tetto allo sconto configurato dall''azienda (regole globali attive). '
  'NULL quando non è configurato: assenza di soglia, non soglia a zero.';

GRANT EXECUTE ON FUNCTION public.sconto_max_azienda(uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.valida_sconto_progetto()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $function$
DECLARE
  v_col   text := TG_ARGV[0];
  v_new   jsonb := to_jsonb(NEW);
  v_old   jsonb := CASE WHEN TG_OP = 'UPDATE' THEN to_jsonb(OLD) ELSE NULL END;
  v_val   numeric;
  v_prima numeric;
  v_max   numeric;
  v_comp  uuid := (v_new ->> 'company_id')::uuid;
BEGIN
  v_val := nullif(v_new ->> v_col, '')::numeric;
  IF v_val IS NULL THEN RETURN NEW; END IF;

  -- Solo se lo sconto è stato toccato: una riga storica fuori soglia resta
  -- modificabile su tutto il resto.
  IF v_old IS NOT NULL THEN
    v_prima := nullif(v_old ->> v_col, '')::numeric;
    IF v_prima IS NOT DISTINCT FROM v_val THEN RETURN NEW; END IF;
  END IF;

  -- Sempre, indipendentemente dalla configurazione: non è una politica
  -- aziendale, è un numero che non vuol dire niente.
  IF v_val < 0 OR v_val > 100 THEN
    -- Niente '%' letterali nel messaggio: in RAISE '%' è il segnaposto e
    -- '%%' il carattere, e mescolarli produce testo storto.
    RAISE EXCEPTION 'Sconto non valido: % per cento. Deve stare fra 0 e 100.', v_val
      USING ERRCODE = '23514';
  END IF;

  v_max := public.sconto_max_azienda(v_comp);
  IF v_max IS NULL THEN RETURN NEW; END IF;   -- nessuna soglia configurata

  -- Il service role è codice interno nostro (import, edge function): non è un
  -- commerciale che forza uno sconto, e senza questa riga qualunque flusso
  -- server-side verrebbe respinto perché auth.uid() è nullo.
  IF v_val > v_max
     AND NOT public.ai_is_service_role()
     AND NOT public.has_permission(auth.uid(), 'can_approve_discounts') THEN
    RAISE EXCEPTION
      'Sconto del % per cento: oltre il massimo consentito dall''azienda (% per cento). Serve l''approvazione di chi può autorizzare gli sconti.',
      v_val, v_max USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$function$;

COMMENT ON FUNCTION public.valida_sconto_progetto() IS
  'Trigger generico sui progetti dei verticali: TG_ARGV[0] = colonna dello '
  'sconto percentuale. Verifica solo i valori nuovi o modificati.';

DO $$
DECLARE
  t record;
BEGIN
  FOR t IN
    SELECT * FROM (VALUES
      ('bgn_progetti','sconto_pct'),
      ('rst_progetti','sconto_pct'),
      ('tet_progetti','sconto_pct'),
      ('clm_progetti','sconto_pct'),
      ('ele_progetti','sconto_pct'),
      ('idr_progetti','sconto_pct'),
      ('pav_progetti','sconto_pct'),
      ('pis_progetti','sconto_pct'),
      ('sr_progetti','sconto_percentuale')
    ) AS v(tabella, colonna)
  LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS trg_valida_sconto ON public.%I', t.tabella);
    EXECUTE format(
      'CREATE TRIGGER trg_valida_sconto BEFORE INSERT OR UPDATE OF %I ON public.%I '
      'FOR EACH ROW EXECUTE FUNCTION public.valida_sconto_progetto(%L)',
      t.colonna, t.tabella, t.colonna);
  END LOOP;
END $$;

-- fv_progetti tiene lo sconto in due campi (tipo + valore): il tetto vale solo
-- quando il tipo è percentuale, altrimenti `sconto_valore` sono euro e non si
-- confronta con una percentuale.
CREATE OR REPLACE FUNCTION public.valida_sconto_fv()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $function$
DECLARE
  v_max numeric;
BEGIN
  IF NEW.sconto_valore IS NULL THEN RETURN NEW; END IF;
  IF TG_OP = 'UPDATE'
     AND NEW.sconto_valore IS NOT DISTINCT FROM OLD.sconto_valore
     AND NEW.sconto_tipo IS NOT DISTINCT FROM OLD.sconto_tipo THEN
    RETURN NEW;
  END IF;

  IF coalesce(NEW.sconto_tipo, '') NOT IN ('percentuale', 'percentage', 'pct', '%') THEN
    IF NEW.sconto_valore < 0 THEN
      RAISE EXCEPTION 'Sconto non valido: uno sconto in euro non può essere negativo.'
        USING ERRCODE = '23514';
    END IF;
    RETURN NEW;
  END IF;

  IF NEW.sconto_valore < 0 OR NEW.sconto_valore > 100 THEN
    RAISE EXCEPTION 'Sconto non valido: % per cento. Deve stare fra 0 e 100.', NEW.sconto_valore
      USING ERRCODE = '23514';
  END IF;

  v_max := public.sconto_max_azienda(NEW.company_id);
  IF v_max IS NOT NULL AND NEW.sconto_valore > v_max
     AND NOT public.ai_is_service_role()
     AND NOT public.has_permission(auth.uid(), 'can_approve_discounts') THEN
    RAISE EXCEPTION
      'Sconto del % per cento: oltre il massimo consentito dall''azienda (% per cento). Serve l''approvazione di chi può autorizzare gli sconti.',
      NEW.sconto_valore, v_max USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_valida_sconto ON public.fv_progetti;
CREATE TRIGGER trg_valida_sconto
  BEFORE INSERT OR UPDATE OF sconto_valore, sconto_tipo ON public.fv_progetti
  FOR EACH ROW EXECUTE FUNCTION public.valida_sconto_fv();
