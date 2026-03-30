INSERT INTO storage.buckets (id, name, public) VALUES ('quote-pdfs', 'quote-pdfs', false) ON CONFLICT (id) DO NOTHING;
