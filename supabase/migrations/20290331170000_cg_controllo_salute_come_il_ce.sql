-- Controllo salute del CdG: conta come il conto economico (15/11/2026)
--
-- Il controllo salute diceva «buste paga caricate: 11 mesi su 11» con ottobre,
-- novembre e dicembre in bozza: il conto economico le bozze non le conta, e il
-- personale di quei mesi è a zero. E contava i mesi con costi e i costi senza
-- categoria per data di pagamento o di scadenza, mentre il conto economico li
-- mette nel mese di competenza (data del documento, della fattura): un costo
-- di ottobre pagato a dicembre risultava «presente» nel mese sbagliato.
--
-- Adesso:
--  - mesi con buste paga: solo cedolini emessi o pagati, come il CE;
--  - mesi con costi: dalla stessa vista del CE (v_cg_costi_classificati,
--    tutte le fonti, mese di competenza);
--  - costi senza categoria: anno di competenza, come il CE.

do $p$
declare
  vecchio text := pg_get_functiondef('public.cg_get_health_check'::regproc);
  nuovo text := vecchio;
  prima text[] := array[
    $a$  SELECT count(DISTINCT mese) INTO v_n_mesi_cedolini FROM public.cedolini
   WHERE company_id = v_company_id AND anno = p_anno AND mese <= v_ultimo_mese;$a$,
    $a$  SELECT count(DISTINCT extract(month FROM COALESCE(cc.paid_date, cc.due_date)))::int
    INTO v_n_mesi_movimenti
  FROM public.company_costs cc
  WHERE cc.company_id = v_company_id
    AND extract(year FROM COALESCE(cc.paid_date, cc.due_date))::int = p_anno
    AND extract(month FROM COALESCE(cc.paid_date, cc.due_date))::int <= v_ultimo_mese;$a$,
    $a$    AND extract(year FROM COALESCE(cc.paid_date, cc.due_date))::int = p_anno
    AND (cc.category IS NULL OR cc.category = '');$a$];
  dopo text[] := array[
    $b$  -- Come il conto economico: le bozze non contano.
  SELECT count(DISTINCT mese) INTO v_n_mesi_cedolini FROM public.cedolini
   WHERE company_id = v_company_id AND anno = p_anno AND mese <= v_ultimo_mese
     AND stato IN ('emesso', 'pagato');$b$,
    $b$  -- Dalla stessa vista del conto economico: tutte le fonti, mese di competenza.
  SELECT count(DISTINCT v.mese)::int
    INTO v_n_mesi_movimenti
  FROM public.v_cg_costi_classificati v
  WHERE v.company_id = v_company_id
    AND v.anno = p_anno
    AND v.mese <= v_ultimo_mese;$b$,
    $b$    AND extract(year FROM COALESCE(cc.mese_competenza, cc.documento_data, cc.due_date, cc.paid_date))::int = p_anno
    AND (cc.category IS NULL OR cc.category = '');$b$];
  i integer;
begin
  if position('v_cg_costi_classificati v' in nuovo) > 0 then
    return;
  end if;
  for i in 1 .. array_length(prima, 1) loop
    if position(prima[i] in nuovo) = 0 then
      raise exception 'Controllo salute: blocco % non trovato, la funzione è cambiata', i;
    end if;
    nuovo := replace(nuovo, prima[i], dopo[i]);
  end loop;
  execute nuovo;
end $p$;
