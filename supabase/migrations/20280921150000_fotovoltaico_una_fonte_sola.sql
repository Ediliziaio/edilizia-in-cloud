-- ════════════════════════════════════════════════════════════════════════════
-- Fotovoltaico: una fonte sola per dire se un'azienda ha il modulo
-- ════════════════════════════════════════════════════════════════════════════
--
-- PERCHÉ
-- Il 21/09/2026 Renova non poteva fare preventivi fotovoltaici: il suo piano
-- include il modulo (funzione `modulo_fotovoltaico_attivo`, che guardano rotta,
-- menu, moduli di vendita e salvataggio), ma la pagina del Fotovoltaico
-- guardava ANCHE la vecchia colonna companies.fv_modulo_attivo — superata già
-- dal 27/04/2026, con la pulizia «pianificata dopo verifica produzione» e mai
-- fatta. Nessuna schermata la accende più: chi l'aveva accesa, l'aveva avuta a
-- mano. Bloccate allo stesso modo Best Infissi e Bagni Milano (zero preventivi
-- FV tutte e tre). La colonna gemella fv_setup_completato non la scriveva
-- nessuno, e mostrava il benvenuto AL POSTO dell'elenco a chi di progetti ne
-- aveva già (Green Energy 18, Suntech 7).
--
-- Dal 21/09/2026 il codice non legge più nessuna delle due (pagina e funzione
-- fv-onboarding-cliente decidono solo con resolve_company_feature). Un test
-- di guardia (src/test/logic/fotovoltaicoModuloAccess.test.ts) fa fallire la
-- CI se qualcuno torna a leggerle. Le colonne restano, per non perdere dati e
-- non toccare una tabella così usata: questa migrazione cambia solo i
-- commenti, così chi guarda il database sa che non contano più.
-- ════════════════════════════════════════════════════════════════════════════

COMMENT ON COLUMN public.companies.fv_modulo_attivo IS
  'NON PIÙ LETTA dal 21/09/2026. Chi può usare il modulo Fotovoltaico lo decide solo '
  'resolve_company_feature(company_id, ''modulo_fotovoltaico_attivo'') — il piano o un override. '
  'Accenderla o spegnerla non cambia niente. Superata dal 27/04/2026.';

COMMENT ON COLUMN public.companies.fv_setup_completato IS
  'NON PIÙ LETTA dal 21/09/2026: non la scriveva nessuno, e mostrava il benvenuto al posto '
  'dell''elenco dei progetti. La pagina del Fotovoltaico mostra lo stato vuoto quando '
  'l''azienda non ha ancora progetti.';
