-- Non contattare due volte lo stesso essere umano.
--
-- La campagna deduplicava per CONTATTO, non per TELEFONO. Nei contatti di
-- piattaforma ci sono 182 numeri presenti su piu' schede, e uno compare 65
-- volte: quella persona avrebbe ricevuto 65 messaggi. In totale 503 messaggi
-- doppi potenziali su una campagna che prendesse tutti — non un rischio, una
-- certezza matematica al primo lancio. Ed e' il modo piu' rapido di farsi
-- segnalare come spam, cioe' l'esatto contrario dell'obiettivo.
--
-- Due difese, complementari:
--   1. dentro la lista: un solo contatto per numero di telefono;
--   2. fra campagne e nel tempo: non si ricontatta chi ha gia' ricevuto un
--      messaggio su quel numero negli ultimi N giorni, QUALUNQUE sia stata
--      la strada (campagna, automazione, invio manuale dall'inbox).
--
-- La (2) si basa su openwa_messages e non sulle campagne, di proposito: la
-- domanda vera non e' "l'ho gia' messo in una campagna" ma "questa persona si
-- e' gia' vista arrivare un mio messaggio".

-- telefono_normalized su marketing_contacts e' VUOTO su tutte le 25.417 righe
-- con telefono (verificato): non ci si puo' contare. Si normalizza qui, e in
-- un posto solo, cosi' i due controlli confrontano sempre la stessa cosa.
CREATE OR REPLACE FUNCTION public.openwa_norm_tel(p_tel text)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $function$
  -- Ultime 9 cifre: tollera +39 / 0039 / spazi / trattini, che nei dati
  -- importati convivono tutti. Due numeri italiani con le stesse ultime 9
  -- cifre sono la stessa utenza.
  SELECT NULLIF(RIGHT(regexp_replace(COALESCE(p_tel, ''), '[^0-9]', '', 'g'), 9), '');
$function$;

COMMENT ON FUNCTION public.openwa_norm_tel(text) IS
  'Ultime 9 cifre del numero: chiave di identita'' di un''utenza telefonica italiana, tollerante ai formati misti dei dati importati. Usata sia dalla deduplica della lista sia dalla soppressione.';

-- Trovare "questo numero l'ho gia' contattato" senza scansionare tutto.
CREATE INDEX IF NOT EXISTS idx_openwa_messages_tel_out
  ON public.openwa_messages (public.openwa_norm_tel(contact_phone), created_at)
  WHERE direction = 'outbound';

-- ── Anteprima e caricamento, con le due difese ──────────────────────────────
-- Restano gemelle: stessa identica condizione, altrimenti l'anteprima mente.
CREATE OR REPLACE FUNCTION public.openwa_campagna_anteprima(
  p_tags text[] DEFAULT NULL,
  p_citta text DEFAULT NULL,
  p_provincia text DEFAULT NULL,
  p_source text DEFAULT NULL,
  p_limite integer DEFAULT NULL,
  p_giorni_riposo integer DEFAULT 90
)
RETURNS integer
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT COALESCE(count(*), 0)::integer FROM (
    SELECT DISTINCT ON (public.openwa_norm_tel(mc.phone)) mc.id
    FROM public.marketing_contacts mc
    WHERE mc.company_id = '00000000-0000-0000-0000-000000000001'
      AND mc.phone IS NOT NULL AND mc.phone <> ''
      AND public.openwa_norm_tel(mc.phone) IS NOT NULL
      AND mc.optout_whatsapp IS NOT TRUE
      AND (p_tags IS NULL OR array_length(p_tags, 1) IS NULL OR mc.tags && p_tags)
      AND (p_citta IS NULL OR p_citta = '' OR mc.city ILIKE p_citta)
      AND (p_provincia IS NULL OR p_provincia = '' OR mc.province ILIKE p_provincia)
      AND (p_source IS NULL OR p_source = '' OR mc.source ILIKE p_source)
      -- Gia' contattato di recente su QUALUNQUE strada: si lascia in pace.
      AND NOT EXISTS (
        SELECT 1 FROM public.openwa_messages m
        WHERE m.direction = 'outbound'
          AND public.openwa_norm_tel(m.contact_phone) = public.openwa_norm_tel(mc.phone)
          AND m.created_at > now() - make_interval(days => GREATEST(COALESCE(p_giorni_riposo, 90), 0))
      )
    -- Fra i doppioni vince la scheda piu' completa, poi la piu' recente.
    ORDER BY public.openwa_norm_tel(mc.phone),
             (mc.first_name IS NOT NULL) DESC, mc.created_at DESC
    LIMIT COALESCE(p_limite, 100000)
  ) x;
$function$;

CREATE OR REPLACE FUNCTION public.openwa_campagna_carica_lista(
  p_campagna_id uuid,
  p_tags text[] DEFAULT NULL,
  p_citta text DEFAULT NULL,
  p_provincia text DEFAULT NULL,
  p_source text DEFAULT NULL,
  p_limite integer DEFAULT NULL,
  p_giorni_riposo integer DEFAULT 90
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

  IF NOT EXISTS (
    SELECT 1 FROM public.openwa_campagne
    WHERE id = p_campagna_id AND stato IN ('bozza','in_pausa','in_corso')
  ) THEN
    RAISE EXCEPTION 'Campagna inesistente o non piu'' modificabile' USING ERRCODE = '22023';
  END IF;

  WITH candidati AS (
    SELECT DISTINCT ON (public.openwa_norm_tel(mc.phone)) mc.id
    FROM public.marketing_contacts mc
    WHERE mc.company_id = '00000000-0000-0000-0000-000000000001'
      AND mc.phone IS NOT NULL AND mc.phone <> ''
      AND public.openwa_norm_tel(mc.phone) IS NOT NULL
      AND mc.optout_whatsapp IS NOT TRUE
      AND (p_tags IS NULL OR array_length(p_tags, 1) IS NULL OR mc.tags && p_tags)
      AND (p_citta IS NULL OR p_citta = '' OR mc.city ILIKE p_citta)
      AND (p_provincia IS NULL OR p_provincia = '' OR mc.province ILIKE p_provincia)
      AND (p_source IS NULL OR p_source = '' OR mc.source ILIKE p_source)
      AND NOT EXISTS (
        SELECT 1 FROM public.openwa_messages m
        WHERE m.direction = 'outbound'
          AND public.openwa_norm_tel(m.contact_phone) = public.openwa_norm_tel(mc.phone)
          AND m.created_at > now() - make_interval(days => GREATEST(COALESCE(p_giorni_riposo, 90), 0))
      )
      -- Ne' gia' in coda in un'ALTRA campagna con lo stesso numero: due
      -- campagne parallele scriverebbero due volte alla stessa persona.
      AND NOT EXISTS (
        SELECT 1
        FROM public.openwa_campagna_destinatari d2
        JOIN public.marketing_contacts mc2 ON mc2.id = d2.contact_id
        WHERE public.openwa_norm_tel(mc2.phone) = public.openwa_norm_tel(mc.phone)
          AND d2.stato IN ('da_inviare','inviato','followup_inviato')
      )
    ORDER BY public.openwa_norm_tel(mc.phone),
             (mc.first_name IS NOT NULL) DESC, mc.created_at DESC
    LIMIT COALESCE(p_limite, 100000)
  ), ins AS (
    INSERT INTO public.openwa_campagna_destinatari (campagna_id, contact_id)
    SELECT p_campagna_id, c.id FROM candidati c
    ON CONFLICT (campagna_id, contact_id) DO NOTHING
    RETURNING 1
  )
  SELECT COALESCE(count(*), 0)::integer INTO v_inseriti FROM ins;

  RETURN v_inseriti;
END;
$function$;

REVOKE ALL ON FUNCTION public.openwa_campagna_anteprima(text[], text, text, text, integer, integer) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.openwa_campagna_carica_lista(uuid, text[], text, text, text, integer, integer) FROM PUBLIC, anon;

NOTIFY pgrst, 'reload schema';
