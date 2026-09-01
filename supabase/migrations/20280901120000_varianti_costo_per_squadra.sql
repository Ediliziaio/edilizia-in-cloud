-- ============================================================================
-- Varianti di costo manodopera collegate alla squadra.
--
-- L'idea dell'utente, con l'infrastruttura che gia' esisteva: "una lavorazione,
-- piu' varianti di costo in base alla squadra — e quando la uso, il sistema mi
-- fa la scelta". tariffa_costi_varianti (Sprint B) era il posto giusto ma era
-- DORMIENTE (zero righe ovunque) e non sapeva chi fosse la squadra: aveva
-- fornitore_id (suppliers) e risorsa_id, mentre le squadre di posa vivono in
-- external_teams.
--
-- Con external_team_id la variante dice "questa lavorazione, fatta da QUESTA
-- squadra, costa X": nel dialog manodopera, scelta la squadra e la voce di
-- listino, il costo si risolve dalla variante della squadra (se esiste),
-- altrimenti dal costo base della tariffa.
-- ============================================================================

ALTER TABLE public.tariffa_costi_varianti
  ADD COLUMN IF NOT EXISTS external_team_id uuid
    REFERENCES public.external_teams(id) ON DELETE CASCADE;

COMMENT ON COLUMN public.tariffa_costi_varianti.external_team_id IS
  'Squadra a cui appartiene questa variante di costo. NULL = variante non legata a una squadra (modalita'' contabile generica).';
