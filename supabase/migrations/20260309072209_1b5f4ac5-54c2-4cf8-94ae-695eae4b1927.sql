-- GDPR Data Export/Deletion Requests
CREATE TABLE public.gdpr_data_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  request_type text NOT NULL DEFAULT 'export',
  status text NOT NULL DEFAULT 'pending',
  reason text,
  download_url text,
  expires_at timestamptz,
  processed_at timestamptz,
  processed_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT gdpr_request_type_check CHECK (request_type IN ('export', 'deletion', 'rectification')),
  CONSTRAINT gdpr_status_check CHECK (status IN ('pending', 'processing', 'completed', 'rejected', 'expired'))
);
