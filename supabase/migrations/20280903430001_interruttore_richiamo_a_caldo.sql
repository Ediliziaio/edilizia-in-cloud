-- Interruttore generale del richiamo a caldo, SPENTO.
--
-- Finora il sistema era "spento per caso": non partiva perché mancavano la
-- chiave ElevenLabs e il numero. È una condizione fragile — il giorno in cui
-- quelle due cose arrivano, il richiamo comincerebbe a proporre telefonate
-- senza che nessuno l'abbia deciso.
--
-- Da qui in avanti è spento PER SCELTA: finché questa chiave non vale 'true',
-- ai-voice-outbound-leads esce subito senza guardare nemmeno un lead. Si
-- accende dalle impostazioni di piattaforma (Piattaforma → Richiamo a caldo).
INSERT INTO public.platform_settings (key, value, updated_at)
VALUES ('richiamo_a_caldo_attivo', 'false', now())
ON CONFLICT (key) DO NOTHING;
