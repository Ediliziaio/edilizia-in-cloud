-- Scollegare un bonifico parlante storna anche la sua ritenuta, e si può riabbinare (revisione del
-- 01/11/2026 sul lotto 2 di docs/piano-costi-commessa.md).
--
-- Prima: riconcilia_bonifico_parlante registra l'incasso lordo con la ritenuta (ritenute_bonifici).
-- «Scollega» passava da storna_incasso_atomico, che il trigger proteggi_incasso_parlante rifiuta finché la
-- ritenuta è attiva: lo scollegamento si fermava con un errore. E la richiesta era md5(movimento): anche
-- stornata la ritenuta, riabbinare lo stesso movimento trovava la richiesta vecchia e veniva rifiutato.
--
-- Ora:
--   · scollega_bonifico_fattura, per match_type 'bonifico_parlante', storna la ritenuta dal registro con
--     aggiorna_ritenuta_bonifico (che storna anche l'incasso e ricalcola il pagato della fattura); serve
--     chi può fare scritture fiscali, come per registrarla;
--   · riconcilia_bonifico_parlante usa una richiesta per ogni abbinamento dello stesso movimento.

set local lock_timeout = '3s';
set local statement_timeout = '60s';

create or replace function public.scollega_bonifico_fattura(p_reconciliation_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
DECLARE
  rc record;
  rb record;
BEGIN
  SELECT id, company_id, transaction_id, movimento_id, unmatched_at, match_type INTO rc
    FROM public.bank_reconciliations WHERE id = p_reconciliation_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Riconciliazione non trovata' USING ERRCODE = 'P0002';
  END IF;
  IF auth.uid() IS NOT NULL AND public.user_can_access_company(rc.company_id) IS NOT TRUE THEN
    RAISE EXCEPTION 'Accesso negato' USING ERRCODE = '42501';
  END IF;
  IF rc.unmatched_at IS NOT NULL THEN RETURN; END IF;
  IF rc.match_type = 'incasso_esistente' THEN
    IF auth.uid() IS NOT NULL AND NOT public.puo_incassare_fatture(rc.company_id) THEN
      RAISE EXCEPTION 'Non hai il permesso di modificare gli incassi.' USING ERRCODE = '42501';
    END IF;
    UPDATE public.prima_nota_entries SET bank_transaction_id = NULL
     WHERE movimento_id = rc.movimento_id AND bank_transaction_id = rc.transaction_id;
  ELSIF rc.match_type = 'bonifico_parlante' THEN
    -- La ritenuta subita e l'incasso lordo si stornano insieme, dal registro.
    SELECT id, revisione, stato INTO rb FROM public.ritenute_bonifici
     WHERE company_id = rc.company_id AND movimento_id = rc.movimento_id;
    IF rb.id IS NOT NULL AND rb.stato <> 'stornata' THEN
      PERFORM public.aggiorna_ritenuta_bonifico(rc.company_id, rb.id, rb.revisione, 'storna',
        'Scollegato dal movimento bancario ' || rc.transaction_id::text);
    END IF;
  ELSIF rc.movimento_id IS NOT NULL
     AND EXISTS (SELECT 1 FROM public.movimenti_cassa_native WHERE id = rc.movimento_id) THEN
    PERFORM public.storna_incasso_atomico(rc.company_id, rc.movimento_id);
  END IF;
  UPDATE public.bank_transactions
     SET linked_scadenza_id = NULL, reconciliation_status = 'pending', reconciled_at = NULL
   WHERE id = rc.transaction_id;
  UPDATE public.bank_reconciliations SET unmatched_at = now()
   WHERE id = rc.id AND unmatched_at IS NULL;
END;
$$;

-- Una richiesta per ogni abbinamento: contano anche quelli già scollegati.
do $$
declare
  v_def text := pg_get_functiondef('public.riconcilia_bonifico_parlante(uuid, uuid)'::regprocedure);
  v_nuova text;
begin
  v_nuova := replace(v_def,
    $q$v_richiesta := md5('bonifico-parlante:' || t.id::text)::uuid;$q$,
    $q$v_richiesta := md5('bonifico-parlante:' || t.id::text || ':' ||
                    (select count(*) from public.bank_reconciliations r where r.transaction_id = t.id)::text)::uuid;$q$);
  if v_nuova = v_def and position('from public.bank_reconciliations r where r.transaction_id = t.id)::text' in v_def) = 0 then
    raise exception 'riconcilia_bonifico_parlante: richiesta non trovata';
  end if;
  execute v_nuova;
end $$;
