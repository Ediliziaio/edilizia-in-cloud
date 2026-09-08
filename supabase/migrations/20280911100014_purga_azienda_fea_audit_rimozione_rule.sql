-- Ultimo passo della purga aziende, e l'unico dell'intero lavoro che cambia
-- davvero un meccanismo di protezione: per questo e' isolato qui, ed e' stato
-- eseguito da una persona e non da un agente.
--
-- La …013 ha gia' installato il trigger equivalente, che finora non scattava
-- perche' le rule svuotano la query prima che i trigger vengano considerati.
-- Tolte le rule, il trigger prende il loro posto: per chi usa l'applicazione
-- non cambia niente (UPDATE e DELETE su fea_audit_log continuano a non fare
-- nulla, senza errore), ma l'integrita' referenziale non viene piu' riscritta
-- al parser e quindi il cascade dell'azienda puo' finalmente passare.
--
-- Con le rule fuori gioco diventa anche possibile agganciare la tabella
-- all'azienda: `fea_audit_log.company_id` era NOT NULL ma senza alcuna chiave,
-- quindi le sue righe sopravvivevano a qualunque cancellazione. Zero orfani.

SET LOCAL lock_timeout = '3s';
SET LOCAL statement_timeout = '60s';

DROP RULE IF EXISTS fea_audit_no_delete ON public.fea_audit_log;
DROP RULE IF EXISTS fea_audit_no_update ON public.fea_audit_log;

ALTER TABLE public.fea_audit_log DROP CONSTRAINT IF EXISTS fea_audit_log_company_id_fkey;
ALTER TABLE public.fea_audit_log ADD  CONSTRAINT fea_audit_log_company_id_fkey
  FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE;
