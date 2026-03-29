-- Create storage buckets for native billing documents
INSERT INTO storage.buckets (id, name, public) VALUES ('documenti-fiscali', 'documenti-fiscali', false) ON CONFLICT (id) DO NOTHING;
