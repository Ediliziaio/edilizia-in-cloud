-- Un `ON DELETE SET NULL` su una colonna che un CHECK pretende non e' una
-- scelta discutibile: e' un errore garantito. Quando quella colonna e' l'unica
-- valorizzata, azzerarla produce una riga che il CHECK rifiuta, e la
-- cancellazione salta con un messaggio grezzo.
--
-- Trovato rifacendo la prova di purga su tutte le aziende: renova solution srl
-- si fermava su
--     new row for relation "bundle_voci" violates check constraint
--     "bundle_voci_ha_item"
-- perche' purgando l'azienda spariscono le sue `tariffe_aziendali`, il
-- `tariffa_id` va a NULL e quella riga non ha altro. E' la stessa trappola gia'
-- annotata per i bonus edilizi: CHECK "almeno una FK non nulla" + SET NULL.
--
-- Cercandola in tutto lo schema, i casi sono quattro su tre tabelle:
--   bundle_voci.tariffa_id             27 righe su 144 romperebbero (attivo)
--   bank_reconciliations.scadenza_id    1 riga  su  65 romperebbe   (attivo)
--   bundle_voci.prodotto_id             0 oggi, struttura identica  (latente)
--   ai_agent_conversations.agent_v2_id  0 oggi, tabella vuota       (latente)
--
-- Non e' solo un problema della purga. Oggi, in produzione, cancellare una
-- tariffa aziendale usata in un bundle FALLISCE SEMPRE — e l'utente vede il
-- vincolo del database, non una frase.
--
-- La regola giusta la dichiara il CHECK stesso: la riga non puo' esistere
-- senza almeno un item, quindi quando l'item se ne va la riga lo segue. E'
-- anche cio' che fa gia' `bundle_voci.family_id`, che e' CASCADE dalla nascita:
-- le tre colonne dello stesso CHECK si comportavano in due modi diversi.
--
-- Il limite, dichiarato: se una riga avesse DUE item e ne sparisse uno, CASCADE
-- la cancella anche se l'altro basterebbe a tenerla valida. Oggi non esiste
-- nessuna riga con piu' di un item (117 solo family, 27 solo tariffa, zero
-- miste), e fra una cancellazione un po' larga e un errore certo la scelta non
-- e' dubbia. Se un domani le righe miste diventassero un caso reale, la forma
-- corretta e' un trigger che azzera e poi cancella solo se resta vuota.

SET LOCAL lock_timeout = '3s';
SET LOCAL statement_timeout = '60s';

ALTER TABLE public.bundle_voci DROP CONSTRAINT IF EXISTS bundle_voci_tariffa_id_fkey;
ALTER TABLE public.bundle_voci ADD  CONSTRAINT bundle_voci_tariffa_id_fkey
  FOREIGN KEY (tariffa_id) REFERENCES public.tariffe_aziendali(id) ON DELETE CASCADE;

ALTER TABLE public.bundle_voci DROP CONSTRAINT IF EXISTS bundle_voci_prodotto_id_fkey;
ALTER TABLE public.bundle_voci ADD  CONSTRAINT bundle_voci_prodotto_id_fkey
  FOREIGN KEY (prodotto_id) REFERENCES public.article_templates(id) ON DELETE CASCADE;

ALTER TABLE public.bank_reconciliations DROP CONSTRAINT IF EXISTS bank_reconciliations_scadenza_id_fkey;
ALTER TABLE public.bank_reconciliations ADD  CONSTRAINT bank_reconciliations_scadenza_id_fkey
  FOREIGN KEY (scadenza_id) REFERENCES public.scadenze(id) ON DELETE CASCADE;

ALTER TABLE public.ai_agent_conversations DROP CONSTRAINT IF EXISTS ai_agent_conversations_agent_v2_id_fkey;
ALTER TABLE public.ai_agent_conversations ADD  CONSTRAINT ai_agent_conversations_agent_v2_id_fkey
  FOREIGN KEY (agent_v2_id) REFERENCES public.ai_agents_v2(id) ON DELETE CASCADE;
