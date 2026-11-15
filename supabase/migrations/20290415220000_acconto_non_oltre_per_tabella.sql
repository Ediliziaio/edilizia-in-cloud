-- Correzione del controllo «la somma dei recuperi non supera l'acconto» (15/11/2026).
--
-- In 20290415210000 la funzione del trigger leggeva `new.contratto_id` in un CASE: scattando su
-- contratti_subappalto (dove la colonna non c'è) andava in errore, e modificare l'acconto di un
-- contratto falliva. Ora il contratto si ricava con un IF per tabella. Provato su Demo 2 in una
-- transazione annullata subito dopo.

SET LOCAL lock_timeout = '3s';
SET LOCAL statement_timeout = '60s';

CREATE OR REPLACE FUNCTION public.subappalto_acconto_non_oltre()
RETURNS trigger LANGUAGE plpgsql SET search_path TO '' AS $$
DECLARE v_contratto uuid; v_acconto numeric; v_recuperato numeric; v_riga jsonb := to_jsonb(new);
BEGIN
  IF tg_table_name = 'sal_subappaltatori' THEN
    v_contratto := (v_riga ->> 'contratto_id')::uuid;
  ELSE
    v_contratto := (v_riga ->> 'id')::uuid;
  END IF;
  SELECT coalesce(c.acconto_importo, 0) INTO v_acconto FROM public.contratti_subappalto c WHERE c.id = v_contratto;
  SELECT coalesce(sum(s.acconto_recuperato), 0) INTO v_recuperato FROM public.sal_subappaltatori s
   WHERE s.contratto_id = v_contratto AND s.stato <> 'contestato';
  IF v_recuperato > coalesce(v_acconto, 0) + 0.01 THEN
    RAISE EXCEPTION 'I SAL recuperano % di acconto, più dell''acconto del contratto (%).', v_recuperato, coalesce(v_acconto, 0) USING errcode = '23514';
  END IF;
  RETURN NULL;
END $$;
REVOKE ALL ON FUNCTION public.subappalto_acconto_non_oltre() FROM PUBLIC, anon, authenticated;
