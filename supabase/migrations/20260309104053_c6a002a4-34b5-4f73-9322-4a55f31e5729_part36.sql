-- Anon policy for public signature page (read items of viewable quotes)
DROP POLICY IF EXISTS "qi_anon_sel" ON public.quote_items;
CREATE POLICY "qi_anon_sel" ON public.quote_items FOR SELECT TO anon
  USING (EXISTS (
    SELECT 1 FROM public.quotes q
    WHERE q.id = quote_id AND q.signature_token IS NOT NULL
    AND q.status IN ('inviata', 'accettata', 'rifiutata', 'scaduta')
  ));
