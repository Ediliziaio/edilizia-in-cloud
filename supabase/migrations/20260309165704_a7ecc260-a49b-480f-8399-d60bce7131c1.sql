
-- 1) Storage bucket for invoice PDFs
INSERT INTO storage.buckets (id, name, public)
VALUES ('invoices-pdf', 'invoices-pdf', false)
ON CONFLICT (id) DO NOTHING;

-- RLS policies for invoices-pdf bucket
CREATE POLICY "Company members can read invoice PDFs"
ON storage.objects FOR SELECT
TO authenticated
USING (
  bucket_id = 'invoices-pdf'
  AND (storage.foldername(name))[1] = public.get_my_company_id()::text
);

CREATE POLICY "Company members can upload invoice PDFs"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'invoices-pdf'
  AND (storage.foldername(name))[1] = public.get_my_company_id()::text
);

CREATE POLICY "Company members can delete invoice PDFs"
ON storage.objects FOR DELETE
TO authenticated
USING (
  bucket_id = 'invoices-pdf'
  AND (storage.foldername(name))[1] = public.get_my_company_id()::text
);

-- 2) RPC for cruscotto invoice stats
CREATE OR REPLACE FUNCTION public.get_cruscotto_invoice_stats(p_company_id uuid)
RETURNS json
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  result json;
  v_today date := current_date;
  v_month_start date := date_trunc('month', current_date)::date;
  v_month_end date := (date_trunc('month', current_date) + interval '1 month' - interval '1 day')::date;
BEGIN
  SELECT json_build_object(
    'total_outstanding', COALESCE(SUM(CASE WHEN status NOT IN ('paid', 'cancelled') THEN total - COALESCE(paid_amount, 0) ELSE 0 END), 0),
    'overdue_count', COALESCE(SUM(CASE WHEN due_date < v_today AND status NOT IN ('paid', 'cancelled') AND (total - COALESCE(paid_amount, 0)) > 0 THEN 1 ELSE 0 END), 0),
    'overdue_amount', COALESCE(SUM(CASE WHEN due_date < v_today AND status NOT IN ('paid', 'cancelled') AND (total - COALESCE(paid_amount, 0)) > 0 THEN total - COALESCE(paid_amount, 0) ELSE 0 END), 0),
    'due_this_week_count', COALESCE(SUM(CASE WHEN due_date BETWEEN v_today AND v_today + 7 AND status NOT IN ('paid', 'cancelled') THEN 1 ELSE 0 END), 0),
    'due_this_week_amount', COALESCE(SUM(CASE WHEN due_date BETWEEN v_today AND v_today + 7 AND status NOT IN ('paid', 'cancelled') THEN total - COALESCE(paid_amount, 0) ELSE 0 END), 0),
    'paid_this_month', COALESCE(SUM(CASE WHEN status = 'paid' AND updated_at::date BETWEEN v_month_start AND v_month_end THEN total ELSE 0 END), 0),
    'issued_this_month', COALESCE(SUM(CASE WHEN issue_date BETWEEN v_month_start AND v_month_end THEN 1 ELSE 0 END), 0),
    'issued_this_month_amount', COALESCE(SUM(CASE WHEN issue_date BETWEEN v_month_start AND v_month_end THEN total ELSE 0 END), 0)
  ) INTO result
  FROM invoices
  WHERE company_id = p_company_id
    AND type = 'invoice';

  RETURN result;
END;
$$;
