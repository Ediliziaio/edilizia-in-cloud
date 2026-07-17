-- Richieste HR dal dipendente (pagina timbrature) → notifica ai company_admin.
-- 1) Ammette i nuovi tipi inviabili dal dipendente: rettifica_timbratura, segnalazione.
-- 2) Trigger AFTER INSERT che avvisa i company_admin via create_notification
--    (campanella in tempo reale). La notifica è BEST-EFFORT: un errore nell'invio
--    non deve mai annullare la creazione della richiesta.

-- 1) CHECK tipo esteso
ALTER TABLE public.hr_richieste DROP CONSTRAINT IF EXISTS hr_richieste_tipo_check;
ALTER TABLE public.hr_richieste ADD CONSTRAINT hr_richieste_tipo_check
  CHECK (tipo = ANY (ARRAY[
    'ferie','permesso','malattia','straordinario','cambio_turno','rimborso',
    'altro','rol','infortunio','maternita','paternita','lutto',
    'smart_working','trasferta','formazione',
    'rettifica_timbratura','segnalazione'
  ]::text[]));

-- 2) Funzione + trigger notifica
CREATE OR REPLACE FUNCTION public.notify_hr_richiesta()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_nome        text;
  v_user_id     uuid;
  v_tipo_label  text;
  v_periodo     text;
  v_body        text;
BEGIN
  IF NEW.stato IS DISTINCT FROM 'in_attesa' OR NEW.company_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT COALESCE(NULLIF(TRIM(pr.nome || ' ' || COALESCE(pr.cognome, '')), ''), 'Dipendente'),
         pr.user_id
    INTO v_nome, v_user_id
    FROM hr_profili pr
   WHERE pr.id = NEW.profilo_id;

  v_tipo_label := CASE NEW.tipo
    WHEN 'ferie'                THEN 'Ferie'
    WHEN 'permesso'             THEN 'Permesso'
    WHEN 'rol'                  THEN 'ROL'
    WHEN 'malattia'             THEN 'Malattia'
    WHEN 'straordinario'        THEN 'Straordinario'
    WHEN 'cambio_turno'         THEN 'Cambio turno'
    WHEN 'rimborso'             THEN 'Rimborso spese'
    WHEN 'smart_working'        THEN 'Smart working'
    WHEN 'trasferta'            THEN 'Trasferta'
    WHEN 'formazione'           THEN 'Formazione'
    WHEN 'infortunio'           THEN 'Infortunio'
    WHEN 'maternita'            THEN 'Maternità'
    WHEN 'paternita'            THEN 'Paternità'
    WHEN 'lutto'                THEN 'Lutto'
    WHEN 'rettifica_timbratura' THEN 'Rettifica timbratura'
    WHEN 'segnalazione'         THEN 'Segnalazione'
    ELSE 'Richiesta'
  END;

  IF NEW.data_inizio IS NOT NULL THEN
    v_periodo := to_char(NEW.data_inizio, 'DD/MM/YYYY');
    IF NEW.data_fine IS NOT NULL AND NEW.data_fine <> NEW.data_inizio THEN
      v_periodo := v_periodo || ' → ' || to_char(NEW.data_fine, 'DD/MM/YYYY');
    END IF;
  END IF;

  v_body := COALESCE(NULLIF(TRIM(NEW.motivo), ''), v_tipo_label);
  IF v_periodo IS NOT NULL THEN
    v_body := v_body || ' · ' || v_periodo;
  END IF;

  -- Best-effort: la notifica non deve mai bloccare l'inserimento della richiesta
  BEGIN
    PERFORM create_notification(
      NEW.company_id,
      ur.user_id,
      'hr_richiesta',
      v_nome || ' — ' || v_tipo_label,
      v_body,
      'hr_richiesta',
      NEW.id,
      '/azienda/personale?tab=richieste'
    )
    FROM user_roles ur
    JOIN profiles p ON p.id = ur.user_id AND p.company_id = NEW.company_id
    WHERE ur.role = 'company_admin'
      AND (v_user_id IS NULL OR ur.user_id <> v_user_id);
  EXCEPTION WHEN OTHERS THEN
    NULL;
  END;

  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_notify_hr_richiesta ON public.hr_richieste;
CREATE TRIGGER trg_notify_hr_richiesta
  AFTER INSERT ON public.hr_richieste
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_hr_richiesta();
