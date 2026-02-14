
-- Create support_conversations table
CREATE TABLE public.support_conversations (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'open',
  priority text NOT NULL DEFAULT 'normal',
  assigned_to uuid NULL,
  internal_notes text NULL,
  resolved_at timestamptz NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company_id)
);

-- Enable RLS
ALTER TABLE public.support_conversations ENABLE ROW LEVEL SECURITY;

-- Only super_admin can manage
CREATE POLICY "Super admins can manage all support conversations"
ON public.support_conversations
FOR ALL
USING (has_role(auth.uid(), 'super_admin'::app_role));

-- Trigger to auto-upsert conversation on new support message
CREATE OR REPLACE FUNCTION public.handle_support_message_conversation()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.support_conversations (company_id, status, updated_at)
  VALUES (NEW.company_id, 'open', now())
  ON CONFLICT (company_id) DO UPDATE SET
    updated_at = now(),
    status = CASE
      WHEN NEW.sender_role != 'super_admin'
        AND support_conversations.status IN ('resolved', 'closed')
      THEN 'open'
      ELSE support_conversations.status
    END;
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_support_message_upsert_conversation
AFTER INSERT ON public.support_messages
FOR EACH ROW
EXECUTE FUNCTION public.handle_support_message_conversation();

-- Update timestamp trigger
CREATE TRIGGER update_support_conversations_updated_at
BEFORE UPDATE ON public.support_conversations
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Enable realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.support_conversations;
