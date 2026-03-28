INSERT INTO storage.buckets (id, name, public) VALUES ('fatture-xml', 'fatture-xml', false) ON CONFLICT (id) DO NOTHING;
