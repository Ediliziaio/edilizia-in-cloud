-- La validità di un listino fornitore non può finire prima di cominciare.
--
-- Fino al 12/11/2026 le date non si scrivevano da nessuna parte nell'interfaccia,
-- quindi un intervallo rovesciato era irraggiungibile. Da quando la scheda del
-- fornitore le lascia correggere, «dal 2027-01-01 al 2026-01-01» è a un colpo di
-- freccia: il listino risulterebbe scaduto in silenzio e smetterebbe di essere
-- quello buono senza che nessuno lo abbia deciso. La guardia c'è già nella
-- scheda; questa è quella che vale anche per chi scrive dal database o da un
-- programma, cioè l'unica che non si può dimenticare.
--
-- Nessuna riga da bonificare: al 15/11/2026 i listini sono cinquanta, nessuno
-- con le date rovesciate.
SET LOCAL lock_timeout = '3s';
SET LOCAL statement_timeout = '60s';

ALTER TABLE public.listini_fornitore
  DROP CONSTRAINT IF EXISTS listini_fornitore_validita_coerente;

ALTER TABLE public.listini_fornitore
  ADD CONSTRAINT listini_fornitore_validita_coerente
  CHECK (valido_dal IS NULL OR valido_al IS NULL OR valido_dal <= valido_al);

COMMENT ON CONSTRAINT listini_fornitore_validita_coerente ON public.listini_fornitore
  IS 'La fine della validità non può precedere l''inizio: un listino rovesciato risulterebbe scaduto in silenzio. Date nulle ammesse: valido_dal nullo vale da sempre, valido_al nullo è senza scadenza.';
