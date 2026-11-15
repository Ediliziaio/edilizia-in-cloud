-- Indici avanzati: DSO e DPO con grandezze omogenee rispetto all'IVA (15/11/2026)
--
-- I crediti verso clienti e i debiti verso fornitori dello Stato patrimoniale
-- sono IVA compresa (art. 2424 c.c.), i ricavi e gli acquisti del conto
-- economico no. Dividere gli uni per gli altri gonfiava i giorni di incasso e
-- di pagamento della quota IVA (fino al 22%). La prassi dell'analisi di
-- bilancio confronta grandezze omogenee: crediti / ricavi IVA compresa,
-- debiti / acquisti IVA compresa.
--  - ricavi IVA compresa: imponibile + IVA delle stesse fatture del CE
--    (v_cg_ricavi_classificati);
--  - acquisti IVA compresa: acquisti del CE per il rapporto IVA/imponibile
--    delle fatture ricevute registrate dell'anno (il reverse charge, senza IVA
--    in fattura, resta senza IVA come il suo debito).
-- La funzione restituisce anche ricavi_iva_compresa e acquisti_iva_compresa:
-- la pagina ricalcola gli indici con quelli.

do $p$
declare
  vecchio text := pg_get_functiondef('public.cg_get_indici_avanzati'::regproc);
  nuovo text := vecchio;
  prima text[] := array[
    $a$  v_motivi jsonb := '[]'::jsonb;
BEGIN$a$,
    $a$  v_acquisti_servizi := COALESCE(v_acquisti, 0) + COALESCE(v_servizi, 0) + COALESCE(v_comm, 0) + COALESCE(v_amm_costi, 0);$a$,
    $a$THEN v_crediti / v_ricavi * v_giorni END;$a$,
    $a$                THEN v_debiti_forn / v_acquisti_servizi * v_giorni END;$a$,
    $a$      'acquisti',         v_acquisti_servizi,$a$];
  dopo text[] := array[
    $b$  v_motivi jsonb := '[]'::jsonb;
  v_ricavi_lordi numeric;
  v_acq_lordi numeric;
BEGIN$b$,
    $b$  v_acquisti_servizi := COALESCE(v_acquisti, 0) + COALESCE(v_servizi, 0) + COALESCE(v_comm, 0) + COALESCE(v_amm_costi, 0);

  -- Crediti e debiti sono IVA compresa: anche ricavi e acquisti, per confrontarli.
  SELECT v_ricavi + COALESCE(sum(r.iva_amount), 0) INTO v_ricavi_lordi
    FROM public.v_cg_ricavi_classificati r
   WHERE r.company_id = v_company_id AND r.anno = p_anno;
  SELECT v_acquisti_servizi * (1 + COALESCE(sum(f.iva_totale) / NULLIF(sum(f.imponibile_totale), 0), 0)) INTO v_acq_lordi
    FROM public.fatture_ricevute f
   WHERE f.company_id = v_company_id AND f.company_cost_id IS NOT NULL
     AND extract(year FROM f.data_fattura) = p_anno
     AND COALESCE(f.imponibile_totale, 0) > 0;
  v_ricavi_lordi := COALESCE(v_ricavi_lordi, v_ricavi);
  v_acq_lordi := COALESCE(v_acq_lordi, v_acquisti_servizi);$b$,
    $b$THEN v_crediti / v_ricavi_lordi * v_giorni END;$b$,
    $b$                THEN v_debiti_forn / v_acq_lordi * v_giorni END;$b$,
    $b$      'acquisti',         v_acquisti_servizi,
      'ricavi_iva_compresa',   round(v_ricavi_lordi, 2),
      'acquisti_iva_compresa', round(v_acq_lordi, 2),$b$];
  i integer;
begin
  if position('v_ricavi_lordi' in nuovo) > 0 then
    return;
  end if;
  for i in 1 .. array_length(prima, 1) loop
    if position(prima[i] in nuovo) = 0 then
      raise exception 'Indici avanzati: blocco % non trovato, la funzione è cambiata', i;
    end if;
    nuovo := replace(nuovo, prima[i], dopo[i]);
  end loop;
  execute nuovo;
end $p$;
