-- Piano economico delle commesse generali (20281031110000), correzione.
-- Il trigger delle voci (generale_piano_voci_coerente) gira coi diritti di chi
-- scrive dal browser e normalizza le categorie di costo con generale_piano_norm:
-- senza EXECUTE per authenticated l'inserimento di una voce falliva con 42501.
-- È una funzione pura sul testo (minuscole, niente accenti, «_»): niente dati.
-- Resta chiusa ad anon. Idempotente.
grant execute on function public.generale_piano_norm(text) to authenticated;
