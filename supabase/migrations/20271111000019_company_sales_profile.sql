-- Profilo vendita azienda: le risposte alle domande strategiche (cosa fai, USP,
-- prove, offerta, obiezioni, voce, vietati) salvate UNA volta per azienda e
-- riusate dall'AI in ogni modulo per generare i testi dei template preventivo.
--
-- Additive + idempotente. Company-scoped via RLS (get_effective_company_id),
-- come le altre tabelle per-azienda (es. fv_progetti, silvio_task).

CREATE TABLE IF NOT EXISTS public.company_sales_profile (
  company_id    uuid PRIMARY KEY REFERENCES public.companies(id) ON DELETE CASCADE,
  attivita      text,   -- cosa fa, da quanto, in che zona
  cliente_tipo  text DEFAULT 'privato',  -- privato | condominio | azienda (default)
  problema      text,   -- il problema/paura tipica del cliente
  usp           text,   -- cosa lo differenzia (offerta unica)
  prove         text,   -- fatti veri: numeri, certificazioni, garanzie
  offerta       text,   -- cosa e' incluso + condizioni (finanziamento/bonus)
  obiezioni     text,   -- le 3 domande frequenti prima di firmare
  voce          text,   -- tono di voce (es. "diretto, dai del tu")
  vietati       text,   -- claim/parole da non usare mai
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.company_sales_profile IS
  'Profilo vendita per-azienda: input strategico riusato dall''AI per generare i testi dei template preventivo.';

ALTER TABLE public.company_sales_profile ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS company_sales_profile_company ON public.company_sales_profile;
CREATE POLICY company_sales_profile_company ON public.company_sales_profile
  FOR ALL TO authenticated
  USING (company_id = public.get_effective_company_id())
  WITH CHECK (company_id = public.get_effective_company_id());

DROP POLICY IF EXISTS company_sales_profile_service ON public.company_sales_profile;
CREATE POLICY company_sales_profile_service ON public.company_sales_profile
  FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS company_sales_profile_super ON public.company_sales_profile;
CREATE POLICY company_sales_profile_super ON public.company_sales_profile
  FOR ALL TO authenticated USING (public.is_super_admin(auth.uid()));
