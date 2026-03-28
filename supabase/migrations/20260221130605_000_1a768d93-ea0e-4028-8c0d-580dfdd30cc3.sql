-- Add assigned_to column to orders
ALTER TABLE public.orders ADD COLUMN assigned_to UUID REFERENCES public.profiles(id);
