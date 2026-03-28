-- Storage bucket
INSERT INTO storage.buckets (id, name, public)
VALUES ('quote-template-assets', 'quote-template-assets', false)
ON CONFLICT (id) DO NOTHING;
