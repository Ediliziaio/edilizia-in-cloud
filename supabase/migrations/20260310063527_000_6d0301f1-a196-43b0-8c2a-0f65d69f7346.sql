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
