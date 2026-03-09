
-- Round-robin assignment function
-- Tracks last assigned index per team for fair distribution
ALTER TABLE public.teams ADD COLUMN IF NOT EXISTS round_robin_index INT NOT NULL DEFAULT 0;

CREATE OR REPLACE FUNCTION public.assign_round_robin(p_team_id UUID)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_members UUID[];
  v_index INT;
  v_assigned UUID;
BEGIN
  -- Get ordered member user_ids
  SELECT ARRAY_AGG(user_id ORDER BY joined_at)
  INTO v_members
  FROM public.team_members
  WHERE team_id = p_team_id;
  
  IF v_members IS NULL OR array_length(v_members, 1) IS NULL THEN
    RETURN NULL;
  END IF;
  
  -- Get current index
  SELECT round_robin_index INTO v_index FROM public.teams WHERE id = p_team_id;
  
  -- Calculate assigned user
  v_assigned := v_members[(v_index % array_length(v_members, 1)) + 1];
  
  -- Increment index
  UPDATE public.teams SET round_robin_index = v_index + 1 WHERE id = p_team_id;
  
  RETURN v_assigned;
END;
$$;
