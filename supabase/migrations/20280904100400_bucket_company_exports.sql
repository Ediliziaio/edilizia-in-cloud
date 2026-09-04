-- F0-03 — Deposito degli export prodotti prima di una cancellazione.
-- Privato: ci finiscono i dati completi di un cliente.
INSERT INTO storage.buckets (id, name, public, file_size_limit)
VALUES ('company-exports', 'company-exports', false, 104857600)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "company_exports_super_admin_all" ON storage.objects;
CREATE POLICY "company_exports_super_admin_all"
  ON storage.objects FOR ALL TO authenticated
  USING (bucket_id = 'company-exports' AND public.is_super_admin(auth.uid()))
  WITH CHECK (bucket_id = 'company-exports' AND public.is_super_admin(auth.uid()));
