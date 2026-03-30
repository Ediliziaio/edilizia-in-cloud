-- Add assigned_to column to orders
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS assigned_to UUID REFERENCES public.profiles(id);
