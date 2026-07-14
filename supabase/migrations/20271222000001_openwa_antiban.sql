-- WhatsApp Locale (OpenWA) — misure ANTI-BAN.
-- OpenWA usa WhatsApp Web non-ufficiale: il rischio principale è che WhatsApp
-- rilevi un comportamento "da bot" (numero nuovo che spamma, raffiche, orari
-- notturni, messaggi identici in massa) e blocchi il numero.
--
-- Contromisure introdotte:
--  1) WARM-UP: un numero appena collegato parte con pochissimi invii/giorno e
--     cresce gradualmente fino al daily_cap.  cap_oggi = min(daily_cap,
--     warmup_base + giorni_da_connected_since * warmup_step)
--  2) THROTTLE: intervallo minimo tra due invii dello stesso numero
--     (min_gap_seconds) — niente raffiche back-to-back.
--  3) last_message_at: timestamp reale dell'ultimo invio, per il throttle.

ALTER TABLE public.openwa_numbers
  ADD COLUMN IF NOT EXISTS connected_since   date,
  ADD COLUMN IF NOT EXISTS warmup_base       integer NOT NULL DEFAULT 3,
  ADD COLUMN IF NOT EXISTS warmup_step       integer NOT NULL DEFAULT 2,
  ADD COLUMN IF NOT EXISTS min_gap_seconds   integer NOT NULL DEFAULT 45,
  ADD COLUMN IF NOT EXISTS last_message_at   timestamptz;

-- Cap di default più prudente per i nuovi numeri (10 → 8). I numeri esistenti
-- restano invariati; questo cambia solo il default per gli inserimenti futuri.
ALTER TABLE public.openwa_numbers ALTER COLUMN daily_cap SET DEFAULT 8;

COMMENT ON COLUMN public.openwa_numbers.connected_since IS 'Data del primo collegamento riuscito: base del calcolo warm-up.';
COMMENT ON COLUMN public.openwa_numbers.warmup_base IS 'Invii consentiti il giorno 0 del warm-up.';
COMMENT ON COLUMN public.openwa_numbers.warmup_step IS 'Incremento giornaliero del cap durante il warm-up.';
COMMENT ON COLUMN public.openwa_numbers.min_gap_seconds IS 'Intervallo minimo (secondi) tra due invii dello stesso numero (throttle anti-raffica).';
