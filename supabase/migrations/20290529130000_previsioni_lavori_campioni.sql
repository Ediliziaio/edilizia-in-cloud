-- Rese corrette per azienda (24/11/2026): i campioni da cui la previsione dei lavori impara.
--
-- Per ogni commessa dell'azienda con i lavori finiti (work_end_date passata) e una previsione
-- salvata (l'ultima), i giorni previsti per fase — quelli delle rese tipiche, prima di ogni
-- correzione (`giorniBase`) — e, per ogni fase della commessa, i giorni con un rapportino.
-- L'abbinamento dei nomi e la media li fa il codice (lib/planimetrie/correzioneRese.ts), con la
-- stessa regola di «Previsto e reale».
--
-- Niente importi: sono giorni, servono a chi fa la previsione anche senza il permesso sui costi
-- (altrimenti due persone della stessa azienda vedrebbero durate diverse). Per questo è definer:
-- la tabella delle previsioni si legge solo con i costi.

CREATE OR REPLACE FUNCTION public.previsioni_lavori_campioni(p_company uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  esito jsonb;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.company_id = p_company)
     OR public.utente_e_cliente_esterno() OR public.utente_bloccato() THEN
    RAISE EXCEPTION 'Azienda non disponibile' USING ERRCODE = '42501';
  END IF;

  WITH ultime AS (
    SELECT DISTINCT ON (v.order_id) v.order_id, v.previsione
      FROM public.commessa_previsioni_lavori v
      JOIN public.orders o ON o.id = v.order_id
     WHERE v.company_id = p_company
       AND o.work_end_date IS NOT NULL AND o.work_end_date <= current_date
     ORDER BY v.order_id, v.created_at DESC
  )
  SELECT coalesce(jsonb_agg(jsonb_build_object(
           'order_id', u.order_id,
           'fasi_previste', (
             SELECT coalesce(jsonb_agg(jsonb_build_object(
                      'fase', f ->> 'fase',
                      'giorni', coalesce((f ->> 'giorniBase')::numeric, (f ->> 'giorni')::numeric))), '[]'::jsonb)
               FROM jsonb_array_elements(u.previsione -> 'fasi') f),
           'fasi_commessa', (
             SELECT coalesce(jsonb_agg(jsonb_build_object(
                      'id', w.id,
                      'nome', w.name,
                      'giorni', (
                        SELECT coalesce(jsonb_agg(DISTINCT r.data_lavoro), '[]'::jsonb)
                          FROM public.campo_rapportini r
                         WHERE r.order_id = u.order_id
                           AND r.annullato_at IS NULL AND r.stato <> 'rifiutato'
                           AND r.fasi_lavorate @> jsonb_build_array(jsonb_build_object('phase_id', w.id::text))))), '[]'::jsonb)
               FROM public.order_work_phases w WHERE w.order_id = u.order_id)
         )), '[]'::jsonb)
    INTO esito
    FROM ultime u;
  RETURN esito;
END;
$$;

REVOKE ALL ON FUNCTION public.previsioni_lavori_campioni(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.previsioni_lavori_campioni(uuid) TO authenticated, service_role;
