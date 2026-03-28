-- Financing
INSERT INTO order_installments (order_id, position, label, type, amount, is_paid, paid_date, expected_date)
SELECT o.id, 20, 'Finanziamento', 'financing', o.financing_amount, COALESCE(o.financing_paid, false), o.financing_paid_date, o.financing_expected_date
FROM orders o
WHERE o.financing_amount > 0
  AND NOT EXISTS (SELECT 1 FROM order_installments oi WHERE oi.order_id = o.id AND oi.type = 'financing');
