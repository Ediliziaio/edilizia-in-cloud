-- ════════════════════════════════════════════════════════════════════════════
-- MP-SILVIO-COPILOT-01 · Blocco 6 — riduzione attrito
-- ────────────────────────────────────────────────────────────────────────────
-- PART A — Copilota dell'app: silvio_tool_guida_a → spiega un'operazione e dà il
--   deep-link (route_path + query_params) per aprire la schermata giusta,
--   eventualmente pre-compilata. Catalogo how-to inline (route reali verificate).
-- PART B — Memoria preferenze decisionali: tabella silvio_decision_rules +
--   RPC di match (read-only, per il routing) + RPC di salvataggio (esplicito).
--   NB sicurezza (scelta del titolare): le regole NON eseguono nulla in automatico
--   per ora — l'hook in executeToolWithRouting resta INERTE (flag OFF). Quando il
--   titolare accenderà l'auto-esegui, varrà SOLO per yellow, MAI red, loggato+undo.
-- ════════════════════════════════════════════════════════════════════════════

-- ── PART A: guida_a (catalogo how-to → deep-link) ───────────────────────────
CREATE OR REPLACE FUNCTION public.silvio_tool_guida_a(
  p_company_id uuid,
  p_operazione text,
  p_precompila boolean DEFAULT false,
  p_entita_id uuid DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  v_op text := lower(coalesce(p_operazione, ''));
  v_spiegazione text;
  v_route text;
  v_params jsonb := '{}'::jsonb;
BEGIN
  IF p_company_id IS NULL OR v_op = '' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'operazione obbligatoria');
  END IF;

  IF v_op ~ 'nota.*credito|storno|stornare' THEN
    v_spiegazione := 'Nota di credito: vai in Fatturazione, apri la fattura da stornare e scegli "Crea nota di credito". Verifica importo e causale, poi emetti.';
    v_route := '/azienda/fatturazione';
    v_params := jsonb_build_object('action', 'nota-credito');
    IF p_precompila AND p_entita_id IS NOT NULL THEN v_params := v_params || jsonb_build_object('fattura_id', p_entita_id); END IF;

  ELSIF v_op ~ 'preventiv' THEN
    v_spiegazione := 'Nuovo preventivo: dal modulo Preventivi crea una nuova offerta, aggiungi voci e prezzi, poi invia o scarica il PDF.';
    v_route := '/azienda/marketing/preventivi/nuovo';
    IF p_precompila AND p_entita_id IS NOT NULL THEN v_params := jsonb_build_object('cliente_id', p_entita_id); END IF;

  ELSIF v_op ~ 'incass|prima nota|registra.*pagam+ento|registra.*incasso' THEN
    v_spiegazione := 'Registra un incasso: apri Prima Nota e aggiungi un movimento in entrata, collegandolo alla fattura/ordine di riferimento.';
    v_route := '/azienda/prima-nota';
    v_params := jsonb_build_object('action', 'nuovo-incasso');
    IF p_precompila AND p_entita_id IS NOT NULL THEN v_params := v_params || jsonb_build_object('riferimento_id', p_entita_id); END IF;

  ELSIF v_op ~ 'fattur' THEN
    v_spiegazione := 'Nuova fattura: da Fatturazione scegli "Nuova fattura", compila intestazione, righe e IVA, poi emetti verso SDI.';
    v_route := '/azienda/fatturazione';
    v_params := jsonb_build_object('action', 'nuova-fattura');

  ELSIF v_op ~ 'cliente|anagrafica' THEN
    v_spiegazione := 'Nuovo cliente: dal modulo Clienti aggiungi una nuova anagrafica con ragione sociale, P.IVA/CF e contatti.';
    v_route := '/azienda/clienti/nuovo';

  ELSIF v_op ~ 'ordine.*fornitore|acquist|riordin' THEN
    v_spiegazione := 'Ordine a fornitore: apri Ordini d''Acquisto e crea un nuovo ordine selezionando fornitore e articoli.';
    v_route := '/azienda/ordini-acquisto';

  ELSIF v_op ~ 'ordine|commessa|lavoro' THEN
    v_spiegazione := 'Nuova commessa/ordine: da Ordini crea un nuovo lavoro con cliente, importo e scadenze (acconto/saldo).';
    v_route := '/azienda/ordini/nuovo';

  ELSIF v_op ~ 'magazzino|articolo|scorta|material' THEN
    v_spiegazione := 'Magazzino: apri il modulo Magazzino per gestire articoli, scorte e soglie di riordino.';
    v_route := '/azienda/magazzino';

  ELSE
    v_spiegazione := format('Non ho una scheda specifica per "%s". Apri il Cruscotto e usa il menu per raggiungere il modulo giusto, oppure chiedimi un''operazione più precisa.', p_operazione);
    v_route := '/azienda/cruscotto';
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'operazione', p_operazione,
    'spiegazione', v_spiegazione,
    'route_path', v_route,
    'query_params', v_params,
    'precompila', coalesce(p_precompila, false)
  );
END $$;

REVOKE EXECUTE ON FUNCTION public.silvio_tool_guida_a(uuid, text, boolean, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.silvio_tool_guida_a(uuid, text, boolean, uuid) TO authenticated, service_role;

-- ── PART B: tabella regole decisionali ──────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.silvio_decision_rules (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id  uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  user_id     uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  dominio     text NOT NULL,                     -- 'preventivi','pagamenti','fornitori',...
  condizione  jsonb NOT NULL,                    -- {field:'importo', op:'<', value:5000}
  azione      text NOT NULL CHECK (azione IN ('auto_approva','auto_rifiuta','avvisa')),
  attiva      boolean NOT NULL DEFAULT true,
  origine     text NOT NULL DEFAULT 'appreso' CHECK (origine IN ('appreso','esplicito')),
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_silvio_decision_rules_company ON public.silvio_decision_rules (company_id, dominio, attiva);

ALTER TABLE public.silvio_decision_rules ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS silvio_decision_rules_company ON public.silvio_decision_rules;
CREATE POLICY silvio_decision_rules_company ON public.silvio_decision_rules FOR ALL TO authenticated
  USING (company_id = public.get_effective_company_id())
  WITH CHECK (company_id = public.get_effective_company_id());
DROP POLICY IF EXISTS silvio_decision_rules_service ON public.silvio_decision_rules;
CREATE POLICY silvio_decision_rules_service ON public.silvio_decision_rules FOR ALL TO service_role USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS silvio_decision_rules_super ON public.silvio_decision_rules;
CREATE POLICY silvio_decision_rules_super ON public.silvio_decision_rules FOR SELECT TO authenticated USING (public.is_super_admin(auth.uid()));

-- ── PART B: match (read-only) — usato dal routing per AVVISARE (non esegue) ──
-- Valuta le regole attive del dominio contro un payload {field:value}. Operatori
-- supportati: '<','<=','>','>=','=','!='. Numerico se entrambi numerici, altrimenti testo.
CREATE OR REPLACE FUNCTION public.silvio_match_decision_rule(
  p_company_id uuid,
  p_dominio text,
  p_payload jsonb
) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  r record;
  v_field text;
  v_op text;
  v_rule_val jsonb;
  v_pay_val jsonb;
  v_match boolean;
  v_lhs numeric;
  v_rhs numeric;
BEGIN
  IF p_company_id IS NULL OR p_dominio IS NULL OR p_payload IS NULL THEN
    RETURN NULL;
  END IF;

  FOR r IN
    SELECT id, condizione, azione
    FROM public.silvio_decision_rules
    WHERE company_id = p_company_id AND dominio = p_dominio AND attiva = true
    ORDER BY created_at DESC
  LOOP
    v_field := r.condizione->>'field';
    v_op    := coalesce(r.condizione->>'op', '=');
    v_rule_val := r.condizione->'value';
    v_pay_val  := p_payload->v_field;
    IF v_field IS NULL OR v_pay_val IS NULL THEN CONTINUE; END IF;

    v_match := false;
    BEGIN
      v_lhs := (p_payload->>v_field)::numeric;
      v_rhs := (r.condizione->>'value')::numeric;
      v_match := CASE v_op
        WHEN '<'  THEN v_lhs <  v_rhs
        WHEN '<=' THEN v_lhs <= v_rhs
        WHEN '>'  THEN v_lhs >  v_rhs
        WHEN '>=' THEN v_lhs >= v_rhs
        WHEN '!=' THEN v_lhs <> v_rhs
        ELSE v_lhs = v_rhs
      END;
    EXCEPTION WHEN OTHERS THEN
      -- confronto testuale (solo = / !=)
      v_match := CASE v_op
        WHEN '!=' THEN (p_payload->>v_field) <> (r.condizione->>'value')
        ELSE (p_payload->>v_field) = (r.condizione->>'value')
      END;
    END;

    IF v_match THEN
      RETURN jsonb_build_object('rule_id', r.id, 'azione', r.azione);
    END IF;
  END LOOP;

  RETURN NULL;
END $$;

REVOKE EXECUTE ON FUNCTION public.silvio_match_decision_rule(uuid, text, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.silvio_match_decision_rule(uuid, text, jsonb) TO authenticated, service_role;

-- ── PART B: salvataggio regola (esplicito) ──────────────────────────────────
CREATE OR REPLACE FUNCTION public.silvio_tool_salva_regola_decisionale(
  p_company_id uuid,
  p_user_id uuid,
  p_dominio text,
  p_condizione jsonb,
  p_azione text,
  p_origine text DEFAULT 'esplicito'
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_id uuid;
BEGIN
  IF p_company_id IS NULL OR p_dominio IS NULL OR p_condizione IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'company_id, dominio e condizione obbligatori');
  END IF;
  IF coalesce(p_azione,'') NOT IN ('auto_approva','auto_rifiuta','avvisa') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'azione non valida (auto_approva|auto_rifiuta|avvisa)');
  END IF;
  IF (p_condizione->>'field') IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'condizione deve avere almeno {field, op, value}');
  END IF;

  INSERT INTO public.silvio_decision_rules (company_id, user_id, dominio, condizione, azione, origine)
  VALUES (p_company_id, p_user_id, p_dominio, p_condizione, p_azione,
          CASE WHEN coalesce(p_origine,'esplicito') IN ('appreso','esplicito') THEN p_origine ELSE 'esplicito' END)
  RETURNING id INTO v_id;

  RETURN jsonb_build_object('ok', true, 'rule_id', v_id, 'dominio', p_dominio, 'azione', p_azione);
END $$;

REVOKE EXECUTE ON FUNCTION public.silvio_tool_salva_regola_decisionale(uuid, uuid, text, jsonb, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.silvio_tool_salva_regola_decisionale(uuid, uuid, text, jsonb, text, text) TO authenticated, service_role;

COMMENT ON TABLE public.silvio_decision_rules IS 'MP-SILVIO-COPILOT-01: preferenze decisionali. Match via silvio_match_decision_rule. Auto-esegui DISATTIVO finché il titolare non lo abilita; varrà solo per yellow, mai red.';
