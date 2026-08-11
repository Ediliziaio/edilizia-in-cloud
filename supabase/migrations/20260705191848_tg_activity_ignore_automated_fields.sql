-- Applicata direttamente in produzione dal pannello Supabase e ricostruita
-- qui dal registro migrazioni (supabase_migrations.schema_migrations),
-- per riallineare la cartella del repo alla storia reale del database.

-- Il trigger di log attività ignora i campi AUTOMATICI (scoring AI/ICP, geocodifica):
-- non sono modifiche utente, non devono generare "contatto aggiornato" né rallentare i bulk update.
CREATE OR REPLACE FUNCTION public.tg_activity_on_contacts()
 RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_changes jsonb := '{}'::jsonb;
  v_description text;
  v_importance text := 'normal';
  v_target_label text;
  v_actor uuid;
BEGIN
  v_target_label := trim(coalesce(NEW.first_name, OLD.first_name, '') || ' ' ||
                          coalesce(NEW.last_name, OLD.last_name, ''));
  IF v_target_label = '' THEN
    v_target_label := coalesce(NEW.id, OLD.id)::text;
  END IF;
  v_actor := nullif(current_setting('request.jwt.claim.sub', true), '')::uuid;

  IF TG_OP = 'INSERT' THEN
    v_description := format('Nuovo contatto CRM: %s', v_target_label);
    PERFORM public.log_activity(
      NEW.company_id, 'modification', 'contact.created',
      v_actor, 'marketing_contacts', NEW.id::text, v_target_label, v_description,
      NULL, NULL, to_jsonb(NEW), 'normal', '{}'::jsonb, 'trigger:tg_activity_on_contacts'
    );
  ELSIF TG_OP = 'UPDATE' THEN
    SELECT jsonb_object_agg(key, jsonb_build_object('old', o.value, 'new', n.value))
    INTO v_changes
    FROM jsonb_each(to_jsonb(OLD)) o
    JOIN jsonb_each(to_jsonb(NEW)) n USING (key)
    WHERE o.value IS DISTINCT FROM n.value
      AND key NOT IN ('updated_at','last_seen_at','last_contact_at',
                      'icp_score','icp_tier','lead_score','score','last_score_update',
                      'ai_score','ai_score_tier','ai_score_reasoning','ai_next_action',
                      'ai_intent_signals','ai_predicted_value_eur','ai_scored_at','ai_score_model',
                      'lat','lng','geocoded_at','telefono_normalized');

    IF v_changes IS NULL OR v_changes = '{}'::jsonb THEN
      RETURN NEW;
    END IF;

    IF v_changes ? 'lead_status' OR v_changes ? 'tags' THEN v_importance := 'high'; END IF;

    v_description := format('Contatto %s aggiornato. Campi: %s',
      v_target_label,
      (SELECT string_agg(k, ', ') FROM jsonb_object_keys(v_changes) k));
    PERFORM public.log_activity(
      NEW.company_id, 'modification', 'contact.updated',
      v_actor, 'marketing_contacts', NEW.id::text, v_target_label, v_description,
      v_changes, to_jsonb(OLD), to_jsonb(NEW), v_importance, '{}'::jsonb, 'trigger:tg_activity_on_contacts'
    );
  ELSIF TG_OP = 'DELETE' THEN
    v_description := format('Contatto %s eliminato', v_target_label);
    PERFORM public.log_activity(
      OLD.company_id, 'modification', 'contact.deleted',
      v_actor, 'marketing_contacts', OLD.id::text, v_target_label, v_description,
      NULL, to_jsonb(OLD), NULL, 'high', '{}'::jsonb, 'trigger:tg_activity_on_contacts'
    );
  END IF;

  RETURN coalesce(NEW, OLD);
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'tg_activity_on_contacts failed: %', SQLERRM;
  RETURN coalesce(NEW, OLD);
END;
$function$;
