
-- Enum priorita'
CREATE TYPE public.ticket_priority AS ENUM ('bassa', 'normale', 'alta', 'urgente');

-- Nuove colonne su tickets
ALTER TABLE public.tickets 
  ADD COLUMN priority public.ticket_priority NOT NULL DEFAULT 'normale',
  ADD COLUMN assigned_to UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN category TEXT DEFAULT NULL,
  ADD COLUMN last_message_at TIMESTAMPTZ DEFAULT now(),
  ADD COLUMN internal_notes TEXT DEFAULT NULL;

-- Indici
CREATE INDEX idx_tickets_company_status ON public.tickets (company_id, status);
CREATE INDEX idx_tickets_assigned_to ON public.tickets (assigned_to);
CREATE INDEX idx_tickets_last_message ON public.tickets (company_id, last_message_at DESC);

-- Realtime per ticket_messages
ALTER PUBLICATION supabase_realtime ADD TABLE public.ticket_messages;

-- RLS: company_staff con permesso can_view_tickets
CREATE POLICY "Staff can view company tickets"
  ON public.tickets FOR SELECT TO authenticated
  USING (
    has_permission(auth.uid(), 'can_view_tickets') 
    AND company_id = get_user_company_id(auth.uid())
  );

CREATE POLICY "Staff can update company tickets"
  ON public.tickets FOR UPDATE TO authenticated
  USING (
    has_permission(auth.uid(), 'can_edit_tickets') 
    AND company_id = get_user_company_id(auth.uid())
  );

CREATE POLICY "Staff can insert company tickets"
  ON public.tickets FOR INSERT TO authenticated
  WITH CHECK (
    has_permission(auth.uid(), 'can_edit_tickets') 
    AND company_id = get_user_company_id(auth.uid())
  );

-- RLS ticket_messages per staff
CREATE POLICY "Staff can view company ticket messages"
  ON public.ticket_messages FOR SELECT TO authenticated
  USING (
    has_permission(auth.uid(), 'can_view_tickets') 
    AND EXISTS (
      SELECT 1 FROM public.tickets t 
      WHERE t.id = ticket_id 
      AND t.company_id = get_user_company_id(auth.uid())
    )
  );

CREATE POLICY "Staff can insert company ticket messages"
  ON public.ticket_messages FOR INSERT TO authenticated
  WITH CHECK (
    has_permission(auth.uid(), 'can_edit_tickets') 
    AND EXISTS (
      SELECT 1 FROM public.tickets t 
      WHERE t.id = ticket_id 
      AND t.company_id = get_user_company_id(auth.uid())
    )
  );

-- Trigger per aggiornare last_message_at quando arriva un nuovo messaggio
CREATE OR REPLACE FUNCTION public.update_ticket_last_message_at()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = public
AS $$
BEGIN
  UPDATE public.tickets 
  SET last_message_at = NEW.created_at, updated_at = NEW.created_at
  WHERE id = NEW.ticket_id;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_ticket_message_update_last_message
  AFTER INSERT ON public.ticket_messages
  FOR EACH ROW
  EXECUTE FUNCTION public.update_ticket_last_message_at();
