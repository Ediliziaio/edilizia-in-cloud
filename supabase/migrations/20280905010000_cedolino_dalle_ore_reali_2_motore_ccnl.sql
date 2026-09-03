-- ════════════════════════════════════════════════════════════════════════════
-- Ondata 5.1 — parte 2 di 3: il motore CCNL, sul server
-- ════════════════════════════════════════════════════════════════════════════
--
-- Fino a oggi viveva dentro `generate-cedolino-pdf`, cioè dentro la stampante:
-- una funzione TypeScript che ricalcolava contributi e IRPEF ogni volta che
-- qualcuno apriva il PDF, partendo da `cedolino.lordo ?? 0`. Se la riga in
-- tabella era vuota stampava un cedolino di zeri con contributi calcolati su
-- zero, e aveva l'aria di un documento vero.
--
-- Due errori che quella copia si portava dietro, e che qui non ripeto:
--   • usa quattro scaglioni IRPEF (15k/28k/50k) chiamandoli «2024». Quello è lo
--     schema fino al 2023. Dal 2024 i primi due sono accorpati: 23% fino a
--     28.000, 35% fino a 50.000, 43% oltre.
--   • alla detrazione art. 13 TUIR per la fascia 15.000–28.000 manca il termine
--     + 1.190 × (28.000 − reddito)/13.000.
--
-- Sulla progressività: l'aliquota si determina sul reddito ANNUO da contratto,
-- non sul mese moltiplicato per dodici. Altrimenti un mese con venti ore di
-- straordinario fa saltare uno scaglione e il netto di quel mese risulta più
-- basso del dovuto.
--
-- Questo resta un calcolo di BOZZA. hr_cedolini ha una colonna
-- consulente_reviewed_at: serve a qualcosa. Le ipotesi sono scritte nella
-- risposta, non nascoste.

CREATE OR REPLACE FUNCTION public.cedolino_calcola_base(
  p_employee_id uuid, p_anno integer, p_mese integer
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  -- Aliquote CCNL Edilizia Industria
  k_inps_dip    constant numeric := 0.0919;
  k_inps_dat    constant numeric := 0.2870;
  k_inail_dat   constant numeric := 0.0380;
  k_ce_dip      constant numeric := 0.0040;
  k_ce_dat      constant numeric := 0.0165;
  k_cometa_dat  constant numeric := 0.0020;
  v_emp record; v_ore jsonb; v_avvisi jsonb := '[]'::jsonb;
  v_paga_oraria numeric; v_ore_ord numeric; v_ore_ass numeric; v_ore_mancanti numeric;
  v_lordo_strd numeric; v_lordo numeric; v_contr_dip numeric; v_contr_dat numeric;
  v_imponibile numeric; v_imp_annuo numeric; v_irpef_lorda numeric; v_detrazione numeric;
  v_irpef_annua numeric; v_aliquota numeric; v_irpef_mese numeric;
BEGIN
  SELECT e.id, e.company_id, e.first_name, e.last_name, e.gross_salary,
         e.monthly_hours, e.is_active
    INTO v_emp FROM public.employees e WHERE e.id = p_employee_id;
  IF v_emp.id IS NULL THEN RAISE EXCEPTION 'dipendente non trovato' USING ERRCODE='P0002'; END IF;
  IF public.cedolino_visibile_a_chi_chiede(p_employee_id) IS NOT TRUE THEN
    RAISE EXCEPTION 'Accesso negato' USING ERRCODE='42501';
  END IF;

  -- Senza retribuzione o senza ore contrattuali non c'è cedolino. Si dice
  -- quale dato manca, invece di stampare zeri.
  IF v_emp.gross_salary IS NULL OR v_emp.gross_salary <= 0 THEN
    RETURN jsonb_build_object('calcolabile', false,
      'motivo', format('%s %s non ha una retribuzione lorda mensile in anagrafica',
                       v_emp.first_name, v_emp.last_name),
      'dato_mancante', 'employees.gross_salary',
      'employee_id', p_employee_id, 'anno', p_anno, 'mese', p_mese);
  END IF;
  IF v_emp.monthly_hours IS NULL OR v_emp.monthly_hours <= 0 THEN
    RETURN jsonb_build_object('calcolabile', false,
      'motivo', format('%s %s non ha le ore mensili contrattuali in anagrafica',
                       v_emp.first_name, v_emp.last_name),
      'dato_mancante', 'employees.monthly_hours',
      'employee_id', p_employee_id, 'anno', p_anno, 'mese', p_mese);
  END IF;

  v_ore := public.cedolino_ore_periodo(p_employee_id, p_anno, p_mese);
  IF (v_ore ->> 'calcolabile') <> 'true' THEN RETURN v_ore; END IF;

  v_paga_oraria := v_emp.gross_salary / v_emp.monthly_hours;
  v_ore_ord := (v_ore ->> 'ore_ordinarie')::numeric;
  v_ore_ass := (v_ore ->> 'ore_assenza_giustificate')::numeric;

  -- Retribuzione mensilizzata: si parte dal lordo di contratto e si trattengono
  -- le ore non lavorate e non giustificate.
  v_ore_mancanti := greatest(v_emp.monthly_hours - v_ore_ord - v_ore_ass, 0);
  v_lordo_strd :=
      (v_ore ->> 'ore_straordinario_25')::numeric  * v_paga_oraria * 1.25
    + (v_ore ->> 'ore_straordinario_50')::numeric  * v_paga_oraria * 1.50
    + (v_ore ->> 'ore_straordinario_100')::numeric * v_paga_oraria * 2.00;
  v_lordo := round(v_emp.gross_salary - v_ore_mancanti * v_paga_oraria + v_lordo_strd, 2);

  -- Avvisi: cose che un umano deve guardare prima di pagare.
  IF jsonb_array_length(v_ore -> 'anomalie') > 0 THEN
    v_avvisi := v_avvisi || jsonb_build_object('tipo','timbrature_incomplete',
      'testo', format('%s giornate hanno timbrature spaiate e non sono state conteggiate',
                      jsonb_array_length(v_ore -> 'anomalie')),
      'dettaglio', v_ore -> 'anomalie');
  END IF;
  IF v_ore_ord + v_ore_ass = 0 THEN
    v_avvisi := v_avvisi || jsonb_build_object('tipo','nessuna_ora',
      'testo','nessuna ora lavorata né assenza approvata nel periodo: il lordo risulta azzerato dalle trattenute');
  ELSIF v_ore_ord + v_ore_ass < v_emp.monthly_hours * 0.5 THEN
    v_avvisi := v_avvisi || jsonb_build_object('tipo','ore_sotto_meta',
      'testo', format('ore retribuite (%s) sotto la metà delle ore contrattuali (%s)',
                      round(v_ore_ord + v_ore_ass, 2), v_emp.monthly_hours));
  END IF;
  IF v_emp.is_active IS NOT TRUE THEN
    v_avvisi := v_avvisi || jsonb_build_object('tipo','dipendente_non_attivo',
      'testo','il dipendente non risulta attivo in anagrafica');
  END IF;

  v_contr_dip := round(v_lordo * (k_inps_dip + k_ce_dip), 2);
  v_contr_dat := round(v_lordo * (k_inps_dat + k_inail_dat + k_ce_dat + k_cometa_dat), 2);
  v_imponibile := v_lordo - v_contr_dip;

  -- Aliquota sul reddito annuo DA CONTRATTO: uno straordinario del mese non
  -- deve far cambiare scaglione.
  v_imp_annuo := (v_emp.gross_salary * 12) * (1 - k_inps_dip - k_ce_dip);

  IF    v_imp_annuo <= 28000 THEN v_irpef_lorda := v_imp_annuo * 0.23;
  ELSIF v_imp_annuo <= 50000 THEN v_irpef_lorda := 6440 + (v_imp_annuo - 28000) * 0.35;
  ELSE                            v_irpef_lorda := 14140 + (v_imp_annuo - 50000) * 0.43;
  END IF;
  IF    v_imp_annuo <= 15000 THEN v_detrazione := 1955;
  ELSIF v_imp_annuo <= 28000 THEN v_detrazione := 1910 + 1190 * ((28000 - v_imp_annuo) / 13000);
  ELSIF v_imp_annuo <= 50000 THEN v_detrazione := 1910 * ((50000 - v_imp_annuo) / 22000);
  ELSE                            v_detrazione := 0;
  END IF;
  v_irpef_annua := greatest(v_irpef_lorda - v_detrazione, 0);
  v_aliquota    := CASE WHEN v_imp_annuo > 0 THEN v_irpef_annua / v_imp_annuo ELSE 0 END;
  v_irpef_mese  := round(greatest(v_imponibile, 0) * v_aliquota, 2);

  RETURN jsonb_build_object(
    'calcolabile', true, 'employee_id', p_employee_id,
    'dipendente', v_emp.first_name || ' ' || v_emp.last_name,
    'company_id', v_emp.company_id, 'anno', p_anno, 'mese', p_mese,
    'paga_oraria', round(v_paga_oraria, 4), 'ore', v_ore - 'giorni',
    'ore_non_giustificate', round(v_ore_mancanti, 2),
    'lordo_contratto', v_emp.gross_salary,
    'trattenuta_ore_mancanti', round(v_ore_mancanti * v_paga_oraria, 2),
    'competenze_straordinario', round(v_lordo_strd, 2),
    'lordo', v_lordo,
    'contributi_dipendente', v_contr_dip, 'contributi_datore', v_contr_dat,
    'imponibile_fiscale', round(v_imponibile, 2), 'ritenute_irpef', v_irpef_mese,
    'aliquota_media_applicata', round(v_aliquota * 100, 2),
    'netto', round(v_lordo - v_contr_dip - v_irpef_mese, 2),
    'costo_azienda', round(v_lordo + v_contr_dat, 2),
    'avvisi', v_avvisi,
    'ipotesi', jsonb_build_array(
      'CCNL Edilizia Industria: INPS 9,19% dip / 28,70% dat, INAIL 3,80%, Cassa Edile 0,40% dip / 1,65% dat, Cometa 0,20%',
      'IRPEF con gli scaglioni in vigore: 23% fino a 28.000, 35% fino a 50.000, 43% oltre',
      'detrazione lavoro dipendente art. 13 TUIR calcolata sul reddito annuo da contratto',
      'straordinario maggiorato 25% feriale, 50% sabato, 100% domenica e festivi nazionali',
      'retribuzione mensilizzata: dal lordo di contratto si trattengono le ore non lavorate e non giustificate',
      'nessuna tredicesima, TFR, addizionali regionali o comunali, trasferta o premio: vanno aggiunti a mano'),
    'da_rivedere_da_un_consulente', true);
END $function$;

-- La quota Cassa Edile è una voce esposta sul cedolino: la calcola il server,
-- così la stampante non deve tenersi una copia delle aliquote.
CREATE OR REPLACE FUNCTION public.cedolino_calcola(
  p_employee_id uuid, p_anno integer, p_mese integer
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE v_base jsonb; v_lordo numeric;
BEGIN
  v_base := public.cedolino_calcola_base(p_employee_id, p_anno, p_mese);
  IF (v_base ->> 'calcolabile') <> 'true' THEN RETURN v_base; END IF;
  v_lordo := (v_base ->> 'lordo')::numeric;
  RETURN v_base || jsonb_build_object(
    'cassa_edile_dipendente', round(v_lordo * 0.0040, 2),
    'cassa_edile_datore',     round(v_lordo * 0.0165, 2));
END $function$;

REVOKE ALL ON FUNCTION public.cedolino_calcola_base(uuid, integer, integer) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.cedolino_calcola(uuid, integer, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.cedolino_calcola_base(uuid, integer, integer) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.cedolino_calcola(uuid, integer, integer) TO authenticated, service_role;
