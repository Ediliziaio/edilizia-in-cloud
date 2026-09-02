-- ============================================================================
-- Bonus edilizi multipli + Blocca prezzo  (richiesta Ke Bei Serramenti)
-- ============================================================================
-- 1) BONUS MULTIPLI. Oggi la commessa ha solo `orders.has_building_bonus`
--    (Sì/No): un contratto da 20.000 € diviso 10.000 Bonus Casa + 10.000
--    Sicurezza non è rappresentabile, e le due pratiche distinte richiedono
--    DUE bonifici parlanti con causali diverse. Aggiungiamo le righe-bonus:
--    la somma degli imponibili deve tornare col totale commessa.
--    La ritenuta d'acconto 11% (art. 25 D.L. 78/2010) resta sull'imponibile
--    di ciascun bonifico: il totale non cambia, ma ora è ripartito per riga.
--
-- 2) BLOCCA PREZZO. Somma che il cliente versa per bloccare il listino con
--    bonifico ORDINARIO (mai parlante: la banca tratterrebbe l'11% e
--    quell'importo non sarebbe più detraibile) e che poi viene restituita
--    prima dei bonifici parlanti dei lavori. Non è un acconto: non va nel
--    piano rate né nel residuo cliente, ma passa in cassa (entrata + uscita).
--    Può nascere sul preventivo (prima che la commessa esista) o sulla
--    commessa, e a volte resta trattenuto (→ perde la detrazione).
--
-- 3) Interruttori per azienda, ma con default OPPOSTI:
--    • blocca prezzo → ON per tutti (serve a chiunque incassi somme da
--      restituire), disattivabile;
--    • bonus multipli → OFF per tutti, acceso solo a chi lo chiede: le altre
--      aziende continuano a vedere il semplice interruttore Bonus Edilizio.
-- Migration ADDITIVA: nessuna colonna esistente viene toccata o rimossa.
-- ============================================================================

-- ── 1. Interruttori per azienda ─────────────────────────────────────────────
-- Blocca prezzo: serve a chiunque incassi somme da restituire → standard di
--   piattaforma, default ON, con l'interruttore per chi non lo vuole vedere.
-- Bonus multipli: richiesta specifica di chi divide il contratto su due
--   pratiche → default OFF, si accende azienda per azienda.
ALTER TABLE public.companies
  ADD COLUMN IF NOT EXISTS bonus_multipli_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS blocca_prezzo_enabled  boolean NOT NULL DEFAULT true;

-- Se la colonna esisteva già col vecchio default (false), allineala.
ALTER TABLE public.companies ALTER COLUMN blocca_prezzo_enabled SET DEFAULT true;
UPDATE public.companies SET blocca_prezzo_enabled = true WHERE blocca_prezzo_enabled = false;

COMMENT ON COLUMN public.companies.bonus_multipli_enabled IS
  'Consente di ripartire una commessa su più bonus edilizi (pratiche distinte). Default off: si accende su richiesta.';
COMMENT ON COLUMN public.companies.blocca_prezzo_enabled IS
  'Gestione versamenti "blocca prezzo" (bonifico ordinario da restituire). Standard di piattaforma: default ON, disattivabile per azienda.';

-- ── 2. Righe bonus della commessa ───────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.order_bonus_lines (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id            uuid NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  -- Denormalizzato: serve alla RLS e alle query di cassa senza join su orders.
  company_id          uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  position            integer NOT NULL DEFAULT 0,
  -- id del preset in src/lib/fatturazione/detrazioniEdilizie.ts (null = personalizzato)
  preset_id           text,
  label               text NOT NULL,
  -- Quota di IMPONIBILE assegnata a questo bonus (stessa base di orders.total_amount).
  imponibile          numeric NOT NULL DEFAULT 0,
  -- Aliquota di DETRAZIONE (50, 65, 75…), non l'IVA.
  aliquota_detrazione numeric,
  -- Causale del bonifico parlante, editabile (finisce nel PDF e in fattura).
  causale             text,
  note                text,
  created_at          timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT order_bonus_lines_imponibile_non_negativo CHECK (imponibile >= 0),
  CONSTRAINT order_bonus_lines_aliquota_valida
    CHECK (aliquota_detrazione IS NULL OR (aliquota_detrazione >= 0 AND aliquota_detrazione <= 100))
);

CREATE UNIQUE INDEX IF NOT EXISTS order_bonus_lines_order_position_key
  ON public.order_bonus_lines (order_id, position);
CREATE INDEX IF NOT EXISTS order_bonus_lines_order_idx
  ON public.order_bonus_lines (order_id);
CREATE INDEX IF NOT EXISTS order_bonus_lines_company_idx
  ON public.order_bonus_lines (company_id);

ALTER TABLE public.order_bonus_lines ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "bonus_lines_azienda" ON public.order_bonus_lines;
CREATE POLICY "bonus_lines_azienda" ON public.order_bonus_lines
  FOR ALL TO authenticated
  USING (public.can_access_company_people(company_id))
  WITH CHECK (public.can_access_company_people(company_id));

-- Il cliente vede la ripartizione della PROPRIA commessa (portale): gli serve
-- per sapere con che causale bonificare.
DROP POLICY IF EXISTS "bonus_lines_cliente_legge_le_sue" ON public.order_bonus_lines;
CREATE POLICY "bonus_lines_cliente_legge_le_sue" ON public.order_bonus_lines
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.orders o
    WHERE o.id = order_bonus_lines.order_id
      AND o.customer_id = (SELECT auth.uid())
  ));

-- ── 3. Righe bonus sul preventivo (jsonb, come quotes.payment_phases) ───────
ALTER TABLE public.quotes
  ADD COLUMN IF NOT EXISTS bonus_lines jsonb;

COMMENT ON COLUMN public.quotes.bonus_lines IS
  'Ripartizione bonus edilizi decisa in preventivo: [{preset_id,label,imponibile,aliquota_detrazione,causale,note}]. Ereditata dalla commessa alla trasformazione.';

-- ── 4. Blocca prezzo ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.blocca_prezzo (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id    uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  customer_id   uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  -- Nasce sul preventivo OPPURE sulla commessa; alla trasformazione si popola
  -- anche order_id mantenendo quote_id (tracciabilità).
  quote_id      uuid REFERENCES public.quotes(id) ON DELETE SET NULL,
  order_id      uuid REFERENCES public.orders(id) ON DELETE SET NULL,
  importo       numeric NOT NULL DEFAULT 0,
  data_incasso  date,
  -- Mai 'bonifico_parlante': è proprio il punto della funzione.
  metodo        text NOT NULL DEFAULT 'bonifico_ordinario',
  stato         text NOT NULL DEFAULT 'incassato',
  data_esito    date,
  -- Estremi della restituzione (CRO/riferimento bonifico) o nota sul trattenuto.
  riferimento   text,
  note          text,
  created_by    uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT blocca_prezzo_importo_positivo CHECK (importo >= 0),
  CONSTRAINT blocca_prezzo_metodo_valido
    CHECK (metodo IN ('bonifico_ordinario', 'contanti', 'assegno', 'pos', 'altro')),
  CONSTRAINT blocca_prezzo_stato_valido
    CHECK (stato IN ('incassato', 'restituito', 'trattenuto')),
  -- NIENTE check "quote_id o order_id non nulli": le FK sono ON DELETE SET NULL,
  -- quindi cancellare la commessa o il preventivo azzererebbe l'aggancio e un
  -- check del genere farebbe FALLIRE la cancellazione (verificato in prod).
  -- Una riga orfana conserva company_id, customer_id, importo e stato: il debito
  -- verso il cliente non sparisce insieme al documento.
  -- Restituito/trattenuto senza data esito = stato non verificabile in cassa.
  CONSTRAINT blocca_prezzo_esito_datato
    CHECK (stato = 'incassato' OR data_esito IS NOT NULL)
);

CREATE INDEX IF NOT EXISTS blocca_prezzo_company_idx ON public.blocca_prezzo (company_id);
CREATE INDEX IF NOT EXISTS blocca_prezzo_order_idx   ON public.blocca_prezzo (order_id) WHERE order_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS blocca_prezzo_quote_idx   ON public.blocca_prezzo (quote_id) WHERE quote_id IS NOT NULL;
-- Query di cassa: "quanto devo ancora restituire".
CREATE INDEX IF NOT EXISTS blocca_prezzo_da_restituire_idx
  ON public.blocca_prezzo (company_id, stato) WHERE stato = 'incassato';

COMMENT ON TABLE public.blocca_prezzo IS
  'Versamenti "blocca prezzo": arrivano con bonifico ordinario e vanno restituiti prima dei bonifici parlanti. Fuori dal piano rate e dal totale contratto. Se la commessa o il preventivo vengono cancellati la riga resta (agganci a NULL): il debito verso il cliente non sparisce con il documento.';

ALTER TABLE public.blocca_prezzo ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "blocca_prezzo_azienda" ON public.blocca_prezzo;
CREATE POLICY "blocca_prezzo_azienda" ON public.blocca_prezzo
  FOR ALL TO authenticated
  USING (public.can_access_company_people(company_id))
  WITH CHECK (public.can_access_company_people(company_id));

DROP POLICY IF EXISTS "blocca_prezzo_cliente_legge_i_suoi" ON public.blocca_prezzo;
CREATE POLICY "blocca_prezzo_cliente_legge_i_suoi" ON public.blocca_prezzo
  FOR SELECT TO authenticated
  USING (customer_id = (SELECT auth.uid()));

DROP TRIGGER IF EXISTS blocca_prezzo_touch_updated_at ON public.blocca_prezzo;
CREATE TRIGGER blocca_prezzo_touch_updated_at
  BEFORE UPDATE ON public.blocca_prezzo
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
