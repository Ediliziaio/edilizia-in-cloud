-- Create storage bucket
INSERT INTO storage.buckets (id, name, public) VALUES ('marketing-attachments', 'marketing-attachments', true) ON CONFLICT (id) DO NOTHING;
