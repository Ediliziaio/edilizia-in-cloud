-- 1. Make bucket private
UPDATE storage.buckets SET public = false WHERE id = 'order-attachments';
