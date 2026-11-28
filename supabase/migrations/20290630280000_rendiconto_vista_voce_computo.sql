-- La vista delle righe del rendiconto deve avere anche «quale voce del computo»
-- ────────────────────────────────────────────────────────────────────────────
-- 28/11/2026, controllando il repository prima di pubblicare.
--
-- `appalto_rendiconto_righe_visibili` è la vista da cui il browser legge le righe del rendiconto
-- (costo e margine solo a chi ha «Costi»). Elenca le colonne una per una, quindi `voce_computo_id`
-- — nata oggi — non ci sarebbe comparsa da sola, e chi legge dalla vista non saprebbe dire se una
-- riga è una voce del computo o un extra. Stessa lezione di `orders_visibili`.
--
-- La colonna si aggiunge in coda prendendo la definizione dal catalogo: `CREATE OR REPLACE VIEW`
-- accetta colonne nuove solo alla fine, e ricopiare a mano una definizione che altre sessioni
-- cambiano è il modo migliore per litigare con loro.
-- Idempotente.

SET LOCAL lock_timeout = '3s';
SET LOCAL statement_timeout = '60s';

do $$
declare v_def text; v_punto int;
begin
  select pg_get_viewdef('public.appalto_rendiconto_righe_visibili'::regclass, true) into v_def;
  if position('voce_computo_id' in v_def) > 0 then
    return;
  end if;
  v_punto := position(E'\n   FROM ' in v_def);
  if v_punto = 0 then
    raise exception 'La definizione di appalto_rendiconto_righe_visibili non è quella attesa.';
  end if;
  v_def := left(v_def, v_punto - 1) || E',\n    r.voce_computo_id' || substr(v_def, v_punto);
  execute 'create or replace view public.appalto_rendiconto_righe_visibili as ' || v_def;
end $$;

-- `CREATE OR REPLACE VIEW` può perdere `security_invoker` (succede, ed è in memoria dal 10/11/2026):
-- questa vista DEVE restare invoker, perché le regole per riga sono quelle di chi guarda. Costo e
-- margine non arrivano dalle colonne ma da due funzioni definer, quindi la revoca della
-- 20290629210000 non la tocca.
alter view public.appalto_rendiconto_righe_visibili set (security_invoker = true);
