-- 8. Insert default calendar (marketing_calendars requires created_by)
INSERT INTO public.marketing_calendars (id, company_id, name, created_by)
VALUES ('00000000-0000-0000-0000-000000000301', '00000000-0000-0000-0000-000000000001', 'Demo & Sales', '00000000-0000-0000-0000-000000000000')
ON CONFLICT (id) DO NOTHING;
