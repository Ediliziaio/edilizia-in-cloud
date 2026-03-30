-- Add object_type column to marketing_custom_fields
ALTER TABLE public.marketing_custom_fields 
ADD COLUMN IF NOT EXISTS object_type TEXT NOT NULL DEFAULT 'contact';
