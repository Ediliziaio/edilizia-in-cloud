-- 1. Create private storage bucket for ticket attachments
INSERT INTO storage.buckets (id, name, public)
VALUES ('ticket-attachments', 'ticket-attachments', false) ON CONFLICT (id) DO NOTHING;
