-- ════════════════════════════════════════════════════════════════════════════
-- Ondata 1.3 — le tredici richieste sotto i 300 ms
-- ════════════════════════════════════════════════════════════════════════════
--
-- Accorpate le policy, ho misurato tredici richieste rappresentative come le
-- vede un utente reale. Nove sotto i 300 ms, quattro no:
--     ricerca contatti (ILIKE diretta) .... 632 ms
--     order_items: elenco ................. 366 ms
--     scadenzario rate .................... 306 ms
--     appointments: elenco ................ 181 ms  (rientrata da sola)
--
-- Sulla ricerca contatti il rimedio esisteva già dall'ondata 1: la RPC
-- `marketing_contacts_cerca` risponde in **3,5 ms** contro i 632 della query
-- diretta, perché ILIKE non è leakproof e sotto RLS non può diventare
-- condizione d'indice. Non c'è niente da correggere qui: c'è da usarla.
--
-- Restavano due cose, e avevano la stessa radice.

-- ── 1. Una policy che interrogava un'altra tabella protetta ─────────────────
-- La policy del commercialista su `order_items` chiedeva l'azienda passando da
-- una sottoquery su `orders`:
--     EXISTS (SELECT 1 FROM orders o
--              WHERE o.id = order_items.order_id
--                AND user_can_read_accountant_company(o.company_id))
-- Ma leggere `orders` dentro una policy fa applicare a `orders` tutto il SUO
-- RLS. Nel piano quel solo pezzo costava 110 ms su 366, con 3.270 buffer e 533
-- righe scartate.
--
-- `get_order_company_id(order_id)` risponde alla stessa domanda senza
-- attraversare le policy di un'altra tabella — ed è già usata nello stesso
-- filtro, due rami sopra.
--
-- Verificato che non cambi niente: il commercialista delegato vede 164 righe
-- con la vecchia e con la nuova. Ed è l'unico ruolo per cui quel ramo può
-- essere vero, quindi per tutti gli altri la condizione era già falsa in
-- entrambe le forme.
DO $$
DECLARE v_vecchia text; v_nuova text;
BEGIN
  SELECT pg_get_expr(polqual, polrelid) INTO v_vecchia
    FROM pg_policy
   WHERE polrelid = 'public.order_items'::regclass
     AND polname::text = 'order_items_lettura_authenticated';
  IF v_vecchia IS NULL THEN
    SELECT pg_get_expr(polqual, polrelid) INTO v_vecchia
      FROM pg_policy
     WHERE polrelid = 'public.order_items'::regclass
       AND polname::text = 'order_items_lettura_accorpata';
  END IF;
  IF v_vecchia IS NULL THEN
    RAISE NOTICE 'policy di lettura di order_items non trovata: salto';
    RETURN;
  END IF;

  v_nuova := replace(v_vecchia,
    '(EXISTS ( SELECT 1
   FROM orders o
  WHERE ((o.id = order_items.order_id) AND user_can_read_accountant_company(o.company_id))))',
    'user_can_read_accountant_company(get_order_company_id(order_id))');

  IF v_nuova <> v_vecchia THEN
    INSERT INTO public.zz_policy_backup (tabella, polname, polcmd, polpermissive, ruoli, qual, wcheck)
    VALUES ('order_items', 'order_items_lettura (prima del riordino)', 'r', true, 'authenticated', v_vecchia, NULL);
    EXECUTE format('ALTER POLICY %I ON public.order_items USING (%s)',
                   (SELECT polname::text FROM pg_policy
                     WHERE polrelid='public.order_items'::regclass AND polcmd='r'
                       AND pg_get_expr(polqual,polrelid) = v_vecchia LIMIT 1),
                   v_nuova);
  END IF;
END $$;

-- ── 2. Gli stessi sette rami, in un ordine diverso ─────────────────────────
--
-- L'OR è commutativo: la condizione non cambia di una virgola. Ma Postgres
-- valuta gli operandi da sinistra e si ferma al primo vero, quindi l'ordine
-- decide quanto lavoro fa per riga. Nella versione uscita dall'accorpamento i
-- primi rami erano i più cari — `order_has_employee_for_user(id, …)` e
-- `order_has_salesperson_for_user(id, …)` fanno una ricerca per ogni riga — e
-- il ramo che copre la stragrande maggioranza dei casi veniva per quinto.
--
-- Vale la pena perché `v_rate_commesse_unificate` legge `orders` due volte:
-- quel filtro lo paga 1.066 volte.
ALTER POLICY orders_lettura_authenticated ON public.orders
USING (
  -- 1. Un confronto fra colonne: costa niente e copre il portale committente.
  (customer_id = (SELECT auth.uid()))

  -- 2. Il caso normale: staff della propria azienda. Le due parti costose sono
  --    già InitPlan, valutate una volta sola; resta il confronto su company_id.
  OR ((SELECT (SELECT has_permission((SELECT auth.uid()), 'can_view_orders'::text) AS has_permission) AS has_permission)
      AND (company_id = (SELECT (SELECT get_user_company_id((SELECT auth.uid())) AS get_user_company_id) AS get_user_company_id))
      AND can_see_order(id, assigned_to, destination_warehouse_id))

  -- 3. Il commercialista delegato: una funzione su company_id, non su id.
  OR user_can_read_accountant_company(company_id)

  -- 4. Un insieme di id calcolato una volta sola.
  OR (id IN (SELECT order_campo_assignments.order_id
               FROM order_campo_assignments
              WHERE (order_campo_assignments.user_id = (SELECT auth.uid()))))

  -- 5-7. Le funzioni che girano per riga, per ultime.
  OR order_has_employee_for_user(id, (SELECT auth.uid()))
  OR order_has_salesperson_for_user(id, (SELECT auth.uid()))
  OR ((company_id = (SELECT (SELECT get_my_company_id() AS get_my_company_id) AS get_my_company_id))
      AND (SELECT (SELECT is_warehouse_user() AS is_warehouse_user) AS is_warehouse_user)
      AND ((destination_warehouse_id IN (SELECT unnest(get_my_warehouse_ids()) AS unnest))
           OR order_has_item_in_my_warehouse(id))
      AND can_see_order(id, assigned_to, destination_warehouse_id))
);

-- ── Il risultato, misurato a caldo su tre giri ──────────────────────────────
--     scadenzario rate ...... 306 → 267 ms
--     order_items ........... 366 → 271 ms
--     orders ................ 107 →  94 ms
--     ricerca contatti ...... 632 ms diretta, 3,5 ms con la RPC dell'ondata 1
-- Tredici richieste su tredici sotto i 300 ms, la più lenta a 271.
--
-- E i conteggi non si sono mossi: company_admin 65, staff 65, l'altra azienda
-- 70, cliente 3, commercialista 65 — gli stessi di prima.
