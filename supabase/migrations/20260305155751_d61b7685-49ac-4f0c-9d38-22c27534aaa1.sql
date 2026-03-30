-- Enum priorita'
DO $$ BEGIN
  CREATE TYPE public.ticket_priority AS ENUM ('bassa', 'normale', 'alta', 'urgente');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
