SET LOCAL lock_timeout='3s';
SET LOCAL statement_timeout='30s';
-- Nullable avoids inferring when old invoices were actually opened, and requires no backfill.
ALTER TABLE public.fatture_ricevute ADD COLUMN IF NOT EXISTS da_leggere boolean;
COMMENT ON COLUMN public.fatture_ricevute.da_leggere IS 'Lettura condivisa, indipendente dalla contabilizzazione. NULL usa lo stato storico; apertura=false, segna manualmente come non letta=true.';
GRANT SELECT(da_leggere),UPDATE(da_leggere) ON public.fatture_ricevute TO authenticated;
CREATE OR REPLACE FUNCTION public.fattura_ricevuta_lettura(p_company uuid,p_fattura uuid,p_da_leggere boolean)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE result jsonb;
BEGIN
 IF auth.uid() IS NULL OR public.utente_bloccato() OR p_da_leggere IS NULL THEN RAISE EXCEPTION 'Lettura non autorizzata' USING ERRCODE='42501';END IF;
 -- RLS checks the real caller; the CASE uses the locked, current row, not a stale browser snapshot.
 UPDATE public.fatture_ricevute f SET da_leggere=p_da_leggere,
  stato=CASE WHEN f.stato IN('non_letta','letta') THEN CASE WHEN p_da_leggere THEN 'non_letta' ELSE 'letta' END ELSE f.stato END
 WHERE f.id=p_fattura AND f.company_id=p_company
 RETURNING jsonb_build_object('id',f.id,'stato',f.stato,'da_leggere',f.da_leggere) INTO result;
 IF result IS NULL THEN RAISE EXCEPTION 'Fattura non disponibile o permessi insufficienti' USING ERRCODE='42501';END IF;
 RETURN result;
END $$;
REVOKE ALL ON FUNCTION public.fattura_ricevuta_lettura(uuid,uuid,boolean) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.fattura_ricevuta_lettura(uuid,uuid,boolean) TO authenticated;
NOTIFY pgrst,'reload schema';
