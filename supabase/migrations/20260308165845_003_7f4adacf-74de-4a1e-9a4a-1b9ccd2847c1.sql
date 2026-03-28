-- Add branch_id to conversations
ALTER TABLE public.ai_agent_conversations
  ADD COLUMN branch_id uuid REFERENCES public.ai_agent_branches(id) ON DELETE SET NULL;
