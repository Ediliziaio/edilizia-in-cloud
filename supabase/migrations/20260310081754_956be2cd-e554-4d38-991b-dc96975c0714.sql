
DROP VIEW IF EXISTS public.order_payment_summary;
CREATE VIEW public.order_payment_summary WITH (security_invoker = true) AS
  SELECT order_id,
    sum(amount) AS total_invoiced,
    sum(CASE WHEN is_paid THEN amount ELSE 0::numeric END) AS total_collected,
    sum(CASE WHEN NOT is_paid THEN amount ELSE 0::numeric END) AS total_pending,
    count(*) AS installment_count
  FROM public.order_installments
  GROUP BY order_id;
