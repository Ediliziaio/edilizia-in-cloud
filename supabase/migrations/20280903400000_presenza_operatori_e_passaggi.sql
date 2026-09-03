-- ============================================================================
-- Presenza operatori e passaggio della chiamata
-- ============================================================================
-- Quando l'assistente vocale decide di passare il cliente a una persona, due
-- cose devono essere vere insieme:
--
--   1. che quella persona ci sia davvero. Trasferire su un numero fisso "a
--      prescindere" significa, prima o poi, mandare un cliente nel vuoto o su
--      un telefono già occupato.
--   2. che sappia chi ha di fronte. Con Telnyx l'AI non può riassumere a voce
--      all'operatore (è una funzione riservata a Twilio), e il numero che
--      appare sul display è il NOSTRO, non quello del cliente: senza una
--      scheda a schermo l'operatore risponde alla cieca.
--
-- Da qui due tabelle: chi è disponibile adesso, e la scheda del passaggio.
-- ============================================================================

-- ── Chi è al pezzo, adesso ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.operatori_presenza (
  company_id          uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  user_id             uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  -- Numero su cui squillare: è il telefono che l'assistente compone davvero.
  telefono            text,
  disponibile         boolean NOT NULL DEFAULT false,
  -- Battito dalla app aperta. Senza, un "disponibile" resta acceso per sempre
  -- anche a computer spento, ed è il modo più semplice per perdere un cliente.
  ultimo_segnale      timestamptz NOT NULL DEFAULT now(),
  -- Impostato quando gli passiamo una chiamata: non gliene arrivano due insieme.
  occupato_fino_a     timestamptz,
  -- Per la rotazione equa: passa al meno servito di recente.
  ultimo_passaggio_at timestamptz,
  aggiornato_il       timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (company_id, user_id)
);

COMMENT ON TABLE public.operatori_presenza IS
  'Chi è disponibile a ricevere una chiamata passata dall''assistente vocale, e su quale numero.';

CREATE INDEX IF NOT EXISTS idx_operatori_presenza_liberi
  ON public.operatori_presenza (company_id, disponibile, ultimo_segnale DESC);

-- ── La scheda che l'operatore legge mentre squilla ──────────────────────────
CREATE TABLE IF NOT EXISTS public.passaggi_chiamata (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id       uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  operatore_id     uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  contact_id       uuid REFERENCES public.marketing_contacts(id) ON DELETE SET NULL,
  opportunity_id   uuid REFERENCES public.marketing_opportunities(id) ON DELETE SET NULL,
  nome_cliente     text,
  telefono_cliente text,
  -- Quello che l'assistente ha capito: è il contenuto della scheda.
  riassunto        text,
  stato            text NOT NULL DEFAULT 'in_attesa'
                     CHECK (stato IN ('in_attesa', 'risposto', 'persa', 'annullato')),
  conversation_id  text,
  creato_il        timestamptz NOT NULL DEFAULT now(),
  chiuso_il        timestamptz
);

COMMENT ON TABLE public.passaggi_chiamata IS
  'Scheda del cliente mostrata all''operatore nel momento in cui l''assistente gli passa la chiamata.';

CREATE INDEX IF NOT EXISTS idx_passaggi_operatore_attesa
  ON public.passaggi_chiamata (operatore_id, stato, creato_il DESC);
CREATE INDEX IF NOT EXISTS idx_passaggi_company
  ON public.passaggi_chiamata (company_id, creato_il DESC);

-- ── RLS: ognuno vede la propria azienda ─────────────────────────────────────
ALTER TABLE public.operatori_presenza ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.passaggi_chiamata  ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "presenza per azienda" ON public.operatori_presenza;
CREATE POLICY "presenza per azienda" ON public.operatori_presenza
  FOR ALL USING (public.user_can_access_company(company_id))
  WITH CHECK (public.user_can_access_company(company_id));

DROP POLICY IF EXISTS "passaggi per azienda" ON public.passaggi_chiamata;
CREATE POLICY "passaggi per azienda" ON public.passaggi_chiamata
  FOR ALL USING (public.user_can_access_company(company_id))
  WITH CHECK (public.user_can_access_company(company_id));

-- La scheda deve comparire da sola sullo schermo: senza realtime l'operatore
-- la vedrebbe solo ricaricando la pagina, cioè mai, perché nel frattempo sta
-- rispondendo al telefono.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'passaggi_chiamata'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.passaggi_chiamata;
  END IF;
END $$;

-- ── Chi è libero adesso ─────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.operatore_libero(p_company_id uuid)
RETURNS TABLE (user_id uuid, nome text, telefono text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    p.id,
    COALESCE(
      NULLIF(TRIM(COALESCE(p.first_name, '') || ' ' || COALESCE(p.last_name, '')), ''),
      p.email,
      'Collega'
    ),
    op.telefono
  FROM public.operatori_presenza op
  JOIN public.profiles p ON p.id = op.user_id
  WHERE op.company_id = p_company_id
    AND op.disponibile
    AND op.telefono IS NOT NULL
    AND length(regexp_replace(op.telefono, '\s', '', 'g')) >= 8
    -- Tre minuti senza battito = non c'è. Il battito arriva ogni minuto, quindi
    -- si tollera un buco senza dichiarare assente chi è solo su rete lenta.
    AND op.ultimo_segnale > now() - interval '3 minutes'
    AND (op.occupato_fino_a IS NULL OR op.occupato_fino_a < now())
  ORDER BY op.ultimo_passaggio_at NULLS FIRST, op.ultimo_segnale DESC
  LIMIT 1;
$$;

COMMENT ON FUNCTION public.operatore_libero(uuid) IS
  'Il prossimo operatore a cui passare una chiamata: disponibile, con un numero, visto negli ultimi 3 minuti e non già occupato. Rotazione sul meno servito.';

-- ── Passaggio atomico: scegli, segna occupato, scrivi la scheda ─────────────
-- In un'unica funzione perché i tre passi non possono separarsi: se due
-- chiamate arrivano insieme, senza il lock finirebbero sullo stesso operatore.
CREATE OR REPLACE FUNCTION public.passa_chiamata_a_operatore(
  p_company_id      uuid,
  p_nome_cliente    text DEFAULT NULL,
  p_telefono        text DEFAULT NULL,
  p_riassunto       text DEFAULT NULL,
  p_contact_id      uuid DEFAULT NULL,
  p_opportunity_id  uuid DEFAULT NULL,
  p_conversation_id text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id  uuid;
  v_nome     text;
  v_telefono text;
  v_passaggio uuid;
BEGIN
  -- FOR UPDATE SKIP LOCKED: due chiamate contemporanee prendono due operatori
  -- diversi invece di litigarsi lo stesso.
  SELECT op.user_id INTO v_user_id
  FROM public.operatori_presenza op
  WHERE op.company_id = p_company_id
    AND op.disponibile
    AND op.telefono IS NOT NULL
    AND length(regexp_replace(op.telefono, '\s', '', 'g')) >= 8
    AND op.ultimo_segnale > now() - interval '3 minutes'
    AND (op.occupato_fino_a IS NULL OR op.occupato_fino_a < now())
  ORDER BY op.ultimo_passaggio_at NULLS FIRST, op.ultimo_segnale DESC
  LIMIT 1
  FOR UPDATE SKIP LOCKED;

  IF v_user_id IS NULL THEN
    -- Nessuno libero: si scrive lo stesso la scheda, senza operatore. Il
    -- cliente non va perso, viene richiamato con tutto il contesto.
    INSERT INTO public.passaggi_chiamata (
      company_id, operatore_id, contact_id, opportunity_id,
      nome_cliente, telefono_cliente, riassunto, stato, conversation_id
    ) VALUES (
      p_company_id, NULL, p_contact_id, p_opportunity_id,
      p_nome_cliente, p_telefono, p_riassunto, 'persa', p_conversation_id
    )
    RETURNING id INTO v_passaggio;

    RETURN jsonb_build_object('trovato', false, 'passaggio_id', v_passaggio);
  END IF;

  SELECT
    COALESCE(
      NULLIF(TRIM(COALESCE(p.first_name, '') || ' ' || COALESCE(p.last_name, '')), ''),
      p.email,
      'Collega'
    ),
    op.telefono
  INTO v_nome, v_telefono
  FROM public.operatori_presenza op
  JOIN public.profiles p ON p.id = op.user_id
  WHERE op.company_id = p_company_id AND op.user_id = v_user_id;

  -- Occupato per due minuti: se risponde, la chiamata vera lo terrà occupato
  -- comunque; se non risponde torna libero da solo senza restare bloccato.
  UPDATE public.operatori_presenza
     SET occupato_fino_a     = now() + interval '2 minutes',
         ultimo_passaggio_at = now(),
         aggiornato_il       = now()
   WHERE company_id = p_company_id AND user_id = v_user_id;

  INSERT INTO public.passaggi_chiamata (
    company_id, operatore_id, contact_id, opportunity_id,
    nome_cliente, telefono_cliente, riassunto, stato, conversation_id
  ) VALUES (
    p_company_id, v_user_id, p_contact_id, p_opportunity_id,
    p_nome_cliente, p_telefono, p_riassunto, 'in_attesa', p_conversation_id
  )
  RETURNING id INTO v_passaggio;

  RETURN jsonb_build_object(
    'trovato',      true,
    'operatore',    v_nome,
    'telefono',     v_telefono,
    'passaggio_id', v_passaggio
  );
END;
$$;

COMMENT ON FUNCTION public.passa_chiamata_a_operatore IS
  'Sceglie un operatore libero, lo segna occupato e scrive la scheda del passaggio. Se non c''è nessuno registra la scheda come persa, così il cliente viene richiamato con il contesto.';

-- ── Il battito della app aperta ─────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.segnala_presenza_operatore(
  p_company_id  uuid,
  p_disponibile boolean,
  p_telefono    text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.assert_company_access(p_company_id);

  INSERT INTO public.operatori_presenza (company_id, user_id, telefono, disponibile, ultimo_segnale, aggiornato_il)
  VALUES (p_company_id, auth.uid(), NULLIF(TRIM(COALESCE(p_telefono, '')), ''), p_disponibile, now(), now())
  ON CONFLICT (company_id, user_id) DO UPDATE
    SET disponibile   = EXCLUDED.disponibile,
        -- Il numero si aggiorna solo se ne arriva uno nuovo: il battito che
        -- non lo porta non deve cancellare quello già salvato.
        telefono      = COALESCE(EXCLUDED.telefono, public.operatori_presenza.telefono),
        ultimo_segnale = now(),
        aggiornato_il  = now();
END;
$$;

COMMENT ON FUNCTION public.segnala_presenza_operatore IS
  'Battito dalla app: dichiara se sono disponibile a ricevere chiamate passate dall''assistente, e su quale numero.';

REVOKE ALL ON FUNCTION public.operatore_libero(uuid) FROM anon;
REVOKE ALL ON FUNCTION public.segnala_presenza_operatore(uuid, boolean, text) FROM anon;
REVOKE ALL ON FUNCTION public.passa_chiamata_a_operatore(uuid, text, text, text, uuid, uuid, text) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.operatore_libero(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.segnala_presenza_operatore(uuid, boolean, text) TO authenticated;
