-- Storage bucket for white-label assets
INSERT INTO storage.buckets (id, name, public)
VALUES ('white-label-assets', 'white-label-assets', true) ON CONFLICT (id) DO NOTHING;
