-- Broadcast tables
CREATE TABLE IF NOT EXISTS whatsapp_broadcasts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  segment TEXT NOT NULL DEFAULT 'tutti',
  segment_config JSONB DEFAULT '{}',
  template_name TEXT,
  message_text TEXT,
  total_contacts INTEGER DEFAULT 0,
  sent_count INTEGER DEFAULT 0,
  failed_count INTEGER DEFAULT 0,
  status TEXT DEFAULT 'pending',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  created_by UUID
);

CREATE TABLE IF NOT EXISTS whatsapp_broadcast_recipients (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  broadcast_id UUID NOT NULL REFERENCES whatsapp_broadcasts(id) ON DELETE CASCADE,
  contact_id UUID NOT NULL,
  phone TEXT NOT NULL,
  status TEXT DEFAULT 'pending',
  meta_message_id TEXT,
  error_message TEXT,
  sent_at TIMESTAMPTZ,
  delivered_at TIMESTAMPTZ,
  read_at TIMESTAMPTZ
);

-- RLS
ALTER TABLE whatsapp_broadcasts ENABLE ROW LEVEL SECURITY;
ALTER TABLE whatsapp_broadcast_recipients ENABLE ROW LEVEL SECURITY;

-- Policies for whatsapp_broadcasts
CREATE POLICY "Company users can view their broadcasts"
  ON whatsapp_broadcasts FOR SELECT TO authenticated
  USING (company_id IN (
    SELECT p.company_id FROM profiles p WHERE p.id = auth.uid()
  ) OR EXISTS (
    SELECT 1 FROM user_roles ur WHERE ur.user_id = auth.uid() AND ur.role = 'super_admin'
  ));

CREATE POLICY "Company users can insert broadcasts"
  ON whatsapp_broadcasts FOR INSERT TO authenticated
  WITH CHECK (company_id IN (
    SELECT p.company_id FROM profiles p WHERE p.id = auth.uid()
  ) OR EXISTS (
    SELECT 1 FROM user_roles ur WHERE ur.user_id = auth.uid() AND ur.role = 'super_admin'
  ));

-- Policies for whatsapp_broadcast_recipients
CREATE POLICY "Users can view recipients of their broadcasts"
  ON whatsapp_broadcast_recipients FOR SELECT TO authenticated
  USING (broadcast_id IN (
    SELECT wb.id FROM whatsapp_broadcasts wb
    WHERE wb.company_id IN (
      SELECT p.company_id FROM profiles p WHERE p.id = auth.uid()
    ) OR EXISTS (
      SELECT 1 FROM user_roles ur WHERE ur.user_id = auth.uid() AND ur.role = 'super_admin'
    )
  ));

-- Index
CREATE INDEX IF NOT EXISTS idx_whatsapp_broadcasts_company ON whatsapp_broadcasts(company_id);
CREATE INDEX IF NOT EXISTS idx_whatsapp_broadcast_recipients_broadcast ON whatsapp_broadcast_recipients(broadcast_id);
CREATE INDEX IF NOT EXISTS idx_whatsapp_broadcast_recipients_meta_msg ON whatsapp_broadcast_recipients(meta_message_id) WHERE meta_message_id IS NOT NULL;