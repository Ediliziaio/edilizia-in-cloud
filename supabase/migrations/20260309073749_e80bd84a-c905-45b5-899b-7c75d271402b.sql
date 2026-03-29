-- Round-robin assignment function
-- Tracks last assigned index per team for fair distribution
ALTER TABLE public.teams ADD COLUMN IF NOT EXISTS round_robin_index INT NOT NULL DEFAULT 0;
