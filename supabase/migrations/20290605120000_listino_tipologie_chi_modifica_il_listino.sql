-- Le tipologie del listino prodotti le gestisce chi può modificare il listino (25/11/2026).
--
-- Fino a oggi prodotti e linee li scriveva chi ha il permesso «can_edit_settings_pricing»,
-- le tipologie (listino_macrocategorie) solo l'amministratore. In un'impresa un
-- collaboratore col permesso ha creato «GUAINA»: il prodotto è stato salvato, ma senza
-- tipologia, e la tipologia non poteva crearla (nessun pulsante, e il database l'avrebbe
-- rifiutata). Vale per tutte le aziende: amministratore OPPURE permesso sul listino.
--
-- Tocca: le regole di listino_macrocategorie e listino_macrocategoria_fields,
-- listino_crea_area (nuova area) e listino_copia_tipologia (copia di una tipologia).
-- Le due funzioni si correggono sul testo che hanno nel database, non riscritte da capo:
-- se il testo atteso non c'è, la migrazione si ferma invece di indovinare.

SET LOCAL lock_timeout = '3s';

-- ── Regole delle tipologie ─────────────────────────────────────────────────
DROP POLICY IF EXISTS macrocat_insert ON public.listino_macrocategorie;
CREATE POLICY macrocat_insert ON public.listino_macrocategorie
  FOR INSERT TO authenticated
  WITH CHECK (
    company_id = (SELECT public.get_my_company_id())
    AND (
      (SELECT public.e_amministratore_di(public.get_my_company_id()))
      OR company_id IN (SELECT unnest(public.aziende_con_permesso('can_edit_settings_pricing')))
    )
    AND NOT (SELECT public.utente_e_cliente_esterno())
  );

DROP POLICY IF EXISTS macrocat_update ON public.listino_macrocategorie;
CREATE POLICY macrocat_update ON public.listino_macrocategorie
  FOR UPDATE TO authenticated
  USING (
    company_id = (SELECT public.get_my_company_id())
    AND (
      (SELECT public.e_amministratore_di(public.get_my_company_id()))
      OR company_id IN (SELECT unnest(public.aziende_con_permesso('can_edit_settings_pricing')))
    )
    AND NOT (SELECT public.utente_e_cliente_esterno())
  );

DROP POLICY IF EXISTS macrocat_delete ON public.listino_macrocategorie;
CREATE POLICY macrocat_delete ON public.listino_macrocategorie
  FOR DELETE TO authenticated
  USING (
    company_id = (SELECT public.get_my_company_id())
    AND (
      (SELECT public.e_amministratore_di(public.get_my_company_id()))
      OR company_id IN (SELECT unnest(public.aziende_con_permesso('can_edit_settings_pricing')))
    )
    AND NOT (SELECT public.utente_e_cliente_esterno())
  );

-- I campi di una tipologia seguono la tipologia.
DROP POLICY IF EXISTS macrofields_insert ON public.listino_macrocategoria_fields;
CREATE POLICY macrofields_insert ON public.listino_macrocategoria_fields
  FOR INSERT TO authenticated
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.listino_macrocategorie m
     WHERE m.id = listino_macrocategoria_fields.macrocategoria_id
       AND m.company_id = (SELECT public.get_my_company_id())
       AND (
         (SELECT public.e_amministratore_di(public.get_my_company_id()))
         OR m.company_id IN (SELECT unnest(public.aziende_con_permesso('can_edit_settings_pricing')))
       )
  ));

DROP POLICY IF EXISTS macrofields_update ON public.listino_macrocategoria_fields;
CREATE POLICY macrofields_update ON public.listino_macrocategoria_fields
  FOR UPDATE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.listino_macrocategorie m
     WHERE m.id = listino_macrocategoria_fields.macrocategoria_id
       AND m.company_id = (SELECT public.get_my_company_id())
       AND (
         (SELECT public.e_amministratore_di(public.get_my_company_id()))
         OR m.company_id IN (SELECT unnest(public.aziende_con_permesso('can_edit_settings_pricing')))
       )
  ));

DROP POLICY IF EXISTS macrofields_delete ON public.listino_macrocategoria_fields;
CREATE POLICY macrofields_delete ON public.listino_macrocategoria_fields
  FOR DELETE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.listino_macrocategorie m
     WHERE m.id = listino_macrocategoria_fields.macrocategoria_id
       AND m.company_id = (SELECT public.get_my_company_id())
       AND (
         (SELECT public.e_amministratore_di(public.get_my_company_id()))
         OR m.company_id IN (SELECT unnest(public.aziende_con_permesso('can_edit_settings_pricing')))
       )
  ));

-- ── Funzioni: nuova area e copia di una tipologia ───────────────────────────
DO $$
DECLARE
  v_def text;
  v_nuova text;
BEGIN
  -- listino_crea_area (SECURITY INVOKER: valgono anche le regole sopra)
  SELECT pg_get_functiondef(p.oid) INTO v_def
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname = 'listino_crea_area';
  IF v_def IS NULL THEN
    RAISE EXCEPTION 'listino_crea_area non trovata';
  END IF;
  IF position('aziende_con_permesso(''can_edit_settings_pricing'')' IN v_def) = 0 THEN
    v_nuova := replace(v_def,
      'or not (public.e_amministratore_di(p_company_id) or public.has_role(auth.uid(), ''super_admin''::public.app_role))',
      'or not (public.e_amministratore_di(p_company_id) or p_company_id = any(public.aziende_con_permesso(''can_edit_settings_pricing'')) or public.has_role(auth.uid(), ''super_admin''::public.app_role))');
    v_nuova := replace(v_nuova,
      'Solo un amministratore può creare le aree di questa azienda.',
      'Serve il permesso di modificare il listino per creare le aree di questa azienda.');
    IF position('aziende_con_permesso(''can_edit_settings_pricing'')' IN v_nuova) = 0 THEN
      RAISE EXCEPTION 'listino_crea_area: il controllo atteso non c''è, la funzione è cambiata';
    END IF;
    EXECUTE v_nuova;
  END IF;

  -- listino_copia_tipologia (SECURITY DEFINER: il controllo è tutto qui)
  SELECT pg_get_functiondef(p.oid) INTO v_def
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname = 'listino_copia_tipologia';
  IF v_def IS NULL THEN
    RAISE EXCEPTION 'listino_copia_tipologia non trovata';
  END IF;
  IF position('aziende_con_permesso(''can_edit_settings_pricing'')' IN v_def) = 0 THEN
    v_nuova := replace(v_def,
      E'         and mca.access_role::text = ''company_admin'')\n  ) then',
      E'         and mca.access_role::text = ''company_admin'')\n    or v_src.company_id = any(public.aziende_con_permesso(''can_edit_settings_pricing''))\n  ) then');
    v_nuova := replace(v_nuova,
      '-- Come la regola che lascia creare le tipologie: amministratore o super admin.',
      '-- Come la regola che lascia creare le tipologie: amministratore, permesso sul listino o super admin.');
    v_nuova := replace(v_nuova,
      'Solo l''''amministratore dell''''azienda può copiare una tipologia',
      'Serve il permesso di modificare il listino per copiare una tipologia');
    IF position('aziende_con_permesso(''can_edit_settings_pricing'')' IN v_nuova) = 0 THEN
      RAISE EXCEPTION 'listino_copia_tipologia: il controllo atteso non c''è, la funzione è cambiata';
    END IF;
    EXECUTE v_nuova;
  END IF;
END $$;
