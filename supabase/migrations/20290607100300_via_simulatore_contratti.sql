-- Via il Simulatore contratti di CRM & Vendita (25/11/2026, Florin).
--
-- Usato davvero da nessuno: 9 simulazioni in tutto, tutte bozze, nessuna trasformata in preventivo
-- o commessa; 4 nelle aziende dimostrative, 5 aperte una volta e lasciate (quattro senza voci, a 0 €).
-- Il codice è tolto nello stesso commit; i vecchi indirizzi /azienda/marketing/simulatore portano alle
-- Opportunità. Restano il Simulatore ROI dell'area admin (crm_roi_simulations) e il simulatore
-- dell'operazione in Commesse: sono altre cose.
--
-- Controllato prima: nessuna chiave esterna punta qui, nessuna vista, nessun trigger, nessuna funzione
-- o job cron nomina la tabella; non è tra le esclusioni del backup. Le righe sono nei backup settimanali
-- di company-exports (quelli del 25/11 per le aziende con righe non vuote).

SET LOCAL lock_timeout = '3s';

DROP TABLE IF EXISTS public.simulazioni;

-- La funzione di piano «simulatore» (accesa per tutti, nessun piano o azienda la nomina).
DELETE FROM public.platform_feature_flags WHERE key = 'simulatore';
