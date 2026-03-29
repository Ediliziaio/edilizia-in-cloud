-- Tabella inviti per nuovi super admin (link one-time)
CREATE TABLE IF NOT EXISTS public.admin_invites (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email       TEXT NOT NULL,
  token       TEXT NOT NULL UNIQUE DEFAULT gen_random_uuid()::text,
  invited_by  UUID REFERENCES auth.users(id),
  permissions JSONB NOT NULL DEFAULT '{"can_manage_companies":false,"can_manage_plans":false,"can_manage_tickets":false,"can_manage_referrals":false,"can_manage_admins":false,"can_view_platform_stats":true}',
  accepted_at  TIMESTAMPTZ,
  expires_at   TIMESTAMPTZ NOT NULL DEFAULT now() + INTERVAL '7 days',
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
