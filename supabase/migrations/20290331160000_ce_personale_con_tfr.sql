-- Conto economico: il costo del personale comprende il TFR maturato (15/11/2026)
--
-- Con i cedolini caricati il costo del personale era lordo + contributi a
-- carico dell'azienda. Mancava il trattamento di fine rapporto, che per legge
-- è un costo dell'esercizio in cui matura (art. 2425 c.c., voce B9c; OIC 31),
-- anche se si paga alla fine del rapporto o va a un fondo pensione.
-- La quota dell'anno è la retribuzione divisa per 13,5 (art. 2120 c.c.); lo
-- 0,50% per il fondo di garanzia INPS è già nei contributi. I cedolini non
-- hanno un campo TFR: si calcola sul lordo. La rivalutazione del fondo non è
-- considerata.
-- Cambiano insieme il conto economico (e quindi mensile, confronto, Stato
-- patrimoniale, pareggio, che lo leggono) e il dettaglio della voce 06, che
-- deve sommare allo stesso numero.

do $p$
declare
  ce_vecchio text := pg_get_functiondef('public.cg_get_conto_economico_riclassificato'::regproc);
  ce_nuovo text;
  dt_vecchio text := pg_get_functiondef('public.cg_get_dettaglio_voce_mese'::regproc);
  dt_nuovo text;
begin
  if position('/ 13.5' in ce_vecchio) = 0 then
    ce_nuovo := replace(ce_vecchio,
      $a$SELECT COALESCE(sum(COALESCE(lordo, 0) + COALESCE(contributi_datore, 0)), 0) INTO v_costo_pers_cedolini$a$,
      $b$-- Lordo + contributi dell'azienda + TFR maturato (lordo / 13,5, art. 2120 c.c.).
    SELECT COALESCE(sum(COALESCE(lordo, 0) + COALESCE(contributi_datore, 0) + round(COALESCE(lordo, 0) / 13.5, 2)), 0) INTO v_costo_pers_cedolini$b$);
    if ce_nuovo = ce_vecchio then
      raise exception 'Conto economico: blocco del costo dai cedolini non trovato, la funzione è cambiata';
    end if;
    execute ce_nuovo;
  end if;

  if position('/ 13.5' in dt_vecchio) = 0 then
    dt_nuovo := replace(dt_vecchio,
      $a$COALESCE(cd.lordo, 0) + COALESCE(cd.contributi_datore, 0)$a$,
      $b$COALESCE(cd.lordo, 0) + COALESCE(cd.contributi_datore, 0) + round(COALESCE(cd.lordo, 0) / 13.5, 2)$b$);
    dt_nuovo := replace(dt_nuovo, $a$'voce_chiave', 'lordo+contr_datore'$a$, $b$'voce_chiave', 'lordo+contr_datore+tfr'$b$);
    if (length(dt_nuovo) - length(replace(dt_nuovo, '/ 13.5', ''))) / length('/ 13.5') <> 3 then
      raise exception 'Dettaglio voce: blocchi del costo dai cedolini non trovati, la funzione è cambiata';
    end if;
    execute dt_nuovo;
  end if;
end $p$;
