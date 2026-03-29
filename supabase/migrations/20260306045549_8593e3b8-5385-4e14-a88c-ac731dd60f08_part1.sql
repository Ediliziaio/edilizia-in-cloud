-- Deposit 2
INSERT INTO order_installments (order_id, position, label, type, amount, is_paid, paid_date, expected_date)
SELECT o.id, 1, 'Secondo Acconto', 'deposit', o.deposit_2_amount, COALESCE(o.deposit_2_paid, false), o.deposit_2_paid_date, o.deposit_2_expected_date
FROM orders o
WHERE o.deposit_2_amount > 0
  AND NOT EXISTS (SELECT 1 FROM order_installments oi WHERE oi.order_id = o.id AND oi.type = 'deposit' AND oi.position = 1);
