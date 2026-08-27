-- Caricare i destinatari di una campagna senza scrivere SQL a mano.
--
-- In piattaforma ci sono ~25.400 contatti con telefono: una UI che non sa
-- filtrarli obbligherebbe a fare query a mano ogni volta, che e' il modo
-- migliore per sbagliare destinatario su una campagna a freddo.
--
-- Due funzioni gemelle: una CONTA (anteprima prima di premere il bottone) e
-- una INSERISCE. Stessa identica condizione in entrambe, cosi' il numero che
-- vedi in anteprima e' esattamente quello che finisce in coda — se le
-- condizioni divergessero, l'anteprima diventerebbe una bugia.

CREATE OR REPLACE FUNCTION public.openwa_campagna_anteprima(
  p_tags text[] DEFAULT NULL,
  p_citta text DEFAULT NULL,
  p_provincia text DEFAULT NULL,
  p_source text DEFAULT NULL,
  p_limite integer DEFAULT NULL
)
RETURNS integer
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT COALESCE(count(*), 0)::integer FROM (
    SELECT 1
    FROM public.marketing_contacts mc
    WHERE mc.company_id = '00000000-0000-0000-0000-000000000001'
      AND mc.phone IS NOT NULL AND mc.phone <> ''
      AND mc.optout_whatsapp IS NOT TRUE
      AND (p_tags IS NULL OR array_length(p_tags, 1) IS NULL OR mc.tags && p_tags)
      AND (p_citta IS NULL OR p_citta = '' OR mc.city ILIKE p_citta)
      AND (p_provincia IS NULL OR p_provincia = '' OR mc.province ILIKE p_provincia)
      AND (p_source IS NULL OR p_source = '' OR mc.source ILIKE p_source)
    ORDER BY mc.created_at DESC
    LIMIT COALESCE(p_limite, 100000)
  ) x;
$function$;

CREATE OR REPLACE FUNCTION public.openwa_campagna_carica_lista(
  p_campagna_id uuid,
  p_tags text[] DEFAULT NULL,
  p_citta text DEFAULT NULL,
  p_provincia text DEFAULT NULL,
  p_source text DEFAULT NULL,
  p_limite integer DEFAULT NULL
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_inseriti integer;
BEGIN
  IF NOT public.is_platform_staff() THEN
    RAISE EXCEPTION 'Accesso riservato allo staff di piattaforma' USING ERRCODE = '42501';
  END IF;

  -- Si carica solo su una campagna che non e' ancora partita: aggiungere
  -- destinatari a campagna in corso e' legittimo, farlo su una completata o
  -- annullata no.
  IF NOT EXISTS (
    SELECT 1 FROM public.openwa_campagne
    WHERE id = p_campagna_id AND stato IN ('bozza','in_pausa','in_corso')
  ) THEN
    RAISE EXCEPTION 'Campagna inesistente o non piu'' modificabile' USING ERRCODE = '22023';
  END IF;

  WITH candidati AS (
    SELECT mc.id
    FROM public.marketing_contacts mc
    WHERE mc.company_id = '00000000-0000-0000-0000-000000000001'
      AND mc.phone IS NOT NULL AND mc.phone <> ''
      AND mc.optout_whatsapp IS NOT TRUE
      AND (p_tags IS NULL OR array_length(p_tags, 1) IS NULL OR mc.tags && p_tags)
      AND (p_citta IS NULL OR p_citta = '' OR mc.city ILIKE p_citta)
      AND (p_provincia IS NULL OR p_provincia = '' OR mc.province ILIKE p_provincia)
      AND (p_source IS NULL OR p_source = '' OR mc.source ILIKE p_source)
    ORDER BY mc.created_at DESC
    LIMIT COALESCE(p_limite, 100000)
  ), ins AS (
    INSERT INTO public.openwa_campagna_destinatari (campagna_id, contact_id)
    SELECT p_campagna_id, c.id FROM candidati c
    -- Gia' in lista (anche da un caricamento precedente): non si duplica.
    ON CONFLICT (campagna_id, contact_id) DO NOTHING
    RETURNING 1
  )
  SELECT COALESCE(count(*), 0)::integer INTO v_inseriti FROM ins;

  RETURN v_inseriti;
END;
$function$;

REVOKE ALL ON FUNCTION public.openwa_campagna_anteprima(text[], text, text, text, integer) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.openwa_campagna_carica_lista(uuid, text[], text, text, text, integer) FROM PUBLIC, anon;

-- ── Riepilogo per la UI ─────────────────────────────────────────────────────
-- Una riga per campagna con i conteggi gia' fatti: senza questa, la lista
-- campagne farebbe una query per ogni riga.
CREATE OR REPLACE FUNCTION public.openwa_campagne_riepilogo()
RETURNS TABLE(
  id uuid, nome text, stato text,
  followup_dopo_giorni integer, ha_followup boolean,
  totali bigint, da_inviare bigint, inviati bigint,
  followup_inviati bigint, risposti bigint, saltati bigint, falliti bigint,
  created_at timestamptz, avviata_at timestamptz
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT public.is_platform_staff() THEN
    RAISE EXCEPTION 'Accesso riservato allo staff di piattaforma' USING ERRCODE = '42501';
  END IF;
  RETURN QUERY
    SELECT c.id, c.nome, c.stato,
           c.followup_dopo_giorni,
           (c.followup_messaggio IS NOT NULL),
           count(d.id),
           count(d.id) FILTER (WHERE d.stato = 'da_inviare'),
           count(d.id) FILTER (WHERE d.stato = 'inviato'),
           count(d.id) FILTER (WHERE d.stato = 'followup_inviato'),
           count(d.id) FILTER (WHERE d.stato = 'risposto'),
           count(d.id) FILTER (WHERE d.stato = 'saltato'),
           count(d.id) FILTER (WHERE d.stato = 'fallito'),
           c.created_at, c.avviata_at
    FROM public.openwa_campagne c
    LEFT JOIN public.openwa_campagna_destinatari d ON d.campagna_id = c.id
    GROUP BY c.id
    ORDER BY c.created_at DESC;
END;
$function$;

REVOKE ALL ON FUNCTION public.openwa_campagne_riepilogo() FROM PUBLIC, anon;

NOTIFY pgrst, 'reload schema';
