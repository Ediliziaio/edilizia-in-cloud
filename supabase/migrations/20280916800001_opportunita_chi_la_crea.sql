-- Opportunità: si ricorda chi l'ha creata.
--
-- 14/09/2026, richiesta del titolare guardando la scheda di BeMade: accanto a
-- «Creato il» vuole sapere anche DA CHI o DA COSA — il modulo, Facebook,
-- l'importazione, oppure la persona che l'ha inserita a mano. La fonte c'era
-- già (`source`), la persona no: nessuna colonna la registrava.
--
-- La colonna nasce senza valore predefinito e lo riceve subito dopo: con
-- `ADD COLUMN ... DEFAULT auth.uid()` in un colpo solo Postgres riscriverebbe
-- le 37.903 righe tenendo la tabella bloccata, perché il valore non è una
-- costante. Così è solo un cambio di catalogo.
--
-- `auth.uid()` vale per chi inserisce da app (anche passando da RPC), mentre
-- moduli, webhook Meta e importazioni girano col ruolo di servizio e lasciano
-- il campo vuoto: in quel caso la scheda mostra la fonte. Le opportunità già
-- esistenti restano senza autore — non c'è un registro da cui ricostruirlo.
--
-- Nessun vincolo verso gli utenti, di proposito: una chiave esterna su chi ha
-- creato la riga è esattamente il tipo di legame che bloccava la purga delle
-- aziende (vedi 20280911100008 e seguenti). È un dato informativo.

SET LOCAL lock_timeout = '3s';

ALTER TABLE public.marketing_opportunities
  ADD COLUMN IF NOT EXISTS created_by uuid;

ALTER TABLE public.marketing_opportunities
  ALTER COLUMN created_by SET DEFAULT auth.uid();

COMMENT ON COLUMN public.marketing_opportunities.created_by IS
  'Utente che ha inserito l''opportunità dall''app. Vuoto se è arrivata da modulo, webhook, importazione o automazione: allora vale source.';
