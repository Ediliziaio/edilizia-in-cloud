-- Un solo costo orario, e le ore non spariscono più dalla commessa.
--
-- Il campo `employees.costo_orario` è compilato a mano. La schermata del
-- dipendente promette "Vuoto = costo calcolato dallo stipendio", ma il trigger
-- che trasforma un rapportino approvato in costo di commessa faceva
-- `coalesce(costo_orario, 0)` e poi `if v_costo > 0`: con il campo vuoto NON
-- scriveva nemmeno la riga in order_employees. Ore e costo sparivano del tutto
-- dalla marginalità, in silenzio.
--
-- Su questo database 33 dipendenti attivi su 34 hanno il campo vuoto, e tutti
-- e 34 hanno lo stipendio: senza questo fix, alla prima approvazione di un
-- rapportino il margine di commessa avrebbe contato la manodopera a zero per
-- il 97% delle persone. (Nessun rapportino risulta ancora approvato in tutto
-- il database, quindi non c'è storico da recuperare: il buco era davanti a
-- noi, non dietro.)
--
-- Da qui in poi il costo orario ha UNA definizione sola, in una funzione che
-- tutti chiamano.

-- ── 1. La definizione unica ─────────────────────────────────────────────────
-- Priorità: la tariffa scritta a mano (se c'è) vince, perché è una scelta
-- dell'azienda. Altrimenti si calcola dal costo VERO del dipendente —
-- lordo più oneri — sulle ore contrattuali. Mai zero per distrazione.
create or replace function public.costo_orario_dipendente(p_employee_id uuid)
returns numeric
language sql
stable
security definer
set search_path to 'public'
as $$
  select case
    when e.costo_orario is not null and e.costo_orario > 0
      then e.costo_orario
    when coalesce(e.gross_salary, 0) > 0 and coalesce(e.monthly_hours, 0) > 0
      then round((e.gross_salary * (1 + coalesce(e.inps_rate, 28) / 100.0)) / e.monthly_hours, 2)
    else 0
  end
  from employees e
  where e.id = p_employee_id
$$;

comment on function public.costo_orario_dipendente(uuid) is
  'Costo orario aziendale di un dipendente: tariffa manuale se impostata, '
  'altrimenti (lordo + oneri INPS) / ore mensili contrattuali. '
  'Unica fonte: la usano il trigger dei rapportini, gli alert margine e i tool AI.';

-- ── 2. Il trigger: usa la definizione unica e non perde più le ore ──────────
-- Rispetto a prima cambiano due sole cose: da dove viene la tariffa, e il
-- fatto che la riga in order_employees si scrive ANCHE a costo zero (un
-- volontario o uno stagista ha comunque lavorato: le sue ore devono comparire).
create or replace function public.fn_rapportino_costo_manodopera()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_fase uuid;
  v_pres jsonb;
  v_item jsonb;
  v_emp record;
  v_tariffa numeric;
  v_ore numeric;
  v_costo numeric;
  v_totale numeric := 0;
  v_snapshot jsonb := '[]'::jsonb;
  v_row_id uuid;
begin
  -- ── APPROVAZIONE ─────────────────────────────────────────────────────────
  if new.stato = 'approvato' and old.stato is distinct from 'approvato'
     and new.costo_registrato_at is null then

    -- Fase: attribuzione solo se il rapportino ne dichiara UNA
    if jsonb_typeof(new.fasi_lavorate) = 'array'
       and jsonb_array_length(new.fasi_lavorate) = 1 then
      v_fase := (new.fasi_lavorate->0->>'phase_id')::uuid;
    end if;

    -- Le presenze del giorno; se assenti, fallback sull'autore (rapportino
    -- personale del singolo operaio: le sue ore, la sua scheda).
    if jsonb_typeof(new.presenze) = 'array' and jsonb_array_length(new.presenze) > 0 then
      v_pres := new.presenze;
    else
      select jsonb_build_array(jsonb_build_object(
               'employee_id', e.id,
               'ore', coalesce(new.ore_lavorate, 0) + coalesce(new.ore_straordinario, 0)))
        into v_pres
        from employees e
       where e.company_id = new.company_id and e.user_id = new.user_id
       limit 1;
      v_pres := coalesce(v_pres, '[]'::jsonb);
    end if;

    for v_item in select * from jsonb_array_elements(v_pres) loop
      -- Subappaltatore presente: registrato, ma niente costo orario
      if v_item->>'employee_id' is null then continue; end if;

      select id into v_emp
        from employees
       where id = (v_item->>'employee_id')::uuid and company_id = new.company_id;
      if v_emp.id is null then continue; end if;

      v_ore := coalesce((v_item->>'ore')::numeric, 0);
      if v_ore <= 0 then continue; end if;

      v_tariffa := public.costo_orario_dipendente(v_emp.id);
      v_costo := round(v_ore * v_tariffa, 2);

      -- Niente `if v_costo > 0`: le ore lavorate vanno registrate comunque.
      select id into v_row_id
        from order_employees
       where order_id = new.order_id and employee_id = v_emp.id
         and phase_id is not distinct from v_fase
       limit 1;
      if v_row_id is not null then
        -- La tariffa si ricalcola come media ponderata: sulla riga esistente
        -- restava quella del primo rapportino, quindi hourly_rate × ore non
        -- tornava più col total_cost e chi leggeva la commessa non capiva.
        update order_employees
           set hours_worked = hours_worked + v_ore,
               total_cost   = total_cost + v_costo,
               hourly_rate  = case when (hours_worked + v_ore) > 0
                                   then round((total_cost + v_costo) / (hours_worked + v_ore), 2)
                                   else v_tariffa end
         where id = v_row_id;
      else
        insert into order_employees (order_id, employee_id, phase_id, hourly_rate, hours_worked, total_cost)
        values (new.order_id, v_emp.id, v_fase, v_tariffa, v_ore, v_costo);
      end if;

      v_totale := v_totale + v_costo;
      v_snapshot := v_snapshot || jsonb_build_object(
        'employee_id', v_emp.id, 'ore', v_ore, 'costo', v_costo,
        'phase_id', v_fase);
    end loop;

    new.costo_manodopera := v_totale;
    new.presenze_registrate := v_snapshot;
    new.costo_registrato_at := now();
    return new;
  end if;

  -- ── REVOCA: storno esatto dallo snapshot ─────────────────────────────────
  if old.stato = 'approvato' and new.stato is distinct from 'approvato'
     and old.costo_registrato_at is not null then

    if jsonb_typeof(old.presenze_registrate) = 'array' then
      for v_item in select * from jsonb_array_elements(old.presenze_registrate) loop
        update order_employees
           set hours_worked = greatest(0, hours_worked - coalesce((v_item->>'ore')::numeric, 0)),
               total_cost   = greatest(0, total_cost - coalesce((v_item->>'costo')::numeric, 0))
         where id = (
           select id from order_employees
            where order_id = new.order_id
              and employee_id = (v_item->>'employee_id')::uuid
              and phase_id is not distinct from nullif(v_item->>'phase_id','')::uuid
            limit 1
         );
      end loop;
    end if;

    new.costo_manodopera := null;
    new.presenze_registrate := null;
    new.costo_registrato_at := null;
    return new;
  end if;

  return new;
end $function$;

-- ── 3. L'alert "margine basso" smette di inventarsi 25 €/h ──────────────────
-- La funzione moltiplicava le ore per una costante hardcoded: un'azienda con
-- operai da 14 €/h si vedeva segnalare cantieri in perdita che non lo erano,
-- e una con operai da 32 €/h non li vedeva affatto. Rispetto all'originale
-- cambia SOLO il calcolo del costo manodopera (più il filtro azienda sui
-- rapportini, che mancava e faceva scansionare le righe di tutti).
-- Quando l'autore del rapportino non è collegato a un dipendente si usa la
-- media aziendale invece di zero: un costo mancante farebbe sparire l'allarme,
-- che è esattamente la direzione sbagliata in cui sbagliare.
create or replace function public.get_cantieri_margine_basso(
  p_company_id uuid,
  p_soglia_percent numeric default 10
)
returns table(cantiere_id uuid, nome text, margine_percent numeric, valore numeric)
language plpgsql
stable
security definer
set search_path to 'public'
as $function$
BEGIN
  PERFORM public.assert_company_access(p_company_id);
  RETURN QUERY

  WITH tariffa_media AS (
    SELECT avg(nullif(public.costo_orario_dipendente(e.id), 0)) AS eur_ora
      FROM public.employees e
     WHERE e.company_id = p_company_id AND e.is_active
  ),
  cantieri_attivi AS (
    SELECT
      o.id,
      COALESCE(o.description, o.order_code, 'Cantiere') AS nome,
      o.total_amount,
      o.percentuale_avanzamento
    FROM public.orders o
    WHERE o.company_id = p_company_id
      AND o.status IN ('in_produzione', 'in_corso', 'attivo', 'aperto', 'in_lavorazione')
      AND o.total_amount > 0
  ),
  costi AS (
    SELECT
      r.order_id AS cantiere_id,
      SUM(
        (COALESCE(r.ore_lavorate, 0) + COALESCE(r.ore_straordinario, 0))
        * COALESCE(nullif(public.costo_orario_dipendente(e.id), 0), tm.eur_ora, 0)
      ) AS manodopera
    FROM public.campo_rapportini r
    CROSS JOIN tariffa_media tm
    LEFT JOIN public.employees e
      ON e.company_id = r.company_id AND e.user_id = r.user_id
    WHERE r.company_id = p_company_id
    GROUP BY r.order_id
  )
  SELECT
    c.id AS cantiere_id,
    c.nome,
    CASE
      WHEN c.total_amount * c.percentuale_avanzamento / 100 > 0 THEN
        ((c.total_amount * c.percentuale_avanzamento / 100 - COALESCE(co.manodopera, 0))
         / (c.total_amount * c.percentuale_avanzamento / 100)) * 100
      ELSE 0
    END AS margine_percent,
    c.total_amount AS valore
  FROM cantieri_attivi c
  LEFT JOIN costi co ON co.cantiere_id = c.id
  WHERE
    c.total_amount * c.percentuale_avanzamento / 100 > 0
    AND ((c.total_amount * c.percentuale_avanzamento / 100 - COALESCE(co.manodopera, 0))
         / (c.total_amount * c.percentuale_avanzamento / 100)) * 100 < p_soglia_percent
;
END;
$function$;

-- ── 4. Lo straordinario nel cedolino smette di essere sempre 0,0 ────────────
-- `hr_giornate.ore_straordinario` non era scritto da NESSUNO (zero righe
-- valorizzate su tutto il database), ma TabCedolini lo somma e lo stampa:
-- il cedolino ha sempre detto "di cui 0,0 h di straordinario", anche dopo una
-- settimana di dieci ore al giorno. Ora il trigger lo calcola come le ore
-- oltre quelle previste dal contratto, che è la definizione che si aspetta
-- chi legge il cedolino.
create or replace function public.calcola_giornata_hr()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
DECLARE
  v_data date;
  v_company_id uuid;
  v_profilo_id uuid;
  v_ore_previste numeric(4,2);
  v_prima_entrata time;
  v_ultima_uscita time;
  v_ore_lavorate numeric(4,2);
  v_ore_pausa numeric(4,2);
  v_ore_straordinario numeric(4,2);
  v_pausa_inizio_rec RECORD;
  v_pausa_fine_rec RECORD;
BEGIN
  v_data := NEW.data_evento;
  v_company_id := NEW.company_id;
  v_profilo_id := NEW.profilo_id;

  SELECT COALESCE(ore_giornaliere, 8) INTO v_ore_previste
  FROM hr_profili WHERE id = v_profilo_id;

  SELECT MIN(ora_evento) INTO v_prima_entrata
  FROM hr_timbrature
  WHERE profilo_id = v_profilo_id AND data_evento = v_data AND tipo = 'entrata';

  SELECT MAX(ora_evento) INTO v_ultima_uscita
  FROM hr_timbrature
  WHERE profilo_id = v_profilo_id AND data_evento = v_data AND tipo = 'uscita';

  IF v_prima_entrata IS NOT NULL AND v_ultima_uscita IS NOT NULL THEN
    v_ore_lavorate := EXTRACT(EPOCH FROM (v_ultima_uscita - v_prima_entrata)) / 3600.0;
  ELSE
    v_ore_lavorate := 0;
  END IF;

  v_ore_pausa := 0;
  FOR v_pausa_inizio_rec IN
    SELECT ora_evento FROM hr_timbrature
    WHERE profilo_id = v_profilo_id AND data_evento = v_data AND tipo = 'pausa_inizio'
    ORDER BY ora_evento
  LOOP
    SELECT ora_evento INTO v_pausa_fine_rec
    FROM hr_timbrature
    WHERE profilo_id = v_profilo_id AND data_evento = v_data AND tipo = 'pausa_fine'
      AND ora_evento > v_pausa_inizio_rec.ora_evento
    ORDER BY ora_evento LIMIT 1;

    IF v_pausa_fine_rec.ora_evento IS NOT NULL THEN
      v_ore_pausa := v_ore_pausa + EXTRACT(EPOCH FROM (v_pausa_fine_rec.ora_evento - v_pausa_inizio_rec.ora_evento)) / 3600.0;
    END IF;
  END LOOP;

  v_ore_lavorate := GREATEST(0, v_ore_lavorate - v_ore_pausa);
  v_ore_straordinario := GREATEST(0, v_ore_lavorate - COALESCE(v_ore_previste, 8));

  INSERT INTO hr_giornate (company_id, profilo_id, data, ore_previste, ore_lavorate, ore_pausa, ore_straordinario, prima_entrata, ultima_uscita)
  VALUES (v_company_id, v_profilo_id, v_data, v_ore_previste,
          ROUND(v_ore_lavorate::numeric, 2), ROUND(v_ore_pausa::numeric, 2),
          ROUND(v_ore_straordinario::numeric, 2), v_prima_entrata, v_ultima_uscita)
  ON CONFLICT (profilo_id, data)
  DO UPDATE SET
    ore_lavorate = ROUND(EXCLUDED.ore_lavorate::numeric, 2),
    ore_pausa = ROUND(EXCLUDED.ore_pausa::numeric, 2),
    ore_straordinario = ROUND(EXCLUDED.ore_straordinario::numeric, 2),
    prima_entrata = EXCLUDED.prima_entrata,
    ultima_uscita = EXCLUDED.ultima_uscita,
    updated_at = now();

  RETURN NEW;
END;
$function$;

-- Riallinea lo storico già consolidato (le 894 giornate del backfill
-- timbrature avevano ore_straordinario a zero per costruzione).
update hr_giornate
   set ore_straordinario = round(greatest(0, ore_lavorate - coalesce(ore_previste, 8))::numeric, 2),
       updated_at = now()
 where coalesce(ore_straordinario, 0) is distinct from
       round(greatest(0, ore_lavorate - coalesce(ore_previste, 8))::numeric, 2);
