-- Freno agli invii delle automazioni: tetto di messaggi al minuto per azienda e per canale.
--
-- 08/10/2026: il promemoria di una sequenza è scattato per ~950 contatti alla stessa ora; il motore ha mandato
-- ~30 WhatsApp al minuto per mezz'ora e alle 11:47 il database ha smesso di accettare connessioni.
-- `freno_invii_prenota` prenota un posto nel minuto corrente in modo ATOMICO (più giri del motore insieme non
-- superano il tetto): true = si può inviare, false = aspetta il minuto dopo. Il tetto lo decide il motore
-- (_shared/frenoInvii.ts).

CREATE TABLE IF NOT EXISTS public.automazioni_freno_invii (
  company_id uuid NOT NULL,
  canale     text NOT NULL,
  minuto     timestamptz NOT NULL,
  inviati    integer NOT NULL DEFAULT 0,
  PRIMARY KEY (company_id, canale, minuto)
);
ALTER TABLE public.automazioni_freno_invii ENABLE ROW LEVEL SECURITY;
-- Nessuna policy: la legge e la scrive solo il motore (service role) attraverso la funzione qui sotto.

CREATE OR REPLACE FUNCTION public.freno_invii_prenota(p_company_id uuid, p_canale text, p_limite integer)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $$
DECLARE
  v_minuto timestamptz := date_trunc('minute', now());
  v_ok integer;
BEGIN
  IF p_company_id IS NULL OR p_canale IS NULL OR coalesce(p_limite, 0) <= 0 THEN
    RETURN true;
  END IF;

  INSERT INTO public.automazioni_freno_invii AS f (company_id, canale, minuto, inviati)
  VALUES (p_company_id, p_canale, v_minuto, 1)
  ON CONFLICT (company_id, canale, minuto)
  DO UPDATE SET inviati = f.inviati + 1
     WHERE f.inviati < p_limite
  RETURNING 1 INTO v_ok;

  -- Pulizia leggera: i minuti di più di un'ora fa non servono più.
  IF random() < 0.02 THEN
    DELETE FROM public.automazioni_freno_invii WHERE minuto < now() - interval '1 hour';
  END IF;

  RETURN v_ok IS NOT NULL;
END;
$$;

REVOKE ALL ON FUNCTION public.freno_invii_prenota(uuid, text, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.freno_invii_prenota(uuid, text, integer) TO service_role;
