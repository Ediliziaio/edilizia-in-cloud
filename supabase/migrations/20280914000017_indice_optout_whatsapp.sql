-- openwa_campagna_prossimi esclude chi ha fatto opt-out confrontando il numero
-- normalizzato con TUTTI i contatti dell'azienda (125k righe, scansione intera
-- a ogni giro di 10 minuti): con le campagne serramenti attive la RPC superava
-- gli 8 secondi di statement_timeout e il giro saltava. L'indice parziale copre
-- solo gli opt-out, che sono pochissimi: la stessa query passa da 1,4 s a 20 ms.
-- Sul live è stato creato CONCURRENTLY l'11/09/2026; qui resta idempotente.
CREATE INDEX IF NOT EXISTS idx_mc_optout_whatsapp_tel
  ON public.marketing_contacts (company_id, public.openwa_norm_tel(phone))
  WHERE optout_whatsapp IS TRUE;
