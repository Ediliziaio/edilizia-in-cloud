-- Il blocca prezzo ancora aperto è un'uscita di cassa CERTA nel "se" ma non nel
-- "quando": senza una data il piano a 13 settimane può solo metterlo nel
-- cassetto "senza data". Con la data prevista cade nella settimana giusta e la
-- riga rossa si vede in anticipo, che è il motivo per cui esiste il piano.
ALTER TABLE public.blocca_prezzo
  ADD COLUMN IF NOT EXISTS data_prevista_restituzione date;

COMMENT ON COLUMN public.blocca_prezzo.data_prevista_restituzione IS
  'Quando si prevede di ridare indietro la somma. Alimenta il previsionale di cassa; se vuota il movimento resta dichiarato fra quelli "senza data".';
