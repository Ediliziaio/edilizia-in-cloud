-- Balance
INSERT INTO order_installments (order_id, position, label, type, amount, is_paid, paid_date, expected_date)
SELECT o.id, 10, 'Saldo', 'balance', o.balance_amount, COALESCE(o.balance_paid, false), o.balance_paid_date, o.balance_expected_date
FROM orders o
WHERE o.balance_amount > 0
  AND NOT EXISTS (SELECT 1 FROM order_installments oi WHERE oi.order_id = o.id AND oi.type = 'balance');
