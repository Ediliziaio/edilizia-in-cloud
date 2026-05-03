-- MP-CG-08 — Helper `is_cg_enabled` + integrazione difensiva nelle RPC cg_*
--
-- Strato di sicurezza in profondità: anche se un utente bypassa la sidebar
-- (chiamata RPC diretta via curl/SDK), riceve un'eccezione se la company
-- non ha l'add-on `controllo_gestione_v1` attivo.

CREATE OR REPLACE FUNCTION public.is_cg_enabled(p_company_id uuid DEFAULT NULL)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    (
      SELECT cfo.is_enabled
      FROM public.company_feature_overrides cfo
      WHERE cfo.company_id = COALESCE(p_company_id, public.get_my_company_id())
        AND cfo.feature_key = 'controllo_gestione_v1'
      LIMIT 1
    ),
    (
      SELECT pff.default_value
      FROM public.platform_feature_flags pff
      WHERE pff.key = 'controllo_gestione_v1'
      LIMIT 1
    ),
    false
  );
$$;

GRANT EXECUTE ON FUNCTION public.is_cg_enabled TO authenticated;

COMMENT ON FUNCTION public.is_cg_enabled IS
  'True se la company indicata (default: utente corrente) ha il flag controllo_gestione_v1 attivo. Usata come gating in tutte le RPC cg_*.';
