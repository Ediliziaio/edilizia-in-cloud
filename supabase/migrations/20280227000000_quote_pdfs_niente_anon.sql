-- I PDF dei preventivi non si firmano piu' con la chiave anon.
--
-- `qp_anon_sel` (SELECT TO anon, solo bucket_id) permetteva a chiunque, senza
-- login, di farsi firmare l'URL di qualsiasi preventivo conoscendo il path —
-- e i nomi sono prevedibili: <uuid azienda>/OFF-2026-001.pdf. Verificato in
-- produzione il 2026-08-26: la firma anon veniva concessa.
--
-- Nessun flusso vivo ne ha bisogno: le due pagine pubbliche (/preventivo/:id
-- e /firma-fea/:token) ricevono il PDF dal SERVER — quote-sign action=view e
-- fea-documento-pubblico validano il token e firmano con la service key, che
-- non passa dalla RLS. Gli URL gia' firmati nelle email vecchie continuano a
-- funzionare: un URL firmato non riconsulta le policy. Restano le policy
-- per-azienda (qp_sel/qp_ins/qp_upd/qp_del) per l'area autenticata.
DROP POLICY IF EXISTS "qp_anon_sel" ON storage.objects;

-- `documenti-firmati`: bucket a zero file, zero riferimenti nel codice, ma con
-- una SELECT aperta a public ("firmati_read"). Un bucket morto non ha bisogno
-- di una porta aperta: se un giorno rinasce, rinascera' con una policy
-- per-azienda.
DROP POLICY IF EXISTS "firmati_read" ON storage.objects;
