-- ============================================================================
-- Sprint B — Varianti Costo Manodopera (masterprompt §3.1, §3.2, §3.3)
-- ----------------------------------------------------------------------------
-- Aggiunge il modello multi-variante per il costo delle tariffe (manodopera
-- principalmente) e la tabella di assegnazione per-preventivo.
--
-- Tabelle create:
--   · tariffa_costi_varianti           — varianti di costo per tariffa
--   · preventivo_manodopera_assegnazioni — scelta variante per quote_item
--   · user_permissions                  — override granulare per-utente
--
-- Colonna aggiunta:
--   · tariffe_aziendali.costo_default  — rinomina soft di costo_interno
--
-- Function creata:
--   · has_permission(user, perm)       — helper override > ruolo-based default
--
-- Nota FK: `fornitori` e `hr_risorse` non esistono nello schema attuale.
-- Le colonne fornitore_id/risorsa_id sono UUID NULL SENZA REFERENCES con
-- commento esplicito. La FK verrà aggiunta quando i moduli saranno definiti.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. tariffa_costi_varianti — catalogo varianti per tariffa
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.tariffa_costi_varianti (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id     UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  tariffa_id     UUID NOT NULL REFERENCES public.tariffe_aziendali(id) ON DELETE CASCADE,

  nome           TEXT NOT NULL,
  descrizione    TEXT,

  modalita_contabile TEXT NOT NULL
    CHECK (modalita_contabile IN (
      'dipendente',
      'subappalto_fatturato',
      'subappalto_forfait',
      'forfait',
      'altro'
    )),

  -- FK deboli: tabelle fornitori/hr_risorse non ancora canonicali nel repo.
  fornitore_id   UUID,
  risorsa_id     UUID,

  costo          NUMERIC(12,4) NOT NULL DEFAULT 0,

  valid_from     DATE NOT NULL DEFAULT CURRENT_DATE,
  valid_to       DATE,

  is_default     BOOLEAN NOT NULL DEFAULT false,
  attivo         BOOLEAN NOT NULL DEFAULT true,
  sort_order     INT NOT NULL DEFAULT 0,

  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.tariffa_costi_varianti IS
  'Varianti di costo per tariffa (dipendente, subappalto A, subappalto B...). '
  'Una sola variante is_default=true attiva per tariffa. Snapshot del costo '
  'viene preso in preventivo_manodopera_assegnazioni.costo_bloccato.';

COMMENT ON COLUMN public.tariffa_costi_varianti.fornitore_id IS
  'FK debole (no REFERENCES): mappa a subappaltatori.id o suppliers.id una '
  'volta definito il supplier module canonical. Oggi è un UUID libero.';

COMMENT ON COLUMN public.tariffa_costi_varianti.risorsa_id IS
  'FK debole (no REFERENCES): mappa a hr_risorse.id quando lo schema HR '
  'sarà finalizzato. Oggi è un UUID libero.';

CREATE INDEX IF NOT EXISTS idx_varianti_company
  ON public.tariffa_costi_varianti(company_id);
CREATE INDEX IF NOT EXISTS idx_varianti_tariffa
  ON public.tariffa_costi_varianti(tariffa_id);
CREATE INDEX IF NOT EXISTS idx_varianti_default_active
  ON public.tariffa_costi_varianti(tariffa_id)
  WHERE is_default = true AND attivo = true;
CREATE INDEX IF NOT EXISTS idx_varianti_fornitore
  ON public.tariffa_costi_varianti(fornitore_id)
  WHERE fornitore_id IS NOT NULL;

-- Unique: una sola variante is_default attiva per tariffa
CREATE UNIQUE INDEX IF NOT EXISTS ux_varianti_one_default_per_tariffa
  ON public.tariffa_costi_varianti(tariffa_id)
  WHERE is_default = true AND attivo = true;

-- RLS
ALTER TABLE public.tariffa_costi_varianti ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS varianti_select ON public.tariffa_costi_varianti;
CREATE POLICY varianti_select ON public.tariffa_costi_varianti
  FOR SELECT
  USING (
    (company_id = public.get_my_company_id()
     AND public.has_role(auth.uid(), 'company_admin'::public.app_role))
    OR public.has_role(auth.uid(), 'super_admin'::public.app_role)
  );

DROP POLICY IF EXISTS varianti_insert ON public.tariffa_costi_varianti;
CREATE POLICY varianti_insert ON public.tariffa_costi_varianti
  FOR INSERT
  WITH CHECK (
    (company_id = public.get_my_company_id()
     AND public.has_role(auth.uid(), 'company_admin'::public.app_role))
    OR public.has_role(auth.uid(), 'super_admin'::public.app_role)
  );

DROP POLICY IF EXISTS varianti_update ON public.tariffa_costi_varianti;
CREATE POLICY varianti_update ON public.tariffa_costi_varianti
  FOR UPDATE
  USING (
    (company_id = public.get_my_company_id()
     AND public.has_role(auth.uid(), 'company_admin'::public.app_role))
    OR public.has_role(auth.uid(), 'super_admin'::public.app_role)
  )
  WITH CHECK (
    (company_id = public.get_my_company_id()
     AND public.has_role(auth.uid(), 'company_admin'::public.app_role))
    OR public.has_role(auth.uid(), 'super_admin'::public.app_role)
  );

DROP POLICY IF EXISTS varianti_delete ON public.tariffa_costi_varianti;
CREATE POLICY varianti_delete ON public.tariffa_costi_varianti
  FOR DELETE
  USING (
    (company_id = public.get_my_company_id()
     AND public.has_role(auth.uid(), 'company_admin'::public.app_role))
    OR public.has_role(auth.uid(), 'super_admin'::public.app_role)
  );

-- Trigger updated_at
CREATE OR REPLACE FUNCTION public.touch_varianti_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_touch_varianti ON public.tariffa_costi_varianti;
CREATE TRIGGER trg_touch_varianti
  BEFORE UPDATE ON public.tariffa_costi_varianti
  FOR EACH ROW EXECUTE FUNCTION public.touch_varianti_updated_at();

-- ---------------------------------------------------------------------------
-- 2. preventivo_manodopera_assegnazioni — scelta variante per quote_item
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.preventivo_manodopera_assegnazioni (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id        UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  quote_id          UUID NOT NULL REFERENCES public.quotes(id) ON DELETE CASCADE,
  quote_item_id     UUID NOT NULL REFERENCES public.quote_items(id) ON DELETE CASCADE,
  tariffa_id        UUID NOT NULL REFERENCES public.tariffe_aziendali(id),
  variante_id       UUID NOT NULL REFERENCES public.tariffa_costi_varianti(id),

  costo_bloccato    NUMERIC(12,4) NOT NULL,
  costo_bloccato_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  stato             TEXT NOT NULL DEFAULT 'proposta'
    CHECK (stato IN ('proposta','confermata','in_esecuzione','consuntivato','annullata')),
  note              TEXT,

  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by        UUID REFERENCES public.profiles(id),

  UNIQUE (quote_item_id)
);

COMMENT ON TABLE public.preventivo_manodopera_assegnazioni IS
  'Assegnazione di una variante di costo a una specifica riga di preventivo. '
  'Snapshot costo_bloccato evita ricalcolo retroattivo quando la variante '
  'cambia prezzo nel tempo.';

CREATE INDEX IF NOT EXISTS idx_assegnazioni_quote
  ON public.preventivo_manodopera_assegnazioni(quote_id);
CREATE INDEX IF NOT EXISTS idx_assegnazioni_variante
  ON public.preventivo_manodopera_assegnazioni(variante_id);
CREATE INDEX IF NOT EXISTS idx_assegnazioni_tariffa
  ON public.preventivo_manodopera_assegnazioni(tariffa_id);
CREATE INDEX IF NOT EXISTS idx_assegnazioni_stato
  ON public.preventivo_manodopera_assegnazioni(company_id, stato);

ALTER TABLE public.preventivo_manodopera_assegnazioni ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS assegnazioni_select ON public.preventivo_manodopera_assegnazioni;
CREATE POLICY assegnazioni_select ON public.preventivo_manodopera_assegnazioni
  FOR SELECT
  USING (
    (company_id = public.get_my_company_id()
     AND public.has_role(auth.uid(), 'company_admin'::public.app_role))
    OR public.has_role(auth.uid(), 'super_admin'::public.app_role)
  );

DROP POLICY IF EXISTS assegnazioni_insert ON public.preventivo_manodopera_assegnazioni;
CREATE POLICY assegnazioni_insert ON public.preventivo_manodopera_assegnazioni
  FOR INSERT
  WITH CHECK (
    (company_id = public.get_my_company_id()
     AND public.has_role(auth.uid(), 'company_admin'::public.app_role))
    OR public.has_role(auth.uid(), 'super_admin'::public.app_role)
  );

DROP POLICY IF EXISTS assegnazioni_update ON public.preventivo_manodopera_assegnazioni;
CREATE POLICY assegnazioni_update ON public.preventivo_manodopera_assegnazioni
  FOR UPDATE
  USING (
    (company_id = public.get_my_company_id()
     AND public.has_role(auth.uid(), 'company_admin'::public.app_role))
    OR public.has_role(auth.uid(), 'super_admin'::public.app_role)
  )
  WITH CHECK (
    (company_id = public.get_my_company_id()
     AND public.has_role(auth.uid(), 'company_admin'::public.app_role))
    OR public.has_role(auth.uid(), 'super_admin'::public.app_role)
  );

DROP POLICY IF EXISTS assegnazioni_delete ON public.preventivo_manodopera_assegnazioni;
CREATE POLICY assegnazioni_delete ON public.preventivo_manodopera_assegnazioni
  FOR DELETE
  USING (
    (company_id = public.get_my_company_id()
     AND public.has_role(auth.uid(), 'company_admin'::public.app_role))
    OR public.has_role(auth.uid(), 'super_admin'::public.app_role)
  );

CREATE OR REPLACE FUNCTION public.touch_assegnazioni_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_touch_assegnazioni ON public.preventivo_manodopera_assegnazioni;
CREATE TRIGGER trg_touch_assegnazioni
  BEFORE UPDATE ON public.preventivo_manodopera_assegnazioni
  FOR EACH ROW EXECUTE FUNCTION public.touch_assegnazioni_updated_at();

-- ---------------------------------------------------------------------------
-- 3. user_permissions — override granulare per-utente
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.user_permissions (
  user_id    UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  permission TEXT NOT NULL,
  granted    BOOLEAN NOT NULL DEFAULT false,
  granted_by UUID REFERENCES public.profiles(id),
  granted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, permission)
);

COMMENT ON TABLE public.user_permissions IS
  'Override granulare di permessi per-utente. Ha precedenza sul default del '
  'ruolo. Chiavi note: can_view_costs, can_view_margins, can_choose_variant, '
  'can_view_assegnazioni, can_edit_assegnazioni.';

ALTER TABLE public.user_permissions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS user_permissions_select ON public.user_permissions;
CREATE POLICY user_permissions_select ON public.user_permissions
  FOR SELECT
  USING (
    user_id = auth.uid()
    OR public.has_role(auth.uid(), 'company_admin'::public.app_role)
    OR public.has_role(auth.uid(), 'super_admin'::public.app_role)
  );

DROP POLICY IF EXISTS user_permissions_admin_cud ON public.user_permissions;
CREATE POLICY user_permissions_admin_cud ON public.user_permissions
  FOR ALL
  USING (
    public.has_role(auth.uid(), 'company_admin'::public.app_role)
    OR public.has_role(auth.uid(), 'super_admin'::public.app_role)
  )
  WITH CHECK (
    public.has_role(auth.uid(), 'company_admin'::public.app_role)
    OR public.has_role(auth.uid(), 'super_admin'::public.app_role)
  );

-- ---------------------------------------------------------------------------
-- 4. has_cost_permission — helper function per permessi cost/margin/variant
-- ---------------------------------------------------------------------------
-- NOTA: `has_permission(uuid, text)` già esiste con signature `(_user_id,
-- _permission)` e legge da `staff_permissions`. Per evitare collision e non
-- rompere il comportamento esistente, creiamo una function dedicata per i
-- permessi costo/margine/variante che legge da `user_permissions`.
CREATE OR REPLACE FUNCTION public.has_cost_permission(p_user UUID, p_perm TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_override BOOLEAN;
  v_is_admin BOOLEAN;
BEGIN
  -- 1. Override esplicito nella tabella user_permissions (prende precedenza)
  SELECT granted INTO v_override
  FROM public.user_permissions
  WHERE user_id = p_user AND permission = p_perm
  LIMIT 1;
  IF v_override IS NOT NULL THEN
    RETURN v_override;
  END IF;

  -- 2. Default ruolo-based: i permessi "cost/margin/variant" sono admin-only
  IF p_perm IN (
    'can_view_costs',
    'can_view_margins',
    'can_choose_variant',
    'can_view_assegnazioni',
    'can_edit_assegnazioni'
  ) THEN
    SELECT EXISTS(
      SELECT 1 FROM public.user_roles
      WHERE user_id = p_user
        AND role IN ('super_admin'::public.app_role, 'company_admin'::public.app_role)
    ) INTO v_is_admin;
    RETURN COALESCE(v_is_admin, false);
  END IF;

  -- 3. Unknown permission → deny by default
  RETURN false;
END;
$$;

COMMENT ON FUNCTION public.has_cost_permission(UUID, TEXT) IS
  'Check permessi cost/margin/variant: user_permissions override > ruolo-based '
  'default. Distinto da has_permission (staff_permissions) per evitare '
  'collision di signature con la function esistente.';

-- ---------------------------------------------------------------------------
-- 5. tariffe_aziendali.costo_default — rinomina soft di costo_interno
-- ---------------------------------------------------------------------------
ALTER TABLE public.tariffe_aziendali
  ADD COLUMN IF NOT EXISTS costo_default NUMERIC(12,4);

UPDATE public.tariffe_aziendali
SET costo_default = COALESCE(costo_interno, prezzo_costo, 0)
WHERE costo_default IS NULL;

COMMENT ON COLUMN public.tariffe_aziendali.costo_default IS
  'Costo default usato quando nessuna variante è ancora stata assegnata. '
  'Base per il calcolo margine atteso in preventivo. Se esistono varianti, '
  'la variante is_default=true ha precedenza per il preview live.';

-- ---------------------------------------------------------------------------
-- 6. Seed: per ogni tariffa con costo > 0, crea "Costo default storico" variante
-- ---------------------------------------------------------------------------
-- Solo se la tariffa non ha ancora varianti. Idempotente.
INSERT INTO public.tariffa_costi_varianti
  (company_id, tariffa_id, nome, descrizione, modalita_contabile,
   costo, is_default, sort_order)
SELECT
  t.company_id,
  t.id,
  'Costo default storico',
  'Variante creata automaticamente dal sistema per preservare il costo '
    || 'precedente alla migrazione multi-variante.',
  'forfait',
  COALESCE(t.costo_default, t.costo_interno, t.prezzo_costo, 0),
  true,
  0
FROM public.tariffe_aziendali t
WHERE COALESCE(t.costo_default, t.costo_interno, t.prezzo_costo, 0) > 0
  AND NOT EXISTS (
    SELECT 1 FROM public.tariffa_costi_varianti v
    WHERE v.tariffa_id = t.id
  );
