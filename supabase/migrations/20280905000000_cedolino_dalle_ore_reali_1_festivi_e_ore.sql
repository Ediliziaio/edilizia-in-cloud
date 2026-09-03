-- ════════════════════════════════════════════════════════════════════════════
-- Ondata 5.1 — il cedolino nasce dalle ore vere, non dai vuoti in stampa
-- ════════════════════════════════════════════════════════════════════════════
-- Parte 1 di 5: festività italiane e aggregazione delle timbrature.
--
-- Stato trovato in produzione, prima di toccare qualcosa:
--   hr_timbrature ......... 2.039 righe, 27 profili, aprile → agosto 2026
--   hr_cedolini ........... 0 righe
--   cedolini .............. 0 righe
-- Il ponte per andare dalle une agli altri esiste ed è popolato:
--   hr_timbrature.profilo_id → hr_profili.id → hr_profili.employee_id → employees.id
-- Nessuna funzione lo attraversava.

CREATE OR REPLACE FUNCTION public.pasqua_italiana(p_anno integer)
RETURNS date
LANGUAGE plpgsql
IMMUTABLE
AS $function$
DECLARE a int; b int; c int; d int; e int; f int; g int; h int;
        i int; k int; l int; m int; mese int; giorno int;
BEGIN
  -- Algoritmo di Meeus/Jones/Butcher (calendario gregoriano).
  a := p_anno % 19;  b := p_anno / 100;  c := p_anno % 100;
  d := b / 4;        e := b % 4;         f := (b + 8) / 25;
  g := (b - f + 1) / 3;
  h := (19*a + b - d - g + 15) % 30;
  i := c / 4;        k := c % 4;
  l := (32 + 2*e + 2*i - h - k) % 7;
  m := (a + 11*h + 22*l) / 451;
  mese   := (h + l - 7*m + 114) / 31;
  giorno := ((h + l - 7*m + 114) % 31) + 1;
  RETURN make_date(p_anno, mese, giorno);
END $function$;

CREATE OR REPLACE FUNCTION public.festivo_italiano(p_data date)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
AS $function$
  SELECT extract(dow from p_data) = 0                      -- domenica
      OR to_char(p_data, 'MM-DD') IN (
           '01-01','01-06','04-25','05-01','06-02',
           '08-15','11-01','12-08','12-25','12-26')
      OR p_data = public.pasqua_italiana(extract(year from p_data)::int) + 1;  -- Pasquetta
$function$;

COMMENT ON FUNCTION public.festivo_italiano(date) IS
  'Domeniche e festività nazionali. Le patronali sono locali e non sono qui: chi ne ha bisogno le aggiunga per sede.';


-- ── Un cedolino è un dato personale ──────────────────────────────────────────
-- Appartenere alla stessa azienda non basta. Le funzioni qui sotto sono
-- SECURITY DEFINER e passano sopra le policy di riga: senza questo controllo un
-- collega qualsiasi potrebbe chiedere lo stipendio di un altro. hr_cedolini lo
-- sapeva già — la policy cedolini_select_own esiste apposta.
CREATE OR REPLACE FUNCTION public.cedolino_visibile_a_chi_chiede(p_employee_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT coalesce((
    SELECT public.user_can_access_company(e.company_id)
       AND (
            coalesce(current_setting('request.jwt.claims', true)::json ->> 'role', '') = 'service_role'
         OR public.has_role(auth.uid(), 'super_admin'::public.app_role)
         OR public.has_role(auth.uid(), 'company_admin'::public.app_role)
         OR e.user_id = auth.uid()
         OR e.portal_user_id = auth.uid()
       )
      FROM public.employees e WHERE e.id = p_employee_id
  ), false);
$function$;

REVOKE ALL ON FUNCTION public.cedolino_visibile_a_chi_chiede(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.cedolino_visibile_a_chi_chiede(uuid) TO authenticated, service_role;

-- ── Le ore vere del mese, dalle timbrature ───────────────────────────────────
--
-- Oggi silvio_tool_calcola_ore_mese_dipendente somma soltanto le ASSENZE da
-- hr_assenze (tabella vuota) e non guarda una sola delle 2.039 timbrature
-- registrate. Lo dichiara da sé, nella sua stessa risposta: «Per ore lavorate
-- effettive integrare con rapportini se disponibili».
--
-- Le giornate spaiate (un'entrata senza uscita) NON vengono contate a zero né
-- indovinate: finiscono in `anomalie`, così chi legge sa che quel giorno va
-- sistemato prima di pagare.
CREATE OR REPLACE FUNCTION public.cedolino_ore_periodo(
  p_employee_id uuid,
  p_anno        integer,
  p_mese        integer
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_company     uuid;
  v_profilo     uuid;
  v_ore_giorno  numeric;
  v_pausa_min   integer;
  v_inizio      date;
  v_fine        date;
  v_giorni      jsonb  := '[]'::jsonb;
  v_anomalie    jsonb  := '[]'::jsonb;
  v_ord         numeric := 0;
  v_st25        numeric := 0;
  v_st50        numeric := 0;
  v_st100       numeric := 0;
  v_ferie       numeric := 0;
  v_malattia    numeric := 0;
  v_permesso    numeric := 0;
  v_104         numeric := 0;
  r             record;
BEGIN
  SELECT e.company_id INTO v_company FROM public.employees e WHERE e.id = p_employee_id;
  IF v_company IS NULL THEN
    RAISE EXCEPTION 'dipendente non trovato' USING ERRCODE = 'P0002';
  END IF;
  IF public.cedolino_visibile_a_chi_chiede(p_employee_id) IS NOT TRUE THEN
    RAISE EXCEPTION 'Accesso negato' USING ERRCODE = '42501';
  END IF;
  IF p_mese < 1 OR p_mese > 12 THEN
    RAISE EXCEPTION 'mese fuori intervallo: %', p_mese USING ERRCODE = '22023';
  END IF;

  v_inizio := make_date(p_anno, p_mese, 1);
  v_fine   := (v_inizio + INTERVAL '1 month - 1 day')::date;

  SELECT p.id, coalesce(p.ore_giornaliere, p.ore_settimanali / 5.0, 8),
         coalesce(p.pausa_pranzo_minuti, 0)
    INTO v_profilo, v_ore_giorno, v_pausa_min
    FROM public.hr_profili p
   WHERE p.employee_id = p_employee_id
   ORDER BY p.attivo DESC NULLS LAST, p.created_at DESC
   LIMIT 1;

  IF v_profilo IS NULL THEN
    RETURN jsonb_build_object(
      'calcolabile', false,
      'motivo', 'il dipendente non ha un profilo HR: le timbrature sono legate a hr_profili',
      'employee_id', p_employee_id, 'anno', p_anno, 'mese', p_mese);
  END IF;

  FOR r IN
    SELECT t.data_evento AS giorno,
           min(t.ora_evento) FILTER (WHERE t.tipo = 'entrata')      AS entrata,
           max(t.ora_evento) FILTER (WHERE t.tipo = 'uscita')       AS uscita,
           min(t.ora_evento) FILTER (WHERE t.tipo = 'pausa_inizio') AS pausa_da,
           max(t.ora_evento) FILTER (WHERE t.tipo = 'pausa_fine')   AS pausa_a,
           count(*) FILTER (WHERE t.tipo = 'entrata')               AS n_entrate,
           count(*) FILTER (WHERE t.tipo = 'uscita')                AS n_uscite
      FROM public.hr_timbrature t
     WHERE t.profilo_id = v_profilo
       AND t.data_evento BETWEEN v_inizio AND v_fine
     GROUP BY t.data_evento
     ORDER BY t.data_evento
  LOOP
    DECLARE
      v_lorde numeric;
      v_pausa numeric;
      v_nette numeric;
      v_o     numeric;
      v_s     numeric;
    BEGIN
      IF r.entrata IS NULL OR r.uscita IS NULL THEN
        v_anomalie := v_anomalie || jsonb_build_object(
          'giorno', r.giorno,
          'problema', CASE WHEN r.entrata IS NULL THEN 'uscita senza entrata'
                           ELSE 'entrata senza uscita' END);
        CONTINUE;
      END IF;

      v_lorde := extract(epoch FROM (r.uscita - r.entrata)) / 3600.0;
      IF v_lorde <= 0 THEN
        v_anomalie := v_anomalie || jsonb_build_object(
          'giorno', r.giorno, 'problema', 'uscita non successiva all''entrata');
        CONTINUE;
      END IF;
      IF r.n_entrate <> r.n_uscite THEN
        v_anomalie := v_anomalie || jsonb_build_object(
          'giorno', r.giorno,
          'problema', format('%s entrate e %s uscite: la giornata è stata chiusa sui due estremi',
                             r.n_entrate, r.n_uscite));
      END IF;

      -- Pausa: quella timbrata se c'è, altrimenti quella del contratto.
      IF r.pausa_da IS NOT NULL AND r.pausa_a IS NOT NULL AND r.pausa_a > r.pausa_da THEN
        v_pausa := extract(epoch FROM (r.pausa_a - r.pausa_da)) / 3600.0;
      ELSE
        v_pausa := v_pausa_min / 60.0;
      END IF;

      v_nette := greatest(v_lorde - v_pausa, 0);
      v_o := least(v_nette, v_ore_giorno);
      v_s := greatest(v_nette - v_ore_giorno, 0);
      v_ord := v_ord + v_o;

      -- CCNL Edilizia: maggiorazione feriale 25%, sabato 50%, domenica e
      -- festivi 100%.
      IF public.festivo_italiano(r.giorno) THEN v_st100 := v_st100 + v_s;
      ELSIF extract(dow FROM r.giorno) = 6 THEN v_st50  := v_st50  + v_s;
      ELSE                                      v_st25  := v_st25  + v_s;
      END IF;

      v_giorni := v_giorni || jsonb_build_object(
        'giorno', r.giorno, 'entrata', r.entrata, 'uscita', r.uscita,
        'ore_nette', round(v_nette, 2), 'ordinarie', round(v_o, 2),
        'straordinario', round(v_s, 2));
    END;
  END LOOP;

  SELECT
    coalesce(sum(a.ore_giorno * (least(a.data_fine, v_fine) - greatest(a.data_inizio, v_inizio) + 1))
             FILTER (WHERE a.tipo_assenza = 'ferie'), 0),
    coalesce(sum(a.ore_giorno * (least(a.data_fine, v_fine) - greatest(a.data_inizio, v_inizio) + 1))
             FILTER (WHERE a.tipo_assenza IN ('malattia','infortunio')), 0),
    coalesce(sum(a.ore_giorno * (least(a.data_fine, v_fine) - greatest(a.data_inizio, v_inizio) + 1))
             FILTER (WHERE a.tipo_assenza IN ('permesso_retribuito','rol')), 0),
    coalesce(sum(a.ore_giorno * (least(a.data_fine, v_fine) - greatest(a.data_inizio, v_inizio) + 1))
             FILTER (WHERE a.tipo_assenza = 'permesso_legge_104'), 0)
  INTO v_ferie, v_malattia, v_permesso, v_104
  FROM public.hr_assenze a
  WHERE a.employee_id = p_employee_id AND a.status = 'approved'
    AND a.data_inizio <= v_fine AND a.data_fine >= v_inizio;

  RETURN jsonb_build_object(
    'calcolabile', true,
    'employee_id', p_employee_id, 'profilo_id', v_profilo,
    'anno', p_anno, 'mese', p_mese,
    'periodo_da', v_inizio, 'periodo_a', v_fine,
    'ore_giornaliere_contratto', v_ore_giorno,
    'pausa_contratto_minuti', v_pausa_min,
    'giorni_lavorati', jsonb_array_length(v_giorni),
    'ore_ordinarie', round(v_ord, 2),
    'ore_straordinario_25', round(v_st25, 2),
    'ore_straordinario_50', round(v_st50, 2),
    'ore_straordinario_100', round(v_st100, 2),
    'ore_straordinario_totali', round(v_st25 + v_st50 + v_st100, 2),
    'ore_ferie', round(v_ferie, 2),
    'ore_malattia_infortunio', round(v_malattia, 2),
    'ore_permesso_retribuito', round(v_permesso, 2),
    'ore_legge_104', round(v_104, 2),
    'ore_assenza_giustificate', round(v_ferie + v_malattia + v_permesso + v_104, 2),
    'anomalie', v_anomalie,
    'giorni', v_giorni);
END $function$;

REVOKE ALL ON FUNCTION public.cedolino_ore_periodo(uuid, integer, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.cedolino_ore_periodo(uuid, integer, integer) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.festivo_italiano(date) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.pasqua_italiana(integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.festivo_italiano(date) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.pasqua_italiana(integer) TO authenticated, service_role;
