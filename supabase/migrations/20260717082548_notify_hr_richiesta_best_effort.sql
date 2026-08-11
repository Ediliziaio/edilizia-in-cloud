-- Applicata direttamente in produzione dal pannello Supabase e ricostruita
-- qui dal registro migrazioni (supabase_migrations.schema_migrations),
-- per riallineare la cartella del repo alla storia reale del database.

-- Rende la notifica HR best-effort: un errore nell'invio notifica NON deve mai
-- annullare la creazione della richiesta (trigger AFTER INSERT nella stessa tx).
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
    -- notifica non critica: si prosegue senza bloccare la richiesta
    NULL;
  END;

  RETURN NEW;
END;
$function$;
