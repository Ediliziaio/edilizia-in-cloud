-- =============================================
-- QUOTES MODULE — Tables, Functions, Triggers, RLS, Storage
-- =============================================

-- 1. Storage buckets
INSERT INTO storage.buckets (id, name, public) VALUES ('quote-materials', 'quote-materials', false) ON CONFLICT DO NOTHING;
