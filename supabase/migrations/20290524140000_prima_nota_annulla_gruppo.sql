-- Prima Nota: annullare in un colpo un movimento diviso (23/11/2026).
--
-- Un bonifico diviso sbagliato si toglieva quota per quota. Qui si annulla tutto insieme,
-- col motivo, ognuna con la strada che la toglierebbe da sola:
--   · collegata alla banca → prima si scollega (scollega_riga_ripartita: il movimento di banca
--     torna libero);
--   · incasso di una fattura fatta con l'app → storna_incasso_atomico (fattura e scadenza tornano
--     aperte);
--   · tutte le altre → prima_nota_elimina_registrazione (pagamenti dei costi, incassi delle
--     fatture importate, voci libere, stipendi).
-- Uno stipendio tolto riapre il cedolino che aveva segnato pagato. La testata resta, annullata,
-- col motivo. Solo chi può cancellare in Prima Nota (amministratore, commercialista, super admin).
SET LOCAL lock_timeout = '3s';
SET LOCAL statement_timeout = '60s';

ALTER TABLE public.prima_nota_gruppi ADD COLUMN IF NOT EXISTS annullato_il timestamptz;
ALTER TABLE public.prima_nota_gruppi ADD COLUMN IF NOT EXISTS annullato_da uuid;
ALTER TABLE public.prima_nota_gruppi ADD COLUMN IF NOT EXISTS annullato_motivo text;

CREATE OR REPLACE FUNCTION public.prima_nota_annulla_gruppo(p_gruppo uuid, p_motivo text)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
DECLARE g public.prima_nota_gruppi; e record; rec record; v_n integer := 0;
BEGIN
  SELECT * INTO g FROM public.prima_nota_gruppi WHERE id = p_gruppo FOR UPDATE;
  IF NOT FOUND OR auth.uid() IS NULL OR public.utente_bloccato() OR NOT (
       public.user_can_write_accountant_company(g.company_id)
    OR public.has_role(auth.uid(), 'super_admin'::app_role)
    OR (g.company_id = public.get_my_company_id() AND public.e_amministratore_di(g.company_id))) THEN
    RAISE EXCEPTION 'Solo un amministratore può annullare un movimento diviso' USING ERRCODE = '42501';
  END IF;
  IF g.annullato_il IS NOT NULL THEN RAISE EXCEPTION 'Il movimento è già stato annullato' USING ERRCODE = '22023'; END IF;
  IF nullif(btrim(coalesce(p_motivo, '')), '') IS NULL THEN RAISE EXCEPTION 'Scrivi perché lo annulli' USING ERRCODE = '22023'; END IF;

  FOR e IN SELECT * FROM public.prima_nota_entries WHERE gruppo_id = g.id AND company_id = g.company_id ORDER BY created_at DESC LOOP
    -- Prima la banca: il movimento torna libero, la riga resta e si toglie sotto.
    IF e.bank_transaction_id IS NOT NULL THEN
      FOR rec IN SELECT r.id FROM public.bank_reconciliations r
                  WHERE r.company_id = g.company_id AND r.transaction_id = e.bank_transaction_id AND r.unmatched_at IS NULL
                    AND (r.prima_nota_id = e.id OR (e.movimento_id IS NOT NULL AND r.movimento_id = e.movimento_id)) LOOP
        PERFORM public.scollega_riga_ripartita(rec.id);
      END LOOP;
      UPDATE public.prima_nota_entries SET bank_transaction_id = NULL WHERE id = e.id AND bank_transaction_id IS NOT NULL;
    END IF;
    IF e.movimento_id IS NOT NULL AND e.documento_fiscale_id IS NOT NULL THEN
      PERFORM public.storna_incasso_atomico(g.company_id, e.movimento_id);
    ELSIF EXISTS (SELECT 1 FROM public.prima_nota_entries WHERE id = e.id) THEN
      PERFORM public.prima_nota_elimina_registrazione(e.id, (SELECT updated_at FROM public.prima_nota_entries WHERE id = e.id));
    END IF;
    IF e.cedolino_id IS NOT NULL THEN
      UPDATE public.hr_cedolini SET data_pagamento = NULL, stato = 'emesso', updated_at = now()
       WHERE id = e.cedolino_id AND stato = 'pagato' AND data_pagamento = e.entry_date;
    END IF;
    v_n := v_n + 1;
  END LOOP;

  UPDATE public.prima_nota_gruppi SET annullato_il = now(), annullato_da = auth.uid(), annullato_motivo = btrim(p_motivo) WHERE id = g.id;
  RETURN v_n;
END $function$;
REVOKE ALL ON FUNCTION public.prima_nota_annulla_gruppo(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.prima_nota_annulla_gruppo(uuid, text) TO authenticated;
