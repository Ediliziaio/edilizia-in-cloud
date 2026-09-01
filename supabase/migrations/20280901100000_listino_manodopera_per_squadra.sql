-- ============================================================================
-- Listino manodopera per squadra/subappaltatore.
--
-- "Nel listino manodopera devo creare solo UN listino, ma se ho piu' squadre
-- con listini diversi?" — caso reale: il subappaltatore gira il SUO listino
-- posa (es. Vais Home srl, listino 2024), un'altra squadra ne ha un altro.
-- tariffe_aziendali era piatto: un listino unico aziendale.
--
-- external_team_id, nullable:
--   NULL      = voce del listino aziendale generico (tutte le 44 voci esistenti
--               restano cosi': nessun comportamento cambia da solo)
--   valorizzato = voce del listino di QUELLA squadra
--
-- Nel dialog "Aggiungi manodopera", scelta la squadra si vedono le sue voci
-- (prima) e le generiche; MAI le voci delle altre squadre — il prezzo di Vais
-- non deve suggerirsi quando la posa la fa Esposito.
--
-- ON DELETE SET NULL: se la squadra sparisce, il suo listino torna generico
-- invece di sparire con lei (i prezzi restano consultabili).
-- ============================================================================

ALTER TABLE public.tariffe_aziendali
  ADD COLUMN IF NOT EXISTS external_team_id uuid
    REFERENCES public.external_teams(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.tariffe_aziendali.external_team_id IS
  'Listino della singola squadra/subappaltatore. NULL = listino aziendale generico.';
