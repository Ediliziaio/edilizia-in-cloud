-- Backfill order_installments from legacy orders columns for orders missing installments
-- This is idempotent: only inserts where no matching installment exists

-- Deposit 1
INSERT INTO order_installments (order_id, position, label, type, amount, is_paid, paid_date, expected_date)
SELECT o.id, 0, 'Acconto', 'deposit', o.deposit_amount, COALESCE(o.deposit_paid, false), o.deposit_paid_date, o.deposit_expected_date
FROM orders o
WHERE o.deposit_amount > 0
  AND NOT EXISTS (SELECT 1 FROM order_installments oi WHERE oi.order_id = o.id AND oi.type = 'deposit' AND oi.position = 0);
