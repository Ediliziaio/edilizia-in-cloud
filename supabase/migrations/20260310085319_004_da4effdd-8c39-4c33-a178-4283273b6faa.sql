-- 5. Insert default sales pipeline
INSERT INTO public.marketing_pipelines (id, company_id, name, position)
VALUES ('00000000-0000-0000-0000-000000000010', '00000000-0000-0000-0000-000000000001', 'Pipeline Vendita SaaS', 0)
ON CONFLICT (id) DO NOTHING;
