-- Fix FK: punta a profiles invece di auth.users
ALTER TABLE public.tickets DROP CONSTRAINT IF EXISTS tickets_assigned_to_fkey;
