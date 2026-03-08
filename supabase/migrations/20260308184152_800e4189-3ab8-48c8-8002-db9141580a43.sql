CREATE OR REPLACE VIEW public.order_payment_summary AS
SELECT 
  order_id,
  SUM(amount) AS total_invoiced,
  SUM(CASE WHEN is_paid THEN amount ELSE 0 END) AS total_collected,
  SUM(CASE WHEN NOT is_paid THEN amount ELSE 0 END) AS total_pending,
  COUNT(*) AS installment_count
FROM public.order_installments
GROUP BY order_id;