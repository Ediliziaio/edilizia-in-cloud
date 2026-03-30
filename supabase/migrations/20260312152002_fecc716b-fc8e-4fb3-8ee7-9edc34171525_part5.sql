DROP POLICY IF EXISTS "qi_anon_sel" ON public.quote_items;
CREATE POLICY "qi_anon_sel"
ON public.quote_items
FOR SELECT
TO anon
USING (
  EXISTS (
    SELECT 1 FROM public.quotes q
    WHERE q.id = quote_items.quote_id
      AND q.signature_token IS NOT NULL
      AND q.status = ANY (ARRAY['inviata','accettata','rifiutata','scaduta'])
      AND q.signature_token = (current_setting('request.header.x-quote-token', true))::uuid
  )
);
