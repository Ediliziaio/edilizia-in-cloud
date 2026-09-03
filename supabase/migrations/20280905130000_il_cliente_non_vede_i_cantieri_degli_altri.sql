-- ════════════════════════════════════════════════════════════════════════════
-- Il cliente vedeva tutti i cantieri dell'impresa
-- ════════════════════════════════════════════════════════════════════════════
--
-- Segnalato dall'altra traccia, verificato qui prima di toccare qualcosa.
--
-- `giornale_lavori`, `giornale_foto`, `foto_cantiere` e `ordini_variazione`
-- hanno una sola policy, permissiva, valida per OGNI ruolo:
--     company_id = get_my_company_id()
-- e `create-customer` scrive nel profilo del cliente il company_id
-- DELL'IMPRESA. Quindi per un cliente loggato quella condizione è vera su ogni
-- riga dell'azienda.
--
-- Misurato con un account cliente reale (b175b990…, azienda 778a2c76…):
--     get_my_company_id()                  → 778a2c76-…  (l'impresa)
--     righe di giornale_lavori che vede    → 1
--     di cui NON visibili al cliente       → 1
--     commesse che vede (orders)           → 3, e sono le sue
-- `orders` è ristretta bene — «Customers can view their own orders» su
-- customer_id = auth.uid() — ed è il modello da seguire.
--
-- Ci sono 860 account con ruolo customer, tutti con company_id valorizzato.
-- Oggi il danno è quasi nullo perché queste tabelle sono quasi vuote, ma il
-- portale committente sta per essere pubblicato: è ciò che porterà quegli 860
-- account a usare il loro accesso.
--
-- ── La trappola ────────────────────────────────────────────────────────────
-- Le policy permissive si sommano in OR. Aggiungere una policy per il cliente
-- accanto a quella che c'è NON restringe niente: la vecchia continuerebbe a
-- concedere tutto. La condizione esistente va cambiata.

-- Chi è un cliente e nient'altro. Un utente che ha anche un ruolo interno
-- resta interno: qui si esclude solo chi entra esclusivamente come cliente.
CREATE OR REPLACE FUNCTION public.utente_e_cliente_esterno()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT EXISTS (SELECT 1 FROM public.user_roles ur
                  WHERE ur.user_id = (SELECT auth.uid()) AND ur.role = 'customer'::public.app_role)
     AND NOT EXISTS (SELECT 1 FROM public.user_roles ur
                      WHERE ur.user_id = (SELECT auth.uid()) AND ur.role <> 'customer'::public.app_role);
$function$;

COMMENT ON FUNCTION public.utente_e_cliente_esterno() IS
  'Vero quando l''utente entra solo come cliente. Serve a togliere ai clienti le policy scritte per lo staff: aggiungerne una accanto non basterebbe, perché le policy permissive si sommano in OR.';

REVOKE ALL ON FUNCTION public.utente_e_cliente_esterno() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.utente_e_cliente_esterno() TO authenticated, service_role;

-- ── 1. Le policy dello staff smettono di valere per i clienti ───────────────
ALTER POLICY company_access_giornale ON public.giornale_lavori
  USING (company_id = get_my_company_id() AND NOT public.utente_e_cliente_esterno());

ALTER POLICY company_access_giornale_foto ON public.giornale_foto
  USING (company_id = get_my_company_id() AND NOT public.utente_e_cliente_esterno());

ALTER POLICY company_access_odv ON public.ordini_variazione
  USING (company_id = get_my_company_id() AND NOT public.utente_e_cliente_esterno());

ALTER POLICY foto_cantiere_company ON public.foto_cantiere
  USING (company_id = (SELECT profiles.company_id FROM public.profiles
                        WHERE profiles.id = (SELECT auth.uid()))
         AND NOT public.utente_e_cliente_esterno());

-- ── 2. Quello che il cliente può leggere, e solo quello ─────────────────────

-- Il giornale: solo i rapportini delle SUE commesse, e solo se marcati
-- visibili al cliente. Le due condizioni insieme, non in alternativa.
DROP POLICY IF EXISTS giornale_lavori_cliente_select ON public.giornale_lavori;
CREATE POLICY giornale_lavori_cliente_select ON public.giornale_lavori
  FOR SELECT TO authenticated
  USING (
    coalesce(visibile_cliente, false) IS TRUE
    AND EXISTS (SELECT 1 FROM public.orders o
                 WHERE o.id = giornale_lavori.order_id
                   AND o.customer_id = (SELECT auth.uid()))
  );

-- Le foto del giornale seguono il rapportino a cui appartengono: se quello non
-- è visibile al cliente, non lo sono nemmeno le sue foto.
DROP POLICY IF EXISTS giornale_foto_cliente_select ON public.giornale_foto;
CREATE POLICY giornale_foto_cliente_select ON public.giornale_foto
  FOR SELECT TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.giornale_lavori g
             JOIN public.orders o ON o.id = g.order_id
            WHERE g.id = giornale_foto.giornale_id
              AND coalesce(g.visibile_cliente, false) IS TRUE
              AND o.customer_id = (SELECT auth.uid()))
  );

-- Le varianti: solo quelle delle sue commesse. È il minimo perché possa
-- vederle e firmarle; la firma pubblica a token è un'altra strada.
DROP POLICY IF EXISTS ordini_variazione_cliente_select ON public.ordini_variazione;
CREATE POLICY ordini_variazione_cliente_select ON public.ordini_variazione
  FOR SELECT TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.orders o
             WHERE o.id = ordini_variazione.order_id
               AND o.customer_id = (SELECT auth.uid()))
  );

-- `foto_cantiere` NON riceve una policy per il cliente, ed è una scelta.
-- Non ha una colonna `visibile_cliente`: non c'è modo di distinguere la foto
-- che si mostra al committente da quella scattata per uso interno — un
-- infortunio, un difetto, una contestazione. Inventare qui una regola di
-- visibilità sarebbe peggio che lasciare la porta chiusa.
COMMENT ON TABLE public.foto_cantiere IS
  'Foto di cantiere. I clienti non hanno una policy di lettura: manca una colonna visibile_cliente che distingua le foto da mostrare al committente da quelle interne. Aggiungerla prima di aprire il portale alle foto.';
