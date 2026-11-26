-- Protocollo per cantiere: la sigla manca alla vista che il browser legge davvero.
--
-- `protocollo_sigla` è nata su `orders` il 25/11/2026 (protocollo_cantiere_*), ma il browser
-- non legge mai `orders`: `protectedOrderRequests` riscrive ogni GET verso `orders_visibili`.
-- La colonna non è stata aggiunta alla vista, quindi la pagina Protocollo chiede una colonna
-- che per lei non esiste e PostgREST risponde 42703. Nessuno se n'è accorto: l'errore finisce
-- nei log e a schermo resta una lista vuota. 125 richieste fallite fra il 25 e il 26/11.
--
-- Stessa regola delle fasi e delle voci (CLAUDE.md): una colonna nuova che il browser deve
-- leggere va aggiunta alla vista, non basta metterla sulla tabella.
--
-- Si aggiunge in coda alla definizione viva, col modo già usato da
-- `20290420124000_contratto_piano_sal_aperto`: nessuna riscrittura a mano della vista, così
-- le colonne protette (importi, pagamenti) restano esattamente come sono. La sigla non è un
-- importo e non passa da `r.rights`: la vede chi vede la commessa.

DO $vista$
DECLARE d text; cambiata text;
BEGIN
  d := pg_get_viewdef('public.orders_visibili'::regclass, true);
  IF position('protocollo_sigla' IN d) > 0 THEN RETURN; END IF;
  IF d !~* '\mFROM\M\s+(public\.)?orders\M' THEN
    RAISE EXCEPTION 'Vista delle commesse non riconosciuta: non trovo da dove legge.';
  END IF;
  cambiata := regexp_replace(d, '(\mFROM\M\s+(public\.)?orders\M)', ', orders.protocollo_sigla \1', 'i');
  EXECUTE 'CREATE OR REPLACE VIEW public.orders_visibili WITH(security_barrier=true) AS ' || cambiata;
END $vista$;

-- Meglio fallire qui che lasciare la pagina muta un'altra volta.
DO $controllo$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = 'orders_visibili' AND column_name = 'protocollo_sigla'
  ) THEN
    RAISE EXCEPTION 'orders_visibili non espone protocollo_sigla: la pagina Protocollo resterebbe rotta.';
  END IF;
END $controllo$;
