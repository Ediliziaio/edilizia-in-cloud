
-- Company tags table for segmentation
CREATE TABLE public.company_tags (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  tag text NOT NULL,
  color text NOT NULL DEFAULT '#6366f1',
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Unique constraint to prevent duplicate tags per company
CREATE UNIQUE INDEX company_tags_company_tag_unique ON public.company_tags (company_id, tag);

-- Enable RLS
ALTER TABLE public.company_tags ENABLE ROW LEVEL SECURITY;

-- Only super_admin can manage company tags
CREATE POLICY "super_admin_company_tags_select" ON public.company_tags
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'super_admin'::app_role));

CREATE POLICY "super_admin_company_tags_insert" ON public.company_tags
  FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'super_admin'::app_role));

CREATE POLICY "super_admin_company_tags_delete" ON public.company_tags
  FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'super_admin'::app_role));

-- RPC to get last access per company (max last_sign_in from auth.users via profiles)
CREATE OR REPLACE FUNCTION public.get_company_last_access()
RETURNS TABLE(company_id uuid, last_access timestamptz)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT p.company_id, MAX(u.last_sign_in_at) AS last_access
  FROM public.profiles p
  JOIN auth.users u ON u.id = p.id
  WHERE p.company_id IS NOT NULL
  GROUP BY p.company_id;
$$;

-- RPC to get monthly order counts for sparklines (last 6 months per company)
CREATE OR REPLACE FUNCTION public.get_company_order_sparklines()
RETURNS TABLE(company_id uuid, month_key text, order_count bigint)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT o.company_id, 
         to_char(o.created_at, 'YYYY-MM') AS month_key,
         COUNT(*)::bigint AS order_count
  FROM public.orders o
  WHERE o.created_at >= (now() - interval '6 months')
  GROUP BY o.company_id, to_char(o.created_at, 'YYYY-MM')
  ORDER BY o.company_id, month_key;
$$;
