-- Controllo di Gestione · IRAP: il costo del personale a tempo indeterminato
-- è deducibile (L. 190/2014, dal 2015).
--
-- Cosa non andava: la base IRAP era EBIT + TUTTO il costo del personale,
-- perché l'opzione base_irap_include_personale valeva «sì» per default (nella
-- tabella e, se l'azienda non aveva salvato aliquote, nel calcolo). Su Demo 2
-- 2026: base 1.408.713,80 €, IRAP 54.939 € invece di circa 17.950 €, tax rate
-- effettivo 36,2% invece di circa 28%. La stessa stima entra nel Conto
-- economico (voce 15), nell'utile, nel DSCR, nel piano e nella riconciliazione.
--
-- Ora il default è «escluso»: base IRAP = EBIT. L'azienda che ha molto
-- personale a tempo determinato o collaboratori (non deducibili) può
-- riaccendere l'opzione in Configurazione → Aliquote. L'aliquota IRAP regionale
-- resta irap_pct, modificabile per azienda.
--
-- Nessuna azienda aveva aliquote salvate (al 22/10/2026 la tabella è vuota:
-- il salvataggio falliva per company_id mancante), quindi cambiare il default
-- non tocca scelte fatte da qualcuno.
--
-- Ipotesi di stima: la base IRAP vera è il valore della produzione netta;
-- EBIT (+ personale non deducibile) ne è un'approssimazione gestionale.

SET LOCAL lock_timeout = '3s';
SET LOCAL statement_timeout = '60s';

ALTER TABLE public.cg_aliquote_imposte
  ALTER COLUMN base_irap_include_personale SET DEFAULT false;

COMMENT ON COLUMN public.cg_aliquote_imposte.base_irap_include_personale IS
  'Se true il costo del personale entra nella base IRAP (solo per chi ha soprattutto personale non deducibile: tempo determinato, collaboratori). Default false: il tempo indeterminato è deducibile (L. 190/2014).';

-- Conto economico riclassificato: si cambia SOLO il default dell'opzione,
-- senza riscrivere il resto della funzione (che altri interventi possono aver
-- modificato). Se il testo atteso non c'è più e la correzione non risulta già
-- fatta, la migrazione si ferma invece di passare in silenzio.
DO $$
DECLARE
  v_def text;
  v_old text := 'v_irap_personale:=COALESCE(v_irap_personale,true)';
  v_new text := 'v_irap_personale:=COALESCE(v_irap_personale,false)';
BEGIN
  v_def := pg_get_functiondef('public.cg_get_conto_economico_riclassificato(uuid,integer,integer,integer,text)'::regprocedure);
  IF position(v_new IN v_def) > 0 THEN
    RETURN; -- già corretta
  END IF;
  IF position(v_old IN v_def) = 0 THEN
    RAISE EXCEPTION 'cg_get_conto_economico_riclassificato: default IRAP non riconosciuto, correggere a mano';
  END IF;
  EXECUTE replace(v_def, v_old, v_new);
END $$;

-- Stessa correzione nel dettaglio imposte (scheda Indici avanzati).
DO $$
DECLARE
  v_def text;
  v_old text := 'v_base_irap_inc_pers:=COALESCE(v_base_irap_inc_pers,true)';
  v_new text := 'v_base_irap_inc_pers:=COALESCE(v_base_irap_inc_pers,false)';
BEGIN
  v_def := pg_get_functiondef('public.cg_get_imposte_dettaglio(uuid,integer)'::regprocedure);
  IF position(v_new IN v_def) > 0 THEN
    RETURN;
  END IF;
  IF position(v_old IN v_def) = 0 THEN
    RAISE EXCEPTION 'cg_get_imposte_dettaglio: default IRAP non riconosciuto, correggere a mano';
  END IF;
  EXECUTE replace(v_def, v_old, v_new);
END $$;
