-- Quinta natura di ostacolo alla purga (vedi …008): RULE AL POSTO DI TRIGGER.
--
-- `fea_audit_log` — la traccia probatoria della firma elettronica avanzata —
-- e' resa append-only da due RULE `DO INSTEAD NOTHING`. Le rule non sono
-- trigger: riscrivono le query AL PARSER, e quindi riscrivono anche quelle che
-- l'integrita' referenziale genera per conto suo. Su quella tabella nessuna
-- azione di chiave esterna puo' funzionare: il cascade non fallisce con un
-- messaggio di vincolo, ma con
--     "referential integrity query on companies ... gave unexpected result
--      HINT: this is most likely due to a rule having rewritten the query"
-- che e' esattamente il sintomo, ed e' illeggibile se non si sa cosa cercare.
-- Sono le uniche due rule dell'intero database: un caso isolato.
--
-- Questa migrazione fa i due passi SICURI, quelli che non cambiano il
-- comportamento di nulla:
--
--  1. Installa il trigger equivalente. Un BEFORE che ritorna NULL fa
--     esattamente cio' che fa `DO INSTEAD NOTHING`. Finche' le rule ci sono,
--     il trigger non scatta nemmeno (la rule svuota la query prima): le due
--     protezioni convivono senza disturbarsi, e questo permette di installare
--     la nuova PRIMA di togliere la vecchia, senza un istante scoperto.
--  2. Porta `request_id` da RESTRICT a NO ACTION, come in …010: la protezione
--     resta (cancellare una richiesta di firma che ha una traccia continua a
--     dare errore), ma il controllo avviene a fine istruzione.
--
-- Il passo che RIMUOVE le rule, e che aggancia `fea_audit_log` all'azienda,
-- sta nella migrazione successiva: e' l'unico dell'intero lavoro che cambia
-- davvero un meccanismo di protezione, e va eseguito da una persona.

SET LOCAL lock_timeout = '3s';
SET LOCAL statement_timeout = '60s';

DROP TRIGGER IF EXISTS trg_fea_audit_immutable ON public.fea_audit_log;
CREATE TRIGGER trg_fea_audit_immutable
  BEFORE DELETE OR UPDATE ON public.fea_audit_log
  FOR EACH ROW WHEN (public.azienda_ancora_esiste(OLD.company_id))
  EXECUTE FUNCTION public.annulla_operazione_su_riga();

ALTER TABLE public.fea_audit_log DROP CONSTRAINT IF EXISTS fea_audit_log_request_id_fkey;
ALTER TABLE public.fea_audit_log ADD  CONSTRAINT fea_audit_log_request_id_fkey
  FOREIGN KEY (request_id) REFERENCES public.signature_requests(id);
