-- Preferenze per-azienda di VISIBILITÀ dei moduli preventivo verticali.
--
-- Layer SEPARATO dall'entitlement (`company_feature_overrides`): qui l'azienda
-- decide soltanto se MOSTRARE un modulo a cui ha già accesso, NON se ha
-- l'accesso. Riga assente o visibile=true => modulo mostrato; visibile=false =>
-- nascosto dal menu "Nuovo preventivo" e dal catalogo Moduli (il modulo resta
-- comunque raggiungibile via URL diretto: è una preferenza cosmetica, non un gate).
--
-- Sicurezza: i membri dell'azienda possono scrivere SOLO le preferenze della
-- propria company. Non c'è rischio di privilege-escalation perché questa tabella
-- non concede entitlement (quello resta su company_feature_overrides, scrivibile
-- solo dal super_admin).

CREATE TABLE IF NOT EXISTS public.company_modulo_preferenze (
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  modulo_slug text NOT NULL,
  visibile boolean NOT NULL DEFAULT true,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  PRIMARY KEY (company_id, modulo_slug)
);

ALTER TABLE public.company_modulo_preferenze ENABLE ROW LEVEL SECURITY;

-- Super admin: pieno accesso.
DROP POLICY IF EXISTS "cmp super admin all" ON public.company_modulo_preferenze;
CREATE POLICY "cmp super admin all" ON public.company_modulo_preferenze
  FOR ALL
  USING (has_role(auth.uid(), 'super_admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'super_admin'::app_role));

-- Membri della company: leggono e scrivono solo le preferenze della PROPRIA azienda.
DROP POLICY IF EXISTS "cmp company members" ON public.company_modulo_preferenze;
CREATE POLICY "cmp company members" ON public.company_modulo_preferenze
  FOR ALL
  TO authenticated
  USING (company_id = get_user_company_id(auth.uid()))
  WITH CHECK (company_id = get_user_company_id(auth.uid()));
