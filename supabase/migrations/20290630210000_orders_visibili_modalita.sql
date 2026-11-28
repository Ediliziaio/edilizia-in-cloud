-- `orders_visibili` deve avere la modalità, altrimenti dal browser non si scrive
-- ─────────────────────────────────────────────────────────────────────────────
-- 28/11/2026, dalla prova in app del lotto 2.
--
-- La tendina «Come si misura e si fattura» salvava e il valore non cambiava. In console:
--
--     PGRST204 — Could not find the 'modalita_lavoro' column of 'orders_visibili'
--
-- Il client riscrive verso le viste protette **anche le scritture** su `orders`:
-- `protectedOrderUrl` (in `src/lib/orders/protectedOrderRequests.ts`) non riceve il metodo, al
-- contrario di `protectedPhaseUrl` e `protectedSalUrl`, quindi ogni PATCH del browser su `orders`
-- finisce su `orders_visibili`. La vista elenca le colonne una per una: una colonna nuova non
-- compare da sola, e quello che non compare non si può né leggere né scrivere.
--
-- Qui la colonna si aggiunge in coda alla vista, prendendo la definizione dal catalogo invece di
-- ricopiarla (sono 5.783 caratteri, e altre sessioni la cambiano): così la migrazione non litiga
-- con le loro. `CREATE OR REPLACE VIEW` può aggiungere colonne **solo alla fine** (altrimenti
-- 42P16), ed è quello che fa.
--
-- La modalità non è un importo e non è un costo: nessun CASE sui diritti, la vedono tutti quelli
-- che vedono la commessa.
--
-- **Trovato per strada, non corretto qui:** `orders.tariffa_manodopera_id` non è nella vista, e
-- nemmeno protetta da un CASE — è semplicemente rimasta fuori. Chi la scrive dal browser prende lo
-- stesso PGRST204. Non la tocco perché non so se l'omissione è voluta; va guardata.
-- Idempotente.

SET LOCAL lock_timeout = '3s';
SET LOCAL statement_timeout = '60s';

do $$
declare v_def text; v_punto int;
begin
  select pg_get_viewdef('public.orders_visibili'::regclass, true) into v_def;
  if position('modalita_lavoro' in v_def) > 0 then
    return;   -- già fatto
  end if;
  v_punto := position(E'\n   FROM orders orders' in v_def);
  if v_punto = 0 then
    raise exception 'La definizione di orders_visibili non è quella attesa: aggiungere la colonna a mano.';
  end if;
  v_def := left(v_def, v_punto - 1) || E',\n    orders.modalita_lavoro' || substr(v_def, v_punto);
  execute 'create or replace view public.orders_visibili as ' || v_def;
end $$;

-- La barriera non si perde con un replace, ma è meglio dirlo che sperarlo.
alter view public.orders_visibili set (security_barrier = true);
