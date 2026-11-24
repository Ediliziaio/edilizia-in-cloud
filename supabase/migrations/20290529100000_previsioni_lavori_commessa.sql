-- Previsione dei lavori dalla pianta salvata con la commessa (24/11/2026).
--
-- La previsione della variante (lib/planimetrie/previsioneLavori.ts: costo per fase con
-- manodopera e materiali, costi in più accesi, giorni di squadra e di attesa) si ricalcola
-- a ogni modifica della pianta: per confrontarla col consuntivo a commessa chiusa ne serve
-- una copia ferma. Una riga per salvataggio, mai riscritta: l'ultima è quella che vale, le
-- precedenti dicono come è cambiata la previsione.
--
-- Sono costi: si leggono e si scrivono solo con il permesso sui costi (puo_vedere_costi).
-- Il backup la prende da sé (company_id); la purga la cancella con la commessa (cascade).

CREATE TABLE IF NOT EXISTS public.commessa_previsioni_lavori (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  order_id uuid NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  planimetria_id uuid REFERENCES public.planimetrie(id) ON DELETE SET NULL,
  versione integer,
  variante_id text,
  variante_nome text,
  -- La previsione intera, come la restituisce previsioneLavori(): fasi, extra, intervallo, voci fuori.
  previsione jsonb NOT NULL,
  extra_accesi text[] NOT NULL DEFAULT '{}',
  totale numeric(14,2) NOT NULL,
  giorni_lavoro numeric(8,1) NOT NULL,
  giorni_calendario integer NOT NULL,
  -- Le regole che l'hanno prodotta: quando cambiano le rese, le previsioni vecchie restano leggibili.
  versione_regole text NOT NULL,
  salvata_da uuid REFERENCES auth.users(id) ON DELETE SET NULL DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT commessa_previsioni_lavori_fasi CHECK (jsonb_typeof(previsione -> 'fasi') = 'array')
);

CREATE INDEX IF NOT EXISTS commessa_previsioni_lavori_ordine
  ON public.commessa_previsioni_lavori (order_id, created_at DESC);
CREATE INDEX IF NOT EXISTS commessa_previsioni_lavori_azienda
  ON public.commessa_previsioni_lavori (company_id);

-- La commessa deve essere della stessa azienda della riga.
CREATE OR REPLACE FUNCTION public.commessa_previsioni_lavori_coerente()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.orders o WHERE o.id = NEW.order_id AND o.company_id = NEW.company_id) THEN
    RAISE EXCEPTION 'La commessa non è di questa azienda' USING ERRCODE = '42501';
  END IF;
  IF NEW.planimetria_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.planimetrie p WHERE p.id = NEW.planimetria_id AND p.company_id = NEW.company_id
  ) THEN
    RAISE EXCEPTION 'La planimetria non è di questa azienda' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.commessa_previsioni_lavori_coerente() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS commessa_previsioni_lavori_coerente ON public.commessa_previsioni_lavori;
CREATE TRIGGER commessa_previsioni_lavori_coerente
  BEFORE INSERT OR UPDATE ON public.commessa_previsioni_lavori
  FOR EACH ROW EXECUTE FUNCTION public.commessa_previsioni_lavori_coerente();

ALTER TABLE public.commessa_previsioni_lavori ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.commessa_previsioni_lavori FROM PUBLIC, anon;
GRANT SELECT, INSERT, DELETE ON public.commessa_previsioni_lavori TO authenticated;
GRANT ALL ON public.commessa_previsioni_lavori TO service_role;

DROP POLICY IF EXISTS blocco_utente_bloccato ON public.commessa_previsioni_lavori;
CREATE POLICY blocco_utente_bloccato ON public.commessa_previsioni_lavori AS RESTRICTIVE FOR ALL TO authenticated
  USING (NOT (SELECT public.utente_bloccato())) WITH CHECK (NOT (SELECT public.utente_bloccato()));

DROP POLICY IF EXISTS previsioni_lavori_legge ON public.commessa_previsioni_lavori;
CREATE POLICY previsioni_lavori_legge ON public.commessa_previsioni_lavori FOR SELECT TO authenticated
  USING (
    company_id IN (SELECT p.company_id FROM public.profiles p WHERE p.id = (SELECT auth.uid()))
    AND NOT (SELECT public.utente_e_cliente_esterno())
    AND public.puo_vedere_costi(company_id)
  );

DROP POLICY IF EXISTS previsioni_lavori_crea ON public.commessa_previsioni_lavori;
CREATE POLICY previsioni_lavori_crea ON public.commessa_previsioni_lavori FOR INSERT TO authenticated
  WITH CHECK (
    company_id IN (SELECT p.company_id FROM public.profiles p WHERE p.id = (SELECT auth.uid()))
    AND NOT (SELECT public.utente_e_cliente_esterno())
    AND NOT public.utente_sola_lettura(company_id)
    AND public.puo_vedere_costi(company_id)
    AND salvata_da = (SELECT auth.uid())
  );

-- Solo chi l'ha salvata la può togliere (una previsione salvata per sbaglio).
DROP POLICY IF EXISTS previsioni_lavori_toglie ON public.commessa_previsioni_lavori;
CREATE POLICY previsioni_lavori_toglie ON public.commessa_previsioni_lavori FOR DELETE TO authenticated
  USING (
    company_id IN (SELECT p.company_id FROM public.profiles p WHERE p.id = (SELECT auth.uid()))
    AND NOT public.utente_sola_lettura(company_id)
    AND salvata_da = (SELECT auth.uid())
  );
