
-- Signature requests table for orders
CREATE TABLE IF NOT EXISTS public.signature_requests (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id      uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  order_id        uuid NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  token           text NOT NULL UNIQUE DEFAULT encode(gen_random_bytes(32), 'hex'),
  signer_email    text NOT NULL,
  signer_name     text,
  status          text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','signed','expired','cancelled')),
  signature_data  text,
  signed_at       timestamptz,
  signed_by_ip    text,
  expires_at      timestamptz NOT NULL DEFAULT (now() + interval '7 days'),
  created_by      uuid NOT NULL REFERENCES public.profiles(id),
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_signature_requests_order ON public.signature_requests(order_id);
CREATE INDEX idx_signature_requests_token ON public.signature_requests(token);
CREATE INDEX idx_signature_requests_company ON public.signature_requests(company_id);

ALTER TABLE public.signature_requests ENABLE ROW LEVEL SECURITY;

-- Company staff can read/write signature requests
CREATE POLICY "company_staff_signature_requests"
  ON public.signature_requests FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      JOIN public.user_roles ur ON ur.user_id = p.id
      WHERE p.id = auth.uid()
        AND p.company_id = signature_requests.company_id
        AND ur.role IN ('company_admin', 'company_staff')
    )
  );

-- Public access by token (for signing page - no auth needed)
CREATE POLICY "public_read_by_token"
  ON public.signature_requests FOR SELECT
  USING (true);

CREATE POLICY "public_update_by_token"
  ON public.signature_requests FOR UPDATE
  USING (status = 'pending')
  WITH CHECK (status = 'signed');
