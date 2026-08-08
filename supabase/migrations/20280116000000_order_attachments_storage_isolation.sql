-- Gli allegati delle commesse erano leggibili da chiunque, senza login.
--
-- Sul bucket privato "order-attachments" convivevano due policy per ogni
-- comando: una per-azienda e una larga ("Anyone can view order attachments",
-- USING bucket_id = 'order-attachments' e basta). Le policy RLS si sommano in
-- OR, quindi quella larga annullava l'altra. Peggio: era concessa al ruolo
-- `public`, che include `anon` — bastava la chiave anon (pubblica, dentro il
-- bundle JS) per farsi firmare l'URL di un contratto di un'altra azienda
-- conoscendo il path. Verificato in produzione: PDF da 472 KB scaricato senza
-- alcuna autenticazione.
--
-- Le policy per-azienda superstiti non bastavano da sole: riconoscevano solo i
-- file registrati in `order_attachments`, mentre nel bucket ci finiscono sei
-- forme di path diverse (contratti AI, allegati per articolo, documenti ODA).
-- Tenerle e basta avrebbe reso illeggibili quei file. Qui il permesso si
-- calcola dal path, con un'unica funzione che copre tutte le forme.

CREATE OR REPLACE FUNCTION public.can_access_order_attachment_object(p_name text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT COALESCE(CASE
    -- Il cliente entra dal portale: vede solo i documenti che l'azienda ha
    -- spuntato come visibili, e solo sulle proprie commesse. Stessa regola
    -- della RLS su order_attachments, cosi' il portale non vede di piu' del
    -- suo elenco.
    WHEN public.has_role(auth.uid(), 'customer'::public.app_role) THEN EXISTS (
      SELECT 1
      FROM public.order_attachments oa
      JOIN public.orders o ON o.id = oa.order_id
      WHERE oa.file_url = p_name
        AND oa.visible_to_customer = true
        AND o.customer_id = auth.uid()
    )
    ELSE (
      -- (a) file gia' registrato in anagrafica, qualunque sia la forma del path
      --     (copre anche gli upload di Silvio, che usa <commessa>/<uuid>-nome)
      EXISTS (
        SELECT 1
        FROM public.order_attachments oa
        JOIN public.orders o ON o.id = oa.order_id
        WHERE oa.file_url = p_name
          AND public.user_can_access_company(o.company_id)
      )
      OR EXISTS (
        SELECT 1
        FROM public.order_item_attachments oia
        JOIN public.order_items oi ON oi.id = oia.order_item_id
        JOIN public.orders o ON o.id = oi.order_id
        WHERE oia.file_url = p_name
          AND public.user_can_access_company(o.company_id)
      )

      -- (b) prefissi parlanti. Servono anche in upload, quando la riga in
      --     anagrafica ancora non esiste, e in cancellazione quando l'insert
      --     e' fallito e il file va rimosso.
      OR (
        split_part(p_name, '/', 1) = 'orders'
        AND EXISTS (
          SELECT 1 FROM public.orders o
          WHERE o.id::text = split_part(p_name, '/', 2)
            AND public.user_can_access_company(o.company_id)
        )
      )
      OR (
        split_part(p_name, '/', 1) = 'oda'
        AND EXISTS (
          SELECT 1 FROM public.purchase_orders po
          WHERE po.id::text = split_part(p_name, '/', 2)
            AND public.user_can_access_company(po.company_id)
        )
      )

      -- (c) primo segmento = UUID di azienda (contratti AI), di commessa
      --     (upload Silvio) o di articolo di commessa (allegati per riga)
      OR (
        split_part(p_name, '/', 1) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
        AND (
          public.user_can_access_company(split_part(p_name, '/', 1)::uuid)
          OR EXISTS (
            SELECT 1 FROM public.orders o
            WHERE o.id = split_part(p_name, '/', 1)::uuid
              AND public.user_can_access_company(o.company_id)
          )
          OR EXISTS (
            SELECT 1 FROM public.order_items oi
            JOIN public.orders o ON o.id = oi.order_id
            WHERE oi.id = split_part(p_name, '/', 1)::uuid
              AND public.user_can_access_company(o.company_id)
          )
        )
      )
    )
  END, false);
$function$;

COMMENT ON FUNCTION public.can_access_order_attachment_object(text) IS
  'Isolamento multi-azienda del bucket order-attachments: risolve il path del file (orders/<commessa>, oda/<ordine acquisto>, <azienda>/…, <commessa>/…, <articolo>/…, o riga in order_attachments/order_item_attachments) fino all''azienda proprietaria e la passa a user_can_access_company. I clienti del portale vedono solo i propri documenti marcati visible_to_customer.';

-- Le tre larghe: cancellate.
DROP POLICY IF EXISTS "Anyone can view order attachments" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can upload order attachments" ON storage.objects;
DROP POLICY IF EXISTS "Users can delete their uploaded attachments" ON storage.objects;

-- Le tre per-azienda: sostituite dalla versione che riconosce tutti i path.
DROP POLICY IF EXISTS "Company users can view own order attachments" ON storage.objects;
DROP POLICY IF EXISTS "Company users can upload order attachments" ON storage.objects;
DROP POLICY IF EXISTS "Company users can delete own order attachments" ON storage.objects;

CREATE POLICY "order_attachments_select"
  ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'order-attachments'
    AND public.can_access_order_attachment_object(name)
  );

-- Il cliente legge, non scrive: caricare e cancellare restano dell'azienda.
CREATE POLICY "order_attachments_insert"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'order-attachments'
    AND NOT public.has_role(auth.uid(), 'customer'::public.app_role)
    AND public.can_access_order_attachment_object(name)
  );

CREATE POLICY "order_attachments_delete"
  ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'order-attachments'
    AND NOT public.has_role(auth.uid(), 'customer'::public.app_role)
    AND public.can_access_order_attachment_object(name)
  );
